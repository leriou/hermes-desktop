import { memo, useEffect, useState } from "react";
import { Plus, Loader2, Circle, X, Clock } from "lucide-react";
import { useI18n } from "../../components/useI18n";
import { sessionDisplayPreview, sessionDisplayTitle } from "./sessionDisplay";

export type SessionStatus = "idle" | "streaming" | "error";

export interface SessionEntry {
  id: string;
  title: string;
  model: string;
  status: SessionStatus;
  updatedAt: number;
  messageCount: number;
  preview: string;
  dbSessionId?: string;
  unreadCount?: number;
}

interface HistorySession {
  id: string;
  title: string;
  startedAt: number;
  model: string;
  messageCount: number;
  preview?: string;
}

interface SessionSidebarProps {
  sessions: SessionEntry[];
  activeId: string | null;
  activeDbSessionId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onClose: (id: string) => void;
  onResumeSession: (sessionId: string) => void;
  profile?: string;
}

function StatusDot({ status }: { status: SessionStatus }): React.JSX.Element {
  if (status === "streaming") {
    return <Loader2 size={10} className="session-status-icon streaming" />;
  }
  if (status === "error") {
    return <Circle size={8} className="session-status-dot error" />;
  }
  return <Circle size={8} className="session-status-dot idle" />;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

const SessionItem = memo(function SessionItem({
  entry,
  isActive,
  onSelect,
  onClose,
}: {
  entry: SessionEntry;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <div
      className={`session-item ${isActive ? "active" : ""} ${entry.status}`}
      onClick={onSelect}
    >
      <div className="session-item-top">
        <StatusDot status={entry.status} />
        <span className="session-item-title">
          {sessionDisplayTitle(entry)}
        </span>
        {!!entry.unreadCount && (
          <span className="session-item-unread">{entry.unreadCount > 9 ? "9+" : entry.unreadCount}</span>
        )}
        <button
          className="session-item-close"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <X size={12} />
        </button>
      </div>
      <div className="session-item-bottom">
        <span className="session-item-preview">
          {sessionDisplayPreview(entry)}
        </span>
        <span className="session-item-time">
          {formatRelativeTime(entry.updatedAt)}
        </span>
      </div>
    </div>
  );
});

const HistoryItem = memo(function HistoryItem({
  session,
  isActive,
  onClick,
}: {
  session: HistorySession;
  isActive: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <div
      className={`session-item session-item-history ${isActive ? "active" : ""}`}
      onClick={onClick}
    >
      <div className="session-item-top">
        <Clock size={10} className="session-history-icon" />
        <span className="session-item-title">
          {sessionDisplayTitle(session)}
        </span>
      </div>
      <div className="session-item-bottom">
        <span className="session-item-preview">
          {sessionDisplayPreview(session)}
        </span>
        <span className="session-item-time">
          {formatRelativeTime(session.startedAt * 1000)}
        </span>
      </div>
    </div>
  );
});

export function SessionSidebar({
  sessions,
  activeId,
  activeDbSessionId,
  onSelect,
  onNewChat,
  onClose,
  onResumeSession,
  profile = "default",
}: SessionSidebarProps): React.JSX.Element {
  const { t } = useI18n();
  const [history, setHistory] = useState<HistorySession[]>(() => {
    try {
      const cached = localStorage.getItem(`hermes-session-cache:${profile}`);
      if (cached) {
        const { sessions, ts } = JSON.parse(cached);
        if (Date.now() - ts < 60_000 && Array.isArray(sessions)) {
          const threeDaysAgo = Math.floor(Date.now() / 1000) - 3 * 86400;
          return sessions.filter((s: HistorySession) => s.startedAt >= threeDaysAgo);
        }
      }
    } catch { /* ignore */ }
    return [];
  });
  useEffect(() => {
    let cancelled = false;
    (async (): Promise<void> => {
      try {
        const cached = await window.hermesAPI.listCachedSessions(profile, 30);
        if (cancelled) return;
        const threeDaysAgo = Math.floor(Date.now() / 1000) - 3 * 86400;
        const filtered = cached.filter((s: HistorySession) => s.startedAt >= threeDaysAgo);
        setHistory(filtered);
        try {
          localStorage.setItem(`hermes-session-cache:${profile}`, JSON.stringify({
            sessions: filtered,
            ts: Date.now(),
          }));
        } catch { /* storage full, ignore */ }
      } catch {
        // ignore — sidebar degrades gracefully without history
      }
    })();
    return (): void => { cancelled = true; };
  }, [profile]);

  // Build a set of db session IDs that are already open as tabs (excluding
  // the active one so it stays visible in history with a highlight).
  const openDbIds = new Set<string>();
  for (const s of sessions) {
    if (s.dbSessionId && s.dbSessionId !== activeDbSessionId) {
      openDbIds.add(s.dbSessionId);
    }
  }

  const dedupedHistory = history.filter((h) => !openDbIds.has(h.id));

  return (
    <div className="session-sidebar">
      <div className="session-sidebar-header drag-surface" data-tauri-drag-region>
        <button className="session-new-btn" onClick={onNewChat}>
          <Plus size={14} />
          {t("chat.newChat")}
        </button>
      </div>
      <div className="session-sidebar-list">
        {sessions.length > 0 && (
          <div className="session-sidebar-section">
            <div className="session-sidebar-section-label">
              {t("chat.activeChats")}
            </div>
            {sessions.map((s) => (
              <SessionItem
                key={s.id}
                entry={s}
                isActive={s.id === activeId}
                onSelect={() => onSelect(s.id)}
                onClose={() => onClose(s.id)}
              />
            ))}
          </div>
        )}
        {dedupedHistory.length > 0 && (
          <div className="session-sidebar-section">
            <div className="session-sidebar-section-label">
              {t("chat.recentHistory")}
            </div>
            {dedupedHistory.map((h) => (
              <HistoryItem
                key={h.id}
                session={h}
                isActive={h.id === activeDbSessionId}
                onClick={() => onResumeSession(h.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
