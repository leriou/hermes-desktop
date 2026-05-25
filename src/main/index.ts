import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  Menu,
} from "electron";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import type { AppUpdater } from "electron-updater";

// Chromium performance flags — must be set before ready
app.commandLine.appendSwitch("enable-features", "PlatformEncryptedDolbyVision,SkiaGraphite");
app.commandLine.appendSwitch("disable-features", "MediaRouter,DialMediaRouteProvider,Translate,TranslateUI");
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=1024");
app.commandLine.appendSwitch("disable-background-networking");
app.commandLine.appendSwitch("disable-component-update");
app.commandLine.appendSwitch("disable-default-apps");
app.commandLine.appendSwitch("disable-extensions");
app.commandLine.appendSwitch("disable-print-preview");
app.commandLine.appendSwitch("disable-sync");
import icon from "../../resources/icon.png?asset";
import { updaterLogger } from "./updater-log";
import { stopGateway, setSshRemoteApiKey } from "./hermes";
import { startSshTunnel, stopSshTunnel } from "./ssh-tunnel";
import { getConnectionConfig } from "./config";
import {
  sshGatewayStatus,
  sshStartGateway,
  sshReadRemoteApiKey,
} from "./ssh-remote";
import {
  hardenAttachedWebContents,
  hardenWebviewPreferences,
  isAllowedAppNavigationUrl,
  isAllowedExternalUrl,
  isAllowedWebviewUrl,
} from "./security";

