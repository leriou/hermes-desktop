import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  InstallStatus,
  InstallProgress,
  Result,
  KanbanBoard,
  KanbanTask,
  KanbanTaskDetail,
  KanbanCreateTaskInput,
  KanbanResult,
  KanbanDataResult,
} from "@shared/api-types";
import type { AppLocale } from "@shared/i18n/types";
import type { Attachment } from "@shared/attachments";

function listenOnce(
  event: string,
  callback: (payload: any) => void,
): () => void {
  let unlistenFn: (() => void) | null = null;
  let cleaned = false;
  const unlisten = listen(event, (e: any) => {
    if (cleaned) return;
    try {
      callback(e.payload);
    } catch (err) {
      console.error("[hermes-tauri] listenOnce error:", err, "raw event:", e);
    }
  });
  unlisten.then((fn) => {
    unlistenFn = fn;
  });
  return () => {
    cleaned = true;
    if (unlistenFn) {
      unlistenFn();
    } else {
      unlisten.then((fn) => fn());
    }
  };
}

// Installation
export function checkInstall(): Promise<InstallStatus> {
  return invoke("check_install");
}
export function verifyInstall(): Promise<boolean> {
  return invoke("verify_install");
}
export function startInstall(): Promise<Result> {
  return invoke("start_install");
}
export function inspectInstallTarget(): Promise<{
  hermesHome: string;
  repoPath: string;
  state: "fresh" | "update" | "replace";
}> {
  return invoke("inspect_install_target");
}
export function validateHermesHome(dir: string): Promise<boolean> {
  return invoke("validate_hermes_home", { dir });
}
export function adoptHermesHome(dir: string): Promise<boolean> {
  return invoke("adopt_hermes_home", { dir });
}
export function quitApp(): Promise<void> {
  return invoke("quit_app");
}
export function onInstallProgress(
  callback: (progress: InstallProgress) => void,
): () => void {
  return listenOnce("installprogress", callback);
}

// Hermes engine
export function getHermesVersion(): Promise<string | null> {
  return invoke("get_hermes_version");
}
export function refreshHermesVersion(): Promise<string | null> {
  return invoke("refresh_hermes_version");
}
export function runHermesDoctor(): Promise<string> {
  return invoke("run_hermes_doctor");
}
export function runHermesUpdate(): Promise<Result> {
  return invoke("run_hermes_update");
}

// OAuth
export function oauthLogin(
  provider: string,
  profile?: string,
): Promise<Result> {
  return invoke("oauth_login", { provider, profile });
}
export function cancelOAuthLogin(): Promise<boolean> {
  return invoke("cancel_oauth_login");
}
export function onOAuthLoginProgress(
  callback: (chunk: string) => void,
): () => void {
  return listenOnce("oauthloginprogress", callback);
}

// Locale
export function getLocale(): Promise<AppLocale> {
  return invoke("get_locale");
}
export function setLocale(locale: AppLocale): Promise<AppLocale> {
  return invoke("set_locale", { locale });
}

// Environment & Config
export function getEnv(profile?: string): Promise<Record<string, string>> {
  return invoke("get_env", { profile });
}
export function setEnv(
  key: string,
  value: string,
  profile?: string,
): Promise<boolean> {
  return invoke("set_env", { key, value, profile });
}
export function getConfig(
  key: string,
  profile?: string,
): Promise<string | null> {
  return invoke("get_config", { key, profile });
}
export function setConfig(
  key: string,
  value: string,
  profile?: string,
): Promise<boolean> {
  return invoke("set_config", { key, value, profile });
}
export function getHermesHome(profile?: string): Promise<string> {
  return invoke("get_hermes_home", { profile });
}

// Model config
export function getModelConfig(
  profile?: string,
): Promise<{ provider: string; model: string; baseUrl: string }> {
  return invoke("get_model_config", { profile });
}
export function setModelConfig(
  provider: string,
  model: string,
  baseUrl: string,
  profile?: string,
): Promise<boolean> {
  return invoke("set_model_config", { provider, model, baseUrl, profile });
}

