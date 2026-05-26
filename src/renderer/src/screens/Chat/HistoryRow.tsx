import { memo, useState } from "react";
import { useI18n } from "../../components/useI18n";
import { AttachmentChip } from "../../components/AttachmentChip";
import { HermesAvatar } from "./MessageRow";
import type {
  Attachment,
  ReasoningMessage,
  ToolCallMessage,
  ToolResultMessage,
} from "./types";

/* ── Tool category → icon mapping ──────────────────────────────────────── */

interface ToolMeta {
  icon: string;
  label: string;
}

export function getToolMeta(name: string): ToolMeta {
  const n = name.toLowerCase();
  if (n === "terminal") return { icon: "\u{1F4BB}", label: "Terminal" };
  if (n === "execute_code") return { icon: "\u{1F528}", label: "Code" };
  if (n === "patch") return { icon: "\u{270F}\u{FE0F}", label: "Patch" };
  if (n === "write_file") return { icon: "\u{1F4BE}", label: "Write" };
  if (n === "read_file") return { icon: "\u{1F4C4}", label: "Read" };
  if (n === "search_files") return { icon: "\u{1F50D}", label: "Search" };
  if (n.includes("task_tree") || n.includes("task-tree"))
    return { icon: "\u{1F333}", label: "Task Tree" };
  if (n === "todo") return { icon: "\u{2611}", label: "Todo" };
  if (n === "delegate_task") return { icon: "\u{1F465}", label: "Delegate" };
  if (n === "memory") return { icon: "\u{1F9E0}", label: "Memory" };
  if (n === "fact_store") return { icon: "\u{1F4CB}", label: "Fact Store" };
  if (n.includes("byterover") || n.includes("brv_"))
    return { icon: "\u{1F50E}", label: "ByteRover" };
  if (n.includes("mcp_zread")) return { icon: "\u{1F4DA}", label: "ZRead" };
  if (n === "skill_view" || n === "skill_manage")
    return { icon: "\u{1F9E9}", label: "Skill" };
  if (n === "web_extract" || n === "web_search" || n.includes("browse"))
    return { icon: "\u{1F310}", label: "Web" };
  if (n === "mcp_web_search_prime_web_search_prime")
    return { icon: "\u{1F310}", label: "Web Search" };
  if (n === "search_extract")
    return { icon: "\u{1F4C4}", label: "Search & Extract" };
  if (n === "search_web")
    return { icon: "\u{1F50D}", label: "Search Web" };
  if (n === "process") return { icon: "\u{2699}", label: "Process" };
  if (n === "relay_mcp") return { icon: "\u{1F517}", label: "Relay" };
  if (n.includes("kanban")) return { icon: "\u{1F4CA}", label: "Kanban" };
  if (n.includes("compress") || n.includes("compact"))
    return { icon: "\u{1F4E6}", label: "Compress" };
  if (n.includes("memory")) return { icon: "\u{1F9E0}", label: "Memory" };
  if (n.includes("fact")) return { icon: "\u{1F4CB}", label: "Fact Store" };
  if (n.includes("cron")) return { icon: "\u{23F0}", label: "Cron" };
  return { icon: "\u{1F527}", label: name };
}

/* ── Shared collapsible primitive ─────────────────────────────────────── */

interface CollapsibleSectionProps {
  variant: "reasoning" | "tool-call" | "tool-result";
  header: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const Chevron = memo(function Chevron({
  open,
}: {
  open: boolean;
}): React.JSX.Element {
  return (
    <span
      className={`chat-history-chevron ${
        open ? "chat-history-chevron--open" : ""
      }`}
      aria-hidden="true"
    >
      ▸
    </span>
  );
});

const CollapsibleSection = memo(function CollapsibleSection({
  variant,
  header,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className={`chat-history chat-history--${variant}`}
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="chat-history-header">
        <Chevron open={open} />
        {header}
      </summary>
      <div className="chat-history-body">{children}</div>
    </details>
  );
});

/* ── Reasoning ────────────────────────────────────────────────────────── */

export const ReasoningRow = memo(function ReasoningRow({
  msg,
  defaultOpen = false,
}: {
  msg:
    | ReasoningMessage
    | { id: string; kind: "live_reasoning"; role: "agent"; text: string };
  defaultOpen?: boolean;
}): React.JSX.Element {
  const { t } = useI18n();
  const lineCount = msg.text.split("\n").length;
  return (
    <div className="chat-message chat-message-agent chat-message-history">
      <HermesAvatar />
      <CollapsibleSection
        variant="reasoning"
        defaultOpen={defaultOpen}
        header={
          <span className="chat-history-label">
            <span className="chat-history-title">{t("chat.thinking")}</span>
            <span className="chat-history-meta">
              {lineCount} {lineCount === 1 ? "line" : "lines"}
            </span>
          </span>
        }
      >
        <pre className="chat-history-pre">{msg.text}</pre>
      </CollapsibleSection>
    </div>
  );
});

/* ── Compact Tool Row (merged call + result) ───────────────────────────── */

function summarise(text: string, maxLen = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= maxLen) return flat;
  return flat.slice(0, maxLen - 1) + "…";
}

