import { useState, useEffect, useRef, useCallback } from "react";
import { SETTINGS_SECTIONS } from "../../constants";
import { useI18n } from "../../components/useI18n";
import BrandLogo from "../../components/common/BrandLogo";
import { setEnv as setTauriEnv, getEnv } from "@renderer/lib/hermes-tauri";

const isLlmSection = (title: string) =>
  title === "constants.sectionLlmProviders";

export default function ToolsKeysTab({ profile }: { profile?: string }): React.JSX.Element {
  const { t } = useI18n();
  const [env, setEnv] = useState<Record<string, string>>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const envSaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const envRef = useRef<Record<string, string>>({});

  const loadConfig = useCallback(async () => {
    const envData = await getEnv(profile);
    setEnv(envData);
  }, [profile]);

  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => { envRef.current = env; }, [env]);

  useEffect(() => {
    const timers = envSaveTimers.current;
    return () => {
      for (const [key, timer] of timers) {
        clearTimeout(timer);
        void setTauriEnv(key, envRef.current[key] || "", profile);
      }
      timers.clear();
    };
  }, [profile]);

  async function handleBlur(key: string): Promise<void> {
    const pending = envSaveTimers.current.get(key);
    if (pending) { clearTimeout(pending); envSaveTimers.current.delete(key); }
    await setTauriEnv(key, env[key] || "", profile);
    setSavedKey(key);
    setTimeout(() => setSavedKey(null), 2000);
  }

  function handleChange(key: string, value: string): void {
    setEnv((prev) => ({ ...prev, [key]: value }));
    const pending = envSaveTimers.current.get(key);
    if (pending) clearTimeout(pending);
    const timer = setTimeout(() => {
      envSaveTimers.current.delete(key);
      void setTauriEnv(key, value, profile);
    }, 400);
    envSaveTimers.current.set(key, timer);
  }

  function toggleVisibility(key: string): void {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const toolSections = SETTINGS_SECTIONS.filter((s) => !isLlmSection(s.title));

  return (
    <>
      {toolSections.map((section) => (
        <div key={section.title} className="settings-section" style={{ marginBottom: 16 }}>
          <div className="settings-section-title">{t(section.title)}</div>
          <div className="provider-keys-grid">
            {section.items.map((field) => (
              <div key={field.key} className="provider-key-card">
                <div className="provider-key-card-head">
                  <BrandLogo provider={field.key} size={22} />
                  <span className="provider-key-card-title">{t(field.label)}</span>
                  {savedKey === field.key && (
                    <span className="settings-saved">{t("common.saved")}</span>
                  )}
                </div>
                <div className="settings-input-row">
                  <input
                    className="input"
                    type={field.type === "password" && !visibleKeys.has(field.key) ? "password" : "text"}
                    value={env[field.key] || ""}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    onBlur={() => handleBlur(field.key)}
                    placeholder={t(field.label)}
                  />
                  {field.type === "password" && (
                    <button className="btn-ghost settings-toggle-btn" onClick={() => toggleVisibility(field.key)}>
                      {visibleKeys.has(field.key) ? t("common.hide") : t("common.show")}
                    </button>
                  )}
                </div>
                <div className="settings-field-hint">{t(field.hint)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
