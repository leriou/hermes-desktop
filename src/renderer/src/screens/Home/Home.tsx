import { homeHealthSummary } from "@renderer/lib/hermes-tauri";
import type { HomeHealthSummary } from "@renderer/shared/api-types";
import { useState, useEffect, useCallback } from "react";
import { useI18n } from "../../components/useI18n";
import { RefreshCw, Activity, Server, AlertTriangle, Zap, ArrowRight, Clock, MessageSquare } from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
  const [health, setHealth] = useState<HomeHealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await homeHealthSummary(profile);
      setHealth(data);
    } catch (err) { setError((err as Error).message || "Failed to load health data"); }
    finally { setLoading(false); }
  }, [profile]);

  useEffect(() => { loadHealth(); const i = setInterval(loadHealth, 30_000); return () => clearInterval(i); }, [loadHealth]);

  const rtStatus = health?.runtimeStatus ?? "Stopped";
  const runtimeOk = rtStatus === "Ready";
  const mcpOk = health ? health.mcp.warningServers.length === 0 : true;
  const errorsOk = health ? health.errors.lastHour === 0 : true;

  return (
    <div className="home-container">
      <div className="home-header">
        <div className="home-title-row"><Activity size={18} /><h2 className="home-title">{t("navigation.home")}</h2></div>
        <button className="home-refresh-btn" onClick={loadHealth} disabled={loading}><RefreshCw size={14} /><span>{loading ? "..." : (t("common.refresh") || "Refresh")}</span></button>
      </div>
      {error && <div className="home-error-banner"><AlertTriangle size={14} /><span>{error}</span></div>}
      <div className="home-health-strip">
        <HealthCard icon={Zap} label="Runtime" value={rtStatus} status={runtimeOk ? "ok" : rtStatus === "Starting" ? "warn" : "error"} />
        <HealthCard icon={Server} label="Gateway" value={health?.gatewayRunning ? "Running" : "Stopped"} status={health?.gatewayRunning ? "ok" : "idle"} />
        <HealthCard icon={AlertTriangle} label="MCP" value={health ? `${health.mcp.total} servers` : "—"} status={mcpOk ? "ok" : "warn"} detail={mcpOk ? undefined : `${health!.mcp.warningServers.length} warnings`} />
        <HealthCard icon={AlertTriangle} label="Errors 1h" value={health ? String(health.errors.lastHour) : "—"} status={errorsOk ? "ok" : "error"} />
        <HealthCard icon={Clock} label="Errors 24h" value={health ? String(health.errors.lastDay) : "—"} status={health && health.errors.lastDay === 0 ? "ok" : "warn"} />
      </div>
      {health && health.mcp.warningServers.length > 0 && (
        <div className="home-section">
          <h3 className="home-section-title">MCP Warnings</h3>
          <div className="home-mcp-warnings">{health.mcp.warningServers.map((w) => (
            <div key={w.name} className="home-mcp-warning-item"><AlertTriangle size={13} className="home-mcp-warn-icon" /><span className="home-mcp-server-name">{w.name}</span>{w.summary && <span className="home-mcp-server-detail">{w.summary}</span>}</div>
          ))}</div>
        </div>
      )}
      {health?.errors.latestSummary && <div className="home-section"><h3 className="home-section-title">Latest Error</h3><div className="home-latest-error"><code>{health.errors.latestSummary}</code></div></div>}
      <div className="home-actions">
        <button className="home-action-card" onClick={() => onNavigate("chat")}>
          <div className="home-action-main"><MessageSquare size={20} /><div><div className="home-action-title">Continue Chat</div><div className="home-action-desc">Start a new conversation</div></div></div>
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
