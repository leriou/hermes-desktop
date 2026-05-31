import {
  listTemplates,
  addModel,
  checkNeedsMigration,
  runModelMigration,
} from "@renderer/lib/hermes-tauri";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Search, ArrowRight } from "../../assets/icons";
import { PROVIDERS } from "../../constants";
import { useI18n } from "../../components/useI18n";
import BrandLogo from "../../components/common/BrandLogo";
import { cache } from "../../utils/prefetchCache";
import { useModelStore } from "../../hooks/useModelStore";
import ModelsList from "./ModelsList";
import ProviderRegistrationModal from "./ProviderRegistrationModal";
import ModelEditModal from "./ModelEditModal";
import type {
  ClientModel,
  ClientProvider,
  RegisterProviderInput,
  SaveModelInput,
  BusinessCategory,
} from "../../lib/model-types";

interface TemplateModel {
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  tags?: string[];
}

function providerLabelKey(value: string): string {
  return PROVIDERS.options.find((p) => p.value === value)?.label || value;
}

interface ModelsProps {
  visible?: boolean;
  profile?: string;
  onNavigate?: (view: string) => void;
}

type TabType = "myModels" | "templates";

function Models({
  visible,
  profile = "default",
  onNavigate,
}: ModelsProps = {}): React.JSX.Element {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabType>("myModels");
  const [templates, setTemplates] = useState<TemplateModel[]>([]);
  const [search, setSearch] = useState("");
  const [templatesLoading, setTemplatesLoading] = useState(true);

  // Model store hook
  const {
    store,
    loading: storeLoading,
    error: storeError,
    addProvider,
    removeProvider,
    addModel: addStoreModel,
    updateModel: updateStoreModel,
    removeModel: removeStoreModel,
  } = useModelStore(profile);

  // UI state
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [editingModel, setEditingModel] = useState<ClientModel | null>(null);
  const [showMigrationBanner, setShowMigrationBanner] = useState(false);

  // Delete confirmation for provider
  const [providers, setProviders] = useState<ClientProvider[]>([]);
  const [models, setModels] = useState<ClientModel[]>([]);

  // Migration detection
  const [migrating, setMigrating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function detectMigration() {
      try {
        // Only check if store is empty and we need migration
        if (Object.keys(store.providers).length > 0) return;
        const result = await checkNeedsMigration(profile);
        if (!cancelled && result.needsMigration) {
          setShowMigrationBanner(true);
        }
      } catch {
        // Migration check failed silently — backend may not support it yet
      }
    }
    if (!storeLoading) {
      detectMigration();
    }
    return () => {
      cancelled = true;
    };
  }, [storeLoading, store.providers, profile]);

  async function handleRunMigration() {
    setMigrating(true);
    try {
      await runModelMigration(profile);
      setShowMigrationBanner(false);
      // Reload will be triggered by the store hook
    } catch (err: any) {
      console.error("Migration failed:", err);
    }
    setMigrating(false);
  }

  // Sync store to local arrays for rendering
  useEffect(() => {
    setProviders(Object.values(store.providers));
    setModels(Object.values(store.models));
  }, [store]);

  // Load templates
  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const tmpl = await cache.getOrFetch("models:templates", 60_000, () =>
        (listTemplates() as Promise<any[]>).then((r) => r ?? []),
      );
      setTemplates(tmpl);
    } catch {
      // silently fail
    }
    setTemplatesLoading(false);
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    if (visible) loadTemplates();
  }, [visible, loadTemplates]);

  // ── Provider operations ──

  async function handleAddProvider(input: RegisterProviderInput) {
    const result = await addProvider(input);
    if (result) {
      setShowProviderModal(false);
    }
  }

  async function handleDeleteProvider(providerId: string) {
    await removeProvider(providerId);
  }

  // ── Model operations ──

  async function handleDiscoverModels(providerId: string, modelIds: string[]) {
    const provider = store.providers[providerId];
    if (!provider) return;

    for (const modelId of modelIds) {
      await addStoreModel({
        providerId,
        modelId,
        categories: [],
        contextLength: 0,
        discovered: true,
      });
    }
  }

  async function handleUpdateModel(modelId: string, updates: {
    alias?: string;
    categories?: BusinessCategory[];
    contextLength?: number;
  }) {
    await updateStoreModel(modelId, updates);
  }

  async function handleDeleteModel(modelId: string) {
    const model = store.models[modelId];
    if (model) {
      await removeStoreModel(modelId, model.providerId);
    }
  }

  // ── Templates tab (keep existing logic) ──

  async function handleQuickAdd(tmpl: TemplateModel): Promise<void> {
    await addModel(
      tmpl.name,
      tmpl.provider,
      tmpl.model,
      tmpl.baseUrl,
      undefined,
      profile,
    );
    cache.invalidate("models:list");
  }

  const existingModelKeys = useMemo(
    () => new Set(models.map((m) => `${m.providerId}::${m.modelId}`)),
    [models],
  );

  // ── Search filter ──

  const filteredModels = useMemo(() => {
    if (!search) return models;
    const q = search.toLowerCase();
    return models.filter(
      (m) =>
        m.modelId.toLowerCase().includes(q) ||
        m.alias.toLowerCase().includes(q),
    );
  }, [models, search]);

  if (storeLoading) {
    return (
      <div>
        <div className="models-loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="pill-tabs" style={{ marginBottom: 24 }}>
        <button
          className={`pill-tab ${tab === "myModels" ? "active" : ""}`}
          onClick={() => setTab("myModels")}
        >
          {t("models.tabs.myModels")}
        </button>
        <button
          className={`pill-tab ${tab === "templates" ? "active" : ""}`}
          onClick={() => setTab("templates")}
        >
          {t("models.tabs.templates")}
        </button>
      </div>

      {/* ── Migration Banner ── */}
      {showMigrationBanner && (
        <div className="models-migration-banner">
          <span>{t("models.migrationBanner")}</span>
          <div className="models-migration-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={handleRunMigration}
              disabled={migrating}
            >
              {migrating
                ? t("common.loading")
                : t("models.migrationRun")}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowMigrationBanner(false)}
            >
              {t("models.migrationDismiss")}
            </button>
          </div>
        </div>
      )}

      {/* ── Store Error Banner ── */}
      {storeError && (
        <div className="models-error-banner">
          <span>{storeError}</span>
          <button className="btn btn-secondary btn-xs" style={{ marginLeft: 8 }}>
            {t("common.retry")}
          </button>
        </div>
      )}

      {/* ── My Models Tab ── */}
      {tab === "myModels" && (
        <>
          <div
            className="models-header"
            style={{
              justifyContent: "space-between",
              marginTop: 0,
              minHeight: 0,
              marginBottom: 16,
            }}
          >
            {models.length > 0 && (
              <div className="models-search">
                <Search size={14} />
                <input
                  className="models-search-input"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("models.searchPlaceholder")}
                />
              </div>
            )}
            <div
              className="models-header-actions"
              style={{ display: "flex", gap: 12, marginLeft: "auto" }}
            >
              {onNavigate && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => onNavigate("providers")}
                  title={t("models.addFromProviderHint", {
                    defaultValue:
                      "Go to Providers to discover and add models",
                  })}
                >
                  <ArrowRight size={14} />
                  {t("models.addFromProvider", {
                    defaultValue: "Add from Provider",
                  })}
                </button>
              )}
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowProviderModal(true)}
              >
                <Plus size={14} />
                {t("models.addProvider")}
              </button>
            </div>
          </div>

          <ModelsList
            providers={providers}
            models={filteredModels}
            profile={profile}
            onAddProvider={() => setShowProviderModal(true)}
            onDiscoverModels={handleDiscoverModels}
            onDeleteProvider={handleDeleteProvider}
            onEditModel={setEditingModel}
            onDeleteModel={handleDeleteModel}
          />
        </>
      )}

      {/* ── Templates Tab ── */}
      {tab === "templates" && (
        <div className="tools-content animate-in">
          {templatesLoading ? (
            <div className="models-loading">
              <div className="loading-spinner" />
            </div>
          ) : (
            <>
              <p className="models-subtitle" style={{ marginBottom: 16 }}>
                {t("models.templates.subtitle")}
              </p>
              <div className="models-grid">
                {templates.map((tmpl) => {
                  const key = `${tmpl.provider}::${tmpl.model}`;
                  const added = existingModelKeys.has(key);
                  return (
                    <div
                      key={key}
                      className={`models-card ${
                        added ? "tools-card-disabled" : "tools-card-enabled"
                      }`}
                    >
                      <div className="models-card-header">
                        <div className="models-card-title">
                          <BrandLogo
                            provider={tmpl.provider}
                            modelId={tmpl.model}
                            size={20}
                          />
                          <div className="models-card-name">{tmpl.name}</div>
                        </div>
                        <span className="models-card-provider">
                          {t(providerLabelKey(tmpl.provider))}
                        </span>
                      </div>
                      <div className="models-card-model">{tmpl.model}</div>
                      {tmpl.tags && tmpl.tags.length > 0 && (
                        <div className="models-card-tags">
                          {tmpl.tags.map((tag) => (
                            <span key={tag} className="models-card-tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="models-card-footer">
                        {added ? (
                          <span className="models-card-added">
                            {t("models.templates.alreadyAdded")}
                          </span>
                        ) : (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleQuickAdd(tmpl)}
                          >
                            {t("models.templates.quickAdd")}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Provider Registration Modal ── */}
      {showProviderModal && (
        <ProviderRegistrationModal
          profile={profile}
          onClose={() => setShowProviderModal(false)}
          onSave={handleAddProvider}
        />
      )}

      {/* ── Model Edit Modal ── */}
      {editingModel && (
        <ModelEditModal
          model={editingModel}
          profile={profile}
          onClose={() => setEditingModel(null)}
          onSave={handleUpdateModel}
        />
      )}
    </>
  );
}

export default Models;
