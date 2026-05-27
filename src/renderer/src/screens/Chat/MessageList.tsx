import { memo, useMemo, useRef, useEffect, useCallback } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { HermesAvatar, MessageRow } from "./MessageRow";
import { ReasoningRow, ToolResultRow } from "./HistoryRow";
import { SubagentRow } from "./SubagentRow";
import { ToolGroupRow } from "./ToolGroupRow";
import { StreamingMarkdown } from "../../components/StreamingMarkdown";
import { AgentMarkdown } from "../../components/AgentMarkdown";
import { buildRenderableTranscript } from "./renderTranscript";
import { TodoPanel } from "../../components/common/TodoPanel";
import type {
  ChatMessage,
  SystemEventMessage,
  SystemStatusMessage,
  ToolGroupMessage,
  TodoMessage,
  ToolCallMessage,
} from "./types";

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  toolProgress: string | null;
  streamingText?: string;
  streamingReasoning?: string;
  scrollerRef?: React.Ref<HTMLDivElement | null> | ((el: HTMLDivElement | null) => void);
  todos?: any[];
}

function getActiveToolCall(messages: ChatMessage[]): ToolCallMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.kind === "tool_group") {
      const runningCall = msg.calls.find((c) => c.result === undefined && c.success === undefined);
      if (runningCall) return runningCall;
    }
  }
  return null;
}

function getActiveCallDescription(call: ToolCallMessage) {
  let argsObj: Record<string, any> = {};
  try {
    argsObj = JSON.parse(call.args || "{}");
  } catch {
    // ignore
  }

  const nameLower = (call.name || "").toLowerCase();
  
  const getParam = () => {
    return (
      argsObj.command ||
      argsObj.code ||
      argsObj.path ||
      argsObj.filename ||
      argsObj.filepath ||
      argsObj.query ||
      argsObj.pattern ||
      argsObj.url ||
      (Array.isArray(argsObj.urls) ? argsObj.urls[0] : argsObj.urls) ||
      argsObj.content ||
      argsObj.note ||
      argsObj.text ||
      argsObj.prompt ||
      call.args ||
      ""
    );
  };
  
  const rawParam = getParam();
  const displayParam = rawParam.length > 40 ? rawParam.slice(0, 37) + "…" : rawParam;

  if (
    nameLower.includes("terminal") ||
    nameLower.includes("command") ||
    nameLower.includes("run") ||
    nameLower.includes("shell") ||
    nameLower.includes("execute")
  ) {
    return {
      icon: "💻",
      action: "Running",
      detail: displayParam ? `$ ${displayParam}` : "command",
      isCode: true,
    };
  }
  if (
    nameLower.includes("write") ||
    nameLower.includes("patch") ||
    nameLower.includes("edit") ||
    nameLower.includes("create")
  ) {
    return {
      icon: "✍️",
      action: "Writing",
      detail: displayParam || "file",
      isPath: true,
    };
  }
  if (nameLower.includes("read") || nameLower.includes("view") || nameLower.includes("get_file") || nameLower.includes("fetch_file")) {
    return {
      icon: "📖",
      action: "Reading",
      detail: displayParam || "file",
      isPath: true,
    };
  }
  if (nameLower.includes("search") || nameLower.includes("grep")) {
    return {
      icon: "🔍",
      action: "Searching",
      detail: displayParam || "query",
      isText: true,
    };
  }
  if (nameLower.includes("web") || nameLower.includes("url") || nameLower.includes("fetch") || nameLower.includes("download")) {
    return {
      icon: "🌐",
      action: "Fetching",
      detail: displayParam || "url",
      isText: true,
    };
  }
  if (nameLower.includes("memory") || nameLower.includes("fact") || nameLower.includes("todo")) {
    return {
      icon: "🧠",
      action: "Recalling memory",
      detail: displayParam || "knowledge",
      isText: true,
    };
  }

  return {
    icon: "🔧",
    action: "Executing",
    detail: `${call.name || "tool"}${displayParam ? `: ${displayParam}` : ""}`,
    isText: true,
  };
}

