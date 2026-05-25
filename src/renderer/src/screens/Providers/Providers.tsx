import { useState, useEffect, useRef, useCallback } from "react";
import { PROVIDERS, OAUTH_PROVIDERS, SETTINGS_SECTIONS } from "../../constants";
import { useI18n } from "../../components/useI18n";
import BrandLogo from "../../components/common/BrandLogo";
import { useDiscoveredModels } from "../../hooks/useDiscoveredModels";
import OAuthLoginModal from "../../components/OAuthLoginModal";
import { KeyRound, Check } from "../../assets/icons";

type ProviderTab = "model" | "apikeys" | "tools" | "credentials" | "oauth";

const PROVIDER_ENV_KEY: Record<string, string> = {
  openrouter: "OPENROUTER_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  "openai-codex": "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
  xai: "XAI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  groq: "GROQ_API_KEY",
  together: "TOGETHER_API_KEY",
  fireworks: "FIREWORKS_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  huggingface: "HF_TOKEN",
  nvidia: "NVIDIA_API_KEY",
  zai: "GLM_API_KEY",
  minimax: "MINIMAX_API_KEY",
  custom: "CUSTOM_API_KEY",
};

const TABS: { key: ProviderTab; labelKey: string }[] = [
  { key: "model", labelKey: "providers.tabs.model" },
  { key: "apikeys", labelKey: "providers.tabs.apikeys" },
  { key: "tools", labelKey: "providers.tabs.tools" },
  { key: "credentials", labelKey: "providers.tabs.credentials" },
  { key: "oauth", labelKey: "providers.tabs.oauth" },
];

