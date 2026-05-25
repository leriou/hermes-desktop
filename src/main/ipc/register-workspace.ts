import { ipcMain, dialog, BrowserWindow, shell } from "electron";
import { join } from "path";
import { homedir } from "os";
import { existsSync, statSync, readdirSync } from "fs";
import { readFile } from "fs/promises";
import { isAllowedExternalUrl } from "../security";
import { getToolsets, setToolsetEnabled } from "../tools";
import { getPlugins, enablePlugin, disablePlugin } from "../plugins";
import {
  listInstalledSkills,
  listBundledSkills,
  getSkillContent,
  installSkill,
  uninstallSkill,
} from "../skills";
import {
  listCronJobs,
  createCronJob,
  updateCronJob,
  removeCronJob,
  pauseCronJob,
  resumeCronJob,
  triggerCronJob,
} from "../cronjobs";
import {
  listBoards as kanbanListBoards,
  currentBoard as kanbanCurrentBoard,
  switchBoard as kanbanSwitchBoard,
  createBoard as kanbanCreateBoard,
  removeBoard as kanbanRemoveBoard,
  listTasks as kanbanListTasks,
  getTask as kanbanGetTask,
  createTask as kanbanCreateTask,
  assignTask as kanbanAssignTask,
  completeTask as kanbanCompleteTask,
  blockTask as kanbanBlockTask,
  unblockTask as kanbanUnblockTask,
  archiveTask as kanbanArchiveTask,
  specifyTask as kanbanSpecifyTask,
  reclaimTask as kanbanReclaimTask,
  commentTask as kanbanCommentTask,
  dispatchOnce as kanbanDispatchOnce,
  type CreateTaskInput,
} from "../kanban";
import { getCredentialPool, setCredentialPool } from "../config";
import {
  runHermesBackup,
  runHermesImport,
  runHermesDump,
  listMcpServers,
  discoverMemoryProviders,
  readLogs,
} from "../installer";
import {
  sshListInstalledSkills,
  sshGetSkillContent,
  sshInstallSkill,
  sshUninstallSkill,
  sshListBundledSkills,
  sshGetToolsets,
  sshSetToolsetEnabled,
  sshRunDump,
  sshDiscoverMemoryProviders,
  sshReadLogs,
} from "../ssh-remote";
import { profileHome } from "../utils";
import { withSsh } from "./dispatch";

