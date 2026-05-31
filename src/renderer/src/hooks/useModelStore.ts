import { useState, useEffect, useCallback, useRef } from "react";
import {
  readModelStore,
  writeModelStore,
  registerProvider,
  unregisterProvider,
  saveModel as saveModelIpc,
  deleteModel as deleteModelIpc,
} from "@renderer/lib/hermes-tauri";
import type {
  ModelConfigStore,
  ClientProvider,
  ClientModel,
  RegisterProviderInput,
  SaveModelInput,
} from "@renderer/lib/model-types";

export interface UseModelStoreResult {
  store: ModelConfigStore;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  addProvider: (input: RegisterProviderInput) => Promise<ClientProvider | null>;
  removeProvider: (providerId: string) => Promise<boolean>;
  addModel: (input: SaveModelInput) => Promise<ClientModel | null>;
  updateModel: (modelId: string, input: Partial<SaveModelInput>) => Promise<ClientModel | null>;
  removeModel: (modelId: string, providerId: string) => Promise<boolean>;
}

const EMPTY_STORE: ModelConfigStore = {
  version: 1,
  defaultModel: "",
  providers: {},
  models: {},
};

export function useModelStore(profile: string = "default"): UseModelStoreResult {
  const [store, setStore] = useState<ModelConfigStore>(EMPTY_STORE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const storeRef = useRef<ModelConfigStore>(EMPTY_STORE);
  const mountedRef = useRef(true);

  // Keep ref in sync with state
  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  // Load store from disk
  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await readModelStore(profile);
      if (mountedRef.current) {
        setStore(result);
        storeRef.current = result;
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err?.message || String(err));
        // Keep previous store state on error
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [profile]);

  // Sync store to disk
  const syncToDisk = useCallback(
    async (updatedStore: ModelConfigStore) => {
      try {
        const result = await writeModelStore(updatedStore, profile);
        if (mountedRef.current) {
          setStore(result);
          storeRef.current = result;
        }
        return result;
      } catch (err: any) {
        if (mountedRef.current) {
          setError(err?.message || String(err));
        }
        // Revert to last known good state
        if (mountedRef.current) {
          setStore(storeRef.current);
        }
        throw err;
      }
    },
    [profile],
  );

  // Load on mount
  useEffect(() => {
    mountedRef.current = true;
    reload();
    return () => {
      mountedRef.current = false;
    };
  }, [reload]);

  // ── Mutations ──

  const addProvider = useCallback(
    async (input: RegisterProviderInput): Promise<ClientProvider | null> => {
      try {
        const provider = await registerProvider(input, profile);
        await reload();
        return provider;
      } catch (err: any) {
        if (mountedRef.current) {
          setError(err?.message || String(err));
        }
        return null;
      }
    },
    [profile, reload],
  );

  const removeProvider = useCallback(
    async (providerId: string): Promise<boolean> => {
      try {
        await unregisterProvider(providerId, profile);
        await reload();
        return true;
      } catch (err: any) {
        if (mountedRef.current) {
          setError(err?.message || String(err));
        }
        return false;
      }
    },
    [profile, reload],
  );

  const addModel = useCallback(
    async (input: SaveModelInput): Promise<ClientModel | null> => {
      try {
        const model = await saveModelIpc(input, profile);
        await reload();
        return model;
      } catch (err: any) {
        if (mountedRef.current) {
          setError(err?.message || String(err));
        }
        return null;
      }
    },
    [profile, reload],
  );

  const updateModel = useCallback(
    async (
      modelId: string,
      input: Partial<SaveModelInput>,
    ): Promise<ClientModel | null> => {
      try {
        // Merge existing model data with update
        const existing = storeRef.current.models[modelId];
        if (!existing) {
          throw new Error(`Model ${modelId} not found`);
        }
        const mergedInput: SaveModelInput = {
          providerId: input.providerId ?? existing.providerId,
          modelId: input.modelId ?? existing.modelId,
          alias: input.alias !== undefined ? input.alias : existing.alias,
          categories:
            input.categories !== undefined
              ? input.categories
              : existing.categories,
          contextLength:
            input.contextLength !== undefined
              ? input.contextLength
              : existing.contextLength,
          discovered:
            input.discovered !== undefined
              ? input.discovered
              : existing.discovered,
        };
        const model = await saveModelIpc(mergedInput, profile);
        await reload();
        return model;
      } catch (err: any) {
        if (mountedRef.current) {
          setError(err?.message || String(err));
        }
        return null;
      }
    },
    [profile, reload],
  );

  const removeModel = useCallback(
    async (modelId: string, providerId: string): Promise<boolean> => {
      try {
        await deleteModelIpc(modelId, providerId, profile);
        await reload();
        return true;
      } catch (err: any) {
        if (mountedRef.current) {
          setError(err?.message || String(err));
        }
        return false;
      }
    },
    [profile, reload],
  );

  return {
    store,
    loading,
    error,
    reload,
    addProvider,
    removeProvider,
    addModel,
    updateModel,
    removeModel,
  };
}
