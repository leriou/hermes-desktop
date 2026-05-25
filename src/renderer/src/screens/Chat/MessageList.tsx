import { memo, useMemo, useState, useCallback, useRef } from "react";
import { HermesAvatar, MessageRow } from "./MessageRow";
import { ReasoningRow, ToolResultRow } from "./HistoryRow";
import { SubagentRow } from "./SubagentRow";
import { ToolGroupRow } from "./ToolGroupRow";
import { StreamingMarkdown } from "../../components/StreamingMarkdown";
import { mergeContinuationLabels } from "./sessionDisplay";
import type { ApprovalRequest, ChatMessage, SudoRequest, SecretRequest, SystemStatusMessage, ToolCallMessage, ToolGroupMessage } from "./types";

const LIGHTWEIGHT_THRESHOLD = 15;
const LIGHTWEIGHT_FROM_END = 8;

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  toolProgress: string | null;
  pendingApproval?: ApprovalRequest | null;
  pendingSudo?: SudoRequest | null;
  pendingSecret?: SecretRequest | null;
  onApprove: () => void;
  onDeny: () => void;
  onSudoRespond: (password: string) => void;
  onSecretRespond: (value: string) => void;
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
  return (
    <div className={`chat-system-status chat-system-status-${msg.tone}`}>
      <span className="chat-system-status-title">{msg.title}</span>
      {msg.content && (
        <span className="chat-system-status-content">{msg.content}</span>
      )}
    </div>
  );
}

function SudoPromptBar({ onSubmit }: { onSubmit: (password: string) => void }): React.JSX.Element {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const handleSubmit = useCallback(() => {
    if (value) { onSubmit(value); setValue(""); }
  }, [value, onSubmit]);
  return (
    <div className="chat-sudo-bar">
      <span className="chat-prompt-icon">🔑</span>
      <span className="chat-prompt-label">Sudo password required</span>
      <input
        ref={inputRef}
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
        placeholder="Password"
        autoFocus
      />
      <button onClick={handleSubmit}>Submit</button>
    </div>
  );
}

function SecretPromptBar({ req, onSubmit }: { req: SecretRequest; onSubmit: (value: string) => void }): React.JSX.Element {
  const [value, setValue] = useState("");
  const handleSubmit = useCallback(() => {
    if (value) { onSubmit(value); setValue(""); }
  }, [value, onSubmit]);
  return (
    <div className="chat-secret-bar">
      <span className="chat-prompt-icon">🔐</span>
      <span className="chat-prompt-label">{req.prompt || req.envVar}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
        placeholder={req.envVar}
        autoFocus
      />
      <button onClick={handleSubmit}>Submit</button>
    </div>
  );
}

export const MessageList = memo(function MessageList({
  messages,
  isLoading,
  toolProgress,
  pendingApproval,
  pendingSudo,
  pendingSecret,
  onApprove,
  onDeny,
  onSudoRespond,
  onSecretRespond,
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
        const lightweight =
          visibleMessages.length > LIGHTWEIGHT_THRESHOLD &&
          i < visibleMessages.length - LIGHTWEIGHT_FROM_END;
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
        const bubble = msg as Extract<ChatMessage, { role: "user" | "agent" }>;
        return (
          <MessageRow
            key={msg.id}
            msg={bubble}
            isLast={i === visibleMessages.length - 1}
            isLoading={isLoading}
            onApprove={onApprove}
            onDeny={onDeny}
            lightweight={lightweight}
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

      {pendingApproval && !isLoading && (
        <div className="chat-approval-bar">
          <div className="chat-approval-info">
            <span className="chat-approval-command">{pendingApproval.command}</span>
            {pendingApproval.description && (
              <span className="chat-approval-desc">{pendingApproval.description}</span>
            )}
          </div>
          <div className="chat-approval-actions">
            <button className="chat-approval-btn chat-approve" onClick={onApprove}>
              Approve
            </button>
            <button className="chat-approval-btn chat-deny" onClick={onDeny}>
              Deny
            </button>
          </div>
        </div>
      )}

      {pendingSudo && !isLoading && (
        <SudoPromptBar onSubmit={onSudoRespond} />
      )}

      {pendingSecret && !isLoading && (
        <SecretPromptBar req={pendingSecret} onSubmit={onSecretRespond} />
      )}
    </>
  );
});
