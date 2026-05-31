import { memo, useMemo } from "react";
import { HermesAvatar, MessageRow } from "./MessageRow";
import { ToolResultRow } from "./HistoryRow";
import { SubagentRow } from "./SubagentRow";
import { ToolGroupRow, getFriendlyToolDescription } from "./ToolGroupRow";
import { StreamingMarkdown } from "../../components/StreamingMarkdown";
import { AgentMarkdown } from "../../components/AgentMarkdown";
import { buildRenderableTranscript, stripHceCompaction } from "./renderTranscript";
import { TodoPanel } from "../../components/common/TodoPanel";
import { ChatEventRow } from "./ChatEventRow";
import type {
  ChatMessage,
  SystemEventMessage,
  SystemStatusMessage,
  ToolGroupMessage,
  TodoMessage,
  ToolCallMessage,
  TodoItem,
} from "./types";

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  toolProgress: string | null;
  streamingText?: string;
  streamingReasoning?: string;
  todos?: TodoItem[];
  scrollerRef?: React.Ref<HTMLDivElement | null> | ((el: HTMLDivElement | null) => void);
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

/* ── Thinking indicator — shows during agent reasoning ─────────────── */
function LiveReasoningRow({ text }: { text?: string }): React.JSX.Element {
  const lines = text ? text.split("\n").filter((l) => l.trim()) : [];
  const lastLine = lines.length > 0 ? lines[lines.length - 1].trim() : "";
  const displayLine =
    lastLine.length > 80 ? lastLine.slice(0, 77) + "…" : lastLine;

  return (
    <div className="chat-message chat-message-agent">
      <HermesAvatar />
      <div className="chat-bubble chat-bubble-agent chat-live-reasoning-bubble">
        <span className="chat-live-reasoning-dot" />
        <span className="chat-live-reasoning-label">Thinking</span>
        {lines.length > 0 && (
          <span className="chat-live-reasoning-meta">{lines.length} lines</span>
        )}
        {displayLine && (
          <span className="chat-live-reasoning-snippet">{displayLine}</span>
        )}
      </div>
    </div>
  );
}

function ToolProgressIndicator({
  toolProgress,
  messages,
}: {
  toolProgress: string | null;
  messages: ChatMessage[];
}): React.JSX.Element | null {
  const activeCall = useMemo(() => getActiveToolCall(messages), [messages]);

  if (toolProgress) {
    const draftMatch = toolProgress.match(/^drafting\s+(.+?)(?:…)?$/);
    if (draftMatch) {
      const fileName = draftMatch[1];
      const displayPath = fileName.length > 50 ? "…" + fileName.slice(-47) : fileName;
      return (
        <div className="chat-message chat-message-agent">
          <HermesAvatar />
          <div className="chat-bubble chat-bubble-agent">
            <div className="chat-tool-progress-drafting">
              <span className="chat-tool-progress-icon-write">✍️</span>
              <span className="chat-tool-progress-text-shimmer">Drafting</span>
              <code className="chat-tool-progress-file-badge" title={fileName}>
                {displayPath}
              </code>
            </div>
          </div>
        </div>
      );
    }

    if (
      toolProgress === "analyzing tool output…" ||
      toolProgress.startsWith("analyzing")
    ) {
      return (
        <div className="chat-message chat-message-agent">
          <HermesAvatar />
          <div className="chat-bubble chat-bubble-agent">
            <div className="chat-tool-progress-analyzing">
              <div className="chat-tool-progress-spinner-dual" />
              <span className="chat-tool-progress-text-pulse">
                Analyzing tool output…
              </span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="chat-message chat-message-agent">
        <HermesAvatar />
        <div className="chat-bubble chat-bubble-agent">
          <div className="chat-tool-progress">{toolProgress}</div>
        </div>
      </div>
    );
  }

  if (activeCall) {
    const desc = getFriendlyToolDescription(activeCall.name || "tool", activeCall.args || "");
    return (
      <div className="chat-message chat-message-agent">
        <HermesAvatar />
        <div className="chat-bubble chat-bubble-agent">
          <div className="chat-tool-progress-active">
            <div className="chat-tool-progress-spinner-dual" />
            <span className="chat-tool-progress-icon">{desc.icon}</span>
            <span className="chat-tool-progress-action-label">{desc.action}</span>
            {desc.kind === "code" || desc.kind === "path" ? (
              <code className={desc.kind === "code" ? "chat-tool-progress-code-badge" : "chat-tool-progress-file-badge"}>
                {desc.detail}
              </code>
            ) : (
              <span className="chat-tool-progress-detail-text">{desc.detail}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
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

function SystemEventRow({ msg }: { msg: SystemEventMessage }): React.JSX.Element {
  return <ChatEventRow msg={msg} />;
}

export const MessageList = memo(function MessageList({
  messages,
  isLoading,
  toolProgress,
  streamingText = "",
  streamingReasoning = "",
  todos = [],
  scrollerRef,
}: MessageListProps): React.JSX.Element {
  const visibleMessages = useMemo(
    () =>
      buildRenderableTranscript({
        messages,
        isLoading,
        toolProgress,
        streamingText: "",
        streamingReasoning: "",
        todos: [],
      }),
    [messages, isLoading, toolProgress],
  );

  return (
    <div className="chat-messages-inner" ref={scrollerRef}>
      {visibleMessages.map((msg, i) => {
        const k = (msg as { kind?: string }).kind;
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
      })}
      {/* Live streaming content — same container prevents jump on commit */}
      {isLoading && !streamingText && !toolProgress && (
        <LiveReasoningRow text={streamingReasoning} />
      )}
      {isLoading && !streamingText && toolProgress && (
        <ToolProgressIndicator toolProgress={toolProgress} messages={messages} />
      )}
      {isLoading && todos.length > 0 && (
        <TodoPanel todos={todos} defaultCollapsed />
      )}
      {isLoading && streamingText && !streamingText.startsWith("[HCE COMPACTION") && (
        <div className="chat-message chat-message-agent">
          <HermesAvatar />
          <div className="chat-bubble chat-bubble-agent">
            <StreamingMarkdown>{stripHceCompaction(streamingText) || streamingText}</StreamingMarkdown>
          </div>
        </div>
      )}
    </div>
  );
});