// Connection mode
export function isRemoteMode(): Promise<boolean> {
  return invoke("is_remote_mode");
}
export function isRemoteOnlyMode(): Promise<boolean> {
  return invoke("is_remote_only_mode");
}
export function getConnectionConfig(): Promise<{
  mode: "local" | "remote" | "ssh";
  remoteUrl: string;
  hasApiKey: boolean;
  apiKeyLength: number;
  ssh: {
    host: string;
    port: number;
    username: string;
    keyPath: string;
    remotePort: number;
    localPort: number;
  };
}> {
  return invoke("get_connection_config");
}
export function setConnectionConfig(
  mode: "local" | "remote" | "ssh",
  remoteUrl: string,
  apiKey?: string,
): Promise<boolean> {
  return invoke("set_connection_config", { mode, remoteUrl, apiKey });
}
export function setSshConfig(
  host: string,
  port: number,
  username: string,
  keyPath: string,
  remotePort: number,
  localPort: number,
): Promise<boolean> {
  return invoke("set_ssh_config", {
    host,
    port,
    username,
    keyPath,
    remotePort,
    localPort,
  });
}
export function testRemoteConnection(
  url: string,
  apiKey?: string,
): Promise<boolean> {
  return invoke("test_remote_connection", { url, apiKey });
}
export function testSshConnection(
  host: string,
  port: number,
  username: string,
  keyPath: string,
  remotePort: number,
): Promise<boolean> {
  return invoke("test_ssh_connection", {
    host,
    port,
    username,
    keyPath,
    remotePort,
  });
}
export function isSshTunnelActive(): Promise<boolean> {
  return invoke("is_ssh_tunnel_active");
}
export function startSshTunnel(): Promise<boolean> {
  return invoke("start_ssh_tunnel");
}
export function stopSshTunnel(): Promise<boolean> {
  return invoke("stop_ssh_tunnel");
}

// Chat
export function sendMessage(
  message: string,
  profile?: string,
  resumeSessionId?: string,
  history?: Array<{ role: string; content: string }>,
  attachments?: Attachment[],
  contextFolder?: string,
): Promise<{ response: string; sessionId?: string }> {
  return invoke("send_message", {
    message,
    profile,
    resumeSessionId,
    history,
    attachments,
    contextFolder,
  });
}
export function abortChat(): Promise<void> {
  return invoke("abort_chat");
}
export function copyToClipboard(text: string): Promise<void> {
  return invoke("copy_to_clipboard", { text });
}
export function getPathForFile(file: File): string {
  return (file as any).path || "";
}
export function stageAttachment(
  sessionId: string,
  filename: string,
  base64Bytes: string,
): Promise<string> {
  return invoke("stage_attachment", { sessionId, filename, base64Bytes });
}
export function clearStagedAttachments(sessionId: string): Promise<void> {
  return invoke("clear_staged_attachments", { sessionId });
}
export function discoverProviderModels(
  provider: string,
  baseUrl?: string,
  apiKey?: string,
  profile?: string,
): Promise<{
  models: string[];
  status: "ok" | "no-key" | "unsupported" | "unknown-host";
  cached: boolean;
}> {
  return invoke("discover_provider_models", {
    provider,
    baseUrl,
    apiKey,
    profile,
  });
}

// Chat events
export function onChatChunk(callback: (chunk: string) => void): () => void {
  return listenOnce("chatchunk", callback);
}
export function onChatDone(callback: (sessionId?: string) => void): () => void {
  return listenOnce("chatdone", callback);
}
export function onContextMenuCopyChat(
  callback: (format: "text" | "markdown") => void,
): () => void {
  return listenOnce("contextmenucopychat", callback);
}
export function onContextMenuSelectBubble(
  callback: (point: { x: number; y: number }) => void,
): () => void {
  return listenOnce("contextmenuselectbubble", callback);
}
export function onChatToolProgress(
  callback: (tool: string) => void,
): () => void {
  return listenOnce("chattoolprogress", callback);
}
export function onChatUsage(
  callback: (usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost?: number;
    rateLimitRemaining?: number;
    rateLimitReset?: number;
  }) => void,
): () => void {
  return listenOnce("chatusage", callback);
}
export function onChatUsageReset(callback: () => void): () => void {
  return listenOnce("chatusagereset", callback);
}
export function onChatError(callback: (error: string) => void): () => void {
  return listenOnce("chaterror", callback);
}

