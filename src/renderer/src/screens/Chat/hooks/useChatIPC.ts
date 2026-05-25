import { useEffect, useRef, useCallback } from "react";
import type { ApprovalRequest, ChatMessage, ClarifyRequest, UsageState } from "../types";

interface UseChatIPCArgs {
  hermesSessionId: string | null;
  dbSessionId?: string | null;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setHermesSessionId: (id: string | null) => void;
  setToolProgress: (tool: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setUsage: React.Dispatch<React.SetStateAction<UsageState | null>>;
  setPendingApproval: (approval: ApprovalRequest | null) => void;
  setPendingClarify: (clarify: ClarifyRequest | null) => void;
  /** Streaming text — updated synchronously, avoids re-rendering message list */
  streamingTextRef: React.MutableRefObject<string>;
  onSessionInfo?: (info: { model: string; provider?: string }) => void;
  onTitleAvailable?: (title: string) => void;
  onStatusUpdate?: (status: { kind?: string; text?: string }) => void;
  /** True while we are actively waiting for a response — gates SID bonding */
  isLoading: boolean;
}

const FLUSH_MS = 80;

export function useChatIPC({
  hermesSessionId,
  dbSessionId,
  setMessages,
  setHermesSessionId,
  setToolProgress,
  setIsLoading,
  setUsage,
  setPendingApproval,
  setPendingClarify,
  streamingTextRef,
  onSessionInfo,
  onTitleAvailable,
  onStatusUpdate,
  isLoading,
}: UseChatIPCArgs): void {
  const sidRef = useRef(hermesSessionId);
  const dbSidRef = useRef(dbSessionId ?? null);
  const loadingRef = useRef(isLoading);
  useEffect(() => {
    sidRef.current = hermesSessionId;
    dbSidRef.current = dbSessionId ?? null;
  }, [hermesSessionId, dbSessionId]);
  useEffect(() => {
    loadingRef.current = isLoading;
  }, [isLoading]);

  const pendingChunks = useRef("");
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable refs for callbacks to avoid re-subscribing on every render
  const callbacksRef = useRef({
    setMessages,
    setHermesSessionId,
    setToolProgress,
    setIsLoading,
    setUsage,
    setPendingApproval,
    setPendingClarify,
    onSessionInfo,
    onTitleAvailable,
    onStatusUpdate,
    streamingTextRef,
  });

  useEffect(() => {
    callbacksRef.current = {
      setMessages,
      setHermesSessionId,
      setToolProgress,
      setIsLoading,
      setUsage,
      setPendingApproval,
      setPendingClarify,
      onSessionInfo,
      onTitleAvailable,
      onStatusUpdate,
      streamingTextRef,
    };
  });

  const commitStreamingText = useCallback(() => {
    const { streamingTextRef, setMessages } = callbacksRef.current;
    const text = streamingTextRef.current;
    console.log("[useChatIPC] commitStreamingText:", JSON.stringify(text).slice(0, 100), "len:", text.length);
    if (!text) return;
    streamingTextRef.current = "";
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (
        last &&
        last.role === "agent" &&
        "content" in last &&
        typeof last.content === "string"
      ) {
        return [
          ...prev.slice(0, -1),
          { ...last, content: last.content + text },
        ];
      }
      if (!text.trim()) return prev;
      return [
        ...prev,
        { id: `agent-${Date.now()}`, sessionId: sidRef.current ?? dbSidRef.current ?? undefined, role: "agent", content: text, timestamp: Date.now() },
      ];
    });
  }, []);

  useEffect(() => {
    function flush(): void {
      const batch = pendingChunks.current;
      pendingChunks.current = "";
      if (!batch) return;
      callbacksRef.current.streamingTextRef.current += batch;
    }

    function scheduleFlush(): void {
      if (flushTimer.current) return;
      flushTimer.current = setTimeout(() => {
        flushTimer.current = null;
        flush();
      }, FLUSH_MS);
    }

    const cleanup = window.hermesAPI.onTuiEvent((event) => {
      const { type, payload, sid } = event;
      const cb = callbacksRef.current;
      const currentRuntimeSid = sidRef.current;
      const currentDbSid = dbSidRef.current;
      const eventMatchesCurrentSession = !sid || sid === currentRuntimeSid || sid === currentDbSid;

      // If we don't have a session ID yet, bond only when actively loading (user just sent a message)
      if (sid && !sidRef.current && loadingRef.current && (type === "message.start" || type === "message.delta" || type === "tool.start")) {
        cb.setHermesSessionId(sid);
        sidRef.current = sid;
      }

      // Strict filtering: only accept events matching this mounted chat instance.
      // `dbSessionId` is accepted because resumed history sessions can keep a stable
      // DB id while the gateway returns a different runtime sid.
      if (!eventMatchesCurrentSession) {
        return;
      }
      // If we have no SID and we're not actively loading, ignore all SID-bearing events
      if (sid && !sidRef.current && !loadingRef.current) {
        return;
      }

      switch (type) {
        case "message.start":
          cb.setIsLoading(true);
          cb.setToolProgress(null);
          break;

        case "message.delta": {
          const text = payload.text || "";
          if (text) {
            // Ensure loading is true if we get data
            cb.setIsLoading(true);
            pendingChunks.current += text;
            scheduleFlush();
          }
          break;
        }

        case "message.complete":
          // Cancel any pending flush — payload.text is authoritative
          if (flushTimer.current) {
            clearTimeout(flushTimer.current);
            flushTimer.current = null;
          }
          pendingChunks.current = "";

          // Replace last agent message with gateway's final text
          const finalText = payload.text;
          const hadStreaming = !!cb.streamingTextRef.current;
          cb.streamingTextRef.current = "";

          cb.setMessages((prev) => {
            if (finalText) {
              for (let i = prev.length - 1; i >= 0; i--) {
                const m = prev[i];
                if (m.role === "agent" && "content" in m && typeof m.content === "string") {
                  return [...prev.slice(0, i), { ...m, content: finalText }, ...prev.slice(i + 1)];
                }
              }
              return [...prev, { id: `agent-${Date.now()}`, sessionId: sid ?? currentRuntimeSid ?? currentDbSid ?? undefined, role: "agent", content: finalText, timestamp: Date.now() }];
            }
            // Fallback: commit accumulated streaming text
            if (hadStreaming) {
              const text = ""; // streamingTextRef was already read above
              if (!text.trim()) return prev;
              const last = prev[prev.length - 1];
              if (last && last.role === "agent" && "content" in last && typeof last.content === "string") {
                return [...prev.slice(0, -1), { ...last, content: last.content }];
              }
            }
            return prev;
          });

          cb.setIsLoading(false);
          cb.setToolProgress(null);
          cb.setPendingApproval(null);
          cb.setPendingClarify(null);
          if (sid) cb.setHermesSessionId(sid);

          if (payload.usage?.model) {
            const model = payload.usage.model;
            cb.setMessages((prev) => {
              for (let i = prev.length - 1; i >= 0; i--) {
                const m = prev[i];
                if (m.role === "agent" && "content" in m) {
                  const updated = { ...m, model, timestamp: (m as any).timestamp || Date.now() };
                  return [...prev.slice(0, i), updated as ChatMessage, ...prev.slice(i + 1)];
                }
              }
              return prev;
            });
          }
          if (payload.warning) {
            cb.setMessages((prev) => [
              ...prev,
              { id: `warning-${Date.now()}`, sessionId: sid ?? currentRuntimeSid ?? currentDbSid ?? undefined, role: "agent", content: `⚠️ ${payload.warning}`, timestamp: Date.now() },
            ]);
          }
          if (payload.usage) {
            cb.setUsage({
              promptTokens: payload.usage.input ?? payload.usage.promptTokens ?? 0,
              completionTokens: payload.usage.output ?? payload.usage.completionTokens ?? 0,
              totalTokens: payload.usage.total ?? payload.usage.totalTokens ?? 0,
              cost: payload.usage.cost_usd ?? payload.usage.cost,
              calls: payload.usage.calls,
              cacheRead: payload.usage.cache_read,
              cacheWrite: payload.usage.cache_write,
              reasoning: payload.usage.reasoning,
              contextUsed: payload.usage.context_used,
              contextMax: payload.usage.context_max,
              contextPercent: payload.usage.context_percent,
            });
          }
          break;

        case "tool.start":
          cb.setIsLoading(true);
          cb.setToolProgress(payload.name || "Thinking...");
          if (payload.tool_id) {
            cb.setMessages((prev) => [
              ...prev,
              {
                id: `tool-start-${payload.tool_id}`,
                sessionId: sid ?? currentRuntimeSid ?? currentDbSid ?? undefined,
                kind: "tool_call" as const,
                role: "agent" as const,
                callId: payload.tool_id,
                name: payload.name || "Tool",
                args: payload.args ? (typeof payload.args === "string" ? payload.args : JSON.stringify(payload.args, null, 2)) : "",
              },
            ]);
          }
          break;

        case "tool.complete":
          cb.setToolProgress(null);
          if (payload.tool_id) {
            let resultText = payload.result ? (typeof payload.result === "string" ? payload.result : JSON.stringify(payload.result, null, 2)) : (payload.success === false ? "Failed" : "");
            if (resultText.length > 8000) {
              resultText = resultText.slice(0, 8000) + `\n\n... (${resultText.length} chars total)`;
            }
            cb.setMessages((prev) => {
              const idx = prev.findIndex((m) => m.kind === "tool_call" && "callId" in m && m.callId === payload.tool_id);
              if (idx !== -1) {
                const existing = prev[idx] as import("../types").ToolCallMessage;
                return [...prev.slice(0, idx), { ...existing, result: resultText, success: payload.success !== false, durationS: payload.duration_s, inlineDiff: payload.inline_diff }, ...prev.slice(idx + 1)];
              }
              return [...prev, { id: `tool-result-${payload.tool_id}`, sessionId: sid ?? currentRuntimeSid ?? currentDbSid ?? undefined, kind: "tool_result" as const, role: "agent" as const, callId: payload.tool_id, name: payload.name || "", content: resultText }];
            });
          }
          break;

        case "tool.progress":
          cb.setToolProgress(`${payload.name} ${payload.preview || ""}`);
          if (payload.tool_id) {
            cb.setMessages((prev) => {
              const idx = prev.findIndex((m) => m.kind === "tool_call" && "callId" in m && m.callId === payload.tool_id);
              if (idx === -1) return prev;
              const existing = prev[idx] as import("../types").ToolCallMessage;
              return [...prev.slice(0, idx), { ...existing, progress: payload.preview || payload.name || "" }, ...prev.slice(idx + 1)];
            });
          }
          break;

        case "approval.request":
          cb.setPendingApproval({
            command: payload.command || "",
            description: payload.description || "",
            patternKey: payload.pattern_key || "",
            patternKeys: payload.pattern_keys || [],
          });
          break;

        case "clarify.request":
          cb.setPendingClarify({
            requestId: payload.request_id || "",
            question: payload.question || "",
            choices: payload.choices,
          });
          break;

        case "error":
          if (flushTimer.current) {
            clearTimeout(flushTimer.current);
            flushTimer.current = null;
          }
          commitStreamingText();
          cb.setMessages((prev) => [
            ...prev,
            { id: `error-${Date.now()}`, sessionId: sid ?? currentRuntimeSid ?? currentDbSid ?? undefined, role: "agent", content: `Error: ${payload.message}`, timestamp: Date.now() },
          ]);
          cb.setIsLoading(false);
          cb.setToolProgress(null);
          break;

        case "session.info":
          if (payload.model) cb.onSessionInfo?.({ model: payload.model, provider: payload.provider });
          if (payload.title) cb.onTitleAvailable?.(payload.title);
          break;

        case "status.update":
          if (payload?.text) cb.onStatusUpdate?.({ kind: payload.kind, text: payload.text });
          if (payload.kind === "process" && payload.text) cb.setToolProgress(payload.text);
          break;

        case "thinking.delta":
        case "reasoning.delta":
          // Accumulate reasoning for display (not persisted in this hook)
          break;
      }
    });

    return () => {
      if (flushTimer.current) {
        clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      cleanup();
    };
  }, [commitStreamingText]); // Stable dependencies
}
