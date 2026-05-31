import {
  onTuiEvent,
  tuiSessionActiveList,
  tuiSessionStatus,
} from "@renderer/lib/hermes-tauri";
import { useEffect, useRef } from "react";
import type {
  ChatBubbleMessage,
  ChatMessage,
  ReasoningMessage,
  SubagentMessage,
  ToolCallMessage,
  UsageState,
  TodoItem,
} from "../types";
import type { SessionState } from "./useSessionManager";
import { shortModelName } from "../sessionDisplay";
import { createSystemEvent, systemEventFromError } from "../systemEvents";
import { rewriteTranscript } from "../renderTranscript";
import { getStoreItem } from "@renderer/utils/store";
import {
  classifyEvent,
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

function isTodoStatus(status: unknown): status is TodoItem["status"] {
  return (
    status === "pending" ||
    status === "in_progress" ||
    status === "completed" ||
    status === "cancelled"
  );
}

function parseTodos(value: unknown): TodoItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const status = row.status;
      if (!isTodoStatus(status)) return null;
      return {
        content: String(row.content ?? "").trim(),
        id: String(row.id ?? "").trim(),
        status,
      };
    })
    .filter((item): item is TodoItem => !!(item && item.id && item.content));
}

interface UseChatInboxArgs {
  sessions: Map<string, SessionState>;
  activeTabId: string | null;
  chatVisible: boolean;
  findTabBySessionId: (sid: string) => string | null;
  updateTab: (id: string, patch: Partial<SessionState>) => void;
  updateTabMessages: (
    id: string,
    updater: (prev: ChatMessage[]) => ChatMessage[],
  ) => void;
}

const LIVE_EVENT_TYPES = new Set([
  "message.start",
  "message.delta",
  "tool.start",
  "thinking.delta",
  "reasoning.delta",
  "tool.generating",
]);

type ProbeStatus = "running" | "idle" | "error" | "unknown";

function activeListSessions(res: unknown): any[] {
  if (!res || typeof res !== "object") return [];
  const record = res as Record<string, any>;
  const direct = record.sessions;
  if (Array.isArray(direct)) return direct;
  const nested = record.result?.sessions;
  return Array.isArray(nested) ? nested : [];
}

function sessionMatches(row: any, sid: string): boolean {
  if (!row || typeof row !== "object") return false;
  return row.id === sid || row.session_id === sid || row.session_key === sid;
}

function probeStatusForSession(res: unknown, sid: string): ProbeStatus {
  const rows = activeListSessions(res);
  const match = rows.find((row) => sessionMatches(row, sid));
  if (!match) return rows.length > 0 ? "idle" : "unknown";
  if (match.running === true || match.busy === true) return "running";
  const status = String(match.status ?? "").toLowerCase();
  if (status === "working" || status === "starting" || status === "running") {
    return "running";
  }
  if (status === "error" || status === "failed") return "error";
  if (status === "idle" || status === "ready" || status === "complete") {
    return "idle";
  }
  return "unknown";
}

function probeStatusFromTextStatus(res: unknown): ProbeStatus {
  if (!res || typeof res !== "object") return "unknown";
  const output = String(
    ((res as Record<string, any>).output ??
      (res as Record<string, any>).result?.output ??
      ""),
  );
  if (/Agent Running:\s*No/i.test(output)) return "idle";
  if (/Agent Running:\s*Yes/i.test(output)) return "running";
  return "unknown";
}

function isAnalyzingProgress(progress: string | null | undefined): boolean {
  return !!progress && /analyzing tool output/i.test(progress);
}

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

function durationFromPayload(
  payload: Record<string, unknown>,
): number | undefined {
  return (
    numberField(payload, "duration_seconds") ??
    numberField(payload, "duration_s")
  );
}

function isPlainAssistantBubble(
  message: ChatMessage | undefined,
): message is ChatBubbleMessage & { role: "agent" } {
  if (
    !message ||
    message.role !== "agent" ||
    !("content" in message) ||
    typeof message.content !== "string"
  ) {
    return false;
  }
  const kind = (message as { kind?: string }).kind;
  return !kind || kind === "assistant";
}

