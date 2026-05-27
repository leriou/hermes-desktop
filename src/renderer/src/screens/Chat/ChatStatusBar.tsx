import { memo, useEffect, useState } from "react";
import type { UsageState } from "./types";

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${n}`;
}

function textBar(pct: number): string {
  const filled = Math.round((pct / 100) * 10);
  return (
    "█".repeat(Math.min(filled, 10)) + "░".repeat(10 - Math.min(filled, 10))
  );
}

interface ChatStatusBarProps {
  usage: UsageState | null;
  isLoading: boolean;
  hasMessages: boolean;
  sessionStart: number | null;
  responseStart: number | null;
  lastResponseDuration: number | null;
  verbose?: boolean;
  onToggleVerbose?: () => void;
}

export const ChatStatusBar = memo(function ChatStatusBar({
  usage,
  isLoading,
  hasMessages,
  sessionStart,
  responseStart,
  lastResponseDuration,
  verbose,
  onToggleVerbose,
}: ChatStatusBarProps): React.JSX.Element | null {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!hasMessages && !isLoading) return null;

  const contextPct = usage?.contextPercent ?? 0;
  const pct = Math.min(100, Math.round(contextPct));
  const used = usage?.contextUsed ?? usage?.totalTokens ?? 0;
  const max = usage?.contextMax;

  const segments: React.ReactNode[] = [];

  // Segment 1: Context usage
  if (usage) {
    segments.push(
      <span key="tokens" className="chat-status-segment">
        {max
          ? `${fmtTokens(used)}/${fmtTokens(max)}`
          : `${fmtTokens(usage.totalTokens)}`}
      </span>,
    );
  }

  // Segment 2: Context progress bar
  if (pct > 0) {
    segments.push(
      <span key="bar" className="chat-status-segment chat-status-progress">
        <span
          className={`chat-status-bar-fill-${pct > 95 ? "critical" : pct > 80 ? "warn" : "ok"}`}
        >
          {textBar(pct)}
        </span>
        <span className="chat-status-pct">{pct}%</span>
      </span>,
    );
  }

  // Segment 3: Session duration
  if (sessionStart) {
    segments.push(
      <span key="session" className="chat-status-segment">
        {fmtDuration(now - sessionStart)}
      </span>,
    );
  }

  // Segment 4: Response time
  if (isLoading && responseStart) {
    segments.push(
      <span key="resp" className="chat-status-segment chat-status-live">
        <span className="chat-status-dot" />⏲ {fmtDuration(now - responseStart)}
      </span>,
    );
  } else if (lastResponseDuration != null) {
    segments.push(
      <span key="resp" className="chat-status-segment">
        ⏲ {fmtDuration(lastResponseDuration)}
      </span>,
    );
  }

  if (segments.length === 0) return null;

  return (
    <span className="chat-status-inline">
      {segments.map((seg, i) => (
        <span key={i}>
          {i > 0 && <span className="chat-status-divider">│</span>}
          {seg}
        </span>
      ))}
      {onToggleVerbose && (
        <>
          <span className="chat-status-divider">│</span>
          <button
            className={`chat-status-verbose-btn ${verbose ? "chat-status-verbose-active" : ""}`}
            onClick={onToggleVerbose}
            aria-label={verbose ? "Compact tool display" : "Verbose tool display"}
          >
            {verbose ? "⊒" : "⊟"}
            <span className="chat-status-verbose-tooltip">
              {verbose ? "Compact tool display" : "Verbose tool display"}
            </span>
          </button>
        </>
      )}
    </span>
  );
});
