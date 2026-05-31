import { useState, useEffect } from "react";
import { X } from "../../assets/icons";
import { useI18n } from "../../components/useI18n";
import { detectProviderFromUrl } from "./detect-provider";
import { PROVIDERS } from "../../constants";
import { inferEnvVar } from "../../lib/model-types";
import type { RegisterProviderInput } from "../../lib/model-types";

interface ProviderRegistrationModalProps {
  profile?: string;
  onClose: () => void;
  onSave: (input: RegisterProviderInput) => Promise<void>;
  /** Pre-fill with a known provider key (e.g. from discovery) */
  initialProviderKey?: string;
  initialBaseUrl?: string;
}

export default function ProviderRegistrationModal({
  profile = "default",
  onClose,
  onSave,
  initialProviderKey,
  initialBaseUrl,
}: ProviderRegistrationModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl || "");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [providerKey, setProviderKey] = useState(initialProviderKey || "");
  const [detectedKey, setDetectedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Auto-detect provider from baseUrl
  useEffect(() => {
    if (providerKey) return; // don't override manual selection
    const detected = detectProviderFromUrl(baseUrl);
    setDetectedKey(detected);

    if (detected) {
      setProviderKey(detected);
      // Find display name
      const provOpt = PROVIDERS.options.find((p) => p.value === detected);
      if (provOpt && !name) {
        setName(t(provOpt.label));
      }
    }
  }, [baseUrl, providerKey, name, t]);

  // Reset errors
  useEffect(() => {
    setError("");
  }, [baseUrl, providerKey]);

  const envVarName = inferEnvVar(providerKey, baseUrl);

  function handleBaseUrlChange(value: string) {
    setBaseUrl(value);
    // Clear provider key if URL changes to allow re-detection
    if (detectedKey && !detectProviderFromUrl(value)) {
      setDetectedKey(null);
    }
    if (!detectProviderFromUrl(value)) {
      setProviderKey("");
      setName("");
    }
  }

  async function handleSave() {
    const trimmedName = name.trim();
    const trimmedUrl = baseUrl.trim();

    if (!trimmedName) {
      setError(t("models.nameRequired"));
      return;
    }
    if (!trimmedUrl) {
      setError(t("models.nameRequired")); // reusing error message for simplicity
      return;
    }

    // Validate baseUrl format
    if (!/^https?:\/\/.+/.test(trimmedUrl)) {
      setError("请输入有效的 URL（以 http:// 或 https:// 开头）");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onSave({
        name: trimmedName,
        baseUrl: trimmedUrl,
        providerKey: providerKey || "custom",
        apiKeyEnvVar: envVarName,
        apiKey: apiKey.trim(),
      });
    } catch (err: any) {
      setError(err?.message || String(err));
      setSaving(false);
    }
  }

  return (
    <div className="models-modal-overlay" onClick={onClose}>
      <div className="models-modal" onClick={(e) => e.stopPropagation()}>
        <div className="models-modal-header">
          <h2 className="models-modal-title">
            {t("models.providerRegistration")}
          </h2>
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            aria-label={t("common.close")}
            title={t("common.close")}
          >
            <X size={18} />
          </button>
        </div>

        <div className="models-modal-body">
          {/* Provider Name */}
          <div className="models-modal-field">
            <label className="models-modal-label">
              {t("models.providerName")}
            </label>
            <input
              className="input"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setProviderKey("");
              }}
              placeholder="例如：My OpenRouter Instance"
              autoFocus
            />
          </div>

          {/* Base URL */}
          <div className="models-modal-field">
            <label className="models-modal-label">
              {t("models.providerBaseUrl")}
            </label>
            <input
              className="input"
              type="text"
              value={baseUrl}
              onChange={(e) => handleBaseUrlChange(e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
            {detectedKey && (
              <div className="models-modal-hint" style={{ color: "var(--success)" }}>
                {t("models.providerAutoDetect")}: {t(PROVIDERS.labels[detectedKey] || detectedKey)}
              </div>
            )}
            {!detectedKey && baseUrl.trim() && (
              <div className="models-modal-hint">
                {t("models.customProviderHint")}
              </div>
            )}
          </div>

          {/* API Key */}
          <div className="models-modal-field">
            <label className="models-modal-label">
              {t("models.apiKeyLabel")} ({t("common.optional")})
            </label>
            <div className="setup-input-group">
              <input
                className="input"
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
              <button
                className="setup-toggle-visibility"
                onClick={() => setShowApiKey(!showApiKey)}
                type="button"
              >
                {showApiKey ? t("common.hide") : t("common.show")}
              </button>
            </div>
            <div className="models-modal-hint">
              保存为环境变量 {envVarName}
            </div>
          </div>

          {error && <div className="models-error">{error}</div>}
        </div>

        <div className="models-modal-footer">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            {t("models.cancel")}
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? t("common.loading") : t("models.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
