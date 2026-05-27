import { useState, useEffect, useCallback } from "react";
import {
  runtimeHealth,
  startGateway,
  stopGateway,
  copyDiagnostics,
  copyToClipboard
} from "@renderer/lib/hermes-tauri";
import {
  Activity,
  RefreshCw,
  FileText,
  CheckCircle2,
  AlertCircle,
  Info,
  Terminal
} from "lucide-react";

export function GatewayHealthPanel(): React.JSX.Element {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setSaved] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      const h = await runtimeHealth();
      setHealth(h);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, 3000);
    return () => clearInterval(id);
  }, [fetchHealth]);

  async function handleRestart() {
    setLoading(true);
    try {
      await stopGateway();
      await startGateway();
      await fetchHealth();
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyDiagnostics() {
    try {
      const diag = await copyDiagnostics();
      await copyToClipboard(diag);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert("Failed to copy diagnostics: " + String(e));
    }
  }

  if (!health) return <div className="gateway-health-loading">Loading...</div>;

  const isReady = health.status === "Ready";
  const isError = health.status === "Failed";

  return (
    <div className="gateway-health-panel">
      <div className="gateway-health-header">
        <div className="gateway-health-title">
          <Activity size={16} className={isReady ? "text-success" : isError ? "text-error" : "text-warning animate-pulse"} />
          <span>Gateway Health</span>
        </div>
        <div className={`gateway-health-status-badge status-${health.status.toLowerCase()}`}>
          {health.status}
        </div>
      </div>

      <div className="gateway-health-grid">
        <div className="gateway-health-item">
          <label>Uptime</label>
          <span>{health.lastReadyAt ? new Date(health.lastReadyAt * 1000).toLocaleTimeString() : "N/A"}</span>
        </div>
        <div className="gateway-health-item">
          <label>Restarts</label>
          <span>{health.restartCount} / {health.maxRestarts}</span>
        </div>
        <div className="gateway-health-item">
          <label>Pending RPC</label>
          <span>{health.pendingRequests}</span>
        </div>
        <div className="gateway-health-item">
          <label>Active SID</label>
          <span className="truncate" title={health.activeSessionId || ""}>
            {health.activeSessionId ? health.activeSessionId.slice(-8) : "None"}
          </span>
        </div>
      </div>

      {health.lastError && (
        <div className="gateway-health-error-box">
          <div className="error-box-header">
            <AlertCircle size={14} />
            <span>Last Error</span>
          </div>
          <div className="error-box-content">{health.lastError}</div>
        </div>
      )}

      <div className="gateway-health-paths">
        <div className="path-item">
          <Terminal size={14} />
          <span className="path-label">Python:</span>
          <span className={`path-status ${health.paths?.pythonExists ? "text-success" : "text-error"}`}>
            {health.paths?.pythonExists ? "OK" : "Missing"}
          </span>
        </div>
        <div className="path-item">
          <Info size={14} />
          <span className="path-label">Home:</span>
          <span className={`path-status ${health.paths?.homeExists ? "text-success" : "text-error"}`}>
            {health.paths?.homeExists ? "OK" : "Missing"}
          </span>
        </div>
      </div>

      <div className="gateway-health-actions">
        <button
          className="btn btn-secondary btn-sm flex-1"
          onClick={handleRestart}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          <span>Restart Gateway</span>
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleCopyDiagnostics}
          title="Copy full diagnostics to clipboard"
        >
          {copied ? <CheckCircle2 size={14} className="text-success" /> : <FileText size={14} />}
          <span>{copied ? "Copied" : "Diagnostics"}</span>
        </button>
      </div>
    </div>
  );
}
