import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

vi.mock("@renderer/lib/hermes-tauri", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, any>;
  const mockExports: Record<string, any> = {};
  for (const key of Object.keys(actual)) {
    Object.defineProperty(mockExports, key, {
      get() {
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
