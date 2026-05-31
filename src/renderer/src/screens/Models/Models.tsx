import {
  listTemplates,
  addModel,
  checkNeedsMigration,
  runModelMigration,
} from "@renderer/lib/hermes-tauri";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Search, ArrowRight } from "../../assets/icons";
import { useI18n } from "../../components/useI18n";
import BrandLogo from "../../components/common/BrandLogo";
import { cache } from "../../utils/prefetchCache";
import { useModelStore } from "../../hooks/useModelStore";
import ModelsList from "./ModelsList";
import ProviderRegistrationModal from "./ProviderRegistrationModal";
import type {
  ClientModel,
  ClientProvider,
  RegisterProviderInput,
  BusinessCategory,
} from "../../lib/model-types";
import { CATEGORY_CARDINALITY } from "../../lib/model-types";

interface TemplateModel {
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  tags?: string[];
}

function Models({
  visible,
  profile = "default",
  onNavigate,
}: {
  visible?: boolean;
  profile?: string;
  onNavigate?: (view: string) => void;
} = {}): React.JSX.Element {
  const { t } = useI18n();
  const [templates, setTemplates] = useState<TemplateModel[]>([]);
  const [search, setSearch] = useState("");
  const [templatesLoading, setTemplatesLoading] = useState(true);

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

  const [showProviderModal, setShowProviderModal] = useState(false);
  const [showMigrationBanner, setShowMigrationBanner] = useState(false);
  const [migrating, setMigrating] = useState(false);

  const [providers, setProviders] = useState<ClientProvider[]>([]);
  const [models, setModels] = useState<ClientModel[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function detectMigration() {
      try {
        if (Object.keys(store.providers).length > 0) return;
        const result = await checkNeedsMigration(profile);
        if (!cancelled && result.needsMigration) {
          setShowMigrationBanner(true);
        }
      } catch { /* backend may not support it */ }
    }
    if (!storeLoading) detectMigration();
    return () => { cancelled = true; };
  }, [storeLoading, store.providers, profile]);

  async function handleRunMigration() {
    setMigrating(true);
    try {
      await runModelMigration(profile);
      setShowMigrationBanner(false);
    } catch (err: any) {
      console.error("Migration failed:", err);
    }
    setMigrating(false);
  }

  useEffect(() => {
    setProviders(Object.values(store.providers));
    setModels(Object.values(store.models));
  }, [store]);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const tmpl = await cache.getOrFetch("models:templates", 60_000, () =>
        (listTemplates() as Promise<any[]>).then((r) => r ?? []),
      );
      setTemplates(tmpl);
    } catch { /* silently fail */ }
    setTemplatesLoading(false);
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);
  useEffect(() => { if (visible) loadTemplates(); }, [visible, loadTemplates]);

  async function handleAddProvider(input: RegisterProviderInput) {
    const result = await addProvider(input);
    if (result) setShowProviderModal(false);
  }

  async function handleDeleteProvider(providerId: string) {
    await removeProvider(providerId);
  }

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
    // For single-model categories, clear that category from other models first
    if (updates.categories) {
      const newCats = updates.categories;
      const singleCats = newCats.filter(
        (c) => CATEGORY_CARDINALITY[c] === "single",
      );
      for (const cat of singleCats) {
        for (const [id, m] of Object.entries(store.models)) {
          if (id === modelId) continue;
          if (m.categories.includes(cat)) {
            await updateStoreModel(id, {
              categories: m.categories.filter((c) => c !== cat),
            });
          }
        }
      }
    }
    await updateStoreModel(modelId, updates);
  }

  async function handleDeleteModel(modelId: string) {
    const model = store.models[modelId];
    if (model) await removeStoreModel(modelId, model.providerId);
  }

  async function handleQuickAdd(tmpl: TemplateModel): Promise<void> {
    await addModel(tmpl.name, tmpl.provider, tmpl.model, tmpl.baseUrl, undefined, profile);
    cache.invalidate("models:list");
  }

  const existingModelKeys = useMemo(
    () => new Set(models.map((m) => `${m.providerId}::${m.modelId}`)),
    [models],
  );

  const filteredModels = useMemo(() => {
    if (!search) return models;
    const q = search.toLowerCase();
    return models.filter(
      (m) => m.modelId.toLowerCase().includes(q) || m.alias.toLowerCase().includes(q),
    );
  }, [models, search]);

  if (storeLoading) {
    return <div><div className="models-loading"><div className="loading-spinner" /></div></div>;
  }

  return (
    <>
      {showMigrationBanner && (
        <div className="models-migration-banner">
          <span>{t("models.migrationBanner")}</span>
          <div className="models-migration-actions">
            <button className="btn btn-primary btn-sm" onClick={handleRunMigration} disabled={migrating}>
              {migrating ? t("common.loading") : t("models.migrationRun")}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowMigrationBanner(false)}>
              {t("models.migrationDismiss")}
            </button>
          </div>
        </div>
      )}

      {storeError && (
        <div className="models-error-banner">
          <span>{storeError}</span>
          <button className="btn btn-secondary btn-xs" style={{ marginLeft: 8 }}>{t("common.retry")}</button>
        </div>
      )}

      <div className="models-header" style={{ justifyContent: "space-between", marginTop: 0, minHeight: 0, marginBottom: 16 }}>
        {models.length > 0 && (
          <div className="models-search">
            <Search size={14} />
            <input className="models-search-input" type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("models.searchPlaceholder")} />
          </div>
        )}
        <div className="models-header-actions" style={{ display: "flex", gap: 12, marginLeft: "auto" }}>
          <button className="btn btn-primary btn-sm" onClick={() => setShowProviderModal(true)}>
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
        onDeleteModel={handleDeleteModel}
        onUpdateModel={handleUpdateModel}
      />

      {showProviderModal && (
        <ProviderRegistrationModal
          profile={profile}
          onClose={() => setShowProviderModal(false)}
          onSave={handleAddProvider}
        />
      )}
    </>
  );
}

export default Models;
