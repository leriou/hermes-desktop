import { ipcMain, shell, clipboard, type BrowserWindow, app } from "electron";
import {
  checkInstallStatus,
  verifyInstall,
  runInstall,
  inspectInstallTarget,
  validateHermesHome,
  setHermesHomeOverride,
  getHermesVersion,
  clearVersionCache,
  runHermesDoctor,
  runHermesUpdate,
  type InstallProgress,
} from "../installer";
import {
  runHermesAuthLogin,
  cancelHermesAuthLogin,
  detectDeviceCode,
} from "../hermes-auth";
import {
  sshGetHermesVersion,
  sshRunDoctor,
  sshRunUpdate,
  sshStartGateway,
  sshReadRemoteApiKey,
} from "../ssh-remote";
import { startSshTunnel } from "../ssh-tunnel";
import { setSshRemoteApiKey } from "../hermes";
import { getConnectionConfig } from "../config";
import { isAllowedExternalUrl } from "../security";

export function registerInstallIPC(mainWindow: BrowserWindow | null): void {
  ipcMain.handle("check-install", () => checkInstallStatus());
  ipcMain.handle("verify-install", () => verifyInstall());

  ipcMain.handle("start-install", async (event) => {
    try {
      await runInstall((progress: InstallProgress) => {
        event.sender.send("install-progress", progress);
      }, mainWindow);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle("inspect-install-target", () => inspectInstallTarget());
  ipcMain.handle("validate-hermes-home", (_event, dir: string) =>
    validateHermesHome(dir),
  );
  ipcMain.handle("adopt-hermes-home", (_event, dir: string) => {
    if (!validateHermesHome(dir)) return false;
    setHermesHomeOverride(dir);
    return true;
  });
  ipcMain.handle("quit-app", () => app.quit());

  // Hermes engine info
  ipcMain.handle("get-hermes-version", async () => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshGetHermesVersion(conn.ssh);
    return getHermesVersion();
  });
  ipcMain.handle("refresh-hermes-version", async () => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshGetHermesVersion(conn.ssh);
    clearVersionCache();
    return getHermesVersion();
  });
  ipcMain.handle("run-hermes-doctor", () => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshRunDoctor(conn.ssh);
    return runHermesDoctor();
  });
  ipcMain.handle("run-hermes-update", async (event) => {
    try {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh) {
        event.sender.send("install-progress", {
          step: 1,
          totalSteps: 1,
          title: "Updating remote Hermes Agent",
          detail: "Running hermes update over SSH...",
          log: "Running hermes update over SSH...\n",
        });
        await sshRunUpdate(conn.ssh);
        await sshStartGateway(conn.ssh);
        await startSshTunnel(conn.ssh);
        const key = await sshReadRemoteApiKey(conn.ssh);
        setSshRemoteApiKey(key);
        return { success: true };
      }
      await runHermesUpdate((progress: InstallProgress) => {
        event.sender.send("install-progress", progress);
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // OAuth provider sign-in
  ipcMain.handle("oauth-login", (event, provider: string, profile?: string) => {
    let buffer = "";
    let deviceHandled = false;
    return runHermesAuthLogin(
      provider,
      (chunk) => {
        if (event.sender.isDestroyed()) return;
        event.sender.send("oauth-login-progress", chunk);
        if (deviceHandled) return;
        buffer += chunk;
        const device = detectDeviceCode(buffer);
        if (device) {
          deviceHandled = true;
          if (isAllowedExternalUrl(device.url)) {
            shell.openExternal(device.url).catch(() => {});
          }
          clipboard.writeText(device.code);
          event.sender.send(
            "oauth-login-progress",
            `\n→ Code ${device.code} copied to clipboard — opening browser...\n`,
          );
        }
      },
      profile,
    );
  });
  ipcMain.handle("oauth-login-cancel", () => cancelHermesAuthLogin());
}
