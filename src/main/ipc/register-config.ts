import { ipcMain, clipboard } from "electron";
import { join } from "path";
import { readFile, writeFile } from "fs/promises";
import { tuiGateway } from "../tui-gateway";
import { HERMES_CONFIG_FILE } from "../installer";
import {
  readEnv,
  setEnvValue,
  getConfigValue,
  setConfigValue,
  getModelAliases,
  getHermesHome,
  getConnectionConfig,
  getPublicConnectionConfig,
  resolveConnectionApiKeyUpdate,
  setConnectionConfig,
  getPlatformEnabled,
  setPlatformEnabled,
} from "../config";
import {
  isRemoteMode,
  isRemoteOnlyMode,
  isGatewayRunning,
  startGateway,
  stopGateway,
  testRemoteConnection,
  restartGateway,
} from "../hermes";
import {
  startSshTunnel,
  stopSshTunnel,
  testSshConnection,
  isSshTunnelActive,
} from "../ssh-tunnel";
import {
  sshReadEnv,
  sshSetEnvValue,
  sshGetConfigValue,
  sshSetConfigValue,
  sshGetHermesHome,
  sshGatewayStatus,
  sshStartGateway,
  sshStopGateway,
  sshReadRemoteApiKey,
  sshGetPlatformEnabled,
  sshSetPlatformEnabled,
} from "../ssh-remote";
import { getAppLocale, setAppLocale } from "../locale";
import { setSshRemoteApiKey } from "../hermes";
import { profileHome } from "../utils";
import type { AppLocale } from "../../shared/i18n/types";
import { withSsh } from "./dispatch";

