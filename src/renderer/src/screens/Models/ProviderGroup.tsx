import { useState, useMemo, useCallback } from "react";
import { Plus, RefreshCw as Refresh, ChevronDown, ChevronRight } from "lucide-react";
import { Trash, Pencil } from "../../assets/icons";
import { useI18n } from "../../components/useI18n";
import { useDiscoveredModels } from "../../hooks/useDiscoveredModels";
import { CATEGORY_META } from "../../lib/model-types";
import type {
  ClientProvider,
  ClientModel,
  BusinessCategory,
} from "../../lib/model-types";
import BrandLogo from "../../components/common/BrandLogo";

interface ProviderGroupProps {
  provider: ClientProvider;
  models: ClientModel[];
  profile?: string;
  existingModelIds: Set<string>; // modelId strings already in this provider
  onDiscoverModels: (modelIds: string[]) => Promise<void>;
  onDeleteProvider: (providerId: string) => void;
  onEditModel: (model: ClientModel) => void;
  onDeleteModel: (modelId: string) => void;
  onToggleCollapse?: () => void;
  collapsed?: boolean;
}

export default function ProviderGroup({
  provider,
  models,
  profile = "default",
  existingModelIds,
  onDiscoverModels,
  onDeleteProvider,
  onEditModel,
  onDeleteModel,
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

  const collapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;
  const toggle = onToggleCollapse || (() => setInternalCollapsed((v) => !v));

  const discovery = useDiscoveredModels({
    provider: provider.providerKey,
    baseUrl: provider.baseUrl,
    profile,
    enabled: showDiscovery,
    refreshToken: discoveryRefresh,
  });

  // Filter out models already added
  const undiscoveredModels = useMemo(() => {
    return discovery.models.filter((m) => !existingModelIds.has(m));
  }, [discovery.models, existingModelIds]);

  // Check if a model is being added or has been added
  const isModelAdding = useCallback(
    (modelId: string) => addingModelIds.has(modelId),
    [addingModelIds],
  );

  const isModelAdded = useCallback(
    (modelId: string) => addedModelIds.has(modelId) || existingModelIds.has(modelId),
    [addedModelIds, existingModelIds],
  );

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
              {models.map((model) => (
                <div key={model.id} className="provider-model-row">
                  <div className="provider-model-info">
                    <span className="provider-model-id">{model.modelId}</span>
                    {model.alias && (
                      <span className="provider-model-alias">
                        ({model.alias})
                      </span>
                    )}
                    {model.discovered && (
                      <span className="provider-model-tag provider-model-tag--discovered">
                        已发现
                      </span>
                    )}
                    {!model.discovered && (
                      <span className="provider-model-tag provider-model-tag--manual">
                        手动
                      </span>
                    )}
                    {model.categories.length > 0 && (
                      <div className="provider-model-categories">
                        {model.categories.map((cat: BusinessCategory) => {
                          const meta = CATEGORY_META[cat];
                          return (
                            <span
                              key={cat}
                              className="provider-model-category-chip"
                              style={{
                                backgroundColor: `${meta.color}20`,
                                color: meta.color,
                                borderColor: meta.color,
                              }}
                              title={meta.labelKey}
                            >
                              {meta.icon}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {model.contextLength > 0 && (
                      <span className="provider-model-context">
                        {model.contextLength.toLocaleString()} tokens
                      </span>
                    )}
                  </div>
                  <div className="provider-model-actions">
                    <button
                      className="btn-ghost btn-xs"
                      onClick={() => onEditModel(model)}
                      title={t("models.editModel")}
                    >
                      <Pencil size={14} />
                    </button>
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
              ))}
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
