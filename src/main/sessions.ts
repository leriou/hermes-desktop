import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";
import { profileHome, getActiveProfileNameSync } from "./utils";
import type { Attachment } from "../shared/attachments";
import { isImageMime } from "../shared/attachments";
import { removeSessionFromCache } from "./session-cache";
import {
  listSessionsFromRust,
  searchSessionsFromRust,
  deleteSessionFromRust,
} from "./rust-bridge";

// Sentinel prefix used by hermes-agent's hermes_state.py to mark
// JSON-encoded multimodal content in the messages.content column.
// See agent source: hermes_state._CONTENT_JSON_PREFIX = "\x00json:".
const CONTENT_JSON_PREFIX = "\x00json:";

export interface SessionSummary {
  id: string;
  source: string;
  startedAt: number;
  endedAt: number | null;
  messageCount: number;
  model: string;
  title: string | null;
  preview: string;
}

export interface SessionMessage {
  id: number;
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  attachments?: Attachment[];
}

/**
 * Renderer-facing union of timeline items reconstructed from the DB.
 *
 * `user` / `assistant` are visible message bubbles. `reasoning`,
 * `tool_call`, and `tool_result` are surfaced as collapsible sub-rows
 * — they exist in the agent's state DB but were dropped on read until
 * this change. We emit them inline at the position they originally
 * occurred so the resumed transcript matches the live conversation.
 */
export type HistoryItem =
  | {
      kind: "user";
      id: number;
      content: string;
      timestamp: number;
      attachments?: Attachment[];
    }
  | {
      kind: "assistant";
      id: number;
      content: string;
      timestamp: number;
      attachments?: Attachment[];
    }
  | {
      kind: "reasoning";
      id: number;
      assistantId: number;
      text: string;
      timestamp: number;
    }
  | {
      kind: "tool_call";
      id: number;
      assistantId: number;
      callId: string;
      name: string;
      args: string;
      timestamp: number;
    }
  | {
      kind: "tool_result";
      id: number;
      callId: string;
      name: string;
      content: string;
      timestamp: number;
      attachments?: Attachment[];
    };

interface DecodedContent {
  text: string;
  attachments: Attachment[];
}

export function decodeContent(raw: string, messageId: number): DecodedContent {
  if (!raw || !raw.startsWith(CONTENT_JSON_PREFIX)) {
    return { text: raw || "", attachments: [] };
  }
  let parts: unknown;
  try {
    parts = JSON.parse(raw.slice(CONTENT_JSON_PREFIX.length));
  } catch {
    return { text: raw, attachments: [] };
  }
  if (!Array.isArray(parts)) {
    return { text: typeof parts === "string" ? parts : raw, attachments: [] };
  }

  const texts: string[] = [];
  const attachments: Attachment[] = [];
  let idx = 0;
  for (const p of parts) {
    if (typeof p === "string") {
      if (p) texts.push(p);
      continue;
    }
    if (!p || typeof p !== "object") continue;
    const type = String(
      (p as Record<string, unknown>).type || "",
    ).toLowerCase();
    if (type === "text" || type === "input_text" || type === "output_text") {
      const t = (p as Record<string, unknown>).text;
      if (typeof t === "string" && t) texts.push(t);
    } else if (type === "image_url" || type === "input_image") {
      const ref = (p as Record<string, unknown>).image_url;
      let url = "";
      if (typeof ref === "string") url = ref;
      else if (ref && typeof ref === "object") {
        const u = (ref as Record<string, unknown>).url;
        if (typeof u === "string") url = u;
      }
      if (!url || !url.startsWith("data:image/")) continue;
      const mime = url.slice("data:".length, url.indexOf(";"));
      attachments.push({
        id: `db-${messageId}-${idx++}`,
        kind: "image",
        name: `image.${guessExtension(mime)}`,
        mime: isImageMime(mime) ? mime : "image/png",
        size: 0,
        dataUrl: url,
      });
    }
  }
  return { text: texts.join("\n\n"), attachments };
}

