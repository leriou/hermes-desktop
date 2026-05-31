import { useState, useEffect, useCallback } from "react";
import { PROVIDERS } from "../../constants";
import { useI18n } from "../../components/useI18n";
import { getRoutingConfig, setConfig } from "@renderer/lib/hermes-tauri";

export default function RoutingTab({ profile }: { profile?: string }): React.JSX.Element {
  const { t } = useI18n();
  const [defaultModel, setDefaultModel] = useState("");
  const [defaultProvider, setDefaultProvider] = useState("");
  const [defaultBaseUrl, setDefaultBaseUrl] = useState("");
  const [fallbacks, setFallbacks] = useState<Array<{ model: string; provider: string }>>([]);
  const [maxTokens, setMaxTokens] = useState("");
  const [loaded, setLoaded] = useState(false);

  const loadConfig = useCallback(async () => {
    const routing = await getRoutingConfig(profile);
    setDefaultModel(routing.defaultModel || "");
    setDefaultProvider(routing.provider || "");
    setDefaultBaseUrl(routing.baseUrl || "");
    setMaxTokens(routing.maxTokens ? String(routing.maxTokens) : "");
    setFallbacks(routing.fallbackProviders || []);
    setLoaded(true);
  }, [profile]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  if (!loaded) return <div className="settings-field-hint">Loading…</div>;

  return (
    <div className="settings-section">
      <div className="settings-section-title">{t("providers.routing.defaultModel")}</div>

      <div className="settings-field">
        <label className="settings-field-label">{t("providers.routing.provider")}</label>
        <select
          className="input settings-select"
          value={defaultProvider}
          onChange={(e) => {
            setDefaultProvider(e.target.value);
            setConfig("model.provider", e.target.value, profile);
          }}
        >
          <option value="">—</option>
          {PROVIDERS.options.filter((p) => p.value !== "auto").map((opt) => (
            <option key={opt.value} value={opt.value}>{t(opt.label)}</option>
          ))}
        </select>
      </div>

      <div className="settings-field">
        <label className="settings-field-label">{t("providers.routing.defaultModel")}</label>
        <input
          className="input"
          type="text"
          value={defaultModel}
          onChange={(e) => setDefaultModel(e.target.value)}
          onBlur={() => setConfig("model.default", defaultModel, profile)}
          placeholder="e.g. glm-5.1, gpt-5.5, claude-sonnet-4-6"
        />
      </div>

      <div className="settings-field">
        <label className="settings-field-label">{t("providers.routing.baseUrl")}</label>
        <input
          className="input"
          type="text"
          value={defaultBaseUrl}
          onChange={(e) => setDefaultBaseUrl(e.target.value)}
          onBlur={() => setConfig("model.base_url", defaultBaseUrl, profile)}
          placeholder={t("settings.modelBaseUrlPlaceholder")}
        />
        <div className="settings-field-hint">{t("providers.routing.baseUrlHint")}</div>
      </div>

      <div className="settings-field">
        <label className="settings-field-label">{t("providers.routing.maxTokens")}</label>
        <input
          className="input"
          type="number"
          value={maxTokens}
          onChange={(e) => setMaxTokens(e.target.value)}
          onBlur={() => setConfig("model.max_tokens", maxTokens, profile)}
          placeholder="65536"
        />
      </div>

      <div className="settings-section-title" style={{ marginTop: 20 }}>
        {t("providers.routing.fallbackProviders")}
      </div>
      <div className="settings-field-hint" style={{ marginBottom: 10 }}>
        {t("providers.routing.fallbackHint")}
      </div>

      {fallbacks.map((fb, idx) => (
        <div key={idx} className="settings-field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            className="input"
            type="text"
            value={fb.model}
            onChange={(e) => {
              const next = [...fallbacks];
              next[idx] = { ...next[idx], model: e.target.value };
              setFallbacks(next);
            }}
            onBlur={() => setConfig("fallback_providers", JSON.stringify(fallbacks), profile)}
            placeholder="model name"
            style={{ flex: 1 }}
          />
          <select
            className="input settings-select"
            value={fb.provider}
            onChange={(e) => {
              const next = [...fallbacks];
              next[idx] = { ...next[idx], provider: e.target.value };
              setFallbacks(next);
            }}
            onBlur={() => setConfig("fallback_providers", JSON.stringify(fallbacks), profile)}
            style={{ width: 160 }}
          >
            <option value="">—</option>
            {PROVIDERS.options.filter((p) => p.value !== "auto").map((opt) => (
              <option key={opt.value} value={opt.value}>{t(opt.label)}</option>
            ))}
          </select>
          <button
            className="btn-ghost"
            style={{ color: "var(--error)", fontSize: 12 }}
            onClick={() => {
              const next = fallbacks.filter((_, i) => i !== idx);
              setFallbacks(next);
              setConfig("fallback_providers", JSON.stringify(next), profile);
            }}
          >
            {t("settings.remove")}
          </button>
        </div>
      ))}

      <button
        className="btn btn-secondary btn-sm"
        style={{ marginTop: 8 }}
        onClick={() => setFallbacks([...fallbacks, { model: "", provider: "" }])}
      >
        + {t("providers.routing.addFallback")}
      </button>
    </div>
  );
}
