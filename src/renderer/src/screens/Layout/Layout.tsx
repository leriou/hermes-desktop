import {
  abortChat,
  downloadUpdate,
  getPlugins,
  getRelatedSessionIds,
  getSessionMessages,
  installUpdate,
  isRemoteOnlyMode,
  listBundledSkills,
  listCachedSessions,
  listCronJobs,
  listInstalledSkills,
  listModels,
  listProfiles,
  listTemplates,
  onMenuNewChat,
  onMenuSearchSessions,
  onUpdateAvailable,
  onUpdateDownloadProgress,
  onUpdateDownloaded,
  onUpdateError,
  startGateway,
  tuiResumeSession,
  tuiSessionHistory,
} from "@renderer/lib/hermes-tauri";
import { useState, useCallback, useEffect, useMemo, lazy, Suspense } from "react";
import Chat, { ChatMessage } from "../Chat/Chat";
import { SessionSidebar } from "../Chat/SessionSidebar";
import { useSessionManager } from "../Chat/hooks/useSessionManager";
import { useChatInbox } from "../Chat/hooks/useChatInbox";
import { baseSessionTitle } from "../Chat/sessionDisplay";
import { createWsGatewayClientImpl } from "@renderer/lib/wsGatewayClientImpl";
import type { WsGatewayClient } from "@renderer/lib/wsGatewayClient";
import { rewriteTranscript } from "../Chat/renderTranscript";
import { getStoreItem } from "@renderer/utils/store";
import RemoteNotice from "../../components/RemoteNotice";
import VerifyWarningBanner from "../../components/VerifyWarningBanner";
import hermesicon from "../../assets/hermes-icon.png";
import { cache } from "../../utils/prefetchCache";
import {
  ChatBubble,
  Users,
  Settings as SettingsIcon,
  Layers,
  Download,
  PanelLeftClose,
  PanelLeftOpen,
  Kanban as KanbanIcon,
} from "../../assets/icons";
import { Home, Boxes, Cpu } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "../../components/useI18n";

const HomeScreen = lazy(() => import("../Home/Home"));
const ModelControlScreen = lazy(() => import("../ModelControl/ModelControl"));
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
const Kanban = lazy(() => import("../Kanban/Kanban"));
const Sessions = lazy(() => import("../Sessions/Sessions"));

function TabSpinner(): React.JSX.Element {
  return (
    <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
      <span style={{ opacity: 0.4 }}>Loading…</span>
    </div>
  );
}

