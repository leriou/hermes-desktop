import { useState, useEffect } from "react";
import type { SelectOption } from "../ConfigField";
import ConfigField from "../ConfigField";
import { getPlatformEnabled, setPlatformEnabled } from "@renderer/lib/hermes-tauri";

interface AgentTabProps {
  config: Record<string, string>;
  onConfigChange: (key: string, value: string) => void;
  saving: string | null;
  errors: Record<string, string>;
  profile?: string;
}

const AGENT_FIELDS: Array<{
  key: string;
  label: string;
  type: "number" | "select" | "textarea";
  options?: SelectOption[];
  min?: number;
  max?: number;
  helperText?: string;
  rows?: number;
}> = [
  {
    key: "agent.max_turns",
    label: "Max Turns",
    type: "number",
    min: 1,
    max: 1000,
    helperText: "1 – 1000",
  },
  {
    key: "agent.gateway_timeout",
    label: "Gateway Timeout (s)",
    type: "number",
    min: 60,
    max: 7200,
    helperText: "seconds",
  },
  {
    key: "agent.restart_drain_timeout",
    label: "Restart Drain Timeout",
    type: "number",
    min: 0,
    max: 300,
    helperText: "seconds",
  },
  {
    key: "agent.gateway_notify_interval",
    label: "Notify Interval",
    type: "number",
    min: 30,
    max: 3600,
    helperText: "seconds",
  },
  {
    key: "agent.reasoning_effort",
    label: "Reasoning Effort",
    type: "select",
    options: [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
    ],
  },
];

function AgentTab({
  config,
  onConfigChange,
  saving,
  errors,
  profile,
}: AgentTabProps): React.JSX.Element {
  const [toolsets, setToolsets] = useState<
    Array<{ key: string; label: string; enabled: boolean }>
  >([]);
  const [toolsetsLoading, setToolsetsLoading] = useState(true);
  const [disabledSet, setDisabledSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setToolsetsLoading(true);
    getPlatformEnabled(profile)
      .then((enabledMap) => {
        if (cancelled) return;
        const list = Object.entries(enabledMap)
          .map(([key, enabled]) => ({
            key,
            label: key.replace(/_/g, " "),
            enabled,
          }))
          .sort((a, b) => a.key.localeCompare(b.key));
        setToolsets(list);
        // Parse disabled toolsets from config
        const disabledStr = config["agent.disabled_toolsets"] || "[]";
        try {
          const parsed = JSON.parse(disabledStr);
          if (Array.isArray(parsed)) {
            setDisabledSet(new Set(parsed.map(String)));
          }
        } catch {
          setDisabledSet(new Set());
        }
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setToolsetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile]);

  const handleToolsetToggle = async (name: string, enabled: boolean) => {
    const next = new Set(disabledSet);
    if (enabled) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setDisabledSet(next);

    // Update config
    const arr = Array.from(next);
    onConfigChange("agent.disabled_toolsets", JSON.stringify(arr));

    // Call backend
    try {
      await setPlatformEnabled(name, enabled, profile);
    } catch (err) {
      console.error("Failed to toggle toolset:", err);
      // Revert
      setDisabledSet(new Set(disabledSet));
    }
  };

  return (
    <div className="config-tab-content">
      {/* Reasoning Section */}
      <div className="config-section-card">
        <h3 className="config-section-title">Reasoning</h3>
        <div className="config-section-grid">
          {AGENT_FIELDS.map((f) => (
            <ConfigField
              key={f.key}
              label={f.label}
              configKey={f.key}
              value={config[f.key] || ""}
              type={f.type}
              options={f.options}
              min={f.min}
              max={f.max}
              helperText={f.helperText}
              onChange={onConfigChange}
              saving={saving}
              error={errors[f.key]}
            />
          ))}
        </div>
      </div>

      {/* Personality Section */}
      <div className="config-section-card">
        <h3 className="config-section-title">Personality</h3>
        <ConfigField
          label="Hermes Personality"
          configKey="agent.personalities.hermes"
          value={config["agent.personalities.hermes"] || ""}
          type="textarea"
          rows={5}
          placeholder="You are Hermes, a helpful AI assistant..."
          onChange={onConfigChange}
          saving={saving}
          error={errors["agent.personalities.hermes"]}
        />
      </div>

      {/* Disabled Toolsets Section */}
      <div className="config-section-card">
        <h3 className="config-section-title">Disabled Toolsets</h3>
        <p className="config-section-desc">
          Uncheck to disable. Changes are applied immediately.
        </p>
        {toolsetsLoading ? (
          <div className="config-loading-placeholder">Loading toolsets...</div>
        ) : (
          <div className="config-multiselect-grid">
            {toolsets.map((ts) => {
              const isEnabled = !disabledSet.has(ts.key);
              return (
                <label
                  key={ts.key}
                  className={`config-chip ${isEnabled ? "config-chip-active" : ""}`}
                >
                  <input
                    type="checkbox"
                    className="config-chip-checkbox"
                    checked={isEnabled}
                    onChange={(e) =>
                      handleToolsetToggle(ts.key, e.target.checked)
                    }
                  />
                  <span className="config-chip-label">{ts.key}</span>
                </label>
              );
            })}
            {toolsets.length === 0 && (
              <span className="config-empty-hint">No toolsets available</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AgentTab;
