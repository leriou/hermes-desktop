import { memo, useMemo } from "react";
import { HermesAvatar, MessageRow } from "./MessageRow";
import { ReasoningRow, ToolResultRow } from "./HistoryRow";
import { SubagentRow } from "./SubagentRow";
import { ToolGroupRow } from "./ToolGroupRow";
import { StreamingMarkdown } from "../../components/StreamingMarkdown";
import { AgentMarkdown } from "../../components/AgentMarkdown";
import { buildRenderableTranscript } from "./renderTranscript";
import type {
  ChatMessage,
  SystemEventMessage,
  SystemStatusMessage,
  ToolGroupMessage,
} from "./types";

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  toolProgress: string | null;
  streamingText?: string;
  streamingReasoning?: string;
}

function TypingIndicator({
  toolProgress,
}: {
  toolProgress: string | null;
}): React.JSX.Element {
  return (
    <div className="chat-message chat-message-agent">
      <HermesAvatar />
      <div className="chat-bubble chat-bubble-agent">
        {toolProgress ? (
          <div className="chat-tool-progress">{toolProgress}</div>
        ) : (
          <div className="chat-typing">
            <span className="chat-typing-dot" />
            <span className="chat-typing-dot" />
            <span className="chat-typing-dot" />
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
}: MessageListProps): React.JSX.Element {
  const visibleMessages = useMemo(
    () =>
      buildRenderableTranscript({
        messages,
        isLoading,
        toolProgress,
        streamingText,
        streamingReasoning,
      }),
    [messages, isLoading, toolProgress, streamingText, streamingReasoning],
  );

  return (
    <>
      {visibleMessages.map((msg, i) => {
        const k = (msg as { kind?: string }).kind;
        if (k === "reasoning" || k === "live_reasoning") {
          return (
            <ReasoningRow
              key={msg.id}
              msg={msg as any}
              defaultOpen={k === "live_reasoning"}
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
    </>
  );
});
