import type { SelectOption } from "../ConfigField";
import ConfigField from "../ConfigField";

interface WebTerminalTabProps {
  config: Record<string, string>;
  onConfigChange: (key: string, value: string) => void;
  saving: string | null;
  errors: Record<string, string>;
}

const WEB_BACKEND_OPTIONS: SelectOption[] = [
  { value: "tavily", label: "Tavily" },
  { value: "brave", label: "Brave" },
  { value: "google", label: "Google" },
  { value: "duckduckgo", label: "DuckDuckGo" },
];

const EXTRACT_BACKEND_OPTIONS: SelectOption[] = [
  { value: "firecrawl", label: "Firecrawl" },
  { value: "jina", label: "Jina" },
  { value: "tavily", label: "Tavily" },
];

function WebTerminalTab({
  config,
  onConfigChange,
  saving,
  errors,
}: WebTerminalTabProps): React.JSX.Element {
  return (
    <div className="config-tab-content">
      {/* Terminal */}
      <div className="config-section-card">
        <h3 className="config-section-title">Terminal</h3>
        <div className="config-section-grid">
          <ConfigField
            label="Working Directory"
            configKey="terminal.cwd"
            value={config["terminal.cwd"] || ""}
            type="text"
            placeholder="/Users/xmli/.hermes/datas"
            onChange={onConfigChange}
            saving={saving}
            error={errors["terminal.cwd"]}
          />
          <ConfigField
            label="Terminal Timeout (s)"
            configKey="terminal.timeout"
            value={config["terminal.timeout"] || "600"}
            type="number"
            min={30}
            max={3600}
            helperText="seconds"
            onChange={onConfigChange}
            saving={saving}
            error={errors["terminal.timeout"]}
          />
        </div>
      </div>

      {/* Web Search */}
      <div className="config-section-card">
        <h3 className="config-section-title">Web Search</h3>
        <div className="config-section-grid">
          <ConfigField
            label="Search Backend"
            configKey="web.backend"
            value={config["web.backend"] || "tavily"}
            type="select"
            options={WEB_BACKEND_OPTIONS}
            onChange={onConfigChange}
            saving={saving}
            error={errors["web.backend"]}
          />
          <ConfigField
            label="Extract Backend"
            configKey="web.extract_backend"
            value={config["web.extract_backend"] || "firecrawl"}
            type="select"
            options={EXTRACT_BACKEND_OPTIONS}
            onChange={onConfigChange}
            saving={saving}
            error={errors["web.extract_backend"]}
          />
        </div>
      </div>

      {/* Browser */}
      <div className="config-section-card">
        <h3 className="config-section-title">Browser</h3>
        <div className="config-section-grid">
          <ConfigField
            label="Command Timeout (s)"
            configKey="browser.command_timeout"
            value={config["browser.command_timeout"] || "120"}
            type="number"
            min={30}
            max={600}
            helperText="seconds"
            onChange={onConfigChange}
            saving={saving}
            error={errors["browser.command_timeout"]}
          />
        </div>
      </div>
    </div>
  );
}

export default WebTerminalTab;
