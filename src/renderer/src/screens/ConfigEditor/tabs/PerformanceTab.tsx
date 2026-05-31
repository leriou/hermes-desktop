import ConfigField from "../ConfigField";

interface PerformanceTabProps {
  config: Record<string, string>;
  onConfigChange: (key: string, value: string) => void;
  saving: string | null;
  errors: Record<string, string>;
}

function PerformanceTab({
  config,
  onConfigChange,
  saving,
  errors,
}: PerformanceTabProps): React.JSX.Element {
  return (
    <div className="config-tab-content">
      {/* Compression */}
      <div className="config-section-card">
        <h3 className="config-section-title">Compression</h3>
        <div className="config-section-grid">
          <ConfigField
            label="Threshold"
            configKey="compression.threshold"
            value={config["compression.threshold"] || "0.6"}
            type="number"
            min={0}
            max={1}
            step={0.05}
            helperText="0 – 1"
            onChange={onConfigChange}
            saving={saving}
            error={errors["compression.threshold"]}
          />
          <ConfigField
            label="Protect Last N"
            configKey="compression.protect_last_n"
            value={config["compression.protect_last_n"] || "9"}
            type="number"
            min={1}
            max={100}
            onChange={onConfigChange}
            saving={saving}
            error={errors["compression.protect_last_n"]}
          />
          <ConfigField
            label="Protect First N"
            configKey="compression.protect_first_n"
            value={config["compression.protect_first_n"] || "2"}
            type="number"
            min={0}
            max={50}
            onChange={onConfigChange}
            saving={saving}
            error={errors["compression.protect_first_n"]}
          />
        </div>
      </div>

      {/* Prompt Caching */}
      <div className="config-section-card">
        <h3 className="config-section-title">Prompt Caching</h3>
        <div className="config-section-grid">
          <ConfigField
            label="Cache TTL"
            configKey="prompt_caching.cache_ttl"
            value={config["prompt_caching.cache_ttl"] || "1h"}
            type="duration"
            placeholder="1h"
            helperText="e.g. 1h, 30m, 1d"
            onChange={onConfigChange}
            saving={saving}
            error={errors["prompt_caching.cache_ttl"]}
          />
          <ConfigField
            label="Long-lived Prefix"
            configKey="prompt_caching.long_lived_prefix"
            value={config["prompt_caching.long_lived_prefix"] || "true"}
            type="toggle"
            onChange={onConfigChange}
            saving={saving}
            error={errors["prompt_caching.long_lived_prefix"]}
          />
        </div>
      </div>

      {/* Checkpoints */}
      <div className="config-section-card">
        <h3 className="config-section-title">Checkpoints</h3>
        <div className="config-section-grid">
          <ConfigField
            label="Enabled"
            configKey="checkpoints.enabled"
            value={config["checkpoints.enabled"] || "true"}
            type="toggle"
            onChange={onConfigChange}
            saving={saving}
            error={errors["checkpoints.enabled"]}
          />
          <ConfigField
            label="Max Snapshots"
            configKey="checkpoints.max_snapshots"
            value={config["checkpoints.max_snapshots"] || "8"}
            type="number"
            min={1}
            max={100}
            onChange={onConfigChange}
            saving={saving}
            error={errors["checkpoints.max_snapshots"]}
          />
          <ConfigField
            label="Retention Days"
            configKey="checkpoints.retention_days"
            value={config["checkpoints.retention_days"] || "5"}
            type="number"
            min={1}
            max={90}
            onChange={onConfigChange}
            saving={saving}
            error={errors["checkpoints.retention_days"]}
          />
        </div>
      </div>

      {/* Delegation */}
      <div className="config-section-card">
        <h3 className="config-section-title">Delegation</h3>
        <div className="config-section-grid">
          <ConfigField
            label="Model"
            configKey="delegation.model"
            value={config["delegation.model"] || "gemini-3.5-flash"}
            type="text"
            onChange={onConfigChange}
            saving={saving}
            error={errors["delegation.model"]}
          />
          <ConfigField
            label="Provider"
            configKey="delegation.provider"
            value={config["delegation.provider"] || "custom"}
            type="text"
            onChange={onConfigChange}
            saving={saving}
            error={errors["delegation.provider"]}
          />
          <ConfigField
            label="Max Concurrent Children"
            configKey="delegation.max_concurrent_children"
            value={config["delegation.max_concurrent_children"] || "5"}
            type="number"
            min={1}
            max={20}
            onChange={onConfigChange}
            saving={saving}
            error={errors["delegation.max_concurrent_children"]}
          />
        </div>
      </div>
    </div>
  );
}

export default PerformanceTab;
