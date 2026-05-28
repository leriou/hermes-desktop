import { getModelConfig, setModelConfig, getRoutingConfig, setRoutingConfig, getCredentialPool, setCredentialPool } from "@renderer/lib/hermes-tauri";
import { useState, useEffect, useCallback } from "react";
import { useI18n } from "../../components/useI18n";
import { PROVIDERS } from "../../constants";
import BrandLogo from "../../components/common/BrandLogo";

type MCTab = "runtime" | "fallback" | "credentials";
interface MCProps { profile?: string; activeTab?: string }

export default function ModelControl({ profile, activeTab }: MCProps): React.JSX.Element {
  const tab = (activeTab as MCTab) || "runtime";

  return (
    <div className="mc-content">
      {tab === "runtime" && <RuntimeTab profile={profile} />}
      {tab === "fallback" && <FallbackTab profile={profile} />}
      {tab === "credentials" && <CredentialsTab profile={profile} />}
    </div>
  );
}

function RuntimeTab({ profile }: { profile?: string }) {
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    getModelConfig(profile).then((cfg) => { setProvider(cfg.provider || ""); setModel(cfg.model || ""); setBaseUrl(cfg.baseUrl || ""); }).catch(() => {});
  }, [profile]);
  const save = useCallback(async () => {
    setSaving(true); setMsg(null);
    try { await setModelConfig(provider, model, baseUrl, profile); setMsg("Saved"); }
    catch (e: any) { setMsg(`Error: ${e.message || e}`); }
    finally { setSaving(false); }
  }, [provider, model, baseUrl, profile]);
  return (
    <div className="mc-form-wrapper" style={{ display: "flex", justifyContent: "center", padding: "40px 20px" }}>
      <div className="mc-form" style={{ width: "100%", maxWidth: 600, background: "var(--surface-card)", padding: 32, borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-card-soft)", border: "1px solid var(--border-soft)" }}>
        <h3 style={{ marginTop: 0, marginBottom: 24, fontSize: 18, color: "var(--text-primary)" }}>Active Runtime</h3>
        <label className="mc-field"><span>Provider</span><input className="input" value={provider} onChange={(e) => setProvider(e.target.value)} /></label>
        <label className="mc-field"><span>Model</span><input className="input" value={model} onChange={(e) => setModel(e.target.value)} /></label>
        <label className="mc-field"><span>Base URL</span><input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} /></label>
        <button className="btn btn-primary" disabled={saving} onClick={save} style={{ marginTop: 16 }}>{saving ? "Saving…" : "Save"}</button>
        {msg && <div className={`mc-msg${msg.startsWith("Error") ? " error" : ""}`}>{msg}</div>}
      </div>
    </div>
  );
}

function FallbackTab({ profile }: { profile?: string }) {
  const [defaultProvider, setDefaultProvider] = useState("");
  const [defaultBaseUrl, setDefaultBaseUrl] = useState("");
  const [fallbacks, setFallbacks] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    getRoutingConfig(profile).then((cfg) => {
      setDefaultProvider(cfg.provider || "");
      setDefaultBaseUrl(cfg.baseUrl || "");
      setFallbacks(Array.isArray(cfg.fallbackProviders) ? cfg.fallbackProviders.map((fp: any) => fp.model || fp.provider || "").join(", ") : "");
    }).catch(() => {});
  }, [profile]);
  const save = useCallback(async () => {
    setSaving(true); setMsg(null);
    try {
      await setRoutingConfig({ defaultProvider, defaultBaseUrl, fallbacks: fallbacks.split(",").map((s) => ({ model: s.trim(), provider: "auto" })).filter((fb) => fb.model) }, profile);
      setMsg("Saved");
    } catch (e: any) { setMsg(`Error: ${e.message || e}`); }
    finally { setSaving(false); }
  }, [defaultProvider, defaultBaseUrl, fallbacks, profile]);
  return (
    <div className="mc-form-wrapper" style={{ display: "flex", justifyContent: "center", padding: "40px 20px" }}>
      <div className="mc-form" style={{ width: "100%", maxWidth: 600, background: "var(--surface-card)", padding: 32, borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-card-soft)", border: "1px solid var(--border-soft)" }}>
        <h3 style={{ marginTop: 0, marginBottom: 24, fontSize: 18, color: "var(--text-primary)" }}>Routing & Fallback</h3>
        <label className="mc-field"><span>Default Provider</span><input className="input" value={defaultProvider} onChange={(e) => setDefaultProvider(e.target.value)} /></label>
        <label className="mc-field"><span>Default Base URL</span><input className="input" value={defaultBaseUrl} onChange={(e) => setDefaultBaseUrl(e.target.value)} /></label>
        <label className="mc-field"><span>Fallback Providers (comma-separated)</span><input className="input" value={fallbacks} onChange={(e) => setFallbacks(e.target.value)} /></label>
        <button className="btn btn-primary" disabled={saving} onClick={save} style={{ marginTop: 16 }}>{saving ? "Saving…" : "Save"}</button>
        {msg && <div className={`mc-msg${msg.startsWith("Error") ? " error" : ""}`}>{msg}</div>}
      </div>
    </div>
  );
}

