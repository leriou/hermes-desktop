import { useCallback, useEffect, useRef } from "react";
import type { ChatInputHandle } from "../ChatInput";
import type { Attachment, ChatMessage, ClarifyRequest } from "../types";
import { describeBusyInput } from "../busyInput";

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
  executeGatewayCommand?: (sessionId: string, command: string) => Promise<boolean>;
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
  executeGatewayCommand,
}: UseChatActionsArgs): UseChatActionsResult {
  const isLoadingRef = useRef(isLoading);
  const hermesSessionIdRef = useRef(hermesSessionId);
  const dbSessionIdRef = useRef(dbSessionId ?? null);
  const abortRequestedRef = useRef(false);
  const queuedInputRef = useRef<Array<{ text: string; attachments?: Attachment[] }>>([]);

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

      // Handle clarify response — agent asked a question and is blocking
      if (pendingClarify) {
        pushUser(text);
        setIsLoading(true);
        const sid = hermesSessionIdRef.current;
        if (sid) {
          try {
            await window.hermesAPI.tuiClarifyRespond(sid, text, pendingClarify.requestId);
          } catch {
            setIsLoading(false);
          }
        }
        setPendingClarify(null);
        return;
      }

      if (text.startsWith("/") && executeGatewayCommand) {
        const cmd = text.trim().split(/\s+/)[0].toLowerCase();
        const canRunWhileBusy = cmd === "/steer";
        if (isLoadingRef.current && !canRunWhileBusy) return;

        setIsLoading(true);
        abortRequestedRef.current = false;
        onSessionStarted?.();

        try {
          await window.hermesAPI.startGateway();

          let sid = hermesSessionIdRef.current;
          if (!sid) {
            const res = await window.hermesAPI.tuiCreateSession();
            sid = res.session_id;
            if (sid) {
              setHermesSessionId(sid);
              hermesSessionIdRef.current = sid;
            }
          }

          if (!sid) throw new Error("Failed to create or resume session");

          const handled = await executeGatewayCommand(sid, text);
          if (!handled) {
            setIsLoading(false);
          }
        } catch (err) {
          setMessages((prev) => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              role: "agent",
              content: `Error: ${(err as Error).message || String(err)}`,
              timestamp: Date.now(),
            },
          ]);
          setIsLoading(false);
        }
        return;
      }

      if (isLoadingRef.current) {
        const sid = hermesSessionIdRef.current;
        const action = describeBusyInput(text, "steer");
        if (action.kind === "queue") {
          if (action.text) {
            queuedInputRef.current.push({ text: action.text, attachments });
            setMessages((prev) => [
              ...prev,
              {
                id: `queued-${Date.now()}`,
                kind: "system_status",
                role: "agent",
                title: "Queued for next turn",
                content: action.displayText,
                tone: "info",
                timestamp: Date.now(),
              },
            ]);
          }
          return;
        }

        if (action.kind === "steer" && sid) {
          try {
            const result = await window.hermesAPI.tuiSteer(sid, action.text);
            const payload = result?.result ?? result ?? {};
            if (payload.status === "queued") {
              setMessages((prev) => [
                ...prev,
                {
                  id: `steer-${Date.now()}`,
                  kind: "system_status",
                  role: "agent",
                  title: "Steer queued",
                  content: action.displayText,
                  tone: "success",
                  timestamp: Date.now(),
                },
              ]);
              return;
            }
          } catch {
            // Fall back to queue semantics so in-flight input is never dropped.
          }
          queuedInputRef.current.push({ text: action.text, attachments });
          setMessages((prev) => [
            ...prev,
            {
              id: `queued-${Date.now()}`,
              kind: "system_status",
              role: "agent",
              title: "Queued for next turn",
              content: action.displayText,
              tone: "info",
              timestamp: Date.now(),
            },
          ]);
          return;
        }

        if (sid) {
          window.hermesAPI.tuiInterrupt(sid).catch(err => {
            console.error("[useChatActions] Pipelined interrupt failed:", err);
          });
        }
      }

      setIsLoading(true);
      abortRequestedRef.current = false;
      pushUser(text, "user", attachments);
      onSessionStarted?.();

      try {
        // Ensure the TUI Gateway is running (Tauri mode requires it)
        try {
          await window.hermesAPI.startGateway();
          console.log("[chat] gateway started OK");
        } catch (gwErr) {
          console.error("[chat] startGateway failed:", gwErr);
          throw gwErr; // let outer catch handle it
        }

        let sid = hermesSessionIdRef.current;
        if (!sid) {
          const res = await window.hermesAPI.tuiCreateSession();
          sid = res.session_id;
          if (sid) {
            setHermesSessionId(sid);
            hermesSessionIdRef.current = sid;
          }
        }

        if (!sid) throw new Error("Failed to create or resume session");

        try {
          await window.hermesAPI.tuiSubmitPrompt(sid, text);
        } catch (err) {
          if (abortRequestedRef.current) {
            setIsLoading(false);
            return;
          }
          const msg = (err as Error).message || String(err);
          if (/not found|invalid|expired|session/i.test(msg)) {
            try {
              const dbSid = dbSessionIdRef.current;
              if (dbSid) {
                const resumed = await window.hermesAPI.tuiResumeSession(dbSid);
                sid = resumed?.session_id || sid;
              } else {
                const res = await window.hermesAPI.tuiCreateSession();
                sid = res.session_id;
              }
              if (sid) {
                setHermesSessionId(sid);
                hermesSessionIdRef.current = sid;
              }
              if (!sid) throw new Error("Failed to create or resume session");
              await window.hermesAPI.tuiSubmitPrompt(sid, text);
            } catch (retryErr) {
              setMessages((prev) => [
                ...prev,
                {
                  id: `error-${Date.now()}`,
                  role: "agent",
                  content: `Error: ${(retryErr as Error).message}`,
                  timestamp: Date.now(),
                },
              ]);
              setIsLoading(false);
            }
          } else {
            setMessages((prev) => [
              ...prev,
              {
                id: `error-${Date.now()}`,
                role: "agent",
                content: `Error: ${msg}`,
                timestamp: Date.now(),
              },
            ]);
            setIsLoading(false);
          }
        }
      } catch (err) {
        // Catches errors from startGateway/tuiCreateSession that were previously unhandled
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: "agent",
            content: `Error: ${(err as Error).message || String(err)}`,
            timestamp: Date.now(),
          },
        ]);
        setIsLoading(false);
      }
    },
    [localCommands, pushUser, onSessionStarted, setIsLoading, setMessages, pendingClarify, setPendingClarify, setHermesSessionId, executeGatewayCommand],
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
        await window.hermesAPI.startGateway();
      } catch { /* already running */ }

      let sid = hermesSessionIdRef.current;
      if (!sid) {
        const res = await window.hermesAPI.tuiCreateSession();
        sid = res.session_id;
        if (sid) {
          setHermesSessionId(sid);
          hermesSessionIdRef.current = sid;
        }
      }
      
      try {
        await window.hermesAPI.tuiSubmitPrompt(sid, `/btw ${text}`);
      } catch (_err) {
        const dbSid = dbSessionIdRef.current;
        try {
          if (dbSid) {
            const resumed = await window.hermesAPI.tuiResumeSession(dbSid);
            sid = resumed?.session_id || sid;
          } else {
            const res = await window.hermesAPI.tuiCreateSession();
            sid = res.session_id;
          }
          if (sid) {
            setHermesSessionId(sid);
            hermesSessionIdRef.current = sid;
          }
          if (!sid) throw new Error("Failed to create or resume session");
          await window.hermesAPI.tuiSubmitPrompt(sid, `/btw ${text}`);
        } catch {
          setIsLoading(false);
        }
      }
    },
    [pushUser, setIsLoading, setHermesSessionId],
  );

  const handleAbort = useCallback(() => {
    abortRequestedRef.current = true;
    if (hermesSessionIdRef.current) {
      window.hermesAPI.tuiInterrupt(hermesSessionIdRef.current).catch(() => {});
    }
    setIsLoading(false);
    setTimeout(() => chatInputRef.current?.focus(), 50);
  }, [chatInputRef, setIsLoading]);

  return { handleSend, handleQuickAsk, handleAbort };
}
