import {
  abortChat,
  clearStagedAttachments,
  copyToClipboard,
  deleteSessionChain,
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
import { useLoadEarlier } from "./hooks/useLoadEarlier";
import { useDragDrop } from "./hooks/useDragDrop";
import { useApproval } from "./hooks/useApproval";
import { useGatewayCommands } from "./hooks/useGatewayCommands";
import { useI18n } from "../../components/useI18n";
import { buildChatTranscript } from "./transcriptUtils";
import { createSystemEvent, systemEventFromError } from "./systemEvents";
import { createTauriChatGatewayClient } from "./tauriChatGatewayClient";
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
  const [remoteMode, setRemoteMode] = useState(false);
  const [verbose, setVerbose] = useState(
    () => getStoreItem("hermes-verbose") === "true",
  );
  const chatInputRef = useRef<ChatInputHandle>(null);
  const gatewayClient = useMemo(() => createTauriChatGatewayClient(), []);

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

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  });

  // --- Extracted hooks ---

  const { handleLoadEarlierMessages } = useLoadEarlier({
    sessionId,
    dbSessionId,
    hermesSessionId: session.hermesSessionId,
    relatedSessionIds,
    profile,
    setMessages,
    messagesRef,
  });

  const { setContainerRef, userScrolledUp, scrollToBottom } = useChatScroll(
    messages,
    isLoading,
    handleLoadEarlierMessages,
    streamingText,
    streamingReasoning,
  );

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

  const { executeGatewayCommand } = useGatewayCommands({
    gatewayClient,
    setMessages,
    addAgentMessage,
    addStatusMessage,
    addSystemEvent,
    setIsLoading,
    dispatch,
    onSessionStateChange,
    sessionModel: session.sessionModel,
    isLoading,
    currentModel: modelConfig.currentModel,
    displayModel: modelConfig.displayModel,
  });

  const {
    approvalPolicy,
    approvalHistory,
    approvalSubmitting,
    approvalJudgment,
    visibleApproval,
    setApprovalPolicy,
    handleDismissApprovalHistory,
    handleApprovalDecision,
  } = useApproval({
    sessionId,
    hermesSessionId: session.hermesSessionId,
    pendingApproval,
    onSessionStateChange,
    respondApproval: useCallback(
      (sid: string, decision: any, auto: boolean) =>
        gatewayClient.respondApproval(sid, decision, auto),
      [gatewayClient],
    ),
    addErrorEvent,
    currentModel: modelConfig.currentModel,
    displayModel: modelConfig.displayModel,
  });

  const {
    dragActive,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useDragDrop({
    onFiles: useCallback(
      (files: File[]) => void chatInputRef.current?.addFiles(files),
      [],
    ),
  });

  // --- Keyboard shortcut ---

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

  // --- Context menu handlers ---

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

  // --- Clear / verbose ---

  const handleClear = useCallback(() => {
    if (isLoading) {
      abortChat();
      setIsLoading(false);
    }
    const idToDelete = session.hermesSessionId ?? sessionId;
    if (idToDelete) {
      void deleteSessionChain(idToDelete, profile);
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

  // --- Actions ---

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

      <div className="chat-messages" ref={setContainerRef}>
        {messages.length === 0 ? (
          <ChatEmptyState onSelectSuggestion={handleSuggestion} />
        ) : (
          <MessageList
            messages={messages}
            isLoading={isLoading}
            toolProgress={toolProgress}
            streamingText={streamingText}
            streamingReasoning={streamingReasoning}
            todos={todos}
          />
        )}
        {userScrolledUp && messages.length > 0 && (
          <button
            className="chat-scroll-to-bottom-btn"
            onClick={() => scrollToBottom(true)}
            type="button"
          >
            Jump to latest ↓
          </button>
        )}
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
            onSelectModel={handleSelectModel}
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
