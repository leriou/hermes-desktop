import { memo, useMemo } from "react";
import { HermesAvatar, MessageRow } from "./MessageRow";
import { ReasoningRow, ToolResultRow } from "./HistoryRow";
import { SubagentRow } from "./SubagentRow";
import { ToolGroupRow } from "./ToolGroupRow";
import { StreamingMarkdown } from "../../components/StreamingMarkdown";
import { AgentMarkdown } from "../../components/AgentMarkdown";
import { mergeContinuationLabels } from "./sessionDisplay";
import type { ChatMessage, SystemEventMessage, SystemStatusMessage, ToolCallMessage, ToolGroupMessage } from "./types";


interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  toolProgress: string | null;
  streamingText?: string;
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

function isBubble(m: ChatMessage): m is import("./types").ChatBubbleMessage {
  const k = (m as { kind?: string }).kind;
  return !k || k === "user" || k === "assistant";
}

function kindOf(m: ChatMessage): string | undefined {
  return (m as { kind?: string }).kind;
}

/**
 * Two-pass grouping:
 *   1. Merge any `tool_result` messages into their matching `tool_call`
 *      (history data comes as alternating call/result pairs).
 *   2. Group strictly consecutive `tool_call` messages that share the
 *      same tool name into a `ToolGroupMessage`.
 */
function groupToolCalls(messages: ChatMessage[]): ChatMessage[] {
  // Pass 1: merge tool_results into their tool_call, stripping tool_results
  const merged: ChatMessage[] = [];
  const callMap = new Map<string, ToolCallMessage>();

  for (const msg of messages) {
    if (kindOf(msg) === "tool_call") {
      const tc = { ...msg } as ToolCallMessage;
      callMap.set(tc.callId, tc);
      merged.push(tc);
    } else if (kindOf(msg) === "tool_result") {
      const tr = msg as import("./types").ToolResultMessage;
      const tc = callMap.get(tr.callId);
      if (tc) {
        tc.result = tr.content;
        tc.success = true;
      }
      // tool_result consumed — don't push to merged
    } else {
      merged.push(msg);
    }
  }

  // Pass 2: group consecutive tool_calls with the same name
  const result: ChatMessage[] = [];
  let i = 0;
  while (i < merged.length) {
    if (kindOf(merged[i]) !== "tool_call") {
      result.push(merged[i]);
      i++;
      continue;
    }

    const first = merged[i] as ToolCallMessage;
    const name = first.name;
    const calls: ToolCallMessage[] = [first];
    i++;

    while (i < merged.length) {
      const next = merged[i];
      if (kindOf(next) !== "tool_call") break;
      if ((next as ToolCallMessage).name !== name) break;
      calls.push(next as ToolCallMessage);
      i++;
    }

    result.push({
      kind: "tool_group",
      id: `group-${calls.map((c) => c.id).join("-")}`,
      role: "agent",
      toolName: name,
      calls,
    });
  }

  return result;
}

function SystemStatusRow({ msg }: { msg: SystemStatusMessage }): React.JSX.Element {
  const isMultiLine = msg.content && msg.content.includes("\n");

  if (isMultiLine) {
    return (
      <div className={`chat-system-status-block chat-system-status-block-${msg.tone}`}>
        <div className="chat-system-status-block-header">
          <span className="chat-system-status-block-icon">
            {msg.tone === "success" ? "✓" : msg.tone === "warning" ? "⚠" : msg.tone === "error" ? "✗" : "ℹ"}
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
  const icon = msg.tone === "success" ? "✓" : msg.tone === "warning" ? "!" : msg.tone === "error" ? "×" : "i";
  return (
    <div className="chat-system-event-rail">
      <span className={`chat-system-event-rail-dot chat-system-event-rail-dot-${msg.tone}`}>{icon}</span>
      <details className={`chat-system-event chat-system-event-${msg.tone} chat-system-event-${msg.event}`}>
        <summary className="chat-system-event-summary">
          <span className="chat-system-event-label">{msg.title}</span>
          {msg.code && <span className="chat-system-event-code">{msg.code}</span>}
        </summary>
        {msg.content && <div className="chat-system-event-content">{msg.content}</div>}
      </details>
    </div>
  );
}

export const MessageList = memo(function MessageList({
  messages,
  isLoading,
  toolProgress,
  streamingText,
}: MessageListProps): React.JSX.Element {
  const processed = useMemo(
    () => groupToolCalls(mergeContinuationLabels(messages)),
    [messages],
  );

  const visibleMessages = useMemo(
    () =>
      processed.filter((m) => {
        if (!isBubble(m)) return true;
        return ((m.content as string) || "").trim().length > 0;
      }),
    [processed],
  );

  let lastBubble: ChatMessage | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isBubble(messages[i])) { lastBubble = messages[i]; break; }
  }
  const lastMessageIsAgent = !!lastBubble && lastBubble.role === "agent";

  return (
    <>
      {visibleMessages.map((msg, i) => {
        const k = (msg as { kind?: string }).kind;
        if (k === "reasoning") {
          return (
            <ReasoningRow
              key={msg.id}
              msg={msg as Extract<ChatMessage, { kind: "reasoning" }>}
            />
          );
        }
        if (k === "tool_group") {
          return (
            <ToolGroupRow
              key={msg.id}
              msg={msg as ToolGroupMessage}
            />
          );
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
          return <SystemStatusRow key={msg.id} msg={msg as SystemStatusMessage} />;
        }
        if (k === "system_event") {
          return <SystemEventRow key={msg.id} msg={msg as SystemEventMessage} />;
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

      {isLoading && streamingText && (
        <div className="chat-message chat-message-agent">
          <HermesAvatar />
          <div className="chat-bubble chat-bubble-agent">
            <StreamingMarkdown>{streamingText}</StreamingMarkdown>
          </div>
        </div>
      )}

      {isLoading && !lastMessageIsAgent && !streamingText && (
        <TypingIndicator toolProgress={toolProgress} />
      )}

      {isLoading && toolProgress && lastMessageIsAgent && (
        <div className="chat-tool-progress-inline">{toolProgress}</div>
      )}

    </>
  );
});