// Gateway
export function startGateway(profile?: string): Promise<boolean> {
  return invoke("start_gateway", { profile });
}
export function stopGateway(profile?: string): Promise<boolean> {
  return invoke("stop_gateway", { profile });
}
export function gatewayStatus(): Promise<boolean> {
  return invoke("gateway_status");
}

// Platform
export function getPlatformEnabled(
  profile?: string,
): Promise<Record<string, boolean>> {
  return invoke("get_platform_enabled", { profile });
}
export function setPlatformEnabled(
  platform: string,
  enabled: boolean,
  profile?: string,
): Promise<boolean> {
  return invoke("set_platform_enabled", { platform, enabled, profile });
}

// Sessions
export function listSessions(
  profile?: string,
  limit?: number,
  offset?: number,
): Promise<
  Array<{
    id: string;
    source: string;
    startedAt: number;
    endedAt: number | null;
    messageCount: number;
    model: string;
    title: string | null;
    preview: string;
  }>
> {
  return invoke("list_sessions", { profile, limit, offset });
}
export function getSessionMessages(
  sessionId: string,
  profile?: string,
): Promise<
  Array<
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
      }
  >
> {
  return invoke("get_session_messages", { sessionId, profile });
}
export function deleteSession(sessionId: string): Promise<void> {
  return invoke("delete_session", { sessionId });
}
export function listCachedSessions(
  profile?: string,
  limit?: number,
  offset?: number,
): Promise<
  Array<{
    id: string;
    title: string;
    startedAt: number;
    source: string;
    messageCount: number;
    model: string;
  }>
> {
  return invoke("list_cached_sessions", { profile, limit, offset });
}
export function syncSessionCache(profile?: string): Promise<
  Array<{
    id: string;
    title: string;
    startedAt: number;
    source: string;
    messageCount: number;
    model: string;
  }>
> {
  return invoke("sync_session_cache", { profile });
}
export function updateSessionTitle(
  sessionId: string,
  title: string,
): Promise<void> {
  return invoke("update_session_title", { sessionId, title });
}
export function searchSessions(
  query: string,
  limit?: number,
  profile?: string,
): Promise<
  Array<{
    sessionId: string;
    title: string | null;
    startedAt: number;
    source: string;
    messageCount: number;
    model: string;
    snippet: string;
  }>
> {
  return invoke("search_sessions", { query, limit, profile });
}

// Profiles
export function listProfiles(): Promise<
  Array<{
    name: string;
    path: string;
    isDefault: boolean;
    isActive: boolean;
    model: string;
    provider: string;
    hasEnv: boolean;
    hasSoul: boolean;
    skillCount: number;
    gatewayRunning: boolean;
  }>
> {
  return invoke("list_profiles");
}
export function createProfile(name: string, clone: boolean): Promise<Result> {
  return invoke("create_profile", { name, clone });
}
export function deleteProfile(name: string): Promise<Result> {
  return invoke("delete_profile", { name });
}
export function setActiveProfile(name: string): Promise<boolean> {
  return invoke("set_active_profile", { name });
}

// Memory
export function readMemory(profile?: string): Promise<{
  memory: {
    content: string;
    exists: boolean;
    lastModified: number | null;
    entries: any[];
    charCount: number;
    charLimit: number;
  };
  user: {
    content: string;
    exists: boolean;
    lastModified: number | null;
    charCount: number;
    charLimit: number;
  };
  stats: { totalSessions: number; totalMessages: number };
}> {
  return invoke("read_memory", { profile });
}
export function addMemoryEntry(
  content: string,
  profile?: string,
): Promise<Result> {
  return invoke("add_memory_entry", { content, profile });
}
export function updateMemoryEntry(
  index: number,
  content: string,
  profile?: string,
): Promise<Result> {
  return invoke("update_memory_entry", { index, content, profile });
}
export function removeMemoryEntry(
  index: number,
  profile?: string,
): Promise<boolean | Result> {
  return invoke("remove_memory_entry", { index, profile });
}
export function writeUserProfile(
  content: string,
  profile?: string,
): Promise<Result> {
  return invoke("write_user_profile", { content, profile });
}
export function writeMemory(
  content: string,
  profile?: string,
): Promise<Result> {
  return invoke("write_memory", { content, profile });
}