function CredentialsTab({ profile }: { profile?: string }) {
  const { t } = useI18n();
  const [credPool, setCredPool] = useState<Record<string, Array<{ key: string; label: string }>>>({});
  const [loading, setLoading] = useState(true);
  const [poolProvider, setPoolProvider] = useState("");
  const [poolNewKey, setPoolNewKey] = useState("");
  const [poolNewLabel, setPoolNewLabel] = useState("");

  useEffect(() => { 
    getCredentialPool(profile)
      .then((p) => { setCredPool(p); setLoading(false); })
      .catch(() => { setLoading(false); }); 
  }, [profile]);

  async function handleAddPoolKey(): Promise<void> {
    if (!poolProvider || !poolNewKey.trim()) return;
    const existing = credPool[poolProvider] || [];
    const entries = [
      ...existing,
      {
        key: poolNewKey.trim(),
        label: poolNewLabel.trim() || `Key ${existing.length + 1}`,
      },
    ];
    await setCredentialPool(poolProvider, entries, profile);
    setCredPool((prev) => ({ ...prev, [poolProvider]: entries }));
    setPoolNewKey("");
    setPoolNewLabel("");
  }

  async function handleRemovePoolKey(
    provider: string,
    index: number,
  ): Promise<void> {
    const entries = [...(credPool[provider] || [])];
    entries.splice(index, 1);
    await setCredentialPool(provider, entries, profile);
    setCredPool((prev) => ({ ...prev, [provider]: entries }));
  }

  if (loading) return <div className="mc-placeholder">Loading…</div>;

  return (
    <div className="mc-form-wrapper" style={{ display: "flex", justifyContent: "center", padding: "40px 20px" }}>
      <div className="mc-form" style={{ width: "100%", maxWidth: 600, background: "var(--surface-card)", padding: 32, borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-card-soft)", border: "1px solid var(--border-soft)" }}>
        <h3 style={{ marginTop: 0, marginBottom: 24, fontSize: 18, color: "var(--text-primary)" }}>{t("settings.sections.credentialPool", { defaultValue: "Credential Pool" })}</h3>
        
        <div className="settings-field-hint" style={{ marginBottom: 16 }}>
          {t("settings.poolHint", { defaultValue: "Add multiple API keys for a provider. Hermes will automatically rotate them if rate-limited." })}
        </div>
        
        <div className="settings-pool-add" style={{ display: "flex", gap: 8, marginBottom: 24, alignItems: "center" }}>
          <select
            className="input"
            value={poolProvider}
            onChange={(e) => setPoolProvider(e.target.value)}
            style={{ width: 140 }}
          >
            <option value="">{t("common.provider", { defaultValue: "Provider" })}</option>
            {PROVIDERS.options
              .filter((p) => p.value !== "auto")
              .map((p) => (
                <option key={p.value} value={p.value}>
                  {t(p.label)}
                </option>
              ))}
          </select>
          <input
            className="input"
            type="password"
            placeholder={t("settings.apiKeyPlaceholder", { defaultValue: "API Key" })}
            value={poolNewKey}
            onChange={(e) => setPoolNewKey(e.target.value)}
            style={{ flex: 1 }}
          />
          <input
            className="input"
            type="text"
            placeholder={t("settings.keyLabelPlaceholder", { defaultValue: "Label (optional)" })}
            value={poolNewLabel}
            onChange={(e) => setPoolNewLabel(e.target.value)}
            style={{ width: 120 }}
            onKeyDown={(e) => e.key === "Enter" && handleAddPoolKey()}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={handleAddPoolKey}
            disabled={!poolProvider || !poolNewKey.trim()}
          >
            {t("settings.add", { defaultValue: "Add" })}
          </button>
        </div>

        {Object.keys(credPool).length === 0 ? (
          <div className="settings-field-hint">{t("settings.empty", { defaultValue: "Empty" })}</div>
        ) : (
          Object.entries(credPool).map(
            ([provider, entries]) =>
              entries.length > 0 && (
                <div key={provider} className="settings-pool-group" style={{ marginBottom: 16 }}>
                  <div className="settings-pool-provider" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontWeight: 600, fontSize: 13, textTransform: "uppercase", color: "var(--text-muted)" }}>
                    <BrandLogo provider={provider} size={16} />
                    {PROVIDERS.options.find((p) => p.value === provider)
                      ? t(
                          PROVIDERS.options.find((p) => p.value === provider)!
                            .label,
                        )
                      : provider}
                  </div>
                  {entries.map((entry, idx) => (
                    <div key={idx} className="settings-pool-entry" style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
                      <span className="settings-pool-label" style={{ fontWeight: 500, minWidth: 80 }}>
                        {entry.label ||
                          `${t("settings.keyLabel", { defaultValue: "Key" })} ${idx + 1}`}
                      </span>
                      <span className="settings-pool-key" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontSize: 12, flex: 1 }}>
                        {entry.key
                          ? `${entry.key.slice(0, 8)}...${entry.key.slice(-4)}`
                          : t("settings.empty", { defaultValue: "Empty" })}
                      </span>
                      <button
                        className="btn-ghost btn-sm"
                        style={{ color: "var(--error)" }}
                        onClick={() => handleRemovePoolKey(provider, idx)}
                      >
                        {t("settings.remove", { defaultValue: "Remove" })}
                      </button>
                    </div>
                  ))}
                </div>
              ),
          )
        )}
      </div>
    </div>
  );
}