function Providers({
  profile,
  visible,
}: {
  profile?: string;
  visible?: boolean;
}): React.JSX.Element {
  const { t } = useI18n();
  const [tab, setTab] = useState<ProviderTab>("model");

  // Env / API keys
  const [env, setEnv] = useState<Record<string, string>>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  // Model discovery (provider explorer)
  const [discProvider, setDiscProvider] = useState("");
  const [discBaseUrl, setDiscBaseUrl] = useState("");
  const [discApiKey, setDiscApiKey] = useState("");
  const [discRefresh, setDiscRefresh] = useState(0);

  // Add-from-provider: selection & alias state
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [modelAliases, setModelAliases] = useState<Record<string, string>>({});
  const [addingModels, setAddingModels] = useState(false);
  const [addedModels, setAddedModels] = useState<Set<string>>(new Set());

  // Credential pool
  const [credPool, setCredPool] = useState<
    Record<string, Array<{ key: string; label: string }>>
  >({});
  const [poolProvider, setPoolProvider] = useState("");
  const [poolNewKey, setPoolNewKey] = useState("");
  const [poolNewLabel, setPoolNewLabel] = useState("");

  // OAuth sign-in modal
  const [oauthModal, setOauthModal] = useState<
    (typeof OAUTH_PROVIDERS)[number] | null
  >(null);

  const envSaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const envRef = useRef<Record<string, string>>({});

  const loadConfig = useCallback(async (): Promise<void> => {
    const [envData, pool] = await Promise.all([
      window.hermesAPI.getEnv(profile),
      window.hermesAPI.getCredentialPool(),
    ]);
    setEnv(envData);
    setCredPool(pool);
  }, [profile]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (!discProvider) return;
    const envKey = PROVIDER_ENV_KEY[discProvider];
    if (envKey && env[envKey] && !discApiKey) {
      setDiscApiKey(env[envKey]);
    }
  }, [env, discProvider]);

  async function handleBlur(key: string): Promise<void> {
    const pending = envSaveTimers.current.get(key);
    if (pending) {
      clearTimeout(pending);
      envSaveTimers.current.delete(key);
    }
    const value = env[key] || "";
    await window.hermesAPI.setEnv(key, value, profile);
    setSavedKey(key);
    setTimeout(() => setSavedKey(null), 2000);
  }

  function handleChange(key: string, value: string): void {
    setEnv((prev) => ({ ...prev, [key]: value }));
    const pending = envSaveTimers.current.get(key);
    if (pending) clearTimeout(pending);
    const timer = setTimeout(() => {
      envSaveTimers.current.delete(key);
      void window.hermesAPI.setEnv(key, value, profile);
    }, 400);
    envSaveTimers.current.set(key, timer);
  }

  useEffect(() => {
    envRef.current = env;
  }, [env]);

  useEffect(() => {
    const timers = envSaveTimers.current;
    return () => {
      for (const [key, timer] of timers) {
        clearTimeout(timer);
        void window.hermesAPI.setEnv(key, envRef.current[key] || "", profile);
      }
      timers.clear();
    };
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
    await window.hermesAPI.setCredentialPool(poolProvider, entries);
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
    await window.hermesAPI.setCredentialPool(provider, entries);
    setCredPool((prev) => ({ ...prev, [provider]: entries }));
  }

  function toggleVisibility(key: string): void {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleModelSelect(modelId: string): void {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  }

  function selectAllModels(): void {
    if (selectedModels.size === discovery.models.length) {
      setSelectedModels(new Set());
    } else {
      setSelectedModels(new Set(discovery.models));
    }
  }

  async function handleAddSelected(): Promise<void> {
    if (selectedModels.size === 0) return;
    setAddingModels(true);
    const allAlias = modelAliases;
    let successCount = 0;
    for (const modelId of selectedModels) {
      try {
        const alias = allAlias[modelId]?.trim() || undefined;
        await window.hermesAPI.addModel(
          modelId,
          discProvider === "custom" ? "custom" : discProvider,
          modelId,
          discBaseUrl,
          alias,
          profile,
        );
        successCount++;
        setAddedModels((prev) => new Set(prev).add(modelId));
      } catch (err) {
        console.error(`Failed to add model ${modelId}:`, err);
      }
    }
    setAddingModels(false);
    setSelectedModels(new Set());
    setModelAliases({});
    // Clear added highlight after 3s
    setTimeout(() => setAddedModels(new Set()), 3000);
  }

  const isCustomProvider = discProvider === "custom";

  const discovery = useDiscoveredModels({
    provider: discProvider,
    baseUrl: isCustomProvider ? discBaseUrl : undefined,
    apiKey: discApiKey || undefined,
    profile,
    enabled: !!visible && !!discProvider && discProvider !== "auto",
    refreshToken: discRefresh,
  });

  const isLlmSection = (title: string) =>
    title === "constants.sectionLlmProviders";

  const llmSection = SETTINGS_SECTIONS.find((s) =>
    isLlmSection(s.title),
  );
  const toolSections = SETTINGS_SECTIONS.filter((s) => !isLlmSection(s.title));

  function renderEnvField(
    field: { key: string; label: string; type: string; hint: string },
    asCard: boolean,
  ): React.JSX.Element {
    return (
      <div key={field.key} className={asCard ? "provider-key-card" : "settings-field"}>
        {asCard && (
          <div className="provider-key-card-head">
            <BrandLogo provider={field.key} size={22} />
            <span className="provider-key-card-title">{t(field.label)}</span>
            {savedKey === field.key && (
              <span className="settings-saved">{t("common.saved")}</span>
            )}
          </div>
        )}
        {!asCard && (
          <label className="settings-field-label">
            {t(field.label)}
            {savedKey === field.key && (
              <span className="settings-saved">{t("common.saved")}</span>
            )}
          </label>
        )}
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
              {visibleKeys.has(field.key) ? t("common.hide") : t("common.show")}
            </button>
          )}
        </div>
        <div className="settings-field-hint">{t(field.hint)}</div>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <h1 className="settings-header">{t("providers.title")}</h1>

      <div className="persona-tabs">
        {TABS.map(({ key, labelKey }) => (
          <button
            key={key}
            className={`persona-tab ${tab === key ? "active" : ""}`}
            onClick={() => setTab(key)}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* ── Model Tab: Provider Explorer ── */}
      {tab === "model" && (
        <>
          <p className="models-subtitle" style={{ marginBottom: 16 }}>
            {t("providers.subtitle")}
          </p>
          <div className="settings-section">
            <div className="settings-section-title">
              {t("providers.explorerTitle")}
            </div>

            <div className="settings-field">
              <label className="settings-field-label">{t("common.provider")}</label>
              <div className="settings-provider-row">
                <BrandLogo provider={discProvider} size={20} />
                <select
                  className="input settings-select"
                  value={discProvider}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDiscProvider(v);
                    if (v === "custom" && !discBaseUrl) {
                      setDiscBaseUrl("http://localhost:1234/v1");
                    }
                    const envKey = PROVIDER_ENV_KEY[v];
                    setDiscApiKey(envKey ? env[envKey] || "" : "");
                  }}
                >
                  <option value="">{t("providers.selectProvider")}</option>
                  {PROVIDERS.options
                    .filter((p) => p.value !== "auto")
                    .map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {t(opt.label)}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {discProvider && (
              <div className="settings-field">
                <label className="settings-field-label">
                  {t("common.baseUrl")}
                </label>
                <input
                  className="input"
                  type="text"
                  value={discBaseUrl}
                  onChange={(e) => setDiscBaseUrl(e.target.value)}
                  placeholder={t("settings.modelBaseUrlPlaceholder")}
                />
                <div className="settings-field-hint">
                  {t("providers.baseUrlHint")}
                </div>
              </div>
            )}

            {discProvider && (
              <div className="settings-field">
                <label className="settings-field-label">
                  API Key
                </label>
                <div className="settings-input-row">
                  <input
                    className="input"
                    type={visibleKeys.has("disc-api-key") ? "text" : "password"}
                    value={discApiKey}
                    onChange={(e) => setDiscApiKey(e.target.value)}
                    placeholder={t("settings.apiKeyPlaceholder")}
                  />
                  <button
                    className="btn-ghost settings-toggle-btn"
                    onClick={() => toggleVisibility("disc-api-key")}
                  >
                    {visibleKeys.has("disc-api-key") ? t("common.hide") : t("common.show")}
                  </button>
                </div>
                <div className="settings-field-hint">
                  {t("providers.apiKeyHint")}
                </div>
              </div>
            )}

            {discProvider && (
              <div className="settings-field" style={{ marginTop: 8 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => setDiscRefresh((n) => n + 1)}
                  disabled={discovery.status === "loading"}
                >
                  {discovery.status === "loading"
                    ? t("settings.discoveringModels")
                    : t("providers.checkModels")}
                </button>
              </div>
            )}

            {discovery.status === "ok" && discovery.models.length > 0 && (
              <div className="providers-model-list">
                <div className="providers-model-list-header">
                  <div className="settings-field-hint">
                    {t("settings.discoveredCount", { count: discovery.models.length })}
                    {discovery.cached && ` (${t("providers.cached")})`}
                  </div>
                  <div className="providers-model-actions">
                    <label className="providers-select-all">
                      <input
                        type="checkbox"
                        checked={selectedModels.size === discovery.models.length && discovery.models.length > 0}
                        onChange={selectAllModels}
                      />
                      {t("providers.selectAll", { defaultValue: "Select All" })}
                    </label>
                    {selectedModels.size > 0 && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={handleAddSelected}
                        disabled={addingModels}
                      >
                        {addingModels
                          ? t("providers.adding", { defaultValue: "Adding..." })
                          : t("providers.addSelected", { defaultValue: `Add ${selectedModels.size} to My Models` })}
                      </button>
                    )}
                  </div>
                </div>
                <table className="providers-model-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}></th>
                      <th>{t("providers.colModel")}</th>
                      <th style={{ width: 160 }}>{t("providers.colAlias", { defaultValue: "Alias" })}</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {discovery.models.map((m) => {
                      const isSelected = selectedModels.has(m);
                      const isAdded = addedModels.has(m);
                      return (
                        <tr
                          key={m}
                          className={`providers-model-row ${isSelected ? "providers-model-row--selected" : ""} ${isAdded ? "providers-model-row--added" : ""}`}
                        >
                          <td>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleModelSelect(m)}
                              disabled={isAdded}
                            />
                          </td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                            {m}
                          </td>
                          <td>
                            <input
                              className="input providers-alias-input"
                              type="text"
                              value={modelAliases[m] || ""}
                              onChange={(e) =>
                                setModelAliases((prev) => ({ ...prev, [m]: e.target.value }))
                              }
                              placeholder={t("providers.aliasPlaceholder", { defaultValue: "optional" })}
                              disabled={isAdded}
                            />
                          </td>
                          <td>
                            {isAdded && (
                              <span className="providers-added-check">
                                <Check size={14} />
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {discovery.status === "no-key" && (
              <div className="settings-field-hint" style={{ color: "var(--warning)" }}>
                {t("settings.discoveryNoKey")}
              </div>
            )}
            {discovery.status === "error" && (
              <div className="settings-field-hint" style={{ color: "var(--error)" }}>
                {t("settings.discoveryError")}
              </div>
            )}
            {discovery.status === "unknown-host" && (
              <div className="settings-field-hint" style={{ color: "var(--error)" }}>
                {t("providers.unknownHost")}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── API Keys Tab ── */}
      {tab === "apikeys" && llmSection && (
        <div className="settings-section">
          <div className="settings-section-title">{t(llmSection.title)}</div>
          <div className="provider-keys-grid">
            {llmSection.items.map((field) => renderEnvField(field, true))}
          </div>
        </div>
      )}

      {/* ── Tools Tab ── */}
      {tab === "tools" && (
        <>
          {toolSections.map((section) => (
            <div key={section.title} className="settings-section">
              <div className="settings-section-title">{t(section.title)}</div>
              <div className="provider-keys-grid">
                {section.items.map((field) => renderEnvField(field, true))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── Credentials Tab ── */}
      {tab === "credentials" && (
        <div className="settings-section">
          <div className="settings-section-title">
            {t("settings.sections.credentialPool")}
          </div>
          <div className="settings-field">
            <div className="settings-field-hint" style={{ marginBottom: 10 }}>
              {t("settings.poolHint")}
            </div>
            <div className="settings-pool-add">
              <select
                className="input"
                value={poolProvider}
                onChange={(e) => setPoolProvider(e.target.value)}
                style={{ width: 140 }}
              >
                <option value="">{t("common.provider")}</option>
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
                value={poolNewKey}
                onChange={(e) => setPoolNewKey(e.target.value)}
                placeholder={t("settings.apiKeyPlaceholder")}
                style={{ flex: 1 }}
              />
              <input
                className="input"
                type="text"
                value={poolNewLabel}
                onChange={(e) => setPoolNewLabel(e.target.value)}
                placeholder={t("settings.labelPlaceholder", {
                  optional: t("common.optional"),
                })}
                style={{ width: 120 }}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={handleAddPoolKey}
                disabled={!poolProvider || !poolNewKey.trim()}
              >
                {t("settings.add")}
              </button>
            </div>
            {Object.entries(credPool).map(
              ([provider, entries]) =>
                entries.length > 0 && (
                  <div key={provider} className="settings-pool-group">
                    <div className="settings-pool-provider">
                      <BrandLogo provider={provider} size={16} />
                      {PROVIDERS.options.find((p) => p.value === provider)
                        ? t(
                            PROVIDERS.options.find((p) => p.value === provider)!
                              .label,
                          )
                        : provider}
                    </div>
                    {entries.map((entry, idx) => (
                      <div key={idx} className="settings-pool-entry">
                        <span className="settings-pool-label">
                          {entry.label || `${t("settings.keyLabel")} ${idx + 1}`}
                        </span>
                        <span className="settings-pool-key">
                          {entry.key
                            ? `${entry.key.slice(0, 8)}...${entry.key.slice(-4)}`
                            : t("settings.empty")}
                        </span>
                        <button
                          className="btn-ghost"
                          style={{ color: "var(--error)", fontSize: 11 }}
                          onClick={() => handleRemovePoolKey(provider, idx)}
                        >
                          {t("settings.remove")}
                        </button>
                      </div>
                    ))}
                  </div>
                ),
            )}
          </div>
        </div>
      )}

      {/* ── OAuth Tab ── */}
      {tab === "oauth" && (
        <div className="settings-section">
          <div className="settings-section-title">
            {t("providers.oauth.sectionTitle")}
          </div>
          <div className="settings-field-hint" style={{ marginBottom: 10 }}>
            {t("providers.oauth.sectionHint")}
          </div>
          <div className="provider-keys-grid">
            {OAUTH_PROVIDERS.map((p) => (
              <div key={p.id} className="provider-key-card">
                <div className="provider-key-card-head">
                  <BrandLogo provider={p.id} size={22} />
                  <span className="provider-key-card-title">{p.name}</span>
                </div>
                <div className="settings-field-hint">{t(p.desc)}</div>
                <button
                  className="btn btn-secondary btn-sm oauth-signin-btn"
                  aria-label={`${t("providers.oauth.signIn")} — ${p.name}`}
                  onClick={() => setOauthModal(p)}
                >
                  <KeyRound size={14} />
                  {t("providers.oauth.signIn")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {oauthModal && (
        <OAuthLoginModal
          provider={oauthModal.id}
          providerLabel={oauthModal.name}
          profile={profile}
          onClose={() => setOauthModal(null)}
        />
      )}
    </div>
  );
}

export default Providers;
