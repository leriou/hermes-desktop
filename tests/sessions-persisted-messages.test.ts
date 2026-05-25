import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const { TEST_HOME } = vi.hoisted(() => {
  const path = require("path");
  const os = require("os");
  return {
    TEST_HOME: path.join(
      os.tmpdir(),
      `hermes-persisted-messages-test-${Date.now()}`,
    ),
  };
});

vi.mock("../src/main/installer", () => ({
  HERMES_HOME: TEST_HOME,
}));

import {
  loadPersistedMessages,
  migratePersistedMessages,
  persistMessage,
} from "../src/main/sessions";

beforeEach(() => {
  mkdirSync(TEST_HOME, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_HOME)) {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

describe("migratePersistedMessages", () => {
  it("moves persisted transcript rows to the continuation sid when target is empty", () => {
    persistMessage("runtime-a", "user", "hello");
    persistMessage("runtime-a", "assistant", "world");

    migratePersistedMessages("runtime-a", "db-a");

    expect(loadPersistedMessages("runtime-a")).toEqual([]);
    expect(loadPersistedMessages("db-a").map((m) => m.content)).toEqual([
      "hello",
      "world",
    ]);
  });

  it("does not overwrite an existing target transcript", () => {
    persistMessage("runtime-a", "user", "old");
    persistMessage("db-a", "assistant", "existing");

    migratePersistedMessages("runtime-a", "db-a");

    expect(loadPersistedMessages("runtime-a").map((m) => m.content)).toEqual([
      "old",
    ]);
    expect(loadPersistedMessages("db-a").map((m) => m.content)).toEqual([
      "existing",
    ]);
  });
});
