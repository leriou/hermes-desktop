import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const preloadSrc = readFileSync(join(ROOT, "src/preload/index.ts"), "utf-8");

/**
 * Extract all IPC channel names from a source string.
 */
function extractIpcHandleChannels(src: string): string[] {
  const channels: string[] = [];
  const re = /ipcMain\.handle\(\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    channels.push(m[1]);
  }
  return [...new Set(channels)];
}

/**
 * Collect IPC handlers from index.ts + all ipc/register-*.ts modules.
 */
function collectAllMainChannels(): string[] {
  const channels: string[] = [];
  // index.ts (setupUpdater)
  channels.push(...extractIpcHandleChannels(readFileSync(join(ROOT, "src/main/index.ts"), "utf-8")));
  // ipc/ modules
  const ipcDir = join(ROOT, "src/main/ipc");
  for (const f of readdirSync(ipcDir)) {
    if (f.startsWith("register-") && f.endsWith(".ts")) {
      channels.push(...extractIpcHandleChannels(readFileSync(join(ipcDir, f), "utf-8")));
    }
  }
  return [...new Set(channels)];
}

/**
 * Extract all ipcRenderer.invoke channel names from preload.
 */
function extractPreloadInvokeChannels(src: string): string[] {
  const channels: string[] = [];
  const re = /ipcRenderer\.invoke\(\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    channels.push(m[1]);
  }
  return [...new Set(channels)];
}

const mainChannels = collectAllMainChannels();
const preloadChannels = extractPreloadInvokeChannels(preloadSrc);

describe("IPC Handler ↔ Preload Consistency", () => {
  it("main process registers IPC handlers", () => {
    expect(mainChannels.length).toBeGreaterThan(30);
  });

  it("preload invokes IPC channels", () => {
    expect(preloadChannels.length).toBeGreaterThan(30);
  });

  it("every preload invoke has a matching main handler", () => {
    // Routed through TUI gateway, not direct IPC
    const tuiRouted = ["send-message", "abort-chat"];
    const missing = preloadChannels.filter(
      (ch) => !mainChannels.includes(ch) && !tuiRouted.includes(ch),
    );
    expect(missing).toEqual([]);
  });

  it("every main handler has a matching preload invoke", () => {
    const missing = mainChannels.filter((ch) => !preloadChannels.includes(ch));
    expect(missing).toEqual([]);
  });
});

// ─── New feature handlers registered ────────────────────

describe("New IPC handlers from v0.8/v0.9 features", () => {
  const newChannels = [
    "run-hermes-backup",
    "run-hermes-import",
    "read-logs",
    "run-hermes-dump",
    "list-mcp-servers",
    "discover-memory-providers",
  ];

  for (const ch of newChannels) {
    it(`main has handler: ${ch}`, () => {
      expect(mainChannels).toContain(ch);
    });

    it(`preload invokes: ${ch}`, () => {
      expect(preloadChannels).toContain(ch);
    });
  }
});

// ─── Legacy handlers still present ──────────────────────

describe("Legacy IPC handlers preserved", () => {
  const legacyChannels = [
    "check-install",
    "start-install",
    "get-hermes-version",
    "run-hermes-doctor",
    "run-hermes-update",
    "get-env",
    "set-env",
    "get-config",
    "set-config",
    "get-model-config",
    "set-model-config",
    "start-gateway",
    "stop-gateway",
    "gateway-status",
    "get-platform-enabled",
    "set-platform-enabled",
    "list-sessions",
    "get-session-messages",
    "list-profiles",
    "create-profile",
    "list-cron-jobs",
    "create-cron-job",
    "open-external",
  ];

  for (const ch of legacyChannels) {
    it(`${ch} handler still registered`, () => {
      expect(mainChannels).toContain(ch);
    });
  }
});
