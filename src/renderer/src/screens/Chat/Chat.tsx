import {
  abortChat,
  clearStagedAttachments,
  copyToClipboard,
  deleteSession,
  getSessionMessages,
  getSessionMessagesBefore,
  isRemoteMode,
  onContextMenuCopyChat,
  onContextMenuSelectBubble,
  selectFolder,
} from "@renderer/lib/hermes-tauri";
import { getStoreItem, setStoreItem } from "@renderer/utils/store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { ChatHeader } from "./ChatHeader";
import { ChatEmptyState } from "./ChatEmptyState";
import { MessageList } from "./MessageList";
import { TodoPanel } from "../../components/common/TodoPanel";
import { ApprovalHistoryPanel } from "./ApprovalHistoryPanel";
import { ApprovalModal } from "./ApprovalModal";
import { InteractionCenter } from "./InteractionCenter";
import { ModelPicker } from "./ModelPicker";
import { ChatStatusBar } from "./ChatStatusBar";
import { useChatScroll } from "./hooks/useChatScroll";
import { useChatActions } from "./hooks/useChatActions";
import { useModelConfig } from "./hooks/useModelConfig";
import { useFastMode } from "./hooks/useFastMode";
import { useLocalCommands } from "./hooks/useLocalCommands";
import { useSessionLifecycle } from "./hooks/useSessionLifecycle";
import { useI18n } from "../../components/useI18n";
import { buildChatTranscript } from "./transcriptUtils";
import { shortModelName } from "./sessionDisplay";
import { createSystemEvent, systemEventFromError } from "./systemEvents";
import { createTauriChatGatewayClient } from "./tauriChatGatewayClient";
import {
  DEFAULT_JUDGMENT_SETTINGS,
  createRuleBasedJudgmentEngine,
  type JudgmentAdvice,
} from "./judgmentEngine";
import {
  createApprovalHistoryEntry,
  getImmediateApprovalDecision,
  loadApprovalHistory,
  loadApprovalPolicy,
  normalizeApprovalPolicy,
  pruneApprovalHistory,
  saveApprovalHistory,
  saveApprovalPolicy,
  type ApprovalDecision,
  type ApprovalDecisionSource,
  type ApprovalPolicy,
} from "./approvalPolicy";
import type { ChatMessage } from "./types";

export type { ChatMessage } from "./types";

interface ChatProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  sessionId: string | null;
  dbSessionId?: string | null;
  relatedSessionIds?: string[];
  sessionTitle?: string;
  isLoading?: boolean;
  streamingText?: string;
  streamingReasoning?: string;
  usage?: import("./types").UsageState | null;
  toolProgress?: string | null;
  pendingApproval?: import("./types").ApprovalRequest | null;
  pendingClarify?: import("./types").ClarifyRequest | null;
  pendingSudo?: import("./types").SudoRequest | null;
  pendingSecret?: import("./types").SecretRequest | null;
  profile?: string;
  visible?: boolean;
  onSessionStarted?: () => void;
  onNewChat?: () => void;
  onSessionStateChange?: (patch: {
    hermesSessionId?: string | null;
    dbSessionId?: string | null;
    title?: string;
    model?: string;
    pendingModelSwitch?: string | null;
    isLoading?: boolean;
    toolProgress?: string | null;
    pendingApproval?: import("./types").ApprovalRequest | null;
    pendingClarify?: import("./types").ClarifyRequest | null;
    pendingSudo?: import("./types").SudoRequest | null;
    pendingSecret?: import("./types").SecretRequest | null;
    usage?: import("./types").UsageState | null;
    streamingText?: string;
    streamingReasoning?: string;
    pendingModelSwitchMessageId?: string | null;
    todos?: import("./types").TodoItem[];
  }) => void;
  pendingModelSwitchMessageId?: string | null;
  todos?: import("./types").TodoItem[];
}

