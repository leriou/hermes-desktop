import { useState, useMemo, useCallback } from "react";
import { Plus, RefreshCw as Refresh, ChevronDown, ChevronRight, Save } from "lucide-react";
import { Trash } from "../../assets/icons";
import { useI18n } from "../../components/useI18n";
import { useDiscoveredModels } from "../../hooks/useDiscoveredModels";
import { CATEGORY_META, CATEGORY_CARDINALITY, ALL_CATEGORIES } from "../../lib/model-types";
import type {
  ClientProvider,
  ClientModel,
  BusinessCategory,
} from "../../lib/model-types";
import BrandLogo from "../../components/common/BrandLogo";

const CONTEXT_OPTIONS = [0, 128000, 200000, 500000, 1000000];
const CATEGORY_ROW_SPLIT = 7; // first 7 cats in row 1, rest in row 2

interface ProviderGroupProps {
  provider: ClientProvider;
  models: ClientModel[];
  allModels: ClientModel[];
  profile?: string;
  existingModelIds: Set<string>;
  onDiscoverModels: (modelIds: string[]) => Promise<void>;
  onDeleteProvider: (providerId: string) => void;
  onDeleteModel: (modelId: string) => void;
  onUpdateModel: (modelId: string, updates: { alias?: string; categories?: BusinessCategory[]; contextLength?: number }) => Promise<void>;
  onToggleCollapse?: () => void;
  collapsed?: boolean;
}

