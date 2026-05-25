import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatInput, type ChatInputHandle, type ModelOption } from "./ChatInput";
import { ChatHeader } from "./ChatHeader";
import { ChatEmptyState } from "./ChatEmptyState";
import { MessageList } from "./MessageList";
import { ModelPicker } from "./ModelPicker";
import { TuiToolbar } from "./TuiToolbar";
import { ChatStatusBar } from "./ChatStatusBar";
import { useChatScroll } from "./hooks/useChatScroll";
import { useChatIPC } from "./hooks/useChatIPC";
import { useChatActions } from "./hooks/useChatActions";
import { useModelConfig } from "./hooks/useModelConfig";
import { useFastMode } from "./hooks/useFastMode";
import { useLocalCommands } from "./hooks/useLocalCommands";
import { useSessionLifecycle } from "./hooks/useSessionLifecycle";
import { useStreamingText } from "./hooks/useStreamingText";
import { useI18n } from "../../components/useI18n";
import { buildChatTranscript } from "./transcriptUtils";
import { shortModelName } from "./sessionDisplay";
import type { ChatMessage } from "./types";

export type { ChatMessage } from "./types";

interface ChatProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  sessionId: string | null;
  dbSessionId?: string | null;
  sessionTitle?: string;
  profile?: string;
  onSessionStarted?: () => void;
  onNewChat?: () => void;
  onSessionStateChange?: (patch: {
    hermesSessionId?: string | null;
    dbSessionId?: string | null;
    title?: string;
    model?: string;
  }) => void;
}

