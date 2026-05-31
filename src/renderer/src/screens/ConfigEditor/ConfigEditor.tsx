import { readConfigYaml, setConfig } from "@renderer/lib/hermes-tauri";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import * as yaml from "js-yaml";
import AgentTab from "./tabs/AgentTab";
import DisplayTab from "./tabs/DisplayTab";
import WebTerminalTab from "./tabs/WebTerminalTab";
import PerformanceTab from "./tabs/PerformanceTab";
import AuxiliaryTab from "./tabs/AuxiliaryTab";
import AdvancedTab from "./tabs/AdvancedTab";
import RawYamlTab from "./tabs/RawYamlTab";

interface ConfigEditorProps {
  profile?: string;
}

type TabId = "agent" | "display" | "web-terminal" | "performance" | "auxiliary" | "advanced" | "raw-yaml";

interface TabDef {
  id: TabId;
  label: string;
}

const TABS: TabDef[] = [
  { id: "agent", label: "Agent" },
  { id: "display", label: "Display" },
  { id: "web-terminal", label: "Web & Terminal" },
  { id: "performance", label: "Performance" },
  { id: "auxiliary", label: "Auxiliary" },
  { id: "advanced", label: "Advanced" },
  { id: "raw-yaml", label: "Raw YAML" },
];

interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

/**
 * Flatten a parsed YAML object into a Record<string, string>,
 * mapping nested keys to dotted paths.
 */
function flattenConfig(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      Object.assign(result, flattenConfig(val as Record<string, unknown>, fullKey));
    } else if (Array.isArray(val)) {
      result[fullKey] = JSON.stringify(val);
    } else if (typeof val === "boolean") {
      result[fullKey] = val ? "true" : "false";
    } else if (typeof val === "number") {
      result[fullKey] = String(val);
    } else {
      result[fullKey] = String(val ?? "");
    }
  }
  return result;
}

function parseConfigYaml(yamlContent: string): Record<string, string> {
  if (!yamlContent) return {};
  try {
    const parsed = yaml.load(yamlContent) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    return flattenConfig(parsed);
  } catch {
    return {};
  }
}