function guessExtension(mime: string): string {
  switch (mime.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

export interface SearchResult {
  sessionId: string;
  title: string | null;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
  snippet: string;
}

export function listSessions(limit = 30, offset = 0): SessionSummary[] {
  try {
    const profile = getActiveProfileNameSync();
    const rows = listSessionsFromRust(profile, limit, offset);
    return rows.map((r) => ({
      id: r.id,
      source: r.source,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      messageCount: r.message_count,
      model: r.model || "",
      title: r.title,
      preview: "",
    }));
  } catch {
    return [];
  }
}

export function searchSessions(query: string, limit = 20): SearchResult[] {
  try {
    const profile = getActiveProfileNameSync();
    return searchSessionsFromRust(profile, query, limit);
  } catch {
    return [];
  }
}

/**
 * Try hard to extract human-readable reasoning text from one of the three
 * provider-specific columns the agent stores it in. Returns "" when nothing
 * usable is present.
 */
export function pickReasoning(row: {
  reasoning: string | null;
  reasoning_content: string | null;
  reasoning_details: string | null;
}): string {
  const direct = (row.reasoning || "").trim();
  if (direct) return direct;
  const legacy = (row.reasoning_content || "").trim();
  if (legacy) return legacy;
  const details = (row.reasoning_details || "").trim();
  if (!details) return "";
  try {
    const parsed = JSON.parse(details);
    if (typeof parsed === "string") return parsed;
    if (Array.isArray(parsed)) {
      const texts: string[] = [];
      for (const entry of parsed) {
        if (!entry || typeof entry !== "object") continue;
        const e = entry as Record<string, unknown>;
        if (typeof e.text === "string" && e.text) texts.push(e.text);
        else if (typeof e.thinking === "string" && e.thinking)
          texts.push(e.thinking);
      }
      if (texts.length) return texts.join("\n\n");
    }
  } catch {
    /* fall through */
  }
  return "";
}

/**
 * Parse the assistant row's `tool_calls` JSON.
 * Returns `[]` on any parse failure.
 */
export function parseToolCalls(
  raw: string | null,
): Array<{ callId: string; name: string; args: string }> {
  if (!raw || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: Array<{ callId: string; name: string; args: string }> = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const fn = (e.function || {}) as Record<string, unknown>;
    const name = typeof fn.name === "string" ? fn.name : "";
    if (!name) continue;
    const callId =
      (typeof e.call_id === "string" && e.call_id) ||
      (typeof e.id === "string" && e.id) ||
      "";
    const rawArgs = typeof fn.arguments === "string" ? fn.arguments : "";
    let args = rawArgs;
    try {
      args = JSON.stringify(JSON.parse(rawArgs), null, 2);
    } catch {
      // arguments wasn't JSON — leave as-is
    }
    out.push({ callId, name, args });
  }
  return out;
}

/**
 * Row shape as returned by the widened SELECT inside getSessionMessages,
 * exported so the unit tests can build fixture rows without going through
 * sqlite.
 */
export interface RawMessageRow {
  id: number;
  role: string;
  content: string | null;
  timestamp: number;
  tool_call_id: string | null;
  tool_calls: string | null;
  tool_name: string | null;
  reasoning: string | null;
  reasoning_content: string | null;
  reasoning_details: string | null;
}

/**
 * Pure expansion of DB rows → renderer-facing HistoryItem list. Kept pure
 * (no I/O) so we can exercise the ordering and edge-case logic directly
 * without booting sqlite.
 */
export function expandRowsToHistory(rows: RawMessageRow[]): HistoryItem[] {
  const items: HistoryItem[] = [];
  for (const r of rows) {
    const decoded = decodeContent(r.content || "", r.id);

    if (r.role === "user") {
      if (!decoded.text && decoded.attachments.length === 0) continue;
      items.push({
        kind: "user",
        id: r.id,
        content: decoded.text,
        timestamp: r.timestamp,
        ...(decoded.attachments.length > 0
          ? { attachments: decoded.attachments }
          : {}),
      });
      continue;
    }

    if (r.role === "assistant") {
      const reasoningText = pickReasoning(r);
      if (reasoningText) {
        items.push({
          kind: "reasoning",
          id: r.id,
          assistantId: r.id,
          text: reasoningText,
          timestamp: r.timestamp,
        });
      }

      if (decoded.text || decoded.attachments.length > 0) {
        items.push({
          kind: "assistant",
          id: r.id,
          content: decoded.text,
          timestamp: r.timestamp,
          ...(decoded.attachments.length > 0
            ? { attachments: decoded.attachments }
            : {}),
        });
      }

      for (const tc of parseToolCalls(r.tool_calls)) {
        items.push({
          kind: "tool_call",
          id: r.id,
          assistantId: r.id,
          callId: tc.callId,
          name: tc.name,
          args: tc.args,
          timestamp: r.timestamp,
        });
      }
      continue;
    }

    if (r.role === "tool") {
      const name = r.tool_name || "tool";
      items.push({
        kind: "tool_result",
        id: r.id,
        callId: r.tool_call_id || "",
        name,
        content: decoded.text,
        timestamp: r.timestamp,
        ...(decoded.attachments.length > 0
          ? { attachments: decoded.attachments }
          : {}),
      });
      continue;
    }
  }
  return items;
}

const MAX_MESSAGES = 100;
const MAX_TOOL_CONTENT = 8000;

export function getSessionMessages(sessionId: string): HistoryItem[] {
  const home = profileHome(getActiveProfileNameSync());
  const dbPath = join(home, "state.db");
  const desktopDir = join(home, "desktop", "messages");
  const sessionsDir = join(home, "sessions");

  try {
    const { getSessionMessagesJson } = require("@hermes/core") as typeof import("@hermes/core");
    const jsonStr = getSessionMessagesJson(dbPath, desktopDir, sessionsDir, sessionId);
    const items: HistoryItem[] = JSON.parse(jsonStr);
    // Limit in main process to avoid sending huge payloads through IPC
    const sliced = items.length > MAX_MESSAGES
      ? items.slice(items.length - MAX_MESSAGES)
      : items;
    return sliced.map((it) => {
      if (it.kind === "tool_result") {
        const c = it.content || "";
        if (c.length > MAX_TOOL_CONTENT) {
          return { ...it, content: c.slice(0, MAX_TOOL_CONTENT) + `\n\n... (${c.length} chars total)` };
        }
      }
      return it;
    });
  } catch {
    return [];
  }
}

export function deleteSession(sessionId: string): void {
  const profile = getActiveProfileNameSync();
  deleteSessionFromRust(profile, sessionId);
  removeSessionFromCache(sessionId);
}

interface PersistedMessage {
  role: string;
  content: string;
  tool_call_id?: string;
  tool_name?: string;
  ts: number;
}

function desktopMessagesDir(): string {
  return join(profileHome(getActiveProfileNameSync()), "desktop", "messages");
}

export function persistMessage(
  sid: string,
  role: string,
  content: string,
  meta?: { tool_call_id?: string; tool_name?: string },
): void {
  const dir = desktopMessagesDir();
  try {
    const { persistMessageJson } = require("@hermes/core") as typeof import("@hermes/core");
    mkdirSync(dir, { recursive: true });
    persistMessageJson(dir, sid, role, content, meta?.tool_call_id, meta?.tool_name);
  } catch {
    const filePath = join(dir, `${sid}.json`);
    let msgs: PersistedMessage[] = [];
    if (existsSync(filePath)) {
      try { msgs = JSON.parse(readFileSync(filePath, "utf-8")); } catch { msgs = []; }
    }
    msgs.push({
      role,
      content,
      tool_call_id: meta?.tool_call_id,
      tool_name: meta?.tool_name,
      ts: Date.now(),
    });
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, JSON.stringify(msgs));
  }
}

export function loadPersistedMessages(sid: string): PersistedMessage[] {
  const filePath = join(desktopMessagesDir(), `${sid}.json`);
  if (!existsSync(filePath)) return [];
  try { return JSON.parse(readFileSync(filePath, "utf-8")); } catch { return []; }
}

export function migratePersistedMessages(fromSid: string, toSid: string): void {
  if (!fromSid || !toSid || fromSid === toSid) return;

  const dir = desktopMessagesDir();
  const fromPath = join(dir, `${fromSid}.json`);
  const toPath = join(dir, `${toSid}.json`);

  if (!existsSync(fromPath) || existsSync(toPath)) return;

  try {
    mkdirSync(dir, { recursive: true });
    renameSync(fromPath, toPath);
    return;
  } catch {
    /* fall through */
  }

  const old = loadPersistedMessages(fromSid);
  if (old.length === 0) return;

  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(toPath, JSON.stringify(old));
  } catch {
    /* ignore */
  }
}

export function loadSessionJsonLog(sid: string): Record<string, unknown>[] {
  const home = profileHome(getActiveProfileNameSync());
  const filePath = join(home, "sessions", `session_${sid}.json`);
  if (!existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    return raw?.messages ?? [];
  } catch { return []; }
}
