import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { profileHome, profilePaths, safeWriteFile } from "./utils";

type CoreModule = typeof import("@hermes/core");

let _core: CoreModule | null = null;

function core(): CoreModule {
  if (!_core) {
    _core = require("@hermes/core") as CoreModule;
  }
  return _core;
}

function readConfigContent(profile?: string): string {
  const { configFile } = profilePaths(profile);
  if (!existsSync(configFile)) return "";
  return readFileSync(configFile, "utf-8");
}

// ── Env ──────────────────────────────────────────────────

export function yamlToJson(yamlContent: string): Record<string, any> | null {
  const result = core().yaml_to_json(yamlContent);
  if (!result) return null;
  try { return JSON.parse(result); } catch { return null; }
}

export function jsonToYaml(jsonContent: Record<string, any>): string | null {
  return core().json_to_yaml(JSON.stringify(jsonContent));
}

export function readEnvFromRust(profile?: string): Record<string, string> {
  const { envFile } = profilePaths(profile);
  const json = core().readEnvFile(envFile);
  return JSON.parse(json);
}

export function setEnvValueToRust(
  key: string,
  value: string,
  profile?: string,
): boolean {
  const { envFile } = profilePaths(profile);
  return core().setEnvValueFile(envFile, key, value);
}

// ── YAML config ──────────────────────────────────────────

export function getConfigValueFromRust(
  key: string,
  profile?: string,
): string | null {
  const content = readConfigContent(profile);
  if (!content) return null;
  return core().getYamlConfigValue(content, key);
}

export function setConfigValueToRust(
  key: string,
  value: string,
  profile?: string,
): boolean {
  const { configFile } = profilePaths(profile);
  if (!existsSync(configFile)) return false;
  const content = readFileSync(configFile, "utf-8");
  const updated = core().setYamlConfigValue(content, key, value);
  if (updated === content) return false;
  safeWriteFile(configFile, updated);
  return true;
}

// ── Model aliases ────────────────────────────────────────

export function getModelAliasesFromRust(
  profile?: string,
): Array<{
  name: string;
  model: string;
  provider: string;
  baseUrl: string;
  contextLength?: number;
}> {
  const content = readConfigContent(profile);
  if (!content) return [];
  return JSON.parse(core().getModelAliasesFromYaml(content));
}

// ── Toolsets ─────────────────────────────────────────────

export function parseToolsetsFromRust(profile?: string): string[] {
  const content = readConfigContent(profile);
  if (!content) return [];
  return JSON.parse(core().parseToolsetsFromYaml(content));
}

export function setToolsetsToRust(
  key: string,
  enabled: boolean,
  content: string,
): string | null {
  return core().setToolsetsInYaml(content, key, enabled);
}

// ── MCP servers ──────────────────────────────────────────

export function listMcpServersFromRust(
  profile?: string,
): Array<{ name: string; type: string; enabled: boolean; detail: string }> {
  const content = readConfigContent(profile);
  if (!content) return [];
  return JSON.parse(core().listMcpServersFromYaml(content));
}

// ── Plugins ──────────────────────────────────────────────

export function listPluginsFromRust(
  profile?: string,
): Array<{
  name: string;
  enabled: boolean;
  version: string;
  description: string;
  source: string;
}> {
  const content = readConfigContent(profile);
  if (!content) return [];
  return JSON.parse(core().listPluginsFromYaml(content));
}

export function setPluginToRust(
  name: string,
  enabled: boolean,
  content: string,
): string | null {
  return core().setPluginInYaml(content, name, enabled);
}

// ── Session SQLite ───────────────────────────────────────

function dbPath(profile?: string): string {
  return join(profileHome(profile), "state.db");
}

export function getSessionStatsFromRust(profile?: string): {
  totalSessions: number;
  totalMessages: number;
} {
  const path = dbPath(profile);
  return JSON.parse(core().getSessionStats(path));
}

export function listSessionsFromRust(
  profile: string | undefined,
  limit: number,
  offset: number,
): Array<{
  id: string;
  source: string;
  started_at: number;
  ended_at: number | null;
  message_count: number;
  model: string;
  title: string | null;
}> {
  const path = dbPath(profile);
  return JSON.parse(core().listSessionsFromDb(path, limit, offset));
}

export function searchSessionsFromRust(
  profile: string | undefined,
  query: string,
  limit: number,
): Array<{
  sessionId: string;
  title: string | null;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
  snippet: string;
}> {
  const path = dbPath(profile);
  return JSON.parse(core().searchSessionsFts(path, query, limit));
}

export function deleteSessionFromRust(
  profile: string | undefined,
  sessionId: string,
): boolean {
  const path = dbPath(profile);
  return core().deleteSessionFromDb(path, sessionId);
}

export function syncSessionIdsFromRust(
  profile: string | undefined,
  sinceTs: number,
): Array<{
  id: string;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
  title: string | null;
}> {
  const path = dbPath(profile);
  return JSON.parse(core().syncSessionIdsFromDb(path, sinceTs));
}

export function getFirstUserMessageFromRust(
  profile: string | undefined,
  sessionId: string,
): string | null {
  const path = dbPath(profile);
  return core().getFirstUserMessage(path, sessionId);
}

export function refreshMessageCountsFromRust(
  profile: string | undefined,
  ids: string[],
): Record<string, number> {
  const path = dbPath(profile);
  return JSON.parse(core().refreshMessageCounts(path, JSON.stringify(ids)));
}
