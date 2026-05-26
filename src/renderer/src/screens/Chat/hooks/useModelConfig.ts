import {
  getModelConfig,
  listModels,
  setModelConfig,
} from "@renderer/lib/hermes-tauri";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../../components/useI18n";
import type { ModelGroup } from "../types";

interface UseModelConfigResult {
  currentModel: string;
  currentProvider: string;
  currentBaseUrl: string;
  modelGroups: ModelGroup[];
  displayModel: string;
  reload: () => Promise<void>;
  selectModel: (
    provider: string,
    model: string,
    baseUrl: string,
  ) => Promise<void>;
}

export function useModelConfig(profile?: string): UseModelConfigResult {
  const { t } = useI18n();
  const [currentModel, setCurrentModel] = useState("");
  const [currentProvider, setCurrentProvider] = useState("auto");
  const [currentBaseUrl, setCurrentBaseUrl] = useState("");
  const [modelGroups, setModelGroups] = useState<ModelGroup[]>([]);
  // Guard: after selectModel, suppress reload overwrites until the
  // backend confirms the new model.
  const pendingSelection = useRef<{
    model: string;
    provider: string;
    baseUrl: string;
  } | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    const [mc, savedModels] = await Promise.all([
      getModelConfig(profile),
      listModels(),
    ]);
    const pending = pendingSelection.current;
    if (pending) {
      if (mc.model === pending.model) {
        pendingSelection.current = null;
        setCurrentModel(mc.model);
        setCurrentProvider(mc.provider);
        setCurrentBaseUrl(mc.baseUrl);
      }
    } else {
      setCurrentModel(mc.model);
      setCurrentProvider(mc.provider);
      setCurrentBaseUrl(mc.baseUrl);
    }
    setModelGroups(groupModelsByProvider(savedModels));
  }, [profile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  const selectModel = useCallback(
    async (provider: string, model: string, baseUrl: string): Promise<void> => {
      const effectiveBaseUrl = provider === "custom" ? baseUrl : "";
      pendingSelection.current = { model, provider, baseUrl: effectiveBaseUrl };
      setCurrentModel(model);
      setCurrentProvider(provider);
      setCurrentBaseUrl(effectiveBaseUrl);
      try {
        await setModelConfig(provider, model, effectiveBaseUrl, profile);
      } catch {
        // Optimistic update already applied; backend persistence best-effort
      }
    },
    [profile],
  );

  const displayModel = useMemo(() => {
    if (currentModel) {
      return currentModel.split("/").pop() || currentModel;
    }
    return currentProvider === "auto" ? t("chat.auto") : t("chat.noModel");
  }, [currentModel, currentProvider, t]);

  return {
    currentModel,
    currentProvider,
    currentBaseUrl,
    modelGroups,
    displayModel,
    reload,
    selectModel,
  };
}

function groupModelsByProvider(
  models: { provider: string; model: string; name: string; baseUrl?: string }[],
): ModelGroup[] {
  const groupMap = new Map<string, ModelGroup>();
  for (const m of models) {
    if (!groupMap.has(m.provider)) {
      groupMap.set(m.provider, {
        provider: m.provider,
        providerLabel: m.provider,
        models: [],
      });
    }
    groupMap.get(m.provider)!.models.push({
      provider: m.provider,
      model: m.model,
      label: m.name,
      baseUrl: m.baseUrl || "",
    });
  }
  return Array.from(groupMap.values());
}
