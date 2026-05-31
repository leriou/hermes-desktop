import { useMemo } from "react";
import { useI18n } from "../../components/useI18n";
import ProviderGroup from "./ProviderGroup";
import type {
  ClientProvider,
  ClientModel,
  BusinessCategory,
} from "../../lib/model-types";

interface ModelsListProps {
  providers: ClientProvider[];
  models: ClientModel[];
  profile?: string;
  onAddProvider: () => void;
  onDiscoverModels: (providerId: string, modelIds: string[]) => Promise<void>;
  onDeleteProvider: (providerId: string) => void;
  onDeleteModel: (modelId: string) => void;
  onUpdateModel: (modelId: string, updates: { alias?: string; categories?: BusinessCategory[]; contextLength?: number }) => Promise<void>;
}

export default function ModelsList({
  providers,
  models,
  profile = "default",
  onAddProvider,
  onDiscoverModels,
  onDeleteProvider,
  onDeleteModel,
  onUpdateModel,
}: ModelsListProps) {
  const { t } = useI18n();

  // Build a map of providerId → models
  const modelsByProvider = useMemo(() => {
    const map: Record<string, ClientModel[]> = {};
    for (const m of models) {
      if (!map[m.providerId]) {
        map[m.providerId] = [];
      }
      map[m.providerId].push(m);
    }
    return map;
  }, [models]);

  // Build a set of modelId strings per provider for "already added" checks
  const existingModelIdsByProvider = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const m of models) {
      if (!map[m.providerId]) {
        map[m.providerId] = new Set();
      }
      map[m.providerId].add(m.modelId);
    }
    return map;
  }, [models]);

  if (providers.length === 0) {
    return (
      <div className="models-empty">
        <p className="models-empty-text">{t("models.noProviders")}</p>
        <p className="models-empty-hint">{t("models.noProvidersHint")}</p>
        <button className="btn btn-primary" onClick={onAddProvider} style={{ marginTop: 12 }}>
          + {t("models.addProvider")}
        </button>
      </div>
    );
  }

  return (
    <div className="models-list">
      {providers.map((provider) => (
        <ProviderGroup
          key={provider.id}
          provider={provider}
          models={modelsByProvider[provider.id] || []}
          allModels={models}
          profile={profile}
          existingModelIds={existingModelIdsByProvider[provider.id] || new Set()}
          onDiscoverModels={(modelIds) => onDiscoverModels(provider.id, modelIds)}
          onDeleteProvider={onDeleteProvider}
          onDeleteModel={onDeleteModel}
          onUpdateModel={onUpdateModel}
        />
      ))}
    </div>
  );
}
