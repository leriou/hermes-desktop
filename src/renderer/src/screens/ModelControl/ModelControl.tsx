import { getModelConfig, setModelConfig, getRoutingConfig, setRoutingConfig, getCredentialPool } from "@renderer/lib/hermes-tauri";
import { useState, useEffect, useCallback } from "react";
import { useI18n } from "../../components/useI18n";

type MCTab = "runtime" | "providers" | "fallback" | "credentials" | "yaml";
interface MCProps { profile?: string }

export default function ModelControl({ profile }: MCProps): React.JSX.Element {
  const { t } = useI18n();
  const [tab, setTab] = useState<MCTab>("runtime");
  return (
    <div className="mc-container">
      <div className="mc-tabs">
        {(["runtime", "providers", "fallback", "credentials", "yaml"] as MCTab[]).map((tb) => (
          <button key={tb} className={`mc-tab${tab === tb ? " active" : ""}`} onClick={() => setTab(tb)}>{t(`navigation.mc.tabs.${tb}`) || tb}</button>
        ))}
      </div>
      <div className="mc-content">
        {tab === "runtime" && <RuntimeTab profile={profile} />}
        {tab === "providers" && <ProvidersSubTab />}
        {tab === "fallback" && <FallbackTab profile={profile} />}
        {tab === "credentials" && <CredentialsTab profile={profile} />}
        {tab === "yaml" && <YamlSubTab />}
      </div>
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
    <div className="mc-form">
      <label className="mc-field"><span>Provider</span><input className="input" value={provider} onChange={(e) => setProvider(e.target.value)} /></label>
      <label className="mc-field"><span>Model</span><input className="input" value={model} onChange={(e) => setModel(e.target.value)} /></label>
      <label className="mc-field"><span>Base URL</span><input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} /></label>
      <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
      {msg && <div className={`mc-msg${msg.startsWith("Error") ? " error" : ""}`}>{msg}</div>}
    </div>
  );
}

function ProvidersSubTab() { return <div className="mc-placeholder">Providers management — navigate to Providers tab for full management.</div>; }
function YamlSubTab() { return <div className="mc-placeholder">Raw YAML editing — navigate to Config tab for full YAML editor.</div>; }

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
    <div className="mc-form">
      <label className="mc-field"><span>Default Provider</span><input className="input" value={defaultProvider} onChange={(e) => setDefaultProvider(e.target.value)} /></label>
      <label className="mc-field"><span>Default Base URL</span><input className="input" value={defaultBaseUrl} onChange={(e) => setDefaultBaseUrl(e.target.value)} /></label>
      <label className="mc-field"><span>Fallback Providers (comma-separated)</span><input className="input" value={fallbacks} onChange={(e) => setFallbacks(e.target.value)} /></label>
      <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
      {msg && <div className={`mc-msg${msg.startsWith("Error") ? " error" : ""}`}>{msg}</div>}
    </div>
  );
}

function CredentialsTab({ profile }: { profile?: string }) {
  const [pool, setPool] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { getCredentialPool(profile).then((p) => { setPool(p); setLoading(false); }).catch(() => { setLoading(false); }); }, [profile]);
  if (loading) return <div className="mc-placeholder">Loading…</div>;
  if (!pool) return <div className="mc-placeholder">No credential pool available.</div>;
  return <div className="mc-form"><pre className="mc-yaml-preview">{JSON.stringify(pool, null, 2)}</pre></div>;
}