function SubTabBar({ tabs, activeTab, onSelect, t }: { tabs: SubView[]; activeTab: SubView | null; onSelect: (id: SubView) => void; t: any }): React.JSX.Element {
  return (
    <div className="sub-tab-bar">
      <div className="sub-tab-pills">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`sub-tab-pill ${activeTab === tab ? "active" : ""}`}
            onClick={() => onSelect(tab)}
          >
            {t(`navigation.${tab}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

type PrimaryView = "home" | "chat" | "sessions" | "agents" | "modelControl" | "extensions" | "kanban" | "system";
type SubView =
  | "models" | "providers" | "routing" | "runtime" | "credentials"
  | "skills" | "plugins" | "persona" | "tools" | "agents"
  | "schedules" | "gateway" | "config" | "settings" | "kanban";

const SUB_TO_PRIMARY: Record<SubView, PrimaryView> = {
  models: "modelControl", providers: "modelControl", routing: "modelControl",
  runtime: "modelControl", credentials: "modelControl",
  skills: "extensions", plugins: "extensions", persona: "agents", tools: "extensions", agents: "agents",
  schedules: "system", gateway: "system", config: "system", settings: "system", kanban: "kanban",
};

const SUB_VIEWS: Record<string, SubView[]> = {
  extensions: ["skills", "plugins", "tools"],
  system: ["settings", "schedules", "gateway", "config"],
  modelControl: ["runtime", "models", "providers", "routing", "credentials"],
  agents: ["persona", "agents"],
};

const PRIMARY_NAV: { view: PrimaryView; icon: LucideIcon | any; labelKey: string }[] = [
  { view: "home", icon: Home, labelKey: "navigation.home" },
  { view: "chat", icon: ChatBubble, labelKey: "navigation.chat" },
  { view: "sessions", icon: Layers, labelKey: "navigation.sessions" },
  { view: "agents", icon: Users, labelKey: "navigation.agents" },
  { view: "modelControl", icon: Cpu, labelKey: "navigation.modelControl" },
  { view: "extensions", icon: Boxes, labelKey: "navigation.extensions" },
  { view: "kanban", icon: KanbanIcon, labelKey: "navigation.kanban" },
  { view: "system", icon: SettingsIcon, labelKey: "navigation.system" },
];

interface LayoutProps {
  verifyWarning?: boolean;
  onReinstall?: () => void;
  onDismissVerifyWarning?: () => void;
}

function Layout({ verifyWarning, onReinstall, onDismissVerifyWarning }: LayoutProps = {}): React.JSX.Element {
  const { t } = useI18n();
  const [primaryView, setPrimaryView] = useState<PrimaryView>("home");
  const [activeSubView, setActiveSubView] = useState<SubView | null>(null);
  const [activeProfile, setActiveProfile] = useState("default");
  const [remoteMode, setRemoteMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [sessionDrawerOpen, setSessionDrawerOpen] = useState(false);
  const sessionManager = useSessionManager();
  const activeTabId = sessionManager.activeTabId;
  const activeTab = activeTabId ? sessionManager.sessions.get(activeTabId) : undefined;

  // WebSocket gateway client — connects directly to the Python gateway for
  // lower-latency streaming and full-duplex interrupt support.
  const wsClient = useMemo(() => createWsGatewayClientImpl(), []);

  useEffect(() => {
    wsClient.connect().catch(() => { /* will retry via reconnect timer */ });
    return () => wsClient.close();
  }, [wsClient]);

  useChatInbox({
    sessions: sessionManager.sessions, activeTabId, chatVisible: primaryView === "chat",
    findTabBySessionId: sessionManager.findTabBySessionId, updateTab: sessionManager.updateTab, updateTabMessages: sessionManager.updateTabMessages,
  });

  const goTo = useCallback((v: string) => {
    // Sub-view navigation only if it's not also a primary view with sub-tabs
    if (v in SUB_TO_PRIMARY && !(v in SUB_VIEWS)) {
      setPrimaryView(SUB_TO_PRIMARY[v as SubView]);
      setActiveSubView(v as SubView);
    } else {
      const pv = v as PrimaryView;
      setPrimaryView(pv);
      if (pv in SUB_VIEWS) {
        setActiveSubView(SUB_VIEWS[pv][0]);
      } else {
        setActiveSubView(null);
      }
    }
  }, []);

  useEffect(() => {
    if (primaryView !== "chat") return;
    const prefetchTabData = (): void => {
      const p = activeProfile;
      cache.prefetch("models:list", 30_000, () => (listModels(p) as Promise<any[]>).then((r) => r ?? []));
      cache.prefetch("models:templates", 60_000, () => (listTemplates() as Promise<any[]>).then((r) => r ?? []));
      cache.prefetch("agents:profiles", 20_000, () => listProfiles() ?? Promise.resolve([]));
      cache.prefetch(`skills:installed:${p}`, 20_000, () => listInstalledSkills(p) ?? Promise.resolve([]));
      cache.prefetch(`skills:bundled:${p}`, 120_000, () => listBundledSkills(p) ?? Promise.resolve([]));
      cache.prefetch(`plugins:${p}`, 20_000, () => getPlugins(p) ?? Promise.resolve([]));
      cache.prefetch(`schedules:jobs:${p}`, 20_000, () => listCronJobs(true, p) ?? Promise.resolve([]));
    };
    if ("requestIdleCallback" in window) { (window as any).requestIdleCallback(prefetchTabData, { timeout: 5000 }); }
    else { setTimeout(prefetchTabData, 2000); }
  }, [primaryView, activeProfile]);

  useEffect(() => { isRemoteOnlyMode().then(setRemoteMode); }, [primaryView]);
  useEffect(() => { startGateway(activeProfile); }, [activeProfile]);
  useEffect(() => {
    if (primaryView !== "chat" || !activeTabId) return;
    if (activeTab?.unreadCount) sessionManager.updateTab(activeTabId, { unreadCount: 0 });
  }, [primaryView, activeTabId, activeTab?.unreadCount, sessionManager.updateTab]);

  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<"available" | "downloading" | "ready" | "error" | null>(null);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    const c1 = onUpdateAvailable((info) => { setUpdateVersion(info.version); setUpdateState("available"); setUpdateError(null); setDownloadPercent(0); });
    const c2 = onUpdateDownloadProgress((info) => { setDownloadPercent(info.percent); });
    const c3 = onUpdateDownloaded(() => { setUpdateState("ready"); setUpdateError(null); });
    const c4 = onUpdateError((message) => { setUpdateState("error"); setUpdateError(message); setDownloadPercent(0); });
    return () => { c1(); c2(); c3(); c4(); };
  }, []);

  async function handleUpdate(): Promise<void> {
    if (updateState === "available" || updateState === "error") {
      setUpdateError(null); setDownloadPercent(0); setUpdateState("downloading");
      try { const ok = await downloadUpdate(); if (!ok) setUpdateState("error"); }
      catch (err) { setUpdateError(err instanceof Error ? err.message : String(err)); setUpdateState("error"); }
    } else if (updateState === "ready") { await installUpdate(); }
  }

  const handleNewChat = useCallback(() => { abortChat(); sessionManager.createTab(); goTo("chat"); }, [goTo, sessionManager]);

  useEffect(() => {
    const c1 = onMenuNewChat(() => { handleNewChat(); });
    const c2 = onMenuSearchSessions(() => { goTo("sessions"); });
    return () => { c1(); c2(); };
  }, [handleNewChat, goTo]);

  const handleSelectProfile = useCallback((name: string) => { setActiveProfile(name); sessionManager.createTab(); }, [sessionManager]);

  const MAX_TOOL_CONTENT = 8000;
  const handleResumeSession = useCallback(async (sessionId: string) => {
    let chatMessages: ChatMessage[] = [];
    let sessionTitle = "";
    let targetResumeSessionId = sessionId;
    let relatedSessionIds: string[] = [sessionId];
    try {
      relatedSessionIds = await getRelatedSessionIds(sessionId, activeProfile);
      targetResumeSessionId = relatedSessionIds[relatedSessionIds.length - 1] || sessionId;
      const cached = await listCachedSessions(activeProfile);
      const found = cached.find((s: { id: string }) => s.id === sessionId);
      if (found?.title) sessionTitle = baseSessionTitle(found.title) || found.title;
    } catch { /* ignore */ }
    try {
      const items = await cache.getOrFetch(`session-msgs:${targetResumeSessionId}`, 30_000, () => getSessionMessages(targetResumeSessionId, activeProfile));
      if (items && items.length > 0) {
        chatMessages = items.map((it: any): ChatMessage | null => {
          const ts = it.timestamp ? Math.round(it.timestamp * 1000) : undefined;
          switch (it.kind) {
            case "user": return { id: `db-${it.id}`, role: "user", content: it.content, timestamp: ts };
            case "assistant": return { id: `db-${it.id}`, role: "agent", content: it.content, timestamp: ts };
            case "reasoning": return null;
            case "tool_call": return { id: `db-${it.id}`, kind: "tool_call", role: "agent", callId: it.callId || "", name: it.name || "tool", args: it.args || "", timestamp: ts };
            case "tool_result": {
              let content = it.content || "";
              if (content.length > MAX_TOOL_CONTENT) content = content.slice(0, MAX_TOOL_CONTENT) + `\n\n... (${content.length} chars total)`;
              return { id: `db-${it.id}`, kind: "tool_result", role: "agent", callId: it.callId || "", name: it.name || "tool", content, timestamp: ts };
            }
            default: return null;
          }
        }).filter((m): m is ChatMessage => m !== null);
      }
    } catch { /* ignore */ }
    if (chatMessages.length > 0 && getStoreItem("hermes-rewrite-enabled") === "true") chatMessages = rewriteTranscript(chatMessages);
    const initialPatch = { hermesSessionId: targetResumeSessionId, dbSessionId: targetResumeSessionId, relatedSessionIds, title: sessionTitle, updatedAt: Date.now(), isLoading: false, toolProgress: null as string | null };
    const existingTabId = sessionManager.findTabBySessionId(targetResumeSessionId);
    let targetTabId = existingTabId;
    if (!targetTabId) { targetTabId = sessionManager.createTabWith({ ...initialPatch, messages: chatMessages }); }
    else {
      const existing = sessionManager.sessions.get(targetTabId);
      const msgs = existing && existing.messages.length > 0 ? undefined : chatMessages;
      sessionManager.updateTab(targetTabId, { ...initialPatch, ...(msgs !== undefined ? { messages: msgs } : {}) });
      sessionManager.switchTab(targetTabId);
    }
    goTo("chat");
    try {
      const res = await tuiResumeSession(targetResumeSessionId);
      if (res) {
        const tuiSessionId = res.session_id || targetResumeSessionId;
        if (chatMessages.length === 0 && Array.isArray(res.messages) && res.messages.length > 0) {
          const gatewayMessages: ChatMessage[] = [];
          for (const msg of res.messages) {
            const id = `gw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            if (msg.role === "user" && (msg.text || msg.content)) gatewayMessages.push({ id, role: "user", content: msg.text || msg.content });
            else if (msg.role === "assistant" && (msg.text || msg.content)) gatewayMessages.push({ id, role: "agent", content: msg.text || msg.content });
            else if (msg.role === "tool") gatewayMessages.push({ id, kind: "tool_result", role: "agent", callId: "", name: msg.name || "tool", content: msg.context || "" });
          }
          if (targetTabId) sessionManager.updateTab(targetTabId, { messages: gatewayMessages, hermesSessionId: tuiSessionId, model: res.info?.model || "" });
        } else { if (targetTabId) sessionManager.updateTab(targetTabId, { hermesSessionId: tuiSessionId, model: res.info?.model || "" }); }
      }
    } catch (err) {
      if (targetTabId) sessionManager.updateTab(targetTabId, { messages: [...chatMessages, { id: `resume-error-${Date.now()}`, role: "agent", content: `Error: ${(err as Error).message || String(err)}`, timestamp: Date.now() }], hermesSessionId: null });
      return;
    }
    if (chatMessages.length === 0) {
      try {
        const hist = await tuiSessionHistory(targetResumeSessionId);
        if (hist?.result?.messages && Array.isArray(hist.result.messages)) {
          const memMessages: ChatMessage[] = [];
          for (const msg of hist.result.messages) {
            const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            if (msg.role === "user" && (msg.text || msg.content)) memMessages.push({ id, role: "user", content: msg.text || msg.content });
            else if (msg.role === "assistant" && (msg.text || msg.content)) memMessages.push({ id, role: "agent", content: msg.text || msg.content });
            else if (msg.role === "tool") memMessages.push({ id, kind: "tool_result", role: "agent", callId: "", name: msg.name || "tool", content: msg.context || "" });
          }
          if (memMessages.length > 0 && targetTabId) sessionManager.updateTab(targetTabId, { messages: memMessages });
        }
      } catch { /* nothing */ }
    }
  }, [goTo, sessionManager, activeProfile]);

  const paneStyle: React.CSSProperties = { flex: 1, flexDirection: "column", overflow: "hidden", display: "flex" };
  const effectiveSub = activeSubView && SUB_TO_PRIMARY[activeSubView] === primaryView ? activeSubView : null;

  return (
    <div className="layout">
      <aside className={`sidebar drag-surface${sidebarCollapsed ? " collapsed" : ""}`} data-tauri-drag-region>
        <div className="sidebar-brand"><img src={hermesicon} height={26} alt="" className="sidebar-logo-icon" /></div>
        <nav className="sidebar-nav">
          {PRIMARY_NAV.map(({ view: v, icon: Icon, labelKey }) => (
            <button key={v} className={`sidebar-nav-item ${primaryView === v ? "active" : ""}`} onClick={() => goTo(v)} title={t(labelKey)}>
              <Icon size={16} /><span className="sidebar-nav-label">{t(labelKey)}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          {updateState && (
            <button className={`sidebar-update-btn ${updateState === "error" ? "error" : ""}`} onClick={handleUpdate} disabled={updateState === "downloading"} title={updateError ?? undefined}>
              <Download size={13} />
              {updateState === "available" && <span>{t("common.updateAvailable", { version: updateVersion })}</span>}
              {updateState === "downloading" && <span>{t("common.downloading", { percent: downloadPercent })}</span>}
              {updateState === "ready" && <span>{t("common.restartToUpdate")}</span>}
              {updateState === "error" && <span>{t("common.updateFailed")}</span>}
            </button>
          )}
          <div className="sidebar-footer-row">
            <div className="sidebar-footer-text">{activeProfile === "default" ? t("common.appName") : activeProfile}</div>
            <button className="sidebar-collapse-btn" onClick={() => setSidebarCollapsed((c) => !c)} title={sidebarCollapsed ? t("common.expandSidebar") : t("common.collapseSidebar")}>
              {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>
        </div>
      </aside>
      <main className="content">
        {verifyWarning && onReinstall && onDismissVerifyWarning && <VerifyWarningBanner onReinstall={onReinstall} onDismiss={onDismissVerifyWarning} />}
        {primaryView === "home" && (<div style={paneStyle}><Suspense fallback={<TabSpinner />}><HomeScreen onNavigate={(v: string) => goTo(v)} onNewChat={handleNewChat} profile={activeProfile} /></Suspense></div>)}
        {primaryView === "chat" && (
          <div className="chat-pane chat-pane--immersive">
            {sessionDrawerOpen && (<><div className="session-drawer-backdrop" onClick={() => setSessionDrawerOpen(false)} /><div className="session-drawer"><SessionSidebar sessions={sessionManager.getSidebarEntries()} activeSessionId={sessionManager.activeTabId} activeDbSessionId={sessionManager.getActive()?.dbSessionId ?? null} onSelect={(tabId) => { sessionManager.switchTab(tabId); setSessionDrawerOpen(false); }} onNewChat={() => { handleNewChat(); setSessionDrawerOpen(false); }} onClose={sessionManager.closeTab} onResumeSession={(sid) => { handleResumeSession(sid); setSessionDrawerOpen(false); }} /></div></>)}
            <div style={paneStyle}>
              <div className="chat-session-drawer-toggle"><button onClick={() => setSessionDrawerOpen((o) => !o)} title={t("navigation.sessions") || "Sessions"}><Layers size={16} /></button></div>
              {sessionManager.tabOrder.map((tabId) => {
                const tab = sessionManager.sessions.get(tabId);
                if (!tab) return null;
                const visible = tabId === sessionManager.activeTabId;
                return (
                  <Chat key={tabId} messages={tab.messages} setMessages={(patch) => { if (typeof patch === "function") { sessionManager.updateTabMessages(tabId, patch); } else { sessionManager.updateTab(tabId, { messages: patch }); } }}
                    sessionId={tab.hermesSessionId} dbSessionId={tab.dbSessionId} relatedSessionIds={tab.relatedSessionIds} sessionTitle={tab.title}
                    isLoading={tab.isLoading} streamingText={tab.streamingText} streamingReasoning={tab.streamingReasoning} usage={tab.usage} toolProgress={tab.toolProgress}
                    pendingApproval={tab.pendingApproval} pendingClarify={tab.pendingClarify} pendingSudo={tab.pendingSudo} pendingSecret={tab.pendingSecret}
                    pendingModelSwitchMessageId={tab.pendingModelSwitchMessageId} todos={tab.todos} profile={activeProfile} visible={visible}
                    pendingPrompt={pendingPrompt} onConsumePendingPrompt={() => setPendingPrompt(null)} onNewChat={handleNewChat}
                    wsGatewayClient={wsClient}
                    onSessionStateChange={(patch) => { sessionManager.updateTab(tabId, {
                      ...(patch.hermesSessionId !== undefined ? { hermesSessionId: patch.hermesSessionId } : {}), ...(patch.dbSessionId !== undefined ? { dbSessionId: patch.dbSessionId } : {}),
                      ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.model !== undefined ? { model: patch.model } : {}),
                      ...(patch.pendingModelSwitch !== undefined ? { pendingModelSwitch: patch.pendingModelSwitch } : {}), ...(patch.pendingModelSwitchMessageId !== undefined ? { pendingModelSwitchMessageId: patch.pendingModelSwitchMessageId } : {}),
                      ...(patch.todos !== undefined ? { todos: patch.todos } : {}), ...(patch.isLoading !== undefined ? { isLoading: patch.isLoading } : {}),
                      ...(patch.toolProgress !== undefined ? { toolProgress: patch.toolProgress } : {}), ...(patch.pendingApproval !== undefined ? { pendingApproval: patch.pendingApproval } : {}),
                      ...(patch.pendingClarify !== undefined ? { pendingClarify: patch.pendingClarify } : {}), ...(patch.pendingSudo !== undefined ? { pendingSudo: patch.pendingSudo } : {}),
                      ...(patch.pendingSecret !== undefined ? { pendingSecret: patch.pendingSecret } : {}), ...(patch.usage !== undefined ? { usage: patch.usage } : {}),
                      ...(patch.streamingText !== undefined ? { streamingText: patch.streamingText } : {}), ...(patch.streamingReasoning !== undefined ? { streamingReasoning: patch.streamingReasoning } : {}),
                    }); }} />
                );
              })}
            </div>
          </div>
        )}
        {primaryView === "sessions" && (
          <div style={paneStyle}>
            <Suspense fallback={<TabSpinner />}>
              <Sessions
                profile={activeProfile}
                onResumeSession={handleResumeSession}
                onNewChat={handleNewChat}
                currentSessionId={sessionManager.activeTabId || null}
                visible={primaryView === "sessions"}
              />
            </Suspense>
          </div>
        )}
        {primaryView === "agents" && (<div style={paneStyle}>
          <SubTabBar tabs={SUB_VIEWS.agents} activeTab={effectiveSub} onSelect={(id) => setActiveSubView(id)} t={t} />
          <div className="sub-tab-content">
            {effectiveSub === "persona" ? (remoteMode ? <RemoteNotice feature="Persona" /> : <Suspense fallback={<TabSpinner />}><Persona profile={activeProfile} /></Suspense>)
              : remoteMode ? <RemoteNotice feature="Profiles" /> : <Suspense fallback={<TabSpinner />}><Agents activeProfile={activeProfile} onSelectProfile={handleSelectProfile} onChatWith={(name: string) => { handleSelectProfile(name); goTo("chat"); }} /></Suspense>}
          </div>
        </div>)}
        {primaryView === "modelControl" && (<div style={paneStyle}>
          <SubTabBar tabs={SUB_VIEWS.modelControl} activeTab={effectiveSub} onSelect={(id) => setActiveSubView(id)} t={t} />
          <div className="sub-tab-content">
            {effectiveSub === "models" ? <Suspense fallback={<TabSpinner />}><Models visible={true} profile={activeProfile} onNavigate={(v) => goTo(v)} /></Suspense>
              : effectiveSub === "providers" ? (remoteMode ? <RemoteNotice feature="Providers" /> : <Suspense fallback={<TabSpinner />}><Providers profile={activeProfile} visible={true} /></Suspense>)
              : effectiveSub === "routing" ? (remoteMode ? <RemoteNotice feature="Routing" /> : <Suspense fallback={<TabSpinner />}><Routing profile={activeProfile} /></Suspense>)
              : <Suspense fallback={<TabSpinner />}><ModelControlScreen profile={activeProfile} activeTab={effectiveSub || "runtime"} /></Suspense>}
          </div>
        </div>)}
        {primaryView === "extensions" && (<div style={paneStyle}>
          <SubTabBar tabs={SUB_VIEWS.extensions} activeTab={effectiveSub} onSelect={(id) => setActiveSubView(id)} t={t} />
          <div className="sub-tab-content">
            {effectiveSub === "skills" ? (remoteMode ? <RemoteNotice feature="Skills" /> : <Suspense fallback={<TabSpinner />}><Skills profile={activeProfile} /></Suspense>)
              : effectiveSub === "plugins" ? (remoteMode ? <RemoteNotice feature="Plugins" /> : <Suspense fallback={<TabSpinner />}><Plugins profile={activeProfile} /></Suspense>)
              : effectiveSub === "tools" ? (remoteMode ? <RemoteNotice feature="Tools" /> : <Suspense fallback={<TabSpinner />}><Tools profile={activeProfile} /></Suspense>)
              : <div className="mc-placeholder">Select a sub-view</div>}
          </div>
        </div>)}
        {primaryView === "kanban" && (
          <div style={paneStyle}>
            <Suspense fallback={<TabSpinner />}>
              <Kanban profile={activeProfile} />
            </Suspense>
          </div>
        )}
        {primaryView === "system" && (<div style={paneStyle}>
          <SubTabBar tabs={SUB_VIEWS.system} activeTab={effectiveSub} onSelect={(id) => setActiveSubView(id)} t={t} />
          <div className="sub-tab-content">
            {effectiveSub === "schedules" ? <Suspense fallback={<TabSpinner />}><Schedules profile={activeProfile} /></Suspense>
              : effectiveSub === "gateway" ? (remoteMode ? <RemoteNotice feature="Gateway" /> : <Suspense fallback={<TabSpinner />}><Gateway profile={activeProfile} /></Suspense>)
              : effectiveSub === "config" ? (remoteMode ? <RemoteNotice feature="Config" /> : <Suspense fallback={<TabSpinner />}><ConfigEditor profile={activeProfile} /></Suspense>)
              : <Suspense fallback={<TabSpinner />}><Settings profile={activeProfile} /></Suspense>}
          </div>
        </div>)}
      </main>
    </div>
  );
}

export default Layout;
