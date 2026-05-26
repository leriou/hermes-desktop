import {
  getModelAliases,
  getModelConfig,
  listModels,
  setModelConfig,
} from "@renderer/lib/hermes-tauri";
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
  // Guard: after selectAlias/selectModel, suppress reload overwrites until the
  // backend confirms the new model.  A simple boolean was too eager — a second
  // reload (e.g. from a gateway event) could consume the guard and clobber the
  // user's choice with a stale value.  Instead we store the pending selection
  // and only clear it when getModelConfig() returns the expected model.
  const pendingSelection = useRef<{
    model: string;
    provider: string;
    baseUrl: string;
  } | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    const [mc, savedModels, savedAliases] = await Promise.all([
      getModelConfig(profile),
      listModels(),
      getModelAliases(),
    ]);
    const pending = pendingSelection.current;
    if (pending) {
      // Backend caught up — clear guard and accept the confirmed value.
      if (mc.model === pending.model) {
        pendingSelection.current = null;
        setCurrentModel(mc.model);
        setCurrentProvider(mc.provider);
        setCurrentBaseUrl(mc.baseUrl);
      }
      // else: backend still stale, keep optimistic values untouched.
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

  const selectAlias = useCallback(
    async (alias: ModelAlias): Promise<void> => {
      const provider = alias.provider || "custom";
      pendingSelection.current = {
        model: alias.model,
        provider,
        baseUrl: alias.baseUrl,
      };
      setCurrentModel(alias.model);
      setCurrentProvider(provider);
      setCurrentBaseUrl(alias.baseUrl);
      try {
        await setModelConfig(provider, alias.model, alias.baseUrl, profile);
      } catch {
        // Optimistic update already applied; backend persistence best-effort
      }
    },
    [profile],
  );

  const displayModel = useMemo(() => {
    if (currentModel) {
      const match = aliases.find(
        (a) =>
          a.model === currentModel &&
          (!currentBaseUrl || a.baseUrl === currentBaseUrl),
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