export default function ProviderGroup({
  provider,
  models,
  allModels,
  profile = "default",
  existingModelIds,
  onDiscoverModels,
  onDeleteProvider,
  onDeleteModel,
  onUpdateModel,
  collapsed: externalCollapsed,
  onToggleCollapse,
}: ProviderGroupProps) {
  const { t } = useI18n();
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [discoveryRefresh, setDiscoveryRefresh] = useState(0);
  const [confirmDeleteProvider, setConfirmDeleteProvider] = useState(false);
  const [confirmDeleteModel, setConfirmDeleteModel] = useState<string | null>(null);
  const [addingModelIds, setAddingModelIds] = useState<Set<string>>(new Set());
  const [addedModelIds, setAddedModelIds] = useState<Set<string>>(new Set());

  // Inline editing state per model
  const [editState, setEditState] = useState<Record<string, { alias: string; contextLength: number }>>({});
  const [savingModel, setSavingModel] = useState<string | null>(null);

  const collapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;
  const toggle = onToggleCollapse || (() => setInternalCollapsed((v) => !v));

  const discovery = useDiscoveredModels({
    provider: provider.providerKey,
    baseUrl: provider.baseUrl,
    profile,
    enabled: showDiscovery,
    refreshToken: discoveryRefresh,
  });

  const undiscoveredModels = useMemo(() => {
    return discovery.models.filter((m) => !existingModelIds.has(m));
  }, [discovery.models, existingModelIds]);

  const isModelAdding = useCallback(
    (modelId: string) => addingModelIds.has(modelId),
    [addingModelIds],
  );

  const isModelAdded = useCallback(
    (modelId: string) => addedModelIds.has(modelId) || existingModelIds.has(modelId),
    [addedModelIds, existingModelIds],
  );

  function getEditState(model: ClientModel) {
    if (editState[model.id]) return editState[model.id];
    return { alias: model.alias, contextLength: model.contextLength };
  }

  function setModelEdit(modelId: string, patch: Partial<{ alias: string; contextLength: number }>) {
    setEditState((prev) => ({
      ...prev,
      [modelId]: { ...(prev[modelId] ?? {}), ...patch },
    }));
  }

  function isDirty(model: ClientModel) {
    const ed = editState[model.id];
    if (!ed) return false;
    return ed.alias !== model.alias || ed.contextLength !== model.contextLength;
  }

  async function handleSaveModel(model: ClientModel) {
    const ed = getEditState(model);
    setSavingModel(model.id);
    try {
      await onUpdateModel(model.id, {
        alias: ed.alias.trim(),
        contextLength: ed.contextLength,
      });
      // Clear edit state so it re-reads from model props
      setEditState((prev) => {
        const next = { ...prev };
        delete next[model.id];
        return next;
      });
    } catch {
      // Error handled by parent
    } finally {
      setSavingModel(null);
    }
  }

  async function handleAddDiscovered(modelId: string) {
    setAddingModelIds((prev) => new Set(prev).add(modelId));
    try {
      await onDiscoverModels([modelId]);
      setAddedModelIds((prev) => new Set(prev).add(modelId));
    } catch {
      // Error handled by parent
    } finally {
      setAddingModelIds((prev) => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });
    }
  }

  async function handleAddAllNew() {
    if (undiscoveredModels.length === 0) return;
    await onDiscoverModels(undiscoveredModels);
  }

  const modelCount = models.length;
  const catRow1 = ALL_CATEGORIES.slice(0, CATEGORY_ROW_SPLIT);
  const catRow2 = ALL_CATEGORIES.slice(CATEGORY_ROW_SPLIT);

  return (
    <div className="provider-group">
      {/* Provider Header */}
      <div className="provider-group-header" onClick={toggle}>
        <button className="btn-ghost provider-group-toggle" type="button">
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
        <BrandLogo provider={provider.providerKey} size={20} />
        <div className="provider-group-name">{provider.name}</div>
        <span className="provider-group-badge">{modelCount} 个模型</span>
        <span className="provider-group-url" title={provider.baseUrl}>
          {provider.baseUrl}
        </span>
        <div className="provider-group-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setShowDiscovery(!showDiscovery);
              if (!showDiscovery) {
                setDiscoveryRefresh((n) => n + 1);
              }
            }}
            title={t("models.discover")}
          >
            <Refresh size={14} />
            {showDiscovery ? t("common.hide") : t("models.discover")}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setConfirmDeleteProvider(true)}
            title={t("models.deleteProviderTitle")}
            style={{ color: "var(--error)" }}
          >
            <Trash size={14} />
          </button>
        </div>
      </div>

      {/* Provider Body (collapsible) */}
      {!collapsed && (
        <div className="provider-group-body">
          {/* Discovery Panel */}
          {showDiscovery && (
            <div className="provider-discovery-panel">
              {discovery.status === "loading" && (
                <div className="provider-discovery-loading">
                  <div className="loading-spinner" />
                  <span>{t("models.discovering")}</span>
                </div>
              )}

              {discovery.status === "ok" && undiscoveredModels.length === 0 && (
                <div className="provider-discovery-empty">
                  {t("models.noDiscoveryResults")}
                </div>
              )}

              {discovery.status === "ok" && undiscoveredModels.length > 0 && (
                <div className="provider-discovery-list">
                  <div className="provider-discovery-header">
                    <span className="provider-discovery-count">
                      发现 {undiscoveredModels.length} 个新模型
                    </span>
                    <button
                      className="btn btn-secondary btn-xs"
                      onClick={handleAddAllNew}
                    >
                      {t("models.addAllNew")}
                    </button>
                  </div>
                  <div className="provider-discovery-items">
                    {undiscoveredModels.map((modelId) => {
                      const adding = isModelAdding(modelId);
                      const added = isModelAdded(modelId);
                      return (
                        <div key={modelId} className="provider-discovery-item">
                          <span className="provider-discovery-model-id">
                            {modelId}
                          </span>
                          {added ? (
                            <span className="provider-discovery-added">
                              {t("models.alreadyAdded")}
                            </span>
                          ) : (
                            <button
                              className="btn btn-primary btn-xs"
                              onClick={() => handleAddDiscovered(modelId)}
                              disabled={adding}
                            >
                              {adding ? (
                                <span className="loading-spinner-sm" />
                              ) : (
                                <Plus size={12} />
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {discovery.status === "error" && (
                <div className="provider-discovery-error">
                  {t("settings.discoveryError")}
                  <button
                    className="btn btn-secondary btn-xs"
                    onClick={() => setDiscoveryRefresh((n) => n + 1)}
                    style={{ marginLeft: 8 }}
                  >
                    {t("common.retry")}
                  </button>
                </div>
              )}

              {discovery.status === "no-key" && (
                <div className="provider-discovery-error">
                  {t("settings.discoveryNoKey")}
                </div>
              )}

              {discovery.status === "unknown-host" && (
                <div className="provider-discovery-error">
                  {t("providers.unknownHost")}
                </div>
              )}
            </div>
          )}

          {/* Model List */}
          {models.length === 0 ? (
            <div className="provider-group-empty">
              <p>{t("models.noModels")}</p>
              <p className="provider-group-empty-hint">
                {t("models.noModelsHint")}
              </p>
            </div>
          ) : (
            <div className="provider-models-list">
              {models.map((model) => {
                const modelCats = new Set(model.categories);
                const ed = getEditState(model);
                const dirty = isDirty(model);
                const saving = savingModel === model.id;
                return (
                  <div key={model.id} className="provider-model-card">
                    {/* Row 1: Model info + inline editing */}
                    <div className="provider-model-top">
                      <span className="provider-model-id" title={model.modelId}>
                        {model.modelId}
                      </span>
                      <span className={`provider-model-source ${model.discovered ? "provider-model-source--discovered" : "provider-model-source--manual"}`}>
                        {model.discovered ? "API" : "Manual"}
                      </span>
                      <input
                        className="provider-model-inline-alias"
                        type="text"
                        value={ed.alias}
                        onChange={(e) => setModelEdit(model.id, { alias: e.target.value })}
                        placeholder="alias"
                      />
                      <select
                        className="provider-model-inline-select"
                        value={ed.contextLength}
                        onChange={(e) => setModelEdit(model.id, { contextLength: Number(e.target.value) })}
                      >
                        {CONTEXT_OPTIONS.map((v) => (
                          <option key={v} value={v}>
                            {v === 0 ? "Context" : `${(v / 1000).toFixed(0)}k`}
                          </option>
                        ))}
                      </select>
                      <div className="provider-model-top-spacer" />
                      <div className="provider-model-actions">
                        {dirty && (
                          <button
                            className="btn btn-primary btn-xs"
                            onClick={() => handleSaveModel(model)}
                            disabled={saving}
                            title={t("models.save")}
                          >
                            {saving ? <span className="loading-spinner-sm" /> : <Save size={12} />}
                          </button>
                        )}
                        {confirmDeleteModel === model.id ? (
                          <div className="provider-model-delete-confirm">
                            <span style={{ fontSize: 12 }}>
                              {t("models.deleteConfirm")}
                            </span>
                            <button
                              className="btn btn-xs btn-danger-text"
                              onClick={() => {
                                onDeleteModel(model.id);
                                setConfirmDeleteModel(null);
                              }}
                            >
                              {t("models.yes")}
                            </button>
                            <button
                              className="btn btn-xs"
                              onClick={() => setConfirmDeleteModel(null)}
                            >
                              {t("models.no")}
                            </button>
                          </div>
                        ) : (
                          <button
                            className="btn-ghost btn-xs"
                            style={{ color: "var(--error)" }}
                            onClick={() => setConfirmDeleteModel(model.id)}
                            title={t("models.deleteModelTitle")}
                          >
                            <Trash size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Row 2-3: Category tags */}
                    <div className="provider-model-categories">
                      <div className="provider-model-cat-row">
                        {catRow1.map((cat) => {
                          const meta = CATEGORY_META[cat];
                          const active = modelCats.has(cat);
                          return (
                            <button
                              key={cat}
                              className={`provider-model-cat-btn ${active ? "active" : ""}`}
                              style={active ? {
                                backgroundColor: `${meta.color}20`,
                                color: meta.color,
                                borderColor: meta.color,
                              } : undefined}
                              onClick={async () => {
                                let newCats: BusinessCategory[];
                                if (active) {
                                  newCats = model.categories.filter((c) => c !== cat);
                                } else {
                                  newCats = [...model.categories, cat];
                                }
                                if (!active && CATEGORY_CARDINALITY[cat] === "single") {
                                  for (const m of allModels) {
                                    if (m.id === model.id) continue;
                                    if (m.categories.includes(cat)) {
                                      await onUpdateModel(m.id, {
                                        categories: m.categories.filter((c) => c !== cat),
                                      });
                                    }
                                  }
                                }
                                await onUpdateModel(model.id, { categories: newCats });
                              }}
                              title={meta.label}
                            >
                              {meta.icon} {meta.label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="provider-model-cat-row">
                        {catRow2.map((cat) => {
                          const meta = CATEGORY_META[cat];
                          const active = modelCats.has(cat);
                          return (
                            <button
                              key={cat}
                              className={`provider-model-cat-btn ${active ? "active" : ""}`}
                              style={active ? {
                                backgroundColor: `${meta.color}20`,
                                color: meta.color,
                                borderColor: meta.color,
                              } : undefined}
                              onClick={async () => {
                                let newCats: BusinessCategory[];
                                if (active) {
                                  newCats = model.categories.filter((c) => c !== cat);
                                } else {
                                  newCats = [...model.categories, cat];
                                }
                                if (!active && CATEGORY_CARDINALITY[cat] === "single") {
                                  for (const m of allModels) {
                                    if (m.id === model.id) continue;
                                    if (m.categories.includes(cat)) {
                                      await onUpdateModel(m.id, {
                                        categories: m.categories.filter((c) => c !== cat),
                                      });
                                    }
                                  }
                                }
                                await onUpdateModel(model.id, { categories: newCats });
                              }}
                              title={meta.label}
                            >
                              {meta.icon} {meta.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Delete Provider Confirmation */}
      {confirmDeleteProvider && (
        <div className="provider-group-delete-dialog">
          <div className="provider-group-delete-text">
            {t("models.deleteProviderConfirm", { name: provider.name })}
          </div>
          <div className="provider-group-delete-actions">
            <button
              className="btn btn-xs"
              onClick={() => setConfirmDeleteProvider(false)}
            >
              {t("models.cancel")}
            </button>
            <button
              className="btn btn-xs btn-danger"
              onClick={() => {
                onDeleteProvider(provider.id);
                setConfirmDeleteProvider(false);
              }}
            >
              {t("common.delete")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