function Chat({
  messages,
  setMessages,
  sessionId,
  dbSessionId,
  sessionTitle: externalTitle,
  profile,
  onSessionStarted,
  onNewChat,
  onSessionStateChange,
}: ChatProps): React.JSX.Element {
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [remoteMode, setRemoteMode] = useState(false);
  const [verbose, setVerbose] = useState(() => localStorage.getItem("hermes-verbose") === "true");
  const dragCounter = useRef(0);
  const pendingModelSwitchRef = useRef<string | null>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const { ref: streamingTextRef, text: streamingText } = useStreamingText();

  const { state: session, dispatch } = useSessionLifecycle(messages, sessionId, isLoading);

  useEffect(() => {
    let cancelled = false;
    (async (): Promise<void> => {
      const flag = await window.hermesAPI.isRemoteMode();
      if (!cancelled) setRemoteMode(flag);
    })();
    return (): void => {
      cancelled = true;
    };
  }, []);

  const { containerRef, bottomRef } = useChatScroll(messages, isLoading);
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
    (title: string, content?: string, tone: "info" | "success" | "warning" | "error" = "info") => {
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

  const syncSessionBinding = useCallback(
    async (runtimeSessionId: string | null) => {
      if (!runtimeSessionId) return;
      try {
        const res = await window.hermesAPI.tuiSessionTitle(runtimeSessionId);
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
        await window.hermesAPI.tuiSubmitPrompt(runtimeSessionId, String(payload.message));
        return true;
      }
      setIsLoading(false);
      return true;
    },
    [addStatusMessage, setMessages],
  );

  const executeGatewayCommand = useCallback(
    async (runtimeSessionId: string, command: string): Promise<boolean> => {
      const trimmed = command.trim();
      const [cmd, ...rest] = trimmed.split(/\s+/);
      const arg = rest.join(" ").trim();

      if (cmd === "/compress") {
        const result = await window.hermesAPI.tuiCompress(runtimeSessionId, arg || undefined);
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
            },
          });
        }
        const summaryText = [payload.summary?.headline, payload.summary?.token_line, payload.summary?.note]
          .filter(Boolean)
          .join("\n");
        addStatusMessage(
          "Session compressed",
          summaryText || "Older context was summarized. Continue chatting in the same thread.",
          "success",
        );
        await syncSessionBinding(runtimeSessionId);
        setIsLoading(false);
        return true;
      }

      if (cmd === "/model") {
        if (!arg) {
          const model = session.sessionModel || modelConfig.currentModel || modelConfig.displayModel || "Not set";
          addAgentMessage(`**Current model:** \`${model}\``);
          setIsLoading(false);
          return true;
        }
        pendingModelSwitchRef.current = arg;
        addStatusMessage("Switching model", shortModelName(arg), "info");
        const result = await window.hermesAPI.tuiSetModel(runtimeSessionId, arg);
        const payload = result?.result ?? result ?? {};
        if (payload.warning) {
          addStatusMessage("Model switch warning", String(payload.warning), "warning");
        }
        return true;
      }

      if (cmd === "/goal") {
        const result = await window.hermesAPI.tuiCommandDispatch(runtimeSessionId, "goal", arg);
        return runCommandDispatchResult(runtimeSessionId, result);
      }

      if (cmd === "/steer") {
        if (!arg) {
          addStatusMessage("Steer failed", "usage: /steer <prompt>", "error");
          setIsLoading(false);
          return true;
        }
        if (isLoading) {
          const result = await window.hermesAPI.tuiSteer(runtimeSessionId, arg);
          const payload = result?.result ?? result ?? {};
          if (payload.status === "queued") {
            addStatusMessage("Steer queued", arg, "success");
          } else {
            addStatusMessage("Steer rejected", arg, "warning");
          }
          setIsLoading(false);
          return true;
        }
        const result = await window.hermesAPI.tuiCommandDispatch(runtimeSessionId, "steer", arg);
        return runCommandDispatchResult(runtimeSessionId, result);
      }

      return false;
    },
    [
      addAgentMessage,
      addStatusMessage,
      dispatch,
      gatewayMessagesToChat,
      isLoading,
      modelConfig.currentModel,
      modelConfig.displayModel,
      onSessionStateChange,
      runCommandDispatchResult,
      session.sessionModel,
      setMessages,
      syncSessionBinding,
    ],
  );

  useChatIPC({
    hermesSessionId: session.hermesSessionId,
    dbSessionId,
    setMessages,
    setHermesSessionId: useCallback((id: string | null) => dispatch({ type: "setHermesSessionId", value: id }), [dispatch]),
    setToolProgress: useCallback((p: string | null) => dispatch({ type: "setToolProgress", value: p }), [dispatch]),
    setIsLoading,
    setUsage: useCallback((u: import("./types").UsageState | null | ((prev: import("./types").UsageState | null) => import("./types").UsageState | null)) => {
      if (u instanceof Function) return;
      dispatch({ type: "setUsage", value: u });
    }, [dispatch]),
    setPendingApproval: useCallback((a: import("./types").ApprovalRequest | null) => dispatch({ type: "setPendingApproval", value: a }), [dispatch]),
    setPendingClarify: useCallback((c: import("./types").ClarifyRequest | null) => dispatch({ type: "setPendingClarify", value: c }), [dispatch]),
    streamingTextRef,
    isLoading,
    onSessionInfo: useCallback((info: { model: string; provider?: string }) => {
      dispatch({ type: "setSessionModel", value: info.model });
      onSessionStateChange?.({ model: info.model });
      if (pendingModelSwitchRef.current) {
        addStatusMessage("Model switched", shortModelName(info.model), "success");
        pendingModelSwitchRef.current = null;
      }
    }, [dispatch, onSessionStateChange, addStatusMessage]),
    onTitleAvailable: useCallback((title: string) => {
      dispatch({ type: "setSessionTitle", value: title });
      onSessionStateChange?.({ title });
    }, [dispatch, onSessionStateChange]),
    onStatusUpdate: useCallback((status: { kind?: string; text?: string }) => {
      if (!status.text || status.kind === "process") return;
      const tone =
        status.kind === "error"
          ? "error"
          : status.kind === "warn" || status.kind === "approval"
            ? "warning"
            : "info";
      const title =
        status.kind === "compressing"
          ? "Compressing session"
          : status.kind === "goal"
            ? "Goal update"
            : "Session update";
      addStatusMessage(title, status.text, tone);
    }, [addStatusMessage]),
  });

  // Cmd/Ctrl+N → new chat
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        onNewChat?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNewChat]);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  });
  useEffect(() => {
    const unsub = window.hermesAPI.onContextMenuCopyChat((format) => {
      const msgs = messagesRef.current;
      if (msgs.length === 0) return;
      void window.hermesAPI.copyToClipboard(buildChatTranscript(msgs, format));
    });
    const handleCustom = (e: Event) => {
      const format = (e as CustomEvent).detail;
      const msgs = messagesRef.current;
      if (msgs.length === 0) return;
      void window.hermesAPI.copyToClipboard(buildChatTranscript(msgs, format));
    };
    window.addEventListener("hermes-copy-chat", handleCustom);
    return () => { unsub(); window.removeEventListener("hermes-copy-chat", handleCustom); };
  }, []);

  useEffect(() => {
    return window.hermesAPI.onContextMenuSelectBubble(({ x, y }) => {
      const bubble = document.elementFromPoint(x, y)?.closest(".chat-bubble");
      if (!bubble) return;
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.selectAllChildren(bubble);
    });
  }, []);

  const handleClear = useCallback(() => {
    if (isLoading) {
      window.hermesAPI.abortChat();
      setIsLoading(false);
    }
    const idToDelete = session.hermesSessionId ?? sessionId;
    if (idToDelete) {
      void window.hermesAPI.deleteSession(idToDelete);
      void window.hermesAPI.clearStagedAttachments(idToDelete);
    }
    setMessages([]);
    dispatch({ type: "setHermesSessionId", value: null });
    dispatch({ type: "setContextFolder", value: null });
    dispatch({ type: "setUsage", value: null });
    dispatch({ type: "setToolProgress", value: null });
  }, [isLoading, session.hermesSessionId, sessionId, setMessages, dispatch]);

  const toggleVerbose = useCallback(() => {
    setVerbose((v) => {
      const next = !v;
      localStorage.setItem("hermes-verbose", String(next));
      return next;
    });
  }, []);

  const localCommands = useLocalCommands({
    profile,
    usage: session.usage,
    setFastMode: setFastTier,
    onNewChat,
    onClear: handleClear,
    addAgentMessage,
    addStatusMessage,
  });

  const actions = useChatActions({
    hermesSessionId: session.hermesSessionId,
    dbSessionId,
    messages,
    isLoading,
    setIsLoading,
    setMessages,
    setHermesSessionId: useCallback((id: string | null) => dispatch({ type: "setHermesSessionId", value: id }), [dispatch]),
    onSessionStarted,
    chatInputRef,
    localCommands,
    contextFolder: session.contextFolder,
    pendingClarify: session.pendingClarify,
    setPendingClarify: useCallback((c: import("./types").ClarifyRequest | null) => dispatch({ type: "setPendingClarify", value: c }), [dispatch]),
    executeGatewayCommand,
  });

  const handleSuggestion = useCallback((text: string) => {
    chatInputRef.current?.setText(text);
  }, []);

  const handlePickFolder = useCallback(async () => {
    const path = await window.hermesAPI.selectFolder();
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

  const handleTuiGoal = useCallback(
    async (goal: string) => {
      const id = session.hermesSessionId ?? sessionId;
      if (!id) return;
      setIsLoading(true);
      await executeGatewayCommand(id, `/goal ${goal}`);
    },
    [executeGatewayCommand, session.hermesSessionId, sessionId],
  );

  const handleTuiModel = useCallback(
    async (model: string) => {
      const id = session.hermesSessionId ?? sessionId;
      if (!id) return;
      try {
        setIsLoading(true);
        await executeGatewayCommand(id, `/model ${model}`);
      } catch (err) {
        addStatusMessage("Model switch failed", (err as Error).message || String(err), "error");
        setIsLoading(false);
      }
    },
    [executeGatewayCommand, session.hermesSessionId, sessionId, addStatusMessage],
  );

  const handleSelectModel = useCallback(
    async (provider: string, model: string, baseUrl: string) => {
      await modelConfig.selectModel(provider, model, baseUrl);
      const id = session.hermesSessionId ?? sessionId;
      if (id) {
        try {
          setIsLoading(true);
          await executeGatewayCommand(id, `/model ${model}`);
        } catch (err) {
          addStatusMessage("Model switch failed", (err as Error).message || String(err), "error");
          setIsLoading(false);
        }
      }
    },
    [modelConfig.selectModel, session.hermesSessionId, sessionId, addStatusMessage, executeGatewayCommand],
  );

  const handleSelectAlias = useCallback(
    async (alias: { name: string; model: string; provider: string; baseUrl: string }) => {
      await modelConfig.selectAlias(alias);
      const id = session.hermesSessionId ?? sessionId;
      if (id) {
        try {
          setIsLoading(true);
          await executeGatewayCommand(id, `/model ${alias.name}`);
        } catch (err) {
          addStatusMessage("Model switch failed", (err as Error).message || String(err), "error");
          setIsLoading(false);
        }
      }
    },
    [modelConfig.selectAlias, session.hermesSessionId, sessionId, addStatusMessage, executeGatewayCommand],
  );

  const modelOptions = useMemo<ModelOption[]>(() => {
    return modelConfig.aliases.map((a) => ({
      label: a.name,
      sublabel: a.model,
      model: a.model,
      provider: a.provider,
      baseUrl: a.baseUrl,
    }));
  }, [modelConfig.aliases]);

  const handleModelInputSelect = useCallback(
    async (option: ModelOption) => {
      await modelConfig.selectAlias({ name: option.label, model: option.model, provider: option.provider, baseUrl: option.baseUrl });
      const id = session.hermesSessionId ?? sessionId;
      if (id) {
        try {
          setIsLoading(true);
          await executeGatewayCommand(id, `/model ${option.model}`);
        } catch (err) {
          addStatusMessage("Model switch failed", (err as Error).message || String(err), "error");
          setIsLoading(false);
          return;
        }
      }
    },
    [modelConfig, session.hermesSessionId, sessionId, addStatusMessage, executeGatewayCommand],
  );

  const handleTuiCompress = useCallback(async () => {
    const id = session.hermesSessionId ?? sessionId;
    if (!id) return;
    try {
      setIsLoading(true);
      await executeGatewayCommand(id, "/compress");
    } catch (err) {
      addStatusMessage("Compress failed", (err as Error).message || String(err), "error");
      setIsLoading(false);
    }
  }, [executeGatewayCommand, session.hermesSessionId, sessionId, addStatusMessage]);

  const handleTuiSteer = useCallback(
    async (prompt: string) => {
      const id = session.hermesSessionId ?? sessionId;
      if (!id) return;
      try {
        setIsLoading(true);
        await executeGatewayCommand(id, `/steer ${prompt}`);
      } catch (err) {
        addStatusMessage("Steer failed", (err as Error).message || String(err), "error");
        setIsLoading(false);
      }
    },
    [executeGatewayCommand, session.hermesSessionId, sessionId, addStatusMessage],
  );

  return (
    <div
      className="chat-container"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ChatHeader
        sessionId={dbSessionId ?? sessionId}
        sessionTitle={session.sessionTitle || externalTitle}
        sessionModel={session.sessionModel}
        usage={session.usage}
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
            toolProgress={session.toolProgress}
            pendingApproval={session.pendingApproval}
            onApprove={actions.handleApprove}
            onDeny={actions.handleDeny}
            streamingText={streamingText}
          />
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        {session.hermesSessionId && (
          <TuiToolbar
            onSetGoal={handleTuiGoal}
            onSetModel={handleTuiModel}
            onSteer={handleTuiSteer}
            onCompress={handleTuiCompress}
            steerEnabled={isLoading}
          />
        )}
        <ChatInput
          ref={chatInputRef}
          isLoading={isLoading}
          hasSession={!!session.hermesSessionId}
          sessionId={session.hermesSessionId}
          remoteMode={remoteMode}
          modelOptions={modelOptions}
          pendingClarify={session.pendingClarify}
          onModelSelect={handleModelInputSelect}
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
            usage={session.usage}
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
