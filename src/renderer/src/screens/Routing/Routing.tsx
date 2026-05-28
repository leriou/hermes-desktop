import { getRoutingConfig, setRoutingConfig } from "@renderer/lib/hermes-tauri";
import { useState, useEffect, useCallback } from "react";
import { Plus, Trash } from "../../assets/icons";
import { PROVIDERS } from "../../constants";
import { useI18n } from "../../components/useI18n";

interface RoutingProps {
  profile?: string;
}

function Routing({ profile }: RoutingProps): React.JSX.Element {
  const { t } = useI18n();
  const [defaultModel, setDefaultModel] = useState("");
  const [defaultProvider, setDefaultProvider] = useState("");
  const [defaultBaseUrl, setDefaultBaseUrl] = useState("");
  const [fallbacks, setFallbacks] = useState<
    Array<{ model: string; provider: string }>
  >([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newFbModel, setNewFbModel] = useState("");
  const [newFbProvider, setNewFbProvider] = useState("");

  const load = useCallback(async (): Promise<void> => {
    try {
      const cfg = await getRoutingConfig(profile);
      setDefaultModel(cfg.defaultModel || "");
      setDefaultProvider(cfg.provider || "");
      setDefaultBaseUrl(cfg.baseUrl || "");
      setFallbacks((cfg.fallbackProviders || []) as any);
      setError("");
    } catch {
      setError("Failed to load routing config");
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError("");
    try {
      await setRoutingConfig(
        {
          defaultModel: defaultModel.trim(),
          defaultProvider: defaultProvider.trim(),
          defaultBaseUrl: defaultBaseUrl.trim(),
          fallbacks,
        },
        profile,
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message || String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleAddFallback(): void {
    if (!newFbModel.trim()) return;
    setFallbacks((prev) => [
      ...prev,
      { model: newFbModel.trim(), provider: newFbProvider.trim() },
    ]);
    setNewFbModel("");
    setNewFbProvider("");
  }

  function handleRemoveFallback(idx: number): void {
    setFallbacks((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <div className="settings-section">
        <div className="settings-section-title">
          {t("providers.routing.defaults", { defaultValue: "Default Model" })}
        </div>

        <div className="settings-field">
          <label className="settings-field-label">Default Model</label>
          <input
            className="input"
            type="text"
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            placeholder="e.g. gpt-4o"
          />
        </div>

        <div className="settings-field">
          <label className="settings-field-label">Default Provider</label>
          <select
            className="input settings-select"
            value={defaultProvider}
            onChange={(e) => setDefaultProvider(e.target.value)}
          >
            <option value="">auto</option>
            {PROVIDERS.options
              .filter((p) => p.value !== "auto")
              .map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.label)}
                </option>
              ))}
          </select>
        </div>

        <div className="settings-field">
          <label className="settings-field-label">Base URL</label>
          <input
            className="input"
            type="text"
            value={defaultBaseUrl}
            onChange={(e) => setDefaultBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
          />
          <div className="settings-field-hint">
            Leave empty for provider default
          </div>
        </div>

        {error && (
          <div
            className="settings-field-hint"
            style={{ color: "var(--danger)" }}
          >
            {error}
          </div>
        )}
      </div>

      <div className="settings-section" style={{ marginTop: 20 }}>
        <div className="settings-section-title">
          {t("providers.routing.fallbacks", {
            defaultValue: "Fallback Providers",
          })}
        </div>
        <div className="settings-field-hint" style={{ marginBottom: 10 }}>
          {t("providers.routing.fallbacksHint", {
            defaultValue:
              "When the default provider fails, requests will be routed to these fallbacks in order.",
          })}
        </div>

        {fallbacks.length > 0 && (
          <table className="routing-fallback-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th>Model</th>
                <th>Provider</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {fallbacks.map((fb, i) => (
                <tr key={i}>
                  <td className="routing-fallback-idx">{i + 1}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                    {fb.model}
                  </td>
                  <td style={{ fontSize: 12 }}>{fb.provider || "auto"}</td>
                  <td>
                    <button
                      className="btn-ghost routing-fallback-remove"
                      onClick={() => handleRemoveFallback(i)}
                    >
                      <Trash size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="routing-fallback-add">
          <input
            className="input"
            type="text"
            value={newFbModel}
            onChange={(e) => setNewFbModel(e.target.value)}
            placeholder="Fallback model"
            onKeyDown={(e) => e.key === "Enter" && handleAddFallback()}
          />
          <select
            className="input settings-select"
            value={newFbProvider}
            onChange={(e) => setNewFbProvider(e.target.value)}
          >
            <option value="">auto</option>
            {PROVIDERS.options
              .filter((p) => p.value !== "auto")
              .map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.label)}
                </option>
              ))}
          </select>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleAddFallback}
            disabled={!newFbModel.trim()}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : t("common.save", { defaultValue: "Save" })}
        </button>
        {saved && (
          <span className="settings-saved">
            {t("common.saved", { defaultValue: "Saved" })}
          </span>
        )}
      </div>
    </div>
  );
}

export default Routing;
