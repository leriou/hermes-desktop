import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

vi.mock("@renderer/lib/hermes-tauri", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, any>;
  const mockExports: Record<string, any> = {};
  const cache = new Map<string, any>();
  for (const key of Object.keys(actual)) {
    Object.defineProperty(mockExports, key, {
      get() {
        if (typeof actual[key] === "function") {
          if (!cache.has(key)) {
            const mockFn = vi.fn().mockImplementation((...args: any[]) => {
              const globalApi = (window as any).hermesAPI;
              if (globalApi && typeof globalApi[key] === "function") {
                return globalApi[key](...args);
              }
              return Promise.resolve(undefined);
            });
            cache.set(key, mockFn);
          }
          return cache.get(key);
        }
        return actual[key];
      },
      enumerable: true,
      configurable: true,
    });
  }
  return mockExports;
});

afterEach(() => {
  cleanup();
});
