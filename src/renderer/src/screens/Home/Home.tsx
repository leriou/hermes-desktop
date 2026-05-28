import { gatewayStatus, runtimeHealth, listMcpServers, readLogs } from "@renderer/lib/hermes-tauri";
import { useState, useEffect, useCallback } from "react";
import { useI18n } from "../../components/useI18n";
import { RefreshCw, Activity, Server, AlertTriangle, Zap, ArrowRight, Clock, MessageSquare } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface HealthData {
  runtime: { status: string; activeSessionId: string | null; lastError: string | null; pendingRequests: number } | null;
  gatewayRunning: boolean;
  mcpTotal: number;
  mcpWarnings: Array<{ name: string; detail: string }>;
  errors1h: number;
  errors24h: number;
  latestError: string | null;
}

interface HomeProps {
  onNavigate: (view: string) => void;
  onNewChat: () => void;
  profile?: string;
}

function StatusDot({ status }: { status: "ok" | "warn" | "error" | "idle" }) {
  const colors = { ok: "#22c55e", warn: "#f59e0b", error: "#ef4444", idle: "#7a7a84" };
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: colors[status], flexShrink: 0 }} />;
}

function HealthCard({ icon: Icon, label, value, status, detail }: {
  icon: LucideIcon; label: string; value: string; status: "ok" | "warn" | "error" | "idle"; detail?: string;
}) {
  return (
    <div className="home-health-card">
      <div className="home-health-card-header">
        <StatusDot status={status} />
        <span className="home-health-card-label">{label}</span>
        <Icon size={13} className="home-health-card-icon" />
      </div>
      <div className="home-health-card-value">{value}</div>
      {detail && <div className="home-health-card-detail">{detail}</div>}
    </div>
  );
}

function Home({ onNavigate, onNewChat, profile }: HomeProps): React.JSX.Element {
  const { t } = useI18n();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [rt, gw, mcpServers, logs] = await Promise.allSettled([
        runtimeHealth(), gatewayStatus(), listMcpServers(profile), readLogs("errors.log", 200),
      ]);
      const runtime = rt.status === "fulfilled" ? rt.value : null;
      const gatewayRunning = gw.status === "fulfilled" ? gw.value : false;
      const servers = mcpServers.status === "fulfilled" ? mcpServers.value : [];
      const logContent = logs.status === "fulfilled" ? (logs.value as any).content : "";
      const mcpWarnings = (servers as any[]).filter((s) => !s.enabled || /error|fail|warn/i.test(s.detail)).map((s) => ({ name: s.name, detail: s.detail }));
      const now = Date.now() / 1000;
      const lines = logContent.split("\n").filter(Boolean);
      const errors1h = lines.filter((l: string) => { const m = l.match(/(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2})/); if (!m) return false; return now - new Date(m[1]).getTime() / 1000 < 3600; }).length;
      const errors24h = lines.filter((l: string) => { const m = l.match(/(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2})/); if (!m) return false; return now - new Date(m[1]).getTime() / 1000 < 86400; }).length;
      const latestError = lines.length > 0 ? lines[lines.length - 1].slice(0, 120) : null;
      setHealth({ runtime: runtime ? { status: (runtime as any).status, activeSessionId: (runtime as any).activeSessionId, lastError: (runtime as any).lastError, pendingRequests: (runtime as any).pendingRequests } : null, gatewayRunning, mcpTotal: (servers as any[]).length, mcpWarnings, errors1h, errors24h, latestError });
    } catch (err) { setError((err as Error).message || "Failed to load health data"); }
    finally { setLoading(false); }
  }, [profile]);

  useEffect(() => { loadHealth(); const i = setInterval(loadHealth, 30_000); return () => clearInterval(i); }, [loadHealth]);

  const rtStatus = health?.runtime?.status ?? "Stopped";
  const runtimeOk = rtStatus === "Ready";
  const mcpOk = health ? health.mcpWarnings.length === 0 : true;
  const errorsOk = health ? health.errors1h === 0 : true;

  return (
    <div className="home-container">
      <div className="home-header">
        <div className="home-title-row"><Activity size={18} /><h2 className="home-title">{t("navigation.home")}</h2></div>
        <button className="home-refresh-btn" onClick={loadHealth} disabled={loading}><RefreshCw size={14} /><span>{loading ? "..." : (t("common.refresh") || "Refresh")}</span></button>
      </div>
      {error && <div className="home-error-banner"><AlertTriangle size={14} /><span>{error}</span></div>}
      <div className="home-health-strip">
        <HealthCard icon={Zap} label="Runtime" value={rtStatus} status={runtimeOk ? "ok" : rtStatus === "Starting" ? "warn" : "error"} detail={health?.runtime?.lastError || undefined} />
        <HealthCard icon={Server} label="Gateway" value={health?.gatewayRunning ? "Running" : "Stopped"} status={health?.gatewayRunning ? "ok" : "idle"} />
        <HealthCard icon={AlertTriangle} label="MCP" value={health ? `${health.mcpTotal} servers` : "—"} status={mcpOk ? "ok" : "warn"} detail={mcpOk ? undefined : `${health!.mcpWarnings.length} warnings`} />
        <HealthCard icon={AlertTriangle} label="Errors 1h" value={health ? String(health.errors1h) : "—"} status={errorsOk ? "ok" : "error"} />
        <HealthCard icon={Clock} label="Errors 24h" value={health ? String(health.errors24h) : "—"} status={health && health.errors24h === 0 ? "ok" : "warn"} />
      </div>
      {health && health.mcpWarnings.length > 0 && (
        <div className="home-section">
          <h3 className="home-section-title">MCP Warnings</h3>
          <div className="home-mcp-warnings">{health.mcpWarnings.map((w) => (
            <div key={w.name} className="home-mcp-warning-item"><AlertTriangle size={13} className="home-mcp-warn-icon" /><span className="home-mcp-server-name">{w.name}</span><span className="home-mcp-server-detail">{w.detail}</span></div>
          ))}</div>
        </div>
      )}
      {health?.latestError && <div className="home-section"><h3 className="home-section-title">Latest Error</h3><div className="home-latest-error"><code>{health.latestError}</code></div></div>}
      <div className="home-actions">
        <button className="home-action-card" onClick={() => onNavigate("chat")}>
          <div className="home-action-main"><MessageSquare size={20} /><div><div className="home-action-title">Continue Chat</div><div className="home-action-desc">{health?.runtime?.activeSessionId ? "Resume your active session" : "Start a new conversation"}</div></div></div>
          <ArrowRight size={16} className="home-action-arrow" />
        </button>
        <button className="home-action-card home-action-secondary" onClick={onNewChat}>
          <div className="home-action-main"><Zap size={20} /><div><div className="home-action-title">New Chat</div><div className="home-action-desc">Start fresh</div></div></div>
          <ArrowRight size={16} className="home-action-arrow" />
        </button>
      </div>
      <div className="home-quick-links">
        <button className="home-quick-link" onClick={() => onNavigate("agents")}><span>Agents</span> <ArrowRight size={12} /></button>
        <button className="home-quick-link" onClick={() => onNavigate("modelControl")}><span>Model Control</span> <ArrowRight size={12} /></button>
        <button className="home-quick-link" onClick={() => onNavigate("system")}><span>System</span> <ArrowRight size={12} /></button>
        <button className="home-quick-link" onClick={() => onNavigate("extensions")}><span>Extensions</span> <ArrowRight size={12} /></button>
      </div>
    </div>
  );
}

export default Home;