/* ── Ephemeral thinking footprint (timeline-style) ───────────────────── */
function LiveReasoningRow({ text }: { text: string }): React.JSX.Element {
  const lineCount = text.split("\n").length;

  const lines = text.split("\n").filter((l) => l.trim());
  const lastLine = lines.length > 0 ? lines[lines.length - 1].trim() : "";
  const displayLine =
    lastLine.length > 80 ? lastLine.slice(0, 77) + "…" : lastLine;

  return (
    <div className="chat-live-reasoning-footprint">
      <div className="chat-live-reasoning-left">
        <div className="chat-live-reasoning-dot" />
      </div>
      <div className="chat-live-reasoning-body">
        <span className="chat-live-reasoning-label">🧠 Thinking</span>
        <span className="chat-live-reasoning-meta">{lineCount} lines</span>
        {displayLine && (
          <span className="chat-live-reasoning-snippet">{displayLine}</span>
        )}
      </div>
    </div>
  );
}

function TypingIndicator({
  toolProgress,
  messages,
}: {
  toolProgress: string | null;
  messages: ChatMessage[];
}): React.JSX.Element {
  const activeCall = useMemo(() => getActiveToolCall(messages), [messages]);

  const renderProgressContent = () => {
    if (toolProgress) {
      const draftMatch = toolProgress.match(/^drafting\s+(.+?)(?:…)?$/);
      if (draftMatch) {
        const fileName = draftMatch[1];
        const displayPath = fileName.length > 50 ? "…" + fileName.slice(-47) : fileName;
        return (
          <div className="chat-tool-progress-drafting">
            <span className="chat-tool-progress-icon-write">✍️</span>
            <span className="chat-tool-progress-text-shimmer">Drafting</span>
            <code className="chat-tool-progress-file-badge" title={fileName}>
              {displayPath}
            </code>
          </div>
        );
      }

      if (
        toolProgress === "analyzing tool output…" ||
        toolProgress.startsWith("analyzing")
      ) {
        return (
          <div className="chat-tool-progress-analyzing">
            <div className="chat-tool-progress-spinner-dual" />
            <span className="chat-tool-progress-text-pulse">
              Analyzing tool output…
            </span>
          </div>
        );
      }
    }

    if (activeCall) {
      const desc = getActiveCallDescription(activeCall);
      return (
        <div className="chat-tool-progress-active">
          <div className="chat-tool-progress-spinner-dual" />
          <span className="chat-tool-progress-icon">{desc.icon}</span>
          <span className="chat-tool-progress-action-label">{desc.action}</span>
          {desc.isCode || desc.isPath ? (
            <code className={desc.isCode ? "chat-tool-progress-code-badge" : "chat-tool-progress-file-badge"}>
              {desc.detail}
            </code>
          ) : (
            <span className="chat-tool-progress-detail-text">{desc.detail}</span>
          )}
        </div>
      );
    }

    if (toolProgress) {
      return <div className="chat-tool-progress">{toolProgress}</div>;
    }

    return null;
  };

  const hasContent = toolProgress || activeCall;

  return (
    <div className="chat-message chat-message-agent">
      <HermesAvatar />
      <div className="chat-bubble chat-bubble-agent">
        {hasContent ? (
          renderProgressContent()
        ) : (
          <div className="chat-typing-container">
            <div className="chat-typing">
              <span className="chat-typing-dot" />
              <span className="chat-typing-dot" />
              <span className="chat-typing-dot" />
            </div>
            <span className="chat-typing-label">Thinking…</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SystemStatusRow({
  msg,
}: {
  msg: SystemStatusMessage;
}): React.JSX.Element {
  const isMultiLine = msg.content && msg.content.includes("\n");

  if (isMultiLine) {
    return (
      <div
        className={`chat-system-status-block chat-system-status-block-${msg.tone}`}
      >
        <div className="chat-system-status-block-header">
          <span className="chat-system-status-block-icon">
            {msg.tone === "success"
              ? "✓"
              : msg.tone === "warning"
                ? "⚠"
                : msg.tone === "error"
                  ? "✗"
                  : "ℹ"}
          </span>
          <span className="chat-system-status-block-title">{msg.title}</span>
        </div>
        <div className="chat-system-status-block-content">
          <AgentMarkdown>{msg.content!}</AgentMarkdown>
        </div>
      </div>
    );
  }

  return (
    <div className={`chat-system-status chat-system-status-${msg.tone}`}>
      <span className="chat-system-status-title">{msg.title}</span>
      {msg.content && (
        <span className="chat-system-status-content">{msg.content}</span>
      )}
    </div>
  );
}

function SystemEventRow({
  msg,
}: {
  msg: SystemEventMessage;
}): React.JSX.Element {
  const icon =
    msg.tone === "success"
      ? "✓"
      : msg.tone === "warning"
        ? "!"
        : msg.tone === "error"
          ? "×"
          : "i";
  return (
    <div className="chat-system-event-rail">
      <span
        className={`chat-system-event-rail-dot chat-system-event-rail-dot-${msg.tone}`}
      >
        {icon}
      </span>
      <details
        className={`chat-system-event chat-system-event-${msg.tone} chat-system-event-${msg.event}`}
      >
        <summary className="chat-system-event-summary">
          <span className="chat-system-event-label">{msg.title}</span>
          {msg.code && (
            <span className="chat-system-event-code">{msg.code}</span>
          )}
        </summary>
        {msg.content && (
          <div className="chat-system-event-content">{msg.content}</div>
        )}
      </details>
    </div>
  );
}

export const MessageList = memo(function MessageList({
  messages,
  isLoading,
  toolProgress,
  streamingText,
  streamingReasoning,
  scrollerRef: externalScrollerRef,
  todos,
}: MessageListProps): React.JSX.Element {
  const visibleMessages = useMemo(() => {
    const list = buildRenderableTranscript({
      messages,
      isLoading,
      toolProgress,
      streamingText,
      streamingReasoning,
    });
    if (isLoading && todos && todos.length > 0) {
      list.push({
        id: "live-todo-panel-item",
        kind: "todo_live",
        todos,
      } as any);
    }
    return list;
  }, [messages, isLoading, toolProgress, streamingText, streamingReasoning, todos]);

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const prevIsLoadingRef = useRef(isLoading);
  const isAtBottomRef = useRef(true);
  const scrollerElementRef = useRef<HTMLElement | null>(null);

  const isNearBottom = useCallback(() => {
    const el = scrollerElementRef.current;
    if (!el) return false;
    const threshold = 60;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  }, []);

  useEffect(() => {
    const justStartedLoading = isLoading && !prevIsLoadingRef.current;
    prevIsLoadingRef.current = isLoading;

    if (virtuosoRef.current) {
      if (justStartedLoading) {
        virtuosoRef.current.scrollToIndex({
          index: visibleMessages.length - 1,
          behavior: "auto",
        });
      } else if (isLoading) {
        if (isAtBottomRef.current || isNearBottom()) {
          virtuosoRef.current.scrollToIndex({
            index: visibleMessages.length - 1,
            behavior: "auto",
          });
        }
      }
    }
  }, [visibleMessages.length, isLoading, streamingText, streamingReasoning, isNearBottom]);

  const handleVirtuosoScrollerRef = useCallback((el: HTMLElement | null | Window) => {
    scrollerElementRef.current = el instanceof HTMLElement ? el : null;
    if (!externalScrollerRef) return;
    if (typeof externalScrollerRef === "function") {
      externalScrollerRef(el as HTMLDivElement | null);
    } else if (externalScrollerRef && 'current' in externalScrollerRef) {
      (externalScrollerRef as any).current = el;
    }
  }, [externalScrollerRef]);

  return (
    <Virtuoso
      ref={virtuosoRef}
      scrollerRef={handleVirtuosoScrollerRef}
      atBottomStateChange={(atBottom) => {
        isAtBottomRef.current = atBottom;
      }}
      data={visibleMessages}
      initialItemCount={visibleMessages.length}
      style={{ height: "100%", width: "100%" }}
      increaseViewportBy={300}
      followOutput={(isAtBottom) => (isAtBottom ? "smooth" : false)}
      itemContent={(i, msg) => {
        const k = (msg as { kind?: string }).kind;
        if (k === "reasoning") {
          return (
            <ReasoningRow
              key={msg.id}
              msg={msg as any}
              defaultOpen={false}
            />
          );
        }
        if (k === "live_reasoning") {
          return (
            <LiveReasoningRow
              key={msg.id}
              text={
                (
                  msg as Extract<
                    import("./renderTranscript").RenderTranscriptItem,
                    { kind: "live_reasoning" }
                  >
                ).text
              }
            />
          );
        }
        if (k === "tool_group") {
          return <ToolGroupRow key={msg.id} msg={msg as ToolGroupMessage} />;
        }
        if (k === "subagent") {
          return (
            <SubagentRow
              key={msg.id}
              msg={msg as Extract<ChatMessage, { kind: "subagent" }>}
            />
          );
        }
        if (k === "tool_result") {
          return (
            <ToolResultRow
              key={msg.id}
              msg={msg as Extract<ChatMessage, { kind: "tool_result" }>}
            />
          );
        }
        if (k === "system_status") {
          return (
            <SystemStatusRow key={msg.id} msg={msg as SystemStatusMessage} />
          );
        }
        if (k === "system_event") {
          return (
            <SystemEventRow key={msg.id} msg={msg as SystemEventMessage} />
          );
        }
        if (k === "todo") {
          const todoMsg = msg as TodoMessage;
          return (
            <TodoPanel
              key={todoMsg.id}
              todos={todoMsg.todos}
              defaultCollapsed={true}
            />
          );
        }
        if (k === "todo_live") {
          const liveTodoMsg = msg as any;
          return (
            <TodoPanel
              key={liveTodoMsg.id}
              todos={liveTodoMsg.todos}
              defaultCollapsed={false}
            />
          );
        }
        if (k === "live_assistant") {
          const liveMsg = msg as Extract<
            import("./renderTranscript").RenderTranscriptItem,
            { kind: "live_assistant" }
          >;
          return (
            <div key={liveMsg.id} className="chat-message chat-message-agent">
              <HermesAvatar />
              <div className="chat-bubble chat-bubble-agent">
                <StreamingMarkdown>{liveMsg.content}</StreamingMarkdown>
              </div>
            </div>
          );
        }
        if (k === "typing") {
          const typingMsg = msg as Extract<
            import("./renderTranscript").RenderTranscriptItem,
            { kind: "typing" }
          >;
          return (
            <TypingIndicator
              key={typingMsg.id}
              toolProgress={typingMsg.toolProgress}
              messages={messages}
            />
          );
        }
        if (k === "tool_progress") {
          const progressMsg = msg as Extract<
            import("./renderTranscript").RenderTranscriptItem,
            { kind: "tool_progress" }
          >;
          return (
            <div key={progressMsg.id} className="chat-tool-progress-inline">
              {progressMsg.content}
            </div>
          );
        }
        const bubble = msg as Extract<ChatMessage, { role: "user" | "agent" }>;
        return (
          <MessageRow
            key={msg.id}
            msg={bubble}
            isLast={i === visibleMessages.length - 1}
            isLoading={isLoading}
          />
        );
      }}
    />
  );
});
