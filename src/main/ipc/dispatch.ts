import type { IpcMainInvokeEvent } from "electron";
import { getConnectionConfig } from "../config";
import type { SshConnectionConfig } from "../config";

/**
 * Creates an IPC handler that dispatches to either a local or SSH implementation
 * based on the current connection config. Replaces the repeated pattern:
 *
 *   ipcMain.handle("method", (_event, ...args) => {
 *     const conn = getConnectionConfig();
 *     if (conn.mode === "ssh" && conn.ssh) return sshFn(conn.ssh, ...args);
 *     return localFn(...args);
 *   });
 */
export function withSsh<A extends any[]>(
  localFn: (...args: A) => any,
  sshFn: (ssh: SshConnectionConfig, ...args: A) => any,
) {
  return async (_event: IpcMainInvokeEvent, ...args: A): Promise<any> => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshFn(conn.ssh, ...args);
    return localFn(...args);
  };
}