export const ToolRow = memo(function ToolRow({
  msg,
  verbose,
}: {
  msg: ToolCallMessage;
  verbose: boolean;
}): React.JSX.Element {
  const { icon, label } = getToolMeta(msg.name);
  const hasResult = msg.result !== undefined;
  const resultShort = hasResult ? summarise(msg.result!) : undefined;
  const pending = !hasResult;

  if (verbose) {
    return (
      <div className="chat-message chat-message-agent chat-message-history">
        <HermesAvatar />
        <CollapsibleSection
          variant="tool-call"
          defaultOpen={true}
          header={
            <span className="chat-history-label">
              <span className="chat-tool-icon">{icon}</span>
              <span className="chat-history-tool-name">{msg.name}</span>
              {pending && <span className="chat-tool-pending">running…</span>}
              {!pending && msg.success === false && (
                <span className="chat-tool-fail">failed</span>
              )}
              {!pending && msg.success !== false && resultShort && (
                <span className="chat-tool-result-short">{resultShort}</span>
              )}
            </span>
          }
        >
          {msg.fallbackWarning && (
            <div className="chat-fallback-warning">⚠ {msg.fallbackWarning}</div>
          )}
          {msg.args && (
            <div className="chat-tool-section">
              <div className="chat-tool-section-label">Args</div>
              <pre className="chat-history-pre chat-history-pre--code">
                {msg.args}
              </pre>
            </div>
          )}
          {hasResult && (
            <div className="chat-tool-section">
              <div className="chat-tool-section-label">Result</div>
              <pre className="chat-history-pre chat-history-pre--scroll">
                {msg.result || "(empty)"}
              </pre>
            </div>
          )}
        </CollapsibleSection>
      </div>
    );
  }

  // Compact mode: one-line status bar
  return (
    <>
      <div
        className={`chat-tool-row ${pending ? "chat-tool-row--pending" : msg.success === false ? "chat-tool-row--fail" : "chat-tool-row--ok"}`}
      >
        <span className="chat-tool-icon">{icon}</span>
        <span className="chat-tool-name">{label}</span>
        {pending && <span className="chat-tool-pending">running…</span>}
        {!pending && resultShort && (
          <span className="chat-tool-result-inline">{resultShort}</span>
        )}
        {!pending && msg.success === false && (
          <span className="chat-tool-fail">✗</span>
        )}
        {!pending && msg.success !== false && (
          <span className="chat-tool-ok">✓</span>
        )}
      </div>
      {msg.fallbackWarning && (
        <div className="chat-fallback-warning">⚠ {msg.fallbackWarning}</div>
      )}
    </>
  );
});

/* ── Legacy ToolResultRow (for old messages without merged data) ────── */

export const ToolResultRow = memo(function ToolResultRow({
  msg,
}: {
  msg: ToolResultMessage;
}): React.JSX.Element {
  const { t } = useI18n();
  const lines = (msg.content || "").split("\n").length;
  const hasAttachments = !!msg.attachments && msg.attachments.length > 0;
  return (
    <div className="chat-message chat-message-agent chat-message-history">
      <HermesAvatar />
      <CollapsibleSection
        variant="tool-result"
        header={
          <span className="chat-history-label">
            <span className="chat-history-title">{t("chat.toolResult")}</span>
            <span className="chat-history-tool-name">{msg.name}</span>
            <span className="chat-history-meta">
              {lines} {lines === 1 ? "line" : "lines"}
              {hasAttachments
                ? ` · ${msg.attachments!.length} attachment${
                    msg.attachments!.length === 1 ? "" : "s"
                  }`
                : ""}
            </span>
          </span>
        }
      >
        {hasAttachments && (
          <div className="chat-history-attachments">
            {msg.attachments!.map((att: Attachment) => (
              <AttachmentChip key={att.id} attachment={att} />
            ))}
          </div>
        )}
        <pre className="chat-history-pre chat-history-pre--scroll">
          {msg.content || "(empty)"}
        </pre>
      </CollapsibleSection>
    </div>
  );
});
