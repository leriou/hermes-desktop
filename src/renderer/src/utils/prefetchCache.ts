
import { getStoreItem, setStoreItem, removeStoreItem } from "./store";

interface CacheEntry<T> {
  data: T;
  ts: number;
  ttl: number;
}

const MAX_ENTRIES = 40;
const MAX_ENTRY_SIZE = 200_000;

const store = new Map<string, CacheEntry<unknown>>();
const LS_KEY = "hermes-prefetch-cache";

let loaded = false;

function loadFromLS(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = getStoreItem(LS_KEY);
    if (!raw) return;
    const entries: [string, { data: unknown; ts: number; ttl: number }][] =
      JSON.parse(raw);
    const now = Date.now();
    for (const [k, v] of entries) {
      if (now - v.ts < v.ttl) {
        store.set(k, v as CacheEntry<unknown>);
      }
    }
  } catch {
    /* corrupt or missing — start empty */
  }
}

function evict(): void {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now - v.ts >= v.ttl) store.delete(k);
  }
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
    else break;
  }
}

function persistToLS(): void {
  try {
    // Only persist entries that are still fresh and small enough.
    // Skip large payloads (messages arrays etc.) — they'd blow store quota.
    const now = Date.now();
    const entries: [string, CacheEntry<unknown>][] = [];
    let approxSize = 0;
    for (const [k, v] of store) {
      if (now - v.ts >= v.ttl) continue;
      const json = JSON.stringify(v.data);
      if (json.length > 4096) continue; // skip large values
      entries.push([k, v]);
      approxSize += json.length;
      if (approxSize > 512_000) break; // ~500KB cap
    }
    setStoreItem(LS_KEY, JSON.stringify(entries));
  } catch {
    /* storage full — ignore */
  }
}

export const cache = {
  /** Return cached data if fresh, otherwise call fetcher and cache the result. */
  async getOrFetch<T>(
    key: string,
    ttlMs: number,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    loadFromLS();
    const existing = store.get(key) as CacheEntry<T> | undefined;
    if (existing && Date.now() - existing.ts < existing.ttl) {
      return existing.data;
    }
    const data = await fetcher();
    try {
      const json = JSON.stringify(data);
      if (json.length <= MAX_ENTRY_SIZE) {
        store.set(key, { data, ts: Date.now(), ttl: ttlMs });
        evict();
        persistToLS();
      }
    } catch { /* not serializable — don't cache */ }
    return data;
  },

  /** Fire-and-forget: fetch and cache in background. No-op if already cached. */
  prefetch<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): void {
    loadFromLS();
    const existing = store.get(key);
    if (existing && Date.now() - existing.ts < existing.ttl) return;
    fetcher()
      .then((data) => {
        try {
          const json = JSON.stringify(data);
          if (json.length <= MAX_ENTRY_SIZE) {
            store.set(key, { data, ts: Date.now(), ttl: ttlMs });
            evict();
            persistToLS();
          }
        } catch { /* not serializable */ }
      })
      .catch(() => {
        /* prefetch failures are silent */
      });
  },

  /** Get cached value if available and fresh, without fetching. */
  get<T>(key: string): T | undefined {
    loadFromLS();
    const entry = store.get(key) as CacheEntry<T> | undefined;
    if (!entry || Date.now() - entry.ts >= entry.ttl) return undefined;
    return entry.data;
  },

  /** Manually set a cache entry (e.g. after a mutation returns fresh data). */
  set<T>(key: string, data: T, ttlMs: number): void {
    try {
      const json = JSON.stringify(data);
      if (json.length > MAX_ENTRY_SIZE) return;
    } catch { return; }
    store.set(key, { data, ts: Date.now(), ttl: ttlMs });
    evict();
    persistToLS();
  },

  /** Invalidate one key or all keys matching a prefix. */
  invalidate(keyOrPrefix: string): void {
    if (keyOrPrefix.endsWith(":")) {
      for (const k of store.keys()) {
        if (k.startsWith(keyOrPrefix)) store.delete(k);
      }
    } else {
      store.delete(keyOrPrefix);
    }
    persistToLS();
  },

  /** Clear everything. */
  clear(): void {
    store.clear();
    try {
      removeStoreItem(LS_KEY);
    } catch {
      /* ignore */
    }
  },
};

/**
 * Hook-friendly helper: returns a stable function that fetches with cache.
 * Invalidates automatically after a mutation.
 *
 * Usage:
 *   const loadModels = useCachedLoader("models", 30_000, () => api.listModels());
 *   // In useEffect:
 *   const data = await loadModels();
 *   // After mutation:
 *   cache.invalidate("models");
 */
export function cachedLoader<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): () => Promise<T> {
  return () => cache.getOrFetch(key, ttlMs, fetcher);
}
