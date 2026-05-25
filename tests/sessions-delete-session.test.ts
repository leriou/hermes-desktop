import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, existsSync } from "fs";

const { TEST_HOME } = vi.hoisted(() => {
  const path = require("path");
  const os = require("os");
  const home = path.join(
    os.tmpdir(),
    `hermes-delete-session-test-${Date.now()}`,
  );
  return {
    TEST_HOME: home,
  };
});

vi.mock("../src/main/installer", () => ({
  HERMES_HOME: TEST_HOME,
}));

// Mock rust-bridge to avoid native SQLite dependency
interface SessionData {
  id: string;
  source: string;
  started_at: number;
  ended_at: number | null;
  message_count: number;
  model: string;
  title: string | null;
}

const mockDb = {
  sessions: [] as SessionData[],
};

vi.mock("../src/main/rust-bridge", () => ({
  listSessionsFromRust: (_profile: string | undefined, limit: number, offset: number) => {
    return mockDb.sessions.slice(offset, offset + limit);
  },
  deleteSessionFromRust: (_profile: string | undefined, sessionId: string) => {
    const index = mockDb.sessions.findIndex(s => s.id === sessionId);
    if (index >= 0) {
      mockDb.sessions.splice(index, 1);
      return true;
    }
    return false;
  },
}));

vi.mock("../src/main/session-cache", () => ({
  removeSessionFromCache: vi.fn(),
}));

import { deleteSession, listSessions } from "../src/main/sessions";
import { removeSessionFromCache } from "../src/main/session-cache";

function seedDb(sessions: SessionData[]): void {
  mockDb.sessions = [...sessions];
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

describe("deleteSession", () => {
  it("deletes the session and all its messages from the database", () => {
    const now = Date.now();
    seedDb([
      {
        id: "session-to-delete",
        source: "cli",
        started_at: now - 1000,
        ended_at: now,
        message_count: 5,
        model: "gpt-4o",
        title: "Session to delete",
      },
      {
        id: "other-session",
        source: "cli",
        started_at: now - 500,
        ended_at: now,
        message_count: 3,
        model: "gpt-4o",
        title: "Other session",
      },
    ]);

    // Verify preconditions: both sessions exist
    const beforeSessions = listSessions();
    expect(beforeSessions).toHaveLength(2);
    expect(beforeSessions.map((s) => s.id).sort()).toEqual([
      "other-session",
      "session-to-delete",
    ]);

    // Perform deletion
    deleteSession("session-to-delete");

    // Verify: session is gone from database
    const afterSessions = listSessions();
    expect(afterSessions).toHaveLength(1);
    expect(afterSessions[0].id).toBe("other-session");

    // Verify: cache removal was also called
    expect(removeSessionFromCache).toHaveBeenCalledWith("session-to-delete");
  });

  it("does nothing when deleting a non-existent session", () => {
    seedDb([
      {
        id: "s1",
        source: "cli",
        started_at: Date.now(),
        ended_at: null,
        message_count: 1,
        model: "m",
        title: "t",
      },
    ]);

    const beforeSessions = listSessions();
    expect(beforeSessions).toHaveLength(1);

    // Deleting a non-existent session should not throw
    deleteSession("no-such-session");

    const afterSessions = listSessions();
    expect(afterSessions).toHaveLength(1);
    expect(afterSessions[0].id).toBe("s1");
    
    // Cache removal still called (defensive)
    expect(removeSessionFromCache).toHaveBeenCalledWith("no-such-session");
  });
});