function Chat({
  messages,
  setMessages,
  sessionId,
  dbSessionId,
  relatedSessionIds = [],
  sessionTitle: externalTitle,
  isLoading = false,
  streamingText = "",
  streamingReasoning = "",
  usage = null,
  toolProgress = null,
  pendingApproval = null,
  pendingClarify = null,
  pendingSudo = null,
  pendingSecret = null,
  profile,
  visible = true,
  onSessionStarted,
  onNewChat,
  onSessionStateChange,
  todos = [],
}: ChatProps): React.JSX.Element {
  const { t } = useI18n();
  const [dragActive, setDragActive] = useState(false);
  const [remoteMode, setRemoteMode] = useState(false);
  const [verbose, setVerbose] = useState(
    () => getStoreItem("hermes-verbose") === "true",
  );
  const [approvalPolicy, setApprovalPolicyState] = useState<ApprovalPolicy>(
    () => loadApprovalPolicy(),
  );
  const [approvalHistory, setApprovalHistory] = useState(() =>
    loadApprovalHistory(sessionId || ""),
  );
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [dismissedApproval, setDismissedApproval] =
    useState<typeof pendingApproval>(null);
  const [approvalJudgment, setApprovalJudgment] =
    useState<JudgmentAdvice | null>(null);
  const approvalSubmittingRef = useRef(false);
  const dragCounter = useRef(0);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const gatewayClient = useMemo(() => createTauriChatGatewayClient(), []);
  const judgmentEngine = useMemo(() => createRuleBasedJudgmentEngine(), []);

  const { state: session, dispatch } = useSessionLifecycle(
    messages,
    sessionId,
    isLoading,
  );
  const setIsLoading = useCallback(
    (loading: boolean) => onSessionStateChange?.({ isLoading: loading }),
    [onSessionStateChange],
  );

  useEffect(() => {
    let cancelled = false;
    (async (): Promise<void> => {
      const flag = await isRemoteMode();
      if (!cancelled) setRemoteMode(flag);
    })();
    return (): void => {
      cancelled = true;
    };
  }, []);

  const loadingEarlierRef = useRef(false);
  const noMoreEarlierRef = useRef(false);
  const relatedExhaustedRef = useRef(-1);
  useEffect(() => {
    noMoreEarlierRef.current = false;
    relatedExhaustedRef.current = -1;
  }, [sessionId]);

  const handleLoadEarlierMessages = useCallback(async () => {
    if (loadingEarlierRef.current || noMoreEarlierRef.current) return;
    const primarySid = dbSessionId ?? session.hermesSessionId ?? sessionId;
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
              return { id: `db-${it.id}`, role: "user" as const, content: it.content, timestamp: ts };
            case "assistant":
              return { id: `db-${it.id}`, role: "agent" as const, content: it.content, timestamp: ts };
            case "tool_call":
              return { id: `db-${it.id}`, kind: "tool_call" as const, role: "agent" as const, callId: it.callId || "", name: it.name || "tool", args: it.args || "", timestamp: ts };
            case "tool_result": {
              let content = it.content || "";
              if (content.length > 8000) content = content.slice(0, 8000) + `\n\n... (${content.length} chars total)`;
              return { id: `db-${it.id}`, kind: "tool_result" as const, role: "agent" as const, callId: it.callId || "", name: it.name || "tool", content, timestamp: ts };
            }
            default:
              return null;
          }
        })
        .filter((m): m is ChatMessage => m !== null);

    loadingEarlierRef.current = true;
    try {
      // Build the session chain: [primary, ...related older sessions]
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

      // Try loading from the current session first
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

      // Current session exhausted — try older related sessions
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
        // Check if all messages are already loaded
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

      // All sessions exhausted
      noMoreEarlierRef.current = true;
    } catch {
      /* ignore */
    } finally {
      loadingEarlierRef.current = false;
    }
  }, [
    dbSessionId,
    session.hermesSessionId,
    sessionId,
    relatedSessionIds,
    profile,
    setMessages,
  ]);

  const { containerRef, bottomRef } = useChatScroll(messages, isLoading, handleLoadEarlierMessages);
  const modelConfig = useModelConfig(profile);
  const {
    fastMode,
    toggle: toggleFastMode,
    set: setFastTier,
  } = useFastMode(profile);

  const addAgentMessage = useCallback(
    (content: string) => {
      setMessages((prev) => [
        ...prev,
        { id: `agent-local-${Date.now()}`, role: "agent", content },
      ]);
    },
    [setMessages],
  );

  const addStatusMessage = useCallback(
    (
      title: string,
      content?: string,
      tone: "info" | "success" | "warning" | "error" = "info",
    ) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `status-${Date.now()}`,
          kind: "system_status",
          role: "agent",
          tone,
          title,
          content,
          timestamp: Date.now(),
        },
      ]);
    },
    [setMessages],
  );

  const addSystemEvent = useCallback(
    (
      event: Parameters<typeof createSystemEvent>[0],
      title: string,
      content?: string,
      options?: Parameters<typeof createSystemEvent>[3],
    ) => {
      setMessages((prev) => [
        ...prev,
        createSystemEvent(event, title, content, options),
      ]);
    },
    [setMessages],
  );

  const addErrorEvent = useCallback(
    (error: unknown) => {
      setMessages((prev) => [...prev, systemEventFromError(error)]);
    },
    [setMessages],
  );

  const setApprovalPolicy = useCallback((next: ApprovalPolicy) => {
    const normalized = normalizeApprovalPolicy(next);
    setApprovalPolicyState(normalized);
    saveApprovalPolicy(normalized);
    setApprovalHistory((prev) => {
      const pruned = pruneApprovalHistory(
        prev,
        Date.now(),
        normalized.historyTtlMinutes,
      );
      saveApprovalHistory(sessionId || "", pruned);
      return pruned;
    });
  }, [sessionId]);

  const visibleApproval =
    pendingApproval && pendingApproval !== dismissedApproval
      ? pendingApproval
      : null;

  const recordApprovalDecision = useCallback(
    (
      request: NonNullable<typeof pendingApproval>,
      decision: ApprovalDecision,
      source: ApprovalDecisionSource,
    ) => {
      const judgment = approvalJudgment
        ? {
            reason: approvalJudgment.reason,
            confidence: approvalJudgment.confidence,
            risk: approvalJudgment.risk,
          }
        : undefined;
      const entry = createApprovalHistoryEntry(
        request,
        decision,
        source,
        Date.now(),
        judgment,
      );
      setApprovalHistory((prev) => {
        const next = pruneApprovalHistory(
          [...prev, entry],
          Date.now(),
          approvalPolicy.historyTtlMinutes,
        );
        saveApprovalHistory(sessionId || "", next);
        return next;
      });
    },
    [approvalJudgment, approvalPolicy.historyTtlMinutes],
  );

  const handleDismissApprovalHistory = useCallback(() => {
    setApprovalHistory([]);
    saveApprovalHistory(sessionId || "", []);
  }, [sessionId]);

  const handleApprovalDecision = useCallback(
    async (decision: ApprovalDecision, source: ApprovalDecisionSource) => {
      const request = visibleApproval;
      const sid = session.hermesSessionId ?? sessionId;
      if (!request || !sid || approvalSubmittingRef.current) return;
      approvalSubmittingRef.current = true;
      setApprovalSubmitting(true);
      setDismissedApproval(request);
      setApprovalJudgment(null);
      onSessionStateChange?.({ pendingApproval: null });
      recordApprovalDecision(request, decision, source);
      try {
        await gatewayClient.respondApproval(sid, decision, false);
      } catch (err) {
        addErrorEvent(err);
      } finally {
        approvalSubmittingRef.current = false;
        setApprovalSubmitting(false);
      }
    },
    [
      addErrorEvent,
      gatewayClient,
      onSessionStateChange,
      recordApprovalDecision,
      session.hermesSessionId,
      sessionId,
      visibleApproval,
    ],
  );

  useEffect(() => {
    if (!visibleApproval) return;
    const immediate = getImmediateApprovalDecision(approvalPolicy);
    if (!immediate) return;
    void handleApprovalDecision(immediate.decision, immediate.source);
  }, [approvalPolicy, handleApprovalDecision, visibleApproval]);

  useEffect(() => {
    let cancelled = false;
    if (!visibleApproval) {
      setApprovalJudgment(null);
      return;
    }
    void judgmentEngine
      .judgeApproval({
        request: visibleApproval,
        settings: {
          ...DEFAULT_JUDGMENT_SETTINGS,
          enabled: true,
          model: modelConfig.currentModel || modelConfig.displayModel,
          allowAutoDecision: false,
        },
      })
      .then((advice) => {
        if (!cancelled) setApprovalJudgment(advice);
      })
      .catch(() => {
        if (!cancelled) setApprovalJudgment(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    judgmentEngine,
    modelConfig.currentModel,
    modelConfig.displayModel,
    visibleApproval,
  ]);

  const syncSessionBinding = useCallback(
    async (runtimeSessionId: string | null) => {
      if (!runtimeSessionId) return;
      try {
        const res = await gatewayClient.sessionTitle(runtimeSessionId);
        if (res?.session_key) {
          onSessionStateChange?.({
            hermesSessionId: runtimeSessionId,
            dbSessionId: res.session_key,
            ...(res.title ? { title: res.title } : {}),
          });
        }
      } catch {
        /* ignore */
      }
    },
    [onSessionStateChange],
  );

  const gatewayMessagesToChat = useCallback((items: any[]): ChatMessage[] => {
    const now = Date.now();
    const out: ChatMessage[] = [];
    items.forEach((msg, idx) => {
      const id = `gw-${now}-${idx}`;
      if (msg.role === "user" && (msg.text || msg.content)) {
        out.push({ id, role: "user", content: msg.text || msg.content });
        return;
      }
      if (msg.role === "assistant" && (msg.text || msg.content)) {
        out.push({ id, role: "agent", content: msg.text || msg.content });
        return;
      }
      if (msg.role === "tool") {
        out.push({
          id,
          kind: "tool_result",
          role: "agent",
          callId: "",
          name: msg.name || "tool",
          content: msg.context || msg.text || msg.content || "",
        });
      }
    });
    return out;
  }, []);

  const runCommandDispatchResult = useCallback(
    async (runtimeSessionId: string, result: any): Promise<boolean> => {
      const payload = result?.result ?? result ?? {};
      if (payload.notice) {
        addStatusMessage("Goal updated", String(payload.notice), "info");
      }
      if (payload.output) {
        addStatusMessage("Command result", String(payload.output), "info");
      }
      if (payload.warning) {
        addStatusMessage("Command warning", String(payload.warning), "warning");
      }
      if (payload.type === "send" && payload.message) {
        setMessages((prev) => [
          ...prev,
          {
            id: `user-command-${Date.now()}`,
            role: "user",
            content: String(payload.message),
            timestamp: Date.now(),
          },
        ]);
        await gatewayClient.submitPrompt(
          runtimeSessionId,
          String(payload.message),
        );
        return true;
      }
      setIsLoading(false);
      return true;
    },
    [addStatusMessage, gatewayClient, setMessages],
  );

  const executeGatewayCommand = useCallback(
    async (runtimeSessionId: string, command: string): Promise<boolean> => {
      const trimmed = command.trim();
      const [cmd, ...rest] = trimmed.split(/\s+/);
      const arg = rest.join(" ").trim();

      if (cmd === "/compress") {
        const result = await gatewayClient.compress(
          runtimeSessionId,
          arg || undefined,
        );
        const payload = result?.result ?? result ?? {};
        if (Array.isArray(payload.messages)) {
          setMessages(gatewayMessagesToChat(payload.messages));
        }
        if (payload.info?.model) {
          dispatch({ type: "setSessionModel", value: payload.info.model });
          onSessionStateChange?.({ model: payload.info.model });
        }
        if (payload.info?.title) {
          dispatch({ type: "setSessionTitle", value: payload.info.title });
          onSessionStateChange?.({ title: payload.info.title });
        }
        if (payload.usage) {
          dispatch({
            type: "setUsage",
            value: {
              promptTokens:
                payload.usage.input ?? payload.usage.promptTokens ?? 0,
              completionTokens:
                payload.usage.output ?? payload.usage.completionTokens ?? 0,
              totalTokens:
                payload.usage.total ?? payload.usage.totalTokens ?? 0,
              cost: payload.usage.cost_usd ?? payload.usage.cost,
              calls: payload.usage.calls,
              cacheRead: payload.usage.cache_read,
              cacheWrite: payload.usage.cache_write,
              reasoning: payload.usage.reasoning,
              contextUsed: payload.usage.context_used,
              contextMax: payload.usage.context_max,
              contextPercent: payload.usage.context_percent,
            },
          });
          onSessionStateChange?.({
            usage: {
              promptTokens:
                payload.usage.input ?? payload.usage.promptTokens ?? 0,
              completionTokens:
                payload.usage.output ?? payload.usage.completionTokens ?? 0,
              totalTokens:
                payload.usage.total ?? payload.usage.totalTokens ?? 0,
              cost: payload.usage.cost_usd ?? payload.usage.cost,
              calls: payload.usage.calls,
              cacheRead: payload.usage.cache_read,
              cacheWrite: payload.usage.cache_write,
              reasoning: payload.usage.reasoning,
              contextUsed: payload.usage.context_used,
              contextMax: payload.usage.context_max,
              contextPercent: payload.usage.context_percent,
            },
          });
        }
        const summaryText = [
          payload.summary?.headline,
          payload.summary?.token_line,
          payload.summary?.note,
        ]
          .filter(Boolean)
          .join("\n");

        const formatTokens = (val: any) => {
          if (typeof val === 'number') return val.toLocaleString();
          if (typeof val === 'string') {
            const num = parseInt(val, 10);
            return isNaN(num) ? val : num.toLocaleString();
          }
          return '';
        };
        const beforeTok = formatTokens(payload.before_tokens);
        const afterTok = formatTokens(payload.after_tokens);
        const compressTitle = (beforeTok && afterTok)
          ? `Session compressed (${beforeTok} ➜ ${afterTok} tok)`
          : "Session compressed";

        addSystemEvent(
          "context_compress",
          compressTitle,
          summaryText ||
            "Older context was summarized. Continue chatting in the same thread.",
        );
        await syncSessionBinding(runtimeSessionId);
        setIsLoading(false);
        return true;
      }

      if (cmd === "/model") {
        if (!arg) {
          const model =
            session.sessionModel ||
            modelConfig.currentModel ||
            modelConfig.displayModel ||
            "Not set";
          addAgentMessage(`**Current model:** \`${model}\``);
          setIsLoading(false);
          return true;
        }
        const switchMsgId = `model-switch-${Date.now()}`;
        onSessionStateChange?.({
          pendingModelSwitch: arg,
          pendingModelSwitchMessageId: switchMsgId,
        });
        addSystemEvent("model_switch", "Switching model", shortModelName(arg), {
          tone: "info",
          id: switchMsgId,
        });
        try {
          const result = await gatewayClient.setModel(runtimeSessionId, arg);
          const payload = result?.result ?? result ?? {};
          if (payload.warning) {
            addSystemEvent(
              "model_switch",
              "Model switch warning",
              String(payload.warning),
              { tone: "warning" },
            );
          }
        } finally {
          setIsLoading(false);
        }
        return true;
      }

      if (cmd === "/goal") {
        const result = await gatewayClient.dispatchCommand(
          runtimeSessionId,
          "goal",
          arg,
        );
        return runCommandDispatchResult(runtimeSessionId, result);
      }

      if (cmd === "/steer") {
        if (!arg) {
          addStatusMessage("Steer failed", "usage: /steer <prompt>", "error");
          setIsLoading(false);
          return true;
        }
        if (isLoading) {
          const result = await gatewayClient.steer(runtimeSessionId, arg);
          const payload = result?.result ?? result ?? {};
          if (payload.status === "queued") {
            addStatusMessage("Steer queued", arg, "success");
          } else {
            addStatusMessage("Steer rejected", arg, "warning");
          }
          setIsLoading(false);
          return true;
        }
        const result = await gatewayClient.dispatchCommand(
          runtimeSessionId,
          "steer",
          arg,
        );
        return runCommandDispatchResult(runtimeSessionId, result);
      }

      return false;
    },
    [
      addAgentMessage,
      addSystemEvent,
      addStatusMessage,
      dispatch,
      gatewayMessagesToChat,
      gatewayClient,
      isLoading,
      modelConfig.currentModel,
      modelConfig.displayModel,
      onSessionStateChange,
      runCommandDispatchResult,
      session.sessionModel,
      setMessages,
      syncSessionBinding,
      modelConfig,
    ],
  );

  // Cmd/Ctrl+N → new chat
  useEffect(() => {
    if (!visible) return;
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        onNewChat?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNewChat, visible]);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  });
  useEffect(() => {
    if (!visible) return;
    const unsub = onContextMenuCopyChat((format) => {
      const msgs = messagesRef.current;
      if (msgs.length === 0) return;
      void copyToClipboard(buildChatTranscript(msgs, format));
    });
    const handleCustom = (e: Event) => {
      const format = (e as CustomEvent).detail;
      const msgs = messagesRef.current;
      if (msgs.length === 0) return;
      void copyToClipboard(buildChatTranscript(msgs, format));
    };
    window.addEventListener("hermes-copy-chat", handleCustom);
    return () => {
      unsub();
      window.removeEventListener("hermes-copy-chat", handleCustom);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    return onContextMenuSelectBubble(({ x, y }) => {
      const bubble = document.elementFromPoint(x, y)?.closest(".chat-bubble");
      if (!bubble) return;
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.selectAllChildren(bubble);
    });
  }, [visible]);

  const handleClear = useCallback(() => {
    if (isLoading) {
      abortChat();
      setIsLoading(false);
    }
    const idToDelete = session.hermesSessionId ?? sessionId;
    if (idToDelete) {
      void deleteSession(idToDelete);
      void clearStagedAttachments(idToDelete);
    }
    setMessages([]);
    dispatch({ type: "setHermesSessionId", value: null });
    dispatch({ type: "setContextFolder", value: null });
    dispatch({ type: "setUsage", value: null });
    dispatch({ type: "setToolProgress", value: null });
    onSessionStateChange?.({
      hermesSessionId: null,
      dbSessionId: null,
      usage: null,
      toolProgress: null,
      pendingApproval: null,
      pendingClarify: null,
      pendingSudo: null,
      pendingSecret: null,
      streamingText: "",
      streamingReasoning: "",
      isLoading: false,
    });
  }, [
    isLoading,
    session.hermesSessionId,
    sessionId,
    setMessages,
    dispatch,
    onSessionStateChange,
  ]);

  const toggleVerbose = useCallback(() => {
    setVerbose((v) => {
      const next = !v;
      setStoreItem("hermes-verbose", String(next));
      return next;
    });
  }, []);

  const localCommands = useLocalCommands({
    profile,
    usage: usage,
    setFastMode: setFastTier,
    onNewChat,
    onClear: handleClear,
    addAgentMessage,
    addStatusMessage,
  });

  const activeTabId = sessionId || dbSessionId || "active-tab";
  const updateTab = useCallback(
    (_id: string, patch: any) => {
      onSessionStateChange?.(patch);
    },
    [onSessionStateChange],
  );

  const actions = useChatActions({
    hermesSessionId: session.hermesSessionId,
    dbSessionId,
    messages,
    isLoading,
    setIsLoading,
    setMessages,
    setHermesSessionId: useCallback(
      (id: string | null) => {
        dispatch({ type: "setHermesSessionId", value: id });
        onSessionStateChange?.({ hermesSessionId: id });
      },
      [dispatch, onSessionStateChange],
    ),
    onSessionStarted,
    chatInputRef,
    localCommands,
    contextFolder: session.contextFolder,
    pendingClarify: pendingClarify,
    setPendingClarify: useCallback(
      (c: import("./types").ClarifyRequest | null) => {
        dispatch({ type: "setPendingClarify", value: c });
        onSessionStateChange?.({ pendingClarify: c });
      },
      [dispatch, onSessionStateChange],
    ),
    activeTabId,
    updateTab,
    streamingText: streamingText,
    executeGatewayCommand,
  });

  const handleSuggestion = useCallback((text: string) => {
    chatInputRef.current?.setText(text);
  }, []);

  const handlePickFolder = useCallback(async () => {
    const path = await selectFolder();
    if (path) dispatch({ type: "setContextFolder", value: path });
  }, [dispatch]);

  const handleClearFolder = useCallback(() => {
    dispatch({ type: "setContextFolder", value: null });
  }, [dispatch]);

  const eventHasFiles = useCallback((e: React.DragEvent): boolean => {
    const types = e.dataTransfer?.types;
    if (!types) return false;
    for (let i = 0; i < types.length; i++) {
      if (types[i] === "Files") return true;
    }
    return false;
  }, []);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!eventHasFiles(e)) return;
      e.preventDefault();
      dragCounter.current += 1;
      if (dragCounter.current === 1) setDragActive(true);
    },
    [eventHasFiles],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!eventHasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    },
    [eventHasFiles],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!eventHasFiles(e)) return;
      e.preventDefault();
      dragCounter.current = 0;
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;
      void chatInputRef.current?.addFiles(files);
    },
    [eventHasFiles],
  );

  const handleSelectModel = useCallback(
    async (provider: string, model: string, baseUrl: string) => {
      await modelConfig.selectModel(provider, model, baseUrl);
      const id = session.hermesSessionId ?? sessionId;
      if (id) {
        try {
          setIsLoading(true);
          await executeGatewayCommand(id, `/model ${model} --provider ${provider}`);
        } catch (err) {
          addErrorEvent(err);
          setIsLoading(false);
        }
      }
    },
    [
      modelConfig.selectModel,
      session.hermesSessionId,
      sessionId,
      addErrorEvent,
      executeGatewayCommand,
    ],
  );

  const handleSelectAlias = useCallback(
    async (alias: {
      name: string;
      model: string;
      provider: string;
      baseUrl: string;
    }) => {
      await modelConfig.selectAlias(alias);
      const id = session.hermesSessionId ?? sessionId;
      if (id) {
        try {
          setIsLoading(true);
          await executeGatewayCommand(id, `/model ${alias.name}`);
        } catch (err) {
          addErrorEvent(err);
          setIsLoading(false);
        }
      }
    },
    [
      modelConfig.selectAlias,
      session.hermesSessionId,
      sessionId,
      addErrorEvent,
      executeGatewayCommand,
    ],
  );

  const handleSudoRespond = useCallback(
    async (password: string) => {
      const sid = session.hermesSessionId ?? sessionId;
      if (!sid) return;
      try {
        await gatewayClient.respondSudo(sid, password, pendingSudo?.requestId);
        onSessionStateChange?.({ pendingSudo: null });
      } catch (err) {
        addStatusMessage(
          "Sudo failed",
          (err as Error).message || String(err),
          "error",
        );
      }
    },
    [
      gatewayClient,
      session.hermesSessionId,
      sessionId,
      pendingSudo,
      onSessionStateChange,
      addStatusMessage,
    ],
  );

  const handleSecretRespond = useCallback(
    async (value: string) => {
      const sid = session.hermesSessionId ?? sessionId;
      if (!sid) return;
      try {
        await gatewayClient.respondSecret(sid, value, pendingSecret?.requestId);
        onSessionStateChange?.({ pendingSecret: null });
      } catch (err) {
        addStatusMessage(
          "Secret input failed",
          (err as Error).message || String(err),
          "error",
        );
      }
    },
    [
      gatewayClient,
      session.hermesSessionId,
      sessionId,
      pendingSecret,
      onSessionStateChange,
      addStatusMessage,
    ],
  );

  return (
    <div
      className="chat-container"
      style={visible ? undefined : { display: "none" }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ChatHeader
        sessionId={dbSessionId ?? sessionId}
        sessionTitle={session.sessionTitle || externalTitle}
        sessionModel={session.sessionModel}
        usage={usage}
        fastMode={fastMode}
        hasMessages={messages.length > 0}
        contextFolder={session.contextFolder}
        showContextFolder={!remoteMode}
        onPickFolder={handlePickFolder}
        onClearFolder={handleClearFolder}
        onToggleFast={toggleFastMode}
        onNewChat={onNewChat}
        onClear={handleClear}
      />

      <div className="chat-messages" ref={containerRef}>
        {messages.length === 0 ? (
          <ChatEmptyState onSelectSuggestion={handleSuggestion} />
        ) : (
          <MessageList
            messages={messages}
            isLoading={isLoading}
            toolProgress={toolProgress}
            streamingText={streamingText}
            streamingReasoning={streamingReasoning}
          />
        )}
        {isLoading && todos && todos.length > 0 && (
          <TodoPanel todos={todos} defaultCollapsed={false} />
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <InteractionCenter
          pendingSudo={pendingSudo}
          pendingSecret={pendingSecret}
          onSudoRespond={handleSudoRespond}
          onSecretRespond={handleSecretRespond}
        />
        <ApprovalHistoryPanel entries={approvalHistory} onDismiss={handleDismissApprovalHistory} />
        <ChatInput
          ref={chatInputRef}
          isLoading={isLoading}
          hasSession={!!session.hermesSessionId}
          sessionId={session.hermesSessionId}
          remoteMode={remoteMode}
          pendingClarify={pendingClarify}
          onSubmit={actions.handleSend}
          onQuickAsk={actions.handleQuickAsk}
          onAbort={actions.handleAbort}
        />
        <div className="chat-bottom-bar">
          <ModelPicker
            currentModel={modelConfig.currentModel}
            currentProvider={modelConfig.currentProvider}
            currentBaseUrl={modelConfig.currentBaseUrl}
            displayModel={modelConfig.displayModel}
            modelGroups={modelConfig.modelGroups}
            onOpen={modelConfig.reload}
            onSelectAlias={handleSelectAlias}
            onSelectModel={handleSelectModel}
            aliases={modelConfig.aliases}
          />
          <ChatStatusBar
            usage={usage}
            isLoading={isLoading}
            hasMessages={messages.length > 0}
            sessionStart={session.sessionStart}
            responseStart={session.responseStart}
            lastResponseDuration={session.lastResponseDuration}
            verbose={verbose}
            onToggleVerbose={toggleVerbose}
          />
        </div>
      </div>
      <ApprovalModal
        request={visibleApproval}
        policy={approvalPolicy}
        submitting={approvalSubmitting}
        judgmentAdvice={approvalJudgment}
        onDecision={handleApprovalDecision}
        onPolicyChange={setApprovalPolicy}
      />
      {dragActive && (
        <div className="chat-drop-overlay" aria-hidden>
          <div className="chat-drop-overlay-inner">
            {t("chat.dropToAttach")}
          </div>
        </div>
      )}
    </div>
  );
}

export default Chat;
