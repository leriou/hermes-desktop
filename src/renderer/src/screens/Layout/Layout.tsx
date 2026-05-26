import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import Chat, { ChatMessage } from "../Chat/Chat";
import { SessionSidebar } from "../Chat/SessionSidebar";
import { useSessionManager } from "../Chat/hooks/useSessionManager";
import { useChatInbox } from "../Chat/hooks/useChatInbox";
import { baseSessionTitle, parseTitleSegment } from "../Chat/sessionDisplay";
import RemoteNotice from "../../components/RemoteNotice";
import VerifyWarningBanner from "../../components/VerifyWarningBanner";
import hermeslogo from "../../assets/hermes.png";
import hermesicon from "../../assets/hermes-icon.png";
import { cache } from "../../utils/prefetchCache";
import {
  ChatBubble,
  Clock,
  Users,
  Settings as SettingsIcon,
  Puzzle,
  Package,
  Sparkles,
  Wrench,
  Signal,
  Layers,
  KeyRound,
  Timer,
  Download,
  PanelLeftClose,
  PanelLeftOpen,
  Code,
  Route,
} from "../../assets/icons";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "../../components/useI18n";

const Sessions = lazy(() => import("../Sessions/Sessions"));
const Agents = lazy(() => import("../Agents/Agents"));
const Settings = lazy(() => import("../Settings/Settings"));
const Skills = lazy(() => import("../Skills/Skills"));
const Plugins = lazy(() => import("../Plugins/Plugins"));
const Persona = lazy(() => import("../Persona/Persona"));
const Tools = lazy(() => import("../Tools/Tools"));
const Gateway = lazy(() => import("../Gateway/Gateway"));
const Models = lazy(() => import("../Models/Models"));
const Providers = lazy(() => import("../Providers/Providers"));
const Schedules = lazy(() => import("../Schedules/Schedules"));
const ConfigEditor = lazy(() => import("../ConfigEditor/ConfigEditor"));
const Routing = lazy(() => import("../Routing/Routing"));

function TabSpinner(): React.JSX.Element {
  return (
    <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
      <span style={{ opacity: 0.4 }}>Loading…</span>
    </div>
  );
}

type View =
  | "chat"
  | "sessions"
  | "agents"
  | "models"
  | "providers"
  | "routing"
  | "skills"
  | "plugins"
  | "persona"
  | "tools"
  | "schedules"
  | "gateway"
  | "config"
  | "settings";

const NAV_ITEMS: { view: View; icon: LucideIcon; labelKey: string }[] = [
  { view: "chat", icon: ChatBubble, labelKey: "navigation.chat" },
  { view: "sessions", icon: Clock, labelKey: "navigation.sessions" },
  { view: "agents", icon: Users, labelKey: "navigation.agents" },
  { view: "models", icon: Layers, labelKey: "navigation.models" },
  { view: "providers", icon: KeyRound, labelKey: "navigation.providers" },
  { view: "routing", icon: Route, labelKey: "navigation.routing" },
  { view: "skills", icon: Puzzle, labelKey: "navigation.skills" },
  { view: "plugins", icon: Package, labelKey: "navigation.plugins" },
  { view: "persona", icon: Sparkles, labelKey: "navigation.persona" },
  { view: "tools", icon: Wrench, labelKey: "navigation.tools" },
  { view: "schedules", icon: Timer, labelKey: "navigation.schedules" },
  { view: "gateway", icon: Signal, labelKey: "navigation.gateway" },
  { view: "config", icon: Code, labelKey: "navigation.config" },
  { view: "settings", icon: SettingsIcon, labelKey: "navigation.settings" },
];

function isHistorySegment(
  a: { title?: string | null },
  b: { title?: string | null },
): boolean {
  const titleA = baseSessionTitle(a.title);
  const titleB = baseSessionTitle(b.title);
  return !!titleA && titleA === titleB && !!(parseTitleSegment(a.title) || parseTitleSegment(b.title));
}

interface LayoutProps {
  verifyWarning?: boolean;
  onReinstall?: () => void;
  onDismissVerifyWarning?: () => void;
}

