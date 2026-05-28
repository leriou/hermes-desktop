import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { ApprovalRequest } from "./types";
import type { ApprovalDecision, ApprovalDecisionSource } from "./approvalPolicy";
interface InlineApprovalCardProps { request: ApprovalRequest; submitting: boolean; onDecision: (decision: ApprovalDecision, source: ApprovalDecisionSource) => void; }
export function InlineApprovalCard({ request, submitting, onDecision }: InlineApprovalCardProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="chat-interaction-card chat-approval-inline-card">
      <ShieldAlert size={14} className="chat-interaction-icon" />
      <div className="chat-interaction-main">
        <div className="chat-interaction-title">Approval required</div>
        <div className="chat-approval-inline-command">
          {expanded ? <pre className="chat-approval-inline-pre">{request.command}</pre> : <code>{request.command.length > 120 ? request.command.slice(0, 120) + "…" : request.command}</code>}
          {request.command.length > 120 && <button className="chat-approval-inline-expand" onClick={() => setExpanded((e) => !e)}>{expanded ? "less" : "more"}</button>}
        </div>
        {request.description && <div className="chat-approval-inline-desc">{request.description}</div>}
      </div>
      <div className="chat-approval-inline-actions">
        <button className="chat-approval-deny" disabled={submitting} onClick={() => onDecision("deny", "manual")}>Deny</button>
        <button className="chat-approval-approve" disabled={submitting} onClick={() => onDecision("approve", "manual")}>Approve</button>
      </div>
    </div>
  );
}
