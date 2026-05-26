import { getPlugins, setPluginEnabled } from "@renderer/lib/hermes-tauri";
import { useState, useEffect, useCallback } from "react";
import { Refresh } from "../../assets/icons";
import { useI18n } from "../../components/useI18n";
import { cache } from "../../utils/prefetchCache";

interface PluginInfo {
  name: string;
  description: string;
  enabled: boolean;
  version?: string;
  source?: string;
}

interface PluginsProps {
  profile?: string;
}

function Plugins({ profile }: PluginsProps): React.JSX.Element {
  const { t } = useI18n();
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPlugins = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    const list = await cache.getOrFetch(
      `plugins:${profile ?? "default"}`,
      20_000,
      async () => (await getPlugins(profile)) ?? [],
    );
    list.sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    setPlugins(list);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  async function handleToggle(
    name: string,
    currentEnabled: boolean,
  ): Promise<void> {
    setError("");
    setPlugins((prev) =>
      prev.map((p) =>
        p.name === name ? { ...p, enabled: !currentEnabled } : p,
      ),
    );
    const result = await setPluginEnabled(name, !currentEnabled, profile);
    if (!result.success) {
      cache.invalidate(`plugins:${profile ?? "default"}`);
      setPlugins((prev) =>
        prev.map((p) =>
          p.name === name ? { ...p, enabled: currentEnabled } : p,
        ),
      );
      setError(result.error || "Failed to toggle plugin");
    }
  }

  if (loading) {
    return (
      <div className="plugins-container">
        <div className="plugins-loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="plugins-container">
      <div className="plugins-header">
        <div>
          <h2 className="plugins-title">{t("plugins.title")}</h2>
          <p className="plugins-subtitle">{t("plugins.subtitle")}</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadPlugins}>
          <Refresh size={14} />
        </button>
      </div>

      {error && <div className="plugins-error">{error}</div>}

      {plugins.length === 0 ? (
        <div className="plugins-empty">
          <p className="plugins-empty-text">{t("plugins.noPlugins")}</p>
          <p className="plugins-empty-hint">{t("plugins.noPluginsHint")}</p>
        </div>
      ) : (
        <div className="plugins-grid">
          {plugins.map((p) => (
            <div
              key={p.name}
              className={`plugins-card ${p.enabled ? "plugins-card-enabled" : "plugins-card-disabled"}`}
            >
              <div className="plugins-card-row">
                <div className="plugins-card-info">
                  <span className="plugins-card-name">{p.name}</span>
                  {p.version && (
                    <span className="plugins-card-version">v{p.version}</span>
                  )}
                </div>
                <label
                  className="plugins-toggle"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    onChange={() => handleToggle(p.name, p.enabled)}
                  />
                  <span className="plugins-toggle-track" />
                </label>
              </div>
              {p.description && (
                <div className="plugins-card-description">{p.description}</div>
              )}
              <div className="plugins-card-status">
                <div className="plugins-status-left">
                  <span
                    className={`plugins-status-dot ${p.enabled ? "plugins-status-on" : "plugins-status-off"}`}
                  />
                  {p.enabled ? t("plugins.enabled") : t("plugins.disabled")}
                </div>
                {p.source && (
                  <span className="plugins-card-source">{p.source}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Plugins;
