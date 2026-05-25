import { useEffect, useRef } from "react";
import type { ChatMessage, ReasoningMessage, SubagentMessage, ToolCallMessage, UsageState, SudoRequest, SecretRequest } from "../types";
import type { SessionState } from "./useSessionManager";
import { shortModelName } from "../sessionDisplay";

type TuiEvent = {
  type: string;
  payload?: any;
  sid?: string;
};

interface UseChatInboxArgs {
  sessions: Map<string, SessionState>;
  activeTabId: string | null;
  chatVisible: boolean;
  findTabBySessionId: (sid: string) => string | null;
  updateTab: (id: string, patch: Partial<SessionState>) => void;
  updateTabMessages: (id: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
}

const FLUSH_MS = 80;
const LIVE_EVENT_TYPES = new Set(["message.start", "message.delta", "tool.start", "thinking.delta", "reasoning.delta"]);

function usageFromPayload(usage: any): UsageState {
  return {
    promptTokens: usage.input ?? usage.promptTokens ?? 0,
    completionTokens: usage.output ?? usage.completionTokens ?? 0,
    totalTokens: usage.total ?? usage.totalTokens ?? 0,
    cost: usage.cost_usd ?? usage.cost,
    calls: usage.calls,
    cacheRead: usage.cache_read,
    cacheWrite: usage.cache_write,
    reasoning: usage.reasoning,
    contextUsed: usage.context_used,
    contextMax: usage.context_max,
    contextPercent: usage.context_percent,
  };
}

function appendStreaming(prev: ChatMessage[], text: string, sessionId?: string): ChatMessage[] {
  if (!text) return prev;
  const last = prev[prev.length - 1];
  if (last && last.role === "agent" && "content" in last && typeof last.content === "string") {
    return [...prev.slice(0, -1), { ...last, content: last.content + text }];
  }
  if (!text.trim()) return prev;
  return [
    ...prev,
    {
      id: `agent-${Date.now()}`,
      sessionId,
      role: "agent",
      content: text,
      timestamp: Date.now(),
    },
  ];
}

export function useChatInbox({
  sessions,
  activeTabId,
  chatVisible,
  findTabBySessionId,
  updateTab,
  updateTabMessages,
}: UseChatInboxArgs): void {
  const sessionsRef = useRef(sessions);
  const activeTabIdRef = useRef(activeTabId);
  const chatVisibleRef = useRef(chatVisible);
  const pendingChunksRef = useRef(new Map<string, string>());
  const flushTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    sessionsRef.current = sessions;
    activeTabIdRef.current = activeTabId;
    chatVisibleRef.current = chatVisible;
  }, [sessions, activeTabId, chatVisible]);

  useEffect(() => {
    function tabForEvent(event: TuiEvent): string | null {
      if (event.sid) {
        const existing = findTabBySessionId(event.sid);
        if (existing) return existing;
      }
      const active = activeTabIdRef.current;
      if (!active) return null;
      const state = sessionsRef.current.get(active);
      if (!state) return null;
      if (event.sid && !state.hermesSessionId && state.isLoading && LIVE_EVENT_TYPES.has(event.type)) {
        updateTab(active, { hermesSessionId: event.sid });
        return active;
      }
      if (!event.sid) return active;
      return null;
    }

    function commitStreaming(tabId: string, sid?: string): void {
      const state = sessionsRef.current.get(tabId);
      const text = state?.streamingText ?? "";
      if (!text) return;
      updateTab(tabId, { streamingText: "" });
      updateTabMessages(tabId, (prev) => appendStreaming(prev, text, sid));
      if (!chatVisibleRef.current || tabId !== activeTabIdRef.current) {
        updateTab(tabId, { unreadCount: (state?.unreadCount ?? 0) + 1 });
      }
    }

    function flush(tabId: string): void {
      const batch = pendingChunksRef.current.get(tabId) ?? "";
      pendingChunksRef.current.delete(tabId);
      if (!batch) return;
      const state = sessionsRef.current.get(tabId);
      updateTab(tabId, {
        streamingText: `${state?.streamingText ?? ""}${batch}`,
        ...(!chatVisibleRef.current || tabId !== activeTabIdRef.current
          ? { unreadCount: Math.max(1, state?.unreadCount ?? 0) }
          : {}),
      });
    }

    function scheduleFlush(tabId: string): void {
      if (flushTimersRef.current.has(tabId)) return;
      const timer = setTimeout(() => {
        flushTimersRef.current.delete(tabId);
        flush(tabId);
      }, FLUSH_MS);
      flushTimersRef.current.set(tabId, timer);
    }

    const cleanup = window.hermesAPI.onTuiEvent((event: TuiEvent) => {
      const tabId = tabForEvent(event);
      if (!tabId) return;
      const state = sessionsRef.current.get(tabId);
      const runtimeSid = event.sid ?? state?.hermesSessionId ?? state?.dbSessionId ?? undefined;
      const payload = event.payload ?? {};

      switch (event.type) {
        case "message.start":
          updateTab(tabId, { isLoading: true, toolProgress: null, streamingReasoning: "" });
          break;

        case "message.delta": {
          const text = payload.text || "";
          if (text) {
            updateTab(tabId, { isLoading: true });
            pendingChunksRef.current.set(tabId, `${pendingChunksRef.current.get(tabId) ?? ""}${text}`);
            scheduleFlush(tabId);
          }
          break;
        }

        case "message.complete": {
          // Cancel any pending flush
          const timer = flushTimersRef.current.get(tabId);
          if (timer) {
            clearTimeout(timer);
            flushTimersRef.current.delete(tabId);
          }
          // Capture any unflushed chunks before discarding
          const pendingChunk = pendingChunksRef.current.get(tabId) ?? "";
          pendingChunksRef.current.delete(tabId);

          const finalText = payload.text;
          const reasoningText = payload.reasoning || state?.streamingReasoning || "";
          const hadStreaming = !!(state?.streamingText) || !!pendingChunk;
          // Compute fallback text: already-flushed streamingText + unflushed pending chunk
          const fallbackText = `${state?.streamingText ?? ""}${pendingChunk}`;
          const model = payload.usage?.model;
          updateTab(tabId, { streamingText: "", streamingReasoning: "" });

          // Single updateTabMessages: reasoning → content → model, all in one pass
          updateTabMessages(tabId, (prev) => {
            let msgs = prev;
            // 1. Insert reasoning message before last agent message
            if (reasoningText) {
              const reasoningMsg: ReasoningMessage = {
                id: `reasoning-${Date.now()}`,
                kind: "reasoning",
                role: "agent",
                text: reasoningText,
              };
              for (let i = msgs.length - 1; i >= 0; i--) {
                if (msgs[i].role === "agent" && "content" in msgs[i]) {
                  msgs = [...msgs.slice(0, i), reasoningMsg, ...msgs.slice(i)];
                  break;
                }
              }
              if (msgs === prev) msgs = [...prev, reasoningMsg];
            }
            // 2. Replace last agent message content
            const text = finalText || (hadStreaming ? fallbackText : "");
            if (text) {
              let replaced = false;
              for (let i = msgs.length - 1; i >= 0; i--) {
                const m = msgs[i];
                if (m.role === "agent" && "content" in m && typeof m.content === "string") {
                  msgs = [
                    ...msgs.slice(0, i),
                    { ...m, content: text, ...(model ? { model } : {}) },
                    ...msgs.slice(i + 1),
                  ];
                  replaced = true;
                  break;
                }
              }
              if (!replaced) {
                msgs = [
                  ...msgs,
                  { id: `agent-${Date.now()}`, sessionId: runtimeSid, role: "agent", content: text, timestamp: Date.now(), ...(model ? { model } : {}) },
                ];
              }
            }
            return msgs;
          });
          updateTab(tabId, {
            isLoading: false,
            toolProgress: null,
            pendingApproval: null,
            pendingClarify: null,
            pendingSudo: null,
            pendingSecret: null,
            ...(event.sid ? { hermesSessionId: event.sid } : {}),
            ...(payload.usage ? { usage: usageFromPayload(payload.usage) } : {}),
            ...(model ? { model } : {}),
          });
          if (payload.warning) {
            const current = sessionsRef.current.get(tabId);
            updateTabMessages(tabId, (prev) => [
              ...prev,
              {
                id: `warning-${Date.now()}`,
                sessionId: runtimeSid,
                role: "agent",
                content: `Warning: ${payload.warning}`,
                timestamp: Date.now(),
              },
            ]);
            if (!chatVisibleRef.current || tabId !== activeTabIdRef.current) {
              updateTab(tabId, { unreadCount: (current?.unreadCount ?? 0) + 1 });
            }
          }
          break;
        }

        case "tool.start":
          updateTab(tabId, { isLoading: true, toolProgress: payload.name || "Thinking..." });
          if (payload.tool_id) {
            const current = sessionsRef.current.get(tabId);
            updateTabMessages(tabId, (prev) => [
              ...prev,
              {
                id: `tool-start-${payload.tool_id}`,
                sessionId: runtimeSid,
                kind: "tool_call",
                role: "agent",
                callId: payload.tool_id,
                name: payload.name || "Tool",
                args: payload.args
                  ? typeof payload.args === "string"
                    ? payload.args
                    : JSON.stringify(payload.args, null, 2)
                  : "",
              },
            ]);
            if (!chatVisibleRef.current || tabId !== activeTabIdRef.current) {
              updateTab(tabId, { unreadCount: (current?.unreadCount ?? 0) + 1 });
            }
          }
          break;

        case "tool.complete":
          updateTab(tabId, { toolProgress: null });
          if (payload.tool_id) {
            const current = sessionsRef.current.get(tabId);
            let resultText = payload.result_text
              ? typeof payload.result_text === "string"
                ? payload.result_text
                : JSON.stringify(payload.result_text, null, 2)
              : payload.error
                ? payload.error
                : "";
            if (resultText.length > 8000) {
              resultText = resultText.slice(0, 8000) + `\n\n... (${resultText.length} chars total)`;
            }
            updateTabMessages(tabId, (prev) => {
              const idx = prev.findIndex(
                (m) => m.kind === "tool_call" && "callId" in m && m.callId === payload.tool_id,
              );
              if (idx !== -1) {
                const existing = prev[idx] as ToolCallMessage;
                return [
                  ...prev.slice(0, idx),
                  { ...existing, result: resultText, success: payload.success !== false, durationS: payload.duration_s, inlineDiff: payload.inline_diff },
                  ...prev.slice(idx + 1),
                ];
              }
              return [
                ...prev,
                {
                  id: `tool-result-${payload.tool_id}`,
                  sessionId: runtimeSid,
                  kind: "tool_result",
                  role: "agent",
                  callId: payload.tool_id,
                  name: payload.name || "",
                  content: resultText,
                },
              ];
            });
            if (!chatVisibleRef.current || tabId !== activeTabIdRef.current) {
              updateTab(tabId, { unreadCount: (current?.unreadCount ?? 0) + 1 });
            }
          }
          break;

        case "tool.progress":
          updateTab(tabId, { toolProgress: `${payload.name} ${payload.preview || ""}` });
          if (payload.tool_id) {
            updateTabMessages(tabId, (prev) => {
              const idx = prev.findIndex(
                (m) => m.kind === "tool_call" && "callId" in m && m.callId === payload.tool_id,
              );
              if (idx === -1) return prev;
              const existing = prev[idx] as ToolCallMessage;
              return [
                ...prev.slice(0, idx),
                { ...existing, progress: payload.preview || payload.name || "" },
                ...prev.slice(idx + 1),
              ];
            });
          }
          break;

        case "approval.request":
          updateTab(tabId, {
            pendingApproval: {
              command: payload.command || "",
              description: payload.description || "",
              patternKey: payload.pattern_key || "",
              patternKeys: payload.pattern_keys || [],
            },
          });
          break;

        case "clarify.request":
          updateTab(tabId, {
            pendingClarify: {
              requestId: payload.request_id || "",
              question: payload.question || "",
              choices: payload.choices,
            },
          });
          break;

        case "sudo.request":
          updateTab(tabId, {
            pendingSudo: {
              requestId: payload.request_id || "",
            },
          });
          break;

        case "secret.request":
          updateTab(tabId, {
            pendingSecret: {
              requestId: payload.request_id || "",
              envVar: payload.env_var || "",
              prompt: payload.prompt || "",
            },
          });
          break;

        case "error":
          commitStreaming(tabId, runtimeSid);
          updateTabMessages(tabId, (prev) => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              sessionId: runtimeSid,
              role: "agent",
              content: `Error: ${payload.message}`,
              timestamp: Date.now(),
            },
          ]);
          updateTab(tabId, { isLoading: false, toolProgress: null, streamingReasoning: "", pendingSudo: null, pendingSecret: null });
          break;

        case "session.info":
          updateTab(tabId, {
            ...(payload.model ? { model: payload.model } : {}),
            ...(payload.title ? { title: payload.title } : {}),
            ...(payload.model ? { pendingModelSwitch: null } : {}),
          });
          if (payload.model && state?.pendingModelSwitch) {
            const current = sessionsRef.current.get(tabId);
            updateTabMessages(tabId, (prev) => [
              ...prev,
              {
                id: `status-${Date.now()}`,
                kind: "system_status",
                role: "agent",
                tone: "success",
                title: "Model switched",
                content: shortModelName(payload.model),
                timestamp: Date.now(),
              },
            ]);
            if (!chatVisibleRef.current || tabId !== activeTabIdRef.current) {
              updateTab(tabId, { unreadCount: (current?.unreadCount ?? 0) + 1 });
            }
          }
          break;

        case "status.update":
          if (payload.kind === "process" && payload.text) {
            updateTab(tabId, { toolProgress: payload.text });
          }
          if (payload.text && payload.kind !== "process") {
            const current = sessionsRef.current.get(tabId);
            const tone =
              payload.kind === "error"
                ? "error"
                : payload.kind === "warn" || payload.kind === "approval"
                  ? "warning"
                  : "info";
            const title =
              payload.kind === "compressing"
                ? "Compressing session"
                : payload.kind === "goal"
                  ? "Goal update"
                  : "Session update";
            updateTabMessages(tabId, (prev) => [
              ...prev,
              {
                id: `status-${Date.now()}`,
                kind: "system_status",
                role: "agent",
                tone,
                title,
                content: payload.text,
                timestamp: Date.now(),
              },
            ]);
            if (!chatVisibleRef.current || tabId !== activeTabIdRef.current) {
              updateTab(tabId, { unreadCount: (current?.unreadCount ?? 0) + 1 });
            }
          }
          break;

        // ── Reasoning / Thinking ──────────────────────────────────────
        case "thinking.delta":
        case "reasoning.delta": {
          const text = payload.text || "";
          if (text) {
            updateTab(tabId, {
              streamingReasoning: `${state?.streamingReasoning ?? ""}${text}`,
            });
          }
          break;
        }

        // ── Subagent tracking ─────────────────────────────────────────
        case "subagent.start": {
          const agentId = payload.agent_id || `sub-${Date.now()}`;
          updateTabMessages(tabId, (prev) => [
            ...prev,
            {
              id: `subagent-${agentId}`,
              kind: "subagent" as const,
              role: "agent" as const,
              agentId,
              goal: payload.goal || "Subagent task",
              status: "running" as const,
            } satisfies SubagentMessage,
          ]);
          break;
        }

        case "subagent.complete": {
          const agentId = payload.agent_id;
          if (!agentId) break;
          updateTabMessages(tabId, (prev) => {
            const idx = prev.findIndex(
              (m) => m.kind === "subagent" && "agentId" in m && m.agentId === agentId,
            );
            if (idx === -1) return prev;
            const existing = prev[idx] as SubagentMessage;
            return [
              ...prev.slice(0, idx),
              {
                ...existing,
                status: payload.success === false ? ("failed" as const) : ("completed" as const),
                durationS: payload.duration_seconds ?? payload.duration_s,
              },
              ...prev.slice(idx + 1),
            ];
          });
          break;
        }

        case "subagent.progress": {
          const agentId = payload.subagent_id || payload.agent_id;
          if (!agentId) break;
          updateTabMessages(tabId, (prev) => {
            const idx = prev.findIndex(
              (m) => m.kind === "subagent" && "agentId" in m && m.agentId === agentId,
            );
            if (idx === -1) return prev;
            const existing = prev[idx] as SubagentMessage;
            const parts: string[] = [];
            if (payload.iteration != null) parts.push(`#${payload.iteration}`);
            if (payload.tool_name) parts.push(payload.tool_name);
            if (payload.tool_preview) parts.push(payload.tool_preview);
            return [
              ...prev.slice(0, idx),
              { ...existing, progressHint: parts.join(" · ") || undefined },
              ...prev.slice(idx + 1),
            ];
          });
          break;
        }
      }
    });

    return () => {
      for (const timer of flushTimersRef.current.values()) clearTimeout(timer);
      flushTimersRef.current.clear();
      cleanup();
    };
  }, [findTabBySessionId, updateTab, updateTabMessages]);
}
