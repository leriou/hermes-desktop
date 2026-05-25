import { memo, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { HermesAvatar } from "./MessageRow";
import type { ToolCallMessage, ToolGroupMessage } from "./types";
import {
  getColumnsForTool,
  fallbackColumns,
  type ColumnDef,
} from "./tool-table-config";
import { getToolMeta } from "./HistoryRow";

/* ── JSON pretty-print helper ─────────────────────────────────────────── */

function tryFormatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/* ── Detail modal ───────────────────────────────────────────────────── */

function DetailModal({
  call,
  onClose,
}: {
  call: ToolCallMessage;
  onClose: () => void;
}): React.JSX.Element {
  return createPortal(
    <div className="tool-detail-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="tool-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tool-detail-header">
          <span className="tool-detail-title">{call.name}</span>
          <button className="tool-detail-close" onClick={onClose}>×</button>
        </div>
        <div className="tool-detail-body">
          <div className="tool-detail-section">
            <div className="tool-detail-section-label">
              Args
              <button className="tool-detail-copy" onClick={() => void window.hermesAPI.copyToClipboard(call.args || "")}>Copy</button>
            </div>
            <pre className="tool-detail-pre">{tryFormatJson(call.args || "(empty)")}</pre>
          </div>
          {call.result !== undefined && (
            <div className="tool-detail-section">
              <div className="tool-detail-section-label">
                Result
                <button className="tool-detail-copy" onClick={() => void window.hermesAPI.copyToClipboard(call.result || "")}>Copy</button>
              </div>
              <pre className="tool-detail-pre">{tryFormatJson(call.result || "(empty)")}</pre>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Tool table ──────────────────────────────────────────────────────── */

function ToolTable({
  calls,
  columns,
}: {
  calls: ToolCallMessage[];
  columns: ColumnDef[];
}): React.JSX.Element {
  const [detailIdx, setDetailIdx] = useState<number | null>(null);

  return (
    <div className="tool-group-table-wrap">
      <table className="tool-group-table">
        <thead>
          <tr>
            <th className="tool-group-th tool-group-th--num">#</th>
            {columns.map((col) => (
              <th key={col.key} className="tool-group-th" style={col.width ? { width: col.width } : undefined}>
                {col.label}
              </th>
            ))}
            <th className="tool-group-th tool-group-th--status">状态</th>
            <th className="tool-group-th tool-group-th--detail">详情</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((call, i) => {
            let args: Record<string, unknown>;
            try { args = JSON.parse(call.args || "{}"); }
            catch { args = {}; }
            const pending = call.result === undefined;
            return (
              <tr key={call.callId || i} className={pending ? "tool-group-tr--pending" : call.success === false ? "tool-group-tr--fail" : ""}>
                <td className="tool-group-td tool-group-td--num">{i + 1}</td>
                {columns.map((col) => (
                  <td key={col.key} className="tool-group-td">
                    {col.render ? col.render(args[col.key] ?? "") : String(args[col.key] ?? "")}
                  </td>
                ))}
                <td className="tool-group-td tool-group-td--status">
                  {pending
                    ? <span className="tool-group-pending">running…</span>
                    : call.success === false
                      ? <span className="chat-tool-fail">✗</span>
                      : <span className="chat-tool-ok">✓</span>}
                </td>
                <td className="tool-group-td tool-group-td--detail">
                  <button className="tool-group-detail-btn" onClick={() => setDetailIdx(i)}>📋</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {detailIdx !== null && (
        <DetailModal call={calls[detailIdx]} onClose={() => setDetailIdx(null)} />
      )}
    </div>
  );
}

/* ── Main group row ──────────────────────────────────────────────────── */

export const ToolGroupRow = memo(function ToolGroupRow({
  msg,
}: {
  msg: ToolGroupMessage;
}): React.JSX.Element {
  const { icon, label } = getToolMeta(msg.toolName);
  const total = msg.calls.length;
  const succeeded = msg.calls.filter(
    (c) => c.result !== undefined && c.success !== false,
  ).length;
  const failed = msg.calls.filter((c) => c.success === false).length;
  const pending = msg.calls.filter((c) => c.result === undefined).length;
  const allDone = pending === 0;

  const columns = useMemo(() => {
    const custom = getColumnsForTool(msg.toolName);
    if (custom) return custom;
    const firstArgs = msg.calls.find((c) => c.args)?.args || "";
    return fallbackColumns(firstArgs);
  }, [msg.toolName, msg.calls]);

  const statusParts: string[] = [];
  if (succeeded) statusParts.push(`${succeeded}✓`);
  if (failed) statusParts.push(`${failed}✗`);
  if (pending) statusParts.push(`${pending}…`);
  const statusStr = statusParts.join(" ");

  const [open, setOpen] = useState(total === 1 && !allDone);

  return (
    <div className="chat-message chat-message-agent chat-message-history">
      <HermesAvatar />
      <details
        className="chat-history chat-history--tool-group"
        open={open}
        onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="chat-history-header">
          <span className={`chat-history-chevron ${open ? "chat-history-chevron--open" : ""}`}>▸</span>
          <span className="chat-history-label">
            <span className="chat-tool-icon">{icon}</span>
            <span className="chat-tool-name">{label}</span>
            <span className="chat-group-summary">
              {total > 1 ? `${total}次调用 · ` : ""}
              {statusStr}
            </span>
          </span>
        </summary>
        <div className="chat-history-body">
          <ToolTable calls={msg.calls} columns={columns} />
        </div>
      </details>
    </div>
  );
});
