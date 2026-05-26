import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Initialize empty window.hermesAPI mock object for test environment
(window as any).hermesAPI = {};

vi.mock("@renderer/lib/hermes-tauri", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, any>;
  const mockExports: Record<string, any> = {};
  for (const key of Object.keys(actual)) {
    Object.defineProperty(mockExports, key, {
      get() {
        const val = (window as any).hermesAPI[key];
        if (val !== undefined) {
          return val;
        }
        if (typeof actual[key] === "function") {
          return vi.fn().mockResolvedValue(undefined);
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
