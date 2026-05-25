import { memo } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import type { SubagentMessage } from "./types";

export const SubagentRow = memo(function SubagentRow({
  msg,
}: {
  msg: SubagentMessage;
}): React.JSX.Element {
  const isRunning = msg.status === "running";
  const isFailed = msg.status === "failed";

  return (
    <div className="chat-message chat-message-agent">
      <div className="chat-subagent-row">
        <span className="chat-subagent-icon">🤖</span>
        <span className="chat-subagent-goal">{msg.goal}</span>
        {isRunning && (
          <>
            {msg.progressHint && (
              <span className="chat-subagent-progress">{msg.progressHint}</span>
            )}
            <Loader2 size={12} className="chat-subagent-spinner" />
          </>
        )}
        {!isRunning && !isFailed && (
          <>
            <CheckCircle2 size={12} className="chat-subagent-ok" />
            {msg.durationS != null && (
              <span className="chat-subagent-duration">{msg.durationS.toFixed(1)}s</span>
            )}
          </>
        )}
        {isFailed && (
          <>
            <XCircle size={12} className="chat-subagent-fail" />
            {msg.durationS != null && (
              <span className="chat-subagent-duration">{msg.durationS.toFixed(1)}s</span>
            )}
          </>
        )}
      </div>
    </div>
  );
});