export function registerWorkspaceIPC(): void {
  // Tools
  ipcMain.handle("get-toolsets", withSsh(getToolsets, sshGetToolsets));
  ipcMain.handle(
    "set-toolset-enabled",
    withSsh(setToolsetEnabled, sshSetToolsetEnabled),
  );

  // Skills
  ipcMain.handle(
    "list-installed-skills",
    withSsh(listInstalledSkills, sshListInstalledSkills),
  );
  ipcMain.handle(
    "list-bundled-skills",
    withSsh(listBundledSkills, sshListBundledSkills),
  );
  ipcMain.handle(
    "get-skill-content",
    withSsh(getSkillContent, sshGetSkillContent),
  );
  ipcMain.handle("install-skill", withSsh(installSkill, sshInstallSkill));
  ipcMain.handle("uninstall-skill", withSsh(uninstallSkill, sshUninstallSkill));

  // Plugins
  ipcMain.handle("get-plugins", (_event, profile?: string) =>
    getPlugins(profile),
  );
  ipcMain.handle(
    "set-plugin-enabled",
    (_event, name: string, enabled: boolean, profile?: string) => {
      return enabled
        ? enablePlugin(name, profile)
        : disablePlugin(name, profile);
    },
  );

  // Credential Pool
  ipcMain.handle("get-credential-pool", (_event, profile?: string) =>
    getCredentialPool(profile),
  );
  ipcMain.handle(
    "set-credential-pool",
    (
      _event,
      provider: string,
      entries: Array<{ key: string; label: string }>,
      profile?: string,
    ) => {
      setCredentialPool(provider, entries, profile);
      return true;
    },
  );

  // Cron Jobs
  ipcMain.handle(
    "list-cron-jobs",
    (_event, includeDisabled?: boolean, profile?: string) =>
      listCronJobs(includeDisabled, profile),
  );
  ipcMain.handle(
    "create-cron-job",
    (
      _event,
      schedule: string,
      prompt?: string,
      name?: string,
      deliver?: string,
      profile?: string,
    ) => createCronJob(schedule, prompt, name, deliver, profile),
  );
  ipcMain.handle(
    "update-cron-job",
    (
      _event,
      jobId: string,
      schedule?: string,
      prompt?: string,
      name?: string,
      deliver?: string,
      profile?: string,
    ) => updateCronJob(jobId, schedule, prompt, name, deliver, profile),
  );
  ipcMain.handle(
    "remove-cron-job",
    withSsh(removeCronJob, async () => {
      throw new Error("Not supported over SSH");
    }),
  );
  ipcMain.handle("pause-cron-job", (_event, jobId: string, profile?: string) =>
    pauseCronJob(jobId, profile),
  );
  ipcMain.handle("resume-cron-job", (_event, jobId: string, profile?: string) =>
    resumeCronJob(jobId, profile),
  );
  ipcMain.handle(
    "trigger-cron-job",
    (_event, jobId: string, profile?: string) => triggerCronJob(jobId, profile),
  );

  ipcMain.handle("list-cron-history", async (_event, profile?: string) => {
    const base = join(profileHome(profile), "cron", "output");
    if (!existsSync(base)) return [];
    const jobNames = new Map<string, string>();
    try {
      const raw = await readFile(
        join(profileHome(profile), "cron", "jobs.json"),
        "utf-8",
      );
      const parsed = JSON.parse(raw);
      for (const j of Array.isArray(parsed) ? parsed : parsed.jobs || []) {
        if (j.id) jobNames.set(String(j.id), j.name || "");
      }
    } catch {
      /* ignore */
    }

    const entries: Array<{
      jobId: string;
      jobName: string;
      runAt: string;
      status: "ok" | "fail" | "empty";
      size: number;
      path: string;
    }> = [];
    for (const jobIdDir of readdirSync(base)) {
      const dir = join(base, jobIdDir);
      if (!statSync(dir).isDirectory()) continue;
      for (const fname of readdirSync(dir)) {
        const full = join(dir, fname);
        const st = statSync(full);
        const m = fname.match(/^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/);
        const runAt = m
          ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}`
          : fname.replace(/\.md$/, "");
        entries.push({
          jobId: jobIdDir,
          jobName: jobNames.get(jobIdDir) || jobIdDir.slice(0, 8),
          runAt,
          status: st.size === 0 ? "empty" : "ok",
          size: st.size,
          path: full,
        });
      }
    }
    entries.sort((a, b) => b.runAt.localeCompare(a.runAt));
    return entries;
  });

  ipcMain.handle("read-cron-output", async (_event, path: string) => {
    try {
      const base = join(profileHome(undefined), "cron", "output");
      if (!path.startsWith(base)) return "Access denied";
      return await readFile(path, "utf-8");
    } catch {
      return "";
    }
  });

  // Kanban
  ipcMain.handle(
    "kanban-list-boards",
    (_event, includeArchived?: boolean, profile?: string) =>
      kanbanListBoards(includeArchived, profile),
  );
  ipcMain.handle("kanban-current-board", (_event, profile?: string) =>
    kanbanCurrentBoard(profile),
  );
  ipcMain.handle(
    "kanban-switch-board",
    (_event, slug: string, profile?: string) =>
      kanbanSwitchBoard(slug, profile),
  );
  ipcMain.handle(
    "kanban-create-board",
    (
      _event,
      slug: string,
      name?: string,
      switchAfter?: boolean,
      profile?: string,
    ) => kanbanCreateBoard(slug, name, switchAfter, profile),
  );
  ipcMain.handle(
    "kanban-remove-board",
    (_event, slug: string, hardDelete?: boolean, profile?: string) =>
      kanbanRemoveBoard(slug, hardDelete, profile),
  );
  ipcMain.handle(
    "kanban-list-tasks",
    (
      _event,
      filters?: {
        status?: string;
        assignee?: string;
        tenant?: string;
        includeArchived?: boolean;
        profile?: string;
      },
    ) => kanbanListTasks(filters || {}),
  );
  ipcMain.handle(
    "kanban-get-task",
    (_event, taskId: string, profile?: string) =>
      kanbanGetTask(taskId, profile),
  );
  ipcMain.handle(
    "kanban-create-task",
    (_event, input: CreateTaskInput, profile?: string) =>
      kanbanCreateTask(input, profile),
  );

  ipcMain.handle("select-folder", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ["openDirectory"] })
      : await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("select-hermes-folder", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const defaultPath = join(homedir(), ".hermes");
    const opts: Electron.OpenDialogOptions = {
      defaultPath: existsSync(defaultPath) ? defaultPath : homedir(),
      properties: ["openDirectory", "showHiddenFiles"],
    };
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(
    "kanban-assign-task",
    (_event, taskId: string, assignee: string | null, profile?: string) =>
      kanbanAssignTask(taskId, assignee, profile),
  );
  ipcMain.handle(
    "kanban-complete-task",
    (_event, taskId: string, result?: string, profile?: string) =>
      kanbanCompleteTask(taskId, result, profile),
  );
  ipcMain.handle(
    "kanban-block-task",
    (_event, taskId: string, reason?: string, profile?: string) =>
      kanbanBlockTask(taskId, reason, profile),
  );
  ipcMain.handle(
    "kanban-unblock-task",
    (_event, taskId: string, profile?: string) =>
      kanbanUnblockTask(taskId, profile),
  );
  ipcMain.handle(
    "kanban-archive-task",
    (_event, taskId: string, profile?: string) =>
      kanbanArchiveTask(taskId, profile),
  );
  ipcMain.handle(
    "kanban-specify-task",
    (_event, taskId: string, profile?: string) =>
      kanbanSpecifyTask(taskId, profile),
  );
  ipcMain.handle(
    "kanban-reclaim-task",
    (_event, taskId: string, reason?: string, profile?: string) =>
      kanbanReclaimTask(taskId, reason, profile),
  );
  ipcMain.handle(
    "kanban-comment-task",
    (_event, taskId: string, body: string, profile?: string) =>
      kanbanCommentTask(taskId, body, profile),
  );
  ipcMain.handle(
    "kanban-dispatch-once",
    (_event, dryRun?: boolean, profile?: string) =>
      kanbanDispatchOnce(dryRun, profile),
  );

  // Shell
  ipcMain.handle("open-external", (_event, url: string) => {
    if (!isAllowedExternalUrl(url)) {
      console.warn("[SECURITY] Blocked unsafe external URL");
      return;
    }
    shell.openExternal(url).catch((err: Error) => {
      console.error("[SECURITY] Failed to open external URL:", err);
    });
  });

  // Backup / Import
  ipcMain.handle("run-hermes-backup", (_event, profile?: string) =>
    runHermesBackup(profile),
  );
  ipcMain.handle(
    "run-hermes-import",
    (_event, archivePath: string, profile?: string) =>
      runHermesImport(archivePath, profile),
  );

  // Debug dump
  ipcMain.handle("run-hermes-dump", withSsh(runHermesDump, sshRunDump));

  // MCP servers
  ipcMain.handle("list-mcp-servers", (_event, profile?: string) =>
    listMcpServers(profile),
  );

  // Memory providers
  ipcMain.handle(
    "discover-memory-providers",
    withSsh(discoverMemoryProviders, sshDiscoverMemoryProviders),
  );

  // Log viewer
  ipcMain.handle("read-logs", withSsh(readLogs, sshReadLogs));
}
