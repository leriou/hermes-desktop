import { getModelAliases, getModelConfig, listModels, setModelConfig } from "@renderer/lib/hermes-tauri";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../../components/useI18n";
import type { ModelGroup } from "../types";

interface ModelAlias {
  name: string;
  model: string;
  provider: string;
  baseUrl: string;
  contextLength?: number;
}

interface UseModelConfigResult {
  currentModel: string;
  currentProvider: string;
  currentBaseUrl: string;
  modelGroups: ModelGroup[];
  displayModel: string;
  aliases: ModelAlias[];
  reload: () => Promise<void>;
  selectModel: (
    provider: string,
    model: string,
    baseUrl: string,
  ) => Promise<void>;
  selectAlias: (alias: ModelAlias) => Promise<void>;
}

export function useModelConfig(profile?: string): UseModelConfigResult {
  const { t } = useI18n();
  const [currentModel, setCurrentModel] = useState("");
  const [currentProvider, setCurrentProvider] = useState("auto");
  const [currentBaseUrl, setCurrentBaseUrl] = useState("");
  const [modelGroups, setModelGroups] = useState<ModelGroup[]>([]);
  const [aliases, setAliases] = useState<ModelAlias[]>([]);
  // Guard: after selectAlias/selectModel, suppress the next reload's
  // state overwrite so the gateway's stale model.options doesn't clobber
  // the user's explicit choice.
  const selectionGuard = useRef(false);

  const reload = useCallback(async (): Promise<void> => {
    const [mc, savedModels, savedAliases] = await Promise.all([
      getModelConfig(profile),
      listModels(),
      getModelAliases(),
    ]);
    if (selectionGuard.current) {
      selectionGuard.current = false;
    } else {
      setCurrentModel(mc.model);
      setCurrentProvider(mc.provider);
      setCurrentBaseUrl(mc.baseUrl);
    }
    setModelGroups(groupModelsByProvider(savedModels));
    setAliases(savedAliases || []);
  }, [profile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  const selectModel = useCallback(
    async (provider: string, model: string, baseUrl: string): Promise<void> => {
      const effectiveBaseUrl = provider === "custom" ? baseUrl : "";
      await setModelConfig(
        provider,
        model,
        effectiveBaseUrl,
        profile,
      );
      selectionGuard.current = true;
      setCurrentModel(model);
      setCurrentProvider(provider);
      setCurrentBaseUrl(effectiveBaseUrl);
    },
    [profile],
  );

  const selectAlias = useCallback(
    async (alias: ModelAlias): Promise<void> => {
      await setModelConfig(
        alias.provider || "custom",
        alias.model,
        alias.baseUrl,
        profile,
      );
      selectionGuard.current = true;
      setCurrentModel(alias.model);
      setCurrentProvider(alias.provider || "custom");
      setCurrentBaseUrl(alias.baseUrl);
    },
    [profile],
  );

  const displayModel = useMemo(() => {
    if (currentModel) {
      const match = aliases.find(
        (a) => a.model === currentModel && (!currentBaseUrl || a.baseUrl === currentBaseUrl),
      );
      if (match) return match.name;
      return currentModel.split("/").pop() || currentModel;
    }
    return currentProvider === "auto" ? t("chat.auto") : t("chat.noModel");
  }, [currentModel, currentProvider, currentBaseUrl, aliases, t]);

  return {
    currentModel,
    currentProvider,
    currentBaseUrl,
    modelGroups,
    displayModel,
    aliases,
    reload,
    selectModel,
    selectAlias,
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
