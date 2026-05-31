import { useCallback, useEffect, useRef } from "react";
import type { ChatInputHandle } from "../ChatInput";
import type { Attachment, ChatMessage, ClarifyRequest } from "../types";
import { describeInputIntent } from "../inputIntent";
import { createTauriChatGatewayClient } from "../tauriChatGatewayClient";
import type { WsGatewayClient } from "@renderer/lib/wsGatewayClient";
import { notify, notifyError, createStatusMessage } from "../systemEvents";

interface LocalCommands {
  isLocal: (text: string) => boolean;
  executeLocal: (text: string) => Promise<boolean>;
}

interface UseChatActionsArgs {
  hermesSessionId: string | null;
  dbSessionId?: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setHermesSessionId: (id: string | null) => void;
  onSessionStarted?: () => void;
  chatInputRef: React.RefObject<ChatInputHandle | null>;
  localCommands: LocalCommands;
  contextFolder: string | null;
  pendingClarify: ClarifyRequest | null;
  setPendingClarify: (c: ClarifyRequest | null) => void;
  activeTabId: string;
  updateTab: (id: string, patch: Partial<import("./useSessionManager").SessionState>) => void;
  streamingText?: string;
  executeGatewayCommand?: (
    sessionId: string,
    command: string,
  ) => Promise<boolean>;
  wsGatewayClient?: WsGatewayClient;
}

interface UseChatActionsResult {
  handleSend: (text: string, attachments?: Attachment[]) => Promise<void>;
  handleQuickAsk: (text: string, attachments?: Attachment[]) => Promise<void>;
  handleAbort: () => void;
}

