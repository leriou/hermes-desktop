import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  profileHome,
  getActiveProfileNameSync,
  safeWriteFile,
} from "./utils";
import { t } from "../shared/i18n";
import { getAppLocale } from "./locale";
import {
  syncSessionIdsFromRust,
  getFirstUserMessageFromRust,
  refreshMessageCountsFromRust,
} from "./rust-bridge";

/**
 * The session cache lives alongside its own profile's data so profiles
 * don't share a single cache file. The default profile keeps
 * ~/.hermes/desktop/sessions.json; named profiles use
 * ~/.hermes/profiles/<name>/desktop/sessions.json (issue #311).
 */
function cacheFilePath(): string {
  return join(
    profileHome(getActiveProfileNameSync()),
    "desktop",
    "sessions.json",
  );
}

export interface CachedSession {
  id: string;
  title: string;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
}

interface CacheData {
  sessions: CachedSession[];
  lastSync: number;
}

// Generate a short, readable title from the first user message (like ChatGPT/Claude)
function generateTitle(message: string): string {
  if (!message || !message.trim())
    return t("sessions.newConversation", getAppLocale());

  // Clean up the message
  let text = message.trim();

  // Remove markdown formatting
  text = text.replace(/[#*_`~[\]()]/g, "");
  // Remove URLs
  text = text.replace(/https?:\/\/\S+/g, "");
  // Remove extra whitespace
  text = text.replace(/\s+/g, " ").trim();

  if (!text) return t("sessions.newConversation", getAppLocale());

  // If short enough, use as-is
  if (text.length <= 50) return text;

  // Take first meaningful chunk — aim for ~40-50 chars at word boundary
  const words = text.split(" ");
  let title = "";
  for (const word of words) {
    if ((title + " " + word).trim().length > 45) break;
    title = (title + " " + word).trim();
  }

  return title || text.slice(0, 45) + "...";
}

function readCache(): CacheData {
  const file = cacheFilePath();
  try {
    if (!existsSync(file)) return { sessions: [], lastSync: 0 };
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return { sessions: [], lastSync: 0 };
  }
}

function writeCache(data: CacheData): void {
  try {
    safeWriteFile(cacheFilePath(), JSON.stringify(data));
  } catch {
    // non-fatal
  }
}

// Sync from hermes DB to local cache — only fetches new/updated sessions
export function syncSessionCache(): CachedSession[] {
  const cache = readCache();
  const profile = getActiveProfileNameSync();

  try {
    const rows = syncSessionIdsFromRust(
      profile,
      cache.lastSync > 0 ? cache.lastSync - 300 : 0,
    );

    // Index existing sessions by id for O(1) lookups
    const existingById = new Map<string, CachedSession>();
    for (const s of cache.sessions) existingById.set(s.id, s);
    const newSessions: CachedSession[] = [];

    const refreshedIds = new Set<string>();
    for (const row of rows) {
      refreshedIds.add(row.id);
      const existing = existingById.get(row.id);
      if (existing) {
        existing.messageCount = row.messageCount;
        continue;
      }

      // Generate title from first user message
      let title = row.title || "";
      if (!title) {
        try {
          const msg = getFirstUserMessageFromRust(profile, row.id);
          title = msg
            ? generateTitle(msg)
            : t("sessions.newConversation", getAppLocale());
        } catch {
          title = t("sessions.newConversation", getAppLocale());
        }
      }

      newSessions.push({
        id: row.id,
        title,
        startedAt: row.startedAt,
        source: row.source,
        messageCount: row.messageCount,
        model: row.model || "",
      });
    }

    // Refresh message_count for cached sessions not covered above
    const staleIds = cache.sessions
      .map((s) => s.id)
      .filter((id) => !refreshedIds.has(id));
    if (staleIds.length > 0) {
      const countsById = refreshMessageCountsFromRust(profile, staleIds);
      for (const s of cache.sessions) {
        const fresh = countsById[s.id];
        if (fresh !== undefined && fresh !== s.messageCount) {
          s.messageCount = fresh;
        }
      }
    }

    // Merge: new sessions first (most recent), then existing
    const allSessions = [...newSessions, ...cache.sessions];
    allSessions.sort((a, b) => b.startedAt - a.startedAt);

    const updated: CacheData = {
      sessions: allSessions,
      lastSync: Math.floor(Date.now() / 1000),
    };
    writeCache(updated);
    return updated.sessions;
  } catch {
    return cache.sessions;
  }
}

// Fast read from cache only (no DB access)
export function listCachedSessions(limit = 50, offset = 0): CachedSession[] {
  const cache = readCache();
  return cache.sessions.slice(offset, offset + limit);
}

// Update title for a specific session
export function updateSessionTitle(sessionId: string, title: string): void {
  const cache = readCache();
  const idx = cache.sessions.findIndex((s) => s.id === sessionId);
  if (idx >= 0) {
    cache.sessions[idx].title = title;
    writeCache(cache);
  }
}

// Remove a session entry from the local cache. Called after the underlying
// row in state.db is deleted so the renderer's fast-path cache doesn't keep
// surfacing a session that no longer exists.
export function removeSessionFromCache(sessionId: string): void {
  const cache = readCache();
  const next = cache.sessions.filter((s) => s.id !== sessionId);
  if (next.length !== cache.sessions.length) {
    cache.sessions = next;
    writeCache(cache);
  }
}
