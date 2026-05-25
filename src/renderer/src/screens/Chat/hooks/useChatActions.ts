import { useCallback, useEffect, useRef } from "react";
import type { ChatInputHandle } from "../ChatInput";
import type { Attachment, ChatMessage, ClarifyRequest } from "../types";

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
  handleApprove: () => void;
  handleDeny: () => void;
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
        // Interrupt current response, then submit new prompt
        const sid = hermesSessionIdRef.current;
        if (sid) {
          await window.hermesAPI.tuiInterrupt(sid);
          setIsLoading(false);
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

  const handleApprove = useCallback(() => {
    if (!hermesSessionIdRef.current) return;
    chatInputRef.current?.clear();
    setIsLoading(true);
    pushUser("✅ Approve", "user-approve");
    window.hermesAPI.tuiApprovalRespond(hermesSessionIdRef.current, "approve").catch(() => setIsLoading(false));
  }, [chatInputRef, pushUser, setIsLoading]);

  const handleDeny = useCallback(() => {
    if (!hermesSessionIdRef.current) return;
    chatInputRef.current?.clear();
    setIsLoading(true);
    pushUser("❌ Deny", "user-deny");
    window.hermesAPI.tuiApprovalRespond(hermesSessionIdRef.current, "deny").catch(() => setIsLoading(false));
  }, [chatInputRef, pushUser, setIsLoading]);

  return { handleSend, handleQuickAsk, handleAbort, handleApprove, handleDeny };
}
