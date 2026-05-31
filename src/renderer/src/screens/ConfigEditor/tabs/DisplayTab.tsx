import type { SelectOption } from "../ConfigField";
import ConfigField from "../ConfigField";

interface DisplayTabProps {
  config: Record<string, string>;
  onConfigChange: (key: string, value: string) => void;
  saving: string | null;
  errors: Record<string, string>;
}

const LANGUAGE_OPTIONS: SelectOption[] = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
  { value: "ja", label: "日本語" },
  { value: "es", label: "Español" },
];

const RESUME_DISPLAY_OPTIONS: SelectOption[] = [
  { value: "minimal", label: "Minimal" },
  { value: "full", label: "Full" },
];

const DETAILS_MODE_OPTIONS: SelectOption[] = [
  { value: "collapsed", label: "Collapsed" },
  { value: "expanded", label: "Expanded" },
];

const TOOL_PROGRESS_OPTIONS: SelectOption[] = [
  { value: "all", label: "All" },
  { value: "errors", label: "Errors Only" },
  { value: "none", label: "None" },
];

const BG_NOTIFY_OPTIONS: SelectOption[] = [
  { value: "all", label: "All" },
  { value: "errors", label: "Errors Only" },
  { value: "none", label: "None" },
];

function DisplayTab({
  config,
  onConfigChange,
  saving,
  errors,
}: DisplayTabProps): React.JSX.Element {
  const toggles: Array<{ key: string; label: string }> = [
    { key: "display.compact", label: "Compact Mode" },
    { key: "display.tui_auto_resume_recent", label: "Auto Resume Recent" },
    { key: "display.bell_on_complete", label: "Bell on Complete" },
    { key: "display.show_reasoning", label: "Show Reasoning" },
    { key: "display.streaming", label: "Streaming" },
    { key: "display.timestamps", label: "Timestamps" },
    { key: "display.show_cost", label: "Show Cost" },
    { key: "display.runtime_footer.enabled", label: "Runtime Footer" },
    { key: "display.mouse_tracking", label: "Mouse Tracking" },
    { key: "display.statusbar", label: "Status Bar" },
  ];

  return (
    <div className="config-tab-content">
      {/* General Toggles */}
      <div className="config-section-card">
        <h3 className="config-section-title">General</h3>
        <div className="config-section-grid config-grid-3col">
          {toggles.map(({ key, label }) => (
            <ConfigField
              key={key}
              label={label}
              configKey={key}
              value={config[key] || "false"}
              type="toggle"
              onChange={onConfigChange}
              saving={saving}
              error={errors[key]}
            />
          ))}
        </div>
      </div>

      {/* Preferences */}
      <div className="config-section-card">
        <h3 className="config-section-title">Preferences</h3>
        <div className="config-section-grid">
          <ConfigField
            label="Language"
            configKey="display.language"
            value={config["display.language"] || "zh"}
            type="select"
            options={LANGUAGE_OPTIONS}
            onChange={onConfigChange}
            saving={saving}
            error={errors["display.language"]}
          />
          <ConfigField
            label="Display Personality"
            configKey="display.personality"
            value={config["display.personality"] || "hermes"}
            type="text"
            onChange={onConfigChange}
            saving={saving}
            error={errors["display.personality"]}
          />
          <ConfigField
            label="Resume Display"
            configKey="display.resume_display"
            value={config["display.resume_display"] || "minimal"}
            type="select"
            options={RESUME_DISPLAY_OPTIONS}
            onChange={onConfigChange}
            saving={saving}
            error={errors["display.resume_display"]}
          />
          <ConfigField
            label="Details Mode"
            configKey="display.details_mode"
            value={config["display.details_mode"] || "collapsed"}
            type="select"
            options={DETAILS_MODE_OPTIONS}
            onChange={onConfigChange}
            saving={saving}
            error={errors["display.details_mode"]}
          />
          <ConfigField
            label="Tool Progress"
            configKey="display.tool_progress"
            value={config["display.tool_progress"] || "all"}
            type="select"
            options={TOOL_PROGRESS_OPTIONS}
            onChange={onConfigChange}
            saving={saving}
            error={errors["display.tool_progress"]}
          />
          <ConfigField
            label="BG Process Notifications"
            configKey="display.background_process_notifications"
            value={config["display.background_process_notifications"] || "all"}
            type="select"
            options={BG_NOTIFY_OPTIONS}
            onChange={onConfigChange}
            saving={saving}
            error={errors["display.background_process_notifications"]}
          />
        </div>
      </div>

      {/* Sections */}
      <div className="config-section-card">
        <h3 className="config-section-title">Sections</h3>
        <div className="config-section-grid config-grid-3col">
          <ConfigField
            label="Activity"
            configKey="display.sections.activity"
            value={config["display.sections.activity"] || "collapsed"}
            type="select"
            options={DETAILS_MODE_OPTIONS}
            onChange={onConfigChange}
            saving={saving}
            error={errors["display.sections.activity"]}
          />
          <ConfigField
            label="Thinking"
            configKey="display.sections.thinking"
            value={config["display.sections.thinking"] || "collapsed"}
            type="select"
            options={DETAILS_MODE_OPTIONS}
            onChange={onConfigChange}
            saving={saving}
            error={errors["display.sections.thinking"]}
          />
          <ConfigField
            label="Tools"
            configKey="display.sections.tools"
            value={config["display.sections.tools"] || "collapsed"}
            type="select"
            options={DETAILS_MODE_OPTIONS}
            onChange={onConfigChange}
            saving={saving}
            error={errors["display.sections.tools"]}
          />
        </div>
      </div>

      {/* Dashboard */}
      <div className="config-section-card">
        <h3 className="config-section-title">Dashboard</h3>
        <div className="config-section-grid">
          <ConfigField
            label="Theme"
            configKey="dashboard.theme"
            value={config["dashboard.theme"] || "apple"}
            type="text"
            placeholder="apple"
            onChange={onConfigChange}
            saving={saving}
            error={errors["dashboard.theme"]}
          />
        </div>
      </div>
    </div>
  );
}

export default DisplayTab;