export function useChatActions({
  hermesSessionId,
  dbSessionId,
  messages: _messages,
  isLoading,
  setIsLoading,
  setMessages,
  setHermesSessionId,
  onSessionStarted,
  chatInputRef,
  localCommands,
  pendingClarify,
  setPendingClarify,
  activeTabId,
  updateTab,
  streamingText,
  executeGatewayCommand,
  wsGatewayClient,
}: UseChatActionsArgs): UseChatActionsResult {
  const isLoadingRef = useRef(isLoading);
  const hermesSessionIdRef = useRef(hermesSessionId);
  const dbSessionIdRef = useRef(dbSessionId ?? null);
  const abortRequestedRef = useRef(false);
  const queuedInputRef = useRef<
    Array<{ text: string; attachments?: Attachment[] }>
  >([]);
  const gatewayClientRef = useRef(createTauriChatGatewayClient());

  useEffect(() => {
    isLoadingRef.current = isLoading;
    hermesSessionIdRef.current = hermesSessionId;
    dbSessionIdRef.current = dbSessionId ?? null;
  }, [isLoading, hermesSessionId, dbSessionId]);

  const pushUser = useCallback(
    (content: string, idPrefix = "user", attachments?: Attachment[]) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `${idPrefix}-${Date.now()}`,
          role: "user",
          content,
          timestamp: Date.now(),
          ...(attachments && attachments.length > 0 ? { attachments } : {}),
        },
      ]);
    },
    [setMessages],
  );

  const handleSend = useCallback(
    async (text: string, attachments?: Attachment[]): Promise<void> => {
      const hasPayload = text.length > 0 || (attachments?.length ?? 0) > 0;
      if (!hasPayload) return;

      // Handle local commands (e.g. /new, /clear)
      if (text && localCommands.isLocal(text)) {
        const cmd = text.split(/\s+/)[0].toLowerCase();
        if (cmd !== "/new" && cmd !== "/clear") pushUser(text);
        await localCommands.executeLocal(text);
        return;
      }

      const intent = describeInputIntent({
        text,
        isLoading: isLoadingRef.current,
        hasClarify: !!pendingClarify,
      });

      if (intent.kind === "clarify") {
        const clarify = pendingClarify;
        pushUser(text);
        setIsLoading(true);
        const sid = hermesSessionIdRef.current;
        if (sid) {
          try {
            if (wsGatewayClient) {
              await wsGatewayClient.call("clarify.respond", {
                session_id: sid,
                answer: text,
                request_id: clarify?.requestId,
              });
            } else {
              await gatewayClientRef.current.respondClarify(
                sid,
                text,
                clarify?.requestId,
              );
            }
          } catch (err) {
            setMessages((prev) => [
              ...prev,
              ...notifyError((err as Error).message || "Failed to respond to clarification"),
            ]);
            setIsLoading(false);
          }
        }
        setPendingClarify(null);
        return;
      }

      if (intent.kind === "gateway_command" && executeGatewayCommand) {
        setIsLoading(true);
        abortRequestedRef.current = false;
        onSessionStarted?.();

        try {
          const sid = await gatewayClientRef.current.ensureSession(
            hermesSessionIdRef.current,
          );
          if (sid !== hermesSessionIdRef.current) {
            setHermesSessionId(sid);
            hermesSessionIdRef.current = sid;
          }

          const handled = await executeGatewayCommand(sid, intent.text);
          if (!handled) {
            setIsLoading(false);
          }
        } catch (err) {
          setMessages((prev) => [
            ...prev,
            ...notifyError((err as Error).message || String(err)),
          ]);
          setIsLoading(false);
        }
        return;
      }

      if (intent.kind === "busy") {
        const sid = hermesSessionIdRef.current;
        const action = intent.action;
        if (action.kind === "queue") {
          if (action.text) {
            queuedInputRef.current.push({ text: action.text, attachments });
            setMessages((prev) => [
              ...prev,
              createStatusMessage("info", "Queued for next turn", action.displayText),
            ]);
          }
          return;
        }

        if (action.kind === "steer" && sid) {
          try {
            let result: any;
            if (wsGatewayClient) {
              result = await wsGatewayClient.call("prompt.steer", {
                session_id: sid,
                text: action.text,
              });
            } else {
              result = await gatewayClientRef.current.steer(
                sid,
                action.text,
              );
            }
            const payload = (result?.result ?? result ?? {}) as {
              status?: string;
            };
            if (payload.status === "queued") {
              setMessages((prev) => [
                ...prev,
                createStatusMessage("success", "Steer queued", action.displayText),
              ]);
              return;
            }
          } catch {
            setMessages((prev) => [
              ...prev,
              createStatusMessage("info", "Queued for next turn", "Steer failed, input queued instead."),
            ]);
          }
          queuedInputRef.current.push({ text: action.text, attachments });
          setMessages((prev) => [
            ...prev,
            createStatusMessage("info", "Queued for next turn", action.displayText),
          ]);
          return;
        }

        if (sid) {
          const doInterrupt = async (): Promise<void> => {
            if (wsGatewayClient) {
              await wsGatewayClient.call("session.interrupt", { session_id: sid });
            } else {
              await gatewayClientRef.current.interrupt(sid);
            }
          };
          doInterrupt().catch((err) => {
            setMessages((prev) => [
              ...prev,
              createStatusMessage("warning", "Interrupt failed", (err as Error).message || "Could not interrupt session"),
            ]);
          });
        }
      }

      if (intent.kind !== "prompt") return;

      setIsLoading(true);
      abortRequestedRef.current = false;
      pushUser(text, "user", attachments);
      onSessionStarted?.();

      try {
        const promptText = formatPromptWithAttachments(text, attachments);
        const sid = await gatewayClientRef.current.submitPromptWithSession({
          currentSessionId: hermesSessionIdRef.current,
          dbSessionId: dbSessionIdRef.current,
          text: promptText,
        });
        if (sid !== hermesSessionIdRef.current) {
          setHermesSessionId(sid);
          hermesSessionIdRef.current = sid;
        }
      } catch (err) {
        if (abortRequestedRef.current) {
          setIsLoading(false);
          return;
        }
        setMessages((prev) => [
          ...prev,
          ...notifyError((err as Error).message || String(err)),
        ]);
        setIsLoading(false);
      }
    },
    [
      localCommands,
      pushUser,
      onSessionStarted,
      setIsLoading,
      setMessages,
      pendingClarify,
      setPendingClarify,
      setHermesSessionId,
      executeGatewayCommand,
      wsGatewayClient,
    ],
  );

  useEffect(() => {
    if (isLoading || queuedInputRef.current.length === 0) return;
    const next = queuedInputRef.current.shift();
    if (!next) return;
    void handleSend(next.text, next.attachments);
  }, [handleSend, isLoading]);

  const handleQuickAsk = useCallback(
    async (text: string, attachments?: Attachment[]): Promise<void> => {
      if (!text || isLoadingRef.current) return;
      setIsLoading(true);
      pushUser(`💭 ${text}`, "user-btw", attachments);

      try {
        const sid = await gatewayClientRef.current.submitPromptWithSession({
          currentSessionId: hermesSessionIdRef.current,
          dbSessionId: dbSessionIdRef.current,
          text: `/btw ${text}`,
        });
        if (sid !== hermesSessionIdRef.current) {
          setHermesSessionId(sid);
          hermesSessionIdRef.current = sid;
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          ...notifyError((err as Error).message || "Quick ask failed"),
        ]);
        setIsLoading(false);
      }
    },
    [pushUser, setIsLoading, setHermesSessionId],
  );

  const handleAbort = useCallback(() => {
    abortRequestedRef.current = true;
    if (hermesSessionIdRef.current) {
      const sid = hermesSessionIdRef.current;
      if (wsGatewayClient) {
        wsGatewayClient.call("session.interrupt", { session_id: sid }).catch((err) => {
          setMessages((prev) => [
            ...prev,
            createStatusMessage("warning", "Interrupt failed", (err as Error).message || "Could not interrupt session"),
          ]);
        });
      } else {
        gatewayClientRef.current.interrupt(sid).catch((err) => {
          setMessages((prev) => [
            ...prev,
            createStatusMessage("warning", "Interrupt failed", (err as Error).message || "Could not interrupt session"),
          ]);
        });
      }
    }

    if (streamingText && streamingText.trim()) {
      setMessages((prev) => [
        ...prev,
        {
          id: `agent-interrupted-${Date.now()}`,
          sessionId: hermesSessionIdRef.current || undefined,
          role: "agent",
          content: `${streamingText.trim()}\n\n*[interrupted]*`,
          timestamp: Date.now(),
        },
      ]);
    } else {
      setMessages((prev) => [
        ...prev,
        createStatusMessage("warning", "Session interrupted", "Execution was cancelled by user."),
      ]);
    }
    updateTab(activeTabId, {
      streamingText: "",
      abortRequested: true,
      pendingApproval: null,
      pendingClarify: null,
      pendingSudo: null,
      pendingSecret: null,
    });

    setIsLoading(false);
    setTimeout(() => chatInputRef.current?.focus(), 50);
  }, [
    chatInputRef,
    setIsLoading,
    streamingText,
    setMessages,
    updateTab,
    activeTabId,
    wsGatewayClient,
  ]);

  return { handleSend, handleQuickAsk, handleAbort };
}

function formatPromptWithAttachments(
  text: string,
  attachments?: Attachment[],
): string {
  if (!attachments || attachments.length === 0) return text;

  let formatted = text;
  const textAttachments = attachments.filter((a) => a.kind === "text-file");
  const pathAttachments = attachments.filter((a) => a.kind === "path-ref");

  if (textAttachments.length > 0) {
    formatted += "\n\n";
    textAttachments.forEach((att) => {
      formatted += `\n=== ATTACHMENT FILE: ${att.name} ===\n${
        att.text || ""
      }\n====================================\n`;
    });
  }

  if (pathAttachments.length > 0) {
    formatted += "\n\n";
    pathAttachments.forEach((att) => {
      formatted += `\n(Staged attachment "${att.name}" is located at absolute path: "${att.path}")\n`;
    });
  }

  return formatted;
}
