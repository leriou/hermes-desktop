import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "path";
import { mkdirSync, rmSync, existsSync } from "fs";

const { TEST_HOME } = vi.hoisted(() => {
  const path = require("path");
  const os = require("os");
  return {
    TEST_HOME: path.join(
      os.tmpdir(),
      `hermes-session-cache-test-${Date.now()}`,
    ),
  };
});

vi.mock("../src/main/installer", () => ({
  HERMES_HOME: TEST_HOME,
  HERMES_PYTHON: "/usr/bin/python3",
  HERMES_SCRIPT: "/dev/null",
  hermesCliArgs: (args: string[] = []) => ["/dev/null", ...args],
  getEnhancedPath: () => process.env.PATH || "",
}));

vi.mock("../src/shared/i18n", () => ({
  t: (key: string) => key,
}));
vi.mock("../src/main/locale", () => ({
  getAppLocale: () => "en",
}));

// Mock rust-bridge to avoid native SQLite dependency and handle the test state
interface SessionData {
  id: string;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
  title: string | null;
  firstUserMessage?: string;
}

const mockDb = {
  sessions: [] as SessionData[],
};

vi.mock("../src/main/rust-bridge", () => ({
  syncSessionIdsFromRust: vi.fn((_profile: string, sinceTs: number) => {
    return mockDb.sessions.filter(s => s.startedAt > sinceTs);
  }),
  getFirstUserMessageFromRust: vi.fn((_profile: string, sessionId: string) => {
    const session = mockDb.sessions.find(s => s.id === sessionId);
    return session?.firstUserMessage || null;
  }),
  refreshMessageCountsFromRust: vi.fn((_profile: string, ids: string[]) => {
    const result: Record<string, number> = {};
    for (const id of ids) {
      const session = mockDb.sessions.find(s => s.id === id);
      if (session) {
        result[id] = session.messageCount;
      }
    }
    return result;
  }),
}));

import { syncSessionCache } from "../src/main/session-cache";
import { syncSessionIdsFromRust } from "../src/main/rust-bridge";

function seedDb(
  sessions: Array<{
    id: string;
    started_at: number;
    source?: string;
    message_count?: number;
    model?: string;
    title?: string | null;
    firstUserMessage?: string;
  }>,
): void {
  mockDb.sessions = sessions.map(s => ({
    id: s.id,
    startedAt: s.started_at,
    source: s.source || "cli",
    messageCount: s.message_count || 0,
    model: s.model || "gpt-4o",
    title: s.title || null,
    firstUserMessage: s.firstUserMessage,
  }));
}

beforeEach(() => {
  mkdirSync(TEST_HOME, { recursive: true });
  mockDb.sessions = [];
});

