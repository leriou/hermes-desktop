import { useEffect, useState } from "react";
import type { ApprovalRequest } from "./types";
import type {
  ApprovalDecision,
  ApprovalDecisionSource,
  ApprovalPolicy,
} from "./approvalPolicy";
import type { JudgmentAdvice } from "./judgmentEngine";

interface ApprovalModalProps {
  request: ApprovalRequest | null;
  policy: ApprovalPolicy;
  submitting: boolean;
  judgmentAdvice?: JudgmentAdvice | null;
  onDecision: (
    decision: ApprovalDecision,
    source: ApprovalDecisionSource,
  ) => void;
  onPolicyChange: (policy: ApprovalPolicy) => void;
}

export function ApprovalModal({
  request,
  policy,
  submitting,
  judgmentAdvice = null,
  onDecision,
  onPolicyChange,
}: ApprovalModalProps): React.JSX.Element | null {
  const [remaining, setRemaining] = useState(policy.timeoutSeconds);

  useEffect(() => {
    setRemaining(policy.timeoutSeconds);
  }, [request, policy.timeoutSeconds]);

  useEffect(() => {
    if (!request || policy.mode !== "countdown" || submitting) return;
    const timer = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          onDecision(policy.timeoutAction, "timeout");
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [request, policy.mode, policy.timeoutAction, submitting, onDecision]);

  if (!request) return null;

  return (
    <div className="chat-approval-modal-backdrop" role="presentation">
      <section
        className="chat-approval-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Command approval"
      >
        <div className="chat-approval-modal-head">
          <div>
            <div className="chat-approval-kicker">Approval required</div>
            <h2>Review command</h2>
          </div>
          {policy.mode === "countdown" && (
            <div className="chat-approval-countdown">
              Auto {policy.timeoutAction} in {remaining}s
            </div>
          )}
        </div>

        {request.description && (
          <p className="chat-approval-description">{request.description}</p>
        )}
        <pre className="chat-approval-command-full">{request.command}</pre>
        {request.patternKeys.length > 0 && (
          <div className="chat-approval-patterns">
            {request.patternKeys.map((key) => (
              <span key={key}>{key}</span>
            ))}
          </div>
        )}
        {judgmentAdvice && (
          <div
            className={`chat-approval-judgment chat-approval-judgment-${judgmentAdvice.risk}`}
          >
            <div className="chat-approval-judgment-head">
              <span>Judgment</span>
              <span>
                {judgmentAdvice.risk} ·{" "}
                {Math.round(judgmentAdvice.confidence * 100)}%
              </span>
            </div>
            <div className="chat-approval-judgment-body">
              {judgmentAdvice.reason}
            </div>
          </div>
        )}

        <div className="chat-approval-settings">
          <label>
            <input
              type="checkbox"
              checked={policy.mode === "auto_approve"}
              onChange={(event) =>
                onPolicyChange({
                  ...policy,
                  mode: event.target.checked ? "auto_approve" : "manual",
                })
              }
            />
            Auto approve future requests
          </label>
          <label>
            <input
              type="checkbox"
              checked={policy.mode === "countdown"}
              onChange={(event) =>
                onPolicyChange({
                  ...policy,
                  mode: event.target.checked ? "countdown" : "manual",
                })
              }
              disabled={policy.mode === "auto_approve"}
            />
            Countdown
          </label>
          <label>
            Seconds
            <input
              type="number"
              min={5}
              max={600}
              value={policy.timeoutSeconds}
              onChange={(event) =>
                onPolicyChange({
                  ...policy,
                  timeoutSeconds: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Timeout
            <select
              value={policy.timeoutAction}
              onChange={(event) =>
                onPolicyChange({
                  ...policy,
                  timeoutAction: event.target.value as ApprovalDecision,
                })
              }
            >
              <option value="deny">Deny</option>
              <option value="approve">Approve</option>
            </select>
          </label>
          <label>
            History min
            <input
              type="number"
              min={1}
              max={240}
              value={policy.historyTtlMinutes}
              onChange={(event) =>
                onPolicyChange({
                  ...policy,
                  historyTtlMinutes: Number(event.target.value),
                })
              }
            />
          </label>
        </div>

        <div className="chat-approval-modal-actions">
          <button
            className="btn btn-sm btn-secondary"
            disabled={submitting}
            onClick={() => onDecision("deny", "manual")}
          >
            Deny
          </button>
          <button
            className="btn btn-sm btn-primary"
            disabled={submitting}
            onClick={() => onDecision("approve", "manual")}
          >
            Approve
          </button>
        </div>
      </section>
    </div>
  );
}
