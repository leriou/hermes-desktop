import { useState, useEffect, useCallback, useMemo } from "react";
import { Refresh } from "../../assets/icons";
import { useI18n } from "../../components/useI18n";

// ═══════════════════════════════════════════════════════════════════════
// IMPORTANT: 工具数据来源是 `hermes tools list` CLI 命令输出（通过 IPC），
// 一共 3 类：built-in（内置）、plugin（用户自建）、mcp（MCP 服务）。
// 开关通过 hermes tools.configure 执行。不许改成其他数据源。
// ═══════════════════════════════════════════════════════════════════════

interface ToolsetInfo {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  source: string;
}

interface ToolsProps {
  profile?: string;
}

const TOOL_ICONS: Record<string, React.JSX.Element> = {
  web: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  browser: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 3v6" />
    </svg>
  ),
  terminal: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="m7 10 3 3-3 3M13 16h4" />
    </svg>
  ),
  file: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  ),
  code_execution: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /><line x1="14" y1="4" x2="10" y2="20" />
    </svg>
  ),
  vision: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ),
  image_gen: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
    </svg>
  ),
  tts: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  ),
  memory: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
    </svg>
  ),
  skills: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.315 8.685a.98.98 0 0 1 .837-.276c.47.07.802.48.968.925a2.501 2.501 0 1 0 3.214-3.214c-.446-.166-.855-.497-.925-.968a.979.979 0 0 1 .276-.837l1.61-1.61a2.404 2.404 0 0 1 1.705-.707c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02z" />
    </svg>
  ),
  cronjob: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  mcp: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <circle cx="6" cy="6" r="1" />
      <circle cx="6" cy="18" r="1" />
    </svg>
  ),
};

function ToolIcon({ toolKey }: { toolKey: string }): React.JSX.Element {
  return (
    <div className="tools-card-icon">
      {TOOL_ICONS[toolKey] || (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      )}
    </div>
  );
}

const SECTION_LABELS: Record<string, string> = {
  "built-in": "Built-in Toolsets",
  plugin: "User Plugin Toolsets",
};

type ToolTab = "tools" | "mcp";

