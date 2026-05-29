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
      context: call.context,
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
          <DetailSection label="Args" value={call.args || call.context || ""} />
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

/* ── Friendly Tool Parameter Translator ───────────────────────────── */

export function getFriendlyToolDescription(toolName: string, argsStr: string): {
  icon: string;
  action: string;
  detail: string;
} {
  let argsObj: Record<string, any> = {};
  try {
    argsObj = JSON.parse(argsStr || "{}");
  } catch {
    // ignore
  }

  const nameLower = toolName.toLowerCase();
  
  if (
    nameLower === "run_command" ||
    nameLower.includes("terminal") ||
    nameLower === "execute_command" ||
    nameLower === "shell" ||
    nameLower.includes("shell")
  ) {
    const cmd =
      argsObj.CommandLine ||
      argsObj.command ||
      argsObj.code ||
      argsObj.cmd ||
      argsStr ||
      "";
    return {
      icon: "💻",
      action: "Run command",
      detail: cmd,
    };
  }
  
  if (nameLower === "write_to_file" || nameLower === "write_file") {
    const file = argsObj.TargetFile || argsObj.path || argsObj.filename || "";
    return {
      icon: "✍️",
      action: "Create file",
      detail: file,
    };
  }
  
  if (nameLower === "replace_file_content") {
    const file = argsObj.TargetFile || argsObj.path || "";
    return {
      icon: "📝",
      action: "Edit file",
      detail: file,
    };
  }

  if (nameLower === "multi_replace_file_content") {
    const file = argsObj.TargetFile || argsObj.path || "";
    const chunks = Array.isArray(argsObj.ReplacementChunks) ? argsObj.ReplacementChunks.length : 0;
    return {
      icon: "🛠️",
      action: `Edit file (${chunks} chunks)`,
      detail: file,
    };
  }

  if (nameLower === "view_file" || nameLower === "read_file") {
    const file = argsObj.AbsolutePath || argsObj.path || "";
    return {
      icon: "🔍",
      action: "View file",
      detail: file,
    };
  }

  if (nameLower === "list_dir") {
    const dir = argsObj.DirectoryPath || argsObj.path || "";
    return {
      icon: "📁",
      action: "List directory",
      detail: dir,
    };
  }

  if (nameLower === "grep_search") {
    const query = argsObj.Query || "";
    const path = argsObj.SearchPath || "";
    const pathName = path.split("/").pop() || "";
    return {
      icon: "🔎",
      action: "Search code",
      detail: `"${query}"${pathName ? ` in ${pathName}` : ""}`,
    };
  }

  if (nameLower === "ask_permission") {
    const action = argsObj.Action || "";
    const target = argsObj.Target || "";
    return {
      icon: "🔑",
      action: "Request permission",
      detail: `${action} on ${target}`,
    };
  }

  if (nameLower === "search_web") {
    const query = argsObj.query || "";
    return {
      icon: "🌐",
      action: "Search web",
      detail: query,
    };
  }

  if (nameLower === "search_extract") {
    const query = argsObj.query || "";
    return {
      icon: "📄",
      action: "Search & Extract",
      detail: query,
    };
  }

  if (nameLower === "mcp_web_search_prime_web_search_prime") {
    const query = argsObj.search_query || argsObj.query || "";
    return {
      icon: "🌐",
      action: "Web Search",
      detail: query,
    };
  }

  // fallback
  const firstVal = Object.values(argsObj).find((v) => typeof v === "string" && v.length > 0) || "";
  return {
    icon: "🔧",
    action: toolName,
    detail: String(firstVal || argsStr || ""),
  };
}

/* ── Single Tool Footprint (TUI-style) ──────────────────────── */

function SingleToolFootprint({
  call,
  toolName,
}: {
  call: ToolCallMessage;
  toolName: string;
}): React.JSX.Element {
  const [showDetail, setShowDetail] = useState(false);
  const pending = call.result === undefined;
  
  const desc = getFriendlyToolDescription(toolName, call.args || call.context || "");
  const summary = desc.detail;
  const truncatedSummary =
    summary.length > 80 ? summary.slice(0, 80) + "…" : summary;

  return (
    <div className={`chat-tool-single-footprint ${
      pending
        ? "chat-tool-single-footprint--pending"
        : call.success === false
          ? "chat-tool-single-footprint--fail"
          : ""
    }`}>
      <div className="chat-tool-single-left">
        <div className="chat-tool-single-line" />
        <div
          className={`chat-tool-single-dot ${
            pending
              ? "chat-tool-single-dot--pending"
              : call.success === false
                ? "chat-tool-single-dot--fail"
                : "chat-tool-single-dot--success"
          }`}
        >
          {pending ? (
            <span className="chat-tool-single-spinner" />
          ) : call.success === false ? (
            "✗"
          ) : (
            "✓"
          )}
        </div>
      </div>
      <div className="chat-tool-single-body">
        <span className="chat-tool-single-label">
          {desc.icon} {desc.action}
        </span>
        {truncatedSummary && (
          <code className="chat-tool-single-code" title={summary}>
            {truncatedSummary}
          </code>
        )}
        {call.progress && (
          <span className="chat-tool-single-progress" title={call.progress}>
            · {call.progress}
          </span>
        )}
      </div>
      <div className="chat-tool-single-right">
        {call.durationS !== undefined && (
          <span className="chat-tool-single-duration">
            {call.durationS.toFixed(1)}s
          </span>
        )}
        <button
          className="chat-tool-single-detail-btn"
          onClick={() => setShowDetail(true)}
          title="查看完整详情"
          aria-label={`查看第 1 次 ${toolName} 调用详情`}
        >
          <ClipboardList size={12} />
        </button>
      </div>

      {showDetail && (
        <DetailModal
          call={call}
          index={0}
          onClose={() => setShowDetail(false)}
        />
      )}
    </div>
  );
}

/* ── Tool table (For multiple tools) ────────────────────────────────── */

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
                    {Object.keys(args).length === 0 && col.key === "context"
                      ? call.context || ""
                      : col.render
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

/* ── Main Entry Component ─────────────────────────────────────────── */

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
    const firstArgs =
      msg.calls.find((c) => c.args)?.args ||
      (msg.calls.some((c) => c.context) ? JSON.stringify({ context: "" }) : "");
    return fallbackColumns(firstArgs);
  }, [msg.toolName, msg.calls]);

  const statusParts: string[] = [];
  if (succeeded) statusParts.push(`${succeeded}✓`);
  if (failed) statusParts.push(`${failed}✗`);
  if (pending) statusParts.push(`${pending}…`);
  const statusStr = statusParts.join(" ");

  const [open, setOpen] = useState(!allDone);

  useEffect(() => {
    if (!allDone) {
      setOpen(true);
    }
  }, [allDone]);

  if (total === 1) {
    return <SingleToolFootprint call={msg.calls[0]} toolName={msg.toolName} />;
  }

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
