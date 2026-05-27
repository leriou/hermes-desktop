import { useCallback, useEffect, useRef } from "react";
import {
  getSessionMessages,
  getSessionMessagesBefore,
} from "@renderer/lib/hermes-tauri";
import type { ChatMessage } from "../types";

interface UseLoadEarlierOptions {
  sessionId: string | null;
  dbSessionId?: string | null;
  hermesSessionId: string | null;
  relatedSessionIds: string[];
  profile?: string;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  messagesRef: React.MutableRefObject<ChatMessage[]>;
}

export function useLoadEarlier({
  sessionId,
  dbSessionId,
  hermesSessionId,
  relatedSessionIds = [],
  profile,
  setMessages,
  messagesRef,
}: UseLoadEarlierOptions) {
  const loadingEarlierRef = useRef(false);
  const noMoreEarlierRef = useRef(false);
  const relatedExhaustedRef = useRef(-1);

  useEffect(() => {
    noMoreEarlierRef.current = false;
    relatedExhaustedRef.current = -1;
  }, [sessionId]);

  const handleLoadEarlierMessages = useCallback(async () => {
    if (loadingEarlierRef.current || noMoreEarlierRef.current) return;
    const primarySid = dbSessionId ?? hermesSessionId ?? sessionId;
    if (!primarySid) return;

    const loadBatch = async (sid: string, beforeTs: number | null) => {
      if (beforeTs !== null) {
        return getSessionMessagesBefore(sid, beforeTs, 50, profile);
      }
      return getSessionMessages(sid, profile);
    };

    const toChatMessages = (items: any[]): ChatMessage[] =>
      items
        .map((it: any): ChatMessage | null => {
          const ts = it.timestamp ? Math.round(it.timestamp * 1000) : undefined;
          switch (it.kind) {
            case "user":
              return {
                id: `db-${it.id}`,
                role: "user" as const,
                content: it.content,
                timestamp: ts,
              };
            case "assistant":
              return {
                id: `db-${it.id}`,
                role: "agent" as const,
                content: it.content,
                timestamp: ts,
              };
            case "tool_call":
              return {
                id: `db-${it.id}`,
                kind: "tool_call" as const,
                role: "agent" as const,
                callId: it.callId || "",
                name: it.name || "tool",
                args: it.args || "",
                timestamp: ts,
              };
            case "tool_result": {
              let content = it.content || "";
              if (content.length > 8000)
                content =
                  content.slice(0, 8000) +
                  `\n\n... (${content.length} chars total)`;
              return {
                id: `db-${it.id}`,
                kind: "tool_result" as const,
                role: "agent" as const,
                callId: it.callId || "",
                name: it.name || "tool",
                content,
                timestamp: ts,
              };
            }
            default:
              return null;
          }
        })
        .filter((m): m is ChatMessage => m !== null);

    loadingEarlierRef.current = true;
    try {
      const sessionChain = [primarySid];
      if (relatedSessionIds.length > 1) {
        const idx = relatedSessionIds.indexOf(primarySid);
        if (idx > 0) {
          for (let i = idx - 1; i >= 0; i--) {
            sessionChain.push(relatedSessionIds[i]);
          }
        }
      }

      const currentMessages = messagesRef.current;
      const firstWithTs = currentMessages.find((m) => (m as any).timestamp);
      const beforeTs = firstWithTs
        ? ((firstWithTs as any).timestamp as number) / 1000
        : null;
      if (beforeTs === null && currentMessages.length > 0) return;

      const earlier = await loadBatch(primarySid, beforeTs);
      let chatMessages = toChatMessages(earlier || []);

      if (chatMessages.length > 0) {
        const el = document.querySelector(".chat-messages");
        const oldHeight = el?.scrollHeight ?? 0;
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const unique = chatMessages.filter((m) => !existingIds.has(m.id));
          if (unique.length === 0) return prev;
          return [...unique, ...prev];
        });
        requestAnimationFrame(() => {
          const el = document.querySelector(".chat-messages");
          if (el) el.scrollTop = el.scrollHeight - oldHeight;
        });
        return;
      }

      const startIdx = Math.max(0, relatedExhaustedRef.current + 1);
      for (let i = startIdx; i < sessionChain.length - 1; i++) {
        const olderSid = sessionChain[i + 1];
        if (!olderSid) continue;
        const olderRaw = await getSessionMessages(olderSid, profile);
        chatMessages = toChatMessages(olderRaw || []);
        if (chatMessages.length === 0) {
          relatedExhaustedRef.current = i;
          continue;
        }
        const existingIds = new Set(messagesRef.current.map((m) => m.id));
        const unique = chatMessages.filter((m) => !existingIds.has(m.id));
        if (unique.length === 0) {
          relatedExhaustedRef.current = i;
          continue;
        }
        const el = document.querySelector(".chat-messages");
        const oldHeight = el?.scrollHeight ?? 0;
        setMessages((prev) => [...unique, ...prev]);
        requestAnimationFrame(() => {
          const el = document.querySelector(".chat-messages");
          if (el) el.scrollTop = el.scrollHeight - oldHeight;
        });
        return;
      }

      noMoreEarlierRef.current = true;
    } catch {
      /* ignore */
    } finally {
      loadingEarlierRef.current = false;
    }
  }, [
    dbSessionId,
    hermesSessionId,
    sessionId,
    relatedSessionIds,
    profile,
    setMessages,
    messagesRef,
  ]);

  return { handleLoadEarlierMessages };
}