// Soul
export function readSoul(profile?: string): Promise<string> {
  return invoke("read_soul", { profile });
}
export function writeSoul(
  content: string,
  profile?: string,
): Promise<boolean | Result> {
  return invoke("write_soul", { content, profile });
}
export function resetSoul(profile?: string): Promise<string> {
  return invoke("reset_soul", { profile });
}

// Tools
export function getToolsets(
  profile?: string,
): Promise<
  Array<{
    key: string;
    label: string;
    description: string;
    enabled: boolean;
    source: string;
  }>
> {
  return invoke("get_toolsets", { profile });
}
export function setToolsetEnabled(
  key: string,
  enabled: boolean,
  profile?: string,
): Promise<boolean | Result> {
  return invoke("set_toolset_enabled", { key, enabled, profile });
}

// Skills
export function listInstalledSkills(
  profile?: string,
): Promise<
  Array<{ name: string; entry_name: string; category: string; description: string; path: string; usage_count?: number }>
> {
  return invoke("list_installed_skills", { profile });
}
export function listBundledSkills(profile?: string): Promise<
  Array<{
    name: string;
    entry_name: string;
    description: string;
    category: string;
    source: string;
    installed: boolean;
    usage_count?: number;
  }>
> {
  return invoke("list_bundled_skills", { profile });
}
export function getSkillContent(skillPath: string): Promise<string> {
  return invoke("get_skill_content", { path: skillPath });
}
export function installSkill(
  identifier: string,
  profile?: string,
): Promise<Result> {
  return invoke("install_skill", { identifier, profile });
}
export function uninstallSkill(
  name: string,
  profile?: string,
): Promise<Result> {
  return invoke("uninstall_skill", { name, profile });
}

// Plugins
export function getPlugins(
  profile?: string,
): Promise<
  Array<{
    name: string;
    description: string;
    enabled: boolean;
    version?: string;
    source?: string;
  }>
> {
  return invoke("get_plugins", { profile });
}
export function setPluginEnabled(
  name: string,
  enabled: boolean,
  profile?: string,
): Promise<Result> {
  return invoke("set_plugin_enabled", { name, enabled, profile });
}

// Credential Pool
export function getCredentialPool(
  profile?: string,
): Promise<Record<string, Array<{ key: string; label: string }>>> {
  return invoke("get_credential_pool", { profile });
}
export function setCredentialPool(
  provider: string,
  entries: Array<{ key: string; label: string }>,
  profile?: string,
): Promise<boolean | Result> {
  return invoke("set_credential_pool", { provider, entries, profile });
}

// Models
export function listModels(profile?: string): Promise<
  Array<{
    id: string;
    name: string;
    provider: string;
    model: string;
    baseUrl: string;
    createdAt?: number;
    aliases?: string[];
  }>
> {
  return invoke("list_models", { profile });
}
export function listTemplates(): Promise<any> {
  return invoke("list_templates");
}
export function getModelAliases(profile?: string): Promise<
  Array<{
    name: string;
    model: string;
    provider: string;
    baseUrl: string;
    contextLength?: number;
  }>
> {
  return invoke("get_model_aliases", { profile });
}
export function addModel(
  name: string,
  provider: string,
  model: string,
  baseUrl: string,
  alias?: string,
  profile?: string,
): Promise<
  | Result
  | {
      id: string;
      name: string;
      provider: string;
      model: string;
      baseUrl: string;
      createdAt: number;
    }
> {
  return invoke("add_model", {
    name,
    provider,
    model,
    baseUrl,
    alias,
    profile,
  });
}
export function removeModel(
  id: string,
  profile?: string,
): Promise<boolean | Result> {
  return invoke("remove_model", { id, profile });
}
export function updateModel(
  id: string,
  fields: Record<string, string>,
  profile?: string,
): Promise<boolean | Result> {
  return invoke("update_model", { id, fields, profile });
}