function Tools({ profile }: ToolsProps): React.JSX.Element {
  const { t } = useI18n();
  const [toolsets, setToolsets] = useState<ToolsetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<ToolTab>("tools");

  const loadToolsets = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const list = await window.hermesAPI.getToolsets(profile);
      setToolsets((list as ToolsetInfo[]) ?? []);
    } catch (err) {
      console.error("Failed to load toolsets", err);
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    loadToolsets();
  }, [loadToolsets]);

  async function handleToggle(
    key: string,
    currentEnabled: boolean,
  ): Promise<void> {
    setError("");
    setToolsets((prev) =>
      prev.map((t) =>
        t.key === key ? { ...t, enabled: !currentEnabled } : t,
      ),
    );
    const result = await window.hermesAPI.setToolsetEnabled(
      key,
      !currentEnabled,
      profile,
    );
    if (typeof result === "object" && result && !result.success) {
      setToolsets((prev) =>
        prev.map((t) =>
          t.key === key ? { ...t, enabled: currentEnabled } : t,
        ),
      );
      setError(result.error || "Failed to toggle tool");
    }
  }

  const builtinTools = useMemo(
    () => toolsets.filter((t) => t.source === "built-in"),
    [toolsets],
  );

  const pluginTools = useMemo(
    () => toolsets.filter((t) => t.source === "plugin"),
    [toolsets],
  );

  const mcpTools = useMemo(
    () => toolsets.filter((t) => t.source === "mcp"),
    [toolsets],
  );

  // Auto-switch tab: if no built-in/plugin but has mcp, show mcp tab
  useEffect(() => {
    if (!loading && builtinTools.length === 0 && pluginTools.length === 0 && mcpTools.length > 0) {
      setActiveTab("mcp");
    }
  }, [loading, builtinTools.length, pluginTools.length, mcpTools.length]);

  if (loading) {
    return (
      <div className="tools-container">
        <div className="tools-loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="tools-container">
      <div className="tools-header">
        <div>
          <h2 className="tools-title">{t("tools.title")}</h2>
          <p className="tools-subtitle">{t("tools.subtitle")}</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadToolsets}>
          <Refresh size={14} />
        </button>
      </div>

      <div className="tools-tabs">
        <button
          className={`tools-tab ${activeTab === "tools" ? "active" : ""}`}
          onClick={() => setActiveTab("tools")}
        >
          {t("tools.tabTools")}
        </button>
        <button
          className={`tools-tab ${activeTab === "mcp" ? "active" : ""}`}
          onClick={() => setActiveTab("mcp")}
        >
          {t("tools.tabMcp")}
          {mcpTools.length > 0 && (
            <span className="tools-tab-count">{mcpTools.length}</span>
          )}
        </button>
      </div>

      {error && <div className="plugins-error">{error}</div>}

      {activeTab === "tools" ? (
        <div className="tools-tab-content">
          {builtinTools.length > 0 && (
            <div className="tools-section">
              <div className="tools-section-header">
                <h3 className="tools-section-title">{SECTION_LABELS["built-in"]}</h3>
              </div>
              <div className="tools-grid">
                {builtinTools.map((tool) => (
                  <ToolCard key={tool.key} tool={tool} onToggle={handleToggle} />
                ))}
              </div>
            </div>
          )}
          {pluginTools.length > 0 && (
            <div className="tools-section">
              <div className="tools-section-header">
                <h3 className="tools-section-title">{SECTION_LABELS.plugin}</h3>
              </div>
              <div className="tools-grid">
                {pluginTools.map((tool) => (
                  <ToolCard key={tool.key} tool={tool} onToggle={handleToggle} />
                ))}
              </div>
            </div>
          )}
          {builtinTools.length === 0 && pluginTools.length === 0 && (
            <div className="tools-empty">{t("tools.noTools")}</div>
          )}
        </div>
      ) : (
        <div className="tools-tab-content">
          {mcpTools.length > 0 ? (
            <div className="tools-grid">
              {mcpTools.map((tool) => (
                <McpCard key={tool.key} tool={tool} />
              ))}
            </div>
          ) : (
            <div className="tools-empty">
              <p>{t("tools.noMcp")}</p>
              <p className="tools-empty-hint">{t("tools.noMcpHint")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolCard({
  tool,
  onToggle,
}: {
  tool: ToolsetInfo;
  onToggle: (key: string, enabled: boolean) => void;
}): React.JSX.Element {
  const { t } = useI18n();

  const i18nLabel = t(`tools.${tool.key}.label`);
  const label = i18nLabel === `tools.${tool.key}.label` ? tool.key : i18nLabel;

  const i18nDesc = t(`tools.${tool.key}.description`);
  const desc = i18nDesc === `tools.${tool.key}.description` ? tool.description : i18nDesc;

  return (
    <div
      className={`tools-card ${tool.enabled ? "tools-card-enabled" : "tools-card-disabled"}`}
      onClick={() => onToggle(tool.key, tool.enabled)}
    >
      <div className="tools-card-top">
        <ToolIcon toolKey={tool.key} />
        <label
          className="tools-toggle"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={tool.enabled}
            onChange={() => onToggle(tool.key, tool.enabled)}
          />
          <span className="tools-toggle-track" />
        </label>
      </div>
      <div className="tools-card-name-row">
        <span className="tools-card-label">{label}</span>
        <span className={`tools-source-badge tools-source-${tool.source}`}>
          {tool.source === "built-in" ? t("tools.builtin") : t("tools.plugin")}
        </span>
      </div>
      {desc && (
        <div className="tools-card-description">
          {desc}
        </div>
      )}
    </div>
  );
}

function McpCard({ tool }: { tool: ToolsetInfo }): React.JSX.Element {
  return (
    <div
      className={`tools-card ${tool.enabled ? "tools-card-enabled" : "tools-card-disabled"}`}
    >
      <div className="tools-card-top">
        <ToolIcon toolKey="mcp" />
        <span className={`tools-status-dot ${tool.enabled ? "tools-status-on" : "tools-status-off"}`} />
      </div>
      <div className="tools-card-label">{tool.key}</div>
      {tool.description && (
        <div className="tools-card-description">
          {tool.description}
        </div>
      )}
    </div>
  );
}

export default Tools;
