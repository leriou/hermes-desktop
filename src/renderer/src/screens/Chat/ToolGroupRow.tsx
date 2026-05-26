import { copyToClipboard } from "@renderer/lib/hermes-tauri";
import { memo, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardList, X } from "lucide-react";
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

function buildRawInspect(call: ToolCallMessage): string {
  return JSON.stringify(
    {
      callId: call.callId,
      name: call.name,
      args: call.args || "",
      progress: call.progress,
      result: call.result,
      success: call.success,
      durationS: call.durationS,
      fallbackWarning: call.fallbackWarning,
      inlineDiff: call.inlineDiff,
    },
    null,
    2,
  );
}

function DetailSection({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <details className="tool-detail-section" open>
      <summary className="tool-detail-section-label">
        <span>{label}</span>
        <button
          className="tool-detail-copy"
          onClick={(event) => {
            event.preventDefault();
            void copyToClipboard(value);
          }}
        >
          Copy
        </button>
      </summary>
      <pre className="tool-detail-pre">{tryFormatJson(value || "(empty)")}</pre>
    </details>
  );
}

/* ── Detail modal ───────────────────────────────────────────────────── */

function DetailModal({
  call,
  index,
  onClose,
}: {
  call: ToolCallMessage;
  index: number;
  onClose: () => void;
}): React.JSX.Element {
  const pending = call.result === undefined;
  const status = pending
    ? "running"
    : call.success === false
      ? "failed"
      : "succeeded";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="tool-detail-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${call.name} 调用详情`}
    >
      <div className="tool-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tool-detail-header">
          <div className="tool-detail-heading">
            <span className="tool-detail-title">{call.name}</span>
            <span
              className={`tool-detail-status tool-detail-status--${status}`}
            >
              {status}
            </span>
          </div>
          <button
            className="tool-detail-close"
            onClick={onClose}
            aria-label="关闭工具调用详情"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="tool-detail-meta">
          <span>#{index + 1}</span>
          {call.callId && <span>{call.callId}</span>}
          {call.durationS !== undefined && (
            <span>{call.durationS.toFixed(1)}s</span>
          )}
        </div>
        <div className="tool-detail-body">
          {call.progress && (
            <DetailSection label="Progress" value={call.progress} />
          )}
          {call.fallbackWarning && (
            <DetailSection label="Warning" value={call.fallbackWarning} />
          )}
          <DetailSection label="Args" value={call.args || ""} />
          {call.result !== undefined && (
            <DetailSection label="Result" value={call.result || ""} />
          )}
          {call.inlineDiff && (
            <DetailSection label="Diff" value={call.inlineDiff} />
          )}
          <DetailSection label="Raw" value={buildRawInspect(call)} />
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
              <th
                key={col.key}
                className="tool-group-th"
                style={col.width ? { width: col.width } : undefined}
              >
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
            try {
              args = JSON.parse(call.args || "{}");
            } catch {
              args = {};
            }
            const pending = call.result === undefined;
            return (
              <tr
                key={call.callId || i}
                className={
                  pending
                    ? "tool-group-tr--pending"
                    : call.success === false
                      ? "tool-group-tr--fail"
                      : ""
                }
              >
                <td className="tool-group-td tool-group-td--num">{i + 1}</td>
                {columns.map((col) => (
                  <td key={col.key} className="tool-group-td">
                    {col.render
                      ? col.render(args[col.key] ?? "")
                      : String(args[col.key] ?? "")}
                  </td>
                ))}
                <td className="tool-group-td tool-group-td--status">
                  {pending ? (
                    <span className="tool-group-pending">running…</span>
                  ) : call.success === false ? (
                    <span className="chat-tool-fail">✗</span>
                  ) : (
                    <span className="chat-tool-ok">✓</span>
                  )}
                </td>
                <td className="tool-group-td tool-group-td--detail">
                  <button
                    className="tool-group-detail-btn"
                    onClick={() => setDetailIdx(i)}
                    aria-label={`查看第 ${i + 1} 次 ${call.name} 调用详情`}
                    title="查看详情"
                  >
                    <ClipboardList size={14} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {detailIdx !== null && (
        <DetailModal
          call={calls[detailIdx]}
          index={detailIdx}
          onClose={() => setDetailIdx(null)}
        />
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
          <span
            className={`chat-history-chevron ${open ? "chat-history-chevron--open" : ""}`}
          >
            ▸
          </span>
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