// Updates
export function checkForUpdates(): Promise<string | null> {
  return invoke("check_for_updates");
}
export function downloadUpdate(): Promise<boolean> {
  return invoke("download_update");
}
export function installUpdate(): Promise<void> {
  return invoke("install_update");
}
export function getAppVersion(): Promise<string> {
  return invoke("get_app_version");
}
export function onUpdateAvailable(
  callback: (info: { version: string; releaseNotes: string }) => void,
): () => void {
  return listenOnce("updateavailable", callback);
}
export function onUpdateDownloadProgress(
  callback: (info: { percent: number }) => void,
): () => void {
  return listenOnce("updatedownloadprogress", callback);
}
export function onUpdateDownloaded(callback: () => void): () => void {
  return listenOnce("updatedownloaded", callback);
}
export function onUpdateError(callback: (message: string) => void): () => void {
  return listenOnce("updateerror", callback);
}

// Menu shortcuts
export function onMenuNewChat(callback: () => void): () => void {
  return listenOnce("menunewchat", callback);
}
export function onMenuSearchSessions(callback: () => void): () => void {
  return listenOnce("menusearchsessions", callback);
}

// Cron Jobs
export function listCronJobs(
  includeDisabled?: boolean,
  profile?: string,
): Promise<
  Array<{
    id: string;
    name: string;
    schedule: string;
    prompt: string;
    state: "active" | "paused" | "completed";
    enabled: boolean;
    next_run_at: string | null;
    last_run_at: string | null;
    last_status: string | null;
    last_error: string | null;
    repeat: { times: number | null; completed: number } | null;
    deliver: string[];
    skills: string[];
    script: string | null;
  }>
> {
  return invoke("list_cron_jobs", { includeDisabled, profile });
}
export function createCronJob(
  schedule: string,
  prompt?: string,
  name?: string,
  deliver?: string,
  profile?: string,
): Promise<Result> {
  return invoke("create_cron_job", {
    schedule,
    prompt,
    name,
    deliver,
    profile,
  });
}
export function updateCronJob(
  jobId: string,
  schedule?: string,
  prompt?: string,
  name?: string,
  deliver?: string,
  profile?: string,
): Promise<Result> {
  return invoke("update_cron_job", {
    jobId,
    schedule,
    prompt,
    name,
    deliver,
    profile,
  });
}
export function removeCronJob(
  jobId: string,
  profile?: string,
): Promise<Result> {
  return invoke("remove_cron_job", { jobId, profile });
}
export function pauseCronJob(jobId: string, profile?: string): Promise<Result> {
  return invoke("pause_cron_job", { jobId, profile });
}
export function resumeCronJob(
  jobId: string,
  profile?: string,
): Promise<Result> {
  return invoke("resume_cron_job", { jobId, profile });
}
export function triggerCronJob(
  jobId: string,
  profile?: string,
): Promise<Result> {
  return invoke("trigger_cron_job", { jobId, profile });
}
export function listCronHistory(profile?: string): Promise<
  Array<{
    jobId: string;
    jobName: string;
    runAt: string;
    status: "ok" | "fail" | "empty";
    size: number;
    path: string;
  }>
> {
  return invoke("list_cron_history", { profile });
}
export function readCronOutput(
  path: string,
  profile?: string,
): Promise<string> {
  return invoke("read_cron_output", { path, profile });
}

