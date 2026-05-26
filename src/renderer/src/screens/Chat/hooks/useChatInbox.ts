import { useEffect, useRef } from "react";
import type { ChatMessage, ReasoningMessage, SubagentMessage, ToolCallMessage, UsageState } from "../types";
import type { SessionState } from "./useSessionManager";
import { shortModelName } from "../sessionDisplay";
import { createSystemEvent, systemEventFromError } from "../systemEvents";
import {
  normalizeApprovalRequest,
  normalizeClarifyRequest,
  normalizeSecretRequest,
  normalizeSudoRequest,
  normalizeTuiEvent,
  numberField,
  optionalJsonText,
  recordField,
  stringField,
  textFromPayload,
  type NormalizedTuiEvent,
  type RawTuiEvent,
} from "../tuiEvents";

interface UseChatInboxArgs {
  sessions: Map<string, SessionState>;
  activeTabId: string | null;
  chatVisible: boolean;
  findTabBySessionId: (sid: string) => string | null;
  updateTab: (id: string, patch: Partial<SessionState>) => void;
  updateTabMessages: (id: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
}

// const FLUSH_MS = 80;
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

function durationFromPayload(payload: Record<string, unknown>): number | undefined {
  return numberField(payload, "duration_seconds") ?? numberField(payload, "duration_s");
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
  const lastDeltaTimesRef = useRef(new Map<string, number>());

  useEffect(() => {
    sessionsRef.current = sessions;
    activeTabIdRef.current = activeTabId;
    chatVisibleRef.current = chatVisible;
  }, [sessions, activeTabId, chatVisible]);

  useEffect(() => {
    function tabForEvent(event: NormalizedTuiEvent): string | null {
      if (event.sessionId) {
        const existing = findTabBySessionId(event.sessionId);
        if (existing) return existing;
      }
      const active = activeTabIdRef.current;
      if (!active) return null;
      const state = sessionsRef.current.get(active);
      if (!state) return null;
      if (event.sessionId && !state.hermesSessionId && state.isLoading && LIVE_EVENT_TYPES.has(event.type)) {
        updateTab(active, { hermesSessionId: event.sessionId });
        return active;
      }
      if (!event.sessionId) return active;
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

    function scheduleFlush(tabId: string, delayMs = 40): void {
      if (flushTimersRef.current.has(tabId)) return;
      const timer = setTimeout(() => {
        flushTimersRef.current.delete(tabId);
        flush(tabId);
      }, delayMs);
      flushTimersRef.current.set(tabId, timer);
    }

    const cleanup = window.hermesAPI.onTuiEvent((rawEvent: RawTuiEvent) => {
      const event = normalizeTuiEvent(rawEvent);
      const tabId = tabForEvent(event);
      if (!tabId) return;
      const state = sessionsRef.current.get(tabId);
      const runtimeSid = event.sessionId ?? state?.hermesSessionId ?? state?.dbSessionId ?? undefined;
      const payload = event.payload;

      switch (event.type) {
        case "message.start":
          updateTab(tabId, { isLoading: true, toolProgress: null, streamingReasoning: "" });
          lastDeltaTimesRef.current.delete(tabId);
          break;

        case "message.delta": {
          const text = textFromPayload(payload);
          if (text) {
            updateTab(tabId, { isLoading: true });
            pendingChunksRef.current.set(tabId, `${pendingChunksRef.current.get(tabId) ?? ""}${text}`);
            
            const now = Date.now();
            let flushMs = 30;
            const lastTime = lastDeltaTimesRef.current.get(tabId);
            if (lastTime !== undefined) {
              const delta = now - lastTime;
              if (delta < 20) {
                flushMs = 70;
              } else if (delta < 50) {
                flushMs = 40;
              } else {
                flushMs = 20;
              }
            }
            lastDeltaTimesRef.current.set(tabId, now);
            
            scheduleFlush(tabId, flushMs);
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

          const finalText = textFromPayload(payload);
          const reasoningText = stringField(payload, "reasoning", state?.streamingReasoning || "");
          const hadStreaming = !!(state?.streamingText) || !!pendingChunk;
          // Compute fallback text: already-flushed streamingText + unflushed pending chunk
          const fallbackText = `${state?.streamingText ?? ""}${pendingChunk}`;
          const usage = recordField(payload, "usage");
          const model = stringField(usage, "model");
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
            ...(event.sessionId ? { hermesSessionId: event.sessionId } : {}),
            ...(Object.keys(usage).length ? { usage: usageFromPayload(usage) } : {}),
            ...(model ? { model } : {}),
          });
          const warning = stringField(payload, "warning");
          if (warning) {
            const current = sessionsRef.current.get(tabId);
            updateTabMessages(tabId, (prev) => [
              ...prev,
              {
                id: `warning-${Date.now()}`,
                sessionId: runtimeSid,
                role: "agent",
                content: `Warning: ${warning}`,
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
          const toolId = stringField(payload, "tool_id");
          const toolName = stringField(payload, "name", "Tool");
          updateTab(tabId, { isLoading: true, toolProgress: toolName || "Thinking..." });
          if (toolId) {
            const current = sessionsRef.current.get(tabId);
            updateTabMessages(tabId, (prev) => [
              ...prev,
              {
                id: `tool-start-${toolId}`,
                sessionId: runtimeSid,
                kind: "tool_call",
                role: "agent",
                callId: toolId,
                name: toolName,
                args: optionalJsonText(payload.args),
              },
            ]);
            if (!chatVisibleRef.current || tabId !== activeTabIdRef.current) {
              updateTab(tabId, { unreadCount: (current?.unreadCount ?? 0) + 1 });
            }
          }
          break;

        case "tool.complete":
          updateTab(tabId, { toolProgress: null });
          const completeToolId = stringField(payload, "tool_id");
          if (completeToolId) {
            const current = sessionsRef.current.get(tabId);
            let resultText = optionalJsonText(payload.result_text) || stringField(payload, "error");
            if (resultText.length > 8000) {
              resultText = resultText.slice(0, 8000) + `\n\n... (${resultText.length} chars total)`;
            }
            updateTabMessages(tabId, (prev) => {
              const idx = prev.findIndex(
                (m) => m.kind === "tool_call" && "callId" in m && m.callId === completeToolId,
              );
              if (idx !== -1) {
                const existing = prev[idx] as ToolCallMessage;
                return [
                  ...prev.slice(0, idx),
                  {
                    ...existing,
                    result: resultText,
                    success: payload.success !== false,
                    durationS: numberField(payload, "duration_s"),
                    inlineDiff: stringField(payload, "inline_diff") || undefined,
                  },
                  ...prev.slice(idx + 1),
                ];
              }
              return [
                ...prev,
                {
                  id: `tool-result-${completeToolId}`,
                  sessionId: runtimeSid,
                  kind: "tool_result",
                  role: "agent",
                  callId: completeToolId,
                  name: stringField(payload, "name"),
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
          const progressToolId = stringField(payload, "tool_id");
          const progressName = stringField(payload, "name");
          const progressPreview = stringField(payload, "preview");
          updateTab(tabId, { toolProgress: `${progressName} ${progressPreview}`.trim() });
          if (progressToolId) {
            updateTabMessages(tabId, (prev) => {
              const idx = prev.findIndex(
                (m) => m.kind === "tool_call" && "callId" in m && m.callId === progressToolId,
              );
              if (idx === -1) return prev;
              const existing = prev[idx] as ToolCallMessage;
              return [
                ...prev.slice(0, idx),
                { ...existing, progress: progressPreview || progressName },
                ...prev.slice(idx + 1),
              ];
            });
          }
          break;

        case "approval.request":
          updateTab(tabId, {
            pendingApproval: normalizeApprovalRequest(payload),
          });
          break;

        case "clarify.request":
          updateTab(tabId, {
            pendingClarify: normalizeClarifyRequest(payload),
          });
          break;

        case "sudo.request":
          updateTab(tabId, {
            pendingSudo: normalizeSudoRequest(payload),
          });
          break;

        case "secret.request":
          updateTab(tabId, {
            pendingSecret: normalizeSecretRequest(payload),
          });
          break;

        case "error":
          commitStreaming(tabId, runtimeSid);
          const errorMessage = stringField(payload, "message");
          updateTabMessages(tabId, (prev) => [
            ...prev,
            { ...systemEventFromError(errorMessage), sessionId: runtimeSid },
          ]);
          updateTab(tabId, { isLoading: false, toolProgress: null, streamingReasoning: "", pendingSudo: null, pendingSecret: null });
          break;

        case "session.info":
          const sessionModel = stringField(payload, "model");
          const sessionTitle = stringField(payload, "title");
          updateTab(tabId, {
            ...(sessionModel ? { model: sessionModel } : {}),
            ...(sessionTitle ? { title: sessionTitle } : {}),
            ...(sessionModel ? { pendingModelSwitch: null } : {}),
          });
          if (sessionModel && state?.pendingModelSwitch) {
            const current = sessionsRef.current.get(tabId);
            updateTabMessages(tabId, (prev) => [
              ...prev,
              {
                ...createSystemEvent("model_switch", "Model switched", shortModelName(sessionModel)),
              },
            ]);
            if (!chatVisibleRef.current || tabId !== activeTabIdRef.current) {
              updateTab(tabId, { unreadCount: (current?.unreadCount ?? 0) + 1 });
            }
          }
          break;

        case "status.update":
          const statusKind = stringField(payload, "kind");
          const statusText = stringField(payload, "text");
          if (statusKind === "process" && statusText) {
            updateTab(tabId, { toolProgress: statusText });
          }
          if (statusText && statusKind !== "process") {
            const current = sessionsRef.current.get(tabId);
            const tone =
              statusKind === "error"
                ? "error"
                : statusKind === "warn" || statusKind === "approval"
                  ? "warning"
                  : "info";
            const title =
              statusKind === "compressing"
                ? "Compressing session"
                : statusKind === "goal"
                  ? "Goal update"
                  : "Session update";
            const systemEvent =
              statusKind === "compressing"
                ? createSystemEvent("context_compress", title, statusText, { tone })
                : statusKind === "error"
                  ? systemEventFromError(statusText)
                  : null;
            updateTabMessages(tabId, (prev) => [
              ...prev,
              systemEvent ?? {
                id: `status-${Date.now()}`,
                kind: "system_status",
                role: "agent",
                tone,
                title,
                content: statusText,
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
          const text = textFromPayload(payload);
          if (text) {
            updateTab(tabId, {
              streamingReasoning: `${state?.streamingReasoning ?? ""}${text}`,
            });
          }
          break;
        }

        // ── Subagent tracking ─────────────────────────────────────────
        case "subagent.start": {
          const agentId = stringField(payload, "agent_id", `sub-${Date.now()}`);
          updateTabMessages(tabId, (prev) => [
            ...prev,
            {
              id: `subagent-${agentId}`,
              kind: "subagent" as const,
              role: "agent" as const,
              agentId,
              goal: stringField(payload, "goal", "Subagent task"),
              status: "running" as const,
            } satisfies SubagentMessage,
          ]);
          break;
        }

        case "subagent.complete": {
          const agentId = stringField(payload, "agent_id");
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
                durationS: durationFromPayload(payload),
              },
              ...prev.slice(idx + 1),
            ];
          });
          break;
        }

        case "subagent.progress": {
          const agentId = stringField(payload, "subagent_id") || stringField(payload, "agent_id");
          if (!agentId) break;
          updateTabMessages(tabId, (prev) => {
            const idx = prev.findIndex(
              (m) => m.kind === "subagent" && "agentId" in m && m.agentId === agentId,
            );
            if (idx === -1) return prev;
            const existing = prev[idx] as SubagentMessage;
            const parts: string[] = [];
            if (payload.iteration != null) parts.push(`#${String(payload.iteration)}`);
            const subToolName = stringField(payload, "tool_name");
            const subToolPreview = stringField(payload, "tool_preview");
            if (subToolName) parts.push(subToolName);
            if (subToolPreview) parts.push(subToolPreview);
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
