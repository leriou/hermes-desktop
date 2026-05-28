import {
  gatewayStatus,
  getEnv,
  getPlatformEnabled,
  setEnv as setTauriEnv,
  setPlatformEnabled as setTauriPlatformEnabled,
  startGateway,
  stopGateway,
} from "@renderer/lib/hermes-tauri";
import { useState, useEffect, useCallback, useRef } from "react";
import { GATEWAY_SECTIONS, GATEWAY_PLATFORMS } from "../../constants";
import { useI18n } from "../../components/useI18n";
import BrandLogo from "../../components/common/BrandLogo";

function Gateway({ profile }: { profile?: string }): React.JSX.Element {
  const { t } = useI18n();
  const [gatewayRunning, setGatewayRunning] = useState(false);
  const [env, setEnv] = useState<Record<string, string>>({});
  const [platformEnabled, setPlatformEnabled] = useState<
    Record<string, boolean>
  >({});
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const gatewayStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const platformStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const loadConfig = useCallback(async (): Promise<void> => {
    const envData = await getEnv(profile);
    setEnv(envData);
    const gwStatus = await gatewayStatus();
    setGatewayRunning(gwStatus);
    const platforms = await getPlatformEnabled(profile);
    setPlatformEnabled(platforms);
  }, [profile]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Poll gateway status (10s interval to reduce IPC overhead)
  useEffect(() => {
    const interval = setInterval(async () => {
      const status = await gatewayStatus();
      setGatewayRunning(status);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  async function toggleGateway(): Promise<void> {
    if (gatewayStatusTimeoutRef.current) {
      clearTimeout(gatewayStatusTimeoutRef.current);
      gatewayStatusTimeoutRef.current = null;
    }
    if (gatewayRunning) {
      await stopGateway();
      setGatewayRunning(false);
    } else {
      const started = await startGateway();
      setGatewayRunning(started);
      gatewayStatusTimeoutRef.current = setTimeout(async () => {
        const status = await gatewayStatus();
        setGatewayRunning(status);
        gatewayStatusTimeoutRef.current = null;
      }, 2000);
    }
  }

  async function togglePlatform(platform: string): Promise<void> {
    if (platformStatusTimeoutRef.current) {
      clearTimeout(platformStatusTimeoutRef.current);
      platformStatusTimeoutRef.current = null;
    }
    const newValue = !platformEnabled[platform];
    setPlatformEnabled((prev) => ({ ...prev, [platform]: newValue }));
    await setTauriPlatformEnabled(platform, newValue, profile);
    platformStatusTimeoutRef.current = setTimeout(async () => {
      const status = await gatewayStatus();
      setGatewayRunning(status);
      platformStatusTimeoutRef.current = null;
    }, 3000);
  }

  async function handleBlur(key: string): Promise<void> {
    const value = env[key] || "";
    await setTauriEnv(key, value, profile);
    setSavedKey(key);
    setTimeout(() => setSavedKey(null), 2000);
  }

  function handleChange(key: string, value: string): void {
    setEnv((prev) => ({ ...prev, [key]: value }));
  }

  function toggleVisibility(key: string): void {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Build a set of field keys that belong to platforms (for grouping)
  const platformFieldKeys = new Set(GATEWAY_PLATFORMS.flatMap((p) => p.fields));

  // Non-platform fields from GATEWAY_SECTIONS
  const otherSections = GATEWAY_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !platformFieldKeys.has(item.key)),
  })).filter((section) => section.items.length > 0);

  // Map env keys to their field definitions for rendering inside platform cards
  const fieldDefs = new Map(
    GATEWAY_SECTIONS.flatMap((s) => s.items).map((f) => [f.key, f]),
  );

  const isPlatformConfigured = (
    platform: (typeof GATEWAY_PLATFORMS)[0],
  ): boolean => {
    return platform.fields.some((fieldKey) => {
      const val = env[fieldKey];
      return val && val.trim() !== "";
    });
  };

  const configuredPlatforms = GATEWAY_PLATFORMS.filter(isPlatformConfigured);
  const unconfiguredPlatforms = GATEWAY_PLATFORMS.filter(
    (p) => !isPlatformConfigured(p),
  );

  const renderPlatformCard = (
    platform: (typeof GATEWAY_PLATFORMS)[0],
    isConfigured: boolean,
  ) => (
    <div
      key={platform.key}
      className={`settings-platform-card ${isConfigured ? "configured" : ""}`}
    >
      <div className="settings-platform-header">
        <div className="settings-platform-left">
          <BrandLogo provider={platform.key} size={28} />
          <div className="settings-platform-info">
            <span className="settings-platform-label">
              {t(platform.label)}
              {isConfigured && (
                <span className="settings-platform-badge">
                  {t("gateway.configuredBadge") || "已配置"}
                </span>
              )}
            </span>
            <span className="settings-platform-desc">
              {t(platform.description)}
            </span>
          </div>
        </div>
        <label className="tools-toggle">
          <input
            type="checkbox"
            checked={!!platformEnabled[platform.key]}
            onChange={() => togglePlatform(platform.key)}
          />
          <span className="tools-toggle-track" />
        </label>
      </div>
      {platformEnabled[platform.key] && (
        <div className="settings-platform-fields">
          {platform.fields.map((fieldKey) => {
            const field = fieldDefs.get(fieldKey);
            if (!field) return null;
            return (
              <div key={field.key} className="settings-field">
                <label className="settings-field-label">
                  {t(field.label)}
                  {savedKey === field.key && (
                    <span className="settings-saved">{t("common.saved")}</span>
                  )}
                </label>
                <div className="settings-input-row">
                  <input
                    className="input"
                    type={
                      field.type === "password" && !visibleKeys.has(field.key)
                        ? "password"
                        : "text"
                    }
                    value={env[field.key] || ""}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    onBlur={() => handleBlur(field.key)}
                    placeholder={t(field.label)}
                  />
                  {field.type === "password" && (
                    <button
                      className="btn-ghost settings-toggle-btn"
                      onClick={() => toggleVisibility(field.key)}
                    >
                      {visibleKeys.has(field.key)
                        ? t("common.hide")
                        : t("common.show")}
                    </button>
                  )}
                </div>
                <div className="settings-field-hint">{t(field.hint)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div className="settings-section">
        <div className="settings-section-title">
          {t("gateway.messagingGateway")}
        </div>
        <div className="settings-field">
          <label className="settings-field-label">{t("gateway.status")}</label>
          <div className="settings-gateway-row">
            <span
              className={`settings-gateway-status ${gatewayRunning ? "running" : "stopped"}`}
            >
              {gatewayRunning ? t("gateway.running") : t("gateway.stopped")}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={toggleGateway}
            >
              {gatewayRunning ? t("common.stop") : t("common.start")}
            </button>
          </div>
          <div className="settings-field-hint">{t("gateway.gatewayHint")}</div>
        </div>
      </div>

      {configuredPlatforms.length > 0 && (
        <div className="settings-section">
          <div className="settings-section-title">
            {t("gateway.configuredChannels") || "已启用的通信渠道"}
          </div>
          {configuredPlatforms.map((platform) =>
            renderPlatformCard(platform, true),
          )}
        </div>
      )}

      {unconfiguredPlatforms.length > 0 && (
        <div className="settings-section">
          <div className="settings-section-title">
            {t("gateway.unconfiguredChannels") || "可配置的其他渠道"}
          </div>
          {unconfiguredPlatforms.map((platform) =>
            renderPlatformCard(platform, false),
          )}
        </div>
      )}

      {otherSections.map((section) => (
        <div key={section.title} className="settings-section">
          <div className="settings-section-title">{t(section.title)}</div>
          {section.items.map((field) => (
            <div key={field.key} className="settings-field">
              <label className="settings-field-label">
                {t(field.label)}
                {savedKey === field.key && (
                  <span className="settings-saved">{t("common.saved")}</span>
                )}
              </label>
              <div className="settings-input-row">
                <input
                  className="input"
                  type={
                    field.type === "password" && !visibleKeys.has(field.key)
                      ? "password"
                      : "text"
                  }
                  value={env[field.key] || ""}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  onBlur={() => handleBlur(field.key)}
                  placeholder={t(field.label)}
                />
                {field.type === "password" && (
                  <button
                    className="btn-ghost settings-toggle-btn"
                    onClick={() => toggleVisibility(field.key)}
                  >
                    {visibleKeys.has(field.key)
                      ? t("common.hide")
                      : t("common.show")}
                  </button>
                )}
              </div>
              <div className="settings-field-hint">{t(field.hint)}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default Gateway;