// Kanban
export function kanbanListBoards(
  includeArchived?: boolean,
  profile?: string,
): Promise<KanbanDataResult<KanbanBoard[]> & { unsupportedMode?: boolean }> {
  return invoke("kanban_list_boards", { includeArchived, profile });
}
export function kanbanCurrentBoard(
  profile?: string,
): Promise<KanbanDataResult<string>> {
  return invoke("kanban_current_board", { profile });
}
export function kanbanSwitchBoard(
  slug: string,
  profile?: string,
): Promise<KanbanResult> {
  return invoke("kanban_switch_board", { slug, profile });
}
export function kanbanCreateBoard(
  slug: string,
  name?: string,
  switchAfter?: boolean,
  profile?: string,
): Promise<KanbanResult> {
  return invoke("kanban_create_board", { slug, name, switchAfter, profile });
}
export function kanbanRemoveBoard(
  slug: string,
  hardDelete?: boolean,
  profile?: string,
): Promise<KanbanResult> {
  return invoke("kanban_remove_board", { slug, hardDelete, profile });
}
export function kanbanListTasks(filters?: {
  status?: string;
  assignee?: string;
  tenant?: string;
  includeArchived?: boolean;
  profile?: string;
}): Promise<KanbanDataResult<KanbanTask[]>> {
  return invoke("kanban_list_tasks", { filters });
}
export function kanbanGetTask(
  taskId: string,
  profile?: string,
): Promise<KanbanDataResult<KanbanTaskDetail>> {
  return invoke("kanban_get_task", { taskId, profile });
}
export function kanbanCreateTask(
  input: KanbanCreateTaskInput,
  profile?: string,
): Promise<KanbanDataResult<{ id: string }>> {
  return invoke("kanban_create_task", { input, profile });
}
export function selectFolder(): Promise<string | null> {
  return invoke("select_folder");
}
export function selectHermesFolder(): Promise<string | null> {
  return invoke("select_hermes_folder");
}
export function kanbanAssignTask(
  taskId: string,
  assignee: string | null,
  profile?: string,
): Promise<KanbanResult> {
  return invoke("kanban_assign_task", { taskId, assignee, profile });
}
export function kanbanCompleteTask(
  taskId: string,
  result?: string,
  profile?: string,
): Promise<KanbanResult> {
  return invoke("kanban_complete_task", { taskId, result, profile });
}
export function kanbanBlockTask(
  taskId: string,
  reason?: string,
  profile?: string,
): Promise<KanbanResult> {
  return invoke("kanban_block_task", { taskId, reason, profile });
}
export function kanbanUnblockTask(
  taskId: string,
  profile?: string,
): Promise<KanbanResult> {
  return invoke("kanban_unblock_task", { taskId, profile });
}
export function kanbanArchiveTask(
  taskId: string,
  profile?: string,
): Promise<KanbanResult> {
  return invoke("kanban_archive_task", { taskId, profile });
}
export function kanbanSpecifyTask(
  taskId: string,
  profile?: string,
): Promise<KanbanResult> {
  return invoke("kanban_specify_task", { taskId, profile });
}
export function kanbanReclaimTask(
  taskId: string,
  reason?: string,
  profile?: string,
): Promise<KanbanResult> {
  return invoke("kanban_reclaim_task", { taskId, reason, profile });
}
export function kanbanCommentTask(
  taskId: string,
  body: string,
  profile?: string,
): Promise<KanbanResult> {
  return invoke("kanban_comment_task", { taskId, body, profile });
}
export function kanbanDispatchOnce(
  dryRun?: boolean,
  profile?: string,
): Promise<KanbanDataResult<unknown>> {
  return invoke("kanban_dispatch_once", { dryRun, profile });
}

// External & File operations
export function openExternal(url: string): Promise<void> {
  return invoke("open_external", { url });
}
export function runHermesBackup(
  profile?: string,
): Promise<{ success: boolean; path?: string; error?: string }> {
  return invoke("run_hermes_backup", { profile });
}
export function runHermesImport(
  archivePath: string,
  profile?: string,
): Promise<Result> {
  return invoke("run_hermes_import", { archivePath, profile });
}
export function runHermesDump(): Promise<string> {
  return invoke("run_hermes_dump");
}
export function discoverMemoryProviders(profile?: string): Promise<
  Array<{
    name: string;
    description: string;
    installed: boolean;
    active: boolean;
    envVars: string[];
  }>
> {
  return invoke("discover_memory_providers", { profile });
}
export function listMcpServers(
  profile?: string,
): Promise<
  Array<{ name: string; type: string; enabled: boolean; detail: string }>
> {
  return invoke("list_mcp_servers", { profile });
}
export function readLogs(
  logFile?: string,
  lines?: number,
): Promise<{ content: string; path: string }> {
  return invoke("read_logs", { logFile, lines });
}

// Routing / Fallback config
export function getRoutingConfig(profile?: string): Promise<{
  defaultModel: string;
  defaultProvider: string;
  defaultBaseUrl: string;
  fallbacks: Array<{ model: string; provider: string }>;
}> {
  return invoke("get_routing_config", { profile });
}
export function setRoutingConfig(
  data: {
    defaultModel?: string;
    defaultProvider?: string;
    defaultBaseUrl?: string;
    fallbacks?: Array<{ model: string; provider: string }>;
  },
  profile?: string,
): Promise<boolean> {
  return invoke("set_routing_config", { data, profile });
}

