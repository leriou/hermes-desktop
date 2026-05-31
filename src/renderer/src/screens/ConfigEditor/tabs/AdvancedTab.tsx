import { useState } from "react";
import type { SelectOption } from "../ConfigField";
import ConfigField from "../ConfigField";

interface AdvancedTabProps {
  config: Record<string, string>;
  onConfigChange: (key: string, value: string) => void;
  saving: string | null;
  errors: Record<string, string>;
  profile?: string;
}

const APPROVAL_MODE_OPTIONS: SelectOption[] = [
  { value: "smart", label: "Smart" },
  { value: "always", label: "Always" },
  { value: "never", label: "Never" },
];

const CRED_STRATEGY_OPTIONS: SelectOption[] = [
  { value: "round_robin", label: "Round Robin" },
  { value: "random", label: "Random" },
  { value: "first", label: "First" },
  { value: "affinity", label: "Affinity" },
];

function AdvancedTab({
  config,
  onConfigChange,
  saving,
  errors,
}: AdvancedTabProps): React.JSX.Element {
  const [tagInput, setTagInput] = useState("");

  function parseAllowlist(raw: string): string[] {
    if (!raw || raw === "[]") return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }

  const allowlist = parseAllowlist(config["command_allowlist"] || "[]");

  function handleAddTag() {
    const trimmed = tagInput.trim();
    if (!trimmed || allowlist.includes(trimmed)) return;
    const next = [...allowlist, trimmed];
    onConfigChange("command_allowlist", JSON.stringify(next));
    setTagInput("");
  }

  function handleRemoveTag(item: string) {
    const next = allowlist.filter((t) => t !== item);
    onConfigChange("command_allowlist", JSON.stringify(next));
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  }

  return (
    <div className="config-tab-content">
      {/* Approvals */}
      <div className="config-section-card">
        <h3 className="config-section-title">Approvals</h3>
        <div className="config-section-grid">
          <ConfigField
            label="Mode"
            configKey="approvals.mode"
            value={config["approvals.mode"] || "smart"}
            type="select"
            options={APPROVAL_MODE_OPTIONS}
            onChange={onConfigChange}
            saving={saving}
            error={errors["approvals.mode"]}
          />
          <ConfigField
            label="Timeout (s)"
            configKey="approvals.timeout"
            value={config["approvals.timeout"] || "120"}
            type="number"
            min={30}
            max={600}
            helperText="seconds"
            onChange={onConfigChange}
            saving={saving}
            error={errors["approvals.timeout"]}
          />
        </div>
      </div>

      {/* Command Allowlist */}
      <div className="config-section-card">
        <h3 className="config-section-title">Command Allowlist</h3>
        <p className="config-section-desc">
          Commands that require explicit user approval before execution.
        </p>
        <div className="config-tag-chips">
          {allowlist.map((item, idx) => (
            <span key={idx} className="config-chip config-chip-removable">
              <span className="config-chip-label">{item}</span>
              <button
                className="config-chip-remove"
                onClick={() => handleRemoveTag(item)}
                title="Remove"
              >
                ×
              </button>
            </span>
          ))}
          {allowlist.length === 0 && (
            <span className="config-empty-hint">No commands in allowlist</span>
          )}
        </div>
        <div className="config-tag-input-row">
          <input
            type="text"
            className="config-input config-tag-input"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder="Add command pattern..."
            spellCheck={false}
          />
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleAddTag}
            disabled={!tagInput.trim()}
          >
            Add
          </button>
        </div>
      </div>

      {/* Credential Pool Strategies */}
      <div className="config-section-card">
        <h3 className="config-section-title">Credential Pool Strategies</h3>
        <p className="config-section-desc">
          Per-provider credential selection strategy.
        </p>
        <div className="config-section-grid">
          {[
            { key: "credential_pool_strategies.gemini", label: "Gemini" },
            { key: "credential_pool_strategies.openai", label: "OpenAI" },
            {
              key: "credential_pool_strategies.anthropic",
              label: "Anthropic",
            },
          ].map(({ key, label }) => (
            <ConfigField
              key={key}
              label={label}
              configKey={key}
              value={config[key] || "round_robin"}
              type="select"
              options={CRED_STRATEGY_OPTIONS}
              onChange={onConfigChange}
              saving={saving}
              error={errors[key]}
            />
          ))}
        </div>
      </div>

      {/* Timezone */}
      <div className="config-section-card">
        <h3 className="config-section-title">Timezone</h3>
        <div className="config-section-grid">
          <ConfigField
            label="Timezone"
            configKey="timezone"
            value={config["timezone"] || "Asia/Shanghai"}
            type="text"
            placeholder="Asia/Shanghai"
            onChange={onConfigChange}
            saving={saving}
            error={errors["timezone"]}
          />
        </div>
      </div>
    </div>
  );
}

export default AdvancedTab;
