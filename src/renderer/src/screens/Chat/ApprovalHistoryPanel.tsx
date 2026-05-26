import type { ApprovalHistoryEntry } from "./approvalPolicy";

export function ApprovalHistoryPanel({
  entries,
}: {
  entries: ApprovalHistoryEntry[];
}): React.JSX.Element | null {
  if (entries.length === 0) return null;
  const recent = entries.slice(-5).reverse();
  return (
    <div
      className="chat-approval-history"
      aria-label="Recent approval decisions"
    >
      <div className="chat-approval-history-title">Recent approvals</div>
      {recent.map((entry) => (
        <div
          key={entry.id}
          className={`chat-approval-history-row chat-approval-history-${entry.decision}`}
        >
          <span className="chat-approval-history-decision">
            {entry.decision === "approve" ? "Approved" : "Denied"}
            {entry.source !== "manual" ? ` · ${entry.source}` : ""}
          </span>
          <span className="chat-approval-history-command" title={entry.command}>
            {entry.command}
          </span>
          {entry.judgmentReason && (
            <span
              className="chat-approval-history-judgment"
              title={entry.judgmentReason}
            >
              judgment {Math.round((entry.judgmentConfidence ?? 0) * 100)}% ·{" "}
              {entry.judgmentRisk}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