process.on("uncaughtException", (err) => {
  console.error("[MAIN UNCAUGHT]", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[MAIN UNHANDLED REJECTION]", reason);
});

let mainWindow: BrowserWindow | null = null;

function openExternalUrl(rawUrl: unknown): void {
  if (!isAllowedExternalUrl(rawUrl)) {
    console.warn("[SECURITY] Blocked unsafe external URL");
    return;
  }

  shell.openExternal(rawUrl).catch((err) => {
    console.error("[SECURITY] Failed to open external URL:", err);
  });
}

// ── Window bounds persistence ──────────────────────────────────────────
const BOUNDS_PATH = join(app.getPath("userData"), "window-bounds.json");

interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

function loadWindowBounds(): WindowBounds | null {
  try {
    if (!existsSync(BOUNDS_PATH)) return null;
    return JSON.parse(readFileSync(BOUNDS_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function saveWindowBounds(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const maximized = mainWindow.isMaximized();
    const bounds: WindowBounds = maximized
      ? { width: 1100, height: 850, maximized }
      : { ...mainWindow.getBounds(), maximized };
    writeFileSync(BOUNDS_PATH, JSON.stringify(bounds));
  } catch {
    // best-effort
  }
}

function createWindow(): void {
  const rendererHtmlPath = join(__dirname, "../renderer/index.html");
  const saved = loadWindowBounds();

  mainWindow = new BrowserWindow({
    width: saved?.width ?? 1100,
    height: saved?.height ?? 850,
    ...(saved?.x !== undefined && saved?.y !== undefined ? { x: saved.x, y: saved.y } : {}),
    minWidth: 900,
    minHeight: 820,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : undefined,
    ...(process.platform === "darwin"
      ? { trafficLightPosition: { x: 16, y: 16 } }
      : {}),
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    if (saved?.maximized) mainWindow!.maximize();
    mainWindow!.show();
    // Start TUI Gateway in the background as soon as the window is ready
    tuiGateway.start().catch((err) => {
      console.error("[TUI GATEWAY] Failed to start at launch:", err);
    });
  });

  mainWindow.on("close", saveWindowBounds);

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(
      "[CRASH] Renderer process gone:",
      details.reason,
      details.exitCode,
    );
  });

  mainWindow.webContents.on(
    "console-message",
    (_event, level, message, line, sourceId) => {
      if (level >= 2) {
        console.error(`[RENDERER ERROR] ${message} (${sourceId}:${line})`);
      }
    },
  );

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription) => {
      console.error("[LOAD FAIL]", errorCode, errorDescription);
    },
  );

  mainWindow.webContents.setWindowOpenHandler((details) => {
    openExternalUrl(details.url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (
      isAllowedAppNavigationUrl(
        url,
        rendererHtmlPath,
        is.dev ? process.env["ELECTRON_RENDERER_URL"] : undefined,
      )
    ) {
      return;
    }

    event.preventDefault();
    openExternalUrl(url);
  });

  mainWindow.webContents.on(
    "will-attach-webview",
    (event, webPreferences, params) => {
      if (!isAllowedWebviewUrl(params.src)) {
        event.preventDefault();
        console.warn("[SECURITY] Blocked webview attachment for untrusted URL");
        return;
      }

      hardenWebviewPreferences(webPreferences);
    },
  );

  // Right-click context menu (issue #298): native Cut/Copy/Paste/Select All
  // via Electron roles — they act on the focused field / selection and work
  // across the whole app — plus two items to copy the whole conversation.
  mainWindow.webContents.on("context-menu", (_event, params) => {
    const { editFlags, isEditable } = params;
    const template: Electron.MenuItemConstructorOptions[] = [];
    if (isEditable) {
      template.push(
        { role: "cut", enabled: editFlags.canCut },
        { role: "copy", enabled: editFlags.canCopy },
        { role: "paste", enabled: editFlags.canPaste },
        { type: "separator" },
        // The selectAll role scopes correctly to the focused input field.
        { role: "selectAll" },
      );
    } else {
      template.push(
        { role: "copy", enabled: editFlags.canCopy },
        { type: "separator" },
        // The selectAll role would select the entire window for non-editable
        // content — scope it to the message bubble under the cursor instead.
        {
          label: "Select All",
          click: () =>
            mainWindow?.webContents.send("context-menu-select-bubble", {
              x: params.x,
              y: params.y,
            }),
        },
      );
    }
    template.push(
      { type: "separator" },
      {
        label: "Copy entire chat (text)",
        click: () =>
          mainWindow?.webContents.send("context-menu-copy-chat", "text"),
      },
      {
        label: "Copy entire chat (Markdown)",
        click: () =>
          mainWindow?.webContents.send("context-menu-copy-chat", "markdown"),
      },
    );
    Menu.buildFromTemplate(template).popup();
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(rendererHtmlPath);
  }
}

import { tuiGateway } from "./tui-gateway";
import { registerChatIPC } from "./ipc/register-chat";
import { registerInstallIPC } from "./ipc/register-install";
import { registerConfigIPC } from "./ipc/register-config";
import { registerDataIPC } from "./ipc/register-data";
import { registerWorkspaceIPC } from "./ipc/register-workspace";

function setupIPC(): void {
  registerChatIPC(mainWindow);
  registerInstallIPC(mainWindow);
  registerConfigIPC();
  registerDataIPC();
  registerWorkspaceIPC();
}

function buildMenu(): void {
  const isMac = process.platform === "darwin";

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "Chat",
      submenu: [
        {
          label: "New Chat",
          accelerator: "CmdOrCtrl+N",
          click: (): void => {
            mainWindow?.webContents.send("menu-new-chat");
          },
        },
        { type: "separator" },
        {
          label: "Search Sessions",
          accelerator: "CmdOrCtrl+K",
          click: (): void => {
            mainWindow?.webContents.send("menu-search-sessions");
          },
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(is.dev
          ? [
              { type: "separator" as const },
              { role: "reload" as const },
              { role: "toggleDevTools" as const },
            ]
          : []),
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [{ type: "separator" as const }, { role: "front" as const }]
          : [{ role: "close" as const }]),
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Hermes Agent on GitHub",
          click: (): void => {
            openExternalUrl("https://github.com/NousResearch/hermes-agent/");
          },
        },
        {
          label: "Report an Issue",
          click: (): void => {
            openExternalUrl("https://github.com/fathah/hermes-desktop/issues");
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function setupUpdater(): void {
  // IPC handlers must always be registered to avoid invoke errors
  ipcMain.handle("get-app-version", () => app.getVersion());

  // Portable Windows builds set PORTABLE_EXECUTABLE_DIR. They have no
  // install location for electron-updater to replace in place, so an
  // update check just fails and surfaces a spurious "Update failed".
  // Skip the updater for them (users update by downloading a new
  // portable .exe), same as dev mode.
  const isPortableBuild = !!process.env.PORTABLE_EXECUTABLE_DIR;

  if (!app.isPackaged || isPortableBuild) {
    // Skip auto-update in dev mode and portable builds
    ipcMain.handle("check-for-updates", async () => null);
    ipcMain.handle("download-update", () => true);
    ipcMain.handle("install-update", () => {});
    return;
  }

  // Dynamic import to avoid electron-updater issues in dev mode
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { autoUpdater } = require("electron-updater") as {
    autoUpdater: AppUpdater;
  };

  // Log the updater's own lifecycle to <userData>/logs/updater.log so a
  // failed update (e.g. issue #271) leaves something to diagnose.
  autoUpdater.logger = updaterLogger;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    mainWindow?.webContents.send("update-available", {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    mainWindow?.webContents.send("update-download-progress", {
      percent: Math.round(progress.percent),
    });
  });

  autoUpdater.on("update-downloaded", () => {
    mainWindow?.webContents.send("update-downloaded");
  });

  autoUpdater.on("error", (err) => {
    mainWindow?.webContents.send("update-error", err.message);
  });

  ipcMain.handle("check-for-updates", async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return result?.updateInfo?.version || null;
    } catch {
      return null;
    }
  });

  ipcMain.handle("download-update", async () => {
    try {
      await autoUpdater.downloadUpdate();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      mainWindow?.webContents.send("update-error", message);
      return false;
    }
  });

  ipcMain.handle("install-update", () => {
    // Bracket the suspect call: if the log shows this line but the app
    // never relaunches, the failure is in quitAndInstall / the installer.
    updaterLogger.info(
      "Restart requested by user — calling quitAndInstall(isSilent=false, isForceRunAfter=true)",
    );
    autoUpdater.quitAndInstall(false, true);
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 5000);
}

app.whenReady().then(() => {
  app.name = "Hermes";
  electronApp.setAppUserModelId("com.nousresearch.hermes");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  app.on("web-contents-created", (_event, contents) => {
    if (contents.getType() === "webview") {
      hardenAttachedWebContents(contents);
    }
  });

  buildMenu();
  setupIPC();
  createWindow();
  setupUpdater();

  // Auto-start SSH tunnel if configured
  const conn = getConnectionConfig();
  if (conn.mode === "ssh" && conn.ssh.host) {
    (async () => {
      if (!(await sshGatewayStatus(conn.ssh))) {
        await sshStartGateway(conn.ssh);
      }
      await startSshTunnel(conn.ssh);
      const key = await sshReadRemoteApiKey(conn.ssh);
      setSshRemoteApiKey(key);
    })().catch((err) => {
      console.error("[SSH TUNNEL] Failed to start on launch:", err);
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    stopGateway();
    stopSshTunnel();
    app.quit();
  }
});

app.on("before-quit", () => {
  stopGateway();
  stopSshTunnel();
});