function appendStreaming(
  prev: ChatMessage[],
  text: string,
  sessionId?: string,
): ChatMessage[] {
  if (!text) return prev;
  const last = prev[prev.length - 1];
  if (isPlainAssistantBubble(last)) {
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
  const flushFramesRef = useRef(new Map<string, unknown>());
  const turnCompletedRef = useRef(new Map<string, boolean>());
  const flushedTextRef = useRef(new Map<string, string>());
  const stuckTimerRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const silentTimerRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const analyzingTimerRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const deltaIdleRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  function resetTurn(tabId: string): void {
    turnCompletedRef.current.delete(tabId);
    pendingChunksRef.current.delete(tabId);
    flushFramesRef.current.delete(tabId);
    flushedTextRef.current.delete(tabId);
    const timer = stuckTimerRef.current.get(tabId);
    if (timer) {
      clearTimeout(timer);
      stuckTimerRef.current.delete(tabId);
    }
    clearSilentTimer(tabId);
    clearAnalyzingTimer(tabId);
    clearDeltaIdle(tabId);
  }

  function clearStuckTimer(tabId: string): void {
    const timer = stuckTimerRef.current.get(tabId);
    if (timer) {
      clearTimeout(timer);
      stuckTimerRef.current.delete(tabId);
    }
  }

  function clearSilentTimer(tabId: string): void {
    const timer = silentTimerRef.current.get(tabId);
    if (timer) {
      clearTimeout(timer);
      silentTimerRef.current.delete(tabId);
    }
  }

  function clearAnalyzingTimer(tabId: string): void {
    const timer = analyzingTimerRef.current.get(tabId);
    if (timer) {
      clearTimeout(timer);
      analyzingTimerRef.current.delete(tabId);
    }
  }

  const STUCK_INITIAL_MS = 3_000;
  const STUCK_INTERVAL_MS = 3_000;
  const STUCK_MAX_ATTEMPTS = 5;
  const SILENT_TIMEOUT_MS = 15_000;
  const ANALYZING_TIMEOUT_MS = 15_000;
  const DELTA_IDLE_TIMEOUT_MS = 10_000;
  const stuckStartRef = useRef<Map<string, number>>(new Map());

  function clearDeltaIdle(tabId: string): void {
    const timer = deltaIdleRef.current.get(tabId);
    if (timer) {
      clearTimeout(timer);
      deltaIdleRef.current.delete(tabId);
    }
  }

  function scheduleDeltaIdle(tabId: string, sid?: string): void {
    clearDeltaIdle(tabId);
    deltaIdleRef.current.set(tabId, setTimeout(() => {
      deltaIdleRef.current.delete(tabId);
      const current = sessionsRef.current.get(tabId);
      if (!current?.isLoading) return;
      commitStreaming(tabId, sid);
      updateTab(tabId, { isLoading: false, toolProgress: null });
    }, DELTA_IDLE_TIMEOUT_MS));
  }

  function finalizeStuckTurn(tabId: string, sid?: string, showWarning = true): void {
    const current = sessionsRef.current.get(tabId);
    if (!current?.isLoading && !current?.toolProgress) return;
    const pending = pendingChunksRef.current.get(tabId) ?? "";
    const flushed = flushedTextRef.current.get(tabId) ?? "";
    const text = `${flushed}${pending}` || current.streamingText || "";
    const reasoning = current.streamingReasoning || "";
    pendingChunksRef.current.delete(tabId);
    flushedTextRef.current.delete(tabId);
    turnCompletedRef.current.set(tabId, true);
    clearStuckTimer(tabId);
    clearSilentTimer(tabId);
    clearAnalyzingTimer(tabId);
    updateTab(tabId, {
      isLoading: false,
      toolProgress: null,
      streamingText: "",
      streamingReasoning: "",
      pendingApproval: null,
      pendingClarify: null,
      pendingSudo: null,
      pendingSecret: null,
      pendingModelSwitch: null,
      pendingModelSwitchMessageId: null,
    });
    if (text || reasoning) {
      updateTabMessages(tabId, (prev) => {
        const next: ChatMessage[] = [...prev];
        if (reasoning) {
          next.push({
            id: `reasoning-stuck-${Date.now()}`,
            kind: "reasoning",
            role: "agent",
            text: reasoning,
          } satisfies ReasoningMessage);
        }
        if (text) {
          next.push({
            id: `agent-stuck-${Date.now()}`,
            sessionId: sid,
            role: "agent",
            content: text,
            timestamp: Date.now(),
          });
        }
        return next;
      });
    }
    if (showWarning) {
      updateTabMessages(tabId, (prev) => [
        ...prev,
        {
          id: `stuck-warn-${Date.now()}`,
          sessionId: sid,
          role: "agent",
          kind: "system_status" as const,
          tone: "warning" as const,
          title: "Response timed out",
          content: "The agent did not finish responding. You can send a new message to continue.",
          timestamp: Date.now(),
        },
      ]);
    }
  }

  function probeAgentHealth(tabId: string, sid: string, attempt: number): void {
    const session = sessionsRef.current.get(tabId);
    if (!session?.isLoading) return;
    if (attempt > STUCK_MAX_ATTEMPTS) {
      finalizeStuckTurn(tabId, sid, true);
      return;
    }
    tuiSessionActiveList(sid).then((res: any) => {
      const current = sessionsRef.current.get(tabId);
      if (!current?.isLoading) return;
      const probeStatus = probeStatusForSession(res, sid);
      if (probeStatus === "unknown") {
        tuiSessionStatus(sid)
          .then((statusRes: any) => {
            const currentAfterStatus = sessionsRef.current.get(tabId);
            if (!currentAfterStatus?.isLoading) return;
            const textStatus = probeStatusFromTextStatus(statusRes);
            if (textStatus === "idle") {
              finalizeStuckTurn(tabId, sid, false);
              return;
            }
            if (textStatus === "error") {
              finalizeStuckTurn(tabId, sid, true);
              return;
            }
            stuckTimerRef.current.set(tabId, setTimeout(() => {
              stuckTimerRef.current.delete(tabId);
              probeAgentHealth(
                tabId,
                sid,
                textStatus === "running" ? attempt : attempt + 1,
              );
            }, STUCK_INTERVAL_MS));
          })
          .catch(() => {
            stuckTimerRef.current.set(tabId, setTimeout(() => {
              stuckTimerRef.current.delete(tabId);
              probeAgentHealth(tabId, sid, attempt + 1);
            }, STUCK_INTERVAL_MS));
          });
        return;
      }
      if (probeStatus === "running") {
        stuckTimerRef.current.set(tabId, setTimeout(() => {
          stuckTimerRef.current.delete(tabId);
          probeAgentHealth(tabId, sid, attempt);
        }, STUCK_INTERVAL_MS));
      } else {
        // If not running, it either finished normally or failed.
        // Trust the status: if it's idle/ready, it's a normal completion that missed message.complete.
        // Only warn if status is explicitly failed/error.
        const isError = probeStatus === "error";
        finalizeStuckTurn(tabId, sid, isError);
      }
    }).catch(() => {
      finalizeStuckTurn(tabId, sid, true);
    });
  }

  function scheduleStuckProbe(tabId: string, sid?: string): void {
    scheduleSilentWatchdog(tabId, sid);
    clearStuckTimer(tabId);
    stuckStartRef.current.set(tabId, Date.now());
    stuckTimerRef.current.set(tabId, setTimeout(() => {
      stuckTimerRef.current.delete(tabId);
      if (sid) {
        probeAgentHealth(tabId, sid, 1);
      } else {
        finalizeStuckTurn(tabId);
      }
    }, STUCK_INITIAL_MS));
  }

  function scheduleSilentWatchdog(tabId: string, sid?: string): void {
    clearSilentTimer(tabId);
    silentTimerRef.current.set(tabId, setTimeout(() => {
      silentTimerRef.current.delete(tabId);
      finalizeStuckTurn(tabId, sid, true);
    }, SILENT_TIMEOUT_MS));
  }

  function scheduleAnalyzingTimeout(tabId: string, sid?: string): void {
    clearAnalyzingTimer(tabId);
    analyzingTimerRef.current.set(tabId, setTimeout(() => {
      analyzingTimerRef.current.delete(tabId);
      finalizeStuckTurn(tabId, sid, false);
    }, ANALYZING_TIMEOUT_MS));
  }

  function clearPendingInteraction(tabId: string): void {
    updateTab(tabId, {
      pendingApproval: null,
      pendingClarify: null,
      pendingSudo: null,
      pendingSecret: null,
    });
  }

  useEffect(() => {
    sessionsRef.current = sessions;
    activeTabIdRef.current = activeTabId;
    chatVisibleRef.current = chatVisible;
    const activeIds = new Set(sessions.keys());
    for (const [tabId, state] of sessions.entries()) {
      const sid = state.hermesSessionId ?? state.dbSessionId ?? undefined;
      if (state.isLoading) {
        if (!silentTimerRef.current.has(tabId)) {
          scheduleSilentWatchdog(tabId, sid);
        }
      } else {
        clearSilentTimer(tabId);
      }
      if (isAnalyzingProgress(state.toolProgress)) {
        if (!analyzingTimerRef.current.has(tabId)) {
          scheduleAnalyzingTimeout(tabId, sid);
        }
      } else {
        clearAnalyzingTimer(tabId);
      }
    }
    for (const tabId of silentTimerRef.current.keys()) {
      if (!activeIds.has(tabId)) clearSilentTimer(tabId);
    }
    for (const tabId of analyzingTimerRef.current.keys()) {
      if (!activeIds.has(tabId)) clearAnalyzingTimer(tabId);
    }
  }, [sessions, activeTabId, chatVisible]);

  useEffect(() => {
    function tabForEvent(event: NormalizedTuiEvent): string | null {
      // 1. Event carries a session id — try to find matching tab
      if (event.sessionId) {
        const matched = findTabBySessionId(event.sessionId);
        if (matched) return matched;
        // Adopt session id into active tab only if it has no session id yet
        // and the event is a live event type (message.start, message.delta, etc.)
        const active = activeTabIdRef.current;
        if (
          LIVE_EVENT_TYPES.has(event.type) &&
          active &&
          !sessionsRef.current.get(active)?.hermesSessionId &&
          !sessionsRef.current.get(active)?.dbSessionId
        ) {
          updateTab(active, { hermesSessionId: event.sessionId });
          return active;
        }
        // Session id matches no tab — drop the event
        return null;
      }

      // 2. Events without session id: only route to active tab for safe events
      const classification = classifyEvent(event.type);
      if (classification.category === "additive" && !classification.safeAfterAbort) {
        return null;
      }

      const active = activeTabIdRef.current;
      return active;
    }

    function commitStreaming(tabId: string, sid?: string): void {
      // Force-flush any pending chunks that haven't been flushed yet.
      // Without this, a message.delta followed immediately by tool.start
      // in the same microtask loses the text.
      const pendingFrame = flushFramesRef.current.get(tabId);
      if (pendingFrame) {
        flushFramesRef.current.delete(tabId);
      }
      const pendingChunk = pendingChunksRef.current.get(tabId) ?? "";
      if (pendingChunk) {
        pendingChunksRef.current.delete(tabId);
      }

      const flushedText = flushedTextRef.current.get(tabId) ?? "";
      flushedTextRef.current.delete(tabId);
      const state = sessionsRef.current.get(tabId);
      const text = `${flushedText}${pendingChunk}` || state?.streamingText || "";
      const reasoning = state?.streamingReasoning ?? "";

      if (!text && !reasoning) return;

      updateTab(tabId, { streamingText: "", streamingReasoning: "" });

      updateTabMessages(tabId, (prev) => {
        let next = [...prev];
        if (reasoning) {
          next.push({
            id: `reasoning-${Date.now()}`,
            kind: "reasoning",
            role: "agent",
            text: reasoning,
          });
        }
        if (text) {
          next = appendStreaming(next, text, sid);
        }
        return next;
      });

      if (!chatVisibleRef.current || tabId !== activeTabIdRef.current) {
        updateTab(tabId, { unreadCount: (state?.unreadCount ?? 0) + 1 });
      }
    }

    function flush(tabId: string): void {
      flushFramesRef.current.delete(tabId);
      const batch = pendingChunksRef.current.get(tabId) ?? "";
      pendingChunksRef.current.delete(tabId);
      if (!batch) return;
      const total = (flushedTextRef.current.get(tabId) ?? "") + batch;
      flushedTextRef.current.set(tabId, total);
      const state = sessionsRef.current.get(tabId);
      updateTab(tabId, {
        streamingText: total,
        ...(!chatVisibleRef.current || tabId !== activeTabIdRef.current
          ? { unreadCount: Math.max(1, state?.unreadCount ?? 0) }
          : {}),
      });
    }

    function scheduleFlush(tabId: string): void {
      // Use microtask instead of rAF for lower-latency streaming.
      // rAF (16ms cadence) causes visible character drops — deltas that
      // arrive within the same frame are buffered and only appear after
      // message.complete triggers a full re-render.  Microtasks fire as
      // soon as the current JS execution context clears, giving
      // sub-millisecond flush latency without thrashing the DOM.
      if (flushFramesRef.current.has(tabId)) return;
      const marker: unique symbol = Symbol("flush") as any;
      flushFramesRef.current.set(tabId, marker as any);
      void Promise.resolve().then(() => {
        if (flushFramesRef.current.get(tabId) === marker) {
          flushFramesRef.current.delete(tabId);
          flush(tabId);
        }
      });
    }

    const processEvent = (event: NormalizedTuiEvent): void => {
      const tabId = tabForEvent(event);
      if (!tabId) return;
      const state = sessionsRef.current.get(tabId);

      const runtimeSid =
        event.sessionId ??
        state?.hermesSessionId ??
        state?.dbSessionId ??
        undefined;
      const payload = event.payload;

      if (state?.abortRequested) {
        const cls = classifyEvent(event.type);
        if (!cls.safeAfterAbort) return;
        if (event.type === "message.complete") {
          updateTab(tabId, { abortRequested: false, isLoading: false });
          return;
        }
        if (event.type === "error") {
          updateTab(tabId, {
            abortRequested: false,
            isLoading: false,
            toolProgress: null,
          });
        }
      }

      switch (event.type) {
        case "message.start":
          resetTurn(tabId);
          updateTab(tabId, {
            isLoading: true,
            toolProgress: null,
            streamingReasoning: "",
            todos: [],
          });
          scheduleStuckProbe(tabId, runtimeSid);
          break;

        case "tool.generating": {
          const genName = stringField(payload, "name");
          if (genName) {
            updateTab(tabId, { toolProgress: `drafting ${genName}…` });
          }
          scheduleStuckProbe(tabId, runtimeSid);
          break;
        }

        case "message.delta": {
          const text = textFromPayload(payload);
          if (text) {
            updateTab(tabId, { isLoading: true, toolProgress: null });
            pendingChunksRef.current.set(
              tabId,
              `${pendingChunksRef.current.get(tabId) ?? ""}${text}`,
            );
            scheduleFlush(tabId);
            scheduleStuckProbe(tabId, runtimeSid);
            scheduleDeltaIdle(tabId, runtimeSid);
          }
          break;
        }

        case "message.complete": {
          clearStuckTimer(tabId);
          clearSilentTimer(tabId);
          clearAnalyzingTimer(tabId);
          clearDeltaIdle(tabId);
          stuckStartRef.current.delete(tabId);
          if (turnCompletedRef.current.get(tabId)) {
            updateTab(tabId, { isLoading: false, toolProgress: null });
            break;
          }
          turnCompletedRef.current.set(tabId, true);
          const frame = flushFramesRef.current.get(tabId);
          if (frame) {
            flushFramesRef.current.delete(tabId);
          }
          // Capture any unflushed chunks before discarding
          const pendingChunk = pendingChunksRef.current.get(tabId) ?? "";
          pendingChunksRef.current.delete(tabId);

          const finalText = textFromPayload(payload);
          const reasoningText = stringField(
            payload,
            "reasoning",
            state?.streamingReasoning || "",
          );
          const flushedText = flushedTextRef.current.get(tabId) ?? "";
          flushedTextRef.current.delete(tabId);
          const visibleStreamingText = state?.streamingText || "";
          const hadStreaming = !!flushedText || !!pendingChunk || !!visibleStreamingText;
          const fallbackText = `${flushedText}${pendingChunk}` || visibleStreamingText;
          const usage = recordField(payload, "usage");
          const model = stringField(usage, "model");
          updateTab(tabId, { streamingText: "", streamingReasoning: "" });

          const currentTodos = state?.todos || [];

          // Single updateTabMessages: append reasoning → content for the current live turn.
          // Live deltas render from `streamingText`, so completion should not mutate
          // the previous agent/tool/system row. Mutating the last role=agent row makes
          // consecutive turns attach reasoning to the wrong message and can render the
          // final answer inside tool/status chrome until the DB history is reloaded.
          updateTabMessages(tabId, (prev) => {
            const next: ChatMessage[] = [...prev];
            if (reasoningText) {
              next.push({
                id: `reasoning-${Date.now()}`,
                kind: "reasoning",
                role: "agent",
                text: reasoningText,
              } satisfies ReasoningMessage);
            }
            const text = finalText || (hadStreaming ? fallbackText : "");
            if (text) {
              next.push({
                id: `agent-${Date.now()}`,
                sessionId: runtimeSid,
                role: "agent",
                content: text,
                timestamp: Date.now(),
                ...(model ? { model } : {}),
              });
            }
            if (currentTodos.length > 0) {
              next.push({
                id: `todo-archive-${Date.now()}`,
                kind: "todo",
                role: "system",
                todos: currentTodos,
                timestamp: Date.now(),
              });
            }
            if (getStoreItem("hermes-rewrite-enabled") === "true") {
              return rewriteTranscript(next);
            }
            return next;
          });
          const sidPatch: Record<string, unknown> = {};
          if (event.sessionId) {
            sidPatch.hermesSessionId = event.sessionId;
            if (state && !state.relatedSessionIds.includes(event.sessionId)) {
              sidPatch.relatedSessionIds = [...state.relatedSessionIds, event.sessionId];
            }
          }
          updateTab(tabId, {
            isLoading: false,
            toolProgress: null,
            todos: [],
            ...sidPatch,
            ...(Object.keys(usage).length
              ? { usage: usageFromPayload(usage) }
              : {}),
            ...(model ? { model } : {}),
          });
          clearPendingInteraction(tabId);
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
              updateTab(tabId, {
                unreadCount: (current?.unreadCount ?? 0) + 1,
              });
            }
          }
          break;
        }

        case "tool.start":
          clearStuckTimer(tabId);
          clearDeltaIdle(tabId);
          commitStreaming(tabId, runtimeSid);
          const toolId = stringField(payload, "tool_id");
          const toolName = stringField(payload, "name", "Tool");
          const startTodos = payload.todos;
          updateTab(tabId, {
            isLoading: true,
            toolProgress: toolName || "Thinking...",
            ...(startTodos !== undefined ? { todos: parseTodos(startTodos) } : {}),
          });
          // Tool execution can hang — set a safety probe
          scheduleStuckProbe(tabId, runtimeSid);
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
                args: optionalJsonText(payload.args) || stringField(payload, "args_text"),
                context: stringField(payload, "context") || undefined,
              },
            ]);
            if (!chatVisibleRef.current || tabId !== activeTabIdRef.current) {
              updateTab(tabId, {
                unreadCount: (current?.unreadCount ?? 0) + 1,
              });
            }
          }
          break;

        case "tool.complete":
          const completeTodos = payload.todos;
          updateTab(tabId, {
            toolProgress: "analyzing tool output…",
            ...(completeTodos !== undefined ? { todos: parseTodos(completeTodos) } : {}),
          });
          scheduleStuckProbe(tabId, runtimeSid);
          scheduleAnalyzingTimeout(tabId, runtimeSid);
          const completeToolId = stringField(payload, "tool_id");
          if (completeToolId) {
            const current = sessionsRef.current.get(tabId);
            let resultText =
              optionalJsonText(payload.result_text) ||
              stringField(payload, "summary") ||
              stringField(payload, "error");
            if (resultText.length > 8000) {
              resultText =
                resultText.slice(0, 8000) +
                `\n\n... (${resultText.length} chars total)`;
            }
            updateTabMessages(tabId, (prev) => {
              const idx = prev.findIndex(
                (m) =>
                  m.kind === "tool_call" &&
                  "callId" in m &&
                  m.callId === completeToolId,
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
                    inlineDiff:
                      stringField(payload, "inline_diff") || undefined,
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
              updateTab(tabId, {
                unreadCount: (current?.unreadCount ?? 0) + 1,
              });
            }
          }
          break;

        case "tool.progress":
          const progressToolId = stringField(payload, "tool_id");
          const progressName = stringField(payload, "name");
          const progressPreview = stringField(payload, "preview");
          updateTab(tabId, {
            toolProgress: `${progressName} ${progressPreview}`.trim(),
          });
          scheduleStuckProbe(tabId, runtimeSid);
          if (progressToolId) {
            updateTabMessages(tabId, (prev) => {
              const idx = prev.findIndex(
                (m) =>
                  m.kind === "tool_call" &&
                  "callId" in m &&
                  m.callId === progressToolId,
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
          clearDeltaIdle(tabId);
          resetTurn(tabId);
          const errorMessage = stringField(payload, "message");
          updateTabMessages(tabId, (prev) => [
            ...prev,
            { ...systemEventFromError(errorMessage), sessionId: runtimeSid },
          ]);
          updateTab(tabId, {
            isLoading: false,
            toolProgress: null,
            streamingReasoning: "",
          });
          clearPendingInteraction(tabId);
          break;

        case "session.info":
          const sessionModel = stringField(payload, "model");
          const sessionTitle = stringField(payload, "title");
          updateTab(tabId, {
            ...(sessionModel ? { model: sessionModel } : {}),
            ...(sessionTitle ? { title: sessionTitle } : {}),
            ...(sessionModel ? { pendingModelSwitch: null, pendingModelSwitchMessageId: null } : {}),
          });
          if (sessionModel && state?.pendingModelSwitch) {
            const current = sessionsRef.current.get(tabId);
            const switchMsgId = state?.pendingModelSwitchMessageId;
            updateTabMessages(tabId, (prev) => {
              const idx = prev.findIndex((m) => m.id === switchMsgId);
              if (idx !== -1) {
                const next = [...prev];
                next[idx] = {
                  ...next[idx],
                  tone: "success",
                  title: "Model switched",
                  content: shortModelName(sessionModel),
                } as any;
                return next;
              }
              return [
                ...prev,
                {
                  ...createSystemEvent(
                    "model_switch",
                    "Model switched",
                    shortModelName(sessionModel),
                    { tone: "success" }
                  ),
                },
              ];
            });
            if (!chatVisibleRef.current || tabId !== activeTabIdRef.current) {
              updateTab(tabId, {
                unreadCount: (current?.unreadCount ?? 0) + 1,
              });
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
                ? formatCompressingTitle(statusText)
                : statusKind === "goal"
                  ? "Goal update"
                  : "Session update";
            const systemEvent =
              statusKind === "compressing"
                ? createSystemEvent("context_compress", title, statusText, {
                    tone,
                  })
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
              updateTab(tabId, {
                unreadCount: (current?.unreadCount ?? 0) + 1,
              });
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
          scheduleStuckProbe(tabId, runtimeSid);
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
          scheduleStuckProbe(tabId, runtimeSid);
          break;
        }

        case "subagent.complete": {
          const agentId = stringField(payload, "agent_id");
          if (!agentId) break;
          updateTabMessages(tabId, (prev) => {
            const idx = prev.findIndex(
              (m) =>
                m.kind === "subagent" &&
                "agentId" in m &&
                m.agentId === agentId,
            );
            if (idx === -1) return prev;
            const existing = prev[idx] as SubagentMessage;
            return [
              ...prev.slice(0, idx),
              {
                ...existing,
                status:
                  payload.success === false
                    ? ("failed" as const)
                    : ("completed" as const),
                durationS: durationFromPayload(payload),
              },
              ...prev.slice(idx + 1),
            ];
          });
          scheduleStuckProbe(tabId, runtimeSid);
          break;
        }

        case "subagent.progress": {
          const agentId =
            stringField(payload, "subagent_id") ||
            stringField(payload, "agent_id");
          if (!agentId) break;
          updateTabMessages(tabId, (prev) => {
            const idx = prev.findIndex(
              (m) =>
                m.kind === "subagent" &&
                "agentId" in m &&
                m.agentId === agentId,
            );
            if (idx === -1) return prev;
            const existing = prev[idx] as SubagentMessage;
            const parts: string[] = [];
            if (payload.iteration != null)
              parts.push(`#${String(payload.iteration)}`);
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
          scheduleStuckProbe(tabId, runtimeSid);
          break;
        }
      }
    }

    // Always subscribe to Tauri events as the reliable baseline.
    // The WS client may not be connected (stdio mode, gateway not ready),
    // so falling back to Tauri only when `gatewayClient` is falsy breaks
    // event delivery.  WS is used for sending commands (interrupt, steer),
    // but event listening goes through the always-available Tauri bridge.
    const unsubscribe = onTuiEvent((rawEvent: RawTuiEvent) => {
      processEvent(normalizeTuiEvent(rawEvent));
    });

    return () => {
      flushFramesRef.current.clear();
      flushedTextRef.current.clear();
      for (const timer of stuckTimerRef.current.values()) clearTimeout(timer);
      stuckTimerRef.current.clear();
      for (const timer of silentTimerRef.current.values()) clearTimeout(timer);
      silentTimerRef.current.clear();
      for (const timer of analyzingTimerRef.current.values()) clearTimeout(timer);
      analyzingTimerRef.current.clear();
      for (const timer of deltaIdleRef.current.values()) clearTimeout(timer);
      deltaIdleRef.current.clear();
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [findTabBySessionId, updateTab, updateTabMessages]);
}

function formatCompressingTitle(statusText: string): string {
  const textLower = statusText.toLowerCase();
  const isCompleted = textLower.includes("compressed") || textLower.includes("compacted");

  const rangeMatch = statusText.match(/(?:~)?([\d,]+)\s*(?:➜|->)\s*(?:~)?([\d,]+)/);
  if (rangeMatch) {
    return `Session compressed (${rangeMatch[1]} ➜ ${rangeMatch[2]} tok)`;
  }

  const singleMatch = statusText.match(/~(\d[\d,]*)\s*(?:tokens|tok|t)?/i);
  if (singleMatch) {
    return isCompleted
      ? `Session compressed (~${singleMatch[1]} tok)`
      : `Compacting session (~${singleMatch[1]} tok)`;
  }

  return isCompleted ? "Session compressed" : "Compacting session";
}
