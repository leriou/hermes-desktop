import { LazyStore } from "@tauri-apps/plugin-store";

let tauriStore: LazyStore | null = null;
const cache: Record<string, string> = {};
let initialized = false;

const isTauri =
  typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;

export async function initStore(): Promise<void> {
  if (initialized) return;

  if (isTauri) {
    try {
      tauriStore = new LazyStore(".settings.json");
      const entries = (await tauriStore.entries()) as [string, unknown][];
      for (const [k, v] of entries) {
        cache[k] = typeof v === "string" ? v : JSON.stringify(v);
      }
    } catch (e) {
      console.error(
        "[Store] Failed to initialize tauri-plugin-store, falling back to localStorage",
        e,
      );
      tauriStore = null;
    }
  }

  // Fallback to localStorage: populate cache
  if (!tauriStore) {
    if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            cache[key] = localStorage.getItem(key) || "";
          }
        }
      } catch (e) {
        console.warn(
          "[Store] localStorage is not accessible in this context",
          e,
        );
      }
    }
  }

  initialized = true;
}

export function getStoreItem(key: string, fallback: string = ""): string {
  if (
    !initialized &&
    typeof window !== "undefined" &&
    typeof localStorage !== "undefined"
  ) {
    try {
      return localStorage.getItem(key) || fallback;
    } catch {
      return fallback;
    }
  }
  return cache[key] !== undefined ? cache[key] : fallback;
}

export function setStoreItem(key: string, value: string): void {
  cache[key] = value;

  if (tauriStore) {
    tauriStore
      .set(key, value)
      .then(() => {
        tauriStore?.save();
      })
      .catch((err) => {
        console.error("[Store] set failed", err);
      });
  } else if (
    typeof window !== "undefined" &&
    typeof localStorage !== "undefined"
  ) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn("[Store] localStorage setItem failed", e);
    }
  }
}

export function removeStoreItem(key: string): void {
  delete cache[key];

  if (tauriStore) {
    tauriStore
      .delete(key)
      .then(() => {
        tauriStore?.save();
      })
      .catch((err) => {
        console.error("[Store] delete failed", err);
      });
  } else if (
    typeof window !== "undefined" &&
    typeof localStorage !== "undefined"
  ) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn("[Store] localStorage removeItem failed", e);
    }
  }
}
