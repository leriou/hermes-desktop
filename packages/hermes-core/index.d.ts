// Session persistence
export function getSessionMessagesJson(
  dbPath: string,
  desktopDir: string,
  sessionsDir: string,
  sessionId: string,
): string;
export function persistMessageJson(
  desktopDir: string,
  sid: string,
  role: string,
  content: string,
  toolCallId?: string,
  toolName?: string,
): void;

// YAML round-trip
export function yaml_to_json(yamlContent: string): string | null;
export function json_to_yaml(jsonContent: string): string | null;

// Env file I/O
export function readEnvFile(envPath: string): string;
export function setEnvValueFile(
  envPath: string,
  key: string,
  value: string,
): boolean;

// YAML config read/write (operate on content strings)
export function getYamlConfigValue(
  content: string,
  dottedKey: string,
): string | null;
export function setYamlConfigValue(
  content: string,
  key: string,
  value: string,
): string;

// Model aliases
export function getModelAliasesFromYaml(content: string): string;

// Toolsets
export function parseToolsetsFromYaml(content: string): string;
export function setToolsetsInYaml(
  content: string,
  key: string,
  enabled: boolean,
): string | null;

// MCP servers
export function listMcpServersFromYaml(content: string): string;

// Plugins
export function listPluginsFromYaml(content: string): string;
export function setPluginInYaml(
  content: string,
  name: string,
  enabled: boolean,
): string | null;

// Session SQLite operations
export function getSessionStats(dbPath: string): string;
export function listSessionsFromDb(
  dbPath: string,
  limit: number,
  offset: number,
): string;
export function searchSessionsFts(
  dbPath: string,
  query: string,
  limit: number,
): string;
export function deleteSessionFromDb(dbPath: string, sessionId: string): boolean;
export function syncSessionIdsFromDb(dbPath: string, sinceTs: number): string;
export function getFirstUserMessage(
  dbPath: string,
  sessionId: string,
): string | null;
export function refreshMessageCounts(dbPath: string, idsJson: string): string;