function ConfigEditor({ profile }: ConfigEditorProps): React.JSX.Element {
  const [config, setConfigState] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("agent");
  const [saving, setSaving] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lastSaved, setLastSaved] = useState<Record<string, string>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const toastIdRef = useRef(0);

  const addToast = useCallback((message: string, type: "success" | "error") => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Load config on mount
  const loadConfig = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const result = await readConfigYaml(profile);
      const parsed = parseConfigYaml(result.content);
      setConfigState(parsed);
      setLastSaved(parsed);
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Reload raw YAML when switching to Raw tab
  useEffect(() => {
    if (activeTab === "raw-yaml") {
      // Flush pending saves
      const keys = Object.keys(timersRef.current);
      for (const key of keys) {
        if (timersRef.current[key]) {
          clearTimeout(timersRef.current[key]);
          delete timersRef.current[key];
        }
      }
    }
  }, [activeTab]);

  // Handle config change (debounced set_config)
  const handleConfigChange = useCallback(
    (key: string, value: string) => {
      // Update local state immediately (optimistic)
      setConfigState((prev) => ({ ...prev, [key]: value }));

      // Clear existing timer for this key
      if (timersRef.current[key]) {
        clearTimeout(timersRef.current[key]);
      }

      // Set new debounced timer
      timersRef.current[key] = setTimeout(async () => {
        delete timersRef.current[key];
        setSaving(key);
        try {
          await setConfig(key, value, profile);
          setLastSaved((prev) => ({ ...prev, [key]: value }));
          setErrors((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          addToast(`"${key}" updated`, "success");
        } catch (err) {
          const errMsg = String(err);
          setErrors((prev) => ({ ...prev, [key]: errMsg }));
          // Revert on failure
          setConfigState((prev) => {
            const reverted = lastSaved[key] ?? prev[key];
            return { ...prev, [key]: reverted ?? prev[key] };
          });
          addToast(`Failed to update "${key}": ${errMsg}`, "error");
        } finally {
          setSaving(null);
        }
      }, 500);
    },
    [profile, lastSaved, addToast],
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of Object.values(timersRef.current)) {
        clearTimeout(timer);
      }
    };
  }, []);

  // Dirty state per tab
  const dirtyCount = useMemo(() => {
    let count = 0;
    for (const key of Object.keys(config)) {
      if (config[key] !== lastSaved[key]) count++;
    }
    return count;
  }, [config, lastSaved]);

  const hasUnsavedChanges = dirtyCount > 0;

  function getDirtyForTab(tabId: TabId): boolean {
    const tabPrefixes: Record<TabId, string[]> = {
      agent: ["agent."],
      display: ["display.", "dashboard."],
      "web-terminal": ["terminal.", "web.", "browser."],
      performance: [
        "compression.",
        "prompt_caching.",
        "checkpoints.",
        "delegation.",
      ],
      auxiliary: [
        "auxiliary.",
        "tts.",
        "stt.",
        "context.",
        "memory.",
      ],
      advanced: ["approvals.", "command_allowlist", "credential_pool_strategies.", "timezone"],
      "raw-yaml": [],
    };

    const prefixes = tabPrefixes[tabId] || [];
    for (const key of Object.keys(config)) {
      if (config[key] !== lastSaved[key]) {
        if (prefixes.some((p) => key.startsWith(p))) {
          return true;
        }
      }
    }
    return false;
  }

  // Render active tab
  function renderTab(): React.JSX.Element {
    switch (activeTab) {
      case "agent":
        return (
          <AgentTab
            config={config}
            onConfigChange={handleConfigChange}
            saving={saving}
            errors={errors}
            profile={profile}
          />
        );
      case "display":
        return (
          <DisplayTab
            config={config}
            onConfigChange={handleConfigChange}
            saving={saving}
            errors={errors}
          />
        );
      case "web-terminal":
        return (
          <WebTerminalTab
            config={config}
            onConfigChange={handleConfigChange}
            saving={saving}
            errors={errors}
          />
        );
      case "performance":
        return (
          <PerformanceTab
            config={config}
            onConfigChange={handleConfigChange}
            saving={saving}
            errors={errors}
          />
        );
      case "auxiliary":
        return (
          <AuxiliaryTab
            config={config}
            onConfigChange={handleConfigChange}
            saving={saving}
            errors={errors}
          />
        );
      case "advanced":
        return (
          <AdvancedTab
            config={config}
            onConfigChange={handleConfigChange}
            saving={saving}
            errors={errors}
            profile={profile}
          />
        );
      case "raw-yaml":
        return <RawYamlTab profile={profile} />;
      default:
        return <div className="config-tab-placeholder">Select a tab</div>;
    }
  }

  if (loading) {
    return (
      <div className="config-editor-container">
        <div className="config-editor-loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="config-editor-container">
        <div className="config-error-state">
          <p>Failed to load configuration</p>
          <p className="config-error-detail">{loadError}</p>
          <button className="btn btn-primary" onClick={loadConfig}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="config-editor-container">
      {/* Tab Bar */}
      <div className="config-tab-bar-wrapper">
        <div className="tab-bar">
          {TABS.map((tab) => {
            const isDirty = getDirtyForTab(tab.id);
            return (
              <button
                key={tab.id}
                className={`tab-item ${activeTab === tab.id ? "tab-active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
                {isDirty && <span className="tab-dirty-dot" />}
              </button>
            );
          })}
        </div>
        <div className="config-auto-save-indicator">
          {saving ? (
            <span className="config-status-saving">Saving...</span>
          ) : hasUnsavedChanges ? (
            <span className="config-status-unsaved">
              {dirtyCount} unsaved change{dirtyCount !== 1 ? "s" : ""}
            </span>
          ) : (
            <span className="config-status-saved">All changes saved</span>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <div className="config-tab-body">{renderTab()}</div>

      {/* Toast Container */}
      {toasts.length > 0 && (
        <div className="config-toast-container">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`config-toast config-toast-${t.type}`}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ConfigEditor;