function Layout({
  verifyWarning,
  onReinstall,
  onDismissVerifyWarning,
}: LayoutProps = {}): React.JSX.Element {
  const { t } = useI18n();
  const [view, setView] = useState<View>("chat");
  const [activeProfile, setActiveProfile] = useState("default");
  const [remoteMode, setRemoteMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sessionManager = useSessionManager();
  const activeTabId = sessionManager.activeTabId;
  const activeTab = activeTabId ? sessionManager.sessions.get(activeTabId) : undefined;
  useChatInbox({
    sessions: sessionManager.sessions,
    activeTabId,
    chatVisible: view === "chat",
    findTabBySessionId: sessionManager.findTabBySessionId,
    updateTab: sessionManager.updateTab,
    updateTabMessages: sessionManager.updateTabMessages,
  });

  const goTo = useCallback((v: View) => {
    setView(v);
  }, []);

  // Prefetch data for tabs the user is likely to visit next.
  // Runs once on idle after initial load, then on each tab switch for neighbors.
  useEffect(() => {
    if (view !== "chat") return;
    const prefetchTabData = (): void => {
      const p = activeProfile;
      cache.prefetch("models:list", 30_000, () =>
        (window.hermesAPI.listModels(p) as Promise<any[]>).then((r) => r ?? []),
      );
      cache.prefetch("models:templates", 60_000, () =>
        (window.hermesAPI.listTemplates() as Promise<any[]>).then((r) => r ?? []),
      );
      cache.prefetch("agents:profiles", 20_000, () =>
        (window.hermesAPI.listProfiles() ?? Promise.resolve([])),
      );
      cache.prefetch(`skills:installed:${p}`, 20_000, () =>
        (window.hermesAPI.listInstalledSkills(p) ?? Promise.resolve([])),
      );
      cache.prefetch(`skills:bundled:${p}`, 120_000, () =>
        (window.hermesAPI.listBundledSkills(p) ?? Promise.resolve([])),
      );
      cache.prefetch(`plugins:${p}`, 20_000, () =>
        (window.hermesAPI.getPlugins(p) ?? Promise.resolve([])),
      );
      cache.prefetch(`schedules:jobs:${p}`, 20_000, () =>
        (window.hermesAPI.listCronJobs(true, p) ?? Promise.resolve([])),
      );
    };
    if ("requestIdleCallback" in window) {
      (window as any).requestIdleCallback(prefetchTabData, { timeout: 5000 });
    } else {
      setTimeout(prefetchTabData, 2000);
    }
  }, [view, activeProfile]);

  // Re-check remote mode on tab switch (picks up Settings changes)
  useEffect(() => {
    window.hermesAPI.isRemoteOnlyMode().then(setRemoteMode);
  }, [view]);

  // Ensure gateway is started with current profile
  useEffect(() => {
    window.hermesAPI.startGateway(activeProfile);
  }, [activeProfile]);

  useEffect(() => {
    if (view !== "chat" || !activeTabId) return;
    if (activeTab?.unreadCount) {
      sessionManager.updateTab(activeTabId, { unreadCount: 0 });
    }
  }, [view, activeTabId, activeTab?.unreadCount, sessionManager.updateTab]);

  // Auto-update state
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<
    "available" | "downloading" | "ready" | "error" | null
  >(null);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    const cleanupAvailable = window.hermesAPI.onUpdateAvailable((info) => {
      setUpdateVersion(info.version);
      setUpdateState("available");
      setUpdateError(null);
      setDownloadPercent(0);
    });
    const cleanupProgress = window.hermesAPI.onUpdateDownloadProgress(
      (info) => {
        setDownloadPercent(info.percent);
      },
    );
    const cleanupDownloaded = window.hermesAPI.onUpdateDownloaded(() => {
      setUpdateState("ready");
      setUpdateError(null);
    });
    const cleanupError = window.hermesAPI.onUpdateError((message) => {
      setUpdateState("error");
      setUpdateError(message);
      setDownloadPercent(0);
    });
    return () => {
      cleanupAvailable();
      cleanupProgress();
      cleanupDownloaded();
      cleanupError();
    };
  }, []);

  async function handleUpdate(): Promise<void> {
    if (updateState === "available" || updateState === "error") {
      setUpdateError(null);
      setDownloadPercent(0);
      setUpdateState("downloading");
      try {
        const ok = await window.hermesAPI.downloadUpdate();
        if (!ok) setUpdateState("error");
      } catch (err) {
        setUpdateError(err instanceof Error ? err.message : String(err));
        setUpdateState("error");
      }
    } else if (updateState === "ready") {
      await window.hermesAPI.installUpdate();
    }
  }

  const handleNewChat = useCallback(() => {
    window.hermesAPI.abortChat();
    sessionManager.createTab();
    goTo("chat");
  }, [goTo, sessionManager]);

  // Listen for menu IPC events (Cmd+N, Cmd+K from app menu)
  useEffect(() => {
    const cleanupNewChat = window.hermesAPI.onMenuNewChat(() => {
      handleNewChat();
    });
    const cleanupSearch = window.hermesAPI.onMenuSearchSessions(() => {
      goTo("sessions");
    });
    return () => {
      cleanupNewChat();
      cleanupSearch();
    };
  }, [handleNewChat, goTo]);

  const handleSelectProfile = useCallback((name: string) => {
    setActiveProfile(name);
    sessionManager.createTab();
  }, [sessionManager]);

  const MAX_RESUME_MESSAGES = 100;
  const MAX_TOOL_CONTENT = 8000;

  const handleResumeSession = useCallback(
    async (sessionId: string) => {
      let chatMessages: ChatMessage[] = [];
      let sessionTitle = "";
      let targetResumeSessionId = sessionId;
      let relatedSessionIds: string[] = [sessionId];

      // 0. Look up the title from the cached session list
      try {
        const cached = await window.hermesAPI.listCachedSessions(activeProfile);
        const found = cached.find((s: { id: string }) => s.id === sessionId);
        if (found?.title) sessionTitle = found.title;
        if (found) {
          const related = cached
            .filter((s: { id: string; title?: string | null }) => isHistorySegment(found, s))
            .sort((a: { startedAt: number }, b: { startedAt: number }) => a.startedAt - b.startedAt);
          if (related.length > 1) {
            relatedSessionIds = related.map((s: { id: string }) => s.id);
            targetResumeSessionId = relatedSessionIds[relatedSessionIds.length - 1];
            sessionTitle = baseSessionTitle(found.title) || sessionTitle;
          }
        }
      } catch { /* ignore */ }

      // 1. Load messages — check prefetch cache first, then API
      try {
        const loaded = await Promise.all(
          relatedSessionIds.map((id) =>
            cache.getOrFetch(
              `session-msgs:${id}`,
              30_000,
              () => window.hermesAPI.getSessionMessages(id, activeProfile),
            ),
          ),
        );
        const items = loaded.flat();
        if (items && items.length > 0) {
          const sliced = items.length > MAX_RESUME_MESSAGES
            ? items.slice(items.length - MAX_RESUME_MESSAGES)
            : items;
          chatMessages = sliced
            .map((it: any): ChatMessage | null => {
              const ts = it.timestamp ? Math.round(it.timestamp * 1000) : undefined;
              switch (it.kind) {
                case "user":
                  return { id: `db-${it.id}`, role: "user", content: it.content, timestamp: ts };
                case "assistant":
                  return { id: `db-${it.id}`, role: "agent", content: it.content, timestamp: ts };
                case "reasoning":
                  return null;
                case "tool_call":
                  return {
                    id: `db-${it.id}`,
                    kind: "tool_call",
                    role: "agent",
                    callId: it.callId || "",
                    name: it.name || "tool",
                    args: it.args || "",
                  };
                case "tool_result": {
                  let content = it.content || "";
                  if (content.length > MAX_TOOL_CONTENT) {
                    content = content.slice(0, MAX_TOOL_CONTENT) + `\n\n... (${content.length} chars total)`;
                  }
                  return { id: `db-${it.id}`, kind: "tool_result", role: "agent", callId: it.callId || "", name: it.name || "tool", content };
                }
                default:
                  return null;
              }
            })
            .filter((m): m is ChatMessage => m !== null);
        }
      } catch { /* ignore */ }

      // Show messages immediately before waiting for Gateway
      // Set hermesSessionId upfront so gateway replay events get filtered out
      const initialPatch = {
        messages: chatMessages,
        hermesSessionId: targetResumeSessionId,
        dbSessionId: targetResumeSessionId,
        title: sessionTitle,
        updatedAt: Date.now(),
        isLoading: false,
        toolProgress: null as string | null,
      };
      const existingTabId = sessionManager.findTabBySessionId(targetResumeSessionId);
      let targetTabId = existingTabId;
      if (!targetTabId) {
        targetTabId = sessionManager.createTabWith(initialPatch);
      } else {
        sessionManager.updateTab(targetTabId, initialPatch);
        sessionManager.switchTab(targetTabId);
      }
      goTo("chat");

      // 2. Resume in TUI Gateway in background (may be slow on cold start)
      try {
        const res = await window.hermesAPI.tuiResumeSession(targetResumeSessionId);
        if (res) {
          const tuiSessionId = res.session_id || targetResumeSessionId;
          // If resume returned messages and we had none, use them
          if (chatMessages.length === 0 && Array.isArray(res.messages) && res.messages.length > 0) {
            const gatewayMessages: ChatMessage[] = [];
            for (const msg of res.messages) {
              const id = `gw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              if (msg.role === "user" && (msg.text || msg.content)) {
                gatewayMessages.push({ id, role: "user", content: msg.text || msg.content });
              } else if (msg.role === "assistant" && (msg.text || msg.content)) {
                gatewayMessages.push({ id, role: "agent", content: msg.text || msg.content });
              } else if (msg.role === "tool") {
                gatewayMessages.push({ id, kind: "tool_result", role: "agent", callId: "", name: msg.name || "tool", content: msg.context || "" });
              }
            }
            const currentTabId = targetTabId;
            if (currentTabId) {
              sessionManager.updateTab(currentTabId, {
                messages: gatewayMessages,
                hermesSessionId: tuiSessionId,
                model: res.info?.model || "",
              });
            }
          } else {
            // Just update the Gateway session ID so user can send new messages
            const currentTabId = targetTabId;
            if (currentTabId) {
              sessionManager.updateTab(currentTabId, { 
                hermesSessionId: tuiSessionId,
                model: res.info?.model || "",
              });
            }
          }
        }
      } catch (err) {
        const currentTabId = targetTabId;
        if (currentTabId) {
          sessionManager.updateTab(currentTabId, {
            messages: [
              ...chatMessages,
              {
                id: `resume-error-${Date.now()}`,
                role: "agent",
                content: `Error: ${(err as Error).message || String(err)}`,
                timestamp: Date.now(),
              },
            ],
            hermesSessionId: null,
          });
        }
        return;
      }

      // 3. Last resort: read active session history from Gateway memory
      if (chatMessages.length === 0) {
        try {
          const hist = await window.hermesAPI.tuiSessionHistory(targetResumeSessionId);
          if (hist?.result?.messages && Array.isArray(hist.result.messages)) {
            const memMessages: ChatMessage[] = [];
            for (const msg of hist.result.messages) {
              const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              if (msg.role === "user" && (msg.text || msg.content)) {
                memMessages.push({ id, role: "user", content: msg.text || msg.content });
              } else if (msg.role === "assistant" && (msg.text || msg.content)) {
                memMessages.push({ id, role: "agent", content: msg.text || msg.content });
              } else if (msg.role === "tool") {
                memMessages.push({ id, kind: "tool_result", role: "agent", callId: "", name: msg.name || "tool", content: msg.context || "" });
              }
            }
            if (memMessages.length > 0) {
              const currentTabId = targetTabId;
              if (currentTabId) {
                sessionManager.updateTab(currentTabId, { messages: memMessages });
              }
            }
          }
        } catch { /* nothing left to try */ }
      }
    },
    [goTo, sessionManager, activeProfile],
  );

  const paneStyle: React.CSSProperties = {
    flex: 1,
    flexDirection: "column",
    overflow: "hidden",
    display: "flex",
  };

  return (
    <div className="layout">
      <aside className={`sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
        <div className="sidebar-brand">
          <img src={hermesicon} height={26} alt="" className="sidebar-logo-icon" />
          <img src={hermeslogo} height={30} alt="" className="sidebar-logo-full" />
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ view: v, icon: Icon, labelKey }) => (
            <button
              key={v}
              className={`sidebar-nav-item ${view === v ? "active" : ""}`}
              onClick={() => goTo(v)}
              title={t(labelKey)}
            >
              <Icon size={16} />
              <span className="sidebar-nav-label">{t(labelKey)}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          {updateState && (
            <button
              className={`sidebar-update-btn ${
                updateState === "error" ? "error" : ""
              }`}
              onClick={handleUpdate}
              disabled={updateState === "downloading"}
              title={updateError ?? undefined}
            >
              <Download size={13} />
              {updateState === "available" && (
                <span>
                  {t("common.updateAvailable", { version: updateVersion })}
                </span>
              )}
              {updateState === "downloading" && (
                <span>
                  {t("common.downloading", { percent: downloadPercent })}
                </span>
              )}
              {updateState === "ready" && (
                <span>{t("common.restartToUpdate")}</span>
              )}
              {updateState === "error" && (
                <span>{t("common.updateFailed")}</span>
              )}
            </button>
          )}
          <div className="sidebar-footer-row">
            <div className="sidebar-footer-text">
              {activeProfile === "default" ? t("common.appName") : activeProfile}
            </div>
            <button
              className="sidebar-collapse-btn"
              onClick={() => setSidebarCollapsed((c) => !c)}
              title={sidebarCollapsed ? t("common.expandSidebar") : t("common.collapseSidebar")}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>
        </div>
      </aside>

      <main className="content">
        {verifyWarning && onReinstall && onDismissVerifyWarning && (
          <VerifyWarningBanner
            onReinstall={onReinstall}
            onDismiss={onDismissVerifyWarning}
          />
        )}

        {view === "chat" && (
          <div className="chat-pane">
            <SessionSidebar
              sessions={sessionManager.getSidebarEntries()}
              activeId={sessionManager.activeTabId}
              activeDbSessionId={sessionManager.getActive()?.dbSessionId ?? null}
              onSelect={sessionManager.switchTab}
              onNewChat={handleNewChat}
              onClose={sessionManager.closeTab}
              onResumeSession={handleResumeSession}
            />
            <div style={paneStyle}>
              {sessionManager.tabOrder.map((tabId) => {
                const tab = sessionManager.sessions.get(tabId);
                if (!tab) return null;
                const visible = tabId === sessionManager.activeTabId;
                return (
                  <Chat
                    key={tabId}
                    messages={tab.messages}
                    setMessages={(patch) => {
                      if (typeof patch === "function") {
                        sessionManager.updateTabMessages(tabId, patch);
                      } else {
                        sessionManager.updateTab(tabId, { messages: patch });
                      }
                    }}
                    sessionId={tab.hermesSessionId}
                    dbSessionId={tab.dbSessionId}
                    sessionTitle={tab.title}
                    isLoading={tab.isLoading}
                    streamingText={tab.streamingText}
                    usage={tab.usage}
                    toolProgress={tab.toolProgress}
                    pendingApproval={tab.pendingApproval}
                    pendingClarify={tab.pendingClarify}
                    pendingSudo={tab.pendingSudo}
                    pendingSecret={tab.pendingSecret}
                    profile={activeProfile}
                    visible={visible}
                    onNewChat={handleNewChat}
                    onSessionStateChange={(patch) => {
                      sessionManager.updateTab(tabId, {
                        ...(patch.hermesSessionId !== undefined ? { hermesSessionId: patch.hermesSessionId } : {}),
                        ...(patch.dbSessionId !== undefined ? { dbSessionId: patch.dbSessionId } : {}),
                        ...(patch.title !== undefined ? { title: patch.title } : {}),
                        ...(patch.model !== undefined ? { model: patch.model } : {}),
                        ...(patch.pendingModelSwitch !== undefined ? { pendingModelSwitch: patch.pendingModelSwitch } : {}),
                        ...(patch.isLoading !== undefined ? { isLoading: patch.isLoading } : {}),
                        ...(patch.toolProgress !== undefined ? { toolProgress: patch.toolProgress } : {}),
                        ...(patch.pendingApproval !== undefined ? { pendingApproval: patch.pendingApproval } : {}),
                        ...(patch.pendingClarify !== undefined ? { pendingClarify: patch.pendingClarify } : {}),
                        ...(patch.pendingSudo !== undefined ? { pendingSudo: patch.pendingSudo } : {}),
                        ...(patch.pendingSecret !== undefined ? { pendingSecret: patch.pendingSecret } : {}),
                        ...(patch.usage !== undefined ? { usage: patch.usage } : {}),
                        ...(patch.streamingText !== undefined ? { streamingText: patch.streamingText } : {}),
                      });
                    }}
                  />
                );
              })}
            </div>
        </div>
        )}

        {view === "sessions" && (
          <div style={paneStyle}>
            {remoteMode ? (
              <RemoteNotice feature="Sessions" />
            ) : (
              <Suspense fallback={<TabSpinner />}>
                <Sessions
                  onResumeSession={handleResumeSession}
                  onNewChat={handleNewChat}
                  currentSessionId={sessionManager.getActive()?.hermesSessionId ?? null}
                  visible={true}
                  profile={activeProfile}
                />
              </Suspense>
            )}
          </div>
        )}

        {view === "agents" && (
          <div style={paneStyle}>
            {remoteMode ? (
              <RemoteNotice feature="Profiles" />
            ) : (
              <Suspense fallback={<TabSpinner />}>
                <Agents
                  activeProfile={activeProfile}
                  onSelectProfile={handleSelectProfile}
                  onChatWith={(name: string) => {
                    handleSelectProfile(name);
                    goTo("chat");
                  }}
                />
              </Suspense>
            )}
          </div>
        )}

        {view === "models" && (
          <div style={paneStyle}>
            <Suspense fallback={<TabSpinner />}>
              <Models visible={true} profile={activeProfile} onNavigate={(view) => goTo(view as View)} />
            </Suspense>
          </div>
        )}

        {view === "providers" && (
          <div style={paneStyle}>
            {remoteMode ? (
              <RemoteNotice feature="Providers" />
            ) : (
              <Suspense fallback={<TabSpinner />}>
                <Providers profile={activeProfile} visible={true} />
              </Suspense>
            )}
          </div>
        )}

        {view === "routing" && (
          <div style={paneStyle}>
            {remoteMode ? (
              <RemoteNotice feature="Routing" />
            ) : (
              <Suspense fallback={<TabSpinner />}>
                <Routing profile={activeProfile} />
              </Suspense>
            )}
          </div>
        )}

        {view === "skills" && (
          <div style={paneStyle}>
            {remoteMode ? (
              <RemoteNotice feature="Skills" />
            ) : (
              <Suspense fallback={<TabSpinner />}>
                <Skills profile={activeProfile} />
              </Suspense>
            )}
          </div>
        )}

        {view === "plugins" && (
          <div style={paneStyle}>
            {remoteMode ? (
              <RemoteNotice feature="Plugins" />
            ) : (
              <Suspense fallback={<TabSpinner />}>
                <Plugins profile={activeProfile} />
              </Suspense>
            )}
          </div>
        )}

        {view === "persona" && (
          <div style={paneStyle}>
            {remoteMode ? (
              <RemoteNotice feature="Persona" />
            ) : (
              <Suspense fallback={<TabSpinner />}>
                <Persona profile={activeProfile} />
              </Suspense>
            )}
          </div>
        )}

        {view === "tools" && (
          <div style={paneStyle}>
            {remoteMode ? (
              <RemoteNotice feature="Tools" />
            ) : (
              <Suspense fallback={<TabSpinner />}>
                <Tools profile={activeProfile} />
              </Suspense>
            )}
          </div>
        )}

        {view === "schedules" && (
          <div style={paneStyle}>
            <Suspense fallback={<TabSpinner />}>
              <Schedules profile={activeProfile} />
            </Suspense>
          </div>
        )}

        {view === "gateway" && (
          <div style={paneStyle}>
            {remoteMode ? (
              <RemoteNotice feature="Gateway" />
            ) : (
              <Suspense fallback={<TabSpinner />}>
                <Gateway profile={activeProfile} />
              </Suspense>
            )}
          </div>
        )}

        {view === "config" && (
          <div style={paneStyle}>
            {remoteMode ? (
              <RemoteNotice feature="Config" />
            ) : (
              <Suspense fallback={<TabSpinner />}>
                <ConfigEditor profile={activeProfile} />
              </Suspense>
            )}
          </div>
        )}

        {view === "settings" && (
          <div style={paneStyle}>
            <Suspense fallback={<TabSpinner />}>
              <Settings profile={activeProfile} />
            </Suspense>
          </div>
        )}
      </main>
    </div>
  );
}

export default Layout;