afterEach(() => {
  if (existsSync(TEST_HOME)) {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

describe("syncSessionCache", () => {
  it("returns an empty list when no DB exists yet", () => {
    expect(syncSessionCache()).toEqual([]);
  });

  it("on first sync, ingests all sessions and generates titles", () => {
    const now = Math.floor(Date.now() / 1000);
    seedDb([
      {
        id: "s1",
        started_at: now,
        message_count: 2,
        firstUserMessage: "How do I write a Python decorator?",
      },
      {
        id: "s2",
        started_at: now + 10,
        message_count: 5,
        firstUserMessage: "What is the capital of France?",
      },
    ]);

    const result = syncSessionCache();
    expect(result).toHaveLength(2);
    // Sorted by startedAt DESC
    expect(result[0].id).toBe("s2");
    expect(result[0].title).toBe("What is the capital of France?");
    expect(result[1].id).toBe("s1");
    expect(result[1].title).toBe("How do I write a Python decorator?");
  });

  it("updates messageCount on existing sessions without duplicating them (issue #16 regression)", () => {
    const now = Math.floor(Date.now() / 1000);
    seedDb([{ id: "s1", started_at: now, message_count: 1 }]);

    // First sync
    syncSessionCache();

    // Update message count in DB
    seedDb([{ id: "s1", started_at: now, message_count: 9 }]);

    const result = syncSessionCache();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("s1");
    expect(result[0].messageCount).toBe(9);
  });

  it("appends new sessions on subsequent syncs without losing old ones", () => {
    const now = Math.floor(Date.now() / 1000);
    seedDb([{ id: "s1", started_at: now, message_count: 1 }]);
    syncSessionCache();

    // Add another session
    seedDb([
      { id: "s1", started_at: now, message_count: 1 },
      { id: "s2", started_at: now + 10, message_count: 1 },
    ]);
    const result = syncSessionCache();

    expect(result.map((r) => r.id)).toEqual(["s2", "s1"]);
  });

  it("refreshes messageCount for old sessions outside the lastSync window (issue #226)", () => {
    const now = Math.floor(Date.now() / 1000);

    // Initial state: session s1 has 1 message.
    seedDb([{ id: "s1", started_at: now - 1000, message_count: 1 }]);

    // First sync acquires the session at messageCount: 1.
    const first = syncSessionCache();
    expect(first).toHaveLength(1);
    expect(first[0].messageCount).toBe(1);

    // Update s1 to have 5 messages in the DB.
    seedDb([{ id: "s1", started_at: now - 1000, message_count: 5 }]);

    // Second sync: syncSessionIdsFromRust is called with sinceTs ≈ now.
    // s1 (started at now-1000) won't be in the 'new/recently updated' rows.
    // BUT syncSessionCache should detect s1 is in cache but NOT in rows,
    // and call refreshMessageCountsFromRust for it.
    const second = syncSessionCache();
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe("s1");
    expect(second[0].messageCount).toBe(5);
  });

  it("refreshes some old, leaves others untouched, all in one sync", () => {
    const now = Math.floor(Date.now() / 1000);

    // Initial cache state (pre-sync)
    seedDb([
      { id: "old-a", started_at: now - 5000, message_count: 10 },
      { id: "old-b", started_at: now - 4000, message_count: 20 },
    ]);
    syncSessionCache();

    // DB state for next sync:
    // 1. "new-c" is brand new
    // 2. "old-a" message count changed (50)
    // 3. "old-b" message count changed (25)
    seedDb([
      { id: "old-a", started_at: now - 5000, message_count: 50 },
      { id: "old-b", started_at: now - 4000, message_count: 25 },
      { id: "new-c", started_at: now, message_count: 7 },
    ]);

    // We simulate a window where syncSessionIdsFromRust ONLY returns the brand new one.
    // The others must be picked up by the 'stale check' (refreshMessageCountsFromRust).
    vi.mocked(syncSessionIdsFromRust).mockReturnValueOnce([
      { id: "new-c", startedAt: now, source: "cli", messageCount: 7, model: "m", title: "new" }
    ]);

    const result = syncSessionCache();
    expect(result).toHaveLength(3);

    const byId = new Map(result.map((r) => [r.id, r] as const));
    expect(byId.get("old-a")?.messageCount).toBe(50);
    expect(byId.get("old-b")?.messageCount).toBe(25);
    expect(byId.get("new-c")?.messageCount).toBe(7);
  });

  it("handles a large existing cache without quadratic blowup (issue #16)", () => {
    const now = Math.floor(Date.now() / 1000);
    const N = 1500;

    // Build a large initial cache
    const initialSessions = [];
    for (let i = 0; i < N; i++) {
      initialSessions.push({ id: `s${i}`, started_at: now - i, message_count: 1 });
    }
    seedDb(initialSessions);
    syncSessionCache();

    // Now update ALL of them
    const updatedSessions = [];
    for (let i = 0; i < N; i++) {
      updatedSessions.push({ id: `s${i}`, started_at: now - i, message_count: 2 });
    }
    seedDb(updatedSessions);

    const start = Date.now();
    const result = syncSessionCache();
    const elapsed = Date.now() - start;

    expect(result).toHaveLength(N);
    expect(result.every((r) => r.messageCount === 2)).toBe(true);
    expect(elapsed).toBeLessThan(500);
  });
});