export function registerConfigIPC(): void {
  // Locale
  ipcMain.handle("get-locale", () => getAppLocale());
  ipcMain.handle("set-locale", (_event, locale: AppLocale) =>
    setAppLocale(locale),
  );

  // Environment & config (SSH-aware)
  ipcMain.handle("get-env", withSsh(readEnv, sshReadEnv));

  ipcMain.handle(
    "set-env",
    async (_event, key: string, value: string, profile?: string) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh) {
        await sshSetEnvValue(conn.ssh, key, value, profile);
        return true;
      }
      setEnvValue(key, value, profile);
      const looksLikeCredential =
        key.endsWith("_API_KEY") ||
        key.endsWith("_TOKEN") ||
        key === "HF_TOKEN";
      if (isGatewayRunning() && looksLikeCredential) {
        restartGateway(profile);
      }
      return true;
    },
  );

  ipcMain.handle("get-config", withSsh(getConfigValue, sshGetConfigValue));
  ipcMain.handle("set-config", withSsh(setConfigValue, sshSetConfigValue));
  ipcMain.handle("get-model-aliases", (_event, profile?: string) =>
    getModelAliases(profile),
  );
  ipcMain.handle("get-hermes-home", withSsh(getHermesHome, sshGetHermesHome));

  // Model config — goes through TUI gateway
  ipcMain.handle("get-model-config", async () => {
    const res = await tuiGateway.call("model.options", {});
    return {
      model: res.current_model || "",
      provider: res.current_provider || "auto",
      baseUrl: res.current_base_url || "",
    };
  });

  ipcMain.handle(
    "set-model-config",
    async (_event, provider: string, model: string, baseUrl: string) => {
      try {
        await tuiGateway.configSet("model", model);
      } catch (err: any) {
        if (err?.code === 4009) {
          const sid = (await tuiGateway.call("session.most_recent", {}))
            .session_id;
          if (sid) await tuiGateway.execSlash(sid, `/model ${model}`);
        }
      }
      await tuiGateway.call("config.set", {
        key: "agent.provider",
        value: provider,
      });
      if (baseUrl) {
        await tuiGateway.call("config.set", {
          key: "agent.base_url",
          value: baseUrl,
        });
      }
      return true;
    },
  );

  // Config YAML editor
  ipcMain.handle("read-config-yaml", async (_event, _profile?: string) => {
    const configPath = _profile
      ? join(profileHome(_profile), "config.yaml")
      : HERMES_CONFIG_FILE;
    try {
      const content = await readFile(configPath, "utf-8");
      return { content, path: configPath };
    } catch (err: any) {
      if (err.code === "ENOENT") return { content: "", path: configPath };
      throw err;
    }
  });

  ipcMain.handle(
    "write-config-yaml",
    async (_event, content: string, _profile?: string) => {
      const configPath = _profile
        ? join(profileHome(_profile), "config.yaml")
        : HERMES_CONFIG_FILE;
      await writeFile(configPath, content, "utf-8");
      return true;
    },
  );

  // Connection mode
  ipcMain.handle("is-remote-mode", () => isRemoteMode());
  ipcMain.handle("is-remote-only-mode", () => isRemoteOnlyMode());
  ipcMain.handle("get-connection-config", () => getPublicConnectionConfig());
  ipcMain.handle("is-ssh-tunnel-active", () => isSshTunnelActive());

  ipcMain.handle(
    "set-connection-config",
    (
      _event,
      mode: "local" | "remote" | "ssh",
      remoteUrl: string,
      apiKey?: string,
    ) => {
      const existing = getConnectionConfig();
      setConnectionConfig({
        ...existing,
        mode,
        remoteUrl,
        apiKey: resolveConnectionApiKeyUpdate(
          existing,
          mode,
          remoteUrl,
          apiKey,
        ),
      });
      return true;
    },
  );

  ipcMain.handle(
    "set-ssh-config",
    (
      _event,
      host: string,
      port: number,
      username: string,
      keyPath: string,
      remotePort: number,
      localPort: number,
    ) => {
      const current = getConnectionConfig();
      setConnectionConfig({
        ...current,
        mode: "ssh",
        ssh: { host, port, username, keyPath, remotePort, localPort },
      });
      return true;
    },
  );

  ipcMain.handle(
    "test-remote-connection",
    (_event, url: string, apiKey?: string) => testRemoteConnection(url, apiKey),
  );

  ipcMain.handle(
    "test-ssh-connection",
    (
      _event,
      host: string,
      port: number,
      username: string,
      keyPath: string,
      remotePort: number,
    ) =>
      testSshConnection({
        host,
        port,
        username,
        keyPath,
        remotePort,
        localPort: 19642,
      }),
  );

  ipcMain.handle("start-ssh-tunnel", async () => {
    const conn = getConnectionConfig();
    if (conn.mode !== "ssh") return false;
    if (conn.ssh && !(await sshGatewayStatus(conn.ssh))) {
      await sshStartGateway(conn.ssh);
    }
    await startSshTunnel(conn.ssh);
    if (conn.ssh) {
      const key = await sshReadRemoteApiKey(conn.ssh);
      setSshRemoteApiKey(key);
    }
    return true;
  });

  ipcMain.handle("stop-ssh-tunnel", () => {
    stopSshTunnel();
    return true;
  });

  // Gateway
  ipcMain.handle("start-gateway", async () => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) {
      await sshStartGateway(conn.ssh);
      return true;
    }
    if (conn.mode === "remote") return false;
    return startGateway();
  });

  ipcMain.handle("stop-gateway", async () => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) {
      await sshStopGateway(conn.ssh);
      return true;
    }
    if (conn.mode === "remote") return true;
    stopGateway(true);
    return true;
  });

  ipcMain.handle("gateway-status", () => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshGatewayStatus(conn.ssh);
    return isGatewayRunning();
  });

  // Platform toggles
  ipcMain.handle(
    "get-platform-enabled",
    withSsh(getPlatformEnabled, sshGetPlatformEnabled),
  );

  ipcMain.handle(
    "set-platform-enabled",
    async (_event, platform: string, enabled: boolean, profile?: string) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh) {
        await sshSetPlatformEnabled(conn.ssh, platform, enabled, profile);
        return true;
      }
      setPlatformEnabled(platform, enabled, profile);
      if (isGatewayRunning()) restartGateway(profile);
      return true;
    },
  );

  // Clipboard
  ipcMain.handle("copy-to-clipboard", (_event, text: string) => {
    clipboard.writeText(typeof text === "string" ? text : "");
  });

  // Routing / Fallback config
  ipcMain.handle("get-routing-config", async (_event, _profile?: string) => {
    const configPath = _profile
      ? join(profileHome(_profile), "config.yaml")
      : HERMES_CONFIG_FILE;
    try {
      const content = await readFile(configPath, "utf-8");
      const lines = content.split("\n");
      const result: {
        defaultModel: string;
        defaultProvider: string;
        defaultBaseUrl: string;
        fallbacks: Array<{ model: string; provider: string }>;
      } = {
        defaultModel: getConfigValue("model.default", _profile) || "",
        defaultProvider: getConfigValue("model.provider", _profile) || "",
        defaultBaseUrl: getConfigValue("model.base_url", _profile) || "",
        fallbacks: [],
      };

      // Parse fallback_providers array
      let inFallback = false;
      let current: { model: string; provider: string } | null = null;
      for (const line of lines) {
        const trimmed = line.trim();
        if (/^fallback_providers\s*:/.test(line.trim())) {
          inFallback = true;
          continue;
        }
        if (inFallback) {
          if (/^-\s+/.test(trimmed) || /^-\s*$/.test(trimmed)) {
            if (current) result.fallbacks.push(current);
            current = { model: "", provider: "" };
            const inlineModel = trimmed.match(/model:\s*(\S+)/);
            const inlineProvider = trimmed.match(/provider:\s*(\S+)/);
            if (inlineModel) current.model = inlineModel[1];
            if (inlineProvider) current.provider = inlineProvider[1];
            continue;
          }
          if (current && /^\s+model:\s*(\S+)/.test(line)) {
            current.model = line.match(/model:\s*(\S+)/)![1];
            continue;
          }
          if (current && /^\s+provider:\s*(\S+)/.test(line)) {
            current.provider = line.match(/provider:\s*(\S+)/)![1];
            continue;
          }
          // Exit fallback_providers block on next top-level key
          if (/^\S/.test(line) && !line.startsWith("#")) {
            if (current) result.fallbacks.push(current);
            inFallback = false;
            current = null;
          }
        }
      }
      if (current) result.fallbacks.push(current);

      return result;
    } catch {
      return {
        defaultModel: "",
        defaultProvider: "",
        defaultBaseUrl: "",
        fallbacks: [],
      };
    }
  });

  ipcMain.handle(
    "set-routing-config",
    async (
      _event,
      data: {
        defaultModel?: string;
        defaultProvider?: string;
        defaultBaseUrl?: string;
        fallbacks?: Array<{ model: string; provider: string }>;
      },
      _profile?: string,
    ) => {
      const configPath = _profile
        ? join(profileHome(_profile), "config.yaml")
        : HERMES_CONFIG_FILE;
      let content: string;
      try {
        content = await readFile(configPath, "utf-8");
      } catch {
        content = "";
      }

      // Update scalar fields
      if (data.defaultModel !== undefined)
        setConfigValue("model.default", data.defaultModel, _profile);
      if (data.defaultProvider !== undefined)
        setConfigValue("model.provider", data.defaultProvider, _profile);
      if (data.defaultBaseUrl !== undefined)
        setConfigValue("model.base_url", data.defaultBaseUrl, _profile);

      // Rewrite fallback_providers block
      if (data.fallbacks !== undefined) {
        const lines = content.split("\n");
        const before: string[] = [];
        const after: string[] = [];
        let inFallback = false;
        let pastFallback = false;

        for (const line of lines) {
          if (!pastFallback && /^fallback_providers\s*:/.test(line.trim())) {
            inFallback = true;
            continue;
          }
          if (inFallback) {
            if (/^\s+-\s/.test(line) || /^\s+model:/.test(line) || /^\s+provider:/.test(line)) {
              continue;
            }
            inFallback = false;
            pastFallback = true;
          }
          if (pastFallback) after.push(line);
          else before.push(line);
        }

        const fbLines = data.fallbacks.map(
          (f) => `- model: ${f.model}\n  provider: ${f.provider}`,
        );
        const newBlock =
          data.fallbacks.length > 0
            ? `fallback_providers:\n${fbLines.join("\n")}`
            : "";

        content = [...before, newBlock, ...after]
          .filter((l) => l !== "")
          .join("\n");

        await writeFile(configPath, content, "utf-8");
      }

      return true;
    },
  );
}
