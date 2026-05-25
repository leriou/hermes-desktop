import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Draggable region support for Tauri macOS
if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
  (window as any).electron = {
    process: {
      platform: "darwin" // Force darwin to enable .drag-region in App.tsx
    }
  };
}

function listenOnce(event: string, callback: (payload: any) => void): () => void {
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
  unlisten.then(fn => { unlistenFn = fn; });
  return () => {
    cleaned = true;
    if (unlistenFn) {
      unlistenFn();
    } else {
      unlisten.then(fn => fn());
    }
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...a: any[]) => Promise<any>;

export const hermesAPI: Record<string, AnyFn | ((cb: any) => () => void) | ((file: File) => string)> = {
  // Installation
  checkInstall: () => invoke("check_install"),
  verifyInstall: () => invoke("verify_install"),
  startInstall: () => invoke("start_install"),
  inspectInstallTarget: () => invoke("inspect_install_target"),
  validateHermesHome: (dir: string) => invoke("validate_hermes_home", { dir }),
  adoptHermesHome: (dir: string) => invoke("adopt_hermes_home", { dir }),
  quitApp: () => invoke("quit_app"),
  onInstallProgress: (callback: any) => listenOnce("installprogress", callback),

  // Hermes engine
  getHermesVersion: () => invoke("get_hermes_version"),
  refreshHermesVersion: () => invoke("refresh_hermes_version"),
  runHermesDoctor: () => invoke("run_hermes_doctor"),
  runHermesUpdate: () => invoke("run_hermes_update"),

  // OAuth
  oauthLogin: (provider: string, profile?: string) => invoke("oauth_login", { provider, profile }),
  cancelOAuthLogin: () => invoke("cancel_oauth_login"),
  onOAuthLoginProgress: (callback: any) => listenOnce("oauthloginprogress", callback),

  // Locale
  getLocale: () => invoke("get_locale"),
  setLocale: (locale: string) => invoke("set_locale", { locale }),

  // Environment & Config
  getEnv: (profile?: string) => invoke("get_env", { profile }),
  setEnv: (key: string, value: string, profile?: string) => invoke("set_env", { key, value, profile }),
  getConfig: (key: string, profile?: string) => invoke("get_config", { key, profile }),
  setConfig: (key: string, value: string, profile?: string) => invoke("set_config", { key, value, profile }),
  getHermesHome: (profile?: string) => invoke("get_hermes_home", { profile }),

  // Model config
  getModelConfig: (profile?: string) => invoke("get_model_config", { profile }),
  setModelConfig: (provider: string, model: string, baseUrl: string, profile?: string) => invoke("set_model_config", { provider, model, baseUrl, profile }),

  // Connection mode
  isRemoteMode: () => invoke("is_remote_mode"),
  isRemoteOnlyMode: () => invoke("is_remote_only_mode"),
  getConnectionConfig: () => invoke("get_connection_config"),
  setConnectionConfig: (mode: string, remoteUrl: string, apiKey?: string) => invoke("set_connection_config", { mode, remoteUrl, apiKey }),
  setSshConfig: (host: string, port: number, username: string, keyPath: string, remotePort: number, localPort: number) => invoke("set_ssh_config", { host, port, username, keyPath, remotePort, localPort }),
  testRemoteConnection: (url: string, apiKey?: string) => invoke("test_remote_connection", { url, apiKey }),
  testSshConnection: (host: string, port: number, username: string, keyPath: string, remotePort: number) => invoke("test_ssh_connection", { host, port, username, keyPath, remotePort }),
  isSshTunnelActive: () => invoke("is_ssh_tunnel_active"),
  startSshTunnel: () => invoke("start_ssh_tunnel"),
  stopSshTunnel: () => invoke("stop_ssh_tunnel"),

  // Chat
  sendMessage: (message: string, profile?: string, resumeSessionId?: string, history?: any[], attachments?: any[], contextFolder?: string) => invoke("send_message", { message, profile, resumeSessionId, history, attachments, contextFolder }),
  abortChat: () => invoke("abort_chat"),
  copyToClipboard: (text: string) => invoke("copy_to_clipboard", { text }),
  getPathForFile: (file: File) => (file as any).path || "",
  stageAttachment: (sessionId: string, filename: string, base64Bytes: string) => invoke("stage_attachment", { sessionId, filename, base64Bytes }),
  clearStagedAttachments: (sessionId: string) => invoke("clear_staged_attachments", { sessionId }),
  discoverProviderModels: (provider: string, baseUrl?: string, apiKey?: string, profile?: string) => invoke("discover_provider_models", { provider, baseUrl, apiKey, profile }),

  // Chat events
  onChatChunk: (callback: any) => listenOnce("chatchunk", callback),
  onChatDone: (callback: any) => listenOnce("chatdone", callback),
  onContextMenuCopyChat: (callback: any) => listenOnce("contextmenucopychat", callback),
  onContextMenuSelectBubble: (callback: any) => listenOnce("contextmenuselectbubble", callback),
  onChatToolProgress: (callback: any) => listenOnce("chattoolprogress", callback),
  onChatUsage: (callback: any) => listenOnce("chatusage", callback),
  onChatUsageReset: (callback: any) => listenOnce("chatusagereset", callback),
  onChatError: (callback: any) => listenOnce("chaterror", callback),

  // Gateway
  startGateway: () => invoke("start_gateway"),
  stopGateway: () => invoke("stop_gateway"),
  gatewayStatus: () => invoke("gateway_status"),

  // Platform
  getPlatformEnabled: (profile?: string) => invoke("get_platform_enabled", { profile }),
  setPlatformEnabled: (platform: string, enabled: boolean, profile?: string) => invoke("set_platform_enabled", { platform, enabled, profile }),

  // Sessions
  listSessions: (profile?: string, limit?: number, offset?: number) => invoke("list_sessions", { profile, limit, offset }),
  getSessionMessages: (sessionId: string, profile?: string) => invoke("get_session_messages", { sessionId, profile }),
  deleteSession: (sessionId: string) => invoke("delete_session", { sessionId }),
  listCachedSessions: (profile?: string, limit?: number, offset?: number) => invoke("list_cached_sessions", { profile, limit, offset }),
  syncSessionCache: (profile?: string) => invoke("sync_session_cache", { profile }),
  updateSessionTitle: (sessionId: string, title: string) => invoke("update_session_title", { sessionId, title }),
  searchSessions: (query: string, limit?: number, profile?: string) => invoke("search_sessions", { query, limit, profile }),

  // Profiles
  listProfiles: () => invoke("list_profiles"),
  createProfile: (name: string, clone: boolean) => invoke("create_profile", { name, clone }),
  deleteProfile: (name: string) => invoke("delete_profile", { name }),
  setActiveProfile: (name: string) => invoke("set_active_profile", { name }),

  // Memory
  readMemory: (profile?: string) => invoke("read_memory", { profile }),
  addMemoryEntry: (content: string, profile?: string) => invoke("add_memory_entry", { content, profile }),
  updateMemoryEntry: (index: number, content: string, profile?: string) => invoke("update_memory_entry", { index, content, profile }),
  removeMemoryEntry: (index: number, profile?: string) => invoke("remove_memory_entry", { index, profile }),
  writeUserProfile: (content: string, profile?: string) => invoke("write_user_profile", { content, profile }),
  writeMemory: (content: string, profile?: string) => invoke("write_memory", { content, profile }),

  // Soul
  readSoul: (profile?: string) => invoke("read_soul", { profile }),
  writeSoul: (content: string, profile?: string) => invoke("write_soul", { content, profile }),
  resetSoul: (profile?: string) => invoke("reset_soul", { profile }),

  // Tools
  getToolsets: (profile?: string) => invoke("get_toolsets", { profile }),
  setToolsetEnabled: (key: string, enabled: boolean, profile?: string) => invoke("set_toolset_enabled", { key, enabled, profile }),

  // Skills
  listInstalledSkills: (profile?: string) => invoke("list_installed_skills", { profile }),
  listBundledSkills: (profile?: string) => invoke("list_bundled_skills", { profile }),
  getSkillContent: (skillPath: string) => invoke("get_skill_content", { path: skillPath }),
  installSkill: (identifier: string, profile?: string) => invoke("install_skill", { identifier, profile }),
  uninstallSkill: (name: string, profile?: string) => invoke("uninstall_skill", { name, profile }),

  // Plugins
  getPlugins: (profile?: string) => invoke("get_plugins", { profile }),
  setPluginEnabled: (name: string, enabled: boolean, profile?: string) => invoke("set_plugin_enabled", { name, enabled, profile }),

  // Credential Pool
  getCredentialPool: (profile?: string) => invoke("get_credential_pool", { profile }),
  setCredentialPool: (provider: string, entries: Array<{ key: string; label: string }>, profile?: string) => invoke("set_credential_pool", { provider, entries, profile }),

  // Models
  listModels: (profile?: string) => invoke("list_models", { profile }),
  listTemplates: () => invoke("list_templates"),
  getModelAliases: (profile?: string) => invoke("get_model_aliases", { profile }),
  addModel: (name: string, provider: string, model: string, baseUrl: string, alias?: string, profile?: string) => invoke("add_model", { name, provider, model, baseUrl, alias, profile }),
  removeModel: (id: string, profile?: string) => invoke("remove_model", { id, profile }),
  updateModel: (id: string, fields: Record<string, string>, profile?: string) => invoke("update_model", { id, fields, profile }),

  // Updates
  checkForUpdates: () => invoke("check_for_updates"),
  downloadUpdate: () => invoke("download_update"),
  installUpdate: () => invoke("install_update"),
  getAppVersion: () => invoke("get_app_version"),
  onUpdateAvailable: (callback: any) => listenOnce("updateavailable", callback),
  onUpdateDownloadProgress: (callback: any) => listenOnce("updatedownloadprogress", callback),
  onUpdateDownloaded: (callback: any) => listenOnce("updatedownloaded", callback),
  onUpdateError: (callback: any) => listenOnce("updateerror", callback),

  // Menu shortcuts
  onMenuNewChat: (callback: any) => listenOnce("menunewchat", callback),
  onMenuSearchSessions: (callback: any) => listenOnce("menusearchsessions", callback),

  // Cron Jobs
  listCronJobs: (includeDisabled?: boolean, profile?: string) => invoke("list_cron_jobs", { includeDisabled, profile }),
  createCronJob: (schedule: string, prompt?: string, name?: string, deliver?: string, profile?: string) => invoke("create_cron_job", { schedule, prompt, name, deliver, profile }),
  updateCronJob: (jobId: string, schedule?: string, prompt?: string, name?: string, deliver?: string, profile?: string) => invoke("update_cron_job", { jobId, schedule, prompt, name, deliver, profile }),
  removeCronJob: (jobId: string, profile?: string) => invoke("remove_cron_job", { jobId, profile }),
  pauseCronJob: (jobId: string, profile?: string) => invoke("pause_cron_job", { jobId, profile }),
  resumeCronJob: (jobId: string, profile?: string) => invoke("resume_cron_job", { jobId, profile }),
  triggerCronJob: (jobId: string, profile?: string) => invoke("trigger_cron_job", { jobId, profile }),
  listCronHistory: (profile?: string) => invoke("list_cron_history", { profile }),
  readCronOutput: (path: string, profile?: string) => invoke("read_cron_output", { path, profile }),

  // Kanban
  kanbanListBoards: (includeArchived?: boolean, profile?: string) => invoke("kanban_list_boards", { includeArchived, profile }),
  kanbanCurrentBoard: (profile?: string) => invoke("kanban_current_board", { profile }),
  kanbanSwitchBoard: (slug: string, profile?: string) => invoke("kanban_switch_board", { slug, profile }),
  kanbanCreateBoard: (slug: string, name?: string, switchAfter?: boolean, profile?: string) => invoke("kanban_create_board", { slug, name, switchAfter, profile }),
  kanbanRemoveBoard: (slug: string, hardDelete?: boolean, profile?: string) => invoke("kanban_remove_board", { slug, hardDelete, profile }),
  kanbanListTasks: (filters?: any) => invoke("kanban_list_tasks", { filters }),
  kanbanGetTask: (taskId: string, profile?: string) => invoke("kanban_get_task", { taskId, profile }),
  kanbanCreateTask: (input: any, profile?: string) => invoke("kanban_create_task", { input, profile }),
  selectFolder: () => invoke("select_folder"),
  selectHermesFolder: () => invoke("select_hermes_folder"),
  kanbanAssignTask: (taskId: string, assignee: string | null, profile?: string) => invoke("kanban_assign_task", { taskId, assignee, profile }),
  kanbanCompleteTask: (taskId: string, result?: string, profile?: string) => invoke("kanban_complete_task", { taskId, result, profile }),
  kanbanBlockTask: (taskId: string, reason?: string, profile?: string) => invoke("kanban_block_task", { taskId, reason, profile }),
  kanbanUnblockTask: (taskId: string, profile?: string) => invoke("kanban_unblock_task", { taskId, profile }),
  kanbanArchiveTask: (taskId: string, profile?: string) => invoke("kanban_archive_task", { taskId, profile }),
  kanbanSpecifyTask: (taskId: string, profile?: string) => invoke("kanban_specify_task", { taskId, profile }),
  kanbanReclaimTask: (taskId: string, reason?: string, profile?: string) => invoke("kanban_reclaim_task", { taskId, reason, profile }),
  kanbanCommentTask: (taskId: string, body: string, profile?: string) => invoke("kanban_comment_task", { taskId, body, profile }),
  kanbanDispatchOnce: (dryRun?: boolean, profile?: string) => invoke("kanban_dispatch_once", { dryRun, profile }),

  // External & File operations
  openExternal: (url: string) => invoke("open_external", { url }),
  runHermesBackup: (profile?: string) => invoke("run_hermes_backup", { profile }),
  runHermesImport: (archivePath: string, profile?: string) => invoke("run_hermes_import", { archivePath, profile }),
  runHermesDump: () => invoke("run_hermes_dump"),
  discoverMemoryProviders: (profile?: string) => invoke("discover_memory_providers", { profile }),
  listMcpServers: (profile?: string) => invoke("list_mcp_servers", { profile }),
  readLogs: (logFile?: string, lines?: number) => invoke("read_logs", { logFile, lines }),

  // Config YAML editor
  readConfigYaml: (profile?: string) => invoke("read_config_yaml", { profile }),
  writeConfigYaml: (content: string, profile?: string) => invoke("write_config_yaml", { content, profile }),

  // TUI Gateway
  tuiSlashExec: (sessionId: string, command: string) => invoke("tui_slash_exec", { sessionId, command }),
  tuiCommandDispatch: (sessionId: string, name: string, arg?: string) => invoke("tui_command_dispatch", { sessionId, name, arg }),
  tuiCompress: (sessionId: string, focusTopic?: string) => invoke("tui_compress", { sessionId, focusTopic }),
  tuiSetGoal: (sessionId: string, goal: string) => invoke("tui_set_goal", { sessionId, goal }),
  tuiSetModel: (sessionId: string, model: string) => invoke("tui_set_model", { sessionId, model }),
  tuiSteer: (sessionId: string, text: string) => invoke("tui_steer", { sessionId, text }),
  tuiCreateSession: (model?: string) => invoke("tui_create_session", { model }),
  tuiResumeSession: (sessionId: string) => invoke("tui_resume_session", { sessionId }),
  tuiSessionHistory: (sessionId: string) => invoke("tui_session_history", { sessionId }),
  tuiSubmitPrompt: (sessionId: string, text: string) => invoke("tui_submit_prompt", { sessionId, text }),
  tuiInterrupt: (sessionId: string) => invoke("tui_interrupt", { sessionId }),
  tuiUndo: (sessionId: string) => invoke("tui_undo", { sessionId }),
  tuiToolsList: (sessionId?: string) => invoke("tui_tools_list", { sessionId }),
  tuiToolsShow: (name?: string, sessionId?: string) => invoke("tui_tools_show", { name, sessionId }),
  tuiToolsConfigure: (name: string, enabled: boolean, sessionId?: string) => invoke("tui_tools_configure", { name, enabled, sessionId }),
  tuiApprovalRespond: (sessionId: string, response: string, all?: boolean) => invoke("tui_approval_respond", { sessionId, response, all }),
  tuiSessionStatus: (sessionId: string) => invoke("tui_session_status", { sessionId }),
  tuiSessionUsage: (sessionId: string) => invoke("tui_session_usage", { sessionId }),
  tuiSessionBranch: (sessionId: string, name?: string) => invoke("tui_session_branch", { sessionId, name }),
  tuiCompleteSlash: (prefix: string) => invoke("tui_complete_slash", { text: prefix }),
  tuiCommandsCatalog: () => invoke("tui_commands_catalog"),
  tuiClarifyRespond: (sessionId: string, answer: string, requestId?: string) => invoke("tui_clarify_respond", { sessionId, answer, requestId }),
  tuiSessionTitle: (sessionId: string) => invoke("tui_session_title", { sessionId }),
  voiceTts: (text: string) => invoke("voice_tts", { text }),
  onTuiEvent: (callback: any) => listenOnce("tui-event", callback),
};
