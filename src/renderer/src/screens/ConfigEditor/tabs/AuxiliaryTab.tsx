import type { SelectOption } from "../ConfigField";
import ConfigField from "../ConfigField";

interface AuxiliaryTabProps {
  config: Record<string, string>;
  onConfigChange: (key: string, value: string) => void;
  saving: string | null;
  errors: Record<string, string>;
}

const STT_MODEL_OPTIONS: SelectOption[] = [
  { value: "tiny", label: "Tiny" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

function AuxiliaryTab({
  config,
  onConfigChange,
  saving,
  errors,
}: AuxiliaryTabProps): React.JSX.Element {
  return (
    <div className="config-tab-content">
      {/* Vision */}
      <div className="config-section-card">
        <h3 className="config-section-title">Vision</h3>
        <div className="config-section-grid">
          <ConfigField
            label="Provider"
            configKey="auxiliary.vision.provider"
            value={config["auxiliary.vision.provider"] || "gemini"}
            type="text"
            onChange={onConfigChange}
            saving={saving}
            error={errors["auxiliary.vision.provider"]}
          />
          <ConfigField
            label="Model"
            configKey="auxiliary.vision.model"
            value={config["auxiliary.vision.model"] || "gemini-3-flash-preview"}
            type="text"
            onChange={onConfigChange}
            saving={saving}
            error={errors["auxiliary.vision.model"]}
          />
        </div>
      </div>

      {/* Web Extract */}
      <div className="config-section-card">
        <h3 className="config-section-title">Web Extract</h3>
        <div className="config-section-grid">
          <ConfigField
            label="Provider"
            configKey="auxiliary.web_extract.provider"
            value={config["auxiliary.web_extract.provider"] || "gemini"}
            type="text"
            onChange={onConfigChange}
            saving={saving}
            error={errors["auxiliary.web_extract.provider"]}
          />
          <ConfigField
            label="Model"
            configKey="auxiliary.web_extract.model"
            value={
              config["auxiliary.web_extract.model"] ||
              "gemini-3.1-flash-lite-preview"
            }
            type="text"
            onChange={onConfigChange}
            saving={saving}
            error={errors["auxiliary.web_extract.model"]}
          />
        </div>
      </div>

      {/* Compression */}
      <div className="config-section-card">
        <h3 className="config-section-title">Compression</h3>
        <div className="config-section-grid">
          <ConfigField
            label="Provider"
            configKey="auxiliary.compression.provider"
            value={config["auxiliary.compression.provider"] || "gemini"}
            type="text"
            onChange={onConfigChange}
            saving={saving}
            error={errors["auxiliary.compression.provider"]}
          />
          <ConfigField
            label="Model"
            configKey="auxiliary.compression.model"
            value={
              config["auxiliary.compression.model"] ||
              "gemini-3.1-flash-lite-preview"
            }
            type="text"
            onChange={onConfigChange}
            saving={saving}
            error={errors["auxiliary.compression.model"]}
          />
          <ConfigField
            label="Timeout"
            configKey="auxiliary.compression.timeout"
            value={config["auxiliary.compression.timeout"] || "240"}
            type="number"
            min={1}
            onChange={onConfigChange}
            saving={saving}
            error={errors["auxiliary.compression.timeout"]}
          />
          <ConfigField
            label="Context Length"
            configKey="auxiliary.compression.context_length"
            value={config["auxiliary.compression.context_length"] || "1000000"}
            type="number"
            min={1}
            onChange={onConfigChange}
            saving={saving}
            error={errors["auxiliary.compression.context_length"]}
          />
        </div>
      </div>

      {/* TTS / STT */}
      <div className="config-section-card">
        <h3 className="config-section-title">TTS / STT</h3>
        <div className="config-section-grid">
          <ConfigField
            label="TTS Provider"
            configKey="tts.provider"
            value={config["tts.provider"] || "custom"}
            type="text"
            onChange={onConfigChange}
            saving={saving}
            error={errors["tts.provider"]}
          />
          <ConfigField
            label="TTS Voice"
            configKey="tts.edge.voice"
            value={config["tts.edge.voice"] || "zh-CN-XiaoxiaoNeural"}
            type="text"
            onChange={onConfigChange}
            saving={saving}
            error={errors["tts.edge.voice"]}
          />
          <ConfigField
            label="STT Provider"
            configKey="stt.provider"
            value={config["stt.provider"] || "custom"}
            type="text"
            onChange={onConfigChange}
            saving={saving}
            error={errors["stt.provider"]}
          />
          <ConfigField
            label="STT Model"
            configKey="stt.local.model"
            value={config["stt.local.model"] || "medium"}
            type="select"
            options={STT_MODEL_OPTIONS}
            onChange={onConfigChange}
            saving={saving}
            error={errors["stt.local.model"]}
          />
        </div>
      </div>

      {/* Context & Memory */}
      <div className="config-section-card">
        <h3 className="config-section-title">Context & Memory</h3>
        <div className="config-section-grid">
          <ConfigField
            label="Context Engine"
            configKey="context.engine"
            value={config["context.engine"] || "hce"}
            type="text"
            onChange={onConfigChange}
            saving={saving}
            error={errors["context.engine"]}
          />
          <ConfigField
            label="Memory Char Limit"
            configKey="memory.memory_char_limit"
            value={config["memory.memory_char_limit"] || "10000"}
            type="number"
            min={1}
            onChange={onConfigChange}
            saving={saving}
            error={errors["memory.memory_char_limit"]}
          />
          <ConfigField
            label="User Char Limit"
            configKey="memory.user_char_limit"
            value={config["memory.user_char_limit"] || "3900"}
            type="number"
            min={1}
            onChange={onConfigChange}
            saving={saving}
            error={errors["memory.user_char_limit"]}
          />
          <ConfigField
            label="Memory Provider"
            configKey="memory.provider"
            value={config["memory.provider"] || "hermes-tide-memory"}
            type="text"
            onChange={onConfigChange}
            saving={saving}
            error={errors["memory.provider"]}
          />
          <ConfigField
            label="Flush Min Turns"
            configKey="memory.flush_min_turns"
            value={config["memory.flush_min_turns"] || "8"}
            type="number"
            min={1}
            onChange={onConfigChange}
            saving={saving}
            error={errors["memory.flush_min_turns"]}
          />
        </div>
      </div>
    </div>
  );
}

export default AuxiliaryTab;