// Config YAML editor
export function readConfigYaml(
  profile?: string,
): Promise<{ content: string; path: string }> {
  return invoke("read_config_yaml", { profile });
}
export function writeConfigYaml(
  content: string,
  profile?: string,
): Promise<boolean> {
  return invoke("write_config_yaml", { content, profile });
}

// TUI Gateway
export function tuiSlashExec(sessionId: string, command: string): Promise<any> {
  return invoke("tui_slash_exec", { sessionId, command });
}
export function tuiCommandDispatch(
  sessionId: string,
  name: string,
  arg?: string,
): Promise<any> {
  return invoke("tui_command_dispatch", { sessionId, name, arg });
}
export function tuiCompress(
  sessionId: string,
  focusTopic?: string,
): Promise<any> {
  return invoke("tui_compress", { sessionId, focusTopic });
}
export function tuiSetGoal(sessionId: string, goal: string): Promise<any> {
  return invoke("tui_set_goal", { sessionId, goal });
}
export function tuiSetModel(sessionId: string, model: string): Promise<any> {
  return invoke("tui_set_model", { sessionId, model });
}
export function tuiSteer(sessionId: string, text: string): Promise<any> {
  return invoke("tui_steer", { sessionId, text });
}
export function tuiCreateSession(
  model?: string,
): Promise<{ session_id: string }> {
  return invoke("tui_create_session", { model });
}
export function tuiResumeSession(sessionId: string): Promise<any> {
  return invoke("tui_resume_session", { sessionId });
}
export function tuiSessionHistory(sessionId: string): Promise<any> {
  return invoke("tui_session_history", { sessionId });
}
export function tuiSubmitPrompt(
  sessionId: string,
  text: string,
  profile?: string,
): Promise<void> {
  return invoke("tui_submit_prompt", { sessionId, text, profile });
}
export function tuiInterrupt(sessionId: string): Promise<void> {
  return invoke("tui_interrupt", { sessionId });
}
export function tuiUndo(sessionId: string): Promise<void> {
  return invoke("tui_undo", { sessionId });
}
export function tuiToolsList(sessionId?: string): Promise<any> {
  return invoke("tui_tools_list", { sessionId });
}
export function tuiToolsShow(name?: string, sessionId?: string): Promise<any> {
  return invoke("tui_tools_show", { name, sessionId });
}
export function tuiToolsConfigure(
  name: string,
  enabled: boolean,
  sessionId?: string,
): Promise<any> {
  return invoke("tui_tools_configure", { name, enabled, sessionId });
}
export function tuiApprovalRespond(
  sessionId: string,
  response: string,
  all?: boolean,
): Promise<any> {
  return invoke("tui_approval_respond", { sessionId, response, all });
}
export function tuiClarifyRespond(
  sessionId: string,
  answer: string,
  requestId?: string,
): Promise<any> {
  return invoke("tui_clarify_respond", { sessionId, answer, requestId });
}
export function tuiSudoRespond(
  sessionId: string,
  password: string,
  requestId?: string,
): Promise<any> {
  return invoke("tui_sudo_respond", { sessionId, password, requestId });
}
export function tuiSecretRespond(
  sessionId: string,
  value: string,
  requestId?: string,
): Promise<any> {
  return invoke("tui_secret_respond", { sessionId, value, requestId });
}
export function tuiSessionTitle(
  sessionId: string,
): Promise<{ title: string; session_key: string }> {
  return invoke("tui_session_title", { sessionId });
}
export function tuiSessionStatus(sessionId: string): Promise<any> {
  return invoke("tui_session_status", { sessionId });
}
export function tuiSessionUsage(sessionId: string): Promise<any> {
  return invoke("tui_session_usage", { sessionId });
}
export function tuiSessionBranch(
  sessionId: string,
  name?: string,
): Promise<any> {
  return invoke("tui_session_branch", { sessionId, name });
}
export function tuiCompleteSlash(prefix: string): Promise<any> {
  return invoke("tui_complete_slash", { text: prefix });
}
export function tuiCommandsCatalog(): Promise<any> {
  return invoke("tui_commands_catalog");
}
export function voiceTts(text: string): Promise<any> {
  return invoke("voice_tts", { text });
}
export function onTuiEvent(
  callback: (params: { type: string; payload: any; sid?: string }) => void,
): () => void {
  return listenOnce("tui-event", callback);
}
