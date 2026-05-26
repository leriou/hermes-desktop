import { copyToClipboard, listCachedSessions, searchSessions, syncSessionCache } from "@renderer/lib/hermes-tauri";
import { useEffect, useState, useRef, useCallback, memo, useMemo } from "react";
import { Plus, Search, X, ChatBubble, ChevronDown, ChevronRight, Copy, Check } from "../../assets/icons";
import { useI18n } from "../../components/useI18n";
import {
  baseSessionTitle,
  parseTitleSegment,
  sessionDisplayTitle,
} from "../Chat/sessionDisplay";

interface CachedSession {
  id: string;
  title: string;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
}

interface SearchResult {
  sessionId: string;
  title: string | null;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
  snippet: string;
}

interface SessionsProps {
  onResumeSession: (sessionId: string) => void;
  onNewChat: () => void;
  currentSessionId: string | null;
  visible: boolean;
  profile?: string;
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatFullDate(ts: number): string {
  const d = new Date(ts * 1000);
  return (
    d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

type DateGroup = "today" | "yesterday" | "thisWeek" | "earlier";

function getDateGroup(ts: number): DateGroup {
  const d = new Date(ts * 1000);
  const now = new Date();

  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) return "today";

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return "yesterday";

  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (d >= weekAgo) return "thisWeek";

  return "earlier";
}

function groupSessions(
  sessions: CachedSession[],
): Array<{ label: DateGroup; sessions: CachedSession[] }> {
  const groups = new Map<DateGroup, CachedSession[]>();
  for (const s of sessions) {
    const group = getDateGroup(s.startedAt);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(s);
  }
  const order: DateGroup[] = ["today", "yesterday", "thisWeek", "earlier"];
  return order
    .filter((label) => groups.has(label))
    .map((label) => ({ label, sessions: groups.get(label)! }));
}

function highlightSnippet(snippet: string): React.JSX.Element {
  const parts = snippet.split(/(<<.*?>>)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith("<<") && part.endsWith(">>")) {
          return <mark key={i}>{part.slice(2, -2)}</mark>;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

function formatModel(model: string): string {
  const name = model.split("/").pop() || model;
  return name.split(":")[0];
}

interface TitleGroup {
  base: string;
  sessions: CachedSession[];
}

function groupByBaseTitle(sessions: CachedSession[]): TitleGroup[] {
  const map = new Map<string, CachedSession[]>();
  const order: string[] = [];
  for (const s of sessions) {
    const parsed = parseTitleSegment(s.title);
    const key = parsed ? parsed.base : baseSessionTitle(s.title) || s.id;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(s);
  }
  return order.map((key) => ({ base: key, sessions: map.get(key)! }));
}

// Source tag color mapping
const SOURCE_STYLES: Record<string, string> = {
  cli: "sessions-tag-source--cli",
  tui: "sessions-tag-source--tui",
  cron: "sessions-tag-source--cron",
  api: "sessions-tag-source--api",
  gateway: "sessions-tag-source--gateway",
  webhook: "sessions-tag-source--webhook",
};

function sourceTagClass(source: string): string {
  return `sessions-tag sessions-tag--source ${SOURCE_STYLES[source] || "sessions-tag-source--default"}`;
}

// Filter types
type SourceFilter = "all" | "cli" | "tui" | "cron";
type MsgCountFilter = "all" | "1-20" | "21-50" | "50-100" | ">100";

function matchesMsgCount(count: number, filter: MsgCountFilter): boolean {
  switch (filter) {
    case "1-20": return count >= 1 && count <= 20;
    case "21-50": return count >= 21 && count <= 50;
    case "50-100": return count >= 50 && count <= 100;
    case ">100": return count > 100;
    default: return true;
  }
}

function matchesSource(source: string, filter: SourceFilter): boolean {
  if (filter === "all") return true;
  return source === filter;
}

// Copy button with feedback
function CopyIdButton({ id }: { id: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    void copyToClipboard(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [id]);

  return (
    <button
      className="sessions-copy-id"
      onClick={handleCopy}
      title={id}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      <span className="sessions-copy-id-text">{id.slice(0, 8)}</span>
    </button>
  );
}

// Memoized session card — compact single-row layout
const SessionCard = memo(function SessionCard({
  session,
  isActive,
  showFullDate,
  onClick,
}: {
  session: CachedSession;
  isActive: boolean;
  showFullDate: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`sessions-card ${isActive ? "sessions-card--active" : ""}`}
      onClick={onClick}
    >
      <div className="sessions-card-row">
        <span className={sourceTagClass(session.source)}>
          {session.source}
        </span>
        <span className="sessions-card-title">
          {sessionDisplayTitle(session)}
        </span>
        <span className="sessions-card-count">
          {session.messageCount}
        </span>
        <span className="sessions-card-time">
          {showFullDate
            ? formatFullDate(session.startedAt)
            : formatTime(session.startedAt)}
        </span>
      </div>
      <div className="sessions-card-footer">
        {session.model && (
          <span className="sessions-tag sessions-tag--model">
            {formatModel(session.model)}
          </span>
        )}
        <span className="sessions-card-footer-spacer" />
        <CopyIdButton id={session.id} />
      </div>
    </button>
  );
});

export const SESSIONS_REFRESH_MS = 30_000;

function Sessions({
  onResumeSession,
  onNewChat,
  currentSessionId,
  visible,
  profile = "default",
}: SessionsProps): React.JSX.Element {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<CachedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [displayLimit, setDisplayLimit] = useState(50);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [msgCountFilter, setMsgCountFilter] = useState<MsgCountFilter>("all");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredSessions = useMemo(() => {
    if (sourceFilter === "all" && msgCountFilter === "all") return sessions;
    return sessions.filter(
      (s) => matchesSource(s.source, sourceFilter) && matchesMsgCount(s.messageCount, msgCountFilter),
    );
  }, [sessions, sourceFilter, msgCountFilter]);

  const grouped = useMemo(() => groupSessions(filteredSessions), [filteredSessions]);

  const refreshSessions = useCallback(async (): Promise<void> => {
    const synced = await syncSessionCache(profile);
    if (synced) setSessions(synced);
  }, [profile]);

  const loadSessions = useCallback(async (): Promise<void> => {
    setLoading(true);
    const cached = await listCachedSessions(profile, 100);
    if (cached && cached.length > 0) {
      setSessions(cached);
      setLoading(false);
    }
    const synced = await syncSessionCache(profile);
    if (synced) setSessions(synced);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (visible) {
      syncSessionCache(profile).then(setSessions);
    }
  }, [visible, profile]);

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => {
      void refreshSessions();
    }, SESSIONS_REFRESH_MS);
    const onFocus = (): void => {
      void refreshSessions();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [visible, refreshSessions]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimer.current = setTimeout(async () => {
      const results = (await searchSessions(searchQuery, 50, profile)) ?? [];
      setSearchResults(results);
      setIsSearching(false);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery, profile]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      if (displayLimit < sessions.length) {
        setDisplayLimit(prev => prev + 50);
      }
    }
  }, [displayLimit, sessions.length]);

  const isShowingSearch = searchQuery.trim().length > 0;

  const toggleGroup = useCallback((key: string): void => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const visibleSessions = useMemo(() => {
    if (isShowingSearch) return [];
    let count = 0;
    const result: Array<{ label: DateGroup; sessions: CachedSession[] }> = [];
    for (const group of grouped) {
      if (count >= displayLimit) break;
      const filteredSessionsGroup: CachedSession[] = [];
      for (const s of group.sessions) {
        if (count >= displayLimit) break;
        filteredSessionsGroup.push(s);
        count++;
      }
      if (filteredSessionsGroup.length > 0) {
        result.push({ ...group, sessions: filteredSessionsGroup });
      }
    }
    return result;
  }, [grouped, displayLimit, isShowingSearch]);

  const filteredSearchResults = useMemo(() => {
    if (sourceFilter === "all" && msgCountFilter === "all") return searchResults;
    return searchResults.filter(
      (r) => matchesSource(r.source, sourceFilter) && matchesMsgCount(r.messageCount, msgCountFilter),
    );
  }, [searchResults, sourceFilter, msgCountFilter]);

  const sourceFilters: { key: SourceFilter; label: string }[] = [
    { key: "all", label: t("sessions.filterAll") },
    { key: "cli", label: "CLI" },
    { key: "tui", label: "TUI" },
    { key: "cron", label: "Cron" },
  ];

  const msgCountFilters: { key: MsgCountFilter; label: string }[] = [
    { key: "all", label: t("sessions.filterAll") },
    { key: "1-20", label: "1–20" },
    { key: "21-50", label: "21–50" },
    { key: "50-100", label: "50–100" },
    { key: ">100", label: ">100" },
  ];

  const hasActiveFilters = sourceFilter !== "all" || msgCountFilter !== "all";

  return (
    <div className="sessions-container">
      <div className="sessions-header">
        <div className="sessions-header-top">
          <h2 className="sessions-title">{t("sessions.title")}</h2>
          <button className="btn btn-primary " onClick={onNewChat}>
            <Plus size={14} />
            {t("sessions.newChat")}
          </button>
        </div>
        <div className="sessions-searchbar">
          <Search size={14} className="sessions-searchbar-icon" />
          <input
            ref={searchRef}
            className="sessions-searchbar-input"
            type="text"
            placeholder={t("sessions.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="btn-ghost sessions-searchbar-clear"
              onClick={() => {
                setSearchQuery("");
                searchRef.current?.focus();
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="sessions-filter-bar">
          <div className="sessions-filter-group">
            <span className="sessions-filter-label">{t("sessions.filterType")}</span>
            {sourceFilters.map((f) => (
              <button
                key={f.key}
                className={`sessions-filter-pill ${sourceFilter === f.key ? "sessions-filter-pill--active" : ""}`}
                onClick={() => setSourceFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="sessions-filter-group">
            <span className="sessions-filter-label">{t("sessions.filterMsgCount")}</span>
            {msgCountFilters.map((f) => (
              <button
                key={f.key}
                className={`sessions-filter-pill ${msgCountFilter === f.key ? "sessions-filter-pill--active" : ""}`}
                onClick={() => setMsgCountFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          {hasActiveFilters && (
            <button
              className="sessions-filter-clear"
              onClick={() => {
                setSourceFilter("all");
                setMsgCountFilter("all");
              }}
            >
              <X size={11} /> {t("sessions.filterClear")}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="sessions-loading">
          <div className="loading-spinner" />
        </div>
      ) : isShowingSearch ? (
        isSearching ? (
          <div className="sessions-loading">
            <div className="loading-spinner" />
          </div>
        ) : filteredSearchResults.length === 0 ? (
          <div className="sessions-empty">
            <Search size={32} className="sessions-empty-icon" />
            <p className="sessions-empty-text">{t("sessions.noResults")}</p>
            <p className="sessions-empty-hint">{t("sessions.noResultsHint")}</p>
          </div>
        ) : (
          <div className="sessions-list">
            {filteredSearchResults.map((r) => (
              <button
                key={r.sessionId}
                className={`sessions-card ${currentSessionId === r.sessionId ? "sessions-card--active" : ""}`}
                onClick={() => onResumeSession(r.sessionId)}
              >
                <div className="sessions-card-row">
                  <span className={sourceTagClass(r.source)}>
                    {r.source}
                  </span>
                  <span className="sessions-card-title">
                    {sessionDisplayTitle({ title: r.title, preview: r.snippet }) ||
                      `${t("sessions.title")} ${r.sessionId.slice(-6)}`}
                  </span>
                  <span className="sessions-card-count">
                    {r.messageCount}
                  </span>
                  <span className="sessions-card-time">
                    {formatFullDate(r.startedAt)}
                  </span>
                </div>
                {r.snippet && (
                  <div className="sessions-result-snippet">
                    {highlightSnippet(r.snippet)}
                  </div>
                )}
                <div className="sessions-card-footer">
                  {r.model && (
                    <span className="sessions-tag sessions-tag--model">
                      {formatModel(r.model)}
                    </span>
                  )}
                  <span className="sessions-card-footer-spacer" />
                  <CopyIdButton id={r.sessionId} />
                </div>
              </button>
            ))}
          </div>
        )
      ) : sessions.length === 0 ? (
        <div className="sessions-empty">
          <ChatBubble size={32} className="sessions-empty-icon" />
          <p className="sessions-empty-text">{t("sessions.empty")}</p>
          <p className="sessions-empty-hint">{t("sessions.emptyHint")}</p>
        </div>
      ) : (
        <div className="sessions-list" onScroll={handleScroll} ref={scrollRef}>
          {visibleSessions.map((group) => {
            const clusters = groupByBaseTitle(group.sessions);
            return (
              <div key={group.label} className="sessions-group">
                <div className="sessions-group-label">
                  {t(`sessions.${group.label}`)}
                </div>
                {clusters.map((cluster) => {
                  const isMulti = cluster.sessions.length > 1;
                  const groupKey = `${group.label}:${cluster.base}`;
                  const isExpanded = expandedGroups.has(groupKey);

                  if (!isMulti) {
                    return (
                      <SessionCard
                        key={cluster.sessions[0].id}
                        session={cluster.sessions[0]}
                        isActive={currentSessionId === cluster.sessions[0].id}
                        showFullDate={
                          group.label === "thisWeek" || group.label === "earlier"
                        }
                        onClick={() => onResumeSession(cluster.sessions[0].id)}
                      />
                    );
                  }

                  const sorted = [...cluster.sessions].sort((a, b) => {
                    const sa = parseTitleSegment(a.title);
                    const sb = parseTitleSegment(b.title);
                    return (sa?.segment ?? 1) - (sb?.segment ?? 1);
                  });
                  const hasActive = sorted.some((s) => s.id === currentSessionId);
                  const totalMsgs = sorted.reduce((n, s) => n + s.messageCount, 0);
                  const latest = sorted[sorted.length - 1];

                  return (
                    <div key={groupKey} className="sessions-cluster">
                      <button
                        className={`sessions-cluster-header ${hasActive ? "sessions-cluster-header--active" : ""}`}
                        onClick={() => toggleGroup(groupKey)}
                      >
                        <div className="sessions-cluster-main">
                          <span className={sourceTagClass(latest.source)}>
                            {latest.source}
                          </span>
                          <span className="sessions-cluster-title">
                            {cluster.base}
                          </span>
                          <span className="sessions-card-count">
                            {totalMsgs}
                          </span>
                          <span className="sessions-card-time">
                            {group.label === "thisWeek" || group.label === "earlier"
                              ? formatFullDate(latest.startedAt)
                              : formatTime(latest.startedAt)}
                          </span>
                        </div>
                        <div className="sessions-cluster-footer">
                          <span className="sessions-cluster-meta">
                            {sorted.length} {t("sessions.parts")}
                          </span>
                          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="sessions-cluster-items">
                          {sorted.map((s) => (
                            <div
                              key={s.id}
                              className={`sessions-cluster-item ${currentSessionId === s.id ? "sessions-cluster-item--active" : ""}`}
                              onClick={() => onResumeSession(s.id)}
                            >
                              <span className={sourceTagClass(s.source)}>
                                {s.source}
                              </span>
                              <span className="sessions-cluster-item-seg">
                                #{parseTitleSegment(s.title)?.segment ?? "?"}
                              </span>
                              <span className="sessions-cluster-item-model">
                                {s.model ? formatModel(s.model) : ""}
                              </span>
                              <span className="sessions-card-count">
                                {s.messageCount}
                              </span>
                              <span className="sessions-card-time">
                                {group.label === "thisWeek" || group.label === "earlier"
                                  ? formatFullDate(s.startedAt)
                                  : formatTime(s.startedAt)}
                              </span>
                              <span className="sessions-card-footer-spacer" />
                              <CopyIdButton id={s.id} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {displayLimit < sessions.length && (
            <div className="sessions-list-more">
              <button className="btn-ghost" onClick={() => setDisplayLimit(prev => prev + 50)}>
                {t("sessions.loadMore")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Sessions;
