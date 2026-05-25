import { ipcMain } from "electron";
import { tuiGateway } from "../tui-gateway";
import {
  listProfiles,
  createProfile,
  deleteProfile,
  setActiveProfile,
} from "../profiles";
import {
  readMemory,
  addMemoryEntry,
  updateMemoryEntry,
  removeMemoryEntry,
  writeUserProfile,
  writeMemoryRaw,
} from "../memory";
import { readSoul, writeSoul, resetSoul } from "../soul";
import {
  listModels,
  listTemplates,
  addModel,
  removeModel,
  updateModel,
} from "../models";
import {
  listCachedSessions,
  syncSessionCache,
  updateSessionTitle,
} from "../session-cache";
import { searchSessions, getSessionMessages } from "../sessions";
import {
  sshReadMemory,
  sshAddMemoryEntry,
  sshUpdateMemoryEntry,
  sshRemoveMemoryEntry,
  sshWriteUserProfile,
  sshReadSoul,
  sshWriteSoul,
  sshResetSoul,
  sshSearchSessions,
  sshListProfiles,
  sshCreateProfile,
  sshDeleteProfile,
  sshListCachedSessions,
  sshListModels,
  sshAddModel,
  sshRemoveModel,
  sshUpdateModel,
} from "../ssh-remote";
import { getConnectionConfig } from "../config";
import { withSsh } from "./dispatch";

export function registerDataIPC(): void {
  // Sessions
  ipcMain.handle("list-sessions", async (_event, limit?: number) => {
    const res = await tuiGateway.listSessions(limit);
    return (res as any[]).map((s: any) => ({
      id: s.id,
      title: s.title,
      startedAt: s.started_at,
      source: s.source,
      messageCount: s.message_count,
      model: s.model || "",
    }));
  });

  ipcMain.handle("get-session-messages", async (_event, sessionId: string) => {
    try {
      return getSessionMessages(sessionId);
    } catch (e) {
      console.error("[get-session-messages] error:", e);
      return [];
    }
  });

  ipcMain.handle("delete-session", (_event, sessionId: string) => {
    return tuiGateway.call("session.delete", { session_id: sessionId });
  });

  // Session cache
  ipcMain.handle(
    "list-cached-sessions",
    withSsh(listCachedSessions, sshListCachedSessions),
  );
  ipcMain.handle("sync-session-cache", () => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh)
      return sshListCachedSessions(conn.ssh, 50);
    return syncSessionCache();
  });
  ipcMain.handle(
    "update-session-title",
    (_event, sessionId: string, title: string) =>
      updateSessionTitle(sessionId, title),
  );

  // Session search
  ipcMain.handle("search-sessions", withSsh(searchSessions, sshSearchSessions));

  // Profiles
  ipcMain.handle("list-profiles", withSsh(listProfiles, sshListProfiles));
  ipcMain.handle("create-profile", withSsh(createProfile, sshCreateProfile));
  ipcMain.handle("delete-profile", withSsh(deleteProfile, sshDeleteProfile));
  ipcMain.handle("set-active-profile", async (_event, name: string) => {
    if (getConnectionConfig().mode !== "ssh") {
      setActiveProfile(name);
      tuiGateway.stop();
      tuiGateway.start().catch(console.error);
    }
    return true;
  });

  // Memory
  ipcMain.handle("read-memory", withSsh(readMemory, sshReadMemory));
  ipcMain.handle(
    "add-memory-entry",
    withSsh(addMemoryEntry, sshAddMemoryEntry),
  );
  ipcMain.handle(
    "update-memory-entry",
    withSsh(updateMemoryEntry, sshUpdateMemoryEntry),
  );
  ipcMain.handle(
    "remove-memory-entry",
    withSsh(removeMemoryEntry, sshRemoveMemoryEntry),
  );
  ipcMain.handle(
    "write-user-profile",
    withSsh(writeUserProfile, sshWriteUserProfile),
  );
  ipcMain.handle(
    "write-memory-raw",
    (_event, content: string, profile?: string) => {
      return writeMemoryRaw(content, profile);
    },
  );

  // Soul
  ipcMain.handle("read-soul", withSsh(readSoul, sshReadSoul));
  ipcMain.handle("write-soul", withSsh(writeSoul, sshWriteSoul));
  ipcMain.handle("reset-soul", withSsh(resetSoul, sshResetSoul));

  // Models
  ipcMain.handle("list-models", withSsh(listModels, sshListModels));
  ipcMain.handle("list-templates", () => listTemplates());
  ipcMain.handle("add-model", withSsh(addModel, sshAddModel));
  ipcMain.handle("remove-model", withSsh(removeModel, sshRemoveModel));
  ipcMain.handle("update-model", withSsh(updateModel, sshUpdateModel));
}
