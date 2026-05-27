import * as fs from "fs";
import fs__default, { existsSync, symlinkSync, readFileSync as readFileSync$1, mkdirSync, copyFileSync, writeFileSync, promises, createReadStream, createWriteStream, renameSync, accessSync, constants, statSync as statSync$1, chmodSync, unlinkSync, watch, unlink, readdirSync as readdirSync$1, rmSync, readlinkSync } from "fs";
import * as path from "path";
import path__default$1, { join, resolve, dirname, isAbsolute, extname, basename } from "path";
import { config } from "dotenv";
import { execFile, spawn, execSync, spawnSync, exec } from "child_process";
import { app, BrowserWindow, net, protocol, session, webFrameMain, nativeImage, screen, ipcMain, shell, Tray, Menu, dialog, clipboard, globalShortcut, nativeTheme, powerMonitor } from "electron";
import log$q from "electron-log";
import Aegis from "@tencent/aegis-electron-sdk-v2";
import * as fs$1 from "node:fs";
import { statSync, existsSync as existsSync$1, readFileSync, mkdirSync as mkdirSync$1, readdirSync } from "node:fs";
import * as path$1 from "node:path";
import path__default, { join as join$1 } from "node:path";
import { createRequire } from "module";
import * as os from "node:os";
import { parse } from "smol-toml";
import { stat, readFile, mkdir, writeFile, unlink as unlink$1, copyFile, chmod, readdir, mkdtemp, rm, access, rename, symlink, readlink } from "fs/promises";
import { createHash, randomUUID, createHmac, randomBytes } from "crypto";
import Store from "electron-store";
import { EventEmitter } from "events";
import * as os$1 from "os";
import os__default, { homedir, tmpdir } from "os";
import { createConnection, createServer } from "net";
import { execFile as execFile$1 } from "node:child_process";
import { promisify } from "node:util";
import { request } from "https";
import { promisify as promisify$1 } from "util";
import bplistParser from "bplist-parser";
import plist from "plist";
import initSqlJs from "sql.js";
import Aegis$1, { LoggerLevel } from "@tencent/bugly-electron-main";
import { coerce, lt } from "semver";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const candidates = [];
if (typeof process.resourcesPath === "string" && process.resourcesPath.length > 0) {
  candidates.push(join(process.resourcesPath, ".env"));
}
candidates.push(join(process.cwd(), ".env"));
for (const path2 of candidates) {
  try {
    if (!existsSync(path2)) continue;
    config({ path: path2 });
  } catch {
  }
}
const APP_NAME = "Marvis";
const APP_DATA_DIR_NAME = "com.tencent.mac.marvis";
const APP_VERSION = "1.0.0";
const APP_DESCRIPTION = "马维斯 为你24小时随时在线";
const APP_COPYRIGHT = `Copyright © ${(/* @__PURE__ */ new Date()).getFullYear()} Tencent`;
const APP_METADATA = {
  name: APP_NAME,
  version: APP_VERSION,
  description: APP_DESCRIPTION,
  copyright: APP_COPYRIGHT
};
const GALILEO_COLLECT_URL = "https://galileotelemetry.tencent.com/collect";
const GALILEO_LEVEL_PRIORITY = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
const GALILEO_REQUEST_TIMEOUT = 3e3;
const GALILEO_PERF_INTERVAL_MIN = 5;
const GALILEO_REMOTE_CONFIG_FILENAME = "marvis-client.config.json";
const GALILEO_CONFIG_POLL_INTERVAL_MS = 10 * 60 * 1e3;
const DEFAULT_FULL_MIN_PRIORITY = GALILEO_LEVEL_PRIORITY["info"];
const LIMITED_MIN_PRIORITY = GALILEO_LEVEL_PRIORITY["error"];
let configFilePath = "";
let lastValidConfig = null;
let lastMtimeMs = null;
let effectiveMinPriority = DEFAULT_FULL_MIN_PRIORITY;
let pollTimer$1 = null;
let pollingActive = false;
function startConfigPolling$1(appDataDir) {
  if (pollingActive) return;
  pollingActive = true;
  configFilePath = join$1(appDataDir, GALILEO_REMOTE_CONFIG_FILENAME);
  reloadConfig();
  pollTimer$1 = setInterval(() => {
    try {
      checkAndReload();
    } catch {
    }
  }, GALILEO_CONFIG_POLL_INTERVAL_MS);
  if (pollTimer$1 && typeof pollTimer$1.unref === "function") {
    pollTimer$1.unref();
  }
}
function stopConfigPolling() {
  if (pollTimer$1) {
    clearInterval(pollTimer$1);
    pollTimer$1 = null;
  }
  pollingActive = false;
}
function refreshGalileoConfig$1() {
  reloadConfig();
}
function getEffectiveMinPriority() {
  return effectiveMinPriority;
}
function reloadConfig() {
  const parsed = readConfigFile(configFilePath);
  lastValidConfig = parsed.config;
  lastMtimeMs = parsed.mtime;
  recalcEffectivePriority();
}
function checkAndReload() {
  if (!configFilePath) return;
  try {
    const stat2 = statSync(configFilePath);
    const currentMtime = stat2.mtimeMs;
    if (currentMtime === lastMtimeMs) return;
    reloadConfig();
  } catch {
    if (lastValidConfig !== null || lastMtimeMs !== null) {
      lastValidConfig = null;
      lastMtimeMs = null;
      recalcEffectivePriority();
    }
  }
}
function readConfigFile(filePath) {
  if (!existsSync$1(filePath)) {
    return { config: null, mtime: null };
  }
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    const fullConfig = parsed;
    const galileoConfig = fullConfig?.galileo ?? null;
    let mtime = null;
    try {
      mtime = statSync(filePath).mtimeMs;
    } catch {
    }
    return { config: galileoConfig, mtime };
  } catch {
    return { config: lastValidConfig, mtime: lastMtimeMs };
  }
}
function recalcEffectivePriority() {
  const ctx = getContext();
  const config2 = lastValidConfig;
  if (!config2 || config2.fullReport !== false) {
    effectiveMinPriority = DEFAULT_FULL_MIN_PRIORITY;
    return;
  }
  const hitChannel = Array.isArray(config2.channelWhitelist) && config2.channelWhitelist.length > 0 && ctx.channelId !== "" && config2.channelWhitelist.includes(ctx.channelId);
  const hitGuid = Array.isArray(config2.guidWhitelist) && config2.guidWhitelist.length > 0 && ctx.deviceId !== "" && config2.guidWhitelist.includes(ctx.deviceId);
  if (hitChannel || hitGuid) {
    effectiveMinPriority = DEFAULT_FULL_MIN_PRIORITY;
  } else {
    effectiveMinPriority = LIMITED_MIN_PRIORITY;
  }
}
let _channelId = "";
let _deviceId = "";
function setConfigContext(channelId, deviceId) {
  _channelId = channelId ?? "";
  _deviceId = deviceId ?? "";
}
function getContext() {
  return { channelId: _channelId, deviceId: _deviceId };
}
let aegisInstance = null;
let currentChannelId = "";
let currentDeviceGuid = "";
function initGalileoReporter(config2) {
  if (aegisInstance) return;
  currentChannelId = config2.channelId ?? "";
  currentDeviceGuid = config2.deviceId ?? "";
  setConfigContext(currentChannelId, currentDeviceGuid);
  try {
    aegisInstance = new Aegis({
      id: config2.token,
      uid: "",
      // 先空，QimeiSDK 就绪后通过 setGalileoUid 更新为设备 guid
      env: config2.env,
      version: config2.version,
      aid: config2.deviceId,
      // 设备唯一标识（UV 统计）— 与 uid 同源（guid），便于双维度交叉排查
      hostUrl: GALILEO_COLLECT_URL,
      requestTimeout: GALILEO_REQUEST_TIMEOUT,
      processPerformanceInterval: GALILEO_PERF_INTERVAL_MIN,
      reportImmediately: false,
      // 等 setGalileoUid(guid) + readyGalileoReporter() 后再放行，避免早期日志 uid 为空
      plugin: {
        processPerformance: true,
        // 主进程 CPU/内存监控
        error: true,
        // 错误自动上报
        crash: false,
        // 崩溃上报，崩溃上报的 bugly，这里不开启
        network: true,
        // 网络状态监控
        pv: false,
        // 桌面端无 PV 概念，关闭
        pagePerformance: false
        // 桌面端无页面性能，关闭
      },
      // 上报失败静默处理
      onSendFail: () => {
      }
    });
  } catch {
    aegisInstance = null;
  }
}
function setGalileoUid(uid) {
  try {
    aegisInstance?.setConfig({ uid });
  } catch {
  }
  currentDeviceGuid = uid;
  setConfigContext(currentChannelId, currentDeviceGuid);
}
function readyGalileoReporter() {
  try {
    aegisInstance?.ready();
  } catch {
  }
}
function reportToGalileo(level, msg) {
  if (!aegisInstance) return;
  const effectiveMinLevel = getEffectiveMinPriority();
  const levelPriority = GALILEO_LEVEL_PRIORITY[level] ?? 0;
  if (levelPriority < effectiveMinLevel) return;
  try {
    if (level === "error") {
      void aegisInstance.error(msg);
    } else {
      void aegisInstance.report(msg);
    }
  } catch {
  }
}
async function destroyGalileoReporter() {
  stopConfigPolling();
  if (!aegisInstance) return;
  try {
    await aegisInstance.destroy();
  } catch {
  } finally {
    aegisInstance = null;
  }
}
function startConfigPolling(appDataDir) {
  startConfigPolling$1(appDataDir);
}
function refreshGalileoConfig() {
  refreshGalileoConfig$1();
}
const DEFAULT_LOG_LEVEL$1 = "info";
const DEFAULT_MAX_FILE_SIZE_MB = 10;
const DEFAULT_MAX_ARCHIVE_COUNT = 5;
const LOG_FILE_NAME = "main.log";
const MB_TO_BYTES = 1024 * 1024;
const ENV_LOG_DIR = "MARVIS_LOG_DIR";
let initialized$4 = false;
let resolvedLogDir = null;
function resolveLogDir() {
  const envValue = process.env[ENV_LOG_DIR];
  if (envValue && envValue.trim().length > 0) {
    const trimmed = envValue.trim();
    return path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
  }
  return app.getPath("logs");
}
function ensureLogDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
function initLogger(config2) {
  const level = config2?.level ?? DEFAULT_LOG_LEVEL$1;
  const maxFileSizeMb = config2?.max_file_size_mb ?? DEFAULT_MAX_FILE_SIZE_MB;
  const maxArchiveCount = config2?.max_archive_count ?? DEFAULT_MAX_ARCHIVE_COUNT;
  const logDir = resolveLogDir();
  ensureLogDir(logDir);
  resolvedLogDir = logDir;
  log$q.transports.console.level = level;
  log$q.transports.file.level = level;
  log$q.transports.file.fileName = LOG_FILE_NAME;
  log$q.transports.file.maxSize = maxFileSizeMb * MB_TO_BYTES;
  log$q.transports.file.resolvePathFn = () => path.join(logDir, LOG_FILE_NAME);
  log$q.transports.file.archiveLogFn = (oldLogFile) => {
    archiveLog(oldLogFile, maxArchiveCount);
  };
  log$q.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";
  log$q.transports.console.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";
  initialized$4 = true;
  log$q.info(`[logger] 日志系统初始化完成 — 目录: ${logDir}, 文件: ${LOG_FILE_NAME}, 级别: ${level}, 单文件上限: ${maxFileSizeMb}MB, 最大归档: ${maxArchiveCount}`);
}
function getLogDir() {
  return resolvedLogDir;
}
function archiveLog(oldLogFile, maxArchiveCount) {
  const logDir = path.dirname(oldLogFile.path);
  const ext = path.extname(oldLogFile.path);
  const baseName = path.basename(oldLogFile.path, ext);
  const oldestArchive = path.join(logDir, `${baseName}.${maxArchiveCount}${ext}`);
  if (fs.existsSync(oldestArchive)) {
    fs.unlinkSync(oldestArchive);
  }
  for (let i = maxArchiveCount - 1; i >= 1; i--) {
    const currentFile = path.join(logDir, `${baseName}.${i}${ext}`);
    const nextFile = path.join(logDir, `${baseName}.${i + 1}${ext}`);
    if (fs.existsSync(currentFile)) {
      fs.renameSync(currentFile, nextFile);
    }
  }
  const firstArchive = path.join(logDir, `${baseName}.1${ext}`);
  fs.renameSync(oldLogFile.path, firstArchive);
}
function getLogger(scope) {
  if (!initialized$4) {
    console.warn(`[logger] 日志系统尚未初始化，模块 "${scope}" 请求日志实例前应先调用 initLogger()`);
  }
  const prefix = `[${scope}]`;
  return {
    debug: (...args) => {
      log$q.debug(prefix, ...args);
      reportToGalileo("debug", `${prefix} ${args.map(String).join(" ")}`);
    },
    info: (...args) => {
      log$q.info(prefix, ...args);
      reportToGalileo("info", `${prefix} ${args.map(String).join(" ")}`);
    },
    warn: (...args) => {
      log$q.warn(prefix, ...args);
      reportToGalileo("warn", `${prefix} ${args.map(String).join(" ")}`);
    },
    error: (...args) => {
      log$q.error(prefix, ...args);
      reportToGalileo("error", `${prefix} ${args.map(String).join(" ")}`);
    }
  };
}
const ENV_BEACON_ADDON_PATH = "MARVIS_BEACON_ADDON_PATH";
const BEACON_LOG_SCOPE = "beacon";
const log$p = () => getLogger(BEACON_LOG_SCOPE);
const nativeRequire$2 = createRequire(import.meta.url);
const REQUIRED_EXPORTS$1 = [
  "init",
  "setCommonParams",
  "reportEvent",
  "reportRealtimeEvent",
  "shutdown"
];
function resolveCandidatePaths$2() {
  const list = [];
  const { [ENV_BEACON_ADDON_PATH]: envValue } = process.env;
  const envPath = envValue?.trim();
  if (envPath && envPath.length > 0) {
    list.push(isAbsolute(envPath) ? envPath : resolve(process.cwd(), envPath));
  }
  list.push(resolve(process.cwd(), "native/beacon/lib/index.js"));
  const { resourcesPath } = process;
  if (typeof resourcesPath === "string" && resourcesPath.length > 0) {
    list.push(join(resourcesPath, "native", "beacon", "lib", "index.js"));
  }
  return Array.from(new Set(list));
}
function looksLikeBinding$1(mod) {
  if (!mod || typeof mod !== "object") return false;
  const r = mod;
  return REQUIRED_EXPORTS$1.every((k) => typeof r[k] === "function");
}
function ensureFrameworkSymlink(addonDir) {
  const FRAMEWORK_NAME = "BeaconAPI_Base.framework";
  const linkPath = join(addonDir, FRAMEWORK_NAME);
  if (existsSync(linkPath)) return;
  const sourcePath = resolve(process.cwd(), "resources", "frameworks", FRAMEWORK_NAME);
  if (!existsSync(sourcePath)) {
    log$p().warn(`[loader] 开发态 framework 源路径不存在: ${sourcePath}，跳过符号链接创建`);
    return;
  }
  try {
    symlinkSync(sourcePath, linkPath, "dir");
    log$p().info(`[loader] 已创建开发态 framework 符号链接: ${linkPath} → ${sourcePath}`);
  } catch (err) {
    log$p().warn(`[loader] 创建 framework 符号链接失败: ${err.message}`);
  }
}
function loadNativeBinding$2() {
  if (process.platform !== "darwin") {
    return { binding: null, resolvedPath: null, reason: "non-darwin platform" };
  }
  const cwd = process.cwd();
  const { resourcesPath } = process;
  const envPath = process.env[ENV_BEACON_ADDON_PATH]?.trim() ?? "";
  log$p().info(`[loader] 诊断信息: cwd=${cwd}, resourcesPath=${resourcesPath ?? "(undefined)"}, env(ADDON_PATH)=${envPath || "(empty)"}`);
  const candidates2 = resolveCandidatePaths$2();
  log$p().info(`[loader] 候选路径列表(${candidates2.length}): ${JSON.stringify(candidates2)}`);
  for (const candidatePath of candidates2) {
    if (existsSync(candidatePath)) {
      const addonDir = resolve(dirname(candidatePath), "..");
      ensureFrameworkSymlink(addonDir);
      break;
    }
  }
  let lastError = null;
  for (const path2 of candidates2) {
    if (!existsSync(path2)) {
      log$p().info(`[loader] 跳过(文件不存在): ${path2}`);
      continue;
    }
    log$p().info(`[loader] 文件存在，尝试加载: ${path2}`);
    try {
      const mod = nativeRequire$2(path2);
      if (!looksLikeBinding$1(mod)) {
        const r = mod;
        const missing = REQUIRED_EXPORTS$1.filter((k) => typeof r[k] !== "function");
        lastError = `addon at ${path2} does not export expected API (missing: ${missing.join(", ")})`;
        log$p().warn(`[loader] ${lastError}`);
        continue;
      }
      return { binding: mod, resolvedPath: path2 };
    } catch (err) {
      lastError = `require(${path2}) failed: ${err.message}`;
      log$p().warn(`[loader] ${lastError}`);
    }
  }
  const reason = lastError ?? `beacon addon not found in any candidate path (checked ${candidates2.length} paths, none exist)`;
  log$p().warn(`[loader] addon 加载最终失败: ${reason}`);
  return { binding: null, resolvedPath: null, reason };
}
function createStubBinding$2() {
  return {
    init: (_paramsJson) => 0,
    setCommonParams: () => 0,
    reportEvent: () => 0,
    reportRealtimeEvent: () => 0,
    shutdown: () => void 0
  };
}
let binding$2 = null;
let initialized$3 = false;
let logger$1n = null;
const { promise: initPromise, resolve: resolveInit } = (() => {
  let resolve2;
  const promise = new Promise((r) => {
    resolve2 = r;
  });
  return { promise, resolve: resolve2 };
})();
function getModuleLogger$p() {
  if (!logger$1n) {
    logger$1n = getLogger(BEACON_LOG_SCOPE);
  }
  return logger$1n;
}
function assertMainProcess$2() {
  const t = process.type;
  if (t === "renderer" || t === "worker") {
    throw new Error(`BeaconSDK 必须在主进程调用，当前 process.type=${String(t)}`);
  }
}
async function waitForInit$1() {
  await initPromise;
}
function initBeacon() {
  const log2 = getModuleLogger$p();
  if (initialized$3) {
    log2.debug("BeaconSDK 已初始化，跳过");
    return;
  }
  assertMainProcess$2();
  if (process.platform !== "darwin") {
    log2.info("BeaconSDK 未启用（非 darwin 平台），走 stub");
    binding$2 = createStubBinding$2();
    initialized$3 = true;
    resolveInit();
    return;
  }
  const loaderResult = loadNativeBinding$2();
  if (!loaderResult.binding) {
    log2.warn(`BeaconSDK addon 加载失败，走 stub: ${loaderResult.reason ?? "unknown"}`);
    binding$2 = createStubBinding$2();
    initialized$3 = true;
    resolveInit();
    return;
  }
  binding$2 = loaderResult.binding;
  log2.info(`BeaconSDK addon 已加载 → ${loaderResult.resolvedPath ?? "(unknown path)"}`);
  try {
    const ret = binding$2.init();
    initialized$3 = true;
    log2.info(`BeaconSDK 初始化完成 (ret=${ret})`);
  } catch (err) {
    log2.warn(`BeaconSDK 初始化抛错，降级 stub: ${err.message}`);
    binding$2 = createStubBinding$2();
    initialized$3 = true;
  }
  resolveInit();
}
async function setBeaconCommonParams(params) {
  await waitForInit$1();
  if (!binding$2) return 0;
  const log2 = getModuleLogger$p();
  try {
    const ret = binding$2.setCommonParams(params);
    log2.info(`[setCommonParams] ret=${ret} params=${typeof params === "string" ? params : JSON.stringify(params)}`);
    return ret;
  } catch (err) {
    log2.warn(`setCommonParams 抛错: ${err.message}`);
    return -1;
  }
}
async function reportBeaconEvent(code, params) {
  await waitForInit$1();
  if (!binding$2) return 0;
  const log2 = getModuleLogger$p();
  try {
    const ret = binding$2.reportEvent(code, params);
    log2.info(`[reportEvent] code=${code} ret=${ret}`);
    return ret;
  } catch (err) {
    log2.warn(`reportEvent(${code}) 抛错: ${err.message}`);
    return -1;
  }
}
async function reportBeaconRealtimeEvent(code, params) {
  await waitForInit$1();
  if (!binding$2) return 0;
  const log2 = getModuleLogger$p();
  try {
    const ret = binding$2.reportRealtimeEvent(code, params);
    log2.info(`[reportRealtimeEvent] code=${code} ret=${ret}`);
    return ret;
  } catch (err) {
    log2.warn(`reportRealtimeEvent(${code}) 抛错: ${err.message}`);
    return -1;
  }
}
function shutdownBeacon() {
  if (!binding$2) return;
  try {
    binding$2.shutdown();
    getModuleLogger$p().info("BeaconSDK 已 shutdown");
  } catch (err) {
    getModuleLogger$p().warn(`shutdown 抛错: ${err.message}`);
  }
}
function getBeaconEnv() {
  const { resourcesPath } = process;
  if (!resourcesPath) {
    return {};
  }
  const binPath = join(resourcesPath, "bin");
  const fwPath = join(resourcesPath, "..", "Frameworks");
  const existingLibPath = process.env.DYLD_LIBRARY_PATH ?? "";
  const existingFwPath = process.env.DYLD_FRAMEWORK_PATH ?? "";
  return {
    DYLD_LIBRARY_PATH: existingLibPath ? `${binPath}:${existingLibPath}` : binPath,
    DYLD_FRAMEWORK_PATH: existingFwPath ? `${fwPath}:${existingFwPath}` : fwPath,
    BEACON_WRAPPER_DYLIB: join(binPath, "libbeacon_wrapper.dylib")
  };
}
const EVENT_HEARTBEAT_FOREGROUND = "heartbeat_foreground";
const EVENT_FOREGROUND_CLIENT_QUIT = "foreground_client_quit";
const EVENT_CLIENT_START = "client_start";
const EVENT_MARVIS_LAUNCH = "marvis_launch";
const EVENT_LAUNCH_APP_READY = "marvis_launch_app_ready";
const EVENT_LAUNCH_LOAD_CONFIG = "marvis_launch_load_config";
const EVENT_LAUNCH_INIT_LOGGER = "marvis_launch_init_logger";
const EVENT_LAUNCH_BEACON_INIT = "marvis_launch_beacon_init";
const EVENT_LAUNCH_MAIN_WINDOW_CONSTRUCTOR = "marvis_launch_main_window_constructor";
const EVENT_LAUNCH_LOAD_PAGE = "marvis_launch_load_page";
const EVENT_LAUNCH_PAGE_LOADED = "marvis_launch_page_loaded";
const EVENT_LAUNCH_DAEMON_SPAWN = "marvis_launch_daemon_spawn";
const EVENT_LAUNCH_GATEWAY_SPAWN = "marvis_launch_gateway_spawn";
const EVENT_LAUNCH_AGENT_SPAWN = "marvis_launch_agent_spawn";
const EVENT_LAUNCH_KB_SPAWN = "marvis_launch_kb_spawn";
const EVENT_LAUNCH_DAEMON_READY = "marvis_launch_daemon_ready";
const EVENT_LAUNCH_GATEWAY_READY = "marvis_launch_gateway_ready";
const EVENT_LAUNCH_AGENT_READY = "marvis_launch_agent_ready";
const EVENT_LAUNCH_KB_READY = "marvis_launch_kb_ready";
const EVENT_LAUNCH_TOTAL = "marvis_launch_total";
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1e3;
let foregroundStartTime = 0;
let heartbeatTimer = null;
let isForegroundActive = false;
let isForegroundSuspended = false;
let firstShow = true;
function nowSecs() {
  return Math.floor(Date.now() / 1e3);
}
function reportHeartbeatForeground() {
  const now = nowSecs();
  const duration = now - foregroundStartTime;
  reportBeaconEvent(EVENT_HEARTBEAT_FOREGROUND, {
    duration: String(duration)
  });
  foregroundStartTime = now;
}
function onForegroundVisible() {
  if (isForegroundActive) return;
  const log2 = getLogger("beacon");
  if (firstShow) {
    firstShow = false;
    reportBeaconEvent(EVENT_MARVIS_LAUNCH, {});
    log2.info("[foreground-tracker] 首次窗口 show，已上报 marvis_launch");
  }
  isForegroundActive = true;
  isForegroundSuspended = false;
  foregroundStartTime = nowSecs();
  reportHeartbeatForeground();
  heartbeatTimer = setInterval(() => {
    reportHeartbeatForeground();
  }, HEARTBEAT_INTERVAL_MS);
  log2.debug("[foreground-tracker] 前台可见，心跳定时器已启动");
}
function onForegroundInvisible() {
  if (!isForegroundActive) return;
  isForegroundActive = false;
  isForegroundSuspended = false;
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  const now = nowSecs();
  const duration = now - foregroundStartTime;
  reportBeaconEvent(EVENT_FOREGROUND_CLIENT_QUIT, {
    duration: String(duration)
  });
  getLogger("beacon").debug(`[foreground-tracker] 前台不可见，已上报 foreground_client_quit (duration=${duration}s)`);
}
function onForegroundSuspend() {
  if (!isForegroundActive || isForegroundSuspended) return;
  isForegroundSuspended = true;
  reportHeartbeatForeground();
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  getLogger("beacon").debug("[foreground-tracker] 系统挂起，心跳已暂停");
}
function onForegroundResume() {
  if (!isForegroundActive || !isForegroundSuspended) return;
  isForegroundSuspended = false;
  foregroundStartTime = nowSecs();
  heartbeatTimer = setInterval(() => {
    reportHeartbeatForeground();
  }, HEARTBEAT_INTERVAL_MS);
  getLogger("beacon").debug("[foreground-tracker] 系统恢复，心跳已重启");
}
function disposeForegroundTracker() {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  isForegroundActive = false;
  isForegroundSuspended = false;
  firstShow = true;
}
const processCreationTick = performance.now();
let lastPhaseTick = processCreationTick;
function reportLaunchPhase(eventName) {
  const now = performance.now();
  const cost = Math.round(now - lastPhaseTick);
  const totalCost = Math.round(now - processCreationTick);
  lastPhaseTick = now;
  reportBeaconEvent(eventName, {
    launch_type: launchType,
    cost: String(cost),
    total_cost: String(totalCost)
  });
  phaseBuffer.set(eventName, totalCost);
}
const subprocessSpawnTicks = /* @__PURE__ */ new Map();
const subprocessReadyResults = /* @__PURE__ */ new Map();
function markSubprocessSpawn(name) {
  const now = performance.now();
  const totalCost = Math.round(now - processCreationTick);
  subprocessSpawnTicks.set(name, now);
  const eventName = spawnEventName(name);
  reportBeaconEvent(eventName, {
    launch_type: launchType,
    total_cost: String(totalCost)
  });
}
function markSubprocessReady(name, status, errorMsg = "") {
  const now = performance.now();
  const totalCost = Math.round(now - processCreationTick);
  const spawnTick = subprocessSpawnTicks.get(name);
  const subprocessCost = spawnTick != null ? Math.round(now - spawnTick) : -1;
  const eventName = readyEventName(name);
  reportBeaconEvent(eventName, {
    launch_type: launchType,
    total_cost: String(totalCost),
    subprocess_cost: String(subprocessCost),
    status,
    error_msg: errorMsg
  });
  subprocessReadyResults.set(name, { totalCost, subprocessCost, status, errorMsg });
}
const phaseBuffer = /* @__PURE__ */ new Map();
let launchType = "normal";
let totalReported = false;
let totalReportTimer = null;
const TOTAL_REPORT_TIMEOUT_MS = 3e4;
function setLaunchType(type) {
  launchType = type;
}
function reportLaunchTotal() {
  if (totalReported) return;
  totalReported = true;
  if (totalReportTimer) {
    clearTimeout(totalReportTimer);
    totalReportTimer = null;
  }
  const now = performance.now();
  const totalCost = Math.round(now - processCreationTick);
  const subprocessNames = ["daemon", "gateway", "agent", "kb"];
  const subprocessFields = {};
  for (const name of subprocessNames) {
    const spawnTick = subprocessSpawnTicks.get(name);
    const ready = subprocessReadyResults.get(name);
    subprocessFields[`${name}_spawn`] = spawnTick != null ? String(Math.round(spawnTick - processCreationTick)) : "-1";
    subprocessFields[`${name}_ready`] = ready?.totalCost != null ? String(ready.totalCost) : "-1";
    subprocessFields[`${name}_cost`] = ready?.subprocessCost != null && ready.subprocessCost >= 0 ? String(ready.subprocessCost) : "-1";
    subprocessFields[`${name}_status`] = ready?.status ?? "-1";
  }
  reportBeaconEvent(EVENT_LAUNCH_TOTAL, {
    launch_type: launchType,
    app_version: app.getVersion(),
    total_cost: String(totalCost),
    // 主链路各阶段耗时
    phase_app_ready: String(phaseBuffer.get("marvis_launch_app_ready") ?? -1),
    phase_load_config: String(phaseBuffer.get("marvis_launch_load_config") ?? -1),
    phase_init_logger: String(phaseBuffer.get("marvis_launch_init_logger") ?? -1),
    phase_beacon_init: String(phaseBuffer.get("marvis_launch_beacon_init") ?? -1),
    phase_window_constructor: String(phaseBuffer.get("marvis_launch_main_window_constructor") ?? -1),
    phase_load_page: String(phaseBuffer.get("marvis_launch_load_page") ?? -1),
    phase_page_loaded: String(phaseBuffer.get("marvis_launch_page_loaded") ?? -1),
    // 子进程耗时
    ...subprocessFields
  });
}
function startTotalReportTimer() {
  if (totalReportTimer) return;
  totalReportTimer = setTimeout(() => {
    totalReportTimer = null;
    if (!totalReported) {
      reportLaunchTotal();
    }
  }, TOTAL_REPORT_TIMEOUT_MS);
}
function spawnEventName(name) {
  const map = {
    daemon: EVENT_LAUNCH_DAEMON_SPAWN,
    gateway: EVENT_LAUNCH_GATEWAY_SPAWN,
    agent: EVENT_LAUNCH_AGENT_SPAWN,
    kb: EVENT_LAUNCH_KB_SPAWN
  };
  return map[name] ?? `marvis_launch_${name}_spawn`;
}
function readyEventName(name) {
  const map = {
    daemon: EVENT_LAUNCH_DAEMON_READY,
    gateway: EVENT_LAUNCH_GATEWAY_READY,
    agent: EVENT_LAUNCH_AGENT_READY,
    kb: EVENT_LAUNCH_KB_READY
  };
  return map[name] ?? `marvis_launch_${name}_ready`;
}
const APP_MOD_ID = "app";
const APP_MOD_NAME = "应用生命周期";
const APP_REPORT_EVENTS = {
  /** 单例锁获取成功（当前是第一个实例） */
  SINGLE_INSTANCE_LOCK_ACQUIRED: "app__single_instance_lock_acquired",
  /** 单例锁获取失败（已有实例运行，当前进程将退出） */
  SINGLE_INSTANCE_LOCK_FAILED: "app__single_instance_lock_failed",
  /** 检测到二次启动（另一个实例尝试启动，激活已有窗口） */
  SECOND_INSTANCE_DETECTED: "app__second_instance_detected",
  /** 应用元信息设置完成 */
  METADATA_SET: "app__metadata_set",
  /** 启动前置引导完成（身份+路径初始化） */
  BOOTSTRAP_IDENTITY_DONE: "app__bootstrap_identity_done",
  /** 启动前置引导 setPath 失败（非致命） */
  BOOTSTRAP_SET_PATH_FAILED: "app__bootstrap_set_path_failed"
};
let logger$1m;
function getModuleLogger$o() {
  if (!logger$1m) {
    logger$1m = getLogger("app");
  }
  return logger$1m;
}
function requestSingleInstanceLock() {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    reportBeaconRealtimeEvent(APP_REPORT_EVENTS.SINGLE_INSTANCE_LOCK_FAILED, {
      mod_id: APP_MOD_ID,
      mod_name: APP_MOD_NAME
    });
    app.quit();
    return false;
  }
  app.on("second-instance", (_event, argv) => {
    const log2 = getModuleLogger$o();
    log2.info("检测到二次启动，激活已有窗口");
    reportBeaconEvent(APP_REPORT_EVENTS.SECOND_INSTANCE_DETECTED, {
      mod_id: APP_MOD_ID,
      mod_name: APP_MOD_NAME,
      // 第二实例传入的命令行参数（用于诊断启动来源，如 --from=xxx）
      argv: argv.slice(1).join(" ")
    });
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      const mainWindow2 = windows[0];
      if (mainWindow2.isMinimized()) {
        mainWindow2.restore();
      }
      mainWindow2.show();
      mainWindow2.focus();
    }
  });
  reportBeaconRealtimeEvent(APP_REPORT_EVENTS.SINGLE_INSTANCE_LOCK_ACQUIRED, {
    mod_id: APP_MOD_ID,
    mod_name: APP_MOD_NAME
  });
  return true;
}
function setAppMetadata() {
  app.setName(APP_NAME);
  const log2 = getModuleLogger$o();
  log2.info(`应用元信息已设置 — ${APP_METADATA.name} v${APP_METADATA.version}`);
  reportBeaconEvent(APP_REPORT_EVENTS.METADATA_SET, {
    mod_id: APP_MOD_ID,
    mod_name: APP_MOD_NAME,
    app_name: APP_METADATA.name
  });
}
function safeSetPath(key, value) {
  try {
    if (!fs$1.existsSync(value)) {
      fs$1.mkdirSync(value, { recursive: true });
    }
    app.setPath(key, value);
    console.info(`[bootstrap] app.setPath(${key}) = ${value}`);
  } catch (err) {
    console.error(`[bootstrap] app.setPath(${key}) 失败（非致命）:`, err.message);
    reportBeaconRealtimeEvent(APP_REPORT_EVENTS.BOOTSTRAP_SET_PATH_FAILED, {
      mod_id: APP_MOD_ID,
      mod_name: APP_MOD_NAME,
      path_key: key,
      path_value: value,
      error: err.message
    });
  }
}
function bootstrapAppIdentity() {
  app.setName(APP_NAME);
  if (process.platform !== "darwin") return;
  const home = os.homedir();
  const appSupport = path$1.join(home, "Library", "Application Support");
  const logsBase = path$1.join(home, "Library", "Logs");
  const userData = path$1.join(appSupport, APP_DATA_DIR_NAME);
  const logs = path$1.join(logsBase, APP_DATA_DIR_NAME);
  const sessionData = userData;
  const crashDumps = path$1.join(userData, "Crashpad");
  safeSetPath("userData", userData);
  safeSetPath("logs", logs);
  safeSetPath("sessionData", sessionData);
  safeSetPath("crashDumps", crashDumps);
  reportBeaconRealtimeEvent(APP_REPORT_EVENTS.BOOTSTRAP_IDENTITY_DONE, {
    mod_id: APP_MOD_ID,
    mod_name: APP_MOD_NAME
  });
}
const CONFIG_FILE_NAME = "config.toml";
const DEFAULT_LOG_LEVEL = "info";
const DEFAULT_LOG_MAX_FILE_SIZE_MB = 10;
const DEFAULT_LOG_MAX_ARCHIVE_COUNT = 5;
const DEFAULT_DOMAIN_MAIN = "marvis-client.yyb.qq.com";
const DEPRECATED_DOMAIN_MAIN = "yyb-ai-launcher-offline.qq.com";
const DEFAULT_DOMAIN_MAIN_PATH = "./resources/offline-pack/main";
const DEBUG_DOMAIN = "marvis-debug.local";
const DEBUG_DOMAIN_DEFAULT_PATH = "./out/renderer";
const ENV_WEBAPP_DIR = "MARVIS_WEBAPP_DIR";
const ENV_DEBUG_WEBAPP_DIR = "MARVIS_DEBUG_WEBAPP_DIR";
const ENV_QIMEI_APPKEY = "MARVIS_QIMEI_APPKEY";
const ENV_QIMEI_CHANNEL_ID = "MARVIS_QIMEI_CHANNEL_ID";
const ENV_DEVTOOLS = "MARVIS_DEVTOOLS";
const ENV_DEVTOOLS_AUTO_OPEN = "MARVIS_DEVTOOLS_AUTO_OPEN";
const ENV_WEBAPP_URL = "MARVIS_WEBAPP_URL";
const VALID_DEVTOOLS_MODES$1 = [
  "bottom",
  "right",
  "left",
  "undocked",
  "detach"
];
const DEFAULT_DEVTOOLS_MODE$1 = "bottom";
const DEFAULT_BOOTSTRAP_DELAY_MS = 0;
const DEFAULT_GATEWAY_DELAY_MS = 0;
const DEFAULT_AGENT_DELAY_MS = 0;
const DEFAULT_KNOWLEDGEBASE_DELAY_MS = 0;
const ENV_ALLOW_TRIGGER_CRASH = "MARVIS_ALLOW_TRIGGER_CRASH";
function getDefaultAllowTriggerCrash() {
  try {
    const { app: app2 } = require2("electron");
    return !app2.isPackaged;
  } catch {
    return false;
  }
}
const DEFAULT_APP_CONFIG = {
  domain_mapping: {
    [DEFAULT_DOMAIN_MAIN]: DEFAULT_DOMAIN_MAIN_PATH
  },
  log: {
    level: DEFAULT_LOG_LEVEL,
    max_file_size_mb: DEFAULT_LOG_MAX_FILE_SIZE_MB,
    max_archive_count: DEFAULT_LOG_MAX_ARCHIVE_COUNT
  },
  qimei: {
    appkey: "",
    channel_id: "",
    debug: false,
    enable_audit: true
  },
  devtools: {
    enable: false,
    mode: DEFAULT_DEVTOOLS_MODE$1,
    auto_open: false
  },
  dev_redirect: {
    webapp_url: "",
    webapp_dir: ""
  },
  startup_delays: {
    bootstrap_ms: DEFAULT_BOOTSTRAP_DELAY_MS,
    gateway_ms: DEFAULT_GATEWAY_DELAY_MS,
    agent_ms: DEFAULT_AGENT_DELAY_MS,
    knowledgebase_ms: DEFAULT_KNOWLEDGEBASE_DELAY_MS
  },
  debug: {
    allow_trigger_crash: getDefaultAllowTriggerCrash()
  }
};
const CONFIG_REPORT_EVENTS = {
  /** 配置加载成功 */
  LOAD_SUCCESS: "config__load_success",
  /** 配置加载失败（严重错误，实时上报） */
  LOAD_FAILURE: "config__load_failure",
  /** 配置文件解析错误（严重错误，实时上报） */
  PARSE_ERROR: "config__parse_error",
  /** 配置合并完成（用户配置与默认配置合并） */
  MERGE: "config__merge",
  /** 降级使用默认配置 */
  FALLBACK_DEFAULTS: "config__fallback_defaults"
};
let currentConfig = { ...DEFAULT_APP_CONFIG };
const VALID_LOG_LEVELS = ["error", "warn", "info", "debug"];
function parseBooleanLike(raw) {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw !== "string") return void 0;
  const v = raw.trim().toLowerCase();
  if (v === "") return void 0;
  if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
  if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  return void 0;
}
function normalizeDevtoolsMode(raw) {
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    const found = VALID_DEVTOOLS_MODES$1.find((m) => m === v);
    if (found) return found;
  }
  return DEFAULT_DEVTOOLS_MODE$1;
}
function getConfigFilePath() {
  return join(app.getPath("userData"), CONFIG_FILE_NAME);
}
function getDefaultConfigFilePath() {
  return resolve(__dirname, "config", "default-config.toml");
}
function deepMergeConfig(base, override) {
  const merged = {
    domain_mapping: { ...base.domain_mapping },
    log: { ...base.log },
    qimei: { ...base.qimei },
    devtools: { ...base.devtools },
    dev_redirect: { ...base.dev_redirect },
    startup_delays: { ...base.startup_delays },
    debug: { ...base.debug }
  };
  if (override.domain_mapping && typeof override.domain_mapping === "object") {
    const mergedMapping = {
      ...merged.domain_mapping,
      ...override.domain_mapping
    };
    merged.domain_mapping = mergedMapping;
  }
  if (override.log && typeof override.log === "object") {
    const overrideLog = override.log;
    if (overrideLog.level && VALID_LOG_LEVELS.includes(overrideLog.level)) {
      merged.log.level = overrideLog.level;
    }
    if (typeof overrideLog.max_file_size_mb === "number" && overrideLog.max_file_size_mb > 0) {
      merged.log.max_file_size_mb = overrideLog.max_file_size_mb;
    }
    if (typeof overrideLog.max_archive_count === "number" && overrideLog.max_archive_count > 0) {
      merged.log.max_archive_count = overrideLog.max_archive_count;
    }
  }
  if (override.qimei && typeof override.qimei === "object") {
    const overrideQimei = override.qimei;
    if (typeof overrideQimei.appkey === "string") {
      merged.qimei.appkey = overrideQimei.appkey;
    }
    if (typeof overrideQimei.channel_id === "string") {
      merged.qimei.channel_id = overrideQimei.channel_id;
    }
    if (typeof overrideQimei.debug === "boolean") {
      merged.qimei.debug = overrideQimei.debug;
    }
    if (typeof overrideQimei.enable_audit === "boolean") {
      merged.qimei.enable_audit = overrideQimei.enable_audit;
    }
  }
  if (override.devtools && typeof override.devtools === "object") {
    const overrideDt = override.devtools;
    const enableParsed = parseBooleanLike(overrideDt.enable);
    if (enableParsed !== void 0) {
      merged.devtools.enable = enableParsed;
    }
    if (overrideDt.mode !== void 0) {
      merged.devtools.mode = normalizeDevtoolsMode(overrideDt.mode);
    }
    const autoOpenParsed = parseBooleanLike(overrideDt.auto_open);
    if (autoOpenParsed !== void 0) {
      merged.devtools.auto_open = autoOpenParsed;
    }
  }
  if (override.dev_redirect && typeof override.dev_redirect === "object") {
    const overrideDr = override.dev_redirect;
    if (typeof overrideDr.webapp_url === "string") {
      merged.dev_redirect.webapp_url = overrideDr.webapp_url.trim();
    }
    if (typeof overrideDr.webapp_dir === "string") {
      merged.dev_redirect.webapp_dir = overrideDr.webapp_dir.trim();
    }
  }
  if (override.startup_delays && typeof override.startup_delays === "object") {
    const overrideSd = override.startup_delays;
    if (typeof overrideSd.bootstrap_ms === "number" && overrideSd.bootstrap_ms >= 0) {
      merged.startup_delays.bootstrap_ms = overrideSd.bootstrap_ms;
    }
    if (typeof overrideSd.gateway_ms === "number" && overrideSd.gateway_ms >= 0) {
      merged.startup_delays.gateway_ms = overrideSd.gateway_ms;
    }
    if (typeof overrideSd.agent_ms === "number" && overrideSd.agent_ms >= 0) {
      merged.startup_delays.agent_ms = overrideSd.agent_ms;
    }
    if (typeof overrideSd.knowledgebase_ms === "number" && overrideSd.knowledgebase_ms >= 0) {
      merged.startup_delays.knowledgebase_ms = overrideSd.knowledgebase_ms;
    }
  }
  if (override.debug && typeof override.debug === "object") {
    const overrideDebug = override.debug;
    const allowTriggerCrashParsed = parseBooleanLike(overrideDebug.allow_trigger_crash);
    if (allowTriggerCrashParsed !== void 0) {
      merged.debug.allow_trigger_crash = allowTriggerCrashParsed;
    }
  }
  return merged;
}
function ensureConfigFileExists(configPath) {
  if (existsSync(configPath)) {
    return;
  }
  const configDir = join(app.getPath("userData"));
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  const defaultPath = getDefaultConfigFilePath();
  if (existsSync(defaultPath)) {
    copyFileSync(defaultPath, configPath);
  } else {
    const defaultContent = generateDefaultToml();
    writeFileSync(configPath, defaultContent, "utf-8");
  }
}
function generateDefaultToml() {
  const lines = [
    "# Marvis 应用配置文件",
    "",
    "[domain_mapping]"
  ];
  for (const [domain, path2] of Object.entries(DEFAULT_APP_CONFIG.domain_mapping)) {
    lines.push(`"${domain}" = "${path2}"`);
  }
  lines.push("");
  lines.push("[log]");
  lines.push(`level = "${DEFAULT_APP_CONFIG.log.level}"`);
  lines.push(`max_file_size_mb = ${DEFAULT_APP_CONFIG.log.max_file_size_mb}`);
  lines.push(`max_archive_count = ${DEFAULT_APP_CONFIG.log.max_archive_count}`);
  lines.push("");
  lines.push("[qimei]");
  lines.push("# Appkey 推荐通过环境变量 MARVIS_QIMEI_APPKEY 注入，不要写在配置文件里");
  lines.push(`appkey = "${DEFAULT_APP_CONFIG.qimei.appkey ?? ""}"`);
  lines.push(`channel_id = "${DEFAULT_APP_CONFIG.qimei.channel_id ?? ""}"`);
  lines.push(`debug = ${DEFAULT_APP_CONFIG.qimei.debug ?? false}`);
  lines.push(`enable_audit = ${DEFAULT_APP_CONFIG.qimei.enable_audit ?? true}`);
  lines.push("");
  return lines.join("\n");
}
function applyEnvOverrides(current) {
  const mapping = { ...current.domain_mapping };
  const webappDir = process.env[ENV_WEBAPP_DIR]?.trim();
  if (webappDir && webappDir.length > 0) {
    mapping[DEFAULT_DOMAIN_MAIN] = isAbsolute(webappDir) ? webappDir : resolve(process.cwd(), webappDir);
  }
  const debugDir = process.env[ENV_DEBUG_WEBAPP_DIR]?.trim();
  if (debugDir && debugDir.length > 0) {
    mapping[DEBUG_DOMAIN] = isAbsolute(debugDir) ? debugDir : resolve(process.cwd(), debugDir);
  } else if (!mapping[DEBUG_DOMAIN]) {
    mapping[DEBUG_DOMAIN] = DEBUG_DOMAIN_DEFAULT_PATH;
  }
  const qimei = { ...current.qimei };
  const envAppkey = process.env[ENV_QIMEI_APPKEY]?.trim();
  if (envAppkey && envAppkey.length > 0) {
    qimei.appkey = envAppkey;
  }
  const envChannelId = process.env[ENV_QIMEI_CHANNEL_ID]?.trim();
  if (envChannelId && envChannelId.length > 0) {
    qimei.channel_id = envChannelId;
  }
  const devtools = { ...current.devtools };
  const envDevtools = parseBooleanLike(process.env[ENV_DEVTOOLS]);
  if (envDevtools !== void 0) {
    devtools.enable = envDevtools;
  }
  const envAutoOpen = parseBooleanLike(process.env[ENV_DEVTOOLS_AUTO_OPEN]);
  if (envAutoOpen !== void 0) {
    devtools.auto_open = envAutoOpen;
  }
  const devRedirect = { ...current.dev_redirect };
  const envWebappUrl = process.env[ENV_WEBAPP_URL]?.trim();
  if (envWebappUrl && envWebappUrl.length > 0) {
    devRedirect.webapp_url = envWebappUrl;
  }
  const debug = { ...current.debug };
  const envAllowTriggerCrash = parseBooleanLike(process.env[ENV_ALLOW_TRIGGER_CRASH]);
  if (envAllowTriggerCrash !== void 0) {
    debug.allow_trigger_crash = envAllowTriggerCrash;
  }
  return {
    ...current,
    domain_mapping: mapping,
    qimei,
    devtools,
    dev_redirect: devRedirect,
    debug
  };
}
function loadConfig() {
  const configPath = getConfigFilePath();
  try {
    ensureConfigFileExists(configPath);
    const content = readFileSync$1(configPath, "utf-8");
    let parsed;
    try {
      parsed = parse(content);
    } catch (parseError) {
      const errMsg = parseError instanceof Error ? parseError.message : String(parseError);
      reportBeaconRealtimeEvent(CONFIG_REPORT_EVENTS.PARSE_ERROR, {
        config_path: configPath,
        error_message: errMsg
      });
      console.warn("[config] 配置文件解析失败，使用默认配置:", parseError);
      currentConfig = { ...DEFAULT_APP_CONFIG };
      reportBeaconEvent(CONFIG_REPORT_EVENTS.FALLBACK_DEFAULTS, {
        config_path: configPath,
        error_message: errMsg
      });
      currentConfig = applyEnvOverrides(currentConfig);
      return currentConfig;
    }
    if (parsed.domain_mapping && typeof parsed.domain_mapping === "object" && DEPRECATED_DOMAIN_MAIN in parsed.domain_mapping) {
      const mapping = parsed.domain_mapping;
      if (!(DEFAULT_DOMAIN_MAIN in mapping)) {
        mapping[DEFAULT_DOMAIN_MAIN] = mapping[DEPRECATED_DOMAIN_MAIN];
      }
      delete mapping[DEPRECATED_DOMAIN_MAIN];
    }
    currentConfig = deepMergeConfig(DEFAULT_APP_CONFIG, parsed);
    const mergedSections = Object.keys(parsed).filter((k) => parsed[k] !== void 0);
    reportBeaconEvent(CONFIG_REPORT_EVENTS.MERGE, {
      merged_sections: JSON.stringify(mergedSections)
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.warn("[config] 配置文件加载失败，使用默认配置:", error);
    currentConfig = { ...DEFAULT_APP_CONFIG };
    reportBeaconRealtimeEvent(CONFIG_REPORT_EVENTS.LOAD_FAILURE, {
      config_path: configPath,
      error_message: errMsg
    });
    reportBeaconEvent(CONFIG_REPORT_EVENTS.FALLBACK_DEFAULTS, {
      config_path: configPath,
      error_message: errMsg
    });
  }
  const hasEnvOverride = !!(process.env[ENV_WEBAPP_DIR]?.trim() || process.env[ENV_DEBUG_WEBAPP_DIR]?.trim() || process.env[ENV_QIMEI_APPKEY]?.trim() || process.env[ENV_QIMEI_CHANNEL_ID]?.trim() || process.env[ENV_DEVTOOLS]?.trim() || process.env[ENV_DEVTOOLS_AUTO_OPEN]?.trim() || process.env[ENV_WEBAPP_URL]?.trim());
  currentConfig = applyEnvOverrides(currentConfig);
  reportBeaconEvent(CONFIG_REPORT_EVENTS.LOAD_SUCCESS, {
    config_path: configPath,
    env_override: hasEnvOverride ? "1" : "0"
  });
  return currentConfig;
}
function getConfig() {
  return currentConfig;
}
const OFFLINE_PACK_ROOT_DIR = "OfflinePack";
const DEFAULT_BUNDLE_NAME = "main";
const CURRENT_DIR = "current";
const PENDING_DIR = "pending";
const STAGING_DIR = "staging";
const BACKUP_DIR = "backup";
const META_FILE = "meta.json";
const INDEX_HTML = "index.html";
const BUILD_INFO_FILE = "build-info.json";
const BASELINE_RELATIVE_PATH = "./resources/offline-pack/main";
const BOOTSTRAP_SLOW_THRESHOLD_MS = 500;
const MIN_FREE_DISK_BYTES = 200 * 1024 * 1024;
var OfflinePackErrorCode = /* @__PURE__ */ ((OfflinePackErrorCode2) => {
  OfflinePackErrorCode2[OfflinePackErrorCode2["Success"] = 0] = "Success";
  OfflinePackErrorCode2[OfflinePackErrorCode2["UpdateInProgress"] = -1] = "UpdateInProgress";
  OfflinePackErrorCode2[OfflinePackErrorCode2["InvalidArgument"] = -10] = "InvalidArgument";
  OfflinePackErrorCode2[OfflinePackErrorCode2["VersionTooLow"] = -11] = "VersionTooLow";
  OfflinePackErrorCode2[OfflinePackErrorCode2["DownloadFailed"] = -20] = "DownloadFailed";
  OfflinePackErrorCode2[OfflinePackErrorCode2["DiskSpaceInsufficient"] = -21] = "DiskSpaceInsufficient";
  OfflinePackErrorCode2[OfflinePackErrorCode2["Md5Mismatch"] = -30] = "Md5Mismatch";
  OfflinePackErrorCode2[OfflinePackErrorCode2["ExtractFailed"] = -40] = "ExtractFailed";
  OfflinePackErrorCode2[OfflinePackErrorCode2["IntegrityFailed"] = -41] = "IntegrityFailed";
  OfflinePackErrorCode2[OfflinePackErrorCode2["CommitFailed"] = -50] = "CommitFailed";
  OfflinePackErrorCode2[OfflinePackErrorCode2["Unknown"] = -99] = "Unknown";
  return OfflinePackErrorCode2;
})(OfflinePackErrorCode || {});
const VERSION_FORMAT = /^\d{14}$/;
function getOfflinePackRoot() {
  return join(app.getPath("userData"), OFFLINE_PACK_ROOT_DIR);
}
function getBundleRoot(bundle = DEFAULT_BUNDLE_NAME) {
  return join(getOfflinePackRoot(), bundle);
}
function getCurrentDir(bundle = DEFAULT_BUNDLE_NAME) {
  return join(getBundleRoot(bundle), CURRENT_DIR);
}
function getPendingDir(bundle = DEFAULT_BUNDLE_NAME) {
  return join(getBundleRoot(bundle), PENDING_DIR);
}
function getStagingDir$1(bundle = DEFAULT_BUNDLE_NAME) {
  return join(getBundleRoot(bundle), STAGING_DIR);
}
function getBackupDir(bundle = DEFAULT_BUNDLE_NAME) {
  return join(getBundleRoot(bundle), BACKUP_DIR);
}
function getMetaPath(bundle = DEFAULT_BUNDLE_NAME) {
  return join(getBundleRoot(bundle), META_FILE);
}
function getBaselineDir(relativePath = BASELINE_RELATIVE_PATH) {
  if (isAbsolute(relativePath)) {
    return relativePath;
  }
  const normalized = relativePath.replace(/^\.[\\/]+/, "").replace(/^resources[\\/]+/, "");
  if (app.isPackaged) {
    const { resourcesPath } = process;
    if (resourcesPath) {
      return join(resourcesPath, normalized);
    }
    return join(app.getAppPath(), "resources", normalized);
  }
  return resolve(app.getAppPath(), "resources", normalized);
}
const DEFAULT_META = {
  currentVersion: "",
  pendingVersion: "",
  lastCheckAt: 0,
  lastError: "",
  schemaVersion: 1
};
async function readMeta(bundle) {
  const path2 = getMetaPath(bundle);
  try {
    const buf = await promises.readFile(path2, "utf-8");
    const raw = JSON.parse(buf);
    return normalize$1(raw);
  } catch {
    return { ...DEFAULT_META };
  }
}
async function writeMeta(patch, bundle) {
  const path2 = getMetaPath(bundle);
  const dir = dirname(path2);
  await promises.mkdir(dir, { recursive: true });
  const current = await readMeta(bundle);
  const merged = normalize$1({ ...current, ...patch });
  const tmp = `${path2}.tmp.${Date.now()}`;
  await promises.writeFile(tmp, JSON.stringify(merged, null, 2), "utf-8");
  await promises.rename(tmp, path2);
}
function normalize$1(raw) {
  const r = raw ?? {};
  return {
    schemaVersion: 1,
    currentVersion: typeof r.currentVersion === "string" ? r.currentVersion : "",
    pendingVersion: typeof r.pendingVersion === "string" ? r.pendingVersion : "",
    lastCheckAt: typeof r.lastCheckAt === "number" ? r.lastCheckAt : 0,
    lastError: typeof r.lastError === "string" ? r.lastError : ""
  };
}
const OFFLINE_PACK_MOD_ID = "offline_pack";
const OFFLINE_PACK_MOD_NAME = "离线资源包";
const OFFLINE_PACK_REPORT_EVENTS = {
  /** Bootstrap 完成 */
  BOOTSTRAP_SUCCESS: "offline_pack__bootstrap_success",
  /** Bootstrap 失败（严重错误，实时上报） */
  BOOTSTRAP_FAILED: "offline_pack__bootstrap_failed",
  /** Pending 包晋升成功 */
  PENDING_PROMOTED: "offline_pack__pending_promoted",
  /** 离线包下载成功 */
  DOWNLOAD_SUCCESS: "offline_pack__download_success",
  /** 离线包下载失败（严重错误，实时上报） */
  DOWNLOAD_FAILED: "offline_pack__download_failed",
  /** 离线包解压成功 */
  EXTRACT_SUCCESS: "offline_pack__extract_success",
  /** 离线包解压失败（严重错误，实时上报） */
  EXTRACT_FAILED: "offline_pack__extract_failed",
  /** 离线包校验失败（严重错误，实时上报） */
  VERIFY_FAILED: "offline_pack__verify_failed"
};
async function verifyMd5(filePath, expected) {
  if (!expected) return false;
  try {
    const actual = await md5OfFile(filePath);
    return actual.toLowerCase() === expected.toLowerCase();
  } catch {
    return false;
  }
}
async function md5OfFile(filePath) {
  return new Promise((resolve2, reject) => {
    const hash = createHash("md5");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve2(hash.digest("hex")));
  });
}
async function verifyIntegrity(dir) {
  try {
    const stat2 = await promises.stat(dir);
    if (!stat2.isDirectory()) {
      const result = { ok: false, reason: "not_a_directory", version: "" };
      reportBeaconRealtimeEvent(OFFLINE_PACK_REPORT_EVENTS.VERIFY_FAILED, {
        mod_id: OFFLINE_PACK_MOD_ID,
        mod_name: OFFLINE_PACK_MOD_NAME,
        reason: result.reason,
        dir
      });
      return result;
    }
  } catch {
    const result = { ok: false, reason: "dir_missing", version: "" };
    reportBeaconRealtimeEvent(OFFLINE_PACK_REPORT_EVENTS.VERIFY_FAILED, {
      mod_id: OFFLINE_PACK_MOD_ID,
      mod_name: OFFLINE_PACK_MOD_NAME,
      reason: result.reason,
      dir
    });
    return result;
  }
  const indexPath = join(dir, INDEX_HTML);
  try {
    await promises.access(indexPath);
  } catch {
    const result = { ok: false, reason: "index_html_missing", version: "" };
    reportBeaconRealtimeEvent(OFFLINE_PACK_REPORT_EVENTS.VERIFY_FAILED, {
      mod_id: OFFLINE_PACK_MOD_ID,
      mod_name: OFFLINE_PACK_MOD_NAME,
      reason: result.reason,
      dir
    });
    return result;
  }
  const buildInfoPath = join(dir, BUILD_INFO_FILE);
  let version = "";
  try {
    const raw = await promises.readFile(buildInfoPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.version === "string" && parsed.version.length > 0) {
      version = parsed.version;
    } else {
      const result = { ok: false, reason: "build_info_no_version", version: "" };
      reportBeaconRealtimeEvent(OFFLINE_PACK_REPORT_EVENTS.VERIFY_FAILED, {
        mod_id: OFFLINE_PACK_MOD_ID,
        mod_name: OFFLINE_PACK_MOD_NAME,
        reason: result.reason,
        dir
      });
      return result;
    }
  } catch {
    const result = { ok: false, reason: "build_info_unreadable", version: "" };
    reportBeaconRealtimeEvent(OFFLINE_PACK_REPORT_EVENTS.VERIFY_FAILED, {
      mod_id: OFFLINE_PACK_MOD_ID,
      mod_name: OFFLINE_PACK_MOD_NAME,
      reason: result.reason,
      dir
    });
    return result;
  }
  return { ok: true, reason: "", version };
}
let logger$1l;
function log$o() {
  if (!logger$1l) logger$1l = getLogger("offline-pack");
  return logger$1l;
}
async function recoverIfInterrupted() {
  await safeRm$3(getStagingDir$1());
  const currentDir = getCurrentDir();
  const backupDir = getBackupDir();
  let currentOk = false;
  try {
    const stat2 = await promises.stat(currentDir);
    if (stat2.isDirectory()) {
      const integrity = await verifyIntegrity(currentDir);
      currentOk = integrity.ok;
    }
  } catch {
    currentOk = false;
  }
  if (currentOk) return;
  let backupOk = false;
  try {
    const stat2 = await promises.stat(backupDir);
    if (stat2.isDirectory()) {
      const integrity = await verifyIntegrity(backupDir);
      backupOk = integrity.ok;
    }
  } catch {
    backupOk = false;
  }
  if (!backupOk) return;
  log$o().warn("[offline-pack] recover.from_backup current_dir 缺失或不完整，尝试从 backup 恢复");
  try {
    await safeRm$3(currentDir);
    await promises.rename(backupDir, currentDir);
    log$o().info("[offline-pack] recover.from_backup ok");
  } catch (err) {
    log$o().error("[offline-pack] recover.from_backup fail", err);
  }
}
async function promotePending() {
  const pendingDir = getPendingDir();
  const currentDir = getCurrentDir();
  const backupDir = getBackupDir();
  let pendingExists = false;
  try {
    const stat2 = await promises.stat(pendingDir);
    pendingExists = stat2.isDirectory();
  } catch {
    pendingExists = false;
  }
  if (!pendingExists) {
    return { promotedVersion: "", ok: false, reason: "pending_missing" };
  }
  const integrity = await verifyIntegrity(pendingDir);
  if (!integrity.ok) {
    log$o().warn(`[offline-pack] promote.fail integrity_failed reason=${integrity.reason}`);
    await safeRm$3(pendingDir);
    await writeMeta({ pendingVersion: "", lastError: `pending_integrity_failed:${integrity.reason}` });
    return { promotedVersion: "", ok: false, reason: integrity.reason };
  }
  const newVersion = integrity.version;
  await safeRm$3(backupDir);
  let currentMovedToBackup = false;
  try {
    await promises.rename(currentDir, backupDir);
    currentMovedToBackup = true;
  } catch (err) {
    if (err.code !== "ENOENT") {
      log$o().error("[offline-pack] promote.fail move_current_to_backup_failed", err);
      return { promotedVersion: "", ok: false, reason: "move_current_failed" };
    }
  }
  try {
    await promises.rename(pendingDir, currentDir);
  } catch (err) {
    log$o().error("[offline-pack] promote.fail rename_pending_to_current_failed", err);
    if (currentMovedToBackup) {
      try {
        await promises.rename(backupDir, currentDir);
        log$o().warn("[offline-pack] promote.recover restored current from backup");
      } catch (err2) {
        log$o().error("[offline-pack] promote.recover restore_failed", err2);
      }
    }
    return { promotedVersion: "", ok: false, reason: "rename_pending_failed" };
  }
  await writeMeta({
    currentVersion: newVersion,
    pendingVersion: "",
    lastError: "",
    lastCheckAt: Date.now()
  });
  reportBeaconEvent(OFFLINE_PACK_REPORT_EVENTS.PENDING_PROMOTED, {
    mod_id: OFFLINE_PACK_MOD_ID,
    mod_name: OFFLINE_PACK_MOD_NAME,
    version: newVersion
  });
  return { promotedVersion: newVersion, ok: true, reason: "" };
}
async function landAsPending(stagingTaskDir, version) {
  const pendingDir = getPendingDir();
  try {
    const stat2 = await promises.stat(pendingDir);
    if (stat2.isDirectory()) {
      const obsolete = `${pendingDir}.obsolete.${Date.now()}`;
      try {
        await promises.rename(pendingDir, obsolete);
      } catch (err) {
        log$o().warn("[offline-pack] land.warn rename_old_pending_failed", err);
      }
      void safeRm$3(obsolete);
    }
  } catch {
  }
  try {
    await promises.rename(stagingTaskDir, pendingDir);
  } catch (err) {
    log$o().error("[offline-pack] land.fail rename_to_pending_failed", err);
    return { ok: false, reason: "rename_failed" };
  }
  await writeMeta({
    pendingVersion: version,
    lastError: "",
    lastCheckAt: Date.now()
  });
  return { ok: true, reason: "" };
}
async function safeRm$3(path2) {
  try {
    await promises.rm(path2, { recursive: true, force: true });
  } catch (err) {
    log$o().warn(`[offline-pack] safeRm.fail path=${path2}`, err);
  }
}
function isValidVersion(v) {
  if (typeof v !== "string") return false;
  return VERSION_FORMAT.test(v);
}
function compareVersion(a, b) {
  const aValid = isValidVersion(a);
  const bValid = isValidVersion(b);
  if (!aValid && !bValid) return 0;
  if (!aValid) return -1;
  if (!bValid) return 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
function isStrictlyNewer(candidate, baseline) {
  if (!isValidVersion(candidate)) return false;
  return compareVersion(candidate, baseline) > 0;
}
const VERSION_TXT = "version.txt";
let logger$1k;
function log$n() {
  if (!logger$1k) logger$1k = getLogger("offline-pack");
  return logger$1k;
}
async function readBaselineVersion() {
  const baselineDir = getBaselineDir();
  try {
    const raw = await promises.readFile(join(baselineDir, BUILD_INFO_FILE), "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.version === "string" && parsed.version) {
      return parsed.version;
    }
  } catch {
  }
  try {
    const txt = await promises.readFile(join(baselineDir, VERSION_TXT), "utf-8");
    const version = txt.trim();
    if (version) {
      return version;
    }
  } catch {
  }
  return "";
}
async function overwriteCurrentFromBaselineIfNewer(currentVersion2) {
  const baselineVersion = await readBaselineVersion();
  if (!baselineVersion) {
    log$n().warn("[offline-pack] baseline.read_version_failed skip overwrite");
    return false;
  }
  if (compareVersion(baselineVersion, currentVersion2) <= 0) {
    return false;
  }
  const baselineDir = getBaselineDir();
  const currentDir = getCurrentDir();
  const pendingDir = getPendingDir();
  const backupDir = getBackupDir();
  log$n().warn(`[offline-pack] baseline.overwrite baselineVersion=${baselineVersion} currentVersion=${currentVersion2 || "empty"}`);
  try {
    await safeRm$2(currentDir);
    await safeRm$2(pendingDir);
    await safeRm$2(backupDir);
    await promises.cp(baselineDir, currentDir, { recursive: true, errorOnExist: false });
    await writeMeta({
      currentVersion: baselineVersion,
      pendingVersion: "",
      lastError: "",
      lastCheckAt: Date.now()
    });
    return true;
  } catch (err) {
    log$n().error("[offline-pack] baseline.overwrite_failed", err);
    return false;
  }
}
async function safeRm$2(path2) {
  try {
    await promises.rm(path2, { recursive: true, force: true });
  } catch (err) {
    log$n().warn(`[offline-pack] baseline.safeRm.fail path=${path2}`, err);
  }
}
let logger$1j;
function log$m() {
  if (!logger$1j) logger$1j = getLogger("offline-pack");
  return logger$1j;
}
async function bootstrap$1() {
  const startedAt2 = Date.now();
  try {
    await ensureLayout();
    const metaBefore = await readMeta();
    const baselineVersion = await readBaselineVersion();
    log$m().info(`[offline-pack] bootstrap.start currentVersion=${metaBefore.currentVersion || "empty"} pendingVersion=${metaBefore.pendingVersion || "empty"} baselineVersion=${baselineVersion || "unknown"}`);
    await recoverIfInterrupted();
    const meta1 = await readMeta();
    const overwritten = await overwriteCurrentFromBaselineIfNewer(meta1.currentVersion);
    if (overwritten) {
      log$m().info("[offline-pack] bootstrap.baseline_overwritten");
    }
    const promote = await promotePending();
    if (promote.ok) {
      log$m().info(`[offline-pack] bootstrap.pending_promoted version=${promote.promotedVersion}`);
    } else if (promote.reason !== "pending_missing") {
      log$m().warn(`[offline-pack] bootstrap.pending_skipped reason=${promote.reason}`);
    }
  } catch (err) {
    log$m().error("[offline-pack] bootstrap.fatal", err);
    reportBeaconRealtimeEvent(OFFLINE_PACK_REPORT_EVENTS.BOOTSTRAP_FAILED, {
      mod_id: OFFLINE_PACK_MOD_ID,
      mod_name: OFFLINE_PACK_MOD_NAME,
      error: err.message ?? "unknown"
    });
    try {
      await writeMeta({ lastError: `bootstrap_fatal:${err.message ?? "unknown"}` });
    } catch {
    }
  } finally {
    const cost = Date.now() - startedAt2;
    if (cost > BOOTSTRAP_SLOW_THRESHOLD_MS) {
      log$m().warn(`[offline-pack] bootstrap.slow durationMs=${cost} threshold=${BOOTSTRAP_SLOW_THRESHOLD_MS}`);
    } else {
      log$m().info(`[offline-pack] bootstrap.done durationMs=${cost}`);
      reportBeaconEvent(OFFLINE_PACK_REPORT_EVENTS.BOOTSTRAP_SUCCESS, {
        mod_id: OFFLINE_PACK_MOD_ID,
        mod_name: OFFLINE_PACK_MOD_NAME,
        cost: String(cost)
      });
    }
  }
}
async function ensureLayout() {
  await promises.mkdir(getOfflinePackRoot(), { recursive: true });
  await promises.mkdir(getBundleRoot(), { recursive: true });
  await promises.mkdir(getStagingDir$1(), { recursive: true });
}
let logger$1i;
function log$l() {
  if (!logger$1i) logger$1i = getLogger("offline-pack");
  return logger$1i;
}
async function download(input) {
  const { url, destFilePath } = input;
  await promises.mkdir(dirname(destFilePath), { recursive: true });
  const freeOk = await hasSpaceFor(destFilePath, MIN_FREE_DISK_BYTES);
  if (!freeOk) {
    const result = { ok: false, reason: "disk", httpStatus: 0, message: "insufficient_free_space" };
    reportBeaconRealtimeEvent(OFFLINE_PACK_REPORT_EVENTS.DOWNLOAD_FAILED, {
      mod_id: OFFLINE_PACK_MOD_ID,
      mod_name: OFFLINE_PACK_MOD_NAME,
      reason: result.reason,
      message: result.message,
      url
    });
    return result;
  }
  return new Promise((resolve2) => {
    let resolved = false;
    const settle = (r) => {
      if (resolved) return;
      resolved = true;
      if (r.ok) {
        reportBeaconEvent(OFFLINE_PACK_REPORT_EVENTS.DOWNLOAD_SUCCESS, {
          mod_id: OFFLINE_PACK_MOD_ID,
          mod_name: OFFLINE_PACK_MOD_NAME,
          url,
          size_bytes: String(r.sizeBytes ?? 0)
        });
      } else {
        reportBeaconRealtimeEvent(OFFLINE_PACK_REPORT_EVENTS.DOWNLOAD_FAILED, {
          mod_id: OFFLINE_PACK_MOD_ID,
          mod_name: OFFLINE_PACK_MOD_NAME,
          reason: r.reason,
          http_status: String(r.httpStatus),
          message: r.message,
          url
        });
      }
      resolve2(r);
    };
    let request2;
    try {
      request2 = net.request({ method: "GET", url });
    } catch (err) {
      log$l().error("[offline-pack] download.request_create_failed", err);
      settle({ ok: false, reason: "network", httpStatus: 0, message: err.message });
      return;
    }
    request2.on("response", (response) => {
      const status = response.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        response.on("data", () => {
        });
        response.on("end", () => {
        });
        settle({
          ok: false,
          reason: "http",
          httpStatus: status,
          message: `http_status_${status}`
        });
        return;
      }
      const headers = response.headers ?? {};
      const lengthHeader = headers["content-length"];
      let contentLength = NaN;
      if (typeof lengthHeader === "string") {
        contentLength = parseInt(lengthHeader, 10);
      } else if (Array.isArray(lengthHeader)) {
        contentLength = parseInt(lengthHeader[0], 10);
      }
      if (Number.isFinite(contentLength) && contentLength > 0) {
        void hasSpaceFor(destFilePath, contentLength * 2).then((ok2) => {
          if (!ok2) {
            log$l().warn(`[offline-pack] download.disk_insufficient contentLength=${contentLength}`);
            try {
              request2.abort();
            } catch {
            }
            settle({ ok: false, reason: "disk", httpStatus: 0, message: "insufficient_disk_for_payload" });
          }
        });
      }
      const writer = createWriteStream(destFilePath);
      let receivedBytes = 0;
      response.on("data", (chunk) => {
        receivedBytes += chunk.length;
        if (!writer.write(chunk)) {
          response.pause();
          writer.once("drain", () => response.resume());
        }
      });
      response.on("end", () => {
        writer.end(() => {
          settle({ ok: true, reason: "", httpStatus: status, message: "", sizeBytes: receivedBytes });
        });
      });
      response.on("error", (err) => {
        writer.destroy();
        void safeRm$1(destFilePath).finally(() => {
          settle({ ok: false, reason: "network", httpStatus: status, message: err.message });
        });
      });
      writer.on("error", (err) => {
        try {
          request2.abort();
        } catch {
        }
        void safeRm$1(destFilePath).finally(() => {
          settle({ ok: false, reason: "unknown", httpStatus: status, message: err.message });
        });
      });
    });
    request2.on("error", (err) => {
      void safeRm$1(destFilePath).finally(() => {
        settle({ ok: false, reason: "network", httpStatus: 0, message: err.message });
      });
    });
    request2.on("abort", () => {
      settle({ ok: false, reason: "unknown", httpStatus: 0, message: "aborted" });
    });
    try {
      request2.end();
    } catch (err) {
      settle({ ok: false, reason: "network", httpStatus: 0, message: err.message });
    }
  });
}
async function hasSpaceFor(targetPath, minBytes) {
  const dir = dirname(targetPath);
  const { statfs } = promises;
  if (!statfs) return true;
  try {
    const stat2 = await statfs(dir);
    const free = stat2.bsize * stat2.bavail;
    return free >= minBytes;
  } catch {
    return true;
  }
}
async function safeRm$1(p) {
  try {
    await promises.rm(p, { recursive: true, force: true });
  } catch {
  }
}
let logger$1h;
function log$k() {
  if (!logger$1h) logger$1h = getLogger("offline-pack");
  return logger$1h;
}
async function extractZip$1(srcZipPath, destDir) {
  try {
    await dittoExtract(srcZipPath, destDir);
    reportBeaconEvent(OFFLINE_PACK_REPORT_EVENTS.EXTRACT_SUCCESS, {
      mod_id: OFFLINE_PACK_MOD_ID,
      mod_name: OFFLINE_PACK_MOD_NAME,
      src: srcZipPath
    });
    return { ok: true, message: "" };
  } catch (err) {
    log$k().error("[offline-pack] extract.fail", err);
    reportBeaconRealtimeEvent(OFFLINE_PACK_REPORT_EVENTS.EXTRACT_FAILED, {
      mod_id: OFFLINE_PACK_MOD_ID,
      mod_name: OFFLINE_PACK_MOD_NAME,
      src: srcZipPath,
      error: err.message ?? "unknown"
    });
    return { ok: false, message: err.message ?? "unknown" };
  }
}
function dittoExtract(zipPath, destDir) {
  return new Promise((resolve2, reject) => {
    execFile("/usr/bin/ditto", ["-xk", zipPath, destDir], (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`ditto failed (code=${error.code}): ${stderr || error.message}`));
      } else {
        resolve2();
      }
    });
  });
}
class OfflinePackState {
  _updating = false;
  _currentTaskVersion = null;
  _lastError = "";
  /** 是否正在执行 UpdateOfflinePage 任务 */
  get updating() {
    return this._updating;
  }
  /** 当前正在跑的任务版本号（无任务时为 null） */
  get currentTaskVersion() {
    return this._currentTaskVersion;
  }
  /** 最近一次失败的简要描述（成功时清空） */
  get lastError() {
    return this._lastError;
  }
  /**
   * 抢占互斥锁。
   *
   * @param version 本次任务的目标版本号（用于诊断 / 日志）
   * @returns 是否抢占成功；失败时调用方应立即返回 update_in_progress
   */
  tryBegin(version) {
    if (this._updating) return false;
    this._updating = true;
    this._currentTaskVersion = version;
    return true;
  }
  /**
   * 释放互斥锁。无论成功失败都必须调用（建议在 finally 中执行）。
   *
   * @param error 失败描述；成功时传 undefined
   */
  end(error) {
    this._updating = false;
    this._currentTaskVersion = null;
    this._lastError = error ?? "";
  }
  /** 仅由 bootstrap / baseline 反向覆盖等启动期路径调用，写入诊断错误 */
  recordError(message) {
    this._lastError = message;
  }
}
const offlinePackState = new OfflinePackState();
let logger$1g;
function log$j() {
  if (!logger$1g) logger$1g = getLogger("offline-pack");
  return logger$1g;
}
function makeResult(errorCode, errorMessage, networkErrorCode = 0, networkErrorMessage = "") {
  return {
    error_code: errorCode,
    error_message: errorMessage,
    network_error_code: networkErrorCode,
    network_error_message: networkErrorMessage
  };
}
async function handleUpdateOfflinePage(input) {
  if (!input || typeof input.url !== "string" || typeof input.md5 !== "string" || typeof input.version !== "string") {
    return makeResult(OfflinePackErrorCode.InvalidArgument, "invalid_argument_shape");
  }
  if (!input.url || !input.md5 || !VERSION_FORMAT.test(input.version)) {
    return makeResult(OfflinePackErrorCode.InvalidArgument, "invalid_argument_value");
  }
  if (!offlinePackState.tryBegin(input.version)) {
    return makeResult(OfflinePackErrorCode.UpdateInProgress, "update_in_progress");
  }
  log$j().info(`[offline-pack] update.start version=${input.version} url=${input.url}`);
  const stagingDir = getStagingDir$1();
  const taskId = `task-${Date.now()}`;
  const zipPath = join(stagingDir, `${taskId}.zip`);
  const extractDir = join(stagingDir, taskId);
  let result = makeResult(OfflinePackErrorCode.Unknown, "unknown");
  try {
    const meta = await readMeta();
    if (!isStrictlyNewer(input.version, meta.currentVersion)) {
      log$j().warn(`[offline-pack] update.skip.version_too_low candidate=${input.version} current=${meta.currentVersion || "empty"}`);
      result = makeResult(OfflinePackErrorCode.VersionTooLow, "version_too_low");
      return result;
    }
    await promises.mkdir(stagingDir, { recursive: true });
    const dl = await download({ url: input.url, destFilePath: zipPath });
    if (!dl.ok) {
      log$j().error(`[offline-pack] update.download.fail reason=${dl.reason} httpStatus=${dl.httpStatus} message=${dl.message}`);
      const code = dl.reason === "disk" ? OfflinePackErrorCode.DiskSpaceInsufficient : OfflinePackErrorCode.DownloadFailed;
      result = makeResult(code, `download_failed:${dl.message}`, dl.httpStatus ?? 0, dl.message ?? "");
      return result;
    }
    const md5Ok = await verifyMd5(zipPath, input.md5);
    if (!md5Ok) {
      log$j().error("[offline-pack] update.md5.fail");
      result = makeResult(OfflinePackErrorCode.Md5Mismatch, "md5_mismatch");
      return result;
    }
    const ext = await extractZip$1(zipPath, extractDir);
    if (!ext.ok) {
      result = makeResult(OfflinePackErrorCode.ExtractFailed, `extract_failed:${ext.message}`);
      return result;
    }
    const flatten = await flattenSingleRootDir(extractDir);
    if (!flatten.ok) {
      log$j().warn(`[offline-pack] update.flatten.fail reason=${flatten.reason}`);
    }
    const integrity = await verifyIntegrity(extractDir);
    if (!integrity.ok) {
      log$j().error(`[offline-pack] update.integrity.fail reason=${integrity.reason}`);
      result = makeResult(OfflinePackErrorCode.IntegrityFailed, `integrity_failed:${integrity.reason}`);
      return result;
    }
    if (integrity.version !== input.version) {
      log$j().error(`[offline-pack] update.version.mismatch payload=${integrity.version} expected=${input.version}`);
      result = makeResult(OfflinePackErrorCode.IntegrityFailed, "version_mismatch");
      return result;
    }
    const land = await landAsPending(extractDir, input.version);
    if (!land.ok) {
      result = makeResult(OfflinePackErrorCode.CommitFailed, `commit_failed:${land.reason}`);
      return result;
    }
    const promote = await promotePending();
    if (!promote.ok) {
      log$j().warn(`[offline-pack] update.promote_after_land.fail reason=${promote.reason}`);
    }
    await safeRm(zipPath);
    log$j().info(`[offline-pack] update.commit version=${input.version}`);
    result = makeResult(OfflinePackErrorCode.Success, "");
    return result;
  } catch (err) {
    log$j().error("[offline-pack] update.unknown_exception", err);
    result = makeResult(OfflinePackErrorCode.Unknown, err.message ?? "unknown");
    return result;
  } finally {
    try {
      await safeRm(zipPath);
    } catch {
    }
    try {
      await safeRm(extractDir);
    } catch {
    }
    if (result.error_code !== OfflinePackErrorCode.Success) {
      try {
        await writeMeta({ lastError: result.error_message });
      } catch {
      }
    }
    offlinePackState.end(result.error_code === OfflinePackErrorCode.Success ? void 0 : result.error_message);
  }
}
async function getOfflinePackState() {
  const meta = await readMeta();
  const baselineVersion = await readBaselineVersion();
  return {
    currentVersion: meta.currentVersion,
    pendingVersion: meta.pendingVersion,
    baselineVersion,
    updating: offlinePackState.updating,
    lastError: offlinePackState.lastError || meta.lastError
  };
}
async function flattenSingleRootDir(dir) {
  let entries2;
  try {
    entries2 = await promises.readdir(dir);
  } catch (err) {
    return { ok: false, reason: `readdir:${err.message}` };
  }
  if (entries2.includes("index.html")) return { ok: true, reason: "" };
  const meaningful = entries2.filter((e) => e !== "__MACOSX" && e !== ".DS_Store");
  if (meaningful.length !== 1) return { ok: true, reason: "no_single_root" };
  const onlyEntry = meaningful[0];
  const onlyPath = join(dir, onlyEntry);
  let stat2;
  try {
    stat2 = await promises.stat(onlyPath);
  } catch (err) {
    return { ok: false, reason: `stat:${err.message}` };
  }
  if (!stat2.isDirectory()) return { ok: true, reason: "not_a_dir" };
  let inner;
  try {
    inner = await promises.readdir(onlyPath);
  } catch (err) {
    return { ok: false, reason: `readdir_inner:${err.message}` };
  }
  for (const name of inner) {
    try {
      await promises.rename(join(onlyPath, name), join(dir, name));
    } catch (err) {
      return { ok: false, reason: `rename:${name}:${err.message}` };
    }
  }
  try {
    await promises.rmdir(onlyPath);
  } catch (err) {
    return { ok: false, reason: `rmdir:${err.message}` };
  }
  return { ok: true, reason: "" };
}
async function safeRm(p) {
  try {
    await promises.rm(p, { recursive: true, force: true });
  } catch {
  }
}
function getActiveDir() {
  const current = getCurrentDir();
  if (existsSync(join(current, INDEX_HTML))) {
    return current;
  }
  return getBaselineDir();
}
const DEFAULT_INDEX_FILE = "index.html";
const BASELINE_OFFLINE_PACK_PATH = "./resources/offline-pack/main";
const MIME_TYPE_MAP = {
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm"
};
const DEFAULT_MIME_TYPE = "application/octet-stream";
const LOCAL_GATEWAY_HOSTS = /* @__PURE__ */ new Set(["127.0.0.1", "localhost"]);
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-businessid, x-timestamp, x-nonce, x-signature, x-uin",
  "Access-Control-Max-Age": "86400"
};
const LOCAL_FILE_DATA_HOST = "local_file_data";
const LOCAL_FILE_ICON_HOST = "local_file_icon";
const FILE_DATA_LOCAL_HOST = "file-data.local";
const LOCAL_FILE_PROXY_HOSTS = /* @__PURE__ */ new Set([
  LOCAL_FILE_DATA_HOST,
  LOCAL_FILE_ICON_HOST,
  FILE_DATA_LOCAL_HOST
]);
const MAX_FILE_SIZE_BYTES$1 = 100 * 1024 * 1024;
const MAX_ICON_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_ICON_CONCURRENCY = 3;
const ICON_FETCH_TIMEOUT_MS = 2e3;
const SENSITIVE_PATH_PATTERNS = [
  // Unix 系统敏感目录
  /^\/etc\//i,
  /^\/System\//i,
  /^\/private\/etc\//i,
  /^\/proc\//i,
  /^\/sys\//i,
  // Windows 系统敏感目录
  /^[A-Za-z]:\\Windows\\/i,
  /^[A-Za-z]:\\ProgramData\\/i
];
const INTERCEPTOR_MOD_ID = "interceptor";
const INTERCEPTOR_MOD_NAME = "域名拦截";
const INTERCEPTOR_REPORT_EVENTS = {
  /** 协议拦截器注册完成 */
  REGISTER_SUCCESS: "interceptor__register_success",
  /** 文件代理请求失败 */
  FILE_PROXY_ERROR: "interceptor__file_proxy_error",
  /** 资源未找到 */
  RESOURCE_NOT_FOUND: "interceptor__resource_not_found"
};
let logger$1f;
const oauthCodeCache = /* @__PURE__ */ new Map();
const OAUTH_CODE_CACHE_TTL_MS = 1e4;
function getModuleLogger$n() {
  if (!logger$1f) {
    logger$1f = getLogger("interceptor");
  }
  return logger$1f;
}
function getMimeType(filePath) {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPE_MAP[ext] ?? DEFAULT_MIME_TYPE;
}
function resolveLocalFilePath(url, localBasePath) {
  let { pathname } = url;
  if (pathname.startsWith("/")) {
    pathname = pathname.slice(1);
  }
  if (pathname === "" || pathname.endsWith("/")) {
    pathname = pathname + DEFAULT_INDEX_FILE;
  }
  if (!extname(pathname)) {
    pathname = join(pathname, DEFAULT_INDEX_FILE);
  }
  return join(localBasePath, pathname);
}
function resolveResourcePath(relativePath) {
  if (isAbsolute(relativePath)) {
    return relativePath;
  }
  const normalized = relativePath.replace(/^\.[\\/]+/, "").replace(/^resources[\\/]+/, "");
  if (app.isPackaged) {
    const { resourcesPath } = process;
    if (resourcesPath) {
      return join(resourcesPath, normalized);
    }
    return join(app.getAppPath(), "resources", normalized);
  }
  return resolve(app.getAppPath(), "resources", normalized);
}
function base64ToStr(encoded) {
  const binaryStr = atob(encoded);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}
function decodeBase64Path(pathname) {
  let encoded = pathname;
  if (encoded.startsWith("/")) {
    encoded = encoded.slice(1);
  }
  if (!encoded) {
    throw new Error("路径为空");
  }
  encoded = decodeURIComponent(encoded);
  return base64ToStr(encoded);
}
function parseDirectPath(pathname) {
  let path2 = pathname;
  if (path2.startsWith("/")) {
    path2 = path2.slice(1);
  }
  if (!path2) {
    throw new Error("路径为空");
  }
  return decodeURIComponent(path2);
}
const APFS_DATA_VOLUME_PREFIX = "/System/Volumes/Data";
function normalizeMacosPath(filePath) {
  if (filePath.startsWith(APFS_DATA_VOLUME_PREFIX)) {
    return filePath.slice(APFS_DATA_VOLUME_PREFIX.length) || "/";
  }
  return filePath;
}
function validateFilePath(filePath) {
  if (!isAbsolute(filePath)) {
    return { valid: false, reason: "路径必须是绝对路径" };
  }
  if (filePath.includes("..")) {
    return { valid: false, reason: "路径包含非法遍历序列" };
  }
  const normalizedPath = normalizeMacosPath(filePath);
  for (const pattern of SENSITIVE_PATH_PATTERNS) {
    if (pattern.test(normalizedPath)) {
      return { valid: false, reason: "路径指向受保护的系统目录" };
    }
  }
  return { valid: true };
}
function parseProxyRequest(url) {
  let type;
  let filePath;
  if (url.hostname === FILE_DATA_LOCAL_HOST) {
    type = "data";
    filePath = parseDirectPath(url.pathname);
  } else if (url.hostname === LOCAL_FILE_DATA_HOST) {
    type = "data";
    filePath = decodeBase64Path(url.pathname);
  } else {
    type = "icon";
    filePath = decodeBase64Path(url.pathname);
  }
  const bigIcon = url.searchParams.get("big") === "1";
  return { type, filePath, bigIcon };
}
async function handleFileDataRequest(req) {
  const log2 = getModuleLogger$n();
  const { filePath } = req;
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    log2.warn(`[file-proxy] 文件不存在: ${filePath}`);
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain" }
    });
  }
  if (fileStat.size > MAX_FILE_SIZE_BYTES$1) {
    log2.warn(`[file-proxy] 文件过大: ${filePath}（${fileStat.size} bytes）`);
    return new Response("File Too Large", {
      status: 413,
      headers: { "Content-Type": "text/plain" }
    });
  }
  try {
    const content = await readFile(filePath);
    const mimeType = getMimeType(filePath);
    if (mimeType === "text/html") {
      const html = content.toString("utf-8");
      const scrollbarStyle = `<style data-marvis-scrollbar>
::-webkit-scrollbar { width: 8px; height: 8px; background-color: inherit; }
::-webkit-scrollbar-track { background-color: inherit; }
::-webkit-scrollbar-thumb { background-color: rgba(255, 255, 255, 0.2); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background-color: rgba(255, 255, 255, 0.35); }
::-webkit-scrollbar-corner { background-color: inherit; }
</style>`;
      let injected;
      if (html.includes("</head>")) {
        injected = html.replace("</head>", `${scrollbarStyle}</head>`);
      } else if (html.includes("<body")) {
        injected = html.replace("<body", `${scrollbarStyle}<body`);
      } else {
        injected = scrollbarStyle + html;
      }
      return new Response(injected, {
        status: 200,
        headers: {
          "Content-Type": mimeType,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache"
        }
      });
    }
    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache"
      }
    });
  } catch (error) {
    log2.error(`[file-proxy] 读取文件失败: ${filePath}`, error);
    return new Response("Internal Server Error", {
      status: 500,
      headers: { "Content-Type": "text/plain" }
    });
  }
}
const FALLBACK_TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);
const FALLBACK_GENERIC_FILE_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26" fill="none"><path d="M3.65283 2.19812C3.65283 1.66154 4.08781 1.22656 4.62439 1.22656H18.2138L23.0675 6.08023V23.5526C23.0675 24.0892 22.6325 24.5242 22.096 24.5242H4.62439C4.08781 24.5242 3.65283 24.0892 3.65283 23.5526V2.19812Z" fill="white"/><path d="M4.62451 1.50098H18.1011L22.7935 6.19336V23.5527C22.7934 23.9379 22.4813 24.2499 22.0962 24.25H4.62451C4.23926 24.25 3.92731 23.938 3.92725 23.5527V2.19824C3.92725 1.81295 4.23922 1.50098 4.62451 1.50098Z" stroke="black" stroke-opacity="0.5" stroke-width="0.547852"/><path d="M18.021 5.26291V1.22656L23.0675 6.27307H19.0312C18.4733 6.27307 18.021 5.82081 18.021 5.26291Z" fill="white"/><path d="M22.3794 5.98828H19.0308C18.6303 5.98807 18.3062 5.66316 18.3062 5.2627V1.91406L22.3794 5.98828Z" stroke="black" stroke-opacity="0.5" stroke-width="0.569618"/></svg>',
  "utf-8"
);
function fallbackIconResponse(kind = "generic") {
  if (kind === "transparent") {
    return new Response(FALLBACK_TRANSPARENT_PNG, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
        "X-Icon-Fallback": "transparent"
      }
    });
  }
  return new Response(FALLBACK_GENERIC_FILE_SVG, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
      "X-Icon-Fallback": "generic"
    }
  });
}
let builtinFileIcons = null;
function loadBuiltinFileIcons() {
  if (builtinFileIcons === "failed") return null;
  if (builtinFileIcons !== null) return builtinFileIcons;
  const log2 = getModuleLogger$n();
  try {
    const baseDir = resolveResourcePath("file-icons");
    const manifestPath = join(baseDir, "manifest.json");
    if (!existsSync(manifestPath)) {
      log2.warn(`[file-proxy] 内置图标 manifest 不存在，跳过预加载: ${manifestPath}`);
      builtinFileIcons = "failed";
      return null;
    }
    const raw = readFileSync$1(manifestPath, "utf-8");
    const manifest = JSON.parse(raw);
    const buffers = /* @__PURE__ */ new Map();
    for (const [key, fileName] of Object.entries(manifest)) {
      if (typeof fileName !== "string") continue;
      const pngPath = join(baseDir, fileName);
      try {
        buffers.set(key.toLowerCase(), readFileSync$1(pngPath));
      } catch (err) {
        log2.warn(`[file-proxy] 内置图标读取失败: key=${key} path=${pngPath} — ${err.message}`);
      }
    }
    builtinFileIcons = { buffers, totalEntries: buffers.size };
    log2.info(`[file-proxy] 内置图标已加载 — entries=${buffers.size} dir=${baseDir}`);
    return builtinFileIcons;
  } catch (error) {
    log2.warn(`[file-proxy] 内置图标加载失败，运行时仅走 NSWorkspace 链路: ${error.message}`);
    builtinFileIcons = "failed";
    return null;
  }
}
function lookupBuiltinFileIcon(ext) {
  const bundle = loadBuiltinFileIcons();
  if (!bundle) return null;
  if (ext) {
    const key = ext.startsWith(".") ? ext.slice(1) : ext;
    if (key) {
      const hit = bundle.buffers.get(key.toLowerCase());
      if (hit) return hit;
    }
  }
  return bundle.buffers.get("_default") ?? null;
}
function builtinIconResponse(buffer) {
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=86400",
      "X-Icon-Source": "builtin"
    }
  });
}
let iconConcurrent = 0;
const iconQueue = [];
function acquireIconSlot() {
  if (iconConcurrent < MAX_ICON_CONCURRENCY) {
    iconConcurrent += 1;
    return Promise.resolve();
  }
  return new Promise((resolve2) => {
    iconQueue.push(resolve2);
  });
}
function releaseIconSlot() {
  const next = iconQueue.shift();
  if (next) {
    next();
  } else {
    iconConcurrent -= 1;
  }
}
function getFileIconWithTimeout(filePath, size) {
  return new Promise((resolve2, reject) => {
    let settled = false;
    const timer2 = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`getFileIcon timeout after ${ICON_FETCH_TIMEOUT_MS}ms`));
    }, ICON_FETCH_TIMEOUT_MS);
    app.getFileIcon(filePath, { size }).then((icon) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer2);
      resolve2(icon);
    }).catch((err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer2);
      reject(err);
    });
  });
}
async function handleFileIconRequest(req) {
  const log2 = getModuleLogger$n();
  const { filePath, bigIcon } = req;
  const ext = extname(filePath).toLowerCase();
  if (process.platform === "darwin") {
    const builtin = lookupBuiltinFileIcon(ext);
    if (builtin) {
      log2.debug(`[file-proxy] 图标命中内置资源池: ext="${ext}" path=${filePath}`);
      return builtinIconResponse(builtin);
    }
    log2.warn(`[file-proxy] 图标内置资源池未命中且无 _default 兜底，回落 SVG: ext="${ext}" path=${filePath}`);
    return fallbackIconResponse();
  }
  let fileSize = null;
  try {
    const fileStat = await stat(filePath);
    fileSize = fileStat.size;
  } catch {
    log2.debug(`[file-proxy] 图标 stat 失败，使用 fallback: ${filePath}`);
    return fallbackIconResponse("transparent");
  }
  if (fileSize > MAX_ICON_FILE_SIZE_BYTES) {
    log2.warn(`[file-proxy] 图标提取跳过（文件过大 ${fileSize} bytes > ${MAX_ICON_FILE_SIZE_BYTES}）: ${filePath}`);
    return fallbackIconResponse();
  }
  await acquireIconSlot();
  try {
    const size = bigIcon ? "large" : "small";
    const icon = await getFileIconWithTimeout(filePath, size);
    const pngBuffer = icon.toPNG();
    if (!pngBuffer || pngBuffer.length === 0) {
      log2.debug(`[file-proxy] 图标 toPNG 为空，使用 fallback: ${filePath}`);
      return fallbackIconResponse();
    }
    return new Response(pngBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch (error) {
    log2.warn(`[file-proxy] 获取文件图标失败，使用 fallback: ${filePath} — ${error.message}`);
    return fallbackIconResponse();
  } finally {
    releaseIconSlot();
  }
}
async function handleLocalFileProxy(request2) {
  const log2 = getModuleLogger$n();
  try {
    const url = new URL(request2.url);
    let proxyRequest;
    try {
      proxyRequest = parseProxyRequest(url);
    } catch {
      log2.warn(`[file-proxy] 请求解析失败: ${request2.url}`);
      return new Response("Bad Request", {
        status: 400,
        headers: { "Content-Type": "text/plain" }
      });
    }
    const validation = validateFilePath(proxyRequest.filePath);
    if (!validation.valid) {
      log2.warn(`[file-proxy] 路径校验失败: ${validation.reason} — path=${proxyRequest.filePath}`);
      return new Response("Forbidden", {
        status: 403,
        headers: { "Content-Type": "text/plain" }
      });
    }
    if (proxyRequest.type === "data") {
      return await handleFileDataRequest(proxyRequest);
    }
    return await handleFileIconRequest(proxyRequest);
  } catch (error) {
    log2.error("[file-proxy] 未预期的错误", error);
    return new Response("Internal Server Error", {
      status: 500,
      headers: { "Content-Type": "text/plain" }
    });
  }
}
function registerDomainInterceptor(mappings) {
  const log2 = getModuleLogger$n();
  const domainSet = new Set(Object.keys(mappings));
  if (domainSet.size === 0) {
    log2.warn("域名映射为空，跳过拦截器注册");
    return;
  }
  protocol.handle("https", async (request2) => {
    const url = new URL(request2.url);
    if (LOCAL_FILE_PROXY_HOSTS.has(url.hostname)) {
      return handleLocalFileProxy(request2);
    }
    if (!domainSet.has(url.hostname)) {
      const reqHeaders = {};
      request2.headers.forEach((v, k) => {
        reqHeaders[k] = v;
      });
      let cookies = [];
      try {
        cookies = await session.defaultSession.cookies.get({
          domain: url.hostname
        });
        if (cookies.length > 0) {
          const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
          reqHeaders.cookie = cookieStr;
        }
      } catch (cookieErr) {
        log2.warn(`[pass-through] failed to read cookies for ${url.hostname}: ${cookieErr.message}`);
      }
      if (!reqHeaders.referer) {
        reqHeaders.referer = url.origin;
      }
      if (!reqHeaders.origin) {
        reqHeaders.origin = url.origin;
      }
      const enhancedRequest = new Request(request2, {
        headers: reqHeaders
      });
      const isSjDomain = url.hostname === "sj.qq.com";
      if (isSjDomain) {
        const cookieNames = cookies.map((c) => c.name).join(", ");
        log2.info(`[pass-through] ${request2.method} ${url.pathname} content-type=${reqHeaders["content-type"] || "<none>"} origin=${reqHeaders.origin || "<none>"} referer=${reqHeaders.referer || "<none>"} cookie=<present> names=[${cookieNames}] hasBody=${request2.body !== null}`);
        log2.info(`[pass-through] ${request2.method} ${url.pathname} ALL_REQ_HEADERS: ${JSON.stringify(reqHeaders)}`);
      }
      const path2 = url.pathname;
      const code = url.searchParams.get("code") ?? "";
      const state2 = url.searchParams.get("state") ?? "";
      const dedupEligible = request2.method === "GET" && path2.includes("marvis_oauth") && !!code && !!state2;
      if (dedupEligible) {
        const cacheKey = `${state2}:${code}`;
        const codePeek = `${code.slice(0, 8)}...(len=${code.length})`;
        const existing = oauthCodeCache.get(cacheKey);
        if (existing) {
          const ageMs = Date.now() - existing.createdAt;
          log2.warn(`[oauth-dedup] hit reuse first request (age=${ageMs}ms) code=${codePeek}`);
          try {
            await existing.fetchPromise;
            if (existing.templateResponse && existing.templateResponse.status < 400) {
              return existing.templateResponse.clone();
            }
            log2.warn("[oauth-dedup] first request failed, fallthrough to direct fetch");
            return await session.defaultSession.fetch(enhancedRequest, { bypassCustomProtocolHandlers: true });
          } catch (err) {
            log2.warn(`[oauth-dedup] error while awaiting first req — ${err.message}, fallthrough to direct fetch`);
            return await session.defaultSession.fetch(enhancedRequest, { bypassCustomProtocolHandlers: true });
          }
        }
        log2.info(`[oauth-dedup] miss primary request code=${codePeek}, cache for ${OAUTH_CODE_CACHE_TTL_MS}ms`);
        const fetchPromise = session.defaultSession.fetch(enhancedRequest, { bypassCustomProtocolHandlers: true });
        const cleanupTimer = setTimeout(() => {
          oauthCodeCache.delete(cacheKey);
        }, OAUTH_CODE_CACHE_TTL_MS);
        cleanupTimer.unref?.();
        const entry = {
          fetchPromise,
          templateResponse: null,
          createdAt: Date.now(),
          cleanupTimer
        };
        oauthCodeCache.set(cacheKey, entry);
        try {
          const resp = await fetchPromise;
          if (resp.status < 400) {
            entry.templateResponse = resp.clone();
          } else {
            clearTimeout(cleanupTimer);
            oauthCodeCache.delete(cacheKey);
            log2.warn(`[oauth-dedup] not caching due to status=${resp.status} (>=400)`);
          }
          return resp;
        } catch (err) {
          clearTimeout(cleanupTimer);
          oauthCodeCache.delete(cacheKey);
          log2.warn(`[oauth-dedup] primary fetch error — ${err.message}`);
          throw err;
        }
      }
      const passThroughResult = await session.defaultSession.fetch(enhancedRequest, { bypassCustomProtocolHandlers: true });
      if (isSjDomain) {
        const respHeaders = {};
        passThroughResult.headers.forEach((v, k) => {
          respHeaders[k] = v;
        });
        log2.info(`[pass-through] ← ${request2.method} ${url.pathname} status=${passThroughResult.status} content-type=${passThroughResult.headers.get("content-type") || "<none>"} eo-log-uuid=${passThroughResult.headers.get("eo-log-uuid") || "<none>"}`);
        if (passThroughResult.status >= 400) {
          log2.warn(`[pass-through] ← ${request2.method} ${url.pathname} ALL_RESP_HEADERS: ${JSON.stringify(respHeaders)}`);
        }
      }
      return passThroughResult;
    }
    const configuredPath = mappings[url.hostname];
    const baselinePath = resolveResourcePath(BASELINE_OFFLINE_PACK_PATH);
    const configuredAbsPath = resolveResourcePath(configuredPath);
    const isMainDomain = url.hostname === DEFAULT_DOMAIN_MAIN;
    const usingOfflinePack = isMainDomain && configuredAbsPath === baselinePath;
    const localBasePath = usingOfflinePack ? getActiveDir() : configuredAbsPath;
    let filePath = resolveLocalFilePath(url, localBasePath);
    if (!existsSync(filePath)) {
      log2.warn(`本地资源不存在: ${filePath}，尝试回退到基线包`);
      filePath = resolveLocalFilePath(url, baselinePath);
      if (!existsSync(filePath)) {
        log2.error(`基线资源也不存在: ${filePath}`);
        reportBeaconEvent(INTERCEPTOR_REPORT_EVENTS.RESOURCE_NOT_FOUND, {
          mod_id: INTERCEPTOR_MOD_ID,
          mod_name: INTERCEPTOR_MOD_NAME,
          file_path: filePath,
          hostname: url.hostname,
          pathname: url.pathname
        });
        return new Response("Resource Not Found", {
          status: 404,
          headers: { "Content-Type": "text/plain" }
        });
      }
    }
    try {
      const fileContent = readFileSync$1(filePath);
      const mimeType = getMimeType(filePath);
      return new Response(fileContent, {
        status: 200,
        headers: {
          "Content-Type": mimeType,
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (error) {
      log2.error(`读取本地资源失败: ${filePath}`, error);
      reportBeaconRealtimeEvent(INTERCEPTOR_REPORT_EVENTS.FILE_PROXY_ERROR, {
        mod_id: INTERCEPTOR_MOD_ID,
        mod_name: INTERCEPTOR_MOD_NAME,
        file_path: filePath,
        error_msg: error.message ?? ""
      });
      return new Response("Internal Server Error", {
        status: 500,
        headers: { "Content-Type": "text/plain" }
      });
    }
  });
  log2.info(`域名拦截器已注册 — 拦截域名: ${Array.from(domainSet).join(", ")}`);
  reportBeaconEvent(INTERCEPTOR_REPORT_EVENTS.REGISTER_SUCCESS, {
    mod_id: INTERCEPTOR_MOD_ID,
    mod_name: INTERCEPTOR_MOD_NAME,
    domain_count: String(domainSet.size)
  });
}
function handleWithNetRequest(request2) {
  const log2 = getModuleLogger$n();
  return new Promise((resolve2) => {
    const clientRequest = net.request({
      method: request2.method,
      url: request2.url,
      session: session.defaultSession,
      bypassCustomProtocolHandlers: true,
      // 防止死循环
      redirect: "follow",
      useSessionCookies: false,
      // 本地 gateway 不需要 session cookies
      credentials: "omit",
      // 本地请求不需要凭据
      cache: request2.cache
    });
    for (const [key, value] of request2.headers.entries()) {
      clientRequest.setHeader(key, value);
    }
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      log2.debug(`[CORS proxy] 清理连接: ${request2.method} ${request2.url}`);
      clientRequest.abort();
    };
    request2.signal?.addEventListener("abort", cleanup, { once: true });
    clientRequest.on("response", (response) => {
      log2.debug(`[CORS proxy] Response: ${response.statusCode} ${request2.method} ${request2.url}`);
      const responseHeaders = new Headers();
      for (const [key, value] of Object.entries(response.headers)) {
        responseHeaders.set(key, (Array.isArray(value) ? value[0] : value) || "");
      }
      for (const [key, value] of Object.entries(CORS_HEADERS)) {
        responseHeaders.set(key, value);
      }
      const stream = new ReadableStream({
        start(controller) {
          response.on("data", (chunk) => {
            if (request2.signal?.aborted) {
              log2.debug(`[CORS proxy] 客户端已断开，停止传输 ${request2.url}`);
              cleanup();
              controller.close();
              return;
            }
            controller.enqueue(new Uint8Array(chunk));
          });
          response.on("end", () => {
            log2.debug(`[CORS proxy] Stream 正常结束 ${request2.url}`);
            request2.signal?.removeEventListener("abort", cleanup);
            controller.close();
          });
          response.on("error", (err) => {
            log2.error(`[CORS proxy] Stream error: ${err.message} ${request2.url}`);
            cleanup();
            controller.error(err);
          });
          response.on("aborted", () => {
            log2.debug(`[CORS proxy] Response aborted ${request2.url}`);
            cleanup();
            controller.close();
          });
        },
        // 关键 4：客户端主动取消时（虽然可能不可靠，但仍保留）
        cancel() {
          log2.debug(`[CORS proxy] Stream cancelled by client ${request2.url}`);
          cleanup();
        }
      });
      resolve2(new Response(stream, {
        status: response.statusCode,
        statusText: response.statusMessage,
        headers: responseHeaders
      }));
    });
    clientRequest.on("error", (err) => {
      request2.signal?.removeEventListener("abort", cleanup);
      const errMsg = err.message || "";
      const isConnectionRefused = /ECONNREFUSED|ERR_CONNECTION_REFUSED/i.test(errMsg);
      if (isConnectionRefused) {
        log2.debug(`[CORS proxy] Gateway not ready: ${request2.method} ${request2.url}`);
      } else {
        log2.warn(`[CORS proxy] Request error: ${request2.method} ${request2.url} — ${errMsg}`);
      }
      resolve2(new Response(JSON.stringify({ error: errMsg }), {
        status: isConnectionRefused ? 503 : 502,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS
        }
      }));
    });
    clientRequest.on("abort", () => {
      log2.debug(`[CORS proxy] ClientRequest aborted ${request2.url}`);
      request2.signal?.removeEventListener("abort", cleanup);
    });
    if (request2.body) {
      const reader = request2.body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              clientRequest.end();
              break;
            }
            clientRequest.write(Buffer.from(value));
          }
        } catch (err) {
          log2.error(`[CORS proxy] Request body stream error: ${err.message} ${request2.url}`);
          clientRequest.abort();
        }
      };
      pump().catch((err) => {
        log2.error(`[CORS proxy] Failed to pump request body: ${err.message} ${request2.url}`);
      });
    } else {
      clientRequest.end();
    }
  });
}
function registerLocalGatewayCorsProxy() {
  const log2 = getModuleLogger$n();
  protocol.handle("http", async (request2) => {
    const url = new URL(request2.url);
    if (!LOCAL_GATEWAY_HOSTS.has(url.hostname)) {
      return net.fetch(request2, { bypassCustomProtocolHandlers: true });
    }
    if (request2.method === "OPTIONS") {
      log2.debug(`[CORS proxy] OPTIONS preflight: ${url.pathname}`);
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }
    log2.debug(`[CORS proxy] ${request2.method} ${url.hostname}${url.pathname}`);
    return handleWithNetRequest(request2);
  });
  log2.info("本地 gateway CORS 代理已注册 — 代理主机: 127.0.0.1, localhost");
}
const RESPONSIVE_BREAKPOINTS = [
  { minLogicalWidth: 1920, width: 1764, height: 954 },
  { minLogicalWidth: 1440, width: 1323, height: 716 },
  { minLogicalWidth: 1200, width: 1080, height: 600 },
  { minLogicalWidth: 0, width: 900, height: 502 }
];
const MIN_WINDOW_WIDTH = 900;
const MIN_WINDOW_HEIGHT = 502;
const TRAFFIC_LIGHT_POSITION_X = 24;
const TRAFFIC_LIGHT_POSITION_Y = 24;
const APP_ICON_NAME = "icon.png";
({
  width: RESPONSIVE_BREAKPOINTS[0].width,
  height: RESPONSIVE_BREAKPOINTS[0].height
});
const PLATFORM_MACOS = "darwin";
function isMacOS() {
  return process.platform === PLATFORM_MACOS;
}
function getResourcePath(...segments) {
  if (app.isPackaged) {
    return join(process.resourcesPath ?? "", ...segments);
  }
  return join(app.getAppPath(), "resources", ...segments);
}
const resource = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getResourcePath
}, Symbol.toStringTag, { value: "Module" }));
const SNAPSHOT_FILENAME = "marvis-child-pids.json";
let cachedPath = null;
function getSnapshotPath() {
  if (cachedPath) return cachedPath;
  let base;
  try {
    base = app.getPath("userData");
  } catch {
    const os2 = require2("os");
    base = os2.tmpdir();
  }
  cachedPath = join(base, SNAPSHOT_FILENAME);
  return cachedPath;
}
let logger$1e = null;
function log$i() {
  if (!logger$1e) logger$1e = getLogger("process-snapshot");
  return logger$1e;
}
function atomicWriteJson(path2, data) {
  try {
    if (!existsSync(dirname(path2))) {
      mkdirSync(dirname(path2), { recursive: true });
    }
    const tmp = `${path2}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    renameSync(tmp, path2);
  } catch (err) {
    log$i().warn(`写入 PID 快照失败: ${err.message}`);
  }
}
function readSnapshot() {
  const path2 = getSnapshotPath();
  if (!existsSync(path2)) {
    return { electronPid: process.pid, updatedAt: (/* @__PURE__ */ new Date()).toISOString(), children: [] };
  }
  try {
    const raw = readFileSync$1(path2, "utf8");
    const parsed = JSON.parse(raw);
    const children = Array.isArray(parsed.children) ? parsed.children : [];
    return {
      electronPid: typeof parsed.electronPid === "number" ? parsed.electronPid : 0,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      children: children.filter((c) => !!c && typeof c.name === "string" && typeof c.pid === "number" && typeof c.exeBaseName === "string")
    };
  } catch (err) {
    log$i().warn(`解析 PID 快照失败，按空处理: ${err.message}`);
    return { electronPid: process.pid, updatedAt: (/* @__PURE__ */ new Date()).toISOString(), children: [] };
  }
}
function recordChildProcess(record) {
  const snap = readSnapshot();
  const filtered = snap.children.filter((c) => c.name !== record.name && c.pid !== record.pid);
  filtered.push(record);
  atomicWriteJson(getSnapshotPath(), {
    electronPid: process.pid,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    children: filtered
  });
}
function removeChildProcess(pid) {
  const snap = readSnapshot();
  const next = snap.children.filter((c) => c.pid !== pid);
  if (next.length === snap.children.length) return;
  atomicWriteJson(getSnapshotPath(), {
    electronPid: process.pid,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    children: next
  });
}
function listOrphanRecords(allowedExes) {
  const snap = readSnapshot();
  if (snap.children.length === 0) return [];
  const allowSet = new Set(allowedExes);
  const survivors = [];
  for (const rec of snap.children) {
    if (!allowSet.has(rec.exeBaseName)) continue;
    if (rec.pid === process.pid) continue;
    try {
      process.kill(rec.pid, 0);
      survivors.push(rec);
    } catch (err) {
      const { code } = err;
      if (code === "EPERM") survivors.push(rec);
    }
  }
  return survivors;
}
function clearSnapshot() {
  atomicWriteJson(getSnapshotPath(), {
    electronPid: process.pid,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    children: []
  });
}
function sendSignal$1(pids, signal) {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch (err) {
      const { code } = err;
      if (code === "ESRCH") continue;
      log$i().debug(`kill(${pid}, ${String(signal)}) 失败: ${err.message}`);
    }
  }
}
function isAlive$2(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const { code } = err;
    return code === "EPERM";
  }
}
function sleep$8(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}
async function sweepPreviousSessionOrphans(allowedExes) {
  const orphans = listOrphanRecords(allowedExes);
  if (orphans.length === 0) {
    clearSnapshot();
    return [];
  }
  log$i().warn(`检测到 ${orphans.length} 个上次会话遗留的子进程，开始清理:`);
  for (const o of orphans) {
    log$i().warn(`  - name=${o.name} pid=${o.pid} exe=${o.exeBaseName} addedAt=${o.addedAt}`);
  }
  const pids = orphans.map((o) => o.pid);
  sendSignal$1(pids, "SIGTERM");
  await sleep$8(500);
  const survivors = pids.filter(isAlive$2);
  if (survivors.length > 0) {
    log$i().warn(`SIGTERM 后仍有 ${survivors.length} 个存活，发送 SIGKILL: [${survivors.join(", ")}]`);
    sendSignal$1(survivors, "SIGKILL");
    await sleep$8(300);
  }
  const stillAlive = pids.filter(isAlive$2);
  if (stillAlive.length > 0) {
    log$i().error(`清理后仍有残留未终止（可能是僵尸或权限异常）: [${stillAlive.join(", ")}]`);
  } else {
    log$i().info(`上次会话遗留子进程已全部清理: [${pids.join(", ")}]`);
  }
  clearSnapshot();
  return pids;
}
function sweepPreviousSessionOrphansSync(allowedExes) {
  try {
    const orphans = listOrphanRecords(allowedExes);
    if (orphans.length === 0) return [];
    const pids = orphans.map((o) => o.pid);
    sendSignal$1(pids, "SIGKILL");
    try {
      clearSnapshot();
    } catch {
    }
    return pids;
  } catch {
    return [];
  }
}
let tracerFile = null;
const startedAt = Date.now();
let writeErrorCount = 0;
const WRITE_ERROR_LIMIT = 10;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const CHECK_INTERVAL_LINES = 1e3;
let linesSinceLastCheck = 0;
function rotateIfNeeded(file) {
  try {
    const st = fs.statSync(file);
    if (st.size <= MAX_FILE_SIZE_BYTES) return;
    const rotatedFile = `${file}.1`;
    try {
      if (fs.existsSync(rotatedFile)) {
        fs.unlinkSync(rotatedFile);
      }
    } catch {
    }
    try {
      fs.renameSync(file, rotatedFile);
    } catch {
      try {
        fs.truncateSync(file, 0);
      } catch {
      }
    }
  } catch {
  }
}
function ensureTracerFile() {
  if (tracerFile !== null) return tracerFile;
  const dir = getLogDir();
  if (!dir) return null;
  tracerFile = path.join(dir, "jsb-tracer.log");
  rotateIfNeeded(tracerFile);
  try {
    const header = `
=== Marvis Tracer Session pid=${process.pid} startedAt=${new Date(startedAt).toISOString()} ===
`;
    fs.appendFileSync(tracerFile, header, { encoding: "utf-8" });
  } catch (err) {
    console.warn("[tracer] 初始化失败:", err.message);
    tracerFile = null;
    return null;
  }
  return tracerFile;
}
function fmtTs() {
  const now = /* @__PURE__ */ new Date();
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
}
function trace(tag, msg) {
  const file = ensureTracerFile();
  if (!file) return;
  linesSinceLastCheck += 1;
  if (linesSinceLastCheck >= CHECK_INTERVAL_LINES) {
    linesSinceLastCheck = 0;
    rotateIfNeeded(file);
  }
  const offsetMs = Date.now() - startedAt;
  const line = `[${fmtTs()}] [+${offsetMs}ms] [${tag}] ${msg}
`;
  try {
    fs.appendFileSync(file, line, { encoding: "utf-8" });
  } catch (err) {
    if (writeErrorCount < WRITE_ERROR_LIMIT) {
      writeErrorCount += 1;
      console.warn(
        `[tracer] 写入失败(${writeErrorCount}/${WRITE_ERROR_LIMIT}):`,
        err.message
      );
    }
  }
}
function traceFatal(tag, msg) {
  trace(tag, `!!! FATAL !!! ${msg}`);
}
const FORWARDER_SCOPE = "pcweb";
const CONSOLE_LEVEL = {
  VERBOSE_STR: "verbose",
  INFO_STR: "info",
  WARNING_STR: "warning",
  ERROR_STR: "error",
  VERBOSE_NUM: 0,
  INFO_NUM: 1,
  WARNING_NUM: 2,
  ERROR_NUM: 3
};
const ANONYMOUS_SOURCE = "<anonymous>";
const DEV_TOOLS_SOURCE_LABEL = "[dev-tools console]";
const attached = /* @__PURE__ */ new WeakSet();
let logger$1d = null;
function getModuleLogger$m() {
  if (!logger$1d) {
    logger$1d = getLogger(FORWARDER_SCOPE);
  }
  return logger$1d;
}
function normalizeLevel(level) {
  if (typeof level === "string") {
    switch (level) {
      case CONSOLE_LEVEL.VERBOSE_STR:
      case CONSOLE_LEVEL.INFO_STR:
      case CONSOLE_LEVEL.WARNING_STR:
      case CONSOLE_LEVEL.ERROR_STR:
        return level;
      // Chromium 内部有时也会出现 'log' 这种别名，归入 info
      default:
        return "info";
    }
  }
  if (typeof level === "number") {
    switch (level) {
      case CONSOLE_LEVEL.VERBOSE_NUM:
        return "verbose";
      case CONSOLE_LEVEL.INFO_NUM:
        return "info";
      case CONSOLE_LEVEL.WARNING_NUM:
        return "warning";
      case CONSOLE_LEVEL.ERROR_NUM:
        return "error";
      default:
        return "info";
    }
  }
  return "info";
}
function shouldForward(level) {
  return level === "warning" || level === "error";
}
function buildSourcePrefix(sourceId, line) {
  const safeSource = (sourceId ?? "").trim();
  if (!safeSource || safeSource === ANONYMOUS_SOURCE) {
    return line > 0 ? DEV_TOOLS_SOURCE_LABEL : "";
  }
  const withoutQueryHash = safeSource.split("?")[0].split("#")[0];
  const basename2 = withoutQueryHash.split(/[/\\]/).pop() || withoutQueryHash;
  const safeLine = line > 0 ? line : 0;
  return safeLine > 0 ? `[${basename2}:${safeLine}]` : `[${basename2}]`;
}
function formatMessage(msg) {
  const prefix = buildSourcePrefix(msg.sourceId, msg.lineNumber);
  const trimmed = msg.message ?? "";
  return prefix ? `${prefix} ${trimmed}` : trimmed;
}
function extractMessage(args) {
  const [first, level, message, lineNumber, sourceId] = args;
  if (first !== null && typeof first === "object" && "level" in first && "message" in first) {
    const evt = first;
    return {
      level: normalizeLevel(evt.level),
      message: typeof evt.message === "string" ? evt.message : String(evt.message ?? ""),
      lineNumber: typeof evt.lineNumber === "number" ? evt.lineNumber : 0,
      sourceId: typeof evt.sourceId === "string" ? evt.sourceId : ""
    };
  }
  return {
    level: normalizeLevel(level),
    message: typeof message === "string" ? message : String(message ?? ""),
    lineNumber: typeof lineNumber === "number" ? lineNumber : 0,
    sourceId: typeof sourceId === "string" ? sourceId : ""
  };
}
function attachRendererConsoleForwarder(wc) {
  if (!wc) return;
  if (attached.has(wc)) return;
  attached.add(wc);
  const moduleLogger = getModuleLogger$m();
  const handler = (...args) => {
    try {
      const normalized = extractMessage(args);
      if (!shouldForward(normalized.level)) return;
      const text = formatMessage(normalized);
      if (normalized.level === "warning") {
        moduleLogger.warn(text);
      } else {
        moduleLogger.error(text);
      }
    } catch (err) {
      try {
        moduleLogger.error(`[renderer-console] forwarder 异常: ${err?.message ?? String(err)}`);
      } catch {
      }
    }
  };
  wc.on(
    "console-message",
    handler
  );
  try {
    wc.once("destroyed", () => {
      attached.delete(wc);
    });
  } catch {
  }
}
const WINDOW_REPORT_EVENTS = {
  /** 主窗口创建完成 */
  CREATE: "window__create",
  /** 主窗口 ready-to-show */
  READY_TO_SHOW: "window__ready_to_show",
  /** 主窗口关闭（隐藏到托盘） */
  CLOSE: "window__close",
  /** 渲染进程崩溃（严重错误，实时上报） */
  CRASH: "window__crash",
  /** loadURL 失败（严重错误，实时上报） */
  LOAD_URL_FAILURE: "window__load_url_failure"
};
const LNA_PERMISSION_OVERRIDE_SCRIPT = `
(function() {
  'use strict';
  if (window.__lna_permission_patched) return;
  window.__lna_permission_patched = true;

  if (!window.navigator || !window.navigator.permissions || !window.navigator.permissions.query) {
    return;
  }

  var OrigQuery = window.navigator.permissions.query.bind(window.navigator.permissions);

  window.navigator.permissions.query = function(params) {
    if (params && params.name === 'local-network-access') {
      // 伪造一个 PermissionStatus 对象：state=granted，并提供 add/removeEventListener 防止 SDK 调用报错
      var listeners = new Set();
      return Promise.resolve({
        state: 'granted',
        addEventListener: function(type, listener) { if (type === 'change') listeners.add(listener); },
        removeEventListener: function(type, listener) { if (type === 'change') listeners.delete(listener); },
        dispatchEvent: function() { return true; },
      });
    }
    return OrigQuery(params);
  };

  try {
    console.log('[LNA] navigator.permissions.query 已覆写 (local-network-access -> granted)');
  } catch (_e) {}
})();
`;
let logger$1c;
function getModuleLogger$l() {
  if (!logger$1c) {
    logger$1c = getLogger("lna-permission");
  }
  return logger$1c;
}
function injectIntoFrame(frame, label) {
  const log2 = getModuleLogger$l();
  const url = frame.url || "(unknown)";
  if (frame.detached || frame.isDestroyed()) {
    log2.debug(`[lna] frame 已 detach/destroy，跳过注入 ${label} url=${url}`);
    return;
  }
  frame.executeJavaScript(LNA_PERMISSION_OVERRIDE_SCRIPT).then(() => {
    log2.debug(`[lna] 注入成功 ${label} url=${url}`);
  }).catch((err) => {
    log2.warn(`[lna] 注入失败 ${label} url=${url} err=${err.message}`);
  });
}
function attachLnaPermissionOverride(webContents, tag = "main") {
  const log2 = getModuleLogger$l();
  webContents.on("did-finish-load", () => {
    const top = webContents.mainFrame;
    if (!top) {
      log2.warn(`[lna][${tag}] did-finish-load 时 mainFrame 不可用，跳过注入`);
      return;
    }
    injectIntoFrame(top, `[${tag}][top]`);
  });
  webContents.on("did-frame-finish-load", (_event, isMainFrame, frameProcessId, frameRoutingId) => {
    const target = webFrameMain.fromId(frameProcessId, frameRoutingId);
    if (!target) {
      log2.debug(`[lna][${tag}] did-frame-finish-load 时 frame 已不可用 pid=${frameProcessId} rid=${frameRoutingId}`);
      return;
    }
    injectIntoFrame(target, `[${tag}][${isMainFrame ? "top" : "iframe"}]`);
  });
  log2.info(`[lna][${tag}] LNA 权限覆写注入器已挂载（覆盖顶层窗口 + 所有跨域 iframe）`);
}
const INTERNAL_HOSTS = /* @__PURE__ */ new Set([
  DEFAULT_DOMAIN_MAIN,
  // marvis-client.yyb.qq.com
  DEBUG_DOMAIN,
  // marvis-debug.local
  ...LOCAL_GATEWAY_HOSTS,
  // 127.0.0.1 / localhost
  "local_file_data",
  // interceptor 虚拟 host
  "local_file_icon"
  // interceptor 虚拟 host
]);
function setupExternalLinkHandler(window) {
  const log2 = getModuleLogger$k();
  window.webContents.setWindowOpenHandler(({ url }) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      log2.warn(`[window-open] 无法解析 URL，放行默认: ${url}`);
      return { action: "allow" };
    }
    const isHttp = parsed.protocol === "https:" || parsed.protocol === "http:";
    if (!isHttp) {
      return { action: "allow" };
    }
    if (INTERNAL_HOSTS.has(parsed.hostname)) {
      log2.info(`[window-open] 内部域名，默认放行: ${url}`);
      return { action: "allow" };
    }
    log2.info(`[window-open] 外部链接，交由系统浏览器打开: ${url}`);
    shell.openExternal(url).catch((err) => {
      log2.warn(`[window-open] shell.openExternal 失败: ${url} — ${err.message}`);
    });
    return { action: "deny" };
  });
  log2.info("[window-open] 外部链接处理器已注册（内部域名放行 / 外部链接交系统浏览器）");
}
const launchedHidden = process.argv.includes("--hidden");
let mainWindow = null;
let logger$1b;
function getModuleLogger$k() {
  if (!logger$1b) {
    logger$1b = getLogger("window");
  }
  return logger$1b;
}
function computeDefaultContentSize(workAreaWidth) {
  for (const bp of RESPONSIVE_BREAKPOINTS) {
    if (workAreaWidth > bp.minLogicalWidth) {
      return { width: bp.width, height: bp.height };
    }
  }
  const last = RESPONSIVE_BREAKPOINTS[RESPONSIVE_BREAKPOINTS.length - 1];
  return { width: last.width, height: last.height };
}
function clampToWorkArea(size, workArea) {
  return {
    width: Math.max(MIN_WINDOW_WIDTH, Math.min(size.width, workArea.width)),
    height: Math.max(MIN_WINDOW_HEIGHT, Math.min(size.height, workArea.height))
  };
}
function computeInitialWindowSize() {
  const { workArea } = screen.getPrimaryDisplay();
  const size = computeDefaultContentSize(workArea.width);
  const clamped = clampToWorkArea(size, { width: workArea.width, height: workArea.height });
  const log2 = getModuleLogger$k();
  log2.info(`响应式默认尺寸: workArea=${workArea.width}x${workArea.height} size=${size.width}x${size.height} clamped=${clamped.width}x${clamped.height}`);
  return clamped;
}
function getAppIconPath() {
  return getResourcePath("icons", APP_ICON_NAME);
}
function createMainWindow() {
  const log2 = getModuleLogger$k();
  const initialSize = computeInitialWindowSize();
  const windowOptions = {
    width: initialSize.width,
    height: initialSize.height,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    show: false,
    // transparent:true 让 CSS border-radius 裁掉的四角真正透明；
    // hasShadow:true 让 macOS 对不透明像素自动投影，阴影轮廓跟随 border-radius。
    transparent: true,
    hasShadow: true,
    icon: nativeImage.createFromPath(getAppIconPath()),
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  };
  {
    const { workArea } = screen.getPrimaryDisplay();
    windowOptions.x = Math.round(workArea.x + (workArea.width - initialSize.width) / 2);
    windowOptions.y = Math.round(workArea.y + (workArea.height - initialSize.height) / 2);
  }
  windowOptions.titleBarStyle = "hidden";
  if (isMacOS()) {
    windowOptions.trafficLightPosition = {
      x: TRAFFIC_LIGHT_POSITION_X,
      y: TRAFFIC_LIGHT_POSITION_Y
    };
  }
  if (!isMacOS()) {
    windowOptions.autoHideMenuBar = true;
  }
  mainWindow = new BrowserWindow(windowOptions);
  mainWindow.webContents.on("before-input-event", (_event, input) => {
    if (input.meta && input.type === "keyDown") {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      switch (input.key.toLowerCase()) {
        case "m":
          if (!input.shift && !input.control && !input.alt) {
            _event.preventDefault();
            mainWindow.minimize();
          }
          break;
        case "w":
          if (!input.shift && !input.control && !input.alt) {
            _event.preventDefault();
            mainWindow.hide();
          }
          break;
      }
    }
  });
  if (isMacOS()) {
    mainWindow.on("leave-full-screen", () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const [w, h] = mainWindow.getSize();
      log2.info(`leave-full-screen: 触发圆角重绘修复, size=${w}x${h}`);
      mainWindow.setSize(w + 1, h + 1);
      mainWindow.setSize(w, h);
    });
  }
  let windowShown = false;
  function doShowWindow(reason) {
    if (windowShown || !mainWindow || mainWindow.isDestroyed()) return;
    windowShown = true;
    if (launchedHidden) {
      log2.info(`开机自启静默模式，窗口不显示（驻留托盘）[reason=${reason}]`);
      trace("evt:window-ready-hidden", `wc=${mainWindow?.webContents.id ?? "?"}`);
      return;
    }
    mainWindow.show();
    log2.info(`主窗口已显示 [reason=${reason}]`);
    trace("evt:window-ready", `wc=${mainWindow?.webContents.id ?? "?"}`);
  }
  mainWindow.once("ready-to-show", () => {
    reportBeaconEvent(WINDOW_REPORT_EVENTS.READY_TO_SHOW, {
      launched_hidden: launchedHidden ? "1" : "0"
    });
    if (launchedHidden) {
      log2.info("开机自启静默模式，窗口不显示（驻留托盘）");
      trace("evt:window-ready-hidden", `wc=${mainWindow?.webContents.id ?? "?"}`);
      return;
    }
    log2.info("ready-to-show 触发，等待首帧内容就绪信号");
  });
  ipcMain.once("marvis:first-paint-ready", () => {
    log2.info("收到首帧内容就绪信号 (#root has children)");
    doShowWindow("first-paint-ready");
  });
  mainWindow.webContents.on("did-finish-load", () => {
    const url = mainWindow?.webContents.getURL() ?? "";
    log2.info(`[wc] did-finish-load: wc=${wcId} url=${url}`);
    trace("evt:wc-finish-load", `wc=${wcId} url=${url}`);
    setTimeout(() => doShowWindow("did-finish-load-fallback"), 200);
  });
  const FALLBACK_TIMEOUT_MS = 5e3;
  setTimeout(() => {
    if (!windowShown) {
      log2.warn(`${FALLBACK_TIMEOUT_MS}ms 内无任何就绪信号，fallback 显示窗口`);
      doShowWindow("fallback-timeout");
    }
  }, FALLBACK_TIMEOUT_MS);
  const wcId = mainWindow.webContents.id;
  attachRendererConsoleForwarder(mainWindow.webContents);
  setupExternalLinkHandler(mainWindow);
  attachLnaPermissionOverride(mainWindow.webContents, "main");
  mainWindow.webContents.on("did-fail-load", (_e, errCode, errDesc, url) => {
    log2.warn(`[wc] did-fail-load: wc=${wcId} code=${errCode} desc=${errDesc} url=${url}`);
    trace("evt:wc-fail-load", `wc=${wcId} code=${errCode} desc=${errDesc} url=${url}`);
    reportBeaconRealtimeEvent(WINDOW_REPORT_EVENTS.LOAD_URL_FAILURE, {
      url,
      error_code: String(errCode),
      error_desc: errDesc
    });
  });
  mainWindow.on("show", () => {
    log2.debug(`[window] show: wc=${wcId}`);
    trace("evt:window-show", `wc=${wcId}`);
    onForegroundVisible();
  });
  mainWindow.on("hide", () => {
    log2.debug(`[window] hide: wc=${wcId}`);
    trace("evt:window-hide", `wc=${wcId}`);
    onForegroundInvisible();
  });
  mainWindow.on("close", (event) => {
    if (mainWindow?.isDestroyed() === false) {
      event.preventDefault();
      if (isMacOS() && mainWindow.isFullScreen()) {
        mainWindow.once("leave-full-screen", () => {
          if (!mainWindow || mainWindow.isDestroyed()) return;
          mainWindow.hide();
          log2.info("主窗口已隐藏到托盘");
          trace("evt:window-close-to-tray", `wc=${wcId}`);
          reportBeaconEvent(WINDOW_REPORT_EVENTS.CLOSE, {
            width: String(mainWindow.getBounds().width),
            height: String(mainWindow.getBounds().height)
          });
        });
        mainWindow.setFullScreen(false);
      } else {
        mainWindow.hide();
        log2.info("主窗口已隐藏到托盘");
        trace("evt:window-close-to-tray", `wc=${wcId}`);
        reportBeaconEvent(WINDOW_REPORT_EVENTS.CLOSE, {
          width: String(mainWindow.getBounds().width),
          height: String(mainWindow.getBounds().height)
        });
      }
    }
  });
  mainWindow.on("closed", () => {
    log2.info(`[window] closed: wc=${wcId}`);
    trace("evt:window-closed", `wc=${wcId}`);
    mainWindow = null;
  });
  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    log2.error(`[wc] render-process-gone: wc=${wcId} reason=${details.reason} exitCode=${details.exitCode}`);
    reportBeaconRealtimeEvent(WINDOW_REPORT_EVENTS.CRASH, {
      crash_reason: details.reason,
      error_code: String(details.exitCode)
    });
  });
  log2.info(`主窗口已创建 — ${initialSize.width}x${initialSize.height}`);
  reportBeaconEvent(WINDOW_REPORT_EVENTS.CREATE, {
    width: String(initialSize.width),
    height: String(initialSize.height),
    restored_state: "0",
    launched_hidden: launchedHidden ? "1" : "0"
  });
  return mainWindow;
}
function getMainWindow() {
  return mainWindow;
}
function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
function toggleMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    if (isMacOS() && mainWindow.isFullScreen()) return;
    mainWindow.hide();
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}
function destroyMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.removeAllListeners("close");
  mainWindow.close();
  mainWindow = null;
}
function isLaunchedHidden() {
  return launchedHidden;
}
const TRAY_TOOLTIP = "Marvis";
const TRAY_ICON_NAME = "icons/icon-tray.png";
const ABOUT_DIALOG_TITLE = "关于 Marvis";
const ABOUT_DIALOG_BUTTONS = ["确定"];
const registry$1 = /* @__PURE__ */ new Map();
const changeHandlers = /* @__PURE__ */ new Set();
let logger$1a = null;
function getModuleLogger$j() {
  if (!logger$1a) {
    logger$1a = getLogger("port-registry");
  }
  return logger$1a;
}
function registerPort(info) {
  const log2 = getModuleLogger$j();
  const prev = registry$1.get(info.name);
  registry$1.set(info.name, info);
  if (prev && prev.port === info.port && prev.host === info.host) {
    log2.debug(`端口未变化，跳过广播: ${info.name}@${info.host}:${info.port}`);
    return;
  }
  log2.info(`端口已登记: ${info.name}@${info.host}:${info.port}${prev ? ` (旧值 ${prev.host}:${prev.port})` : ""}`);
  notifyChange(info);
}
function unregisterPort(name) {
  const log2 = getModuleLogger$j();
  if (registry$1.delete(name)) {
    log2.info(`端口已注销: ${name}`);
  }
}
function getPort(name) {
  return registry$1.get(name) ?? null;
}
function snapshot() {
  const result = {};
  for (const [name, info] of registry$1.entries()) {
    result[name] = info;
  }
  return result;
}
function onPortChange(handler) {
  changeHandlers.add(handler);
  return () => {
    changeHandlers.delete(handler);
  };
}
function notifyChange(info) {
  const log2 = getModuleLogger$j();
  for (const handler of changeHandlers) {
    try {
      handler(info);
    } catch (err) {
      log2.warn(`端口变更订阅者抛出异常: ${err.message}`);
    }
  }
}
function waitForPort(name, timeoutMs) {
  const existing = registry$1.get(name);
  if (existing) {
    return Promise.resolve(existing);
  }
  return new Promise((resolve2, reject) => {
    let settled = false;
    let timer2 = null;
    const dispose = onPortChange((info) => {
      if (settled) return;
      if (info.name !== name) return;
      settled = true;
      if (timer2) clearTimeout(timer2);
      dispose();
      resolve2(info);
    });
    if (timeoutMs > 0) {
      timer2 = setTimeout(() => {
        if (settled) return;
        settled = true;
        dispose();
        reject(new Error(`等待服务端口超时: ${name} (timeout=${timeoutMs}ms)`));
      }, timeoutMs);
      timer2.unref?.();
    }
  });
}
const DEFAULT_HEALTHY_AFTER_MS = 3e3;
const DEFAULT_RAPID_FAIL_THRESHOLD_MS = 500;
const DEFAULT_RAPID_FAIL_MAX_COUNT = 3;
const DEFAULT_OUTPUT_BUFFER_LINES = 20;
const DEFAULT_RESTART_POLICY = {
  windowMs: 3e4,
  maxRestartsInWindow: 10,
  backoffInitialMs: 1e3,
  backoffMaxMs: 1e4,
  enabled: true
};
const DEFAULT_STOP_TIMEOUT_MS = 5e3;
const PROCESS_MANAGER_REPORT_EVENTS = {
  /** 子进程 spawn 成功 */
  SPAWN_SUCCESS: "process_manager__spawn_success",
  /** 子进程 spawn 失败 */
  SPAWN_FAILURE: "process_manager__spawn_failure",
  /** 子进程异常退出（非主动 stop 且 exit code !== 0） */
  UNEXPECTED_EXIT: "process_manager__unexpected_exit",
  /** 子进程触发重启（含退避延迟） */
  RESTART: "process_manager__restart",
  /** 熔断器触发（进程不再重启） */
  CIRCUIT_OPEN: "process_manager__circuit_open",
  /** 子进程通过健康检查（存活超过 healthyAfterMs） */
  HEALTH_CHECK_PASS: "process_manager__health_check_pass"
};
function createSlidingWindowCircuit(windowMs, maxRestartsInWindow) {
  let timestamps = [];
  function purge(now) {
    const boundary = now - windowMs;
    timestamps = timestamps.filter((t) => t >= boundary);
  }
  return {
    recordRestart(now = Date.now()) {
      purge(now);
      if (timestamps.length >= maxRestartsInWindow) {
        return false;
      }
      timestamps.push(now);
      return true;
    },
    reset() {
      timestamps = [];
    },
    sizeInWindow(now = Date.now()) {
      purge(now);
      return timestamps.length;
    }
  };
}
function computeBackoffDelay(attempt, initialMs, maxMs) {
  const safeAttempt = Math.max(1, attempt);
  const exp = Math.min(safeAttempt - 1, 31);
  const raw = initialMs * 2 ** exp;
  return Math.min(raw, maxMs);
}
const entries = /* @__PURE__ */ new Map();
const circuits = /* @__PURE__ */ new Map();
const eventHandlers = /* @__PURE__ */ new Set();
let logger$19 = null;
function getModuleLogger$i() {
  if (!logger$19) {
    logger$19 = getLogger("process-manager");
  }
  return logger$19;
}
function emit$1(event) {
  const log2 = getModuleLogger$i();
  for (const handler of eventHandlers) {
    try {
      handler(event);
    } catch (err) {
      log2.warn(`事件处理器抛出异常: ${err.message}`);
    }
  }
}
function resolvePolicy(partial) {
  return {
    windowMs: partial?.windowMs ?? DEFAULT_RESTART_POLICY.windowMs,
    maxRestartsInWindow: partial?.maxRestartsInWindow ?? DEFAULT_RESTART_POLICY.maxRestartsInWindow,
    backoffInitialMs: partial?.backoffInitialMs ?? DEFAULT_RESTART_POLICY.backoffInitialMs,
    backoffMaxMs: partial?.backoffMaxMs ?? DEFAULT_RESTART_POLICY.backoffMaxMs,
    enabled: partial?.enabled ?? DEFAULT_RESTART_POLICY.enabled,
    rapidFailThresholdMs: partial?.rapidFailThresholdMs ?? DEFAULT_RAPID_FAIL_THRESHOLD_MS,
    rapidFailMaxCount: partial?.rapidFailMaxCount ?? DEFAULT_RAPID_FAIL_MAX_COUNT
  };
}
function pushBounded(buffer, line, maxLines) {
  buffer.push(line);
  if (buffer.length > maxLines) {
    buffer.splice(0, buffer.length - maxLines);
  }
}
function spawnManaged(spec, policy) {
  if (entries.has(spec.name)) {
    throw new Error(`进程已存在: ${spec.name}，请先调用 stopManaged()`);
  }
  const resolvedPolicy = resolvePolicy(policy);
  const circuit = createSlidingWindowCircuit(
    resolvedPolicy.windowMs,
    resolvedPolicy.maxRestartsInWindow
  );
  const handle2 = {
    name: spec.name,
    pid: null,
    status: "starting",
    restartCount: 0,
    circuitOpenedAt: null
  };
  const entry = {
    spec,
    policy: resolvedPolicy,
    handle: handle2,
    child: null,
    healthyTimer: null,
    restartTimer: null,
    restartTimestamps: [],
    stopping: false,
    currentAttempt: 0,
    spawnedAt: 0,
    rapidFailAliveMs: [],
    recentStderr: [],
    recentStdout: []
  };
  entries.set(spec.name, entry);
  circuits.set(spec.name, circuit);
  doSpawn(entry);
  return handle2;
}
function doSpawn(entry) {
  const log2 = getModuleLogger$i();
  const { spec } = entry;
  const cwd = spec.cwd ?? dirname(spec.executable);
  const env = { ...process.env, ...spec.env ?? {} };
  const healthyAfterMs = spec.healthyAfterMs ?? DEFAULT_HEALTHY_AFTER_MS;
  log2.info(`正在启动子进程: ${spec.name} @ ${spec.executable}`);
  const useProcessGroup = spec.processGroup === true && process.platform !== "win32";
  let child;
  try {
    child = spawn(spec.executable, spec.args, {
      cwd,
      env,
      // stdin 必须使用 pipe 而非 ignore：
      //   - 子进程（如 MarvisHost）依赖 stdin 的 EOF 来检测父进程是否已退出
      //     （macOS 无 prctl(PR_SET_PDEATHSIG)，这是标准的父死亡监测方式）
      //   - ignore 会让子进程 stdin 指向 /dev/null，启动时立即读到 EOF
      //     → 子进程误以为父进程已死 → 立即自我退出
      //   - pipe 会让 stdin 保持打开，仅在父进程真正退出时关闭
      stdio: ["pipe", "pipe", "pipe"],
      // detached:
      //   - false（默认）：子进程与父进程同进程组；父挂了子进程不一定跟着死
      //   - true：子进程独立 session/进程组（setsid），便于 `kill(-pgid)` 级联；
      //     不会阻止 Node.js 退出，因为我们下面会立刻 child.unref()
      detached: useProcessGroup
    });
  } catch (err) {
    log2.error(`spawn 失败 ${spec.name}: ${err.message}`);
    reportBeaconRealtimeEvent(PROCESS_MANAGER_REPORT_EVENTS.SPAWN_FAILURE, {
      name: spec.name,
      executable: spec.executable,
      error: err.message
    });
    entry.handle.status = "stopped";
    emit$1({ type: "exit", name: spec.name, code: null, signal: null });
    return;
  }
  entry.child = child;
  entry.handle.pid = child.pid ?? null;
  entry.handle.status = "starting";
  entry.spawnedAt = Date.now();
  entry.recentStderr = [];
  entry.recentStdout = [];
  if (useProcessGroup) {
    try {
      child.unref();
    } catch {
    }
  }
  if (child.pid !== void 0) {
    reportBeaconEvent(PROCESS_MANAGER_REPORT_EVENTS.SPAWN_SUCCESS, {
      name: spec.name,
      executable: spec.executable
    });
    try {
      recordChildProcess({
        name: spec.name,
        pid: child.pid,
        exeBaseName: basename(spec.executable),
        addedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (err) {
      log2.debug(`recordChildProcess 失败（不阻断启动）: ${err.message}`);
    }
    emit$1({ type: "spawned", name: spec.name, pid: child.pid });
  }
  attachLineReader$3(child.stdout, (line) => {
    pushBounded(entry.recentStdout, line, DEFAULT_OUTPUT_BUFFER_LINES);
    emit$1({ type: "stdout", name: spec.name, line });
  });
  attachLineReader$3(child.stderr, (line) => {
    pushBounded(entry.recentStderr, line, DEFAULT_OUTPUT_BUFFER_LINES);
    emit$1({ type: "stderr", name: spec.name, line });
  });
  entry.healthyTimer = setTimeout(() => {
    if (entry.child === child && !entry.stopping) {
      entry.handle.status = "running";
      entry.currentAttempt = 0;
      entry.rapidFailAliveMs = [];
      const circuit = circuits.get(spec.name);
      if (circuit) {
        circuit.reset();
      }
      log2.info(`子进程健康: ${spec.name} (pid=${child.pid})`);
      reportBeaconEvent(PROCESS_MANAGER_REPORT_EVENTS.HEALTH_CHECK_PASS, {
        name: spec.name
      });
    }
  }, healthyAfterMs);
  child.on("exit", (code, signal) => {
    handleChildExit(entry, child, code, signal);
  });
  child.on("error", (err) => {
    log2.error(`子进程 error ${spec.name}: ${err.message}`);
  });
}
function attachLineReader$3(stream, onLine) {
  if (!stream) return;
  let buffer = "";
  stream.setEncoding?.("utf8");
  stream.on("data", (chunk) => {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, "");
      buffer = buffer.slice(idx + 1);
      if (line.length > 0) {
        onLine(line);
      }
    }
  });
  stream.on("end", () => {
    if (buffer.length > 0) {
      onLine(buffer);
      buffer = "";
    }
  });
}
function handleChildExit(entry, child, code, signal) {
  const log2 = getModuleLogger$i();
  const { spec, policy } = entry;
  if (entry.child !== child) {
    return;
  }
  if (entry.healthyTimer) {
    clearTimeout(entry.healthyTimer);
    entry.healthyTimer = null;
  }
  const exitedPid = child.pid;
  if (exitedPid !== void 0) {
    try {
      removeChildProcess(exitedPid);
    } catch (err) {
      log2.debug(`removeChildProcess 失败（忽略）: ${err.message}`);
    }
  }
  entry.child = null;
  entry.handle.pid = null;
  const aliveMs = entry.spawnedAt > 0 ? Date.now() - entry.spawnedAt : -1;
  log2.info(`子进程退出: ${spec.name} code=${code ?? "null"} signal=${signal ?? "null"} aliveMs=${aliveMs}`);
  const isAbnormal = !entry.stopping && code !== 0;
  if (isAbnormal) {
    reportBeaconRealtimeEvent(PROCESS_MANAGER_REPORT_EVENTS.UNEXPECTED_EXIT, {
      name: spec.name,
      exit_code: String(code ?? ""),
      signal: signal ?? "",
      alive_ms: String(aliveMs),
      restart_count: String(entry.handle.restartCount)
    });
    if (entry.recentStderr.length > 0) {
      log2.error(`子进程异常退出 ${spec.name}，最近 ${entry.recentStderr.length} 行 stderr:
  | ${entry.recentStderr.join("\n  | ")}`);
    }
    if (entry.recentStdout.length > 0) {
      log2.warn(`子进程异常退出 ${spec.name}，最近 ${entry.recentStdout.length} 行 stdout:
  | ${entry.recentStdout.join("\n  | ")}`);
    }
    if (entry.recentStderr.length === 0 && entry.recentStdout.length === 0) {
      log2.warn(`子进程异常退出 ${spec.name}，但未捕获到任何 stdout/stderr 输出`);
    }
  }
  emit$1({ type: "exit", name: spec.name, code, signal });
  if (entry.stopping) {
    entry.handle.status = "stopped";
    emit$1({ type: "stopped", name: spec.name });
    return;
  }
  if (policy.enabled === false) {
    entry.handle.status = "stopped";
    emit$1({ type: "stopped", name: spec.name });
    return;
  }
  const rapidThreshold = policy.rapidFailThresholdMs ?? DEFAULT_RAPID_FAIL_THRESHOLD_MS;
  const rapidMax = policy.rapidFailMaxCount ?? DEFAULT_RAPID_FAIL_MAX_COUNT;
  if (aliveMs >= 0 && aliveMs < rapidThreshold) {
    entry.rapidFailAliveMs.push(aliveMs);
    if (entry.rapidFailAliveMs.length >= rapidMax) {
      const reason = `连续 ${entry.rapidFailAliveMs.length} 次在 ${rapidThreshold}ms 内快速失败 (alive=${entry.rapidFailAliveMs.join("/")}ms)，判定为永久错误`;
      log2.error(`子进程熔断: ${spec.name} — ${reason}`);
      reportBeaconRealtimeEvent(PROCESS_MANAGER_REPORT_EVENTS.CIRCUIT_OPEN, {
        name: spec.name,
        reason,
        restart_count: String(entry.handle.restartCount)
      });
      entry.handle.status = "circuit-open";
      entry.handle.circuitOpenedAt = Date.now();
      emit$1({ type: "circuit-open", name: spec.name, reason });
      return;
    }
    log2.warn(`子进程快速失败 ${spec.name}: 存活 ${aliveMs}ms < ${rapidThreshold}ms (累计 ${entry.rapidFailAliveMs.length}/${rapidMax})`);
  } else if (aliveMs >= rapidThreshold) {
    entry.rapidFailAliveMs = [];
  }
  const circuit = circuits.get(spec.name);
  const allowed = circuit?.recordRestart() ?? false;
  if (!allowed) {
    const reason = `${policy.windowMs / 1e3}s 内已达 ${policy.maxRestartsInWindow} 次重启上限`;
    log2.error(`子进程熔断: ${spec.name} — ${reason}`);
    reportBeaconRealtimeEvent(PROCESS_MANAGER_REPORT_EVENTS.CIRCUIT_OPEN, {
      name: spec.name,
      reason,
      restart_count: String(entry.handle.restartCount)
    });
    entry.handle.status = "circuit-open";
    entry.handle.circuitOpenedAt = Date.now();
    emit$1({ type: "circuit-open", name: spec.name, reason });
    return;
  }
  entry.currentAttempt += 1;
  entry.handle.restartCount += 1;
  const delayMs = computeBackoffDelay(
    entry.currentAttempt,
    policy.backoffInitialMs,
    policy.backoffMaxMs
  );
  entry.handle.status = "restarting";
  log2.info(`子进程将在 ${delayMs}ms 后重启: ${spec.name} (attempt=${entry.currentAttempt})`);
  reportBeaconEvent(PROCESS_MANAGER_REPORT_EVENTS.RESTART, {
    name: spec.name,
    attempt: String(entry.currentAttempt),
    delay_ms: String(delayMs),
    restart_count: String(entry.handle.restartCount)
  });
  emit$1({ type: "restart", name: spec.name, attempt: entry.currentAttempt, delayMs });
  entry.restartTimer = setTimeout(() => {
    entry.restartTimer = null;
    if (entry.stopping) return;
    doSpawn(entry);
  }, delayMs);
}
async function stopManaged(name, timeoutMs = DEFAULT_STOP_TIMEOUT_MS) {
  const log2 = getModuleLogger$i();
  const entry = entries.get(name);
  if (!entry) {
    log2.debug(`stopManaged: ${name} 不存在，跳过`);
    return;
  }
  entry.stopping = true;
  if (entry.restartTimer) {
    clearTimeout(entry.restartTimer);
    entry.restartTimer = null;
  }
  const { child } = entry;
  entry.handle.status = "stopping";
  if (!child || child.exitCode !== null) {
    entry.handle.status = "stopped";
    entries.delete(name);
    circuits.delete(name);
    emit$1({ type: "stopped", name });
    return;
  }
  log2.info(`发送 SIGTERM 给子进程: ${name} (pid=${child.pid})`);
  const exitPromise = new Promise((resolve2) => {
    child.once("exit", () => resolve2());
  });
  const useProcessGroup = entry.spec.processGroup === true && process.platform !== "win32";
  const signalChild = (sig) => {
    if (useProcessGroup && child.pid !== void 0 && child.pid > 0) {
      try {
        process.kill(-child.pid, sig);
        return;
      } catch (err) {
        const e = err;
        if (e.code === "ESRCH") return;
        log2.warn(`process.kill(-${child.pid}, ${sig}) 失败，fallback 单进程 kill: ${e.message}`);
      }
    }
    try {
      child.kill(sig);
    } catch (err) {
      log2.warn(`child.kill(${sig}) 失败 ${name}: ${err.message}`);
    }
  };
  signalChild("SIGTERM");
  const timeoutPromise = new Promise((resolve2) => {
    setTimeout(() => resolve2("timeout"), timeoutMs);
  });
  const result = await Promise.race([exitPromise.then(() => "exit"), timeoutPromise]);
  if (result === "timeout") {
    log2.warn(`SIGTERM 超时 ${timeoutMs}ms，发送 SIGKILL: ${name} (pid=${child.pid})`);
    signalChild("SIGKILL");
    await exitPromise;
  }
  entry.handle.status = "stopped";
  entries.delete(name);
  circuits.delete(name);
}
function getHandle(name) {
  return entries.get(name)?.handle ?? null;
}
function resetCircuit(name) {
  const entry = entries.get(name);
  const circuit = circuits.get(name);
  if (!entry || !circuit) {
    return false;
  }
  circuit.reset();
  entry.currentAttempt = 0;
  entry.rapidFailAliveMs = [];
  entry.handle.circuitOpenedAt = null;
  if (entry.handle.status === "circuit-open") {
    getModuleLogger$i().info(`手动重置熔断: ${name}（需要调用方显式 spawnManaged() 才会重新拉起）`);
    entry.handle.status = "stopped";
  }
  return true;
}
function onProcessEvent(handler) {
  eventHandlers.add(handler);
  return () => {
    eventHandlers.delete(handler);
  };
}
const IPC_CHANNELS = {
  /** renderer → main (invoke): 获取全部服务端口快照 */
  GET_SERVICE_PORTS: "marvis:service-ports:get",
  /** main → renderer (send): 某个服务端口变更事件 */
  SERVICE_PORT_CHANGED: "marvis:service-ports:changed",
  /** main → renderer (send): 子进程生命周期事件（spawned / exit / circuit-open 等） */
  PROCESS_EVENT: "marvis:process:event",
  /** renderer → main (invoke): 等待网关就绪，一次性拿到 port / token / 连接 URL */
  WAIT_FOR_GATEWAY: "marvis:gateway:wait-ready",
  /** renderer → main (send): 前端页面就绪通知（新手引导/冷启完成后） */
  RENDERER_READY: "marvis:renderer:ready",
  /** main → renderer (send): 菜单动作指令（菜单栏 / Dock / 托盘触发） */
  MENU_ACTION: "marvis:menu:action"
};
const DEFAULT_WAIT_FOR_GATEWAY_TIMEOUT_MS = 4e4;
let logger$18 = null;
let registered$1 = false;
let disposers = [];
function getModuleLogger$h() {
  if (!logger$18) {
    logger$18 = getLogger("ipc-bridge");
  }
  return logger$18;
}
function registerIpcChannels() {
  const log2 = getModuleLogger$h();
  if (registered$1) {
    log2.warn("ipc-bridge 已注册，跳过");
    return;
  }
  ipcMain.handle(IPC_CHANNELS.GET_SERVICE_PORTS, () => snapshot());
  ipcMain.handle(IPC_CHANNELS.WAIT_FOR_GATEWAY, async (_event, rawTimeoutMs) => {
    const timeoutMs = typeof rawTimeoutMs === "number" && rawTimeoutMs > 0 ? rawTimeoutMs : DEFAULT_WAIT_FOR_GATEWAY_TIMEOUT_MS;
    const info = await waitForPort("gateway", timeoutMs);
    const payload = {
      host: info.host,
      port: info.port,
      token: info.token ?? null,
      httpBaseUrl: `http://${info.host}:${info.port}`,
      wsBaseUrl: `ws://${info.host}:${info.port}`,
      registeredAt: info.registeredAt
    };
    return payload;
  });
  const disposePortChange = onPortChange((info) => {
    broadcastToAllWindows(IPC_CHANNELS.SERVICE_PORT_CHANGED, info);
  });
  disposers.push(disposePortChange);
  const disposeProcessEvent = onProcessEvent((event) => {
    if (event.type === "stdout" || event.type === "stderr") {
      return;
    }
    broadcastToAllWindows(IPC_CHANNELS.PROCESS_EVENT, event);
  });
  disposers.push(disposeProcessEvent);
  ipcMain.on(IPC_CHANNELS.RENDERER_READY, () => {
    log2.info("收到前端页面就绪通知");
    setRendererReady(true);
  });
  registered$1 = true;
  log2.info("ipc-bridge IPC 通道已注册");
}
function unregisterIpcChannels() {
  if (!registered$1) return;
  const log2 = getModuleLogger$h();
  ipcMain.removeHandler(IPC_CHANNELS.GET_SERVICE_PORTS);
  ipcMain.removeHandler(IPC_CHANNELS.WAIT_FOR_GATEWAY);
  ipcMain.removeAllListeners(IPC_CHANNELS.RENDERER_READY);
  for (const dispose of disposers) {
    try {
      dispose();
    } catch (err) {
      log2.warn(`dispose 异常: ${err.message}`);
    }
  }
  disposers = [];
  registered$1 = false;
  log2.info("ipc-bridge IPC 通道已注销");
}
function broadcastToAllWindows(channel, payload) {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (win.isDestroyed()) continue;
    const wc = win.webContents;
    if (!wc || wc.isDestroyed() || wc.isCrashed() || wc.isLoading()) continue;
    try {
      wc.send(channel, payload);
    } catch (err) {
      getModuleLogger$h().debug(`webContents.send 失败 channel=${channel}: ${err.message}`);
    }
  }
}
function sendMenuAction(action) {
  const log2 = getModuleLogger$h();
  log2.info(`发送菜单动作: ${action}`);
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (win.isDestroyed()) continue;
    const wc = win.webContents;
    if (!wc || wc.isDestroyed() || wc.isCrashed()) continue;
    try {
      wc.send(IPC_CHANNELS.MENU_ACTION, action);
    } catch (err) {
      log2.debug(`sendMenuAction 失败: ${err.message}`);
    }
  }
}
var WorkMode = /* @__PURE__ */ ((WorkMode2) => {
  WorkMode2[WorkMode2["Cloud"] = 0] = "Cloud";
  WorkMode2[WorkMode2["Hybrid"] = 1] = "Hybrid";
  WorkMode2[WorkMode2["Local"] = 2] = "Local";
  return WorkMode2;
})(WorkMode || {});
const MAC_DEFAULT_SETTINGS = {
  auto_launch: true,
  pin_taskbar: false,
  pin_start_menu: false,
  show_image_name: false,
  hot_key_settings: [
    {
      enable: true,
      hot_key: 1,
      // MarvisHotKeyType.LaunchApp（前端枚举 LaunchApp = 1）
      modifier: 1,
      // MOD_ALT (Option on Mac)
      vk: 84
      // 'T'
    }
  ],
  marvis_home_dir: "",
  // Mac 端默认使用 Hybrid（效率模式），让 Agent 与知识库走完整链路。
  // 老用户持久化值不受此默认影响，如需切换可手动清理 marvis-settings.json。
  work_mode: 1,
  effective_work_mode: 1
  /* Hybrid */
};
class SettingsStore {
  /**
   * 计算实际生效的工作模式（对齐 Windows `ComputeEffectiveWorkMode`）
   *
   * 降级逻辑：
   *   - Cloud → Cloud（无降级）
   *   - Hybrid → Hybrid（无降级，Agent 以 cloud 模式运行）
   *   - Local + 模型就绪 → Local
   *   - Local + 模型未就绪 → 降级到 Hybrid（保底云端能力）
   *
   * @param desiredMode - 用户期望的模式
   * @param isLocalModelReady - 本地模型是否已安装且推理服务就绪
   * @returns 实际应生效的模式
   */
  static computeEffectiveWorkMode(desiredMode, isLocalModelReady) {
    switch (desiredMode) {
      case 0:
        return 0;
      case 1:
        return 1;
      case 2:
        return isLocalModelReady ? 2 : 1;
      default:
        return 0;
    }
  }
  store;
  constructor() {
    this.store = new Store({
      name: "marvis-settings",
      defaults: {
        ...MAC_DEFAULT_SETTINGS,
        __first_launch_completed: false
      }
    });
  }
  // ─── 首次启动 ──────────────────────────────────────────
  /** 是否为首次启动（尚未标记完成） */
  isFirstLaunch() {
    return !this.store.get("__first_launch_completed");
  }
  /** 标记首次启动已完成 */
  markFirstLaunchCompleted() {
    this.store.set("__first_launch_completed", true);
  }
  // ─── 读取 ──────────────────────────────────────────────
  /** 获取所有设置数据（不含内部标记字段） */
  getAll() {
    const raw = this.store.store;
    const { __first_launch_completed: firstLaunchCompleted, ...settings } = raw;
    return settings;
  }
  /** 获取单个设置项 */
  get(key) {
    return this.store.get(key);
  }
  // ─── 写入 ──────────────────────────────────────────────
  /** 全量覆盖设置（保留内部标记字段） */
  setAll(data) {
    const firstLaunchCompleted = this.store.get("__first_launch_completed");
    this.store.store = {
      ...data,
      __first_launch_completed: firstLaunchCompleted
    };
  }
  /**
   * 增量更新设置
   *
   * 仅更新传入的字段，未传入的字段保持不变。
   */
  update(partial) {
    for (const [key, value] of Object.entries(partial)) {
      if (value !== void 0) {
        this.store.set(key, value);
      }
    }
  }
  /** 恢复所有设置为默认值（保留首次启动标记） */
  reset() {
    this.setAll(MAC_DEFAULT_SETTINGS);
  }
  // ─── 工作模式 ──────────────────────────────────────────
  /** 获取用户期望的 AI 工作模式 */
  getWorkMode() {
    return this.store.get("work_mode");
  }
  /** 设置用户期望的 AI 工作模式 */
  setWorkMode(mode) {
    this.store.set("work_mode", mode);
  }
  /** 获取实际生效的 AI 工作模式 */
  getEffectiveWorkMode() {
    return this.store.get("effective_work_mode");
  }
  /** 设置实际生效的 AI 工作模式 */
  setEffectiveWorkMode(mode) {
    this.store.set("effective_work_mode", mode);
  }
  /** 获取 store 文件路径（调试/日志用） */
  getStorePath() {
    return this.store.path;
  }
}
const TRAY_MOD_ID = "tray";
const TRAY_MOD_NAME = "系统托盘";
const TRAY_REPORT_EVENTS = {
  /** 托盘创建完成 */
  CREATE: "tray__create",
  /** 托盘创建失败（严重错误，实时上报） */
  CREATE_FAILED: "tray__create_failed"
};
const MOD_ALT$1 = 1;
const MOD_CTRL$1 = 2;
const MOD_SHIFT$1 = 4;
const MOD_WIN$1 = 8;
const VK_KEY_MAP$1 = {
  186: ";",
  187: "=",
  188: ",",
  189: "-",
  190: ".",
  191: "/",
  192: "`",
  32: "Space",
  9: "Tab",
  13: "Return",
  27: "Escape",
  8: "Backspace",
  46: "Delete",
  38: "Up",
  40: "Down",
  37: "Left",
  39: "Right",
  112: "F1",
  113: "F2",
  114: "F3",
  115: "F4",
  116: "F5",
  117: "F6",
  118: "F7",
  119: "F8",
  120: "F9",
  121: "F10",
  122: "F11",
  123: "F12"
};
const HOT_KEY_NAME_MAP = {
  1: "启动快捷键"
};
function hotKeyToAccelerator(modifier, vk) {
  const parts = [];
  if (modifier & MOD_CTRL$1) parts.push("Control");
  if (modifier & MOD_SHIFT$1) parts.push("Shift");
  if (modifier & MOD_ALT$1) parts.push("Alt");
  if (modifier & MOD_WIN$1) parts.push("Command");
  const keyName = VK_KEY_MAP$1[vk] ?? String.fromCharCode(vk);
  parts.push(keyName);
  return parts.join("+");
}
function getHotKeyLabel(item) {
  return HOT_KEY_NAME_MAP[item.hot_key] ?? `快捷键 ${item.hot_key}`;
}
let tray = null;
let rendererReady = false;
let logger$17;
function getModuleLogger$g() {
  if (!logger$17) {
    logger$17 = getLogger("tray");
  }
  return logger$17;
}
function getTrayIconPath() {
  return getResourcePath(TRAY_ICON_NAME);
}
function showAboutDialog() {
  const log2 = getModuleLogger$g();
  log2.info('显示"关于"对话框');
  dialog.showMessageBox({
    type: "info",
    title: ABOUT_DIALOG_TITLE,
    message: APP_METADATA.name,
    detail: [
      APP_METADATA.description,
      "",
      APP_METADATA.copyright
    ].join("\n"),
    buttons: ABOUT_DIALOG_BUTTONS
  });
}
function setRendererReady(ready) {
  const log2 = getModuleLogger$g();
  rendererReady = ready;
  log2.info(`前端页面就绪状态变更: ${ready}`);
  if (isMacOS()) {
    setupMacOSMenu();
  }
}
function executeMenuAction(action) {
  const log2 = getModuleLogger$g();
  log2.info(`执行菜单动作: ${action}`);
  showMainWindow();
  sendMenuAction(action);
}
function createTray() {
  const log2 = getModuleLogger$g();
  try {
    const iconPath = getTrayIconPath();
    let icon;
    try {
      icon = nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) {
        log2.warn(`托盘图标文件不存在或无效: ${iconPath}`);
      } else if (isMacOS()) {
        icon = icon.resize({ width: 22, height: 22 });
        icon.setTemplateImage(true);
      }
    } catch (err) {
      log2.warn(`托盘图标加载异常: ${iconPath}，使用空图标`, err);
      icon = nativeImage.createEmpty();
    }
    tray = new Tray(icon);
    tray.setToolTip(TRAY_TOOLTIP);
    log2.info(`托盘已创建，图标路径: ${iconPath}`);
    tray.on("click", () => {
      toggleMainWindow();
    });
    tray.on("right-click", () => {
      toggleMainWindow();
    });
    if (isMacOS()) {
      setupMacOSMenu();
    }
    log2.info("系统托盘已创建");
    reportBeaconEvent(TRAY_REPORT_EVENTS.CREATE, {
      mod_id: TRAY_MOD_ID,
      mod_name: TRAY_MOD_NAME
    });
  } catch (err) {
    log2.error("托盘创建失败", err);
    reportBeaconRealtimeEvent(TRAY_REPORT_EVENTS.CREATE_FAILED, {
      mod_id: TRAY_MOD_ID,
      mod_name: TRAY_MOD_NAME,
      error: String(err.message ?? err)
    });
  }
}
function buildDevToolsMenuItems(log2) {
  const isDev = !app.isPackaged;
  let enabled;
  if (isDev) {
    const raw = (process.env.MARVIS_AUTO_DEVTOOLS ?? "").trim().toLowerCase();
    enabled = !(raw === "0" || raw === "false" || raw === "no");
  } else {
    try {
      enabled = getConfig().devtools?.enable === true;
    } catch {
      enabled = false;
    }
  }
  if (!enabled) return [];
  return [
    { type: "separator" },
    {
      label: "DevTools",
      accelerator: "Cmd+Alt+I",
      click: () => {
        const win = getMainWindow();
        if (!win || win.isDestroyed()) {
          log2.warn("菜单点击: DevTools，但主窗口不存在");
          return;
        }
        log2.info(`菜单点击: DevTools (当前已打开=${win.webContents.isDevToolsOpened()})`);
        win.webContents.toggleDevTools();
      }
    }
  ];
}
function getHotKeySubmenu() {
  const log2 = getModuleLogger$g();
  try {
    const store = new SettingsStore();
    const settings = store.getAll();
    const enabledItems = settings.hot_key_settings.filter((item) => item.enable);
    if (enabledItems.length === 0) {
      return [{ label: "无快捷键", enabled: false }];
    }
    return enabledItems.map((item) => ({
      label: getHotKeyLabel(item),
      accelerator: hotKeyToAccelerator(item.modifier, item.vk),
      enabled: rendererReady,
      click: () => {
        log2.info(`菜单点击: 快捷键 (hot_key=${item.hot_key})`);
        executeMenuAction("shortcut");
      }
    }));
  } catch (err) {
    log2.warn(`读取快捷键设置失败: ${err.message}，使用默认值`);
    return [{
      label: "启动快捷键",
      accelerator: "Alt+T",
      enabled: rendererReady,
      click: () => {
        log2.info("菜单点击: 快捷键 (fallback)");
        executeMenuAction("shortcut");
      }
    }];
  }
}
function setupMacOSMenu() {
  const log2 = getModuleLogger$g();
  const template = [
    // Marvis 菜单
    {
      label: APP_METADATA.name,
      submenu: [
        {
          label: `关于 ${APP_METADATA.name}`,
          click: () => {
            log2.info("菜单点击: 关于 Marvis");
            if (rendererReady) {
              executeMenuAction("about");
            } else {
              showAboutDialog();
            }
          }
        },
        { type: "separator" },
        {
          label: "检查更新",
          enabled: rendererReady,
          click: () => {
            log2.info("菜单点击: 检查更新");
            executeMenuAction("check-update");
          }
        },
        { type: "separator" },
        {
          label: "偏好设置",
          enabled: rendererReady,
          click: () => {
            log2.info("菜单点击: 偏好设置");
            executeMenuAction("settings");
          }
        },
        { type: "separator" },
        {
          label: `隐藏 ${APP_METADATA.name}`,
          role: "hide"
        },
        {
          label: "隐藏其他",
          role: "hideOthers"
        },
        {
          label: "显示全部",
          role: "unhide"
        },
        { type: "separator" },
        {
          role: "quit",
          label: `退出 ${APP_METADATA.name}`
        }
      ]
    },
    // 编辑菜单 —— macOS 上 Cmd+C/V/X/A/Z 等快捷键依赖此菜单的 role 绑定
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
        { role: "selectAll", label: "全选" }
      ]
    },
    // 窗口菜单（role: 'windowMenu' 使 macOS 自动追加系统级窗口管理项）
    {
      label: "窗口",
      role: "windowMenu",
      submenu: [
        { role: "close", label: "关闭窗口" },
        { type: "separator" },
        { role: "minimize", label: "最小化" },
        { role: "zoom", label: "缩放" },
        { type: "separator" },
        { role: "front", label: "前置全部窗口" }
      ]
    },
    // 帮助菜单（role: 'help' 使 macOS 自动添加搜索栏）
    {
      label: "帮助",
      role: "help",
      submenu: [
        {
          label: `${APP_METADATA.name} 帮助`,
          click: () => {
            log2.info("菜单点击: Marvis 帮助");
            shell.openExternal("https://marvis.qq.com");
          }
        },
        {
          label: "反馈",
          click: () => {
            log2.info("菜单点击: 反馈");
            executeMenuAction("feedback");
          }
        },
        {
          label: "快捷键一览",
          submenu: getHotKeySubmenu()
        },
        // DevTools 菜单项仅在 `devtools.enable=true` 时挂载（macOS 正式包调试开关场景）；
        // 普通用户不可见。详见 doc/macos-debug-switch-design.md
        ...buildDevToolsMenuItems(log2)
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  const dockMenu = Menu.buildFromTemplate([
    {
      label: "新建对话",
      enabled: rendererReady,
      click: () => {
        log2.info("用户从 Dock 菜单点击「新建对话」");
        executeMenuAction("new-conversation");
      }
    },
    {
      label: "连接至手机",
      enabled: rendererReady,
      click: () => {
        log2.info("用户从 Dock 菜单点击「连接至手机」");
        executeMenuAction("connect-phone");
      }
    }
  ]);
  app.dock?.setMenu(dockMenu);
}
const ENV_AUTO_DEVTOOLS = "MARVIS_AUTO_DEVTOOLS";
const VALID_DEVTOOLS_MODES = ["right", "bottom", "left", "undocked", "detach"];
const DEFAULT_DEVTOOLS_MODE = "bottom";
let logger$16;
function getModuleLogger$f() {
  if (!logger$16) {
    logger$16 = getLogger("crash-reporter");
  }
  return logger$16;
}
function isAutoDevToolsEnabled() {
  const raw = (process.env[ENV_AUTO_DEVTOOLS] ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return true;
}
function openDevToolsIfEnabled(devtools) {
  const isDev = !app.isPackaged;
  const log2 = getModuleLogger$f();
  const allowed = isDev ? isAutoDevToolsEnabled() : devtools.enable;
  if (!allowed) {
    if (!isDev) {
      log2.info("DevTools 未启用（devtools.enable=false），普通用户模式");
    } else {
      log2.info(`开发模式：DevTools 自动打开被禁用 (${ENV_AUTO_DEVTOOLS}=false)`);
    }
    return;
  }
  const mode = VALID_DEVTOOLS_MODES.find((m) => m === devtools.mode) ?? DEFAULT_DEVTOOLS_MODE;
  if (!isDev && !devtools.auto_open) {
    log2.info(`DevTools 已允许但 auto_open=false，等待菜单/Cmd+Alt+I 手动唤出 (mode=${mode}, source=packaged)`);
    return;
  }
  log2.info(`打开 DevTools (mode=${mode}, source=${isDev ? "dev" : "packaged"})`);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.isDevToolsOpened()) {
      win.webContents.openDevTools({ mode });
    }
  }
}
const AGENT_CORE_MOD_ID = "agent_core";
const AGENT_CORE_MOD_NAME = "Agent 核心";
const AGENT_CORE_REPORT_EVENTS = {
  /** Agent 子进程 spawn 失败（严重错误，实时上报） */
  SPAWN_FAILED: "agent_core__spawn_failed",
  /** Agent 端口就绪超时（严重错误，实时上报） */
  PORT_READY_TIMEOUT: "agent_core__port_ready_timeout",
  /** Agent TCP 握手失败（严重错误，实时上报） */
  TCP_PROBE_FAILED: "agent_core__tcp_probe_failed",
  /** Agent 启动成功 */
  START_SUCCESS: "agent_core__start_success",
  /** Agent 主动停止完成 */
  STOP_COMPLETE: "agent_core__stop_complete",
  /** Agent 重启结果 */
  RESTART_RESULT: "agent_core__restart_result",
  /** process-manager 自动重启后端口同步成功 */
  AUTO_RESTART_SYNC_SUCCESS: "agent_core__auto_restart_sync_success",
  /** 自动重启端口就绪超时 */
  AUTO_RESTART_PORT_TIMEOUT: "agent_core__auto_restart_port_timeout",
  /** 自动重启 TCP 握手失败 */
  AUTO_RESTART_TCP_FAILED: "agent_core__auto_restart_tcp_failed",
  /** 孤儿进程清理异常 */
  REAPER_ERROR: "agent_core__reaper_error"
};
const PERSIST_VERSION = 1;
const LOGIN_STORE_NAME = "marvis-login-state";
const LOGIN_STORE_ENCRYPTION_KEY = [
  "marvis",
  "login",
  "v1",
  "store",
  "2026"
].join("-");
const EMPTY_USER_INFO = Object.freeze({});
const LOGIN_MOD_ID = "login";
const LOGIN_MOD_NAME = "登录管理";
const LOGIN_REPORT_EVENTS = {
  /** 启动时登录态校验成功 */
  STARTUP_CHECK_SUCCESS: "login__startup_check_success",
  /** 启动时登录态校验失败（严重错误，实时上报） */
  STARTUP_CHECK_FAILED: "login__startup_check_failed",
  /** Token 刷新成功 */
  REFRESH_SUCCESS: "login__refresh_success",
  /** Token 刷新失败（严重错误，实时上报） */
  REFRESH_FAILED: "login__refresh_failed",
  /** 强制登出（严重错误，实时上报） */
  FORCE_LOGOUT: "login__force_logout",
  /** 网络恢复重试 */
  NETWORK_RECOVERY_RETRY: "login__network_recovery_retry",
  /** 登录态持久化失败 */
  PERSIST_FAILED: "login__persist_failed"
};
const STORE_DEFAULTS = {
  version: PERSIST_VERSION,
  userInfo: {},
  savedAt: 0
};
let userInfo = {};
const handlers$1 = /* @__PURE__ */ new Set();
let logger$15 = null;
let storeInstance = null;
Promise.resolve();
function log$h() {
  if (!logger$15) logger$15 = getLogger("login-store");
  return logger$15;
}
function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}
function getStorageDir() {
  return app.getPath("userData");
}
function getStore() {
  if (!storeInstance) {
    storeInstance = new Store({
      name: LOGIN_STORE_NAME,
      cwd: getStorageDir(),
      defaults: STORE_DEFAULTS,
      encryptionKey: LOGIN_STORE_ENCRYPTION_KEY,
      // 解密失败时（比如密钥变更或文件被手工改坏），清空重建而不是抛异常中断启动
      clearInvalidConfig: true
    });
  }
  return storeInstance;
}
function decideLoginEventName(prev, next) {
  if (!prev?.openId) return "login";
  if (prev.openId === next.openId) return "updateUserInfo";
  return "login";
}
function emit(ev) {
  for (const h of handlers$1) {
    try {
      h(ev);
    } catch (err) {
      log$h().warn(`LoginStore subscriber threw: ${err.message}`);
    }
  }
}
function persistToStore(data) {
  try {
    const store = getStore();
    store.store = data;
    log$h().debug(`login state persisted to electron-store (savedAt=${data.savedAt})`);
  } catch (err) {
    log$h().warn(`persist to electron-store failed: ${err.message}`);
    void reportBeaconEvent(LOGIN_REPORT_EVENTS.PERSIST_FAILED, {
      mod_id: LOGIN_MOD_ID,
      mod_name: LOGIN_MOD_NAME,
      reason: err.message
    });
  }
  return Promise.resolve();
}
function validatePersisted(data) {
  if (!data || typeof data !== "object") return false;
  const d = data;
  if (d.version !== PERSIST_VERSION) return false;
  if (!d.userInfo || typeof d.userInfo !== "object") return false;
  return true;
}
async function loadFromDisk() {
  try {
    const snapshot2 = getStore().store;
    if (validatePersisted(snapshot2) && (snapshot2.userInfo.main || snapshot2.userInfo.wxApp)) {
      userInfo = snapshot2.userInfo ?? {};
      const openId = userInfo.main?.openId ?? "";
      log$h().info(`login state loaded, ${openId ? `main.openId=${openId}` : "not logged in"}`);
      return;
    }
  } catch (err) {
    log$h().warn(`read electron-store failed: ${err.message}`);
  }
  log$h().info("no persisted login state, starting with empty user info");
  userInfo = {};
}
function getUserInfo$1() {
  if (!userInfo.main && !userInfo.wxApp) return EMPTY_USER_INFO;
  return deepClone(userInfo);
}
function login(prefix, info, winId) {
  const prev = userInfo[prefix];
  const eventName = decideLoginEventName(prev, info);
  userInfo = { ...userInfo, [prefix]: deepClone(info) };
  log$h().info(`login: prefix=${prefix} openId=${info.openId} loginType=${info.loginType || "(empty)"} event=${eventName}`);
  emit({
    eventName,
    userInfo: deepClone(userInfo),
    winId
  });
  persistToStore({
    version: PERSIST_VERSION,
    userInfo,
    savedAt: Date.now()
  });
}
function logout(reason) {
  const hadSession = !!(userInfo.main?.openId || userInfo.wxApp?.openId);
  userInfo = {};
  log$h().info(`logout: reason=${reason ?? "(none)"} hadSession=${hadSession}`);
  emit({
    eventName: "logout",
    userInfo: {},
    reason
  });
  persistToStore({
    version: PERSIST_VERSION,
    userInfo: {},
    savedAt: Date.now()
  });
}
function patchUserInfo(prefix, patch, eventName, winId) {
  const prev = userInfo[prefix];
  if (!prev?.openId) {
    log$h().debug(`patchUserInfo skipped: prefix=${prefix} not logged in`);
    return;
  }
  const merged = { ...prev };
  let changed = false;
  Object.keys(patch).forEach((k) => {
    const v = patch[k];
    if (v === void 0) return;
    const bag = merged;
    if (bag[k] !== v) {
      bag[k] = v;
      changed = true;
    }
  });
  if (!changed) {
    log$h().debug(`patchUserInfo skipped: prefix=${prefix} no field changed`);
    return;
  }
  userInfo = { ...userInfo, [prefix]: merged };
  log$h().info(`patchUserInfo: prefix=${prefix} event=${eventName} expireTime=${merged.expireTime ?? "(none)"}`);
  emit({
    eventName,
    userInfo: deepClone(userInfo),
    winId
  });
  persistToStore({
    version: PERSIST_VERSION,
    userInfo,
    savedAt: Date.now()
  });
}
function onEvent(handler) {
  handlers$1.add(handler);
  return () => {
    handlers$1.delete(handler);
  };
}
const ENV_QIMEI_ADDON_PATH = "MARVIS_QIMEI_ADDON_PATH";
const DEFAULT_QIMEI_DEBUG = false;
const DEFAULT_QIMEI_ENABLE_AUDIT = true;
const DEFAULT_QIMEI_IS_MAIN_SERVICE = true;
const QIMEI_LOG_SCOPE = "qimei";
const nativeRequire$1 = createRequire(import.meta.url);
function resolveCandidatePaths$1() {
  const list = [];
  const { [ENV_QIMEI_ADDON_PATH]: envValue } = process.env;
  const envPath = envValue?.trim();
  if (envPath && envPath.length > 0) {
    list.push(isAbsolute(envPath) ? envPath : resolve(process.cwd(), envPath));
  }
  list.push(resolve(process.cwd(), "native/qimei/build/Release/qimei.node"));
  const { resourcesPath } = process;
  if (typeof resourcesPath === "string" && resourcesPath.length > 0) {
    list.push(join(resourcesPath, "native", "qimei.node"));
    list.push(join(resourcesPath, "native", "qimei", "qimei.node"));
  }
  return Array.from(new Set(list));
}
function loadNativeBinding$1() {
  if (process.platform !== "darwin") {
    return { binding: null, resolvedPath: null, reason: "non-darwin platform" };
  }
  const candidates2 = resolveCandidatePaths$1();
  let lastError = null;
  for (const path2 of candidates2) {
    if (!existsSync(path2)) {
      continue;
    }
    try {
      const mod = nativeRequire$1(path2);
      if (!mod || typeof mod.init !== "function") {
        lastError = `addon at ${path2} does not export expected API`;
        continue;
      }
      return { binding: mod, resolvedPath: path2 };
    } catch (err) {
      lastError = `require(${path2}) failed: ${err.message}`;
    }
  }
  return {
    binding: null,
    resolvedPath: null,
    reason: lastError ?? "qimei.node not found in any candidate path"
  };
}
function createStubBinding$1() {
  return {
    init: () => false,
    getQimei: () => ({ q16: "", q36: "" }),
    getQimeiAsync: (cb) => {
      queueMicrotask(() => cb({ q16: "", q36: "" }));
    },
    getToken: () => "",
    setQimei36Listener: (_cb) => {
    }
  };
}
let binding$1 = null;
let initialized$2 = false;
let isStub$1 = false;
let logger$14 = null;
const emitter = new EventEmitter();
const EVENT_Q36_CHANGED = "q36-changed";
emitter.setMaxListeners(50);
let lastKnownQ36 = "";
function getModuleLogger$e() {
  if (!logger$14) {
    logger$14 = getLogger(QIMEI_LOG_SCOPE);
  }
  return logger$14;
}
function assertMainProcess$1() {
  const t = process.type;
  if (t === "renderer" || t === "worker") {
    throw new Error(`QimeiSDK 必须在主进程调用，当前 process.type=${String(t)}`);
  }
}
function normalize(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}
function resolveAppVersion() {
  try {
    if (app && typeof app.getVersion === "function") {
      return app.getVersion();
    }
  } catch {
  }
  return process.env.npm_package_version ?? "0.0.0";
}
function initQimei(config2) {
  const log2 = getModuleLogger$e();
  if (initialized$2) {
    log2.debug("QimeiSDK 已初始化，跳过");
    return;
  }
  assertMainProcess$1();
  const appkey = normalize(config2?.appkey);
  const channelId = normalize(config2?.channel_id);
  const debug = config2?.debug ?? DEFAULT_QIMEI_DEBUG;
  const enableAudit = config2?.enable_audit ?? DEFAULT_QIMEI_ENABLE_AUDIT;
  if (process.platform !== "darwin") {
    log2.info("QimeiSDK 未启用（非 darwin 平台），走 stub");
    binding$1 = createStubBinding$1();
    isStub$1 = true;
    initialized$2 = true;
    return;
  }
  if (appkey.length === 0) {
    log2.warn("QimeiSDK 未配置 Appkey（env MARVIS_QIMEI_APPKEY 或 TOML [qimei].appkey 均为空），走 stub");
    binding$1 = createStubBinding$1();
    isStub$1 = true;
    initialized$2 = true;
    return;
  }
  const loaderResult = loadNativeBinding$1();
  if (!loaderResult.binding) {
    log2.warn(`QimeiSDK addon 加载失败，走 stub: ${loaderResult.reason ?? "unknown"}`);
    binding$1 = createStubBinding$1();
    isStub$1 = true;
    initialized$2 = true;
    return;
  }
  binding$1 = loaderResult.binding;
  isStub$1 = false;
  log2.info(`QimeiSDK addon 已加载 → ${loaderResult.resolvedPath ?? "(unknown path)"}`);
  try {
    const appVersion = resolveAppVersion();
    binding$1.init(
      appkey,
      channelId,
      debug,
      enableAudit,
      DEFAULT_QIMEI_IS_MAIN_SERVICE,
      appVersion,
      (line) => {
        log2.debug(`[sdk] ${line}`);
      }
    );
    binding$1.setQimei36Listener((q36) => {
      lastKnownQ36 = q36;
      emitter.emit(EVENT_Q36_CHANGED, q36);
    });
    initialized$2 = true;
    const maskedAppkey = `${appkey.slice(0, 4)}***(len=${appkey.length})`;
    const channelLabel = channelId || "(none)";
    log2.info(`QimeiSDK 初始化完成 appkey=${maskedAppkey} channel=${channelLabel} debug=${debug} audit=${enableAudit} appVersion=${appVersion}`);
    binding$1?.getQimeiAsync((snapshot2) => {
      log2.info(`QimeiSDK 获取初始 QIMEI: q16=${snapshot2.q16} q36=${snapshot2.q36}`);
    });
  } catch (err) {
    log2.warn(`QimeiSDK 初始化抛错，降级 stub: ${err.message}`);
    binding$1 = createStubBinding$1();
    isStub$1 = true;
    initialized$2 = true;
  }
}
function getQimei() {
  if (!binding$1) {
    return { q16: "", q36: "" };
  }
  try {
    return binding$1.getQimei();
  } catch (err) {
    getModuleLogger$e().warn(`getQimei 抛错: ${err.message}`);
    return { q16: "", q36: "" };
  }
}
function onQimei36Changed(listener) {
  emitter.on(EVENT_Q36_CHANGED, listener);
  if (lastKnownQ36.length > 0) {
    queueMicrotask(() => {
      try {
        listener(lastKnownQ36);
      } catch (err) {
        getModuleLogger$e().warn(`Q36 listener 异常: ${err.message}`);
      }
    });
  }
  return () => {
    emitter.off(EVENT_Q36_CHANGED, listener);
  };
}
function waitForQimeiReady(timeoutMs = 5e3) {
  const current = getQimei();
  if (current.q36.length > 0 || current.q16.length > 0) {
    return Promise.resolve(current);
  }
  if (isStub$1) {
    getModuleLogger$e().debug("waitForQimeiReady: stub 模式，立即返回空快照");
    return Promise.resolve(current);
  }
  return new Promise((resolve2) => {
    let settled = false;
    let dispose = null;
    const finish = (snapshot2) => {
      if (settled) return;
      settled = true;
      if (dispose) {
        try {
          dispose();
        } catch {
        }
        dispose = null;
      }
      clearTimeout(timer2);
      resolve2(snapshot2);
    };
    const timer2 = setTimeout(() => {
      getModuleLogger$e().warn(`waitForQimeiReady 超时 ${timeoutMs}ms，返回空快照（调用方应降级）`);
      finish(getQimei());
    }, timeoutMs);
    dispose = onQimei36Changed((q36) => {
      if (q36.length === 0) return;
      finish(getQimei());
    });
  });
}
const PLACEHOLDER_DEVICE_GUID = "web";
const DEVICE_GUID_MOD_ID = "device_guid";
const DEVICE_GUID_MOD_NAME = "设备标识";
const DEVICE_GUID_REPORT_EVENTS = {
  /** 真实 GUID 解析成功（来自 qimei） */
  RESOLVED: "device_guid__resolved",
  /** 降级使用占位 GUID（qimei 不可用） */
  FALLBACK: "device_guid__fallback"
};
const logger$13 = getLogger("device-guid");
let cached = null;
let pendingPromise = null;
const realGuidResolvedListeners = /* @__PURE__ */ new Set();
const QIMEI_WAIT_TIMEOUT_MS = 5e3;
function pickGuidFromQimei(q36, q16) {
  if (q36.length > 0) return q36;
  if (q16.length > 0) return q16;
  return "";
}
async function getDeviceGuid() {
  if (cached !== null) return cached;
  if (pendingPromise) return pendingPromise;
  pendingPromise = (async () => {
    const snap = getQimei();
    const fast = pickGuidFromQimei(snap.q36, snap.q16);
    if (fast.length > 0) {
      setCached(fast);
      return fast;
    }
    const ready = await waitForQimeiReady(QIMEI_WAIT_TIMEOUT_MS);
    const guid = pickGuidFromQimei(ready.q36, ready.q16);
    if (guid.length > 0) {
      setCached(guid);
      return guid;
    }
    logger$13.warn(`[device-guid] QimeiSDK 未返回有效 qimei，降级占位 '${PLACEHOLDER_DEVICE_GUID}'（下次调用会重试）`);
    reportBeaconEvent(DEVICE_GUID_REPORT_EVENTS.FALLBACK, {
      mod_id: DEVICE_GUID_MOD_ID,
      mod_name: DEVICE_GUID_MOD_NAME,
      reason: "qimei_unavailable",
      timeout_ms: String(QIMEI_WAIT_TIMEOUT_MS)
    });
    return PLACEHOLDER_DEVICE_GUID;
  })();
  try {
    const result = await pendingPromise;
    return result;
  } finally {
    pendingPromise = null;
  }
}
async function logDeviceGuid() {
  const guid = await getDeviceGuid();
  const isPlaceholder = guid === PLACEHOLDER_DEVICE_GUID;
  logger$13.info(`[device-guid] resolved: guid=${guid}${isPlaceholder ? " (placeholder; qimei unavailable)" : " (from qimei)"}`);
}
function onRealGuidResolved(fn) {
  realGuidResolvedListeners.add(fn);
  if (cached !== null && cached !== PLACEHOLDER_DEVICE_GUID) {
    const snap = cached;
    queueMicrotask(() => {
      try {
        fn(snap);
      } catch (err) {
        logger$13.warn(`[device-guid] onRealGuidResolved 回调异常: ${err.message}`);
      }
    });
  }
  return () => {
    realGuidResolvedListeners.delete(fn);
  };
}
function setCached(guid) {
  const wasPlaceholderOrEmpty = cached === null || cached === PLACEHOLDER_DEVICE_GUID;
  cached = guid;
  if (wasPlaceholderOrEmpty && guid !== PLACEHOLDER_DEVICE_GUID) {
    reportBeaconEvent(DEVICE_GUID_REPORT_EVENTS.RESOLVED, {
      mod_id: DEVICE_GUID_MOD_ID,
      mod_name: DEVICE_GUID_MOD_NAME,
      guid_length: String(guid.length)
    });
    for (const fn of realGuidResolvedListeners) {
      try {
        fn(guid);
      } catch (err) {
        logger$13.warn(`[device-guid] onRealGuidResolved 回调异常: ${err.message}`);
      }
    }
  }
}
const BUSINESS_ID = "marvis_client";
const ACCESS_KEY = "fpzkeTlcGLVP37qiOWd29MyaOqaJYxMi";
const HOST_PROD = "https://yybadaccess.3g.qq.com";
const HOST_DEV = "https://yybadaccess.sparta.html5.qq.com";
const API_PATH = {
  CHECK_LOGIN: `/${BUSINESS_ID}/marvis_check_login`,
  REFRESH_TOKEN: `/${BUSINESS_ID}/marvis_refresh_token`,
  LOGOUT: `/${BUSINESS_ID}/marvis_logout`,
  GET_USER_INFO: `/${BUSINESS_ID}/marvis_get_user_info`
};
const REQUEST_TIMEOUT_MS = 3e3;
const RETRY_COUNT = 3;
const RETRY_INTERVAL_MS = 100;
function computeSignature(body, timestamp, nonce, accessKey = ACCESS_KEY) {
  const input = `${body}${timestamp}${accessKey}${nonce}`;
  return createHash("md5").update(input, "utf8").digest("hex");
}
function buildSignatureHeaders(body, businessId = BUSINESS_ID) {
  const timestamp = Date.now();
  const nonce = String(Math.floor(Math.random() * 1e4));
  const signature = computeSignature(body, timestamp, nonce);
  return {
    "Content-Type": "application/json",
    "Ual-Access-Businessid": businessId,
    "Ual-Access-Timestamp": String(timestamp),
    "Ual-Access-Nonce": nonce,
    "Ual-Access-Signature": signature
  };
}
const logger$12 = getLogger("login-backend");
var BackendCode = /* @__PURE__ */ ((BackendCode2) => {
  BackendCode2[BackendCode2["kSuccess"] = 0] = "kSuccess";
  BackendCode2[BackendCode2["kReplyError"] = 1] = "kReplyError";
  BackendCode2[BackendCode2["kNetworkError"] = 2] = "kNetworkError";
  BackendCode2[BackendCode2["kParseError"] = 3] = "kParseError";
  BackendCode2[BackendCode2["kParameterError"] = 4] = "kParameterError";
  return BackendCode2;
})(BackendCode || {});
function getHost() {
  const dev = process.env.MARVIS_API_DEBUG_MODE === "1" || process.env.MARVIS_API_DEBUG_MODE === "true";
  return dev ? HOST_DEV : HOST_PROD;
}
function computeExpireTime(expiresIn) {
  if (expiresIn === void 0 || expiresIn === null) return void 0;
  const n = typeof expiresIn === "number" ? expiresIn : Number.parseInt(expiresIn, 10);
  if (!Number.isFinite(n) || n <= 0) return void 0;
  return Math.floor(Date.now() / 1e3) + n;
}
function sleep$7(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function postOnce$3(url, headers, body) {
  const controller = new AbortController();
  const timer2 = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await net.fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      bypassCustomProtocolHandlers: true
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text };
  } finally {
    clearTimeout(timer2);
  }
}
async function postWithRetry$3(url, body, opts) {
  const attempts = opts.retry ? RETRY_COUNT : 1;
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const headers = buildSignatureHeaders(body);
      const resp = await postOnce$3(url, headers, body);
      logger$12.info(`POST ${url.slice(0, 80)} attempt=${i + 1}/${attempts} status=${resp.status}`);
      if (resp.ok) return resp;
      if (i < attempts - 1) await sleep$7(RETRY_INTERVAL_MS);
    } catch (err) {
      lastErr = err;
      logger$12.warn(`POST ${url.slice(0, 80)} attempt=${i + 1}/${attempts} exception: ${lastErr.message}`);
      if (i < attempts - 1) await sleep$7(RETRY_INTERVAL_MS);
    }
  }
  if (lastErr) logger$12.warn(`POST ${url.slice(0, 80)} all ${attempts} attempts failed`);
  return null;
}
function parseStandardRsp(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
async function getGuid(_userInfo) {
  return getDeviceGuid();
}
async function fetchCheckLogin(userInfo2) {
  if (!userInfo2.loginType) {
    return {
      code: 4
      /* kParameterError */
    };
  }
  const req = {
    userInfo: {
      loginType: userInfo2.loginType,
      openId: userInfo2.openId,
      accessToken: userInfo2.accessToken,
      refreshToken: userInfo2.refreshToken,
      guid: await getGuid()
    }
  };
  const url = getHost() + API_PATH.CHECK_LOGIN;
  const body = JSON.stringify(req);
  const resp = await postWithRetry$3(url, body, { retry: true });
  if (!resp) return {
    code: 2
    /* kNetworkError */
  };
  if (!resp.ok) {
    logger$12.warn(`marvis_check_login http failed: status=${resp.status}`);
    return {
      code: 2
      /* kNetworkError */
    };
  }
  const parsed = parseStandardRsp(resp.body);
  if (!parsed) {
    logger$12.warn(`marvis_check_login parse failed: body=${resp.body.slice(0, 200)}`);
    return {
      code: 3
      /* kParseError */
    };
  }
  const bizCode = parsed.code ?? -1;
  if (bizCode !== 0) {
    logger$12.warn(`marvis_check_login reply error code=${bizCode} msg=${parsed.msg ?? ""}`);
    return {
      code: 1
      /* kReplyError */
    };
  }
  const rsp = parsed.user_info ?? {};
  return {
    code: 0,
    patch: {
      accessToken: rsp.access_token,
      refreshToken: rsp.refresh_token,
      openId: rsp.open_id,
      loginType: rsp.login_type,
      expireTime: computeExpireTime(rsp.expires_in)
    }
  };
}
async function refreshToken(userInfo2) {
  if (!userInfo2.loginType) {
    return {
      code: 4
      /* kParameterError */
    };
  }
  const req = {
    userInfo: {
      loginType: userInfo2.loginType,
      openId: userInfo2.openId,
      accessToken: userInfo2.accessToken,
      refreshToken: userInfo2.refreshToken,
      guid: await getGuid()
    }
  };
  const url = getHost() + API_PATH.REFRESH_TOKEN;
  const body = JSON.stringify(req);
  const resp = await postWithRetry$3(url, body, { retry: true });
  if (!resp) return {
    code: 2
    /* kNetworkError */
  };
  if (!resp.ok) {
    logger$12.warn(`marvis_refresh_token http failed: status=${resp.status}`);
    return {
      code: 2
      /* kNetworkError */
    };
  }
  const parsed = parseStandardRsp(resp.body);
  if (!parsed) {
    logger$12.warn(`marvis_refresh_token parse failed: body=${resp.body.slice(0, 200)}`);
    return {
      code: 3
      /* kParseError */
    };
  }
  const bizCode = parsed.code ?? -1;
  if (bizCode !== 0) {
    logger$12.warn(`marvis_refresh_token reply error code=${bizCode} msg=${parsed.msg ?? ""}`);
    return {
      code: 1
      /* kReplyError */
    };
  }
  const rsp = parsed.user_info ?? {};
  return {
    code: 0,
    patch: {
      accessToken: rsp.access_token,
      // Windows `RefrashToken` 不更新 refreshToken，但我们透传服务端给的值以兼容未来
      refreshToken: rsp.refresh_token,
      expireTime: computeExpireTime(rsp.expires_in)
    }
  };
}
async function fetchUserInfo(userInfo2) {
  if (!userInfo2.loginType) {
    return {
      code: 4
      /* kParameterError */
    };
  }
  const req = {
    userInfo: {
      loginType: userInfo2.loginType,
      openId: userInfo2.openId,
      accessToken: userInfo2.accessToken,
      refreshToken: userInfo2.refreshToken,
      guid: await getGuid()
    }
  };
  const url = getHost() + API_PATH.GET_USER_INFO;
  const body = JSON.stringify(req);
  const resp = await postWithRetry$3(url, body, { retry: true });
  if (!resp) return {
    code: 2
    /* kNetworkError */
  };
  if (!resp.ok) {
    logger$12.warn(`marvis_get_user_info http failed: status=${resp.status}`);
    return {
      code: 2
      /* kNetworkError */
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(resp.body);
  } catch {
    logger$12.warn(`marvis_get_user_info parse failed: body=${resp.body.slice(0, 200)}`);
    return {
      code: 3
      /* kParseError */
    };
  }
  const bizCode = parsed.ret ?? -1;
  if (bizCode !== 0) {
    logger$12.warn(`marvis_get_user_info reply error ret=${bizCode} body=${resp.body.slice(0, 200)}`);
    return {
      code: 1
      /* kReplyError */
    };
  }
  const patch = {};
  if (typeof parsed.nick_name === "string" && parsed.nick_name.length > 0) {
    patch.nickName = parsed.nick_name;
  }
  if (typeof parsed.head_img_url === "string" && parsed.head_img_url.length > 0) {
    patch.headImg = parsed.head_img_url;
  }
  logger$12.info(`marvis_get_user_info success: openId=${userInfo2.openId} nickName=${patch.nickName ?? "(keep)"} headImg=${patch.headImg ? "(set)" : "(keep)"}`);
  return { code: 0, patch };
}
async function marvisLogout(userInfo2) {
  if (!userInfo2.loginType) {
    return {
      code: 4
      /* kParameterError */
    };
  }
  const req = {
    user_info: {
      open_id: userInfo2.openId,
      access_token: userInfo2.accessToken,
      guid: await getGuid()
    }
  };
  const url = getHost() + API_PATH.LOGOUT;
  const body = JSON.stringify(req);
  const resp = await postWithRetry$3(url, body, { retry: false });
  if (!resp) return {
    code: 2
    /* kNetworkError */
  };
  if (!resp.ok) {
    logger$12.warn(`marvis_logout http failed: status=${resp.status}`);
    return {
      code: 2
      /* kNetworkError */
    };
  }
  const parsed = parseStandardRsp(resp.body);
  if (!parsed) return {
    code: 3
    /* kParseError */
  };
  const bizCode = parsed.code ?? -1;
  if (bizCode !== 0) {
    logger$12.warn(`marvis_logout reply error code=${bizCode} msg=${parsed.msg ?? ""}`);
    return {
      code: 1
      /* kReplyError */
    };
  }
  logger$12.info("marvis_logout success");
  return {
    code: 0
    /* kSuccess */
  };
}
const NETWORK_CHECK_INTERVAL_MS = 5 * 1e3;
let timer$1 = null;
let running$2 = false;
let deps$1 = null;
let lastOnline = null;
const handlers = /* @__PURE__ */ new Set();
function log$g() {
  return deps$1?.logger ?? getLogger("login-network-monitor");
}
function readOnline() {
  if (deps$1?.isOnline) return deps$1.isOnline();
  try {
    return net.isOnline();
  } catch {
    return true;
  }
}
function sampleOnce() {
  const current = readOnline();
  const prev = lastOnline;
  lastOnline = current;
  if (prev === null) {
    log$g().info(`first sample: online=${current}`);
    return;
  }
  if (!prev && current) {
    log$g().info("network recovered (offline → online), notifying subscribers");
    for (const h of handlers) {
      try {
        h();
      } catch (err) {
        log$g().warn(`recovery handler threw: ${err.message}`);
      }
    }
    return;
  }
  if (prev && !current) {
    log$g().info("network lost (online → offline)");
  }
}
function start$3(d = {}) {
  if (running$2) stop$2();
  deps$1 = d;
  running$2 = true;
  lastOnline = null;
  const intervalMs2 = d.intervalMsOverride ?? NETWORK_CHECK_INTERVAL_MS;
  sampleOnce();
  timer$1 = setInterval(() => {
    try {
      sampleOnce();
    } catch (err) {
      log$g().warn(`sample failed: ${err.message}`);
    }
  }, intervalMs2);
  timer$1.unref?.();
  log$g().info(`network-monitor started, intervalMs=${intervalMs2}`);
}
function stop$2() {
  if (!running$2) return;
  if (timer$1) {
    clearInterval(timer$1);
    timer$1 = null;
  }
  running$2 = false;
  lastOnline = null;
  log$g().info("network-monitor stopped");
}
function onRecovery(handler) {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}
const CHECK_INTERVAL_MS = 2 * 60 * 1e3;
const MAX_REFRESH_FAIL_COUNT = 5;
const STARTUP_REFRESH_THRESHOLD_SEC = 30;
const REFRESH_THRESHOLD_SEC = 300;
let timer = null;
let deps = null;
let failCount = 0;
let checkFailCount = 0;
let running$1 = false;
let inflightTick = null;
let intervalMs = CHECK_INTERVAL_MS;
let pendingRefreshOnRecovery = false;
let disposeRecoverySub = null;
function log$f() {
  return deps?.logger ?? getLogger("login-checker");
}
function isNetworkConnected() {
  if (deps?.isOnline) return deps.isOnline();
  try {
    return net.isOnline();
  } catch {
    return true;
  }
}
function callCheckLogin(info) {
  return (deps?.checkLoginApi ?? fetchCheckLogin)(info);
}
function callRefreshToken(info) {
  return (deps?.refreshTokenApi ?? refreshToken)(info);
}
function applyPatch(patch, eventName) {
  if (!patch) return;
  const { openId, loginType, accessToken, refreshToken: rt, expireTime } = patch;
  const clean = {};
  if (typeof openId === "string" && openId) clean.openId = openId;
  if (typeof loginType === "string" && loginType) {
    clean.loginType = loginType;
  }
  if (typeof accessToken === "string" && accessToken) clean.accessToken = accessToken;
  if (typeof rt === "string" && rt) clean.refreshToken = rt;
  if (typeof expireTime === "number" && expireTime > 0) clean.expireTime = expireTime;
  if (Object.keys(clean).length === 0) return;
  deps?.patchUserInfo(clean, eventName);
}
async function runStartupCheck() {
  const info = deps?.getMainUserInfo();
  if (!info?.loginType) {
    log$f().info("startup check: not logged in, skip");
    return;
  }
  if (info.expireTime === void 0) {
    log$f().info("startup check: expireTime empty, skip (handled by first tick)");
    return;
  }
  const nowSec = Math.floor(Date.now() / 1e3);
  if (nowSec + STARTUP_REFRESH_THRESHOLD_SEC < info.expireTime) {
    log$f().info(`startup check: calling check_login (expireTime=${info.expireTime} now=${nowSec})`);
    const result = await callCheckLogin(info);
    handleCheckLoginResult(result, "checkLogin");
    const latestInfo = deps?.getMainUserInfo();
    if (latestInfo?.loginType) {
      log$f().info("startup check: async refresh token to ensure server-side validity");
      void callRefreshToken(latestInfo).then((r) => {
        if (r.code === BackendCode.kSuccess) {
          applyPatch(r.patch, "refreshToken");
          log$f().info("startup check: async refresh token succeeded");
        } else {
          log$f().warn(`startup check: async refresh token failed, code=${r.code} (ignored)`);
        }
      }).catch((err) => {
        log$f().warn(`startup check: async refresh token threw: ${err.message} (ignored)`);
      });
    }
  } else {
    log$f().info(`startup check: calling refresh_token (expireTime=${info.expireTime} now=${nowSec})`);
    const result = await callRefreshToken(info);
    handleRefreshResult(
      result,
      /* isTimer */
      false
    );
  }
}
async function runTickOnce() {
  const info = deps?.getMainUserInfo();
  if (!info?.loginType) {
    log$f().info(`tick skipped: not logged in (hasInfo=${!!info} loginType=${info?.loginType ?? "(none)"})`);
    return;
  }
  if (info.expireTime === void 0) {
    log$f().warn(`empty expireTime, calling check_login to verify, loginType=${info.loginType}`);
    const result2 = await callCheckLogin(info);
    handleCheckLoginResult(result2, "checkLogin");
    return;
  }
  const nowSec = Math.floor(Date.now() / 1e3);
  const thresholdSec = getRefreshThresholdSec();
  if (nowSec + thresholdSec < info.expireTime) {
    log$f().info(`tick skipped: token still fresh (expireTime=${info.expireTime} now=${nowSec} remainSec=${info.expireTime - nowSec} threshold=${thresholdSec}s)`);
    return;
  }
  log$f().info(`tick refresh_token: expireTime=${info.expireTime} now=${nowSec} threshold=${thresholdSec}s`);
  const result = await callRefreshToken(info);
  handleRefreshResult(
    result,
    /* isTimer */
    true
  );
}
function getRefreshThresholdSec() {
  const envRaw = process.env.MARVIS_LOGIN_REFRESH_THRESHOLD_SEC;
  if (envRaw) {
    const n = Number.parseInt(envRaw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return REFRESH_THRESHOLD_SEC;
}
function handleCheckLoginResult(result, eventName) {
  switch (result.code) {
    case BackendCode.kSuccess:
      checkFailCount = 0;
      applyPatch(result.patch, eventName);
      void reportBeaconEvent(LOGIN_REPORT_EVENTS.STARTUP_CHECK_SUCCESS, {
        mod_id: LOGIN_MOD_ID,
        mod_name: LOGIN_MOD_NAME,
        event_name: eventName
      });
      break;
    case BackendCode.kReplyError:
      checkFailCount += 1;
      log$f().warn(`check_login reply error, checkFailCount=${checkFailCount}/${MAX_REFRESH_FAIL_COUNT}`);
      void reportBeaconRealtimeEvent(LOGIN_REPORT_EVENTS.STARTUP_CHECK_FAILED, {
        mod_id: LOGIN_MOD_ID,
        mod_name: LOGIN_MOD_NAME,
        reason: "reply_error",
        fail_count: String(checkFailCount)
      });
      if (checkFailCount >= MAX_REFRESH_FAIL_COUNT) {
        log$f().warn(`force logout due to continuous check_login reply error, count=${checkFailCount}`);
        void reportBeaconRealtimeEvent(LOGIN_REPORT_EVENTS.FORCE_LOGOUT, {
          mod_id: LOGIN_MOD_ID,
          mod_name: LOGIN_MOD_NAME,
          reason: "check_login_continuous_failure",
          fail_count: String(checkFailCount)
        });
        checkFailCount = 0;
        deps?.logout("checkLogin");
      }
      break;
    default:
      log$f().warn(`check_login non-fatal error code=${result.code}, skip`);
      break;
  }
}
function handleRefreshResult(result, isTimer) {
  switch (result.code) {
    case BackendCode.kSuccess:
      failCount = 0;
      pendingRefreshOnRecovery = false;
      applyPatch(result.patch, "refreshToken");
      void reportBeaconEvent(LOGIN_REPORT_EVENTS.REFRESH_SUCCESS, {
        mod_id: LOGIN_MOD_ID,
        mod_name: LOGIN_MOD_NAME,
        is_timer: String(isTimer)
      });
      break;
    case BackendCode.kReplyError:
      log$f().warn("refresh_token reply error → force logout");
      void reportBeaconRealtimeEvent(LOGIN_REPORT_EVENTS.REFRESH_FAILED, {
        mod_id: LOGIN_MOD_ID,
        mod_name: LOGIN_MOD_NAME,
        reason: "reply_error",
        is_timer: String(isTimer)
      });
      failCount = 0;
      pendingRefreshOnRecovery = false;
      void reportBeaconRealtimeEvent(LOGIN_REPORT_EVENTS.FORCE_LOGOUT, {
        mod_id: LOGIN_MOD_ID,
        mod_name: LOGIN_MOD_NAME,
        reason: "refresh_token_reply_error"
      });
      deps?.logout("refreshToken");
      break;
    case BackendCode.kNetworkError:
    default:
      if (!isTimer) {
        log$f().warn(`startup refresh failed, code=${result.code}, will retry in timer`);
        void reportBeaconRealtimeEvent(LOGIN_REPORT_EVENTS.REFRESH_FAILED, {
          mod_id: LOGIN_MOD_ID,
          mod_name: LOGIN_MOD_NAME,
          reason: "startup_network_error",
          code: String(result.code)
        });
        return;
      }
      if (isNetworkConnected()) {
        failCount += 1;
        log$f().warn(`refresh failed with network available, failCount=${failCount}/${MAX_REFRESH_FAIL_COUNT}`);
        void reportBeaconRealtimeEvent(LOGIN_REPORT_EVENTS.REFRESH_FAILED, {
          mod_id: LOGIN_MOD_ID,
          mod_name: LOGIN_MOD_NAME,
          reason: "network_error_online",
          fail_count: String(failCount)
        });
      } else {
        pendingRefreshOnRecovery = true;
        log$f().info(`refresh failed but network unavailable, skip count (current=${failCount}), pendingRefreshOnRecovery=true`);
      }
      if (failCount >= MAX_REFRESH_FAIL_COUNT) {
        log$f().warn(`force logout due to continuous refresh failure, count=${failCount}`);
        void reportBeaconRealtimeEvent(LOGIN_REPORT_EVENTS.FORCE_LOGOUT, {
          mod_id: LOGIN_MOD_ID,
          mod_name: LOGIN_MOD_NAME,
          reason: "refresh_continuous_failure",
          fail_count: String(failCount)
        });
        deps?.logout("refreshToken");
        failCount = 0;
      }
      break;
  }
}
function start$2(d) {
  if (running$1) stop$1();
  deps = d;
  failCount = 0;
  checkFailCount = 0;
  pendingRefreshOnRecovery = false;
  let resolved = CHECK_INTERVAL_MS;
  let resolvedSource = "default";
  if (d.intervalMsOverride !== void 0) {
    resolved = d.intervalMsOverride;
    resolvedSource = "override";
  } else {
    const envRaw = process.env.MARVIS_LOGIN_CHECK_INTERVAL_MS;
    if (envRaw) {
      const envParsed = Number.parseInt(envRaw, 10);
      if (Number.isFinite(envParsed) && envParsed >= 1e3) {
        resolved = envParsed;
        resolvedSource = "env";
      } else {
        log$f().warn(`invalid MARVIS_LOGIN_CHECK_INTERVAL_MS='${envRaw}', fallback to default ${CHECK_INTERVAL_MS}ms`);
      }
    }
  }
  intervalMs = resolved;
  running$1 = true;
  log$f().info(`checker started, intervalMs=${intervalMs} (source=${resolvedSource})`);
  try {
    start$3();
    disposeRecoverySub = onRecovery(() => onNetworkRecovered());
  } catch (err) {
    log$f().warn(`network-monitor start failed: ${err.message}`);
  }
  void runStartupCheck().catch((err) => {
    log$f().warn(`startup check threw: ${err.message}`);
  });
  timer = setInterval(() => {
    void tick().catch((err) => {
      log$f().warn(`timer tick threw: ${err.message}`);
    });
  }, intervalMs);
  timer.unref?.();
}
function stop$1() {
  if (!running$1) return;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (disposeRecoverySub) {
    disposeRecoverySub();
    disposeRecoverySub = null;
  }
  try {
    stop$2();
  } catch (err) {
    log$f().warn(`network-monitor stop failed: ${err.message}`);
  }
  running$1 = false;
  failCount = 0;
  checkFailCount = 0;
  pendingRefreshOnRecovery = false;
  log$f().info("checker stopped");
}
function tick() {
  log$f().info(`tick() entered, running=${running$1} depsInjected=${!!deps} inflight=${!!inflightTick}`);
  if (!running$1 || !deps) return Promise.resolve();
  if (inflightTick) return inflightTick;
  inflightTick = runTickOnce().catch((err) => {
    log$f().warn(`tick failed: ${err.message}`);
  }).finally(() => {
    inflightTick = null;
  });
  return inflightTick;
}
function onNetworkRecovered() {
  if (!running$1) return;
  if (!pendingRefreshOnRecovery) {
    log$f().debug("onNetworkRecovered: no pending refresh, skip");
    return;
  }
  log$f().info("network recovered, retry refresh token immediately");
  pendingRefreshOnRecovery = false;
  void reportBeaconEvent(LOGIN_REPORT_EVENTS.NETWORK_RECOVERY_RETRY, {
    mod_id: LOGIN_MOD_ID,
    mod_name: LOGIN_MOD_NAME,
    fail_count: String(failCount)
  });
  void tick();
}
const AGENT_PROCESS_NAME = "agent-core";
const EXECUTABLE_NAME$1 = "MarvisAgent";
const ENV_AGENT_EXECUTABLE = "MARVIS_AGENT_PATH";
const ENV_AGENT_HOME_DIR = "MARVIS_AGENT_HOME_DIR";
const ENV_AGENT_LOG_DIR = "MARVIS_AGENT_LOG_DIR";
const ENV_AGENT_PORT_FILE = "MARVIS_AGENT_PORT_FILE";
const ENV_AGENT_KB_PORT_FILE = "MARVIS_AGENT_KB_PORT_FILE";
const ENV_AGENT_WORK_MODE = "MARVIS_AGENT_WORK_MODE";
const ENV_AGENT_PORT = "MARVIS_AGENT_PORT";
const DEFAULT_WORK_MODE = "cloud";
const DEFAULT_PORT_FILE_NAME = "agent_port.ini";
const DEFAULT_LOG_SUBDIR = "logs";
const DEFAULT_PORT_READY_TIMEOUT_MS = 12e4;
const PORT_FILE_POLL_INTERVAL_MS = 500;
const DEFAULT_TCP_READY_TIMEOUT_MS = 15e3;
const TCP_PROBE_INTERVAL_MS = 200;
const TCP_PROBE_ATTEMPT_TIMEOUT_MS = 500;
const NOTIFIER_RETRY_INTERVAL_MS = 1e3;
const NOTIFIER_MAX_ATTEMPTS = 10;
const DEFAULT_AGENT_RESTART_POLICY = {
  /** 60s 滑动窗口 */
  windowMs: 6e4,
  /** 窗口内最多 5 次重启 */
  maxRestartsInWindow: 5,
  /** 退避基数 1s */
  backoffInitialMs: 1e3,
  /** 退避上限 10s */
  backoffMaxMs: 1e4,
  /** 存活少于 3s 视为快速失败 */
  rapidFailThresholdMs: 3e3,
  /** 连续 3 次快速失败直接熔断 */
  rapidFailMaxCount: 3
};
const DEFAULT_AGENT_HEALTHY_AFTER_MS = 5e3;
const DEFAULT_HOME_DIR_NAME = "MarvisData";
const LEGACY_HOME_DIR_NAME = "Marvis";
const ENV_MARVIS_HOME_DIR = "MARVIS_HOME_DIR";
const logger$11 = getLogger("home-dir");
let cachedHomeDir = null;
function computeDefaultHomeDir() {
  return path__default.join(app.getPath("userData"), DEFAULT_HOME_DIR_NAME);
}
function isLegacyPlaceholder(dir) {
  try {
    const legacy = path__default.join(app.getPath("home"), LEGACY_HOME_DIR_NAME);
    if (path__default.resolve(dir) !== path__default.resolve(legacy)) return false;
    if (!existsSync$1(dir)) return true;
    const entries2 = readdirSync(dir);
    return entries2.length === 0;
  } catch {
    return false;
  }
}
function normalizeLegacyLowerCaseUserDataPath(storeValue) {
  if (process.platform !== "darwin") return null;
  try {
    const homeLib = path__default.join(app.getPath("home"), "Library", "Application Support");
    const newPrefix = path__default.join(homeLib, "com.tencent.mac.marvis") + path__default.sep;
    for (const oldName of ["marvis", "Marvis"]) {
      const oldPrefix = path__default.join(homeLib, oldName) + path__default.sep;
      if (storeValue.startsWith(oldPrefix)) {
        return newPrefix + storeValue.slice(oldPrefix.length);
      }
    }
    return null;
  } catch {
    return null;
  }
}
function tryEnsureDir(dir) {
  try {
    if (!existsSync$1(dir)) {
      mkdirSync$1(dir, { recursive: true });
    }
    return true;
  } catch (err) {
    logger$11.error(`创建目录失败 dir=${dir} — ${err.message}`);
    return false;
  }
}
function initHomeDir() {
  if (cachedHomeDir) return cachedHomeDir;
  const defaultDir = computeDefaultHomeDir();
  const fromEnv = process.env[ENV_MARVIS_HOME_DIR]?.trim();
  if (fromEnv) {
    if (!path__default.isAbsolute(fromEnv)) {
      logger$11.warn(`${ENV_MARVIS_HOME_DIR} 必须是绝对路径，已忽略 value=${fromEnv}`);
    } else {
      const ok2 = tryEnsureDir(fromEnv);
      if (ok2) {
        cachedHomeDir = fromEnv;
        logger$11.info(`home_dir 来源=env, value=${fromEnv}`);
        return cachedHomeDir;
      }
      logger$11.error(`${ENV_MARVIS_HOME_DIR} 指定路径不可用，降级到默认 value=${defaultDir}`);
    }
  }
  const store = new SettingsStore();
  const fromStore = (store.get("marvis_home_dir") ?? "").trim();
  if (!fromStore) {
    store.update({ marvis_home_dir: defaultDir });
    tryEnsureDir(defaultDir);
    cachedHomeDir = defaultDir;
    logger$11.info(`home_dir 来源=default(first-launch), value=${defaultDir}`);
    return cachedHomeDir;
  }
  if (isLegacyPlaceholder(fromStore)) {
    logger$11.warn(`检测到旧版遗留占位 ${fromStore}（目录为空或不存在），自动修正为 ${defaultDir}`);
    store.update({ marvis_home_dir: defaultDir });
    tryEnsureDir(defaultDir);
    cachedHomeDir = defaultDir;
    return cachedHomeDir;
  }
  const normalized = normalizeLegacyLowerCaseUserDataPath(fromStore);
  if (normalized && normalized !== fromStore) {
    logger$11.info(`规范化 home_dir 大小写：${fromStore} → ${normalized}`);
    store.update({ marvis_home_dir: normalized });
    if (tryEnsureDir(normalized)) {
      cachedHomeDir = normalized;
      return cachedHomeDir;
    }
  }
  if (tryEnsureDir(fromStore)) {
    cachedHomeDir = fromStore;
    logger$11.info(`home_dir 来源=store, value=${fromStore}`);
    return cachedHomeDir;
  }
  logger$11.error(`store 中的 home_dir 不可用 value=${fromStore}，本次运行降级到 ${defaultDir}`);
  tryEnsureDir(defaultDir);
  cachedHomeDir = defaultDir;
  return cachedHomeDir;
}
function getHomeDir() {
  if (!cachedHomeDir) {
    throw new Error("home-dir: getHomeDir() called before initHomeDir()");
  }
  return cachedHomeDir;
}
const KB_PROCESS_NAME = "knowledgebase";
const KB_EXECUTABLE_NAME = "MarvisKnowledgebase";
const ENV_KB_ENABLED = "MARVIS_KB_ENABLED";
const ENV_KB_PATH = "MARVIS_KB_PATH";
const ENV_KB_HOME_DIR = "MARVIS_KB_HOME_DIR";
const ENV_KB_LOG_DIR = "MARVIS_KB_LOG_DIR";
const ENV_KB_PORT_FILE = "MARVIS_KB_PORT_FILE";
const ENV_KB_LOCK_FILE = "MARVIS_KB_LOCK_FILE";
const ENV_KB_START_FROM = "MARVIS_KB_START_FROM";
const DEFAULT_KB_START_FROM = "Marvis";
const DEFAULT_KB_HOME_DIR_NAME = "Knowledgebase";
const DEFAULT_KB_LOG_SUBDIR = "logs";
const DEFAULT_KB_PORT_FILE_NAME = "knowledgebase_port.ini";
const DEFAULT_KB_LOCK_FILE_NAME = "MarvisKnowledgebase.lock";
const DEFAULT_KB_PORT_READY_TIMEOUT_MS = 12e4;
const KB_NOTIFIER_RETRY_INTERVAL_MS = 1e3;
const KB_NOTIFIER_MAX_ATTEMPTS = 10;
const DEFAULT_KB_HEALTHY_AFTER_MS = 15e3;
const DEFAULT_KB_RESTART_POLICY = {
  /** 2 分钟滑动窗口 */
  windowMs: 12e4,
  /** 窗口内最多 3 次重启 */
  maxRestartsInWindow: 3,
  /** 退避基数 2s */
  backoffInitialMs: 2e3,
  /** 退避上限 15s */
  backoffMaxMs: 15e3,
  /** 存活 <5s 视为快速失败 */
  rapidFailThresholdMs: 5e3,
  /** 连续 2 次快速失败直接熔断 */
  rapidFailMaxCount: 2
};
const KB_LAUNCH_LIMIT_MIN_INTERVAL_MS = 3e4;
const KB_LAUNCH_LIMIT_MAX_PER_HOUR = 10;
const KB_LAUNCH_LIMIT_WINDOW_MS = 60 * 60 * 1e3;
function expandTilde$1(p) {
  if (!p) return p;
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return join(homedir(), p.slice(2));
  }
  return p;
}
function toAbsolute$1(p) {
  const expanded = expandTilde$1(p);
  return isAbsolute(expanded) ? expanded : resolve(process.cwd(), expanded);
}
function getUserDataDir$2() {
  try {
    return app.getPath("userData");
  } catch {
    return process.cwd();
  }
}
function resolveDataPaths$1(opts) {
  const homeDirRaw = opts?.homeDir?.trim() || process.env[ENV_AGENT_HOME_DIR]?.trim() || getHomeDir();
  const homeDir = toAbsolute$1(homeDirRaw);
  const logDirRaw = opts?.logDir?.trim() || process.env[ENV_AGENT_LOG_DIR]?.trim() || getLogDir() || join(homeDir, DEFAULT_LOG_SUBDIR);
  const logDir = toAbsolute$1(logDirRaw);
  const portFileRaw = opts?.portFile?.trim() || process.env[ENV_AGENT_PORT_FILE]?.trim() || join(homeDir, DEFAULT_PORT_FILE_NAME);
  const portFile = toAbsolute$1(portFileRaw);
  const kbPortFileRaw = opts?.kbPortFile?.trim() || process.env[ENV_AGENT_KB_PORT_FILE]?.trim() || process.env[ENV_KB_PORT_FILE]?.trim() || join(getUserDataDir$2(), DEFAULT_KB_HOME_DIR_NAME, DEFAULT_KB_PORT_FILE_NAME);
  const kbPortFile = toAbsolute$1(kbPortFileRaw);
  return { homeDir, logDir, portFile, kbPortFile };
}
function ensureDataDirs$1(paths) {
  if (!existsSync(paths.homeDir)) {
    mkdirSync(paths.homeDir, { recursive: true });
  }
  if (!existsSync(paths.logDir)) {
    mkdirSync(paths.logDir, { recursive: true });
  }
  const portFileDir = resolve(paths.portFile, "..");
  if (!existsSync(portFileDir)) {
    mkdirSync(portFileDir, { recursive: true });
  }
}
function resolveExecutablePath$2(overridePath) {
  const tried = [];
  if (overridePath && overridePath.trim().length > 0) {
    tried.push(overridePath);
    if (existsSync(overridePath)) {
      ensureExecutable$1(overridePath);
      return { path: overridePath, source: "option", triedPaths: tried };
    }
    throw buildNotFoundError$2(
      tried,
      `opts.executablePath 指向的文件不存在: ${overridePath}`
    );
  }
  const envPath = process.env[ENV_AGENT_EXECUTABLE];
  if (envPath && envPath.trim().length > 0) {
    tried.push(envPath);
    if (existsSync(envPath)) {
      ensureExecutable$1(envPath);
      return { path: envPath, source: "env", triedPaths: tried };
    }
  }
  for (const candidate of buildDefaultCandidates$2()) {
    tried.push(candidate);
    if (existsSync(candidate)) {
      ensureExecutable$1(candidate);
      return { path: candidate, source: "default", triedPaths: tried };
    }
  }
  const pathHit = lookupInSystemPath$2(EXECUTABLE_NAME$1);
  if (pathHit) {
    tried.push(`PATH: ${pathHit}`);
    ensureExecutable$1(pathHit);
    return { path: pathHit, source: "path", triedPaths: tried };
  }
  throw buildNotFoundError$2(tried);
}
function buildDefaultCandidates$2() {
  const cwd = process.cwd();
  const candidates2 = [];
  const { resourcesPath } = process;
  if (resourcesPath) {
    try {
      const { app: app2 } = require2("electron");
      const componentsPath = join(app2.getPath("userData"), "components", "MarvisAgent", "Current", EXECUTABLE_NAME$1);
      candidates2.push(componentsPath);
    } catch {
    }
    candidates2.push(join(resourcesPath, "..", "Frameworks", "MarvisAgent.framework", "Versions", "Current", EXECUTABLE_NAME$1));
    candidates2.push(join(resourcesPath, "bin", "MarvisAgent.framework", "Versions", "Current", EXECUTABLE_NAME$1));
    candidates2.push(join(resourcesPath, "agent", "marvis_agent.dist", EXECUTABLE_NAME$1));
    candidates2.push(join(resourcesPath, "bin", EXECUTABLE_NAME$1));
  }
  candidates2.push(join(cwd, "resources", "agent", "marvis_agent.dist", EXECUTABLE_NAME$1));
  candidates2.push(join(cwd, "..", "agent-core", "marvis_agent.dist", EXECUTABLE_NAME$1));
  candidates2.push(join(cwd, "..", "marvis-agent", "marvis_agent.dist", EXECUTABLE_NAME$1));
  return candidates2;
}
function lookupInSystemPath$2(name) {
  try {
    const cmd = process.platform === "win32" ? `where ${name}` : `which ${name}`;
    const output = execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").trim();
    const firstLine = output.split("\n")[0]?.trim();
    if (firstLine && isAbsolute(firstLine) && existsSync(firstLine)) {
      return firstLine;
    }
  } catch {
  }
  return null;
}
function ensureExecutable$1(absPath) {
  if (process.platform === "win32") return;
  try {
    accessSync(absPath, constants.X_OK);
    return;
  } catch {
  }
  try {
    const st = statSync$1(absPath);
    const newMode = st.mode & 511 | 73;
    chmodSync(absPath, newMode);
    accessSync(absPath, constants.X_OK);
  } catch (err) {
    const msg = [
      `可执行文件缺少执行权限且自动修复失败: ${absPath}`,
      `原始错误: ${err.message}`,
      `请手动执行: chmod +x "${absPath}"`
    ].join("\n");
    throw new Error(msg);
  }
}
function buildNotFoundError$2(tried, summary) {
  const lines = [
    summary ?? `无法找到 ${EXECUTABLE_NAME$1} 可执行文件`,
    "已尝试的路径（按优先级）：",
    ...tried.map((p, i) => `  ${i + 1}. ${p}`),
    "",
    "请检查：",
    `  - 设置环境变量 ${ENV_AGENT_EXECUTABLE}=/path/to/${EXECUTABLE_NAME$1}`,
    `  - 或在项目根 .env 文件中配置 ${ENV_AGENT_EXECUTABLE}`,
    `  - 或将 Nuitka 产物放在 resources/agent/marvis_agent.dist/${EXECUTABLE_NAME$1}`
  ];
  return new Error(lines.join("\n"));
}
let logger$10 = null;
function getModuleLogger$d() {
  if (!logger$10) logger$10 = getLogger("agent-core:port-file");
  return logger$10;
}
function parsePortContent(content) {
  if (!content) return null;
  const match = content.match(/^\s*port\s*=\s*(\d+)\s*$/m);
  if (!match) return null;
  const port = parseInt(match[1], 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return null;
  }
  return port;
}
function readPortFileSync(portFile) {
  try {
    const raw = readFileSync$1(portFile, "utf8");
    return { port: parsePortContent(raw), rawContent: raw };
  } catch (err) {
    const e = err;
    if (e.code === "ENOENT") {
      return { port: null, rawContent: "" };
    }
    getModuleLogger$d().warn(`readPortFileSync 异常: ${e.message}`);
    return { port: null, rawContent: "" };
  }
}
async function readPortFileAsync(portFile) {
  try {
    const raw = await promises.readFile(portFile, "utf8");
    return { port: parsePortContent(raw), rawContent: raw };
  } catch (err) {
    const e = err;
    if (e.code === "ENOENT") {
      return { port: null, rawContent: "" };
    }
    getModuleLogger$d().warn(`readPortFileAsync 异常: ${e.message}`);
    return { port: null, rawContent: "" };
  }
}
function deleteIfExists(portFile) {
  try {
    if (existsSync(portFile)) {
      unlinkSync(portFile);
      getModuleLogger$d().debug(`清理老端口文件: ${portFile}`);
    }
  } catch (err) {
    getModuleLogger$d().warn(`删除端口文件失败: ${err.message}`);
  }
}
function watchPortFile(portFile, timeoutMs) {
  const log2 = getModuleLogger$d();
  let settled = false;
  const parentDir = dirname(portFile);
  let watcher = null;
  let pollTimer2 = null;
  let timeoutTimer = null;
  let resolveFn = () => {
  };
  let rejectFn = () => {
  };
  const cleanup = () => {
    if (watcher) {
      try {
        watcher.close();
      } catch {
      }
      watcher = null;
    }
    if (pollTimer2) {
      clearInterval(pollTimer2);
      pollTimer2 = null;
    }
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
  };
  const tryResolve = () => {
    if (settled) return;
    void readPortFileAsync(portFile).then((res) => {
      if (settled) return;
      if (res.port !== null) {
        settled = true;
        cleanup();
        log2.info(`端口文件就绪: ${portFile} → port=${res.port}`);
        resolveFn(res.port);
      }
    });
  };
  const promise = new Promise((resolve2, reject) => {
    resolveFn = resolve2;
    rejectFn = reject;
    const immediate = readPortFileSync(portFile);
    if (immediate.port !== null) {
      settled = true;
      log2.info(`端口文件已存在: ${portFile} → port=${immediate.port}`);
      resolve2(immediate.port);
      return;
    }
    try {
      watcher = watch(parentDir, { persistent: true }, (_event, _fname) => {
        tryResolve();
      });
      watcher.on("error", (err) => {
        log2.warn(`fs.watch 出错（继续依赖轮询兜底）: ${err.message}`);
      });
    } catch (err) {
      log2.warn(`fs.watch 挂载失败（降级为纯轮询）: ${err.message}`);
    }
    pollTimer2 = setInterval(tryResolve, PORT_FILE_POLL_INTERVAL_MS);
    pollTimer2.unref?.();
    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`等待端口文件就绪超时: ${portFile} (timeout=${timeoutMs}ms)`));
      }, timeoutMs);
      timeoutTimer.unref?.();
    }
  });
  const cancel = () => {
    if (settled) return;
    settled = true;
    cleanup();
    rejectFn(new Error("watchPortFile: cancelled"));
  };
  return { promise, cancel };
}
let cachedLogger$3 = null;
function log$e() {
  if (!cachedLogger$3) cachedLogger$3 = getLogger("agent-core:reaper");
  return cachedLogger$3;
}
const COMMAND_LOG_TRUNCATE = 180;
function truncateCommand(command) {
  if (command.length <= COMMAND_LOG_TRUNCATE) return command;
  return `${command.slice(0, COMMAND_LOG_TRUNCATE)}…(+${command.length - COMMAND_LOG_TRUNCATE}b)`;
}
function classifyAgentRole(command) {
  if (command.includes("multiprocessing.resource_tracker")) {
    return "mp.resource_tracker";
  }
  if (command.includes("multiprocessing.forkserver")) {
    return "mp.forkserver";
  }
  if (command.includes("--port_file=")) {
    return "main";
  }
  return "unknown";
}
function listProcessesViaPs() {
  if (process.platform === "win32") {
    return [];
  }
  const result = spawnSync("ps", ["-A", "-ww", "-o", "pid=,ppid=,command="], {
    encoding: "utf8",
    timeout: 3e3
  });
  if (result.status !== 0 || !result.stdout) {
    log$e().debug(`ps 列出进程失败: status=${result.status} err=${result.stderr ?? "(none)"}`);
    return [];
  }
  const entries2 = [];
  for (const rawLine of result.stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if (!match) continue;
    entries2.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      command: match[3]
    });
  }
  return entries2;
}
function isOrphanForHomeDir(entry, homeDir) {
  if (entry.pid === process.pid) return false;
  const exeToken = `/${EXECUTABLE_NAME$1}`;
  const hasExe = entry.command.includes(`${exeToken} `) || entry.command.endsWith(exeToken) || false;
  if (!hasExe) return false;
  const flag = `--home_dir=${homeDir}`;
  if (!entry.command.includes(flag)) return false;
  return true;
}
function snapshotAgentProcessTree(rootPid) {
  const entries2 = listProcessesViaPs();
  if (entries2.length === 0) return [];
  const exeToken = `/${EXECUTABLE_NAME$1}`;
  const isMarvisAgent = (cmd) => cmd.includes(`${exeToken} `) || cmd.endsWith(exeToken) || cmd.includes("multiprocessing.resource_tracker") || cmd.includes("multiprocessing.forkserver");
  const matched = entries2.filter((e) => isMarvisAgent(e.command));
  if (matched.length === 0) return [];
  let scope = matched;
  if (rootPid !== void 0) {
    const all = /* @__PURE__ */ new Map();
    const root = matched.find((e) => e.pid === rootPid);
    if (root) all.set(root.pid, root);
    for (let round = 0; round < 3; round += 1) {
      const currentPids = new Set(all.size > 0 ? all.keys() : [rootPid]);
      let grew = false;
      for (const e of entries2) {
        if (all.has(e.pid)) continue;
        if (currentPids.has(e.ppid) && isMarvisAgent(e.command)) {
          all.set(e.pid, e);
          grew = true;
        }
      }
      if (!grew) break;
    }
    scope = Array.from(all.values());
  }
  return scope.map((e) => ({
    pid: e.pid,
    ppid: e.ppid,
    role: classifyAgentRole(e.command),
    command: truncateCommand(e.command)
  })).sort((a, b) => a.pid - b.pid);
}
function formatAgentProcessTree(tree, rootPid) {
  if (tree.length === 0) {
    return rootPid !== void 0 ? `main=${rootPid}（ps 快照未命中，可能已退出或被 ps 竞争遗漏）` : "(empty)";
  }
  const mains = tree.filter((t) => t.role === "main");
  const others = tree.filter((t) => t.role !== "main");
  let mainPart;
  if (mains.length > 0) {
    mainPart = `main=${mains.map((m) => m.pid).join(",")}`;
  } else if (rootPid !== void 0) {
    mainPart = `main=${rootPid}(not-in-snapshot)`;
  } else {
    mainPart = "main=(none)";
  }
  if (others.length === 0) {
    return `${mainPart}, children=[]`;
  }
  const childPart = others.map((o) => `${o.pid}(${o.role},ppid=${o.ppid})`).join(", ");
  return `${mainPart}, children=[${childPart}]`;
}
function collectOrphans(entries2, homeDir) {
  const primary = entries2.filter((e) => isOrphanForHomeDir(e, homeDir));
  if (primary.length === 0) return [];
  const primaryPids = new Set(primary.map((e) => e.pid));
  const all = /* @__PURE__ */ new Map();
  for (const e of primary) all.set(e.pid, e);
  for (let round = 0; round < 2; round += 1) {
    const currentPids = new Set(all.keys());
    for (const e of entries2) {
      if (all.has(e.pid)) continue;
      if (currentPids.has(e.ppid)) {
        all.set(e.pid, e);
      }
    }
    if (all.size === currentPids.size) break;
  }
  const extras = [];
  for (const [pid, e] of all) {
    if (!primaryPids.has(pid)) extras.push(e);
  }
  return [...primary, ...extras];
}
function sendSignal(pids, signal) {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch (err) {
      const { code } = err;
      if (code === "ESRCH") continue;
      log$e().debug(`kill(${pid}, ${String(signal)}) 失败: ${err.message}`);
    }
  }
}
function isAlive$1(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const { code } = err;
    return code === "EPERM";
  }
}
function sleep$6(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}
async function reapOrphanAgents(homeDir) {
  if (!homeDir) return [];
  const entries2 = listProcessesViaPs();
  const orphans = collectOrphans(entries2, homeDir);
  const marvisTotal = entries2.filter((e) => e.command.includes(`/${EXECUTABLE_NAME$1} `) || e.command.endsWith(`/${EXECUTABLE_NAME$1}`) || e.command.includes("multiprocessing.resource_tracker") || e.command.includes("multiprocessing.forkserver")).length;
  log$e().info(`reaper 扫描完成：系统 MarvisAgent 相关进程=${marvisTotal}，本 homeDir 命中残留=${orphans.length}（home_dir=${homeDir}）`);
  if (orphans.length === 0) {
    return [];
  }
  log$e().warn(`检测到 ${orphans.length} 个 MarvisAgent 残留进程，开始清理：`);
  for (const o of orphans) {
    log$e().warn(`  - pid=${o.pid} ppid=${o.ppid} role=${classifyAgentRole(o.command)} cmd=${truncateCommand(o.command)}`);
  }
  const pids = orphans.map((e) => e.pid);
  sendSignal(pids, "SIGTERM");
  await sleep$6(500);
  const survivors = pids.filter((pid) => isAlive$1(pid));
  if (survivors.length > 0) {
    log$e().warn(`SIGTERM 后仍有 ${survivors.length} 个残留存活，发送 SIGKILL: [${survivors.join(", ")}]`);
    sendSignal(survivors, "SIGKILL");
    await sleep$6(300);
  }
  const stillAlive = pids.filter((pid) => isAlive$1(pid));
  if (stillAlive.length > 0) {
    log$e().error(`清理后仍有残留进程未终止（可能是僵尸进程或权限异常）: [${stillAlive.join(", ")}]`);
  } else {
    log$e().info(`MarvisAgent 残留进程已全部清理: [${pids.join(", ")}]`);
  }
  await sleep$6(200);
  return pids;
}
let logger$$ = null;
function log$d() {
  if (!logger$$) logger$$ = getLogger("agent-core:tcp-probe");
  return logger$$;
}
function probeOnce(host, port, attemptTimeoutMs) {
  return new Promise((resolve2) => {
    let settled = false;
    const socket = createConnection({ host, port });
    const done = (ok2) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
      }
      resolve2(ok2);
    };
    socket.setTimeout(attemptTimeoutMs);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });
}
async function waitForTcpReady(host, port, timeoutMs, intervalMs2 = 200, attemptTimeoutMs = 500) {
  const start2 = Date.now();
  let attempt = 0;
  let lastReason = null;
  while (true) {
    attempt += 1;
    const ok2 = await probeOnce(host, port, attemptTimeoutMs);
    const elapsed = Date.now() - start2;
    if (ok2) {
      log$d().info(`TCP 握手成功: ${host}:${port} (attempt=${attempt}, elapsed=${elapsed}ms)`);
      return;
    }
    lastReason = `attempt=${attempt} failed`;
    if (elapsed >= timeoutMs) {
      throw new Error(`等待 TCP 服务就绪超时: ${host}:${port} (timeout=${timeoutMs}ms, attempts=${attempt}, lastReason=${lastReason})`);
    }
    const remaining = timeoutMs - elapsed;
    const wait = Math.min(intervalMs2, remaining);
    await new Promise((resolve2) => setTimeout(resolve2, wait));
  }
}
const PROTOCOL_VERSION$1 = "1.0";
const MAX_LINE_LENGTH$1 = 1048576;
function defaultSocketPath() {
  try {
    const { app: app2 } = require2("electron");
    return join(app2.getPath("userData"), "ipc", "marvis-gateway.sock");
  } catch {
    const uid = process.getuid?.() ?? 0;
    return `/tmp/marvis-gateway-${uid}.sock`;
  }
}
const DEFAULT_CLIENT_VERSION = "1.0.0";
const GATEWAY_NNG_IPC_MOD_ID = "gateway_nng_ipc";
const GATEWAY_NNG_IPC_MOD_NAME = "网关 NNG IPC";
const GATEWAY_NNG_IPC_REPORT_EVENTS = {
  /** IPC server 启动成功 */
  SERVER_STARTED: "gateway_nng_ipc__server_started",
  /** IPC server 启动失败（严重错误，实时上报） */
  SERVER_START_FAILED: "gateway_nng_ipc__server_start_failed",
  /** base.init 握手完成 */
  BASE_INIT_RECEIVED: "gateway_nng_ipc__base_init_received",
  /** 连接断开 */
  DISCONNECTED: "gateway_nng_ipc__disconnected",
  /** IPC 消息发送失败 */
  SEND_FAILED: "gateway_nng_ipc__send_failed",
  /** 等待 init 超时（严重错误，实时上报） */
  WAIT_INIT_TIMEOUT: "gateway_nng_ipc__wait_init_timeout"
};
const state$a = {
  server: null,
  socket: null,
  socketPath: null,
  logger: null,
  onLine: null,
  onConnect: null,
  onDisconnect: null
};
function getModuleLogger$c() {
  if (!state$a.logger) {
    state$a.logger = getLogger("gateway-nng-ipc");
  }
  return state$a.logger;
}
async function start$1(socketPath, handlers2) {
  const log2 = getModuleLogger$c();
  if (state$a.server) {
    throw new Error("transport 已启动，请先 stop()");
  }
  try {
    mkdirSync(dirname(socketPath), { recursive: true });
  } catch {
  }
  await removeSocketIfExists$1(socketPath);
  state$a.onLine = handlers2.onLine;
  state$a.onConnect = handlers2.onConnect ?? null;
  state$a.onDisconnect = handlers2.onDisconnect ?? null;
  state$a.socketPath = socketPath;
  return new Promise((resolve2, reject) => {
    const server = createServer((socket) => handleNewSocket$1(socket));
    server.once("error", (err) => {
      log2.error(`UDS listener 启动失败: ${err.message}`);
      reject(err);
    });
    server.listen(socketPath, () => {
      state$a.server = server;
      try {
        chmodSync(socketPath, 384);
      } catch {
      }
      log2.info(`UDS listener 已就绪: ${socketPath}`);
      resolve2();
    });
  });
}
async function stop() {
  const log2 = getModuleLogger$c();
  if (state$a.socket) {
    try {
      state$a.socket.destroy();
    } catch {
    }
    state$a.socket = null;
  }
  if (state$a.server) {
    await new Promise((resolve2) => {
      state$a.server.close(() => resolve2());
    });
    state$a.server = null;
  }
  if (state$a.socketPath) {
    await removeSocketIfExists$1(state$a.socketPath);
    state$a.socketPath = null;
  }
  log2.info("UDS listener 已关闭");
}
function sendLine$2(line) {
  const log2 = getModuleLogger$c();
  if (!state$a.socket || state$a.socket.destroyed) {
    log2.warn("sendLine 失败：当前无活跃连接");
    return false;
  }
  const payload = line.endsWith("\n") ? line : `${line}
`;
  return state$a.socket.write(payload);
}
function isConnected$1() {
  return state$a.socket !== null && !state$a.socket.destroyed;
}
function handleNewSocket$1(socket) {
  const log2 = getModuleLogger$c();
  if (state$a.socket && !state$a.socket.destroyed) {
    log2.warn("新连接到达，销毁旧连接");
    state$a.socket.destroy();
  }
  state$a.socket = socket;
  log2.info(`新 IPC 连接: remoteAddress=${socket.remoteAddress ?? "unix"}`);
  if (state$a.onConnect) {
    try {
      state$a.onConnect();
    } catch (err) {
      log2.warn(`onConnect 回调异常: ${err.message}`);
    }
  }
  attachLineReader$2(socket);
  socket.on("close", () => {
    log2.info("IPC 连接已关闭");
    if (state$a.socket === socket) {
      state$a.socket = null;
    }
    if (state$a.onDisconnect) {
      try {
        state$a.onDisconnect();
      } catch (err) {
        log2.warn(`onDisconnect 回调异常: ${err.message}`);
      }
    }
  });
  socket.on("error", (err) => {
    log2.warn(`IPC socket error: ${err.message}`);
  });
}
function attachLineReader$2(socket) {
  const log2 = getModuleLogger$c();
  let buffer = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffer += chunk;
    if (buffer.length > MAX_LINE_LENGTH$1) {
      log2.warn(`单行超过最大长度 ${MAX_LINE_LENGTH$1}，关闭连接`);
      socket.destroy();
      return;
    }
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, "");
      buffer = buffer.slice(idx + 1);
      if (line.length === 0) continue;
      if (state$a.onLine) {
        try {
          state$a.onLine(line);
        } catch (err) {
          log2.warn(`onLine 回调异常: ${err.message}`);
        }
      }
    }
  });
}
function removeSocketIfExists$1(path2) {
  return new Promise((resolve2) => {
    unlink(path2, () => resolve2());
  });
}
const state$9 = {
  started: false,
  socketPath: null,
  logger: null,
  initHandler: null,
  disconnectHandlers: /* @__PURE__ */ new Set(),
  connectHandlers: /* @__PURE__ */ new Set(),
  lastInitParams: null,
  initWaiters: [],
  portUpdateHandlers: /* @__PURE__ */ new Set(),
  clientVersion: DEFAULT_CLIENT_VERSION,
  // guid 由 `device-guid` 模块异步解析，首次 handleBaseInit 时 await getDeviceGuid() 填充，
  // 并写回 state.guid 缓存；空串仅出现在模块刚加载、还未收到 base.init 的窗口期。
  guid: "",
  routes: /* @__PURE__ */ new Map(),
  pendingRequests: /* @__PURE__ */ new Map()
};
function getModuleLogger$b() {
  if (!state$9.logger) {
    state$9.logger = getLogger("gateway-nng-ipc");
  }
  return state$9.logger;
}
async function startIpcServer(socketPath) {
  const log2 = getModuleLogger$b();
  if (state$9.started) {
    log2.warn(`startIpcServer 已启动过 (${state$9.socketPath})，跳过`);
    return;
  }
  try {
    await start$1(socketPath, {
      onLine: handleInboundLine$2,
      onConnect: () => {
        log2.info("网关 dialer 已接入");
        for (const handler of state$9.connectHandlers) {
          try {
            handler();
          } catch (err) {
            log2.warn(`connect 回调异常: ${err.message}`);
          }
        }
      },
      onDisconnect: () => {
        state$9.lastInitParams = null;
        log2.info("网关 dialer 已断开");
        void reportBeaconEvent(GATEWAY_NNG_IPC_REPORT_EVENTS.DISCONNECTED, {
          mod_id: GATEWAY_NNG_IPC_MOD_ID,
          mod_name: GATEWAY_NNG_IPC_MOD_NAME,
          socket_path: socketPath
        });
        for (const handler of state$9.disconnectHandlers) {
          try {
            handler();
          } catch (err) {
            log2.warn(`disconnect 回调异常: ${err.message}`);
          }
        }
      }
    });
  } catch (err) {
    void reportBeaconRealtimeEvent(GATEWAY_NNG_IPC_REPORT_EVENTS.SERVER_START_FAILED, {
      mod_id: GATEWAY_NNG_IPC_MOD_ID,
      mod_name: GATEWAY_NNG_IPC_MOD_NAME,
      socket_path: socketPath,
      reason: String(err.message)
    });
    throw err;
  }
  state$9.started = true;
  state$9.socketPath = socketPath;
  log2.info(`IPC server 就绪: ${socketPath}`);
  void reportBeaconEvent(GATEWAY_NNG_IPC_REPORT_EVENTS.SERVER_STARTED, {
    mod_id: GATEWAY_NNG_IPC_MOD_ID,
    mod_name: GATEWAY_NNG_IPC_MOD_NAME,
    socket_path: socketPath
  });
}
async function stopIpcServer() {
  if (!state$9.started) return;
  await stop();
  state$9.started = false;
  state$9.socketPath = null;
  state$9.lastInitParams = null;
  const waiters = state$9.initWaiters.splice(0);
  for (const w of waiters) {
    try {
      w({ token: "", port: 0, gateway_version: "" });
    } catch {
    }
  }
}
function isConnected() {
  return isConnected$1();
}
function onDisconnect(handler) {
  state$9.disconnectHandlers.add(handler);
  return () => state$9.disconnectHandlers.delete(handler);
}
function onConnect(handler) {
  state$9.connectHandlers.add(handler);
  return () => state$9.connectHandlers.delete(handler);
}
function onGatewayPortUpdated(handler) {
  state$9.portUpdateHandlers.add(handler);
  return () => state$9.portUpdateHandlers.delete(handler);
}
function registerRoute(namespace, method, handler) {
  const log2 = getModuleLogger$b();
  const route = `${namespace}.${method}`;
  if (route === "base.init" || route === "base.heartbeat") {
    throw new Error(`framework route cannot be overridden: ${route}`);
  }
  if (state$9.routes.has(route)) {
    log2.warn(`route already registered, will be overridden: ${route}`);
  }
  state$9.routes.set(route, handler);
  return () => {
    const current = state$9.routes.get(route);
    if (current === handler) state$9.routes.delete(route);
  };
}
function unregisterRoute(namespace, method) {
  state$9.routes.delete(`${namespace}.${method}`);
}
function sendMessage(namespace, method, params, callbackId) {
  if (!isConnected$1()) {
    getModuleLogger$b().debug(`sendMessage dropped (not connected): ${namespace}.${method}`);
    return false;
  }
  const msg = {
    type: "send",
    protocalVersion: PROTOCOL_VERSION$1,
    callbackId: callbackId ?? `notify-${randomUUID()}`,
    namespace,
    method,
    params: params ?? {}
  };
  const ok2 = sendLine$2(JSON.stringify(msg));
  if (!ok2) {
    getModuleLogger$b().warn(`sendMessage failed to write: ${namespace}.${method}`);
    void reportBeaconEvent(GATEWAY_NNG_IPC_REPORT_EVENTS.SEND_FAILED, {
      mod_id: GATEWAY_NNG_IPC_MOD_ID,
      mod_name: GATEWAY_NNG_IPC_MOD_NAME,
      namespace,
      method
    });
  }
  return ok2;
}
function sendRequest(namespace, method, params, timeoutMs = 33e4) {
  const log2 = getModuleLogger$b();
  if (!isConnected$1()) {
    return Promise.reject(new Error(`sendRequest: not connected (${namespace}.${method})`));
  }
  const callbackId = `req-${namespace}-${method}-${randomUUID()}`;
  const msg = {
    type: "send",
    protocalVersion: PROTOCOL_VERSION$1,
    callbackId,
    namespace,
    method,
    params: params ?? {}
  };
  return new Promise((resolve2, reject) => {
    let done = false;
    const timer2 = setTimeout(() => {
      if (done) return;
      done = true;
      state$9.pendingRequests.delete(callbackId);
      reject(new Error(`sendRequest: timeout (${timeoutMs}ms) waiting for ${namespace}.${method} ack`));
    }, timeoutMs);
    state$9.pendingRequests.set(callbackId, (ackParams) => {
      if (done) return;
      done = true;
      clearTimeout(timer2);
      resolve2(ackParams);
    });
    const ok2 = sendLine$2(JSON.stringify(msg));
    if (!ok2) {
      if (!done) {
        done = true;
        clearTimeout(timer2);
        state$9.pendingRequests.delete(callbackId);
        reject(new Error(`sendRequest: failed to send ${namespace}.${method}`));
      }
    } else {
      log2.debug(`sendRequest sent: ${namespace}.${method} callbackId=${callbackId}`);
    }
  });
}
function waitForInit(timeoutMs) {
  if (state$9.lastInitParams) {
    return Promise.resolve(state$9.lastInitParams);
  }
  return new Promise((resolve2, reject) => {
    let done = false;
    const timer2 = setTimeout(() => {
      if (done) return;
      done = true;
      const idx = state$9.initWaiters.indexOf(wrapped);
      if (idx >= 0) state$9.initWaiters.splice(idx, 1);
      void reportBeaconRealtimeEvent(GATEWAY_NNG_IPC_REPORT_EVENTS.WAIT_INIT_TIMEOUT, {
        mod_id: GATEWAY_NNG_IPC_MOD_ID,
        mod_name: GATEWAY_NNG_IPC_MOD_NAME,
        timeout_ms: String(timeoutMs)
      });
      reject(new Error(`waitForInit: 超时（${timeoutMs}ms）未收到 base.init`));
    }, timeoutMs);
    const wrapped = (params) => {
      if (done) return;
      done = true;
      clearTimeout(timer2);
      if (params.port === 0 && params.token === "" && params.gateway_version === "") {
        reject(new Error("waitForInit: server stopped"));
        return;
      }
      resolve2(params);
    };
    state$9.initWaiters.push(wrapped);
  });
}
function handleInboundLine$2(line) {
  const log2 = getModuleLogger$b();
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (err) {
    log2.warn(`入站消息 JSON 解析失败: ${err.message}，原文: ${line.slice(0, 200)}`);
    return;
  }
  if (msg.type !== "send") {
    if (msg.type === "ack" && msg.callbackId) {
      const resolver = state$9.pendingRequests.get(msg.callbackId);
      if (resolver) {
        state$9.pendingRequests.delete(msg.callbackId);
        resolver(msg.params ?? {});
        return;
      }
    }
    log2.debug(`忽略非 send 消息: type=${msg.type} namespace=${msg.namespace} method=${msg.method}`);
    return;
  }
  const route = `${msg.namespace}.${msg.method}`;
  if (route === "base.init") {
    void handleBaseInit$1(msg);
    return;
  }
  if (route === "base.heartbeat") {
    handleBaseHeartbeat$1(msg);
    return;
  }
  const handler = state$9.routes.get(route);
  if (handler) {
    void dispatchRoute(route, handler, msg);
    return;
  }
  log2.debug(`未知路由，忽略: ${route}`);
}
async function dispatchRoute(route, handler, msg) {
  const log2 = getModuleLogger$b();
  try {
    const ackParams = await handler(msg.params ?? {}, msg);
    const ackMsg = {
      type: "ack",
      protocalVersion: PROTOCOL_VERSION$1,
      callbackId: msg.callbackId,
      namespace: msg.namespace,
      method: msg.method,
      params: ackParams ?? {}
    };
    const sent = sendLine$2(JSON.stringify(ackMsg));
    if (!sent) {
      log2.warn(`${route} ack 发送失败（连接已断开）`);
    }
  } catch (err) {
    log2.warn(`${route} handler 抛错: ${err.message}`);
  }
}
async function handleBaseInit$1(msg) {
  const log2 = getModuleLogger$b();
  const params = msg.params;
  if (!params || typeof params.port !== "number" || typeof params.token !== "string") {
    log2.warn(`base.init params 非法: ${JSON.stringify(msg.params)}`);
    return;
  }
  log2.info(`收到 base.init: port=${params.port} gateway_version=${params.gateway_version} token=${maskToken(params.token)}`);
  state$9.lastInitParams = params;
  void reportBeaconEvent(GATEWAY_NNG_IPC_REPORT_EVENTS.BASE_INIT_RECEIVED, {
    mod_id: GATEWAY_NNG_IPC_MOD_ID,
    mod_name: GATEWAY_NNG_IPC_MOD_NAME,
    port: String(params.port),
    gateway_version: String(params.gateway_version)
  });
  const waiters = state$9.initWaiters.splice(0);
  for (const w of waiters) {
    try {
      w(params);
    } catch (err) {
      log2.warn(`initWaiter 回调异常: ${err.message}`);
    }
  }
  for (const handler of state$9.portUpdateHandlers) {
    try {
      handler(params);
    } catch (err) {
      log2.warn(`portUpdateHandler 回调异常: ${err.message}`);
    }
  }
  let ackParams;
  try {
    if (state$9.initHandler) ;
    else {
      ackParams = await defaultInitAck();
    }
  } catch (err) {
    log2.error(`base.init handler 抛错: ${err.message}，使用默认 ack`);
    ackParams = await defaultInitAck();
  }
  const ackMsg = {
    type: "ack",
    protocalVersion: PROTOCOL_VERSION$1,
    callbackId: msg.callbackId,
    namespace: "base",
    method: "init",
    params: ackParams
  };
  const sent = sendLine$2(JSON.stringify(ackMsg));
  if (!sent) {
    log2.warn("base.init ack 发送失败");
  } else {
    log2.info(`已回 base.init ack: guid=${ackParams.guid} client_version=${ackParams.client_version}`);
  }
}
function handleBaseHeartbeat$1(msg) {
  const ackMsg = {
    type: "ack",
    protocalVersion: PROTOCOL_VERSION$1,
    callbackId: msg.callbackId,
    namespace: "base",
    method: "heartbeat"
  };
  sendLine$2(JSON.stringify(ackMsg));
}
async function defaultInitAck() {
  if (state$9.guid.length === 0) {
    state$9.guid = await getDeviceGuid();
  }
  return {
    guid: state$9.guid,
    client_version: state$9.clientVersion
  };
}
function maskToken(token) {
  if (token.length <= 8) return "***";
  return `${token.slice(0, 4)}***${token.slice(-4)}`;
}
function setClientVersion(version) {
  state$9.clientVersion = version;
}
function createAgentNotifier() {
  let logger2 = null;
  const log2 = () => {
    if (!logger2) logger2 = getLogger("agent-notifier");
    return logger2;
  };
  let pendingPort = 0;
  let notifiedPort = 0;
  let pollTimer2 = null;
  let pollAttempts = 0;
  let disposeOnConnect = null;
  let disposeOnDisconnect = null;
  let stopped = false;
  const clearPoll = () => {
    if (pollTimer2) {
      clearInterval(pollTimer2);
      pollTimer2 = null;
      pollAttempts = 0;
    }
  };
  const doNotify = (port) => {
    if (port <= 0) {
      log2().warn(`doNotify 忽略非法 port=${port}`);
      return false;
    }
    if (!isConnected()) {
      log2().debug(`doNotify: 网关 IPC 未连接，跳过（port=${port}）`);
      return false;
    }
    const ok2 = sendMessage("agent", "onLaunch", { port });
    if (ok2) {
      log2().info(`agent.onLaunch 已发送: port=${port}`);
    } else {
      log2().warn(`agent.onLaunch 发送失败（socket 不可写）: port=${port}`);
    }
    return ok2;
  };
  const startPolling2 = () => {
    if (pollTimer2) return;
    pollAttempts = 0;
    log2().info(`启动 agent.onLaunch 轮询: interval=${NOTIFIER_RETRY_INTERVAL_MS}ms max=${NOTIFIER_MAX_ATTEMPTS}`);
    pollTimer2 = setInterval(() => {
      if (stopped) {
        clearPoll();
        return;
      }
      pollAttempts += 1;
      if (notifiedPort === pendingPort && pendingPort > 0) {
        clearPoll();
        return;
      }
      if (pendingPort <= 0) {
        clearPoll();
        return;
      }
      log2().debug(`agent.onLaunch 重试 (${pollAttempts}/${NOTIFIER_MAX_ATTEMPTS}) port=${pendingPort}`);
      if (doNotify(pendingPort)) {
        notifiedPort = pendingPort;
        clearPoll();
        return;
      }
      if (pollAttempts >= NOTIFIER_MAX_ATTEMPTS) {
        log2().warn(`agent.onLaunch 轮询失败，已达最大次数 ${NOTIFIER_MAX_ATTEMPTS}，停止重试（等待网关重连）`);
        clearPoll();
      }
    }, NOTIFIER_RETRY_INTERVAL_MS);
    pollTimer2.unref?.();
  };
  const ensureOnConnectSubscribed = () => {
    if (disposeOnConnect) return;
    disposeOnDisconnect = onDisconnect(() => {
      if (stopped) return;
      if (notifiedPort > 0) {
        log2().debug(`网关断开，清零 notifiedPort（原值=${notifiedPort}），等待重连后重推`);
        notifiedPort = 0;
      }
    });
    disposeOnConnect = onConnect(() => {
      if (stopped) return;
      if (pendingPort > 0 && notifiedPort !== pendingPort) {
        log2().info(`网关重连，重推 agent.onLaunch port=${pendingPort}`);
        if (doNotify(pendingPort)) {
          notifiedPort = pendingPort;
          clearPoll();
        }
      }
    });
  };
  return {
    tryNotify(port) {
      if (stopped) {
        log2().warn("tryNotify 被忽略：notifier 已停止");
        return false;
      }
      if (port <= 0 || port > 65535) {
        log2().warn(`tryNotify 忽略非法 port=${port}`);
        return false;
      }
      ensureOnConnectSubscribed();
      if (pendingPort !== port) {
        pendingPort = port;
        notifiedPort = 0;
        clearPoll();
      }
      if (notifiedPort === port) {
        return true;
      }
      if (doNotify(port)) {
        notifiedPort = port;
        return true;
      }
      startPolling2();
      return false;
    },
    reset() {
      log2().debug(`reset notifier: pending=${pendingPort} notified=${notifiedPort}`);
      pendingPort = 0;
      notifiedPort = 0;
      clearPoll();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearPoll();
      if (disposeOnConnect) {
        try {
          disposeOnConnect();
        } catch {
        }
        disposeOnConnect = null;
      }
      if (disposeOnDisconnect) {
        try {
          disposeOnDisconnect();
        } catch {
        }
        disposeOnDisconnect = null;
      }
      pendingPort = 0;
      notifiedPort = 0;
      log2().info("agent-notifier 已停止");
    },
    getNotifiedPort() {
      return notifiedPort;
    }
  };
}
let logger$_ = null;
function log$c() {
  if (!logger$_) logger$_ = getLogger("agent-core");
  return logger$_;
}
const state$8 = {
  current: null,
  notifier: null,
  statusHandlers: /* @__PURE__ */ new Set(),
  disposeLoginSub: null,
  disposeProcSub: null,
  pendingStopReason: null,
  starting: false,
  stopping: false,
  restarting: false,
  deferredOpts: null,
  deferredPolicy: null,
  portWatchCancel: null,
  autoRestartInFlight: false
};
function emitStatus(ev) {
  for (const h of state$8.statusHandlers) {
    try {
      h(ev);
    } catch (err) {
      log$c().warn(`status 订阅者抛出异常: ${err.message}`);
    }
  }
}
function resolveUserId(opts) {
  if (opts?.userId && opts.userId.trim().length > 0) {
    return opts.userId.trim();
  }
  const info = getUserInfo$1();
  return info.main?.openId ?? "";
}
function resolveWorkMode(opts) {
  const fromOpts = opts?.workMode;
  if (fromOpts === "cloud" || fromOpts === "local" || fromOpts === "lite") {
    return fromOpts;
  }
  const envVal = process.env[ENV_AGENT_WORK_MODE];
  if (envVal === "cloud" || envVal === "local" || envVal === "lite") {
    return envVal;
  }
  return DEFAULT_WORK_MODE;
}
function resolvePortHint(opts) {
  const candidates2 = [
    { src: "opts.port", val: opts?.port },
    { src: `env.${ENV_AGENT_PORT}`, val: process.env[ENV_AGENT_PORT] }
  ];
  for (const { src, val } of candidates2) {
    if (val === void 0 || val === null || val === "") continue;
    const n = typeof val === "number" ? val : Number(val);
    if (Number.isInteger(n) && n >= 1 && n <= 65535) {
      return n;
    }
    log$c().warn(`${src}='${String(val)}' 不是合法端口（1~65535），忽略`);
  }
  return void 0;
}
function ensureLoginSubscription() {
  if (state$8.disposeLoginSub) return;
  state$8.disposeLoginSub = onEvent((ev) => {
    if (ev.eventName === "login") {
      const openId = ev.userInfo.main?.openId ?? "";
      log$c().info(`[login-event] login: openId=${openId}`);
      if (state$8.current && state$8.current.userId !== openId) {
        log$c().info(`[login-event] openId 变更（${state$8.current.userId || "(default)"} → ${openId}），仅更新内存 userId（不重启 Agent，账号切换由 Gateway user.login 完成）`);
        state$8.current.userId = openId;
      }
    } else if (ev.eventName === "logout") {
      if (state$8.current?.userId) {
        log$c().info("[login-event] logout → 仅清理内存 userId（不重启 Agent，user.logout 由 Gateway 下发）");
        state$8.current.userId = "";
      }
    }
  });
}
function ensureProcSubscription$1() {
  if (state$8.disposeProcSub) return;
  state$8.disposeProcSub = onProcessEvent((ev) => {
    if (ev.name !== AGENT_PROCESS_NAME) return;
    switch (ev.type) {
      case "stderr":
        log$c().warn(`[agent-core stderr] ${ev.line}`);
        break;
      case "stdout":
        log$c().debug(`[agent-core stdout] ${ev.line}`);
        break;
      case "exit": {
        const reason = state$8.pendingStopReason ?? "error";
        const prevPort = state$8.current?.port ?? 0;
        log$c().info(`AgentCore 退出: code=${ev.code ?? "null"} signal=${ev.signal ?? "null"} reason=${reason}`);
        if (state$8.pendingStopReason === null) {
          unregisterPort("agent-core");
          if (state$8.current) {
            state$8.current = {
              ...state$8.current,
              port: 0
            };
            state$8.autoRestartInFlight = true;
          }
          emitStatus({
            status: "stopped",
            reason: "error",
            exitCode: ev.code,
            port: prevPort
          });
        }
        break;
      }
      case "stopped": {
        const reason = state$8.pendingStopReason ?? "shutdown";
        const prevPort = state$8.current?.port ?? 0;
        log$c().info(`AgentCore 已主动停止 (reason=${reason})`);
        unregisterPort("agent-core");
        state$8.notifier?.stop();
        state$8.notifier = null;
        state$8.current = null;
        state$8.autoRestartInFlight = false;
        emitStatus({
          status: "stopped",
          reason,
          exitCode: null,
          port: prevPort
        });
        state$8.pendingStopReason = null;
        break;
      }
      case "circuit-open":
        log$c().error(`AgentCore 熔断：${ev.reason}`);
        unregisterPort("agent-core");
        state$8.notifier?.stop();
        state$8.notifier = null;
        state$8.current = null;
        state$8.autoRestartInFlight = false;
        emitStatus({
          status: "stopped",
          reason: "error",
          exitCode: null,
          port: 0
        });
        break;
      case "spawned":
        log$c().info(`AgentCore spawned: pid=${ev.pid}`);
        if (state$8.autoRestartInFlight && !state$8.starting) {
          void syncAgentAfterAutoRestart();
        }
        break;
    }
  });
}
async function syncAgentAfterAutoRestart() {
  if (state$8.portWatchCancel) return;
  const snapshot2 = state$8.current;
  if (!snapshot2) {
    return;
  }
  deleteIfExists(snapshot2.portFile);
  const watch2 = watchPortFile(snapshot2.portFile, DEFAULT_PORT_READY_TIMEOUT_MS);
  state$8.portWatchCancel = watch2.cancel;
  let port;
  try {
    port = await watch2.promise;
  } catch (err) {
    log$c().warn(`[auto-restart] 新端口就绪超时: ${err.message}`);
    reportBeaconEvent(AGENT_CORE_REPORT_EVENTS.AUTO_RESTART_PORT_TIMEOUT, {
      mod_id: AGENT_CORE_MOD_ID,
      mod_name: AGENT_CORE_MOD_NAME,
      error_msg: err.message ?? ""
    });
    state$8.portWatchCancel = null;
    return;
  } finally {
    if (state$8.portWatchCancel === watch2.cancel) {
      state$8.portWatchCancel = null;
    }
  }
  if (!state$8.current) {
    log$c().info("[auto-restart] 等待端口期间 state 已被清理，放弃本轮同步");
    return;
  }
  try {
    await waitForTcpReady(
      "127.0.0.1",
      port,
      DEFAULT_TCP_READY_TIMEOUT_MS,
      TCP_PROBE_INTERVAL_MS,
      TCP_PROBE_ATTEMPT_TIMEOUT_MS
    );
  } catch (err) {
    log$c().warn(`[auto-restart] TCP 握手失败，放弃本轮同步: ${err.message}`);
    reportBeaconEvent(AGENT_CORE_REPORT_EVENTS.AUTO_RESTART_TCP_FAILED, {
      mod_id: AGENT_CORE_MOD_ID,
      mod_name: AGENT_CORE_MOD_NAME,
      error_msg: err.message ?? "",
      port: String(port)
    });
    return;
  }
  if (!state$8.current) {
    log$c().info("[auto-restart] TCP 握手期间 state 已被清理，放弃本轮同步");
    return;
  }
  state$8.current = { ...state$8.current, port };
  registerPort({
    name: "agent-core",
    host: "127.0.0.1",
    port,
    registeredAt: Date.now()
  });
  if (!state$8.notifier) {
    state$8.notifier = createAgentNotifier();
  }
  state$8.notifier.tryNotify(port);
  emitStatus({ status: "started", port });
  state$8.autoRestartInFlight = false;
  reportBeaconEvent(AGENT_CORE_REPORT_EVENTS.AUTO_RESTART_SYNC_SUCCESS, {
    mod_id: AGENT_CORE_MOD_ID,
    mod_name: AGENT_CORE_MOD_NAME,
    port: String(port)
  });
  log$c().info(`[auto-restart] AgentCore 新端口已同步: port=${port}`);
}
function buildAgentArgs(params) {
  const args = [
    `--port_file=${params.portFile}`,
    `--log_dir=${params.logDir}`,
    `--home_dir=${params.homeDir}`,
    `--work_mode=${params.workMode}`
  ];
  args.push(`--kb_port_file=${params.kbPortFile}`);
  if (params.userId && params.userId.length > 0) {
    args.push(`--user_id=${params.userId}`);
  }
  if (params.port !== void 0) {
    args.push(`--port=${params.port}`);
  }
  if (params.localLlmPort !== void 0 && params.localLlmPort > 0) {
    args.push(`--local_llm_port=${params.localLlmPort}`);
  }
  return args;
}
async function startAgent(opts, restartPolicy) {
  ensureLoginSubscription();
  ensureProcSubscription$1();
  if (state$8.starting) {
    throw new Error("AgentCore 正在启动中，请稍后重试");
  }
  if (state$8.current || getHandle(AGENT_PROCESS_NAME)) {
    throw new Error("AgentCore 已启动，请先调用 stopAgent()");
  }
  const userId = resolveUserId(opts);
  if (!userId) {
    log$c().info("AgentCore 启动：未登录，使用默认 user_id（_DEFAULT_USER）");
  }
  state$8.starting = true;
  try {
    const execResult = resolveExecutablePath$2(opts?.executablePath);
    log$c().info(`MarvisAgent 路径命中(${execResult.source}): ${execResult.path}`);
    const paths = resolveDataPaths$1(opts);
    ensureDataDirs$1(paths);
    log$c().info(`数据路径: home_dir=${paths.homeDir} log_dir=${paths.logDir} port_file=${paths.portFile} kb_port_file=${paths.kbPortFile}`);
    try {
      await reapOrphanAgents(paths.homeDir);
    } catch (err) {
      log$c().warn(`reapOrphanAgents 异常（忽略，继续启动）: ${err.message}`);
      reportBeaconEvent(AGENT_CORE_REPORT_EVENTS.REAPER_ERROR, {
        mod_id: AGENT_CORE_MOD_ID,
        mod_name: AGENT_CORE_MOD_NAME,
        error_msg: err.message ?? "",
        phase: "start"
      });
    }
    deleteIfExists(paths.portFile);
    const timeoutMs = opts?.portReadyTimeoutMs ?? DEFAULT_PORT_READY_TIMEOUT_MS;
    const watch2 = watchPortFile(paths.portFile, timeoutMs);
    state$8.portWatchCancel = watch2.cancel;
    const workMode = resolveWorkMode(opts);
    const portHint = resolvePortHint(opts);
    const localLlmPort = opts?.localLlmPort;
    if (portHint !== void 0) {
      log$c().info(`AgentCore 指定启动端口：--port=${portHint}（来源：opts/env）`);
    }
    if (localLlmPort !== void 0 && localLlmPort > 0) {
      log$c().info(`AgentCore 指定本地 LLM 端口：--local_llm_port=${localLlmPort}`);
    }
    const args = buildAgentArgs({
      portFile: paths.portFile,
      kbPortFile: paths.kbPortFile,
      logDir: paths.logDir,
      homeDir: paths.homeDir,
      workMode,
      userId,
      port: portHint,
      localLlmPort
    });
    const policy = {
      ...DEFAULT_AGENT_RESTART_POLICY,
      ...restartPolicy
    };
    log$c().info(`启动 AgentCore: ${execResult.path} ${args.join(" ")}`);
    markSubprocessSpawn("agent");
    try {
      spawnManaged(
        {
          name: AGENT_PROCESS_NAME,
          executable: execResult.path,
          args,
          // PYTHONUNBUFFERED=1：强制 Python 侧 stdout/stderr 不缓冲，
          // 让 Sanic/uvloop 启动阶段的异常堆栈能被 process-manager 实时
          // 按行捕获并通过 logger 打到 main.log，而不是等到子进程退出
          // 才 flush 出来（这会让排查 Agent 启动失败极为困难）。
          env: { PYTHONUNBUFFERED: "1", ...getBeaconEnv() },
          healthyAfterMs: DEFAULT_AGENT_HEALTHY_AFTER_MS
        },
        policy
      );
    } catch (err) {
      markSubprocessReady("agent", "error", err.message ?? "");
      reportBeaconRealtimeEvent(AGENT_CORE_REPORT_EVENTS.SPAWN_FAILED, {
        mod_id: AGENT_CORE_MOD_ID,
        mod_name: AGENT_CORE_MOD_NAME,
        error_msg: err.message ?? "",
        executable_path: execResult.path
      });
      state$8.portWatchCancel?.();
      state$8.portWatchCancel = null;
      throw err;
    }
    let port;
    try {
      port = await watch2.promise;
    } catch (err) {
      log$c().error(`端口文件就绪超时/失败: ${err.message}`);
      markSubprocessReady("agent", "timeout", err.message ?? "");
      reportBeaconRealtimeEvent(AGENT_CORE_REPORT_EVENTS.PORT_READY_TIMEOUT, {
        mod_id: AGENT_CORE_MOD_ID,
        mod_name: AGENT_CORE_MOD_NAME,
        error_msg: err.message ?? "",
        timeout_ms: String(timeoutMs)
      });
      state$8.pendingStopReason = "error";
      await stopManaged(AGENT_PROCESS_NAME).catch(() => void 0);
      state$8.pendingStopReason = null;
      throw err;
    } finally {
      state$8.portWatchCancel = null;
    }
    try {
      await waitForTcpReady(
        "127.0.0.1",
        port,
        DEFAULT_TCP_READY_TIMEOUT_MS,
        TCP_PROBE_INTERVAL_MS,
        TCP_PROBE_ATTEMPT_TIMEOUT_MS
      );
    } catch (err) {
      log$c().error(`AgentCore TCP 握手失败，判定启动未真正完成: ${err.message}`);
      markSubprocessReady("agent", "error", err.message ?? "");
      reportBeaconRealtimeEvent(AGENT_CORE_REPORT_EVENTS.TCP_PROBE_FAILED, {
        mod_id: AGENT_CORE_MOD_ID,
        mod_name: AGENT_CORE_MOD_NAME,
        error_msg: err.message ?? "",
        port: String(port)
      });
      state$8.pendingStopReason = "error";
      await stopManaged(AGENT_PROCESS_NAME).catch(() => void 0);
      state$8.pendingStopReason = null;
      throw err;
    }
    registerPort({
      name: "agent-core",
      host: "127.0.0.1",
      port,
      registeredAt: Date.now()
    });
    markSubprocessReady("agent", "ready");
    if (!state$8.notifier) {
      state$8.notifier = createAgentNotifier();
    }
    state$8.notifier.tryNotify(port);
    state$8.current = {
      port,
      executablePath: execResult.path,
      portFile: paths.portFile,
      homeDir: paths.homeDir,
      workMode,
      userId,
      portHint,
      localLlmPort
    };
    emitStatus({ status: "started", port });
    const handle2 = getHandle(AGENT_PROCESS_NAME);
    log$c().info(`AgentCore 就绪: port=${port} user_id=${userId || "(default)"}`);
    reportBeaconEvent(AGENT_CORE_REPORT_EVENTS.START_SUCCESS, {
      mod_id: AGENT_CORE_MOD_ID,
      mod_name: AGENT_CORE_MOD_NAME,
      port: String(port),
      work_mode: workMode
    });
    if (handle2?.pid !== null && handle2?.pid !== void 0) {
      const mainPid = handle2.pid;
      setTimeout(() => {
        try {
          const tree = snapshotAgentProcessTree(mainPid);
          log$c().info(`AgentCore process tree (pid=${mainPid}): ${formatAgentProcessTree(tree, mainPid)}`);
        } catch (err) {
          log$c().debug(`snapshotAgentProcessTree 异常（忽略）: ${err.message}`);
        }
      }, 1500).unref();
    }
    return {
      deferred: false,
      handle: handle2 ?? void 0,
      port,
      executablePath: execResult.path,
      portFile: paths.portFile,
      workMode,
      localLlmPort,
      userId
    };
  } finally {
    state$8.starting = false;
  }
}
async function stopAgent(timeoutMs = 5e3, reason = "shutdown") {
  if (state$8.stopping) {
    log$c().debug("stopAgent: 已在停止中，跳过");
    return;
  }
  if (!state$8.current && !getHandle(AGENT_PROCESS_NAME)) {
    state$8.portWatchCancel?.();
    state$8.portWatchCancel = null;
    state$8.deferredOpts = null;
    state$8.deferredPolicy = null;
    return;
  }
  const homeDirForCleanup = state$8.current?.homeDir ?? null;
  state$8.stopping = true;
  state$8.pendingStopReason = reason;
  try {
    state$8.portWatchCancel?.();
    state$8.portWatchCancel = null;
    state$8.autoRestartInFlight = false;
    await stopManaged(AGENT_PROCESS_NAME, timeoutMs).catch((err) => {
      log$c().warn(`stopManaged(agent-core) 异常: ${err.message}`);
    });
    if (state$8.current || state$8.notifier) {
      log$c().warn("stopAgent: stopManaged 返回后仍有残留 state（未收到 stopped 事件），主动兜底清理");
      const prevPort = state$8.current?.port ?? 0;
      unregisterPort("agent-core");
      state$8.notifier?.stop();
      state$8.notifier = null;
      state$8.current = null;
      emitStatus({
        status: "stopped",
        reason,
        exitCode: null,
        port: prevPort
      });
    }
    state$8.pendingStopReason = null;
    if (homeDirForCleanup) {
      await reapOrphanAgents(homeDirForCleanup).catch((err) => {
        log$c().warn(`stopAgent 兜底孤儿清理异常（忽略）: ${err.message}`);
      });
    }
  } finally {
    state$8.stopping = false;
  }
}
async function restartAgent(opts) {
  if (state$8.restarting) {
    return "in-progress";
  }
  if (state$8.starting) {
    log$c().info("restartAgent: 检测到 startAgent 正在进行中，等待其完成...");
    const WAIT_STARTING_TIMEOUT_MS = 6e4;
    const WAIT_STARTING_POLL_MS = 500;
    const deadline = Date.now() + WAIT_STARTING_TIMEOUT_MS;
    while (state$8.starting && Date.now() < deadline) {
      await new Promise((resolve2) => setTimeout(resolve2, WAIT_STARTING_POLL_MS));
    }
    if (state$8.starting) {
      log$c().warn("restartAgent: 等待 startAgent 完成超时（60s），放弃本次重启");
      return "failed";
    }
    log$c().info("restartAgent: startAgent 已完成，继续执行 restart");
  }
  state$8.restarting = true;
  try {
    const prevPortHint = state$8.current?.portHint;
    if (state$8.current) {
      try {
        await stopAgent(5e3, "shutdown");
      } catch (err) {
        log$c().error(`restartAgent.stop 失败: ${err.message}`);
        return "failed";
      }
      await new Promise((resolve2) => setTimeout(resolve2, 500));
    }
    try {
      resetCircuit(AGENT_PROCESS_NAME);
      const result = await startAgent({
        port: prevPortHint,
        workMode: opts?.workMode,
        localLlmPort: opts?.localLlmPort
      });
      log$c().info(`restartAgent.start 完成: port=${result.port} workMode=${result.workMode} localLlmPort=${result.localLlmPort ?? "(none)"} user_id=${result.userId || "(default)"}`);
      reportBeaconEvent(AGENT_CORE_REPORT_EVENTS.RESTART_RESULT, {
        mod_id: AGENT_CORE_MOD_ID,
        mod_name: AGENT_CORE_MOD_NAME,
        is_success: "1",
        port: String(result.port),
        work_mode: result.workMode
      });
      return "success";
    } catch (err) {
      log$c().error(`restartAgent.start 失败: ${err.message}`);
      reportBeaconRealtimeEvent(AGENT_CORE_REPORT_EVENTS.RESTART_RESULT, {
        mod_id: AGENT_CORE_MOD_ID,
        mod_name: AGENT_CORE_MOD_NAME,
        is_success: "0",
        error_msg: err.message ?? ""
      });
      return "failed";
    }
  } finally {
    state$8.restarting = false;
  }
}
function getAgentPort() {
  return state$8.current?.port ?? 0;
}
function isAgentRunning() {
  return state$8.current !== null;
}
function onAgentStatus(handler) {
  state$8.statusHandlers.add(handler);
  return () => state$8.statusHandlers.delete(handler);
}
function getAgentStatus() {
  return {
    handle: getHandle(AGENT_PROCESS_NAME),
    port: state$8.current?.port ?? 0,
    executablePath: state$8.current?.executablePath ?? null,
    portFile: state$8.current?.portFile ?? null,
    userId: state$8.current?.userId ?? null,
    workMode: state$8.current?.workMode ?? null
  };
}
const logger$Z = getLogger("agent-restart-queue");
let running = false;
let pending = null;
function enqueueRestart(request2) {
  if (running) {
    const prev = pending;
    pending = request2;
    const prevInfo = prev ? ` (丢弃旧 pending: workMode=${prev.workMode})` : "";
    logger$Z.info(`enqueue: 覆盖 pending 槽位 workMode=${request2.workMode} localLlmPort=${request2.localLlmPort ?? "(none)"}${prevInfo}`);
    return;
  }
  logger$Z.info(`enqueue: 立即执行 workMode=${request2.workMode} localLlmPort=${request2.localLlmPort ?? "(none)"}`);
  executeRestart(request2);
}
function executeRestart(request2) {
  running = true;
  restartAgent({ workMode: request2.workMode, localLlmPort: request2.localLlmPort }).then((result) => {
    logger$Z.info(`执行完成: workMode=${request2.workMode} result=${result}`);
  }).catch((err) => {
    logger$Z.error(`执行异常: workMode=${request2.workMode} error=${err.message}`);
  }).finally(() => {
    running = false;
    if (pending) {
      const next = pending;
      pending = null;
      logger$Z.info(`消费 pending: workMode=${next.workMode} localLlmPort=${next.localLlmPort ?? "(none)"}`);
      executeRestart(next);
    }
  });
}
function getElectronApp() {
  return require2("electron").app;
}
function getUserDataDir$1() {
  return getElectronApp().getPath("userData");
}
function getCacheDir() {
  return join(getElectronApp().getPath("home"), "Library", "Caches", "com.tencent.mac.marvis");
}
function getDownloadsDir() {
  return join(getCacheDir(), "downloads");
}
function getUpdateDir() {
  return join(getUserDataDir$1(), "update");
}
function getUpdateJsonPath() {
  return join(getUpdateDir(), "update.json");
}
function getUpdateLockPath() {
  return join(getUpdateDir(), "update.lock");
}
function getUpdateProgressPath() {
  return join(getUpdateDir(), "update.progress");
}
function getStagingDir() {
  return join(getUpdateDir(), "staging");
}
function getInstalledJsonPath() {
  return join(getUserDataDir$1(), "installed.json");
}
function getComponentsDir() {
  return join(getUserDataDir$1(), "components");
}
const ARIA2_PORT_RETRY_COUNT = 3;
const PENDING_EXPIRE_DAYS = 7;
const CLEANUP_DELAY_MS = 5e3;
const AUTO_CHECK_INTERVAL_MS = 5 * 60 * 1e3;
var ComponentType = /* @__PURE__ */ ((ComponentType2) => {
  ComponentType2[ComponentType2["MARVIS_AGENT"] = 400] = "MARVIS_AGENT";
  ComponentType2[ComponentType2["MARVIS"] = 401] = "MARVIS";
  ComponentType2[ComponentType2["MARVIS_GATEWAY"] = 402] = "MARVIS_GATEWAY";
  ComponentType2[ComponentType2["MARVIS_KNOWLEDGEBASE"] = 403] = "MARVIS_KNOWLEDGEBASE";
  ComponentType2[ComponentType2["DOC_PREVIEW"] = 405] = "DOC_PREVIEW";
  return ComponentType2;
})(ComponentType || {});
const DOC_PREVIEW_DYLIB_NAME = "libeditor_sdk_ffi.dylib";
const MANAGED_COMPONENTS = [
  {
    name: "Marvis",
    type: 401
    /* MARVIS */
  },
  {
    name: "MarvisGateway",
    type: 402
    /* MARVIS_GATEWAY */
  },
  {
    name: "MarvisAgent",
    type: 400
    /* MARVIS_AGENT */
  },
  {
    name: "MarvisKnowledgebase",
    type: 403
    /* MARVIS_KNOWLEDGEBASE */
  },
  {
    name: "DocPreview",
    type: 405
    /* DOC_PREVIEW */
  }
];
const DEFAULT_COMPONENT_VERSION = "1.0.0.0";
const ARIA2_PORT_MIN = 3e4;
const ARIA2_PORT_MAX = 5e4;
const ARIA2_SHUTDOWN_TIMEOUT_MS = 3e3;
const DOWNLOAD_POLL_INTERVAL_MS = 1e3;
var UpdateTypeCode = /* @__PURE__ */ ((UpdateTypeCode2) => {
  UpdateTypeCode2[UpdateTypeCode2["NoUpdate"] = 0] = "NoUpdate";
  UpdateTypeCode2[UpdateTypeCode2["RedDot"] = 1] = "RedDot";
  UpdateTypeCode2[UpdateTypeCode2["PopWindow"] = 2] = "PopWindow";
  UpdateTypeCode2[UpdateTypeCode2["ForcePopWindow"] = 3] = "ForcePopWindow";
  UpdateTypeCode2[UpdateTypeCode2["NoReminder"] = 4] = "NoReminder";
  return UpdateTypeCode2;
})(UpdateTypeCode || {});
var SilentUpdateCode = /* @__PURE__ */ ((SilentUpdateCode2) => {
  SilentUpdateCode2[SilentUpdateCode2["NotSilent"] = 0] = "NotSilent";
  SilentUpdateCode2[SilentUpdateCode2["Silent"] = 1] = "Silent";
  SilentUpdateCode2[SilentUpdateCode2["ForceSilent"] = 2] = "ForceSilent";
  SilentUpdateCode2[SilentUpdateCode2["SilentDownload"] = 3] = "SilentDownload";
  SilentUpdateCode2[SilentUpdateCode2["UnconditionalForce"] = 4] = "UnconditionalForce";
  return SilentUpdateCode2;
})(SilentUpdateCode || {});
const IDLE_CPU_THRESHOLD = 50;
const IDLE_INPUT_THRESHOLD_SEC = 300;
const IDLE_CHECK_INTERVAL_MS = 1e4;
const SPEED_LIMIT_NONE = 0;
const SPEED_LIMIT_SLOW = 1048576;
const ACCOUNT_NAMESPACE = "account";
const METHOD_GET_LOGIN_INFO = "getLoginInfo";
const METHOD_ON_LOGIN_STATE_CHANGED = "onLoginStateChanged";
const ACTION_LOGIN = "login";
const ACTION_LOGOUT = "logout";
const EXTERNAL_LOGIN_TYPE_MARVIS$1 = "Marvis";
function toExternalLoginType(internal) {
  switch (internal) {
    case "QC":
    case "WX":
    case "WXAPP":
    case "Marvis":
      return EXTERNAL_LOGIN_TYPE_MARVIS$1;
    default:
      return "";
  }
}
const state$7 = {
  started: false,
  logger: null,
  deps: null,
  unsubscribeStore: null,
  unsubscribeRoute: null,
  unsubscribeConnect: null,
  unsubscribeAgentStatus: null,
  initialPushed: false,
  lastAction: null
};
function log$b() {
  if (!state$7.logger) state$7.logger = getLogger("account-notifier");
  return state$7.logger;
}
function startAccountNotifier(deps2) {
  if (state$7.started) {
    log$b().warn("account notifier 已启动，跳过");
    return;
  }
  state$7.deps = deps2;
  const register = deps2.registerRoute ?? registerRoute;
  state$7.unsubscribeRoute = register(
    ACCOUNT_NAMESPACE,
    METHOD_GET_LOGIN_INFO,
    async () => handleGetLoginInfo$1()
  );
  state$7.unsubscribeStore = deps2.onEvent((ev) => {
    void handleLoginEvent$1(ev);
  });
  state$7.unsubscribeConnect = onConnect(() => {
    pushInitialStateOnce("onConnect").catch((err) => {
      log$b().warn(`onConnect 推送初始登录态异常: ${err.message}`);
    });
  });
  void Promise.resolve().then(() => pushInitialStateOnce("start").catch((err) => {
    log$b().warn(`初始登录态推送异常: ${err.message}`);
  }));
  if (deps2.onAgentStatus) {
    state$7.unsubscribeAgentStatus = deps2.onAgentStatus((ev) => {
      if (ev.status !== "started") return;
      log$b().info(`onAgentStatus: started port=${ev.port ?? "?"} → 重推当前登录态`);
      state$7.initialPushed = false;
      pushInitialStateOnce("agentStarted").catch((err) => {
        log$b().warn(`agentStarted 重推登录态异常: ${err.message}`);
      });
    });
  } else {
    log$b().debug("deps.onAgentStatus 未注入，跳过 Agent 重启后的自动重推");
  }
  state$7.started = true;
  log$b().info("account notifier 已启动");
}
function stopAccountNotifier() {
  if (!state$7.started) return;
  if (state$7.unsubscribeStore) {
    state$7.unsubscribeStore();
    state$7.unsubscribeStore = null;
  }
  if (state$7.unsubscribeConnect) {
    state$7.unsubscribeConnect();
    state$7.unsubscribeConnect = null;
  }
  if (state$7.unsubscribeAgentStatus) {
    state$7.unsubscribeAgentStatus();
    state$7.unsubscribeAgentStatus = null;
  }
  if (state$7.unsubscribeRoute) {
    state$7.unsubscribeRoute();
    state$7.unsubscribeRoute = null;
  } else {
    unregisterRoute(ACCOUNT_NAMESPACE, METHOD_GET_LOGIN_INFO);
  }
  state$7.started = false;
  state$7.deps = null;
  state$7.initialPushed = false;
  state$7.lastAction = null;
  log$b().info("account notifier 已停止");
}
async function pushInitialStateOnce(trigger) {
  if (!state$7.started) return;
  if (state$7.initialPushed) return;
  const { deps: deps2 } = state$7;
  if (!deps2) return;
  if (!isConnected()) {
    log$b().debug(`pushInitialStateOnce[${trigger}]: IPC 未连接，等待 onConnect 重推`);
    return;
  }
  const send = deps2.sendMessage ?? sendMessage;
  const info = deps2.getUserInfo();
  const { main } = info;
  if (!main?.openId) {
    const params2 = { action: ACTION_LOGOUT };
    const ok22 = send(
      ACCOUNT_NAMESPACE,
      METHOD_ON_LOGIN_STATE_CHANGED,
      params2
    );
    if (ok22) {
      state$7.initialPushed = true;
      state$7.lastAction = "logout";
      log$b().info(`[${trigger}] 推送初始登录态: action=logout`);
    } else {
      log$b().debug(`[${trigger}] 推送初始登录态失败 (logout)，等待 onConnect 重推`);
    }
    return;
  }
  const guid = await deps2.getGuid();
  const params = {
    action: ACTION_LOGIN,
    openId: main.openId,
    loginType: toExternalLoginType(main.loginType),
    accessToken: main.accessToken,
    refreshToken: main.refreshToken,
    guid,
    expireTime: main.expireTime
  };
  const ok2 = send(
    ACCOUNT_NAMESPACE,
    METHOD_ON_LOGIN_STATE_CHANGED,
    params
  );
  if (ok2) {
    state$7.initialPushed = true;
    state$7.lastAction = "login";
    log$b().info(`[${trigger}] 推送初始登录态: action=login openId=${main.openId} loginType=${params.loginType}`);
  } else {
    log$b().debug(`[${trigger}] 推送初始登录态失败 (login)，等待 onConnect 重推`);
  }
}
async function handleGetLoginInfo$1() {
  const { deps: deps2 } = state$7;
  if (!deps2) {
    log$b().warn("handleGetLoginInfo: notifier not started");
    return { isLoggedIn: false };
  }
  const info = deps2.getUserInfo();
  const { main } = info;
  if (!main?.openId) {
    log$b().debug("getLoginInfo: not logged in");
    return { isLoggedIn: false };
  }
  const resp = {
    isLoggedIn: true,
    openId: main.openId,
    loginType: toExternalLoginType(main.loginType),
    accessToken: main.accessToken,
    refreshToken: main.refreshToken,
    guid: await deps2.getGuid(),
    expireTime: main.expireTime
  };
  log$b().info(`getLoginInfo: isLoggedIn=true openId=${main.openId} loginType=${resp.loginType}`);
  return resp;
}
async function handleLoginEvent$1(ev) {
  const { deps: deps2 } = state$7;
  if (!deps2) return;
  const send = deps2.sendMessage ?? sendMessage;
  if (ev.eventName === "logout") {
    const params2 = { action: ACTION_LOGOUT };
    const ok22 = send(
      ACCOUNT_NAMESPACE,
      METHOD_ON_LOGIN_STATE_CHANGED,
      params2
    );
    state$7.lastAction = "logout";
    state$7.initialPushed = true;
    log$b().info(`onLoginStateChanged pushed: action=logout ok=${ok22}`);
    return;
  }
  const { main } = ev.userInfo;
  if (!main?.openId) {
    log$b().debug(`${ev.eventName}: no main.openId, skip push`);
    return;
  }
  const guid = await deps2.getGuid();
  const params = {
    action: ACTION_LOGIN,
    openId: main.openId,
    loginType: toExternalLoginType(main.loginType),
    accessToken: main.accessToken,
    refreshToken: main.refreshToken,
    guid,
    expireTime: main.expireTime
  };
  const ok2 = send(
    ACCOUNT_NAMESPACE,
    METHOD_ON_LOGIN_STATE_CHANGED,
    params
  );
  state$7.lastAction = "login";
  state$7.initialPushed = true;
  log$b().info(`onLoginStateChanged pushed: action=login openId=${main.openId} loginType=${params.loginType} ok=${ok2}`);
}
const state$6 = {
  started: false,
  socketPath: null,
  logger: null,
  server: null,
  socket: null,
  guid: "",
  clientVersion: DEFAULT_CLIENT_VERSION,
  unsubscribeLoginEvent: null
};
function log$a() {
  if (!state$6.logger) state$6.logger = getLogger("mcp-ipc");
  return state$6.logger;
}
async function startMcpIpcServer(socketPath) {
  if (state$6.started) {
    log$a().warn(`MCP IPC 已启动过 (${state$6.socketPath})，跳过`);
    return;
  }
  try {
    mkdirSync(dirname(socketPath), { recursive: true });
  } catch {
  }
  await removeSocketIfExists(socketPath);
  await new Promise((resolve2, reject) => {
    const server = createServer((socket) => handleNewSocket(socket));
    server.once("error", (err) => {
      log$a().error(`MCP IPC listener 启动失败: ${err.message}`);
      reject(err);
    });
    server.listen(socketPath, () => {
      state$6.server = server;
      try {
        chmodSync(socketPath, 384);
      } catch {
      }
      log$a().info(`MCP IPC listener 已就绪: ${socketPath}`);
      resolve2();
    });
  });
  state$6.started = true;
  state$6.socketPath = socketPath;
  state$6.unsubscribeLoginEvent = onEvent((ev) => {
    void handleLoginEvent(ev);
  });
  log$a().info("MCP IPC server 已启动");
}
async function stopMcpIpcServer() {
  if (!state$6.started) return;
  if (state$6.unsubscribeLoginEvent) {
    state$6.unsubscribeLoginEvent();
    state$6.unsubscribeLoginEvent = null;
  }
  if (state$6.socket) {
    try {
      state$6.socket.destroy();
    } catch {
    }
    state$6.socket = null;
  }
  if (state$6.server) {
    await new Promise((resolve2) => {
      state$6.server.close(() => resolve2());
    });
    state$6.server = null;
  }
  if (state$6.socketPath) {
    await removeSocketIfExists(state$6.socketPath);
    state$6.socketPath = null;
  }
  state$6.started = false;
  state$6.guid = "";
  log$a().info("MCP IPC server 已停止");
}
function handleNewSocket(socket) {
  if (state$6.socket && !state$6.socket.destroyed) {
    log$a().warn("MCP IPC: 新连接到达，销毁旧连接");
    state$6.socket.destroy();
  }
  state$6.socket = socket;
  log$a().info("MCP IPC: MarvisMCP 已接入");
  attachLineReader$1(socket);
  socket.on("close", () => {
    log$a().info("MCP IPC: 连接已关闭");
    if (state$6.socket === socket) {
      state$6.socket = null;
    }
  });
  socket.on("error", (err) => {
    log$a().warn(`MCP IPC socket error: ${err.message}`);
  });
  void pushCurrentLoginState("onConnect");
}
function attachLineReader$1(socket) {
  let buffer = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffer += chunk;
    if (buffer.length > MAX_LINE_LENGTH$1) {
      log$a().warn(`MCP IPC: 单行超过最大长度 ${MAX_LINE_LENGTH$1}，关闭连接`);
      socket.destroy();
      return;
    }
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, "");
      buffer = buffer.slice(idx + 1);
      if (line.length === 0) continue;
      handleInboundLine$1(line);
    }
  });
}
function sendLine$1(line) {
  if (!state$6.socket || state$6.socket.destroyed) {
    return false;
  }
  const payload = line.endsWith("\n") ? line : `${line}
`;
  return state$6.socket.write(payload);
}
function handleInboundLine$1(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    log$a().warn(`MCP IPC: JSON 解析失败: ${line.slice(0, 200)}`);
    return;
  }
  if (msg.type !== "send") {
    log$a().debug(`MCP IPC: 忽略非 send 消息: type=${msg.type}`);
    return;
  }
  const route = `${msg.namespace}.${msg.method}`;
  if (route === "base.init") {
    void handleBaseInit(msg);
    return;
  }
  if (route === "base.heartbeat") {
    handleBaseHeartbeat(msg);
    return;
  }
  if (route === `${ACCOUNT_NAMESPACE}.${METHOD_GET_LOGIN_INFO}`) {
    void handleGetLoginInfo(msg);
    return;
  }
  if (route === "weixin.uploadAndSend") {
    void handleWeixinUploadAndSend(msg);
    return;
  }
  log$a().debug(`MCP IPC: 未知路由，忽略: ${route}`);
}
async function handleBaseInit(msg) {
  const params = msg.params;
  if (!params || typeof params.port !== "number" || typeof params.token !== "string") {
    log$a().warn(`MCP IPC: base.init params 非法: ${JSON.stringify(msg.params)}`);
    return;
  }
  log$a().info(`MCP IPC: 收到 base.init: token=${params.token.slice(0, 8)}...`);
  if (state$6.guid.length === 0) {
    state$6.guid = await getDeviceGuid();
  }
  const ackParams = {
    guid: state$6.guid,
    client_version: state$6.clientVersion
  };
  const ackMsg = {
    type: "ack",
    protocalVersion: PROTOCOL_VERSION$1,
    callbackId: msg.callbackId,
    namespace: "base",
    method: "init",
    params: ackParams
  };
  const sent = sendLine$1(JSON.stringify(ackMsg));
  if (sent) {
    log$a().info(`MCP IPC: 已回 base.init ack: guid=${ackParams.guid}`);
  } else {
    log$a().warn("MCP IPC: base.init ack 发送失败");
  }
}
function handleBaseHeartbeat(msg) {
  const ackMsg = {
    type: "ack",
    protocalVersion: PROTOCOL_VERSION$1,
    callbackId: msg.callbackId,
    namespace: "base",
    method: "heartbeat"
  };
  sendLine$1(JSON.stringify(ackMsg));
}
async function handleGetLoginInfo(msg) {
  const info = getUserInfo$1();
  const { main } = info;
  let resp;
  if (!main?.openId) {
    resp = { isLoggedIn: false };
  } else {
    resp = {
      isLoggedIn: true,
      openId: main.openId,
      loginType: toExternalLoginType(main.loginType),
      accessToken: main.accessToken,
      refreshToken: main.refreshToken,
      guid: await getDeviceGuid(),
      expireTime: main.expireTime
    };
  }
  const ackMsg = {
    type: "ack",
    protocalVersion: PROTOCOL_VERSION$1,
    callbackId: msg.callbackId,
    namespace: ACCOUNT_NAMESPACE,
    method: METHOD_GET_LOGIN_INFO,
    params: resp
  };
  const sent = sendLine$1(JSON.stringify(ackMsg));
  if (sent) {
    log$a().info(`MCP IPC: getLoginInfo ack: isLoggedIn=${resp.isLoggedIn}`);
  }
}
async function handleWeixinUploadAndSend(msg) {
  const params = msg.params;
  const filePath = String(params?.file_path ?? "");
  log$a().info(`MCP IPC: weixin.uploadAndSend: 收到请求, file_path=${filePath}`);
  let ackParams;
  try {
    const result = await sendRequest("weixin", "uploadAndSend", params ?? {}, 33e4);
    log$a().info(`MCP IPC: weixin.uploadAndSend: Gateway 上传完成, url=${String(result.url ?? "(no url)")}`);
    ackParams = result;
  } catch (err) {
    const errMsg = err.message;
    log$a().warn(`MCP IPC: weixin.uploadAndSend: Gateway 上传失败: ${errMsg}`);
    ackParams = { error: errMsg };
  }
  const ackMsg = {
    type: "ack",
    protocalVersion: PROTOCOL_VERSION$1,
    callbackId: msg.callbackId,
    namespace: "weixin",
    method: "uploadAndSend",
    params: ackParams
  };
  const sent2 = sendLine$1(JSON.stringify(ackMsg));
  if (!sent2) {
    log$a().warn("MCP IPC: weixin.uploadAndSend: ack 发送失败");
  }
}
async function pushCurrentLoginState(trigger) {
  if (!state$6.socket || state$6.socket.destroyed) return;
  const info = getUserInfo$1();
  const { main } = info;
  let params;
  if (!main?.openId) {
    params = { action: ACTION_LOGOUT };
  } else {
    params = {
      action: ACTION_LOGIN,
      openId: main.openId,
      loginType: toExternalLoginType(main.loginType),
      accessToken: main.accessToken,
      refreshToken: main.refreshToken,
      guid: await getDeviceGuid(),
      expireTime: main.expireTime
    };
  }
  const msg = {
    type: "send",
    protocalVersion: PROTOCOL_VERSION$1,
    callbackId: `mcp-notify-${randomUUID()}`,
    namespace: ACCOUNT_NAMESPACE,
    method: METHOD_ON_LOGIN_STATE_CHANGED,
    params
  };
  const ok2 = sendLine$1(JSON.stringify(msg));
  log$a().info(`MCP IPC: [${trigger}] 推送登录态: action=${params.action} ok=${ok2}`);
}
async function handleLoginEvent(ev) {
  if (!state$6.socket || state$6.socket.destroyed) return;
  if (ev.eventName === "logout") {
    const params = { action: ACTION_LOGOUT };
    const msg = {
      type: "send",
      protocalVersion: PROTOCOL_VERSION$1,
      callbackId: `mcp-notify-${randomUUID()}`,
      namespace: ACCOUNT_NAMESPACE,
      method: METHOD_ON_LOGIN_STATE_CHANGED,
      params
    };
    sendLine$1(JSON.stringify(msg));
    log$a().info("MCP IPC: 推送 logout");
    return;
  }
  await pushCurrentLoginState(ev.eventName);
}
function removeSocketIfExists(path2) {
  return new Promise((resolve2) => {
    unlink(path2, () => resolve2());
  });
}
function defaultMcpSocketPath() {
  try {
    const { app: app2 } = require2("electron");
    return join(app2.getPath("userData"), "ipc", "marvis-mcp.sock");
  } catch {
    const uid = process.getuid?.() ?? 0;
    return `/tmp/marvis-mcp-${uid}.sock`;
  }
}
const ENV_MCP_IPC_SOCKET_PATH = "MARVIS_MCP_IPC_SOCKET_PATH";
const ENV_GATEWAY_EXECUTABLE = "MARVIS_GATEWAY_PATH";
const ENV_IPC_SOCKET_PATH = "MARVIS_IPC_SOCKET_PATH";
const EXECUTABLE_NAME = "MarvisHost";
const GATEWAY_PROCESS_NAME = "gateway";
const INIT_WAIT_TIMEOUT_MS = 35e3;
const ENV_GATEWAY_LOG_DIR = "MARVIS_GATEWAY_LOG_DIR";
function resolveExecutablePath$1(overridePath) {
  const tried = [];
  const envPath = process.env[ENV_GATEWAY_EXECUTABLE];
  if (envPath && envPath.trim().length > 0) {
    tried.push(envPath);
    if (existsSync(envPath)) {
      return { path: envPath, source: "env", triedPaths: tried };
    }
  }
  for (const candidate of buildDefaultCandidates$1()) {
    tried.push(candidate);
    if (existsSync(candidate)) {
      return { path: candidate, source: "default", triedPaths: tried };
    }
  }
  const pathHit = lookupInSystemPath$1(EXECUTABLE_NAME);
  if (pathHit) {
    tried.push(`PATH: ${pathHit}`);
    return { path: pathHit, source: "path", triedPaths: tried };
  }
  throw buildNotFoundError$1(tried);
}
function buildDefaultCandidates$1() {
  const cwd = process.cwd();
  const candidates2 = [];
  const { resourcesPath } = process;
  if (resourcesPath) {
    try {
      const { app: app2 } = require2("electron");
      const componentsPath = join(app2.getPath("userData"), "components", "MarvisGateway", "Current", "MarvisHost");
      candidates2.push(componentsPath);
    } catch {
    }
    candidates2.push(join(resourcesPath, "bin", "MarvisGateway.framework", "MarvisHost"));
    candidates2.push(join(resourcesPath, "bin", EXECUTABLE_NAME));
  }
  candidates2.push(join(cwd, "resources", "bin", "MarvisGateway.framework", "MarvisHost"));
  candidates2.push(join(cwd, "resources", "bin", EXECUTABLE_NAME));
  candidates2.push(join(cwd, "..", "xiaobao-gateway", "target", "release", EXECUTABLE_NAME));
  return candidates2;
}
function lookupInSystemPath$1(name) {
  try {
    const cmd = process.platform === "win32" ? `where ${name}` : `which ${name}`;
    const output = execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").trim();
    const firstLine = output.split("\n")[0]?.trim();
    if (firstLine && isAbsolute(firstLine) && existsSync(firstLine)) {
      return firstLine;
    }
  } catch {
  }
  return null;
}
function buildNotFoundError$1(tried, summary) {
  const lines = [
    `无法找到 ${EXECUTABLE_NAME} 可执行文件`,
    "已尝试的路径（按优先级）：",
    ...tried.map((p, i) => `  ${i + 1}. ${p}`),
    "",
    "请检查：",
    `  - 设置环境变量 ${ENV_GATEWAY_EXECUTABLE}=/path/to/${EXECUTABLE_NAME}`,
    `  - 或在项目根 .env 文件中配置 ${ENV_GATEWAY_EXECUTABLE}`,
    `  - 或将可执行文件放在 resources/bin/${EXECUTABLE_NAME}`
  ];
  return new Error(lines.join("\n"));
}
const PGREP_TIMEOUT_MS = 2e3;
const SOCKET_PROBE_TIMEOUT_MS = 300;
let logger$Y = null;
function log$9() {
  if (!logger$Y) logger$Y = getLogger("gateway-preclean");
  return logger$Y;
}
function findResidualPids(executablePath) {
  return new Promise((resolve2) => {
    const child = spawn("pgrep", ["-f", executablePath], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    const timer2 = setTimeout(() => {
      child.kill("SIGKILL");
      log$9().warn(`pgrep 超时 (${PGREP_TIMEOUT_MS}ms)，跳过残留进程扫描`);
      resolve2([]);
    }, PGREP_TIMEOUT_MS);
    child.on("exit", (code) => {
      clearTimeout(timer2);
      if (code !== 0 && code !== 1) {
        log$9().warn(`pgrep 异常退出 code=${code}`);
        resolve2([]);
        return;
      }
      const pids = stdout.split("\n").map((s) => s.trim()).filter((s) => s.length > 0 && /^\d+$/.test(s)).map((s) => Number.parseInt(s, 10)).filter((pid) => pid !== process.pid);
      resolve2(pids);
    });
    child.on("error", (err) => {
      clearTimeout(timer2);
      log$9().warn(`pgrep 启动失败: ${err.message}`);
      resolve2([]);
    });
  });
}
function probeSocketActive(socketPath) {
  return new Promise((resolve2) => {
    if (!existsSync(socketPath)) {
      resolve2(false);
      return;
    }
    const sock = createConnection(socketPath);
    let settled = false;
    const finish = (active) => {
      if (settled) return;
      settled = true;
      try {
        sock.destroy();
      } catch {
      }
      resolve2(active);
    };
    sock.once("connect", () => finish(true));
    sock.once("error", () => finish(false));
    setTimeout(() => finish(false), SOCKET_PROBE_TIMEOUT_MS);
  });
}
async function preCleanResidualGateway(opts) {
  const { executablePath, socketPath } = opts;
  const result = {
    killedPids: [],
    socketUnlinked: false,
    warnings: []
  };
  const pids = await findResidualPids(executablePath);
  if (pids.length > 0) {
    log$9().warn(`发现 ${pids.length} 个残留 MarvisHost 进程 (pids=${pids.join(",")})，即将 SIGKILL`);
    for (const pid of pids) {
      try {
        process.kill(pid, "SIGKILL");
        result.killedPids.push(pid);
        log$9().info(`已 SIGKILL 残留进程 pid=${pid}`);
      } catch (err) {
        const msg = err.code === "ESRCH" ? `pid=${pid} 已不存在，跳过` : `kill pid=${pid} 失败: ${err.message}`;
        if (err.code !== "ESRCH") {
          result.warnings.push(msg);
        }
        log$9().warn(msg);
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  } else {
    log$9().debug("未发现残留 MarvisHost 进程");
  }
  try {
    if (existsSync(socketPath)) {
      const stat2 = statSync$1(socketPath);
      if (stat2.isSocket()) {
        const active = await probeSocketActive(socketPath);
        if (active) {
          const msg = `socket ${socketPath} 仍有 listener（清理后仍活着），跳过 unlink`;
          result.warnings.push(msg);
          log$9().warn(msg);
        } else {
          unlinkSync(socketPath);
          result.socketUnlinked = true;
          log$9().info(`已删除无主 socket 文件: ${socketPath}`);
        }
      } else {
        const msg = `路径 ${socketPath} 不是 socket 文件，跳过清理`;
        result.warnings.push(msg);
        log$9().warn(msg);
      }
    }
  } catch (err) {
    const msg = `清理 socket 文件失败: ${err.message}`;
    result.warnings.push(msg);
    log$9().warn(msg);
  }
  return result;
}
const GATEWAY_REPORT_EVENTS = {
  /** 网关启动成功（携带 port、gateway_version） */
  START_SUCCESS: "gateway__start_success",
  /** 网关启动失败（携带 error 信息） */
  START_FAILURE: "gateway__start_failure",
  /** 网关停止 */
  STOP: "gateway__stop",
  /** IPC listener 启动成功 */
  IPC_START_SUCCESS: "gateway__ipc_start_success",
  /** IPC listener 启动失败（携带 error 信息） */
  IPC_START_FAILURE: "gateway__ipc_start_failure",
  /** 预清理完成（携带 killed_count、socket_unlinked） */
  PRECLEAN_RESULT: "gateway__preclean_result",
  /** 子进程 spawn 失败（携带 error 信息） */
  SPAWN_FAILURE: "gateway__spawn_failure",
  /** 等待 base.init 超时或失败（携带 error、timeout_ms） */
  WAIT_INIT_FAILURE: "gateway__wait_init_failure",
  /** 端口登记更新（网关重启后刷新 registerPort） */
  PORT_UPDATE: "gateway__port_update"
};
let lastStart = null;
let logger$X = null;
function getModuleLogger$a() {
  if (!logger$X) {
    logger$X = getLogger("gateway");
  }
  return logger$X;
}
function resolveSocketPath$2(opts) {
  const envPath = process.env[ENV_IPC_SOCKET_PATH];
  if (envPath && envPath.trim().length > 0) {
    return envPath;
  }
  return defaultSocketPath();
}
function resolveGatewayLogDir(opts) {
  const candidate = process.env[ENV_GATEWAY_LOG_DIR]?.trim() || getLogDir() || join(process.cwd(), "log");
  if (!candidate) return null;
  return isAbsolute(candidate) ? candidate : resolve(process.cwd(), candidate);
}
function resolveGatewayHomeDir(opts) {
  return getHomeDir();
}
function resolveMcpSocketPath() {
  const envPath = process.env[ENV_MCP_IPC_SOCKET_PATH];
  if (envPath && envPath.trim().length > 0) {
    return envPath;
  }
  return defaultMcpSocketPath();
}
function resolveBeaconLibPath() {
  const DYLIB_NAME = "libbeacon_wrapper.dylib";
  const { resourcesPath } = process;
  if (resourcesPath) {
    const packed = join(resourcesPath, "bin", DYLIB_NAME);
    if (existsSync(packed)) return packed;
  }
  const devBin = resolve(process.cwd(), "resources", "bin", DYLIB_NAME);
  if (existsSync(devBin)) return devBin;
  return null;
}
async function startGateway(opts, restartPolicy) {
  const log2 = getModuleLogger$a();
  if (getHandle(GATEWAY_PROCESS_NAME)) {
    throw new Error("网关已启动，请先调用 stopGateway()");
  }
  const execResult = resolveExecutablePath$1();
  log2.info(`MarvisHost 路径命中(${execResult.source}): ${execResult.path}`);
  const socketPath = resolveSocketPath$2();
  log2.info(`UDS socket 路径: ${socketPath}`);
  try {
    const cleanResult = await preCleanResidualGateway({
      executablePath: execResult.path,
      socketPath
    });
    if (cleanResult.killedPids.length > 0 || cleanResult.socketUnlinked) {
      log2.info(`预清理完成: killed=[${cleanResult.killedPids.join(",")}] socketUnlinked=${cleanResult.socketUnlinked}`);
      reportBeaconEvent(GATEWAY_REPORT_EVENTS.PRECLEAN_RESULT, {
        killed_count: String(cleanResult.killedPids.length),
        killed_pids: cleanResult.killedPids.join(","),
        socket_unlinked: cleanResult.socketUnlinked ? "1" : "0",
        socket_path: socketPath
      });
    }
  } catch (err) {
    log2.warn(`预清理异常，继续尝试启动: ${err.message}`);
  }
  try {
    await startIpcServer(socketPath);
    reportBeaconEvent(GATEWAY_REPORT_EVENTS.IPC_START_SUCCESS, {
      socket_path: socketPath
    });
  } catch (err) {
    log2.error(`IPC listener 启动失败: ${err.message}`);
    reportBeaconRealtimeEvent(GATEWAY_REPORT_EVENTS.IPC_START_FAILURE, {
      error: err.message,
      socket_path: socketPath
    });
    reportBeaconRealtimeEvent(GATEWAY_REPORT_EVENTS.START_FAILURE, {
      error: err.message
    });
    throw err;
  }
  try {
    startAccountNotifier({
      getUserInfo: getUserInfo$1,
      onEvent,
      // guid 统一从 device-guid 模块取（对齐 Windows `service::GetGuid()`）；
      // device-guid 已是 async（首次会等待 QimeiSDK 就绪），notifier 内部会 await。
      getGuid: getDeviceGuid,
      // 注入 agent-core 状态订阅：每次 Agent 重启成功（started 事件）后，
      // notifier 会主动重推当前登录态给 Gateway，避免新 Agent 进入 WaitingLogin
      // 后长时间卡住（实测旧实现依赖 Gateway 轮询 getLoginInfo 要等 30s+）。
      // 在此注入而非 notifier 内部直接 import 是为了避免与 `agent-core/agent-notifier.ts`
      // 形成循环依赖（后者 import 自 `../gateway-nng-ipc`）。
      onAgentStatus
    });
  } catch (err) {
    log2.warn(`AccountNotifier 启动失败（不阻断网关启动）: ${err.message}`);
  }
  registerRoute("weixin", "uploadAndSend", async (params) => {
    log2.info(`weixin.uploadAndSend: 收到上传请求, file_path=${String(params.file_path ?? "")}`);
    try {
      const result = await sendRequest("weixin", "uploadAndSend", params, 33e4);
      log2.info(`weixin.uploadAndSend: Gateway 上传完成, url=${String(result.url ?? "(no url)")}`);
      return result;
    } catch (err) {
      const msg = err.message;
      log2.warn(`weixin.uploadAndSend: Gateway 上传失败: ${msg}`);
      return { error: msg };
    }
  });
  const mcpSocketPath = resolveMcpSocketPath();
  try {
    await startMcpIpcServer(mcpSocketPath);
    log2.info(`MCP IPC listener 已启动: ${mcpSocketPath}`);
  } catch (err) {
    log2.warn(`MCP IPC listener 启动失败（不阻断网关启动）: ${err.message}`);
  }
  const ipcAddress = `ipc://${socketPath}`;
  const gatewayLogDir = resolveGatewayLogDir();
  const args = ["start"];
  if (gatewayLogDir) {
    args.push("--log-dir", gatewayLogDir);
    log2.info(`网关日志目录: ${gatewayLogDir} (将以 --log-dir 参数传入)`);
  }
  const gatewayHomeDir = resolveGatewayHomeDir();
  args.push("--home-dir", gatewayHomeDir);
  log2.info(`网关数据根目录: ${gatewayHomeDir} (将以 --home-dir 参数传入，与 AgentCore 对齐)`);
  const libeditorPath = join(getComponentsDir(), "MarvisGateway", "Current", "libeditor_sdk_ffi.dylib");
  let libeditorEnv = {};
  if (existsSync(libeditorPath)) {
    libeditorEnv = { DOC_LIB_PATH: libeditorPath };
    log2.info(`libeditor 动态库: ${libeditorPath} (将以环境变量 DOC_LIB_PATH 传入)`);
  }
  const beaconLibPath = resolveBeaconLibPath();
  if (beaconLibPath) {
    args.push("--beacon-lib", beaconLibPath);
    log2.info(`beacon dylib: ${beaconLibPath} (将以 --beacon-lib 参数传入)`);
  }
  log2.info(`拉起网关子进程: ${execResult.path} ${args.join(" ")} (IPC_PIPE_ADDRESS=${ipcAddress})`);
  markSubprocessSpawn("gateway");
  try {
    spawnManaged(
      {
        name: GATEWAY_PROCESS_NAME,
        executable: execResult.path,
        args,
        env: { IPC_PIPE_ADDRESS: ipcAddress, ...getBeaconEnv(), ...libeditorEnv },
        healthyAfterMs: 3e3
      },
      restartPolicy
    );
  } catch (err) {
    log2.error(`spawnManaged 失败: ${err.message}`);
    markSubprocessReady("gateway", "error", err.message);
    reportBeaconRealtimeEvent(GATEWAY_REPORT_EVENTS.SPAWN_FAILURE, {
      error: err.message,
      executable_path: execResult.path
    });
    reportBeaconRealtimeEvent(GATEWAY_REPORT_EVENTS.START_FAILURE, {
      error: err.message
    });
    stopAccountNotifier();
    await stopIpcServer().catch(() => void 0);
    throw err;
  }
  const timeoutMs = INIT_WAIT_TIMEOUT_MS;
  let initParams;
  try {
    initParams = await waitForInit(timeoutMs);
  } catch (err) {
    log2.error(`等待 base.init 超时或失败: ${err.message}`);
    markSubprocessReady("gateway", "timeout", err.message);
    reportBeaconRealtimeEvent(GATEWAY_REPORT_EVENTS.WAIT_INIT_FAILURE, {
      error: err.message,
      timeout_ms: String(timeoutMs)
    });
    reportBeaconRealtimeEvent(GATEWAY_REPORT_EVENTS.START_FAILURE, {
      error: err.message
    });
    await stopManaged(GATEWAY_PROCESS_NAME).catch(() => void 0);
    stopAccountNotifier();
    await stopIpcServer().catch(() => void 0);
    throw err;
  }
  registerPort({
    name: "gateway",
    host: "127.0.0.1",
    port: initParams.port,
    token: initParams.token,
    registeredAt: Date.now()
  });
  markSubprocessReady("gateway", "ready");
  const disposePortUpdate = onGatewayPortUpdated((params) => {
    log2.info(`网关 base.init 更新端口登记: port=${params.port} token=${params.token.slice(0, 4)}***${params.token.slice(-4)}`);
    reportBeaconEvent(GATEWAY_REPORT_EVENTS.PORT_UPDATE, {
      port: String(params.port)
    });
    registerPort({
      name: "gateway",
      host: "127.0.0.1",
      port: params.port,
      token: params.token,
      registeredAt: Date.now()
    });
  });
  const disposeDisconnect = onDisconnect(() => {
    log2.warn("网关 IPC 连接断开，清理端口登记");
    unregisterPort("gateway");
  });
  lastStart = {
    socketPath,
    executablePath: execResult.path,
    mcpSocketPath,
    disposePortUpdate,
    disposeDisconnect
  };
  log2.info(`网关已就绪: port=${initParams.port} gateway_version=${initParams.gateway_version}`);
  reportBeaconEvent(GATEWAY_REPORT_EVENTS.START_SUCCESS, {
    port: String(initParams.port),
    gateway_version: initParams.gateway_version,
    executable_path: execResult.path
  });
  const handle2 = getHandle(GATEWAY_PROCESS_NAME);
  if (!handle2) {
    disposePortUpdate();
    disposeDisconnect();
    throw new Error("内部错误: 网关进程句柄丢失");
  }
  return {
    handle: handle2,
    port: initParams.port,
    token: initParams.token,
    gatewayVersion: initParams.gateway_version,
    socketPath,
    executablePath: execResult.path,
    mcpSocketPath
  };
}
async function stopGateway(timeoutMs) {
  const log2 = getModuleLogger$a();
  if (lastStart?.disposePortUpdate) {
    try {
      lastStart.disposePortUpdate();
    } catch (err) {
      log2.warn(`disposePortUpdate 异常: ${err.message}`);
    }
  }
  if (lastStart?.disposeDisconnect) {
    try {
      lastStart.disposeDisconnect();
    } catch (err) {
      log2.warn(`disposeDisconnect 异常: ${err.message}`);
    }
  }
  await stopManaged(GATEWAY_PROCESS_NAME, timeoutMs).catch((err) => {
    log2.warn(`stopManaged 异常: ${err.message}`);
  });
  unregisterPort("gateway");
  try {
    stopAccountNotifier();
  } catch (err) {
    log2.warn(`stopAccountNotifier 异常: ${err.message}`);
  }
  await stopIpcServer().catch((err) => {
    log2.warn(`stopIpcServer 异常: ${err.message}`);
  });
  await stopMcpIpcServer().catch((err) => {
    log2.warn(`stopMcpIpcServer 异常: ${err.message}`);
  });
  const stoppedSocketPath = lastStart?.socketPath ?? "";
  const stoppedExecutablePath = lastStart?.executablePath ?? "";
  lastStart = null;
  log2.info("网关已停止");
  reportBeaconEvent(GATEWAY_REPORT_EVENTS.STOP, {
    socket_path: stoppedSocketPath,
    executable_path: stoppedExecutablePath
  });
}
function setGatewayClientVersion(version) {
  setClientVersion(version);
}
function expandTilde(p) {
  if (!p) return p;
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return join(homedir(), p.slice(2));
  }
  return p;
}
function toAbsolute(p) {
  const expanded = expandTilde(p);
  return isAbsolute(expanded) ? expanded : resolve(process.cwd(), expanded);
}
function getUserDataDir() {
  try {
    return app.getPath("userData");
  } catch {
    return process.cwd();
  }
}
function resolveDataPaths(opts) {
  const homeDirRaw = process.env[ENV_KB_HOME_DIR]?.trim() || join(getUserDataDir(), DEFAULT_KB_HOME_DIR_NAME);
  const homeDir = toAbsolute(homeDirRaw);
  const logDirRaw = process.env[ENV_KB_LOG_DIR]?.trim() || getLogDir() || join(homeDir, DEFAULT_KB_LOG_SUBDIR);
  const logDir = toAbsolute(logDirRaw);
  const portFileRaw = process.env[ENV_KB_PORT_FILE]?.trim() || join(homeDir, DEFAULT_KB_PORT_FILE_NAME);
  const portFile = toAbsolute(portFileRaw);
  const lockFileRaw = process.env[ENV_KB_LOCK_FILE]?.trim() || join(homeDir, DEFAULT_KB_LOCK_FILE_NAME);
  const lockFile = toAbsolute(lockFileRaw);
  const startFrom = process.env[ENV_KB_START_FROM]?.trim() || DEFAULT_KB_START_FROM;
  return { homeDir, logDir, portFile, lockFile, startFrom };
}
function ensureDataDirs(paths) {
  const dirsToEnsure = /* @__PURE__ */ new Set([
    paths.homeDir,
    paths.logDir,
    dirname(paths.portFile),
    dirname(paths.lockFile)
  ]);
  for (const d of dirsToEnsure) {
    if (!existsSync(d)) {
      mkdirSync(d, { recursive: true });
    }
  }
}
function resolveExecutablePath(overridePath) {
  const tried = [];
  const envPath = process.env[ENV_KB_PATH];
  if (envPath && envPath.trim().length > 0) {
    tried.push(envPath);
    if (existsSync(envPath)) {
      ensureExecutable(envPath);
      return { path: envPath, source: "env", triedPaths: tried };
    }
  }
  for (const candidate of buildDefaultCandidates()) {
    tried.push(candidate);
    if (existsSync(candidate)) {
      ensureExecutable(candidate);
      return { path: candidate, source: "default", triedPaths: tried };
    }
  }
  const pathHit = lookupInSystemPath(KB_EXECUTABLE_NAME);
  if (pathHit) {
    tried.push(`PATH: ${pathHit}`);
    ensureExecutable(pathHit);
    return { path: pathHit, source: "path", triedPaths: tried };
  }
  throw buildNotFoundError(tried);
}
function buildDefaultCandidates() {
  const cwd = process.cwd();
  const candidates2 = [];
  const { resourcesPath } = process;
  if (resourcesPath) {
    try {
      const { app: app2 } = require2("electron");
      const componentsPath = join(app2.getPath("userData"), "components", "MarvisKnowledgebase", "Current", KB_EXECUTABLE_NAME);
      candidates2.push(componentsPath);
    } catch {
    }
    candidates2.push(join(resourcesPath, "knowledgebase", KB_EXECUTABLE_NAME));
    candidates2.push(join(resourcesPath, "bin", KB_EXECUTABLE_NAME));
  }
  candidates2.push(join(cwd, "resources", "knowledgebase", KB_EXECUTABLE_NAME));
  candidates2.push(join(
    cwd,
    "..",
    "agent-core",
    "ai-assistant-knowledgebase-1.0.0-darwin-arm64",
    KB_EXECUTABLE_NAME
  ));
  candidates2.push(join(cwd, "..", "ai-assistant-knowledgebase", "dist", KB_EXECUTABLE_NAME));
  return candidates2;
}
function lookupInSystemPath(name) {
  try {
    const cmd = process.platform === "win32" ? `where ${name}` : `which ${name}`;
    const output = execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").trim();
    const firstLine = output.split("\n")[0]?.trim();
    if (firstLine && isAbsolute(firstLine) && existsSync(firstLine)) {
      return firstLine;
    }
  } catch {
  }
  return null;
}
function ensureExecutable(absPath) {
  if (process.platform === "win32") return;
  try {
    accessSync(absPath, constants.X_OK);
    return;
  } catch {
  }
  try {
    const st = statSync$1(absPath);
    const newMode = st.mode & 511 | 73;
    chmodSync(absPath, newMode);
    accessSync(absPath, constants.X_OK);
  } catch (err) {
    const msg = [
      `可执行文件缺少执行权限且自动修复失败: ${absPath}`,
      `原始错误: ${err.message}`,
      `请手动执行: chmod +x "${absPath}"`
    ].join("\n");
    throw new Error(msg);
  }
}
function buildNotFoundError(tried, summary) {
  const lines = [
    `无法找到 ${KB_EXECUTABLE_NAME} 可执行文件`,
    "已尝试的路径（按优先级）：",
    ...tried.map((p, i) => `  ${i + 1}. ${p}`),
    "",
    "请检查：",
    `  - 设置环境变量 ${ENV_KB_PATH}=/path/to/${KB_EXECUTABLE_NAME}`,
    `  - 或在项目根 .env 文件中配置 ${ENV_KB_PATH}`,
    `  - 或将知识库产物放在 resources/knowledgebase/${KB_EXECUTABLE_NAME}`
  ];
  return new Error(lines.join("\n"));
}
function createKbNotifier() {
  let logger2 = null;
  const log2 = () => {
    if (!logger2) logger2 = getLogger("kb-notifier");
    return logger2;
  };
  let pendingPort = 0;
  let notifiedPort = 0;
  let pollTimer2 = null;
  let pollAttempts = 0;
  let disposeOnConnect = null;
  let disposeOnDisconnect = null;
  let stopped = false;
  const clearPoll = () => {
    if (pollTimer2) {
      clearInterval(pollTimer2);
      pollTimer2 = null;
      pollAttempts = 0;
    }
  };
  const doNotify = (port) => {
    if (port <= 0) {
      log2().warn(`doNotify 忽略非法 port=${port}`);
      return false;
    }
    if (!isConnected()) {
      log2().debug(`doNotify: 网关 IPC 未连接，跳过（port=${port}）`);
      return false;
    }
    const ok2 = sendMessage("knowledgebase", "onKnowledgebaseLaunch", { port });
    if (ok2) {
      log2().info(`knowledgebase.onKnowledgebaseLaunch 已发送: port=${port}`);
    } else {
      log2().warn(`knowledgebase.onKnowledgebaseLaunch 发送失败（socket 不可写）: port=${port}`);
    }
    return ok2;
  };
  const startPolling2 = () => {
    if (pollTimer2) return;
    pollAttempts = 0;
    log2().info(`启动 knowledgebase.onKnowledgebaseLaunch 轮询: interval=${KB_NOTIFIER_RETRY_INTERVAL_MS}ms max=${KB_NOTIFIER_MAX_ATTEMPTS}`);
    pollTimer2 = setInterval(() => {
      if (stopped) {
        clearPoll();
        return;
      }
      pollAttempts += 1;
      if (notifiedPort === pendingPort && pendingPort > 0) {
        clearPoll();
        return;
      }
      if (pendingPort <= 0) {
        clearPoll();
        return;
      }
      log2().debug(`knowledgebase.onKnowledgebaseLaunch 重试 (${pollAttempts}/${KB_NOTIFIER_MAX_ATTEMPTS}) port=${pendingPort}`);
      if (doNotify(pendingPort)) {
        notifiedPort = pendingPort;
        clearPoll();
        return;
      }
      if (pollAttempts >= KB_NOTIFIER_MAX_ATTEMPTS) {
        log2().warn(`knowledgebase.onKnowledgebaseLaunch 轮询失败，已达最大次数 ${KB_NOTIFIER_MAX_ATTEMPTS}，停止重试（等待网关重连）`);
        clearPoll();
      }
    }, KB_NOTIFIER_RETRY_INTERVAL_MS);
    pollTimer2.unref?.();
  };
  const ensureOnConnectSubscribed = () => {
    if (disposeOnConnect) return;
    disposeOnDisconnect = onDisconnect(() => {
      if (stopped) return;
      if (notifiedPort > 0) {
        log2().debug(`网关断开，清零 notifiedPort（原值=${notifiedPort}），等待重连后重推`);
        notifiedPort = 0;
      }
    });
    disposeOnConnect = onConnect(() => {
      if (stopped) return;
      if (pendingPort > 0 && notifiedPort !== pendingPort) {
        log2().info(`网关重连，重推 knowledgebase.onKnowledgebaseLaunch port=${pendingPort}`);
        if (doNotify(pendingPort)) {
          notifiedPort = pendingPort;
          clearPoll();
        }
      }
    });
  };
  return {
    tryNotify(port) {
      if (stopped) {
        log2().warn("tryNotify 被忽略：notifier 已停止");
        return false;
      }
      if (port <= 0 || port > 65535) {
        log2().warn(`tryNotify 忽略非法 port=${port}`);
        return false;
      }
      ensureOnConnectSubscribed();
      if (pendingPort !== port) {
        pendingPort = port;
        notifiedPort = 0;
        clearPoll();
      }
      if (notifiedPort === port) {
        return true;
      }
      if (doNotify(port)) {
        notifiedPort = port;
        return true;
      }
      startPolling2();
      return false;
    },
    reset() {
      log2().debug(`reset notifier: pending=${pendingPort} notified=${notifiedPort}`);
      pendingPort = 0;
      notifiedPort = 0;
      clearPoll();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearPoll();
      if (disposeOnConnect) {
        try {
          disposeOnConnect();
        } catch {
        }
        disposeOnConnect = null;
      }
      if (disposeOnDisconnect) {
        try {
          disposeOnDisconnect();
        } catch {
        }
        disposeOnDisconnect = null;
      }
      pendingPort = 0;
      notifiedPort = 0;
      log2().info("kb-notifier 已停止");
    },
    getNotifiedPort() {
      return notifiedPort;
    }
  };
}
function createLaunchLimiter(options) {
  const minIntervalMs = KB_LAUNCH_LIMIT_MIN_INTERVAL_MS;
  const maxPerHour = KB_LAUNCH_LIMIT_MAX_PER_HOUR;
  const windowMs = KB_LAUNCH_LIMIT_WINDOW_MS;
  let timestamps = [];
  const prune = (now) => {
    const windowStart = now - windowMs;
    timestamps = timestamps.filter((t) => t >= windowStart);
  };
  return {
    tryAcquire(now = Date.now()) {
      prune(now);
      const last = timestamps.length > 0 ? timestamps[timestamps.length - 1] : 0;
      if (last > 0 && now - last < minIntervalMs) {
        const waitMs = minIntervalMs - (now - last);
        return {
          ok: false,
          reason: `rate-limited-min-interval (wait ${waitMs}ms)`
        };
      }
      if (timestamps.length >= maxPerHour) {
        return {
          ok: false,
          reason: `rate-limited-max-per-hour (${timestamps.length}/${maxPerHour})`
        };
      }
      return { ok: true };
    },
    record(now = Date.now()) {
      prune(now);
      timestamps.push(now);
    },
    reset() {
      timestamps = [];
    },
    _snapshot() {
      return [...timestamps];
    }
  };
}
const execFileAsync$4 = promisify(execFile$1);
let logger$W = null;
function log$8() {
  if (!logger$W) logger$W = getLogger("knowledgebase:orphan-cleaner");
  return logger$W;
}
async function findOrphanPids(executablePath) {
  if (process.platform === "win32") {
    return [];
  }
  let stdout;
  try {
    const result = await execFileAsync$4("ps", ["-ax", "-o", "pid=,command="], {
      // 防御超大输出（几千个进程也到不了 MB 级）
      maxBuffer: 8 * 1024 * 1024,
      // 不要继承 stdio，避免 pipe 泄漏
      windowsHide: true
    });
    stdout = result.stdout;
  } catch (err) {
    log$8().warn(`ps 扫描失败，跳过孤儿清理: ${err.message}`);
    return [];
  }
  const excludePids = /* @__PURE__ */ new Set([process.pid, process.ppid ?? 0]);
  const pids = [];
  for (const raw of stdout.split("\n")) {
    const line = raw.trimStart();
    if (!line) continue;
    const spaceIdx = line.indexOf(" ");
    if (spaceIdx <= 0) continue;
    const pidStr = line.slice(0, spaceIdx);
    const command = line.slice(spaceIdx + 1).trimStart();
    const pid = Number.parseInt(pidStr, 10);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    if (excludePids.has(pid)) continue;
    if (command === executablePath) {
      pids.push(pid);
    } else if (command.startsWith(`${executablePath} `)) {
      pids.push(pid);
    }
  }
  return pids;
}
function killPid(pid, signal = "SIGKILL") {
  try {
    process.kill(pid, signal);
    return true;
  } catch (err) {
    const e = err;
    if (e.code === "ESRCH") return true;
    log$8().warn(`kill pid=${pid} 失败: code=${e.code ?? "?"} msg=${e.message}`);
    return false;
  }
}
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const e = err;
    if (e.code === "ESRCH") return false;
    return true;
  }
}
async function cleanupOrphanKbProcesses(executablePath, opts) {
  const result = {
    foundPids: [],
    killedPids: [],
    survivedPids: []
  };
  if (process.platform === "win32") {
    return result;
  }
  const gracefulMs = 500;
  const settleMs = 200;
  const pids = await findOrphanPids(executablePath);
  result.foundPids = pids;
  if (pids.length === 0) {
    log$8().info(`未发现残留 KB 孤儿进程 (executable=${executablePath})`);
    return result;
  }
  log$8().warn(`发现 ${pids.length} 个残留 KB 孤儿进程，开始清理: pids=[${pids.join(",")}]`);
  for (const pid of pids) {
    killPid(pid, "SIGTERM");
  }
  {
    await new Promise((resolve2) => setTimeout(resolve2, gracefulMs));
  }
  const stillAlive = pids.filter(isAlive);
  if (stillAlive.length > 0) {
    log$8().info(`SIGTERM 后仍有 ${stillAlive.length} 个进程存活，发送 SIGKILL: pids=[${stillAlive.join(",")}]`);
    for (const pid of stillAlive) {
      killPid(pid, "SIGKILL");
    }
  }
  {
    await new Promise((resolve2) => setTimeout(resolve2, settleMs));
  }
  for (const pid of pids) {
    if (isAlive(pid)) {
      result.survivedPids.push(pid);
    } else {
      result.killedPids.push(pid);
    }
  }
  if (result.survivedPids.length > 0) {
    log$8().warn(`清理后仍有 ${result.survivedPids.length} 个进程存活: pids=[${result.survivedPids.join(",")}]`);
  } else {
    log$8().info(`孤儿清理完成: killed=${result.killedPids.length} (pids=[${result.killedPids.join(",")}])`);
  }
  return result;
}
async function killOrphansByPids(pids, opts) {
  const result = {
    foundPids: [...pids],
    killedPids: [],
    survivedPids: []
  };
  if (process.platform === "win32") {
    return result;
  }
  if (pids.length === 0) {
    return result;
  }
  const gracefulMs = 500;
  const settleMs = 200;
  log$8().warn(`[snapshot-cleanup] 开始按快照清理 ${pids.length} 个 KB 孤儿 pid: [${pids.join(",")}]`);
  for (const pid of pids) {
    killPid(pid, "SIGTERM");
  }
  {
    await new Promise((resolve2) => setTimeout(resolve2, gracefulMs));
  }
  const stillAlive = pids.filter(isAlive);
  if (stillAlive.length > 0) {
    log$8().info(`[snapshot-cleanup] SIGTERM 后仍有 ${stillAlive.length} 个进程存活，发送 SIGKILL: pids=[${stillAlive.join(",")}]`);
    for (const pid of stillAlive) {
      killPid(pid, "SIGKILL");
    }
  }
  {
    await new Promise((resolve2) => setTimeout(resolve2, settleMs));
  }
  for (const pid of pids) {
    if (isAlive(pid)) {
      result.survivedPids.push(pid);
    } else {
      result.killedPids.push(pid);
    }
  }
  if (result.survivedPids.length > 0) {
    log$8().warn(`[snapshot-cleanup] 清理后仍有 ${result.survivedPids.length} 个进程存活: pids=[${result.survivedPids.join(",")}]`);
  } else {
    log$8().info(`[snapshot-cleanup] 快照孤儿清理完成: killed=${result.killedPids.length} (pids=[${result.killedPids.join(",")}])`);
  }
  return result;
}
const KNOWLEDGEBASE_MOD_ID = "knowledgebase";
const KNOWLEDGEBASE_MOD_NAME = "知识库管理";
const KNOWLEDGEBASE_REPORT_EVENTS = {
  /** 知识库子进程启动成功 */
  START_SUCCESS: "knowledgebase__start_success",
  /** 知识库子进程启动失败（严重错误，实时上报） */
  START_FAILED: "knowledgebase__start_failed",
  /** 端口就绪 */
  PORT_READY: "knowledgebase__port_ready",
  /** 知识库停止完成 */
  STOP_COMPLETE: "knowledgebase__stop_complete",
  /** 熔断触发（严重错误，实时上报） */
  CIRCUIT_OPEN: "knowledgebase__circuit_open",
  /** 自动重启同步成功 */
  AUTO_RESTART_SYNC: "knowledgebase__auto_restart_sync"
};
let logger$V = null;
function log$7() {
  if (!logger$V) logger$V = getLogger("knowledgebase");
  return logger$V;
}
const state$5 = {
  current: null,
  notifier: null,
  exitHandlers: /* @__PURE__ */ new Set(),
  portReadyHandlers: /* @__PURE__ */ new Set(),
  disposeProcSub: null,
  pendingStopReason: null,
  starting: false,
  stopping: false,
  restarting: false,
  portWatchCancel: null,
  autoRestartInFlight: false,
  portRegisteredAt: 0
};
const launchLimiter = createLaunchLimiter();
function emitExit(ev) {
  for (const h of state$5.exitHandlers) {
    try {
      h(ev);
    } catch (err) {
      log$7().warn(`kb exit 订阅者抛出异常: ${err.message}`);
    }
  }
}
function emitPortReady(ev) {
  void reportBeaconEvent(KNOWLEDGEBASE_REPORT_EVENTS.PORT_READY, {
    mod_id: KNOWLEDGEBASE_MOD_ID,
    mod_name: KNOWLEDGEBASE_MOD_NAME,
    port: String(ev.port)
  });
  for (const h of state$5.portReadyHandlers) {
    try {
      h(ev);
    } catch (err) {
      log$7().warn(`kb portReady 订阅者抛出异常: ${err.message}`);
    }
  }
}
function ensureProcSubscription() {
  if (state$5.disposeProcSub) return;
  state$5.disposeProcSub = onProcessEvent((ev) => {
    if (ev.name !== KB_PROCESS_NAME) return;
    switch (ev.type) {
      case "stderr":
        log$7().warn(`[knowledgebase stderr] ${ev.line}`);
        break;
      case "stdout":
        log$7().debug(`[knowledgebase stdout] ${ev.line}`);
        break;
      case "exit": {
        const reason = state$5.pendingStopReason ?? (ev.code === 0 ? "shutdown" : "error");
        log$7().info(`Knowledgebase 退出: code=${ev.code ?? "null"} signal=${ev.signal ?? "null"} reason=${reason}`);
        if (state$5.pendingStopReason === null) {
          unregisterPort("knowledgebase");
          state$5.notifier?.reset();
          if (state$5.current) {
            const execPathForSnapshot = state$5.current.executablePath;
            state$5.current = {
              ...state$5.current,
              port: 0
            };
            state$5.autoRestartInFlight = true;
            void findOrphanPids(execPathForSnapshot).then((pids) => {
              if (pids.length === 0) {
                log$7().info("[auto-restart] exit 快照：未发现残留 worker 孤儿");
                return;
              }
              log$7().warn(`[auto-restart] exit 快照：发现 ${pids.length} 个 worker 孤儿，将在新 spawn 前清理: pids=[${pids.join(",")}]`);
              return killOrphansByPids(pids);
            }).catch((err) => {
              log$7().warn(`[auto-restart] 快照孤儿清理异常（忽略，不影响重启）: ${err.message}`);
            });
          }
          emitExit({
            status: "exited",
            exitCode: ev.code,
            reason
          });
        }
        break;
      }
      case "stopped": {
        const reason = state$5.pendingStopReason ?? "shutdown";
        log$7().info(`Knowledgebase 已主动停止 (reason=${reason})`);
        unregisterPort("knowledgebase");
        state$5.notifier?.stop();
        state$5.notifier = null;
        state$5.current = null;
        state$5.autoRestartInFlight = false;
        emitExit({
          status: "exited",
          exitCode: null,
          reason
        });
        state$5.pendingStopReason = null;
        break;
      }
      case "circuit-open":
        log$7().error(`Knowledgebase 熔断: ${ev.reason}`);
        void reportBeaconRealtimeEvent(KNOWLEDGEBASE_REPORT_EVENTS.CIRCUIT_OPEN, {
          mod_id: KNOWLEDGEBASE_MOD_ID,
          mod_name: KNOWLEDGEBASE_MOD_NAME,
          reason: String(ev.reason ?? "")
        });
        unregisterPort("knowledgebase");
        state$5.notifier?.stop();
        state$5.notifier = null;
        state$5.current = null;
        state$5.autoRestartInFlight = false;
        emitExit({
          status: "exited",
          exitCode: null,
          reason: "error"
        });
        break;
      case "spawned":
        log$7().info(`Knowledgebase spawned: pid=${ev.pid}`);
        if (state$5.autoRestartInFlight && !state$5.starting) {
          void syncAfterAutoRestart();
        }
        break;
    }
  });
}
async function syncAfterAutoRestart() {
  if (state$5.portWatchCancel) return;
  const snapshot2 = state$5.current;
  if (!snapshot2) {
    return;
  }
  deleteIfExists(snapshot2.portFile);
  const watch2 = watchPortFile(snapshot2.portFile, DEFAULT_KB_PORT_READY_TIMEOUT_MS);
  state$5.portWatchCancel = watch2.cancel;
  let port;
  try {
    port = await watch2.promise;
  } catch (err) {
    log$7().warn(`[auto-restart] 新端口就绪超时: ${err.message}`);
    state$5.portWatchCancel = null;
    return;
  } finally {
    if (state$5.portWatchCancel === watch2.cancel) {
      state$5.portWatchCancel = null;
    }
  }
  if (!state$5.current) {
    log$7().info("[auto-restart] 等待端口期间 state 已被清理，放弃本轮同步");
    return;
  }
  const autoRestartPortRegisteredNow = Date.now();
  state$5.portRegisteredAt = autoRestartPortRegisteredNow;
  state$5.current = { ...state$5.current, port };
  registerPort({
    name: "knowledgebase",
    host: "127.0.0.1",
    port,
    registeredAt: autoRestartPortRegisteredNow
  });
  if (!state$5.notifier) {
    state$5.notifier = createKbNotifier();
  }
  state$5.notifier.tryNotify(port);
  emitPortReady({ port });
  state$5.autoRestartInFlight = false;
  void reportBeaconEvent(KNOWLEDGEBASE_REPORT_EVENTS.AUTO_RESTART_SYNC, {
    mod_id: KNOWLEDGEBASE_MOD_ID,
    mod_name: KNOWLEDGEBASE_MOD_NAME,
    port: String(port)
  });
  log$7().info(`[auto-restart] 新端口已同步: port=${port}`);
}
function buildKbArgs(params) {
  return [
    `--start_from=${params.startFrom}`,
    `--home_dir=${params.homeDir}`,
    `--log_dir=${params.logDir}`,
    `--lock_file=${params.lockFile}`,
    `--port_file=${params.portFile}`
  ];
}
function isKbEnabled() {
  return process.env[ENV_KB_ENABLED] !== "false";
}
async function startKb(opts, restartPolicy) {
  if (!isKbEnabled()) {
    throw new Error(`Knowledgebase 未启用（请设置 ${ENV_KB_ENABLED}=true）`);
  }
  ensureProcSubscription();
  if (state$5.starting) {
    throw new Error("Knowledgebase 正在启动中，请稍后重试");
  }
  if (state$5.current) {
    throw new Error("Knowledgebase 已启动，请先调用 stopKb()");
  }
  state$5.starting = true;
  try {
    const execResult = resolveExecutablePath(opts?.executablePath);
    log$7().info(`${KB_EXECUTABLE_NAME} 路径命中(${execResult.source}): ${execResult.path}`);
    await cleanupOrphanKbProcesses(execResult.path).catch((err) => {
      log$7().warn(`孤儿清理出现意外错误（不阻塞启动）: ${err.message}`);
    });
    const paths = resolveDataPaths(opts);
    ensureDataDirs(paths);
    log$7().info(`数据路径: home_dir=${paths.homeDir} log_dir=${paths.logDir} port_file=${paths.portFile} lock_file=${paths.lockFile} start_from=${paths.startFrom}`);
    deleteIfExists(paths.portFile);
    const timeoutMs = opts?.portReadyTimeoutMs ?? DEFAULT_KB_PORT_READY_TIMEOUT_MS;
    const watch2 = watchPortFile(paths.portFile, timeoutMs);
    state$5.portWatchCancel = watch2.cancel;
    const args = buildKbArgs({
      startFrom: paths.startFrom,
      homeDir: paths.homeDir,
      logDir: paths.logDir,
      lockFile: paths.lockFile,
      portFile: paths.portFile
    });
    const policy = {
      ...DEFAULT_KB_RESTART_POLICY,
      ...restartPolicy
    };
    log$7().info(`启动 Knowledgebase: ${execResult.path} ${args.join(" ")}`);
    markSubprocessSpawn("kb");
    try {
      spawnManaged(
        {
          name: KB_PROCESS_NAME,
          executable: execResult.path,
          args,
          // PYTHONUNBUFFERED=1：让 Python 端启动阶段异常堆栈能被 process-manager
          // 实时按行捕获打到 main.log（对齐 AgentCore 的做法）。
          env: { PYTHONUNBUFFERED: "1", ...getBeaconEnv() },
          healthyAfterMs: DEFAULT_KB_HEALTHY_AFTER_MS,
          // KB 是 PyInstaller + Python multiprocessing，主进程会 fork 出多个 worker
          // 子进程（--multiprocessing-fork / resource_tracker）。POSIX 下父进程被
          // SIGTERM/SIGKILL 时，这些 worker 不会级联退出，会被 launchd 收养成孤儿
          // （ppid=1），继续占 ~370MB RAM × N，用户在活动监视器里能看到残留。
          //
          // 开启 processGroup 后：spawn 时 `detached: true`，子进程独占一个 session
          // /进程组，stop 时 process-manager 会用 `process.kill(-pgid)` 把整组打包
          // kill，worker 不再残留。AgentCore 不走这条（没有自己 fork worker），
          // 保持 false 以避免多余复杂度。
          processGroup: true
        },
        policy
      );
    } catch (err) {
      state$5.portWatchCancel?.();
      state$5.portWatchCancel = null;
      markSubprocessReady("kb", "error", err.message);
      void reportBeaconRealtimeEvent(KNOWLEDGEBASE_REPORT_EVENTS.START_FAILED, {
        mod_id: KNOWLEDGEBASE_MOD_ID,
        mod_name: KNOWLEDGEBASE_MOD_NAME,
        error_msg: err.message
      });
      throw err;
    }
    launchLimiter.record();
    let port;
    try {
      port = await watch2.promise;
    } catch (err) {
      log$7().error(`端口文件就绪超时/失败: ${err.message}`);
      markSubprocessReady("kb", "timeout", err.message);
      void reportBeaconRealtimeEvent(KNOWLEDGEBASE_REPORT_EVENTS.START_FAILED, {
        mod_id: KNOWLEDGEBASE_MOD_ID,
        mod_name: KNOWLEDGEBASE_MOD_NAME,
        error_msg: err.message
      });
      state$5.pendingStopReason = "error";
      await stopManaged(KB_PROCESS_NAME).catch(() => void 0);
      state$5.pendingStopReason = null;
      throw err;
    } finally {
      state$5.portWatchCancel = null;
    }
    const portRegisteredNow = Date.now();
    state$5.portRegisteredAt = portRegisteredNow;
    registerPort({
      name: "knowledgebase",
      host: "127.0.0.1",
      port,
      registeredAt: portRegisteredNow
    });
    markSubprocessReady("kb", "ready");
    if (!state$5.notifier) {
      state$5.notifier = createKbNotifier();
    }
    state$5.notifier.tryNotify(port);
    state$5.current = {
      port,
      executablePath: execResult.path,
      portFile: paths.portFile,
      lockFile: paths.lockFile,
      homeDir: paths.homeDir,
      logDir: paths.logDir
    };
    const handle2 = getHandle(KB_PROCESS_NAME);
    if (!handle2) {
      throw new Error("Knowledgebase 启动后 process-manager handle 丢失");
    }
    emitPortReady({ port });
    log$7().info(`Knowledgebase 就绪: port=${port}`);
    void reportBeaconEvent(KNOWLEDGEBASE_REPORT_EVENTS.START_SUCCESS, {
      mod_id: KNOWLEDGEBASE_MOD_ID,
      mod_name: KNOWLEDGEBASE_MOD_NAME,
      port: String(port),
      executable_path: execResult.path
    });
    return {
      handle: handle2,
      port,
      executablePath: execResult.path,
      portFile: paths.portFile,
      lockFile: paths.lockFile,
      homeDir: paths.homeDir,
      logDir: paths.logDir
    };
  } finally {
    state$5.starting = false;
  }
}
async function stopKb(timeoutMs = 5e3, reason = "shutdown") {
  if (state$5.stopping) {
    log$7().debug("stopKb: 已在停止中，跳过");
    return;
  }
  const handle2 = getHandle(KB_PROCESS_NAME);
  if (!state$5.current && !handle2) {
    state$5.portWatchCancel?.();
    state$5.portWatchCancel = null;
    return;
  }
  const execForCleanup = state$5.current?.executablePath ?? null;
  state$5.stopping = true;
  state$5.pendingStopReason = reason;
  try {
    state$5.portWatchCancel?.();
    state$5.portWatchCancel = null;
    await stopManaged(KB_PROCESS_NAME, timeoutMs).catch((err) => {
      log$7().warn(`stopManaged(knowledgebase) 异常: ${err.message}`);
    });
    if (state$5.current || state$5.notifier) {
      log$7().warn("stopKb: stopManaged 返回后仍有残留 state，主动兜底清理");
      unregisterPort("knowledgebase");
      state$5.notifier?.stop();
      state$5.notifier = null;
      state$5.current = null;
      emitExit({
        status: "exited",
        exitCode: null,
        reason
      });
    }
    state$5.autoRestartInFlight = false;
    state$5.pendingStopReason = null;
    if (execForCleanup) {
      await cleanupOrphanKbProcesses(execForCleanup).catch((err) => {
        log$7().warn(`stopKb 兑底孤儿清理异常（忽略）: ${err.message}`);
      });
    }
    void reportBeaconEvent(KNOWLEDGEBASE_REPORT_EVENTS.STOP_COMPLETE, {
      mod_id: KNOWLEDGEBASE_MOD_ID,
      mod_name: KNOWLEDGEBASE_MOD_NAME,
      reason: String(reason)
    });
  } finally {
    state$5.stopping = false;
  }
}
async function restartKb() {
  if (!isKbEnabled()) {
    return "failed";
  }
  if (state$5.restarting) {
    return "in-progress";
  }
  const KB_COLD_START_WINDOW_MS = 9e4;
  if (state$5.starting) {
    log$7().info("restartKb: 拒绝 — state.starting=true（KB 仍在启动流程中）");
    return "in-progress";
  }
  if (state$5.current && state$5.portRegisteredAt > 0) {
    const kbAgeMs = Date.now() - state$5.portRegisteredAt;
    if (kbAgeMs < KB_COLD_START_WINDOW_MS) {
      log$7().info(`restartKb: 拒绝 — KB 端口就绪仅 ${kbAgeMs}ms < ${KB_COLD_START_WINDOW_MS}ms 冷启动窗口（可能仍在 AsyncInit）`);
      return "in-progress";
    }
  }
  state$5.restarting = true;
  try {
    if (state$5.current) {
      try {
        await stopKb(5e3, "shutdown");
      } catch (err) {
        log$7().error(`restartKb.stop 失败: ${err.message}`);
        return "failed";
      }
      await new Promise((resolve2) => setTimeout(resolve2, 500));
    }
    try {
      resetCircuit(KB_PROCESS_NAME);
      const result = await startKb();
      log$7().info(`restartKb.start 完成: port=${result.port}`);
      return "success";
    } catch (err) {
      log$7().error(`restartKb.start 失败: ${err.message}`);
      return "failed";
    }
  } finally {
    state$5.restarting = false;
  }
}
async function launchKbByLimit() {
  if (!isKbEnabled()) {
    return { ok: false, reason: "disabled" };
  }
  if (state$5.current) {
    return { ok: false, reason: "already-running" };
  }
  if (state$5.starting) {
    return { ok: false, reason: "already-starting" };
  }
  const acquire = launchLimiter.tryAcquire();
  if (!acquire.ok) {
    log$7().info(`launchKbByLimit 被限流: ${acquire.reason}`);
    return { ok: false, reason: acquire.reason };
  }
  try {
    const result = await startKb();
    return { ok: true, reason: `started on port ${result.port}` };
  } catch (err) {
    log$7().warn(`launchKbByLimit 启动失败: ${err.message}`);
    return { ok: false, reason: `start-failed: ${err.message}` };
  }
}
function getKbPort() {
  if (state$5.current?.port) return state$5.current.port;
  if (!isKbEnabled()) return 0;
  try {
    const paths = resolveDataPaths();
    const res = readPortFileSync(paths.portFile);
    if (res.port) {
      log$7().debug(`getKbPort 从 INI 命中: ${res.port}（state.current 尚未赋值）`);
      return res.port;
    }
  } catch (err) {
    log$7().debug(`getKbPort INI 兜底读失败: ${err.message}`);
  }
  return 0;
}
async function awaitKbPort(timeoutMs = 5e3, pollIntervalMs = 50) {
  const immediate = getKbPort();
  if (immediate) return immediate;
  if (!isKbEnabled()) return 0;
  if (!state$5.starting) {
    log$7().debug("awaitKbPort: 非启动态，不等待，直接返回 0");
    return 0;
  }
  const startAt = Date.now();
  const deadline = startAt + Math.max(0, timeoutMs);
  while (Date.now() < deadline) {
    await new Promise((resolve2) => setTimeout(resolve2, pollIntervalMs));
    if (!state$5.starting && !state$5.current) {
      log$7().debug("awaitKbPort: 等待期间启动流程已终止，提前退出");
      return 0;
    }
    const hit = getKbPort();
    if (hit) {
      log$7().debug(`awaitKbPort 命中: port=${hit} 耗时=${Date.now() - startAt}ms`);
      return hit;
    }
  }
  log$7().warn(`awaitKbPort 超时 ${timeoutMs}ms，返回 0（state.starting=${state$5.starting}, current=${state$5.current ? "set" : "null"}）`);
  return 0;
}
function isKbRunning() {
  return state$5.current !== null;
}
function onKbExit(handler) {
  state$5.exitHandlers.add(handler);
  return () => state$5.exitHandlers.delete(handler);
}
function onKbPortReady(handler) {
  state$5.portReadyHandlers.add(handler);
  return () => state$5.portReadyHandlers.delete(handler);
}
const DAEMON_PROCESS_NAME = "MarvisService";
const PROTOCOL_VERSION = "1.0";
function defaultDaemonSocketPath() {
  return join(defaultDaemonDataDir(), "services", "daemon.sock");
}
const RECONNECT_DELAY_MS = 2e3;
const HANDSHAKE_TIMEOUT_MS = 1e4;
const CONNECT_TIMEOUT_MS = 5e3;
const MAX_LINE_LENGTH = 1048576;
const ENV_DAEMON_EXECUTABLE = "MARVIS_DAEMON_PATH";
const ENV_DAEMON_SOCKET_PATH = "MARVIS_DAEMON_SOCKET_PATH";
const ENV_DAEMON_DATA_DIR = "MARVIS_DAEMON_DATA_DIR";
const DAEMON_PID_FILENAME = "daemon.pid";
const METHOD_INIT = "init";
const METHOD_HEARTBEAT = "heartbeat";
const METHOD_FETCH_GUID = "fetchGuid";
const METHOD_UPDATE_GUID = "updateGuid";
const NAMESPACE_BASE = "base";
const NAMESPACE_CONNECTION = "connection";
const NAMESPACE_UPDATE = "update";
const METHOD_VERSION = "version";
const METHOD_UPDATE_REPLACE = "replace";
const METHOD_UPDATE_RESTART = "restart";
function defaultDaemonDataDir() {
  return app.getPath("userData");
}
function defaultDaemonPidPath() {
  return join(defaultDaemonDataDir(), "services", DAEMON_PID_FILENAME);
}
const UDS_PROBE_TIMEOUT_MS = 1e3;
const DAEMON_BRIDGE_REPORT_EVENTS = {
  /** daemon 进程确保就绪成功（含已在运行和新 spawn） */
  SPAWN_SUCCESS: "daemon_bridge__spawn_success",
  /** daemon 进程启动失败（严重错误，实时上报） */
  SPAWN_FAILURE: "daemon_bridge__spawn_failure",
  /** daemon 进程已在运行（无需 spawn） */
  ALREADY_RUNNING: "daemon_bridge__already_running",
  /** IPC 连接建立成功 */
  IPC_CONNECTED: "daemon_bridge__ipc_connected",
  /** IPC 连接断开 */
  IPC_DISCONNECTED: "daemon_bridge__ipc_disconnected",
  /** IPC 连接错误（严重错误，实时上报） */
  IPC_ERROR: "daemon_bridge__ipc_error",
  /** IPC 握手完成 */
  HANDSHAKE_SUCCESS: "daemon_bridge__handshake_success",
  /** IPC 握手超时（严重错误，实时上报） */
  HANDSHAKE_TIMEOUT: "daemon_bridge__handshake_timeout",
  /** daemon 版本检查结果：版本匹配 */
  VERSION_MATCH: "daemon_bridge__version_match",
  /** daemon 版本检查结果：版本不匹配，需要升级 */
  VERSION_MISMATCH: "daemon_bridge__version_mismatch",
  /** daemon 版本升级成功 */
  UPGRADE_SUCCESS: "daemon_bridge__upgrade_success",
  /** daemon 版本升级失败（严重错误，实时上报） */
  UPGRADE_FAILURE: "daemon_bridge__upgrade_failure",
  /** daemon 进程异常退出（IPC 意外断开 + 进程不存活，严重错误，实时上报） */
  PROCESS_CRASH: "daemon_bridge__process_crash",
  /** IPC 命令发送失败 */
  IPC_SEND_FAILURE: "daemon_bridge__ipc_send_failure",
  /** IPC 入站消息解析失败 */
  IPC_PARSE_ERROR: "daemon_bridge__ipc_parse_error"
};
function getModuleLogger$9() {
  return getLogger("daemon-lifecycle");
}
function probeUds(socketPath, timeoutMs = UDS_PROBE_TIMEOUT_MS) {
  return new Promise((resolve2) => {
    let settled = false;
    let socket = null;
    let timer2 = null;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      if (timer2) {
        clearTimeout(timer2);
        timer2 = null;
      }
      if (socket && !socket.destroyed) {
        try {
          socket.destroy();
        } catch {
        }
      }
      resolve2(result);
    };
    timer2 = setTimeout(() => {
      timer2 = null;
      settle(false);
    }, timeoutMs);
    try {
      socket = createConnection({ path: socketPath });
      socket.once("connect", () => {
        settle(true);
      });
      socket.once("error", () => {
        settle(false);
      });
    } catch {
      settle(false);
    }
  });
}
async function readPidFile(pidFilePath) {
  try {
    const content = await readFile(pidFilePath, "utf8");
    const pid = parseInt(content.trim(), 10);
    if (Number.isNaN(pid) || pid <= 0) {
      return null;
    }
    return pid;
  } catch {
    return null;
  }
}
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
const GRACEFUL_TIMEOUT_MS = 5e3;
const FORCE_KILL_WAIT_MS = 1e3;
const KILL_POLL_INTERVAL_MS = 200;
async function killDaemon(opts) {
  const log2 = getModuleLogger$9();
  const {
    pidFilePath,
    gracefulTimeoutMs = GRACEFUL_TIMEOUT_MS,
    forceKillWaitMs = FORCE_KILL_WAIT_MS,
    pollIntervalMs = KILL_POLL_INTERVAL_MS
  } = opts;
  const pid = await readPidFile(pidFilePath);
  if (pid === null) {
    log2.info("PID 文件不存在或无效,跳过 kill");
    return;
  }
  if (!isProcessAlive(pid)) {
    log2.info(`daemon 进程(pid=${pid})已不存在,跳过 kill`);
    return;
  }
  log2.info(`发送 SIGTERM 到 daemon(pid=${pid})`);
  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    log2.warn(`发送 SIGTERM 失败: ${err.message}`);
    return;
  }
  const gracefulDeadline = Date.now() + gracefulTimeoutMs;
  while (Date.now() < gracefulDeadline) {
    if (!isProcessAlive(pid)) {
      log2.info(`daemon(pid=${pid})已优雅退出`);
      return;
    }
    await new Promise((resolve2) => {
      setTimeout(resolve2, pollIntervalMs);
    });
  }
  log2.warn(`daemon(pid=${pid}) SIGTERM 超时(${gracefulTimeoutMs}ms),发送 SIGKILL`);
  try {
    process.kill(pid, "SIGKILL");
  } catch (err) {
    log2.warn(`发送 SIGKILL 失败: ${err.message}`);
    return;
  }
  const forceDeadline = Date.now() + forceKillWaitMs;
  while (Date.now() < forceDeadline) {
    if (!isProcessAlive(pid)) {
      log2.info(`daemon(pid=${pid})已被 SIGKILL 终止`);
      return;
    }
    await new Promise((resolve2) => {
      setTimeout(resolve2, pollIntervalMs);
    });
  }
  throw new Error(`daemon(pid=${pid}) SIGKILL 后仍未退出`);
}
const LAUNCHD_LABEL_PRODUCTION = "com.tencent.mac.marvis.daemon";
const LAUNCHD_LABEL_DEV = "com.tencent.mac.marvis.dev.daemon";
const PLIST_DIR = join(homedir(), "Library", "LaunchAgents");
const LAUNCHCTL_TIMEOUT_MS = 1e4;
const LAUNCHCTL_START_POLL_MS = 200;
const LAUNCHCTL_READY_TIMEOUT_MS = 15e3;
const DAEMON_EXIT_TIMEOUT_MS = 1e4;
const PLIST_THROTTLE_INTERVAL = 10;
function getLabel() {
  return app.isPackaged ? LAUNCHD_LABEL_PRODUCTION : LAUNCHD_LABEL_DEV;
}
function getPlistFilename() {
  return `${getLabel()}.plist`;
}
function getPlistPath() {
  return join(PLIST_DIR, getPlistFilename());
}
const LAUNCHD_MANAGER_MOD_ID = "launchd_manager";
const LAUNCHD_MANAGER_MOD_NAME = "Launchd 管理";
const LAUNCHD_MANAGER_REPORT_EVENTS = {
  /** launchd 服务注册成功 */
  REGISTER_SUCCESS: "launchd_manager__register_success",
  /** launchd bootstrap 成功 */
  BOOTSTRAP_SUCCESS: "launchd_manager__bootstrap_success",
  /** launchd bootstrap 失败（严重错误，实时上报） */
  BOOTSTRAP_FAILED: "launchd_manager__bootstrap_failed",
  /** UDS 就绪 */
  UDS_READY: "launchd_manager__uds_ready",
  /** UDS 就绪超时（严重错误，实时上报） */
  UDS_TIMEOUT: "launchd_manager__uds_timeout",
  /** 服务升级成功 */
  UPGRADE_SUCCESS: "launchd_manager__upgrade_success",
  /** 服务升级失败（严重错误，实时上报） */
  UPGRADE_FAILED: "launchd_manager__upgrade_failed"
};
const logger$U = getLogger("launchd-plist");
function generatePlistXml(options) {
  const {
    label,
    executablePath,
    socketPath,
    dataDir,
    logDir,
    runAtLoad = true
  } = options;
  const stdoutPath = `${logDir}/daemon-stdout.log`;
  const stderrPath = `${logDir}/daemon-stderr.log`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${escapeXml$1(label)}</string>

	<key>AssociatedBundleIdentifiers</key>
	<array>
		<string>com.tencent.mac.marvis</string>
	</array>

	<key>AbandonProcessGroup</key>
	<true/>

	<key>ProgramArguments</key>
	<array>
		<string>${escapeXml$1(executablePath)}</string>
	</array>

	<key>KeepAlive</key>
	<true/>

	<key>RunAtLoad</key>
	${runAtLoad ? "<true/>" : "<false/>"}

	<key>EnvironmentVariables</key>
	<dict>
		<key>MARVIS_DAEMON_SOCKET_PATH</key>
		<string>${escapeXml$1(socketPath)}</string>
		<key>MARVIS_DAEMON_DATA_DIR</key>
		<string>${escapeXml$1(dataDir)}</string>
	</dict>

	<key>StandardOutPath</key>
	<string>${escapeXml$1(stdoutPath)}</string>

	<key>StandardErrorPath</key>
	<string>${escapeXml$1(stderrPath)}</string>

	<key>ThrottleInterval</key>
	<integer>${PLIST_THROTTLE_INTERVAL}</integer>
</dict>
</plist>
`;
}
async function writePlist(options) {
  const plistPath = `${PLIST_DIR}/${options.label}.plist`;
  await mkdir(dirname(plistPath), { recursive: true });
  const xml = generatePlistXml(options);
  logger$U.info(`写入 plist: ${plistPath}`);
  await writeFile(plistPath, xml, "utf-8");
  return plistPath;
}
function escapeXml$1(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
const logger$T = getLogger("launchd-launchctl");
class LaunchctlError extends Error {
  constructor(command, exitCode, stderr, message) {
    super(message ?? `launchctl 命令失败: ${command} (exitCode=${exitCode})`);
    this.command = command;
    this.exitCode = exitCode;
    this.stderr = stderr;
    this.name = "LaunchctlError";
  }
  command;
  exitCode;
  stderr;
}
function getUid() {
  return process.getuid?.() ?? 501;
}
async function bootstrap(plistPath) {
  const uid = getUid();
  try {
    await runLaunchctl(["bootstrap", `gui/${uid}`, plistPath]);
    logger$T.info(`bootstrap 成功: gui/${uid} ${plistPath}`);
  } catch (err) {
    logger$T.warn(`bootstrap 失败，回退到 load: ${err.message}`);
    await runLaunchctl(["load", "-w", plistPath]);
    logger$T.info(`load 成功: ${plistPath}`);
  }
}
async function bootout(label, plistPath) {
  const uid = getUid();
  try {
    await runLaunchctl(["bootout", `gui/${uid}/${label}`]);
    logger$T.info(`bootout 成功: gui/${uid}/${label}`);
  } catch (err) {
    logger$T.warn(`bootout 失败，回退到 unload: ${err.message}`);
    try {
      await runLaunchctl(["unload", plistPath]);
      logger$T.info(`unload 成功: ${plistPath}`);
    } catch (unloadErr) {
      logger$T.warn(`unload 也失败: ${unloadErr.message}`);
    }
  }
}
async function start(label) {
  const uid = getUid();
  try {
    await runLaunchctl(["kickstart", "-k", `gui/${uid}/${label}`]);
    logger$T.info(`kickstart 成功: gui/${uid}/${label}`);
  } catch (err) {
    logger$T.warn(`kickstart 失败，回退到 start: ${err.message}`);
    await runLaunchctl(["start", label]);
    logger$T.info(`start 成功: ${label}`);
  }
}
async function isLoaded(label) {
  const uid = getUid();
  try {
    await runLaunchctl(["print", `gui/${uid}/${label}`]);
    return true;
  } catch {
    return false;
  }
}
function runLaunchctl(args, timeoutMs = LAUNCHCTL_TIMEOUT_MS) {
  return new Promise((resolve2, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn("/bin/launchctl", args, {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.unref();
    const timer2 = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGKILL");
      } catch {
      }
      reject(new LaunchctlError(
        `launchctl ${args.join(" ")}`,
        null,
        "",
        `launchctl ${args.join(" ")} 超时(${timeoutMs}ms)`
      ));
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer2);
      if (code !== 0) {
        reject(new LaunchctlError(
          `launchctl ${args.join(" ")}`,
          code,
          stderr,
          `launchctl ${args.join(" ")} 失败: exitCode=${code} stderr=${stderr}`
        ));
        return;
      }
      resolve2(stdout);
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer2);
      reject(new LaunchctlError(
        `launchctl ${args.join(" ")}`,
        null,
        "",
        `launchctl ${args.join(" ")} spawn 失败: ${err.message}`
      ));
    });
  });
}
const logger$S = getLogger("launchd-manager");
async function ensureLaunchdRegistered(opts) {
  const plistPath = getPlistPath();
  const label = getLabel();
  logger$S.info(`检查 launchd 注册状态: label=${label} plist=${plistPath}`);
  if (!existsSync(plistPath)) {
    logger$S.info("plist 不存在，执行首次注册");
    await migrateFromDetachedIfNeeded(opts);
    const plistOptions = {
      label,
      executablePath: opts.executablePath,
      socketPath: opts.socketPath,
      dataDir: opts.dataDir,
      logDir: opts.logDir,
      runAtLoad: true
    };
    await writePlist(plistOptions);
    try {
      await bootstrap(plistPath);
      logger$S.info("plist 已注册，等待 daemon 就绪...");
      reportBeaconEvent(LAUNCHD_MANAGER_REPORT_EVENTS.BOOTSTRAP_SUCCESS, {
        mod_id: LAUNCHD_MANAGER_MOD_ID,
        mod_name: LAUNCHD_MANAGER_MOD_NAME,
        label,
        plist_path: plistPath
      });
    } catch (err) {
      reportBeaconRealtimeEvent(LAUNCHD_MANAGER_REPORT_EVENTS.BOOTSTRAP_FAILED, {
        mod_id: LAUNCHD_MANAGER_MOD_ID,
        mod_name: LAUNCHD_MANAGER_MOD_NAME,
        label,
        plist_path: plistPath,
        error_message: err.message
      });
      throw err;
    }
    const ready2 = await pollUdsReady(opts.socketPath, LAUNCHCTL_READY_TIMEOUT_MS);
    if (!ready2) {
      logger$S.warn(`daemon 注册后 ${LAUNCHCTL_READY_TIMEOUT_MS}ms 内 UDS 未就绪`);
      await start(label);
      const retryReady = await pollUdsReady(opts.socketPath, LAUNCHCTL_READY_TIMEOUT_MS);
      if (!retryReady) {
        reportBeaconRealtimeEvent(LAUNCHD_MANAGER_REPORT_EVENTS.UDS_TIMEOUT, {
          mod_id: LAUNCHD_MANAGER_MOD_ID,
          mod_name: LAUNCHD_MANAGER_MOD_NAME,
          socket_path: opts.socketPath,
          timeout_ms: String(LAUNCHCTL_READY_TIMEOUT_MS),
          phase: "register"
        });
        throw new Error("daemon launchd 注册后 UDS 未就绪（已重试 kickstart）");
      }
    }
    reportBeaconEvent(LAUNCHD_MANAGER_REPORT_EVENTS.UDS_READY, {
      mod_id: LAUNCHD_MANAGER_MOD_ID,
      mod_name: LAUNCHD_MANAGER_MOD_NAME,
      socket_path: opts.socketPath,
      phase: "register"
    });
    logger$S.info("daemon 已由 launchd 启动并就绪");
    reportBeaconEvent(LAUNCHD_MANAGER_REPORT_EVENTS.REGISTER_SUCCESS, {
      mod_id: LAUNCHD_MANAGER_MOD_ID,
      mod_name: LAUNCHD_MANAGER_MOD_NAME,
      label,
      socket_path: opts.socketPath
    });
    return { registered: true, started: true };
  }
  logger$S.info("plist 已存在，检查 daemon 运行状态");
  const alive = await probeUds(opts.socketPath, UDS_PROBE_TIMEOUT_MS);
  if (alive) {
    logger$S.info("daemon UDS 可连接，已在运行");
    return { registered: false, started: false };
  }
  logger$S.info("daemon UDS 不可达，通过 launchctl 启动...");
  try {
    await start(label);
  } catch (startErr) {
    logger$S.warn(`launchctl start 失败: ${startErr.message}，尝试重新 bootstrap`);
    try {
      await bootstrap(plistPath);
      logger$S.info("重新 bootstrap 成功");
    } catch (bootstrapErr) {
      reportBeaconRealtimeEvent(LAUNCHD_MANAGER_REPORT_EVENTS.BOOTSTRAP_FAILED, {
        mod_id: LAUNCHD_MANAGER_MOD_ID,
        mod_name: LAUNCHD_MANAGER_MOD_NAME,
        label,
        plist_path: plistPath,
        error_message: bootstrapErr.message
      });
      throw new Error(`launchctl start 和重新 bootstrap 均失败: start=${startErr.message}, bootstrap=${bootstrapErr.message}`);
    }
  }
  const ready = await pollUdsReady(opts.socketPath, LAUNCHCTL_READY_TIMEOUT_MS);
  if (!ready) {
    reportBeaconRealtimeEvent(LAUNCHD_MANAGER_REPORT_EVENTS.UDS_TIMEOUT, {
      mod_id: LAUNCHD_MANAGER_MOD_ID,
      mod_name: LAUNCHD_MANAGER_MOD_NAME,
      socket_path: opts.socketPath,
      timeout_ms: String(LAUNCHCTL_READY_TIMEOUT_MS),
      phase: "start"
    });
    throw new Error(`launchctl start 后 ${LAUNCHCTL_READY_TIMEOUT_MS}ms 内 daemon UDS 未就绪`);
  }
  reportBeaconEvent(LAUNCHD_MANAGER_REPORT_EVENTS.UDS_READY, {
    mod_id: LAUNCHD_MANAGER_MOD_ID,
    mod_name: LAUNCHD_MANAGER_MOD_NAME,
    socket_path: opts.socketPath,
    phase: "start"
  });
  logger$S.info("daemon 已由 launchctl 重新启动并就绪");
  return { registered: false, started: true };
}
async function upgradeDaemonViaLaunchd(opts) {
  const label = getLabel();
  const plistPath = getPlistPath();
  logger$S.info("开始 launchd 升级流程: bootout 注销旧 daemon...");
  await bootout(label, plistPath);
  const exited = await waitForDaemonExit(opts.pidFilePath, DAEMON_EXIT_TIMEOUT_MS);
  if (!exited) {
    logger$S.warn("daemon 未在超时内退出，强制 kill");
    await killDaemon({ pidFilePath: opts.pidFilePath });
  }
  await new Promise((resolve2) => setTimeout(resolve2, 500));
  const plistOptions = {
    label,
    executablePath: opts.newBinaryPath,
    socketPath: opts.socketPath,
    dataDir: opts.dataDir,
    logDir: opts.logDir,
    runAtLoad: true
  };
  await writePlist(plistOptions);
  logger$S.info("bootstrap 注册新版 daemon...");
  try {
    await bootstrap(plistPath);
    reportBeaconEvent(LAUNCHD_MANAGER_REPORT_EVENTS.BOOTSTRAP_SUCCESS, {
      mod_id: LAUNCHD_MANAGER_MOD_ID,
      mod_name: LAUNCHD_MANAGER_MOD_NAME,
      label,
      plist_path: plistPath,
      phase: "upgrade"
    });
  } catch (err) {
    reportBeaconRealtimeEvent(LAUNCHD_MANAGER_REPORT_EVENTS.BOOTSTRAP_FAILED, {
      mod_id: LAUNCHD_MANAGER_MOD_ID,
      mod_name: LAUNCHD_MANAGER_MOD_NAME,
      label,
      plist_path: plistPath,
      phase: "upgrade",
      error_message: err.message
    });
    throw err;
  }
  const ready = await pollUdsReady(opts.socketPath, LAUNCHCTL_READY_TIMEOUT_MS);
  if (!ready) {
    logger$S.error("新版 daemon 启动失败，执行回退...");
    reportBeaconRealtimeEvent(LAUNCHD_MANAGER_REPORT_EVENTS.UPGRADE_FAILED, {
      mod_id: LAUNCHD_MANAGER_MOD_ID,
      mod_name: LAUNCHD_MANAGER_MOD_NAME,
      new_binary_path: opts.newBinaryPath,
      old_binary_path: opts.oldBinaryPath,
      socket_path: opts.socketPath,
      reason: "uds_timeout"
    });
    return await rollbackUpgrade(opts, label, plistPath);
  }
  reportBeaconEvent(LAUNCHD_MANAGER_REPORT_EVENTS.UDS_READY, {
    mod_id: LAUNCHD_MANAGER_MOD_ID,
    mod_name: LAUNCHD_MANAGER_MOD_NAME,
    socket_path: opts.socketPath,
    phase: "upgrade"
  });
  logger$S.info("daemon 升级完成，新版已就绪");
  reportBeaconEvent(LAUNCHD_MANAGER_REPORT_EVENTS.UPGRADE_SUCCESS, {
    mod_id: LAUNCHD_MANAGER_MOD_ID,
    mod_name: LAUNCHD_MANAGER_MOD_NAME,
    new_binary_path: opts.newBinaryPath,
    socket_path: opts.socketPath
  });
  return { upgraded: true, rolledBack: false };
}
async function migrateFromDetachedIfNeeded(opts) {
  const servicesDir = dirname(opts.executablePath);
  const legacyBinaryPath = join(servicesDir, "marvis-daemond");
  if (existsSync(legacyBinaryPath) && !existsSync(opts.executablePath)) {
    try {
      renameSync(legacyBinaryPath, opts.executablePath);
      logger$S.info(`旧版二进制已迁移: ${legacyBinaryPath} → ${opts.executablePath}`);
    } catch (err) {
      logger$S.warn(`旧版二进制迁移失败: ${err.message}，将使用包内二进制`);
    }
  } else if (existsSync(legacyBinaryPath) && existsSync(opts.executablePath)) {
    try {
      unlink$1(legacyBinaryPath);
      logger$S.info(`已清理旧版二进制: ${legacyBinaryPath}`);
    } catch {
    }
  }
  const udsAlive = await probeUds(opts.socketPath, UDS_PROBE_TIMEOUT_MS);
  if (udsAlive) {
    logger$S.info("检测到旧 detached daemon 在运行（UDS 可达），终止后迁移到 launchd...");
    await killDaemon({ pidFilePath: opts.pidFilePath });
    return;
  }
  const pid = await readPidFile(opts.pidFilePath);
  if (pid !== null && isProcessAlive(pid)) {
    logger$S.info(`检测到旧 detached daemon 进程存活 (pid=${pid})，终止后迁移到 launchd...`);
    await killDaemon({ pidFilePath: opts.pidFilePath });
  }
}
async function pollUdsReady(socketPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const alive = await probeUds(socketPath, UDS_PROBE_TIMEOUT_MS);
    if (alive) return true;
    await sleep$5(LAUNCHCTL_START_POLL_MS);
  }
  return false;
}
async function waitForDaemonExit(pidFilePath, timeoutMs) {
  const pid = await readPidFile(pidFilePath);
  if (pid === null) return true;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      logger$S.info(`daemon 进程已退出 (pid=${pid})`);
      return true;
    }
    await sleep$5(200);
  }
  logger$S.warn(`daemon 进程 (pid=${pid}) 在 ${timeoutMs}ms 内未退出`);
  return false;
}
async function rollbackUpgrade(opts, label, plistPath) {
  logger$S.info("回退到旧版 daemon 二进制...");
  const plistOptions = {
    label,
    executablePath: opts.oldBinaryPath,
    socketPath: opts.socketPath,
    dataDir: opts.dataDir,
    logDir: opts.logDir,
    runAtLoad: true
  };
  await writePlist(plistOptions);
  const loaded = await isLoaded(label);
  if (!loaded) {
    await bootstrap(plistPath);
  }
  await start(label);
  const ready = await pollUdsReady(opts.socketPath, LAUNCHCTL_READY_TIMEOUT_MS);
  if (!ready) {
    logger$S.error("回退后 daemon 仍无法启动!");
  } else {
    logger$S.info("已回退到旧版 daemon，服务已恢复");
  }
  return { upgraded: false, rolledBack: true };
}
function sleep$5(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}
const state$4 = {
  socket: null,
  socketPath: null,
  logger: null,
  handlers: null,
  connectTimer: null
};
function getModuleLogger$8() {
  if (!state$4.logger) {
    state$4.logger = getLogger("daemon-bridge");
  }
  return state$4.logger;
}
function connect(socketPath, handlers2, timeoutMs = CONNECT_TIMEOUT_MS) {
  const log2 = getModuleLogger$8();
  if (state$4.socket && !state$4.socket.destroyed) {
    log2.warn("transport 已连接,先断开旧连接");
    disconnect();
  }
  state$4.handlers = handlers2;
  state$4.socketPath = socketPath;
  return new Promise((resolve2, reject) => {
    state$4.connectTimer = setTimeout(() => {
      state$4.connectTimer = null;
      if (state$4.socket && !state$4.socket.destroyed) {
        state$4.socket.destroy();
      }
      state$4.socket = null;
      reject(new Error(`UDS 连接超时(${timeoutMs}ms): ${socketPath}`));
    }, timeoutMs);
    const socket = createConnection({ path: socketPath });
    state$4.socket = socket;
    socket.once("connect", () => {
      if (state$4.connectTimer) {
        clearTimeout(state$4.connectTimer);
        state$4.connectTimer = null;
      }
      log2.info(`UDS 已连接: ${socketPath}`);
      attachLineReader(socket);
      if (state$4.handlers?.onConnect) {
        try {
          state$4.handlers.onConnect();
        } catch (err) {
          log2.warn(`onConnect 回调异常: ${err.message}`);
        }
      }
      resolve2();
    });
    socket.once("error", (err) => {
      if (state$4.connectTimer) {
        clearTimeout(state$4.connectTimer);
        state$4.connectTimer = null;
      }
      log2.warn(`UDS 连接错误: ${err.message}`);
      if (state$4.handlers?.onError) {
        try {
          state$4.handlers.onError(err);
        } catch (cbErr) {
          log2.warn(`onError 回调异常: ${cbErr.message}`);
        }
      }
      reject(err);
    });
    socket.on("close", () => {
      log2.info("UDS 连接已关闭");
      if (state$4.socket === socket) {
        state$4.socket = null;
      }
      if (state$4.handlers?.onDisconnect) {
        try {
          state$4.handlers.onDisconnect();
        } catch (err) {
          log2.warn(`onDisconnect 回调异常: ${err.message}`);
        }
      }
    });
  });
}
function disconnect() {
  if (state$4.connectTimer) {
    clearTimeout(state$4.connectTimer);
    state$4.connectTimer = null;
  }
  if (state$4.socket && !state$4.socket.destroyed) {
    try {
      state$4.socket.destroy();
    } catch {
    }
    state$4.socket = null;
  }
}
function sendLine(line) {
  const log2 = getModuleLogger$8();
  if (!state$4.socket || state$4.socket.destroyed) {
    log2.warn("sendLine 失败:当前无活跃连接");
    return false;
  }
  const payload = line.endsWith("\n") ? line : `${line}
`;
  return state$4.socket.write(payload);
}
function attachLineReader(socket) {
  const log2 = getModuleLogger$8();
  let buffer = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffer += chunk;
    if (buffer.length > MAX_LINE_LENGTH) {
      log2.warn(`单行超过最大长度 ${MAX_LINE_LENGTH},关闭连接`);
      socket.destroy();
      return;
    }
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, "");
      buffer = buffer.slice(idx + 1);
      if (line.length === 0) continue;
      if (state$4.handlers?.onLine) {
        try {
          state$4.handlers.onLine(line);
        } catch (err) {
          log2.warn(`onLine 回调异常: ${err.message}`);
        }
      }
    }
  });
}
const logger$R = getLogger("daemon-version-check");
const VERSION_CHECK_TIMEOUT_MS = 5e3;
function getExpectedDaemonVersion() {
  try {
    const buildJsonPath = getResourcePath("build.json");
    if (existsSync(buildJsonPath)) {
      const buildJson = JSON.parse(readFileSync$1(buildJsonPath, "utf-8"));
      if (buildJson.daemonVersion) {
        return buildJson.daemonVersion;
      }
    }
    return null;
  } catch (err) {
    logger$R.warn(`读取期望 daemon 版本失败: ${err.message}`);
    return null;
  }
}
function getBundledDaemonPath() {
  const path2 = getResourcePath("bin", DAEMON_PROCESS_NAME);
  return existsSync(path2) ? path2 : null;
}
function getInstalledDaemonPath() {
  return join(defaultDaemonDataDir(), "services", DAEMON_PROCESS_NAME);
}
function queryDaemonVersion() {
  return new Promise((resolve2) => {
    const timeout = setTimeout(() => {
      resolve2(null);
    }, VERSION_CHECK_TIMEOUT_MS);
    const callbackId = `base_version_${Date.now()}`;
    const msg = {
      type: "send",
      protocalVersion: PROTOCOL_VERSION,
      callbackId,
      namespace: NAMESPACE_BASE,
      method: METHOD_VERSION,
      params: {}
    };
    const sent = sendLine(JSON.stringify(msg));
    if (!sent) {
      clearTimeout(timeout);
      resolve2(null);
      return;
    }
    _pendingVersionReply = (version) => {
      clearTimeout(timeout);
      _pendingVersionReply = null;
      resolve2(version);
    };
  });
}
let _pendingVersionReply = null;
function handleVersionAck(version) {
  if (_pendingVersionReply) {
    _pendingVersionReply(version);
  }
}
async function checkAndUpgradeDaemon(opts) {
  const expectedVersion = getExpectedDaemonVersion();
  if (!expectedVersion) {
    logger$R.warn("无法确定期望 daemon 版本，跳过检查");
    return { upgraded: false };
  }
  logger$R.info(`期望 daemon 版本: ${expectedVersion}`);
  const currentVersion2 = await queryDaemonVersion();
  if (!currentVersion2) {
    logger$R.warn("无法查询 daemon 当前版本（可能未连接），跳过升级");
    return { upgraded: false };
  }
  logger$R.info(`当前 daemon 版本: ${currentVersion2}`);
  if (currentVersion2 === expectedVersion) {
    logger$R.info("daemon 版本匹配，无需升级");
    reportBeaconEvent(DAEMON_BRIDGE_REPORT_EVENTS.VERSION_MATCH, {
      current_version: currentVersion2,
      expected_version: expectedVersion
    });
    return { upgraded: false };
  }
  logger$R.info(`daemon 版本不匹配: 当前=${currentVersion2} 期望=${expectedVersion}，开始升级`);
  reportBeaconEvent(DAEMON_BRIDGE_REPORT_EVENTS.VERSION_MISMATCH, {
    current_version: currentVersion2,
    expected_version: expectedVersion
  });
  const bundledPath = getBundledDaemonPath();
  if (!bundledPath) {
    logger$R.warn("未找到内置 daemon 二进制，无法升级");
    return { upgraded: false };
  }
  const installedPath = getInstalledDaemonPath();
  const oldBinaryBackup = `${installedPath}.old`;
  try {
    const servicesDir = dirname(installedPath);
    if (!existsSync(servicesDir)) {
      mkdirSync(servicesDir, { recursive: true });
    }
    if (existsSync(installedPath)) {
      copyFileSync(installedPath, oldBinaryBackup);
    }
    logger$R.info(`替换 daemon: ${bundledPath} → ${installedPath}`);
    if (existsSync(installedPath)) {
      unlinkSync(installedPath);
    }
    copyFileSync(bundledPath, installedPath);
    chmodSync(installedPath, 493);
    logger$R.info("daemon 二进制已替换");
  } catch (err) {
    logger$R.error(`daemon 二进制替换失败: ${err.message}`);
    reportBeaconRealtimeEvent(DAEMON_BRIDGE_REPORT_EVENTS.UPGRADE_FAILURE, {
      error: err.message,
      current_version: currentVersion2,
      expected_version: expectedVersion
    });
    if (existsSync(oldBinaryBackup)) {
      try {
        if (existsSync(installedPath)) {
          unlinkSync(installedPath);
        }
        copyFileSync(oldBinaryBackup, installedPath);
        chmodSync(installedPath, 493);
      } catch (restoreErr) {
        logger$R.error(`恢复旧二进制失败: ${restoreErr.message}`);
      }
    }
    return { upgraded: false };
  }
  disconnect();
  const dataDir = defaultDaemonDataDir();
  const logDir = app.isPackaged ? app.getPath("logs") : join(dirname(installedPath), "..", "..", "logs");
  try {
    const result = await upgradeDaemonViaLaunchd({
      newBinaryPath: installedPath,
      oldBinaryPath: oldBinaryBackup,
      socketPath: opts.socketPath,
      pidFilePath: opts.pidFilePath,
      dataDir,
      logDir
    });
    if (result.rolledBack) {
      logger$R.warn("daemon 升级后新版启动失败，已回退到旧版");
      reportBeaconRealtimeEvent(DAEMON_BRIDGE_REPORT_EVENTS.UPGRADE_FAILURE, {
        error: "new version failed to start, rolled back",
        current_version: currentVersion2,
        expected_version: expectedVersion
      });
    } else {
      logger$R.info("daemon 升级完成，新版本已由 launchd 启动");
      reportBeaconEvent(DAEMON_BRIDGE_REPORT_EVENTS.UPGRADE_SUCCESS, {
        current_version: currentVersion2,
        expected_version: expectedVersion
      });
    }
    if (existsSync(oldBinaryBackup)) {
      try {
        unlinkSync(oldBinaryBackup);
      } catch {
      }
    }
    return { upgraded: true };
  } catch (err) {
    logger$R.error(`daemon launchd 升级流程异常: ${err.message}`);
    reportBeaconRealtimeEvent(DAEMON_BRIDGE_REPORT_EVENTS.UPGRADE_FAILURE, {
      error: err.message,
      current_version: currentVersion2,
      expected_version: expectedVersion
    });
    return { upgraded: true };
  }
}
const state$3 = {
  logger: null,
  bridgeStatus: "disconnected",
  daemonConnState: "Unknown",
  processStatus: "not_started",
  socketPath: null,
  started: false,
  reconnecting: false,
  reconnectTimer: null,
  handshakeTimer: null,
  bridgeStatusHandlers: /* @__PURE__ */ new Set(),
  connStateHandlers: /* @__PURE__ */ new Set(),
  textMessageHandlers: /* @__PURE__ */ new Set(),
  callbackIdCounter: 0
};
function getModuleLogger$7() {
  if (!state$3.logger) {
    state$3.logger = getLogger("daemon-bridge");
  }
  return state$3.logger;
}
async function resolveDaemonExecutable(overridePath) {
  const log2 = getModuleLogger$7();
  const envPath = process.env[ENV_DAEMON_EXECUTABLE];
  if (envPath && envPath.trim().length > 0 && existsSync(envPath)) {
    log2.info(`daemon 可执行文件(env): ${envPath}`);
    return envPath;
  }
  if (app.isPackaged) {
    const servicesDir = join(app.getPath("userData"), "services");
    const servicesPath = join(servicesDir, DAEMON_PROCESS_NAME);
    if (existsSync(servicesPath)) {
      log2.info(`daemon 可执行文件(services): ${servicesPath}`);
      return servicesPath;
    }
    const bundledPath = getResourcePath("bin", DAEMON_PROCESS_NAME);
    if (existsSync(bundledPath)) {
      log2.info(`daemon 首次部署: ${bundledPath} → ${servicesPath}`);
      try {
        await mkdir(servicesDir, { recursive: true });
        await copyFile(bundledPath, servicesPath);
        await chmod(servicesPath, 493);
        log2.info("daemon 已部署到 services/");
        return servicesPath;
      } catch (err) {
        log2.error(`daemon 首次部署失败: ${err.message}，回退到包内路径`);
        return bundledPath;
      }
    }
  }
  const devDebug = join(process.cwd(), "daemon", "target", "debug", DAEMON_PROCESS_NAME);
  if (existsSync(devDebug)) {
    log2.info(`daemon 可执行文件(dev-debug): ${devDebug}`);
    return devDebug;
  }
  const devRelease = join(process.cwd(), "daemon", "target", "release", DAEMON_PROCESS_NAME);
  if (existsSync(devRelease)) {
    log2.info(`daemon 可执行文件(dev-release): ${devRelease}`);
    return devRelease;
  }
  throw new Error(`找不到 daemon 可执行文件: 请设置 ${ENV_DAEMON_EXECUTABLE} 环境变量 或确保 daemon/target/debug/${DAEMON_PROCESS_NAME} 存在`);
}
function resolveDaemonSocketPath(overridePath) {
  const envPath = process.env[ENV_DAEMON_SOCKET_PATH];
  if (envPath && envPath.trim().length > 0) return envPath;
  return defaultDaemonSocketPath();
}
function resolveDaemonPidPath(overridePath) {
  return defaultDaemonPidPath();
}
async function startDaemon(options) {
  const log2 = getModuleLogger$7();
  if (state$3.started) {
    log2.warn("daemon 已启动,跳过重复启动");
    return;
  }
  const executablePath = await resolveDaemonExecutable();
  const socketPath = resolveDaemonSocketPath();
  const pidFilePath = resolveDaemonPidPath();
  state$3.socketPath = socketPath;
  log2.info(`daemon 可执行文件: ${executablePath}`);
  log2.info(`daemon socket 路径: ${socketPath}`);
  log2.info(`daemon PID 文件: ${pidFilePath}`);
  const env = {};
  const dataDir = process.env[ENV_DAEMON_DATA_DIR];
  if (dataDir) {
    env[ENV_DAEMON_DATA_DIR] = dataDir;
  }
  env[ENV_DAEMON_SOCKET_PATH] = socketPath;
  const logDir = app.isPackaged ? join(app.getPath("logs")) : join(dirname(executablePath), "..", "..", "logs");
  setProcessStatus("detecting");
  try {
    const launchdState = await ensureLaunchdRegistered({
      executablePath,
      socketPath,
      pidFilePath,
      dataDir: dataDir ?? app.getPath("userData"),
      logDir,
      env
    });
    setProcessStatus(launchdState.started ? "running" : "external");
    state$3.started = true;
    log2.info(`daemon 已就绪(launchd): registered=${launchdState.registered} started=${launchdState.started}`);
    if (launchdState.started) {
      reportBeaconEvent(DAEMON_BRIDGE_REPORT_EVENTS.SPAWN_SUCCESS, {
        executable_path: executablePath
      });
    } else {
      reportBeaconEvent(DAEMON_BRIDGE_REPORT_EVENTS.ALREADY_RUNNING, {
        executable_path: executablePath
      });
    }
  } catch (err) {
    log2.error(`daemon launchd 启动失败: ${err.message}`);
    setProcessStatus("error");
    reportBeaconRealtimeEvent(DAEMON_BRIDGE_REPORT_EVENTS.SPAWN_FAILURE, {
      error: err.message,
      executable_path: executablePath
    });
    throw err;
  }
  try {
    await connectToIpc();
    log2.info("IPC 连接已建立，handshake 完成");
  } catch (err) {
    log2.warn(`IPC 连接失败: ${err.message}`);
    return;
  }
  try {
    const { upgraded } = await checkAndUpgradeDaemon({
      pidFilePath,
      socketPath,
      executablePath,
      env
    });
    if (upgraded) {
      log2.info("daemon 已升级，断开旧 IPC 并重连...");
      if (state$3.reconnectTimer) {
        clearTimeout(state$3.reconnectTimer);
        state$3.reconnectTimer = null;
      }
      state$3.reconnecting = false;
      disconnect();
      await connectToIpc();
    }
  } catch (err) {
    log2.warn(`daemon 版本检查失败(非致命): ${err.message}`);
  }
}
async function disconnectDaemon() {
  const log2 = getModuleLogger$7();
  log2.info("断开 daemon IPC...");
  if (state$3.reconnectTimer) {
    clearTimeout(state$3.reconnectTimer);
    state$3.reconnectTimer = null;
  }
  if (state$3.handshakeTimer) {
    clearTimeout(state$3.handshakeTimer);
    state$3.handshakeTimer = null;
  }
  state$3.reconnecting = false;
  disconnect();
  setBridgeStatus("disconnected");
  state$3.started = false;
  setDaemonConnState("Unknown");
  log2.info("daemon IPC 已断开(daemon 继续运行)");
}
function connectToIpc() {
  const log2 = getModuleLogger$7();
  const { socketPath } = state$3;
  if (!socketPath) {
    log2.warn("connectToIpc: 无 socket 路径");
    return Promise.resolve();
  }
  setBridgeStatus("connecting");
  return new Promise((resolve2, reject) => {
    connect(socketPath, {
      onLine: handleInboundLine,
      onConnect: () => {
        log2.info("IPC 连接已建立,开始握手");
        setBridgeStatus("handshaking");
        reportBeaconEvent(DAEMON_BRIDGE_REPORT_EVENTS.IPC_CONNECTED, {
          socket_path: socketPath
        });
        startHandshake();
      },
      onDisconnect: () => {
        log2.info("IPC 连接断开");
        setBridgeStatus("disconnected");
        setDaemonConnState("Unknown");
        reportBeaconEvent(DAEMON_BRIDGE_REPORT_EVENTS.IPC_DISCONNECTED, {
          was_started: state$3.started ? "1" : "0"
        });
        if (state$3.started) {
          reportBeaconRealtimeEvent(DAEMON_BRIDGE_REPORT_EVENTS.PROCESS_CRASH, {
            socket_path: socketPath
          });
        }
        if (state$3.started && !state$3.reconnecting) {
          scheduleReconnect();
        }
      },
      onError: (err) => {
        log2.warn(`IPC 连接错误: ${err.message}`);
        reportBeaconRealtimeEvent(DAEMON_BRIDGE_REPORT_EVENTS.IPC_ERROR, {
          error: err.message,
          socket_path: socketPath
        });
        if (state$3.started && !state$3.reconnecting) {
          scheduleReconnect();
        }
      }
    }).then(() => {
      const checkHandshake = () => {
        if (state$3.bridgeStatus === "connected") {
          resolve2();
        } else if (state$3.bridgeStatus === "disconnected" || state$3.bridgeStatus === "reconnecting") {
          reject(new Error("IPC 连接断开，握手未完成"));
        } else {
          setTimeout(checkHandshake, 50);
        }
      };
      checkHandshake();
    }).catch((err) => {
      log2.warn(`IPC 连接失败: ${err.message}`);
      setBridgeStatus("disconnected");
      if (state$3.started) {
        scheduleReconnect();
      }
      reject(err);
    });
  });
}
function scheduleReconnect() {
  const log2 = getModuleLogger$7();
  if (state$3.reconnecting) return;
  if (!state$3.started) return;
  state$3.reconnecting = true;
  setBridgeStatus("reconnecting");
  log2.info(`${RECONNECT_DELAY_MS}ms 后重连 IPC...`);
  state$3.reconnectTimer = setTimeout(() => {
    state$3.reconnectTimer = null;
    state$3.reconnecting = false;
    if (state$3.started) {
      connectToIpc();
    }
  }, RECONNECT_DELAY_MS);
}
function startHandshake() {
  const log2 = getModuleLogger$7();
  state$3.callbackIdCounter += 1;
  const callbackId = `base_init_${state$3.callbackIdCounter}`;
  void (async () => {
    const params = {
      client_type: "electron",
      client_version: app.getVersion(),
      pid: process.pid
    };
    try {
      const guid = await getDeviceGuid();
      if (guid && guid !== PLACEHOLDER_DEVICE_GUID) {
        params.guid = guid;
      }
    } catch (err) {
      log2.warn(`startHandshake: getDeviceGuid 异常(忽略): ${err.message}`);
    }
    const initMsg = {
      type: "send",
      protocalVersion: PROTOCOL_VERSION,
      callbackId,
      namespace: NAMESPACE_BASE,
      method: METHOD_INIT,
      params
    };
    const sent = sendLine(JSON.stringify(initMsg));
    if (!sent) {
      log2.warn("base.init 发送失败");
      reportBeaconEvent(DAEMON_BRIDGE_REPORT_EVENTS.IPC_SEND_FAILURE, {
        command: `${NAMESPACE_BASE}.${METHOD_INIT}`
      });
      return;
    }
    state$3.handshakeTimer = setTimeout(() => {
      state$3.handshakeTimer = null;
      if (state$3.bridgeStatus === "handshaking") {
        log2.warn(`握手超时(${HANDSHAKE_TIMEOUT_MS}ms)`);
        reportBeaconRealtimeEvent(DAEMON_BRIDGE_REPORT_EVENTS.HANDSHAKE_TIMEOUT, {
          timeout_ms: String(HANDSHAKE_TIMEOUT_MS)
        });
        disconnect();
      }
    }, HANDSHAKE_TIMEOUT_MS);
  })();
}
function handleInboundLine(line) {
  const log2 = getModuleLogger$7();
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (err) {
    log2.warn(`入站消息 JSON 解析失败: ${err.message}`);
    reportBeaconEvent(DAEMON_BRIDGE_REPORT_EVENTS.IPC_PARSE_ERROR, {
      error: err.message
    });
    return;
  }
  if (msg.type === "ack" && msg.namespace === NAMESPACE_BASE && msg.method === METHOD_INIT) {
    if (state$3.handshakeTimer) {
      clearTimeout(state$3.handshakeTimer);
      state$3.handshakeTimer = null;
    }
    setBridgeStatus("connected");
    log2.info("IPC 握手完成");
    reportBeaconEvent(DAEMON_BRIDGE_REPORT_EVENTS.HANDSHAKE_SUCCESS, {
      socket_path: state$3.socketPath ?? "",
      protocol_version: PROTOCOL_VERSION
    });
    return;
  }
  if (msg.type === "ack" && msg.namespace === NAMESPACE_BASE && msg.method === METHOD_HEARTBEAT) {
    return;
  }
  if (msg.type === "ack" && msg.namespace === NAMESPACE_BASE && msg.method === METHOD_UPDATE_GUID) {
    const ok2 = msg.params?.ok;
    log2.info(`daemon 响应 updateGuid: ok=${ok2 === true}`);
    return;
  }
  if (msg.type === "ack" && msg.namespace === NAMESPACE_BASE && msg.method === METHOD_VERSION) {
    const version = msg.params?.version;
    log2.info(`daemon 版本: ${version ?? "unknown"}`);
    handleVersionAck(version ?? null);
    return;
  }
  if (msg.type === "send" && msg.namespace === NAMESPACE_BASE && msg.method === METHOD_FETCH_GUID) {
    void (async () => {
      let guid = null;
      try {
        const resolved = await getDeviceGuid();
        if (resolved && resolved !== PLACEHOLDER_DEVICE_GUID) {
          guid = resolved;
        }
      } catch (err) {
        log2.warn(`fetchGuid: getDeviceGuid 异常: ${err.message}`);
      }
      const ackMsg = {
        type: "ack",
        protocalVersion: PROTOCOL_VERSION,
        callbackId: msg.callbackId,
        namespace: NAMESPACE_BASE,
        method: METHOD_FETCH_GUID,
        params: { guid }
      };
      const sent = sendLine(JSON.stringify(ackMsg));
      if (!sent) {
        log2.warn("base.fetchGuid ack 发送失败");
        reportBeaconEvent(DAEMON_BRIDGE_REPORT_EVENTS.IPC_SEND_FAILURE, {
          command: `${NAMESPACE_BASE}.${METHOD_FETCH_GUID}`
        });
        return;
      }
      log2.info(`已响应 daemon fetchGuid: guid=${guid ? "<real>" : "null"}`);
    })();
    return;
  }
  if (msg.type === "send" && msg.namespace === NAMESPACE_CONNECTION && msg.method === "stateChanged") {
    const newState = msg.params?.state;
    if (newState) {
      setDaemonConnState(newState);
      log2.info(`daemon 连接状态: ${newState}`);
    }
    return;
  }
  if (msg.type === "send" && msg.namespace === NAMESPACE_CONNECTION && msg.method === "textReceived") {
    const content = msg.params?.content;
    if (content) {
      log2.info(`收到服务端文本消息: len=${content.length}`);
      for (const handler of state$3.textMessageHandlers) {
        try {
          handler(content);
        } catch (err) {
          log2.warn(`textMessage 回调异常: ${err.message}`);
        }
      }
    }
    return;
  }
  log2.debug(`未处理的消息: type=${msg.type} ${msg.namespace}.${msg.method}`);
  if (msg.type === "ack" && msg.namespace === NAMESPACE_UPDATE) {
    const accepted = msg.params?.accepted;
    log2.info(`daemon 响应 update.${msg.method}: accepted=${accepted}`);
    return;
  }
  log2.debug(`未处理的消息: type=${msg.type} ${msg.namespace}.${msg.method}`);
}
function refreshDaemonGuid(guid) {
  const log2 = getModuleLogger$7();
  if (!guid || guid === PLACEHOLDER_DEVICE_GUID) {
    log2.debug(`refreshDaemonGuid: 忽略占位/空 guid='${guid}'`);
    return;
  }
  if (state$3.bridgeStatus !== "connected") {
    log2.debug(`refreshDaemonGuid: bridgeStatus=${state$3.bridgeStatus},跳过 push`);
    return;
  }
  state$3.callbackIdCounter += 1;
  const callbackId = `base_updateGuid_${state$3.callbackIdCounter}`;
  const msg = {
    type: "send",
    protocalVersion: PROTOCOL_VERSION,
    callbackId,
    namespace: NAMESPACE_BASE,
    method: METHOD_UPDATE_GUID,
    params: { guid }
  };
  const sent = sendLine(JSON.stringify(msg));
  if (!sent) {
    log2.warn("base.updateGuid 发送失败");
    reportBeaconEvent(DAEMON_BRIDGE_REPORT_EVENTS.IPC_SEND_FAILURE, {
      command: `${NAMESPACE_BASE}.${METHOD_UPDATE_GUID}`
    });
    return;
  }
  log2.info(`已 push GUID 给 daemon: len=${guid.length}`);
}
function setBridgeStatus(newStatus) {
  if (state$3.bridgeStatus === newStatus) return;
  state$3.bridgeStatus = newStatus;
  for (const handler of state$3.bridgeStatusHandlers) {
    try {
      handler(newStatus);
    } catch (err) {
      getModuleLogger$7().warn(`bridgeStatus 回调异常: ${err.message}`);
    }
  }
}
function setDaemonConnState(newState) {
  if (state$3.daemonConnState === newState) return;
  state$3.daemonConnState = newState;
  for (const handler of state$3.connStateHandlers) {
    try {
      handler(newState);
    } catch (err) {
      getModuleLogger$7().warn(`connState 回调异常: ${err.message}`);
    }
  }
}
function setProcessStatus(newStatus) {
  state$3.processStatus = newStatus;
}
function onTextMessage(handler) {
  state$3.textMessageHandlers.add(handler);
  return () => state$3.textMessageHandlers.delete(handler);
}
function sendUpdateReplace(params) {
  const log2 = getModuleLogger$7();
  if (state$3.bridgeStatus !== "connected") {
    log2.warn(`sendUpdateReplace: bridgeStatus=${state$3.bridgeStatus}，跳过`);
    return false;
  }
  state$3.callbackIdCounter += 1;
  const callbackId = `update_replace_${state$3.callbackIdCounter}`;
  const msg = {
    type: "send",
    protocalVersion: PROTOCOL_VERSION,
    callbackId,
    namespace: NAMESPACE_UPDATE,
    method: METHOD_UPDATE_REPLACE,
    params
  };
  const sent = sendLine(JSON.stringify(msg));
  if (!sent) {
    log2.warn("update.replace 发送失败");
    reportBeaconEvent(DAEMON_BRIDGE_REPORT_EVENTS.IPC_SEND_FAILURE, {
      command: `${NAMESPACE_UPDATE}.${METHOD_UPDATE_REPLACE}`
    });
    return false;
  }
  log2.info(`已发送 update.replace (parentPid=${params.parentPid}, appPath=${params.appPath})`);
  return true;
}
function sendUpdateRestart(params) {
  const log2 = getModuleLogger$7();
  if (state$3.bridgeStatus !== "connected") {
    log2.warn(`sendUpdateRestart: bridgeStatus=${state$3.bridgeStatus}，跳过`);
    return false;
  }
  state$3.callbackIdCounter += 1;
  const callbackId = `update_restart_${state$3.callbackIdCounter}`;
  const msg = {
    type: "send",
    protocalVersion: PROTOCOL_VERSION,
    callbackId,
    namespace: NAMESPACE_UPDATE,
    method: METHOD_UPDATE_RESTART,
    params
  };
  const sent = sendLine(JSON.stringify(msg));
  if (!sent) {
    log2.warn("update.restart 发送失败");
    reportBeaconEvent(DAEMON_BRIDGE_REPORT_EVENTS.IPC_SEND_FAILURE, {
      command: `${NAMESPACE_UPDATE}.${METHOD_UPDATE_RESTART}`
    });
    return false;
  }
  log2.info(`已发送 update.restart (parentPid=${params.parentPid}, appPath=${params.appPath})`);
  return true;
}
const MAX_LINE_BYTES$1 = 1048576;
const ACTION_TIMEOUT_MS = 6e4;
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1e3;
const MAX_SESSIONS = 3;
const SESSION_IDLE_SCAN_INTERVAL_MS = 6e4;
const SOCKET_FILENAME$1 = "browser-automation.sock";
const SERVICES_DIR_NAME$1 = "services";
const DEFAULT_SESSION = "default";
const SESSION_NAME_MAX_LENGTH = 64;
const ENV_SOCKET_PATH$1 = "MARVIS_BROWSER_AUTOMATION_SOCKET_PATH";
const SHUTDOWN_TIMEOUT_MS$1 = 5e3;
const PAGE_ENABLE_MS = 5e3;
const NAVIGATE_ACK_MS$1 = 5e3;
const NAVIGATE_LOAD_MS = 15e3;
const WAIT_DEFAULT_TIMEOUT_MS = 25e3;
const WAIT_POLL_INTERVAL_MS = 100;
const WAIT_NETWORKIDLE_QUIET_MS = 500;
const DOWNLOAD_HISTORY_MAX = 64;
const DOWNLOAD_CLAIM_TTL_MS = 3e4;
const PARTITION_PREFIX$1 = "persist:automation-";
const INTERACTIVE_ROLES = /* @__PURE__ */ new Set([
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "treeitem"
]);
const CONTENT_ROLES = /* @__PURE__ */ new Set([
  "heading",
  "cell",
  "gridcell",
  "columnheader",
  "rowheader",
  "listitem",
  "article",
  "region",
  "main",
  "navigation"
]);
const STRUCTURAL_ROLES = /* @__PURE__ */ new Set([
  "generic",
  "group",
  "list",
  "table",
  "row",
  "rowgroup",
  "grid",
  "treegrid",
  "menu",
  "menubar",
  "toolbar",
  "tablist",
  "tree",
  "directory",
  "document",
  "application",
  "presentation",
  "none",
  "WebArea",
  "RootWebArea"
]);
function defaultBrowserAutomationSocketPath() {
  return join(app.getPath("userData"), SERVICES_DIR_NAME$1, SOCKET_FILENAME$1);
}
const ErrorCodes$1 = Object.freeze({
  E_BAD_JSON: "E_BAD_JSON",
  E_TOO_LARGE: "E_TOO_LARGE",
  E_UNKNOWN_ACTION: "E_UNKNOWN_ACTION",
  E_ATTACH_FAIL: "E_ATTACH_FAIL",
  E_CDP_FAIL: "E_CDP_FAIL",
  E_INVALID_PARAMS: "E_INVALID_PARAMS",
  E_NOT_FOUND: "E_NOT_FOUND",
  E_INTERNAL: "E_INTERNAL",
  E_TIMEOUT: "E_TIMEOUT",
  E_DOWNLOAD_FAIL: "E_DOWNLOAD_FAIL",
  E_TOO_MANY_SESSIONS: "E_TOO_MANY_SESSIONS"
});
function ok$1(id, data) {
  const resp = { id: id ?? null, success: true };
  if (data !== void 0) resp.data = data;
  return resp;
}
function fail$1(id, error, code) {
  const resp = {
    id: id ?? null,
    success: false,
    error: String(error instanceof Error ? error.message : error)
  };
  if (code) resp.code = code;
  return resp;
}
function serializeLine$1(envelope) {
  return `${JSON.stringify(envelope)}
`;
}
function parseRef(arg) {
  if (typeof arg !== "string") return null;
  if (arg.startsWith("@") && /^@e\d+$/.test(arg)) return arg.slice(1);
  if (arg.startsWith("ref=") && /^ref=e\d+$/.test(arg)) return arg.slice(4);
  if (/^e\d+$/.test(arg)) return arg;
  return null;
}
async function resolveLocator(ctx, selectorOrRef) {
  if (typeof selectorOrRef !== "string" || !selectorOrRef) return null;
  await ctx.sendCDP("DOM.enable").catch(() => void 0);
  if (isSemanticLocator(selectorOrRef)) {
    return resolveSemanticLocator(ctx, selectorOrRef);
  }
  const doc = await ctx.sendCDP("DOM.getDocument", { depth: 0 });
  const rootNodeId = doc?.root?.nodeId;
  if (!rootNodeId) return null;
  let cssSelector;
  const ref = parseRef(selectorOrRef);
  if (ref) {
    const data = ctx.refMap[ref];
    if (!data) {
      throw new Error(`unknown ref ${ref} (no such ref in last snapshot; run \`snapshot\` first)`);
    }
    if (!data.cssSelector) {
      throw new Error(`ref ${ref} has no resolvable selector`);
    }
    cssSelector = data.cssSelector;
  } else {
    cssSelector = selectorOrRef;
  }
  let queryResult;
  try {
    queryResult = await ctx.sendCDP("DOM.querySelector", {
      nodeId: rootNodeId,
      selector: cssSelector
    });
  } catch (err) {
    throw new Error(`invalid selector "${cssSelector}": ${err.message ?? String(err)}`);
  }
  const nodeId = queryResult?.nodeId;
  if (!nodeId) return null;
  const desc = await ctx.sendCDP("DOM.describeNode", { nodeId });
  const backendNodeId = desc?.node?.backendNodeId;
  if (!backendNodeId) return null;
  let objectId;
  try {
    const r = await ctx.sendCDP("DOM.resolveNode", { backendNodeId });
    objectId = r?.object?.objectId;
  } catch {
  }
  return { backendNodeId, objectId, nodeId, cssSelector };
}
const SEMANTIC_PREFIXES = ["role=", "text=", "label=", "placeholder=", "alt=", "title=", "testid="];
function parseIndexDecorator(s) {
  if (s.startsWith("first:")) return { kind: "first", rest: s.slice("first:".length) };
  if (s.startsWith("last:")) return { kind: "last", rest: s.slice("last:".length) };
  const m = /^nth=(\d+):(.*)$/s.exec(s);
  if (m) return { kind: "nth", n: Number(m[1]), rest: m[2] };
  return null;
}
function isSemanticLocator(s) {
  if (parseIndexDecorator(s)) return true;
  return SEMANTIC_PREFIXES.some((p) => s.startsWith(p));
}
async function resolveSemanticLocator(ctx, raw) {
  let pickIndex = "first";
  const dec = parseIndexDecorator(raw);
  let inner = raw;
  if (dec) {
    pickIndex = dec.kind === "nth" ? dec.n ?? 0 : dec.kind;
    inner = dec.rest;
  }
  const fnSrc = buildSemanticQueryFn();
  const expr = `(${fnSrc})(${JSON.stringify(inner)}, ${JSON.stringify(pickIndex)})`;
  const r = await ctx.sendCDP("Runtime.evaluate", {
    expression: expr,
    returnByValue: false
    // 拿到的是 Element 引用，不要 JSON 化
  });
  if (r?.exceptionDetails) {
    const msg = r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? "semantic locator failed";
    throw new Error(`semantic locator "${raw}": ${msg}`);
  }
  const objectId = r?.result?.objectId;
  if (!objectId || r.result?.subtype === "null") return null;
  const reqNode = await ctx.sendCDP("DOM.requestNode", { objectId });
  const nodeId = reqNode?.nodeId;
  if (!nodeId) return null;
  const desc = await ctx.sendCDP("DOM.describeNode", { nodeId });
  const backendNodeId = desc?.node?.backendNodeId;
  if (!backendNodeId) return null;
  return { backendNodeId, objectId, nodeId, cssSelector: raw };
}
function buildSemanticQueryFn() {
  return `function(spec, pick) {
    function eqText(a, b, exact) {
      if (a == null) return false;
      var na = String(a).replace(/\\s+/g, ' ').trim();
      var nb = String(b).replace(/\\s+/g, ' ').trim();
      return exact ? na === nb : na.toLowerCase().indexOf(nb.toLowerCase()) >= 0;
    }
    function parsePrefix(s) {
      var idx = s.indexOf('=');
      if (idx <= 0) return null;
      return { kind: s.slice(0, idx), val: s.slice(idx + 1) };
    }
    function parseRoleSpec(val) {
      // role=button[name="Submit"]、role=button[name="Submit",exact]、role=button
      var name = null, exact = false, role = val;
      var m = /^([a-zA-Z]+)\\[(.*)\\]$/.exec(val);
      if (m) {
        role = m[1];
        var inside = m[2];
        var nm = /name=(?:"([^"]*)"|'([^']*)'|([^,\\]]+))(?:,(exact))?/.exec(inside);
        if (nm) {
          name = nm[1] != null ? nm[1] : (nm[2] != null ? nm[2] : nm[3]);
          exact = nm[4] === 'exact';
        }
      }
      return { role: role, name: name, exact: exact };
    }
    function unquote(s) {
      if (s.length >= 2 && ((s[0] === '"' && s[s.length-1] === '"') || (s[0] === '\\'' && s[s.length-1] === '\\''))) {
        return s.slice(1, -1);
      }
      return s;
    }
    function stripExact(v) {
      // 形如  "Sign In"[exact] / Sign In[exact]
      var ex = false;
      if (v.endsWith('[exact]')) { ex = true; v = v.slice(0, -'[exact]'.length); }
      return { val: unquote(v), exact: ex };
    }
    var IMPLICIT_ROLE = {
      A: 'link', BUTTON: 'button', INPUT_button: 'button', INPUT_submit: 'button', INPUT_reset: 'button',
      INPUT_text: 'textbox', INPUT_search: 'searchbox', INPUT_email: 'textbox', INPUT_url: 'textbox',
      INPUT_tel: 'textbox', INPUT_password: 'textbox', INPUT_number: 'spinbutton',
      INPUT_checkbox: 'checkbox', INPUT_radio: 'radio',
      TEXTAREA: 'textbox', SELECT: 'combobox',
      H1: 'heading', H2: 'heading', H3: 'heading', H4: 'heading', H5: 'heading', H6: 'heading',
      NAV: 'navigation', MAIN: 'main', HEADER: 'banner', FOOTER: 'contentinfo', ASIDE: 'complementary',
      SECTION: 'region', ARTICLE: 'article', UL: 'list', OL: 'list', LI: 'listitem',
      IMG: 'img'
    };
    function elRole(el) {
      var explicit = el.getAttribute && el.getAttribute('role');
      if (explicit) return explicit.toLowerCase();
      var tag = (el.tagName || '').toUpperCase();
      if (tag === 'INPUT') {
        var t = (el.getAttribute('type') || 'text').toLowerCase();
        return IMPLICIT_ROLE['INPUT_' + t] || 'textbox';
      }
      return IMPLICIT_ROLE[tag] || '';
    }
    function elName(el) {
      // aria-label > aria-labelledby > <label> for > 子文本 > placeholder > alt > title
      if (el.getAttribute) {
        var al = el.getAttribute('aria-label');
        if (al) return al;
        var alb = el.getAttribute('aria-labelledby');
        if (alb) {
          var ids = alb.split(/\\s+/).filter(Boolean);
          var parts = ids.map(function(i) { var n = document.getElementById(i); return n ? n.textContent : ''; });
          var s = parts.join(' ').trim();
          if (s) return s;
        }
      }
      if (el.id) {
        var lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (lab && lab.textContent) return lab.textContent;
      }
      // <label><input/>text</label>
      var p = el.parentElement;
      while (p) {
        if (p.tagName === 'LABEL') {
          var clone = p.cloneNode(true);
          // 去掉内嵌的可交互节点文本会更精准，这里图省事直接用 textContent
          return clone.textContent || '';
        }
        p = p.parentElement;
      }
      var txt = (el.innerText || el.textContent || '').trim();
      if (txt) return txt;
      var ph = el.getAttribute && el.getAttribute('placeholder');
      if (ph) return ph;
      var alt = el.getAttribute && el.getAttribute('alt');
      if (alt) return alt;
      var ti = el.getAttribute && el.getAttribute('title');
      if (ti) return ti;
      return '';
    }
    function queryAll(spec) {
      var p = parsePrefix(spec);
      if (!p) return [];
      var all = Array.from(document.querySelectorAll('*'));
      switch (p.kind) {
        case 'role': {
          var rs = parseRoleSpec(p.val);
          return all.filter(function(el) {
            if (elRole(el) !== rs.role.toLowerCase()) return false;
            if (rs.name == null) return true;
            return eqText(elName(el), rs.name, rs.exact);
          });
        }
        case 'text': {
          var t = stripExact(p.val);
          return all.filter(function(el) {
            // 只看叶子或不嵌套同 role 的节点；先粗暴：textContent 命中即可
            return eqText(el.innerText || el.textContent || '', t.val, t.exact);
          });
        }
        case 'label': {
          var t2 = stripExact(p.val);
          // 找到 label，再返回其关联 input
          var labels = Array.from(document.querySelectorAll('label'));
          var hits = [];
          labels.forEach(function(lab) {
            var txt = (lab.innerText || lab.textContent || '').trim();
            if (!eqText(txt, t2.val, t2.exact)) return;
            var forId = lab.getAttribute('for');
            var target = forId ? document.getElementById(forId) : lab.querySelector('input,select,textarea,button');
            if (target) hits.push(target);
          });
          return hits;
        }
        case 'placeholder': {
          var t3 = stripExact(p.val);
          return all.filter(function(el) {
            var ph = el.getAttribute && el.getAttribute('placeholder');
            return ph != null && eqText(ph, t3.val, t3.exact);
          });
        }
        case 'alt': {
          var t4 = stripExact(p.val);
          return all.filter(function(el) {
            var a = el.getAttribute && el.getAttribute('alt');
            return a != null && eqText(a, t4.val, t4.exact);
          });
        }
        case 'title': {
          var t5 = stripExact(p.val);
          return all.filter(function(el) {
            var a = el.getAttribute && el.getAttribute('title');
            return a != null && eqText(a, t5.val, t5.exact);
          });
        }
        case 'testid': {
          var v = unquote(p.val);
          return all.filter(function(el) {
            var d = el.getAttribute && el.getAttribute('data-testid');
            return d === v;
          });
        }
        default:
          return [];
      }
    }
    var hits = queryAll(spec);
    if (hits.length === 0) return null;
    if (pick === 'first') return hits[0];
    if (pick === 'last') return hits[hits.length - 1];
    if (typeof pick === 'number') {
      if (pick < 0 || pick >= hits.length) return null;
      return hits[pick];
    }
    return hits[0];
  }`;
}
async function getNodeCenter(ctx, backendNodeId) {
  try {
    const r = await ctx.sendCDP("DOM.resolveNode", { backendNodeId });
    const objectId = r?.object?.objectId;
    if (objectId) {
      await ctx.sendCDP("Runtime.callFunctionOn", {
        objectId,
        functionDeclaration: "function() { this.scrollIntoView({block:'center', inline:'center'}); }",
        returnByValue: true
      }).catch(() => void 0);
    }
  } catch {
  }
  const box = await ctx.sendCDP("DOM.getBoxModel", { backendNodeId }).catch(() => null);
  if (!box?.model || !Array.isArray(box.model.content)) return null;
  const c = box.model.content;
  if (c.length < 8) return null;
  const xs = [c[0], c[2], c[4], c[6]];
  const ys = [c[1], c[3], c[5], c[7]];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY
  };
}
async function buildCssSelectorForBackendNode(ctx, backendNodeId) {
  let objectId;
  try {
    const r = await ctx.sendCDP("DOM.resolveNode", { backendNodeId });
    objectId = r?.object?.objectId;
  } catch {
    return null;
  }
  if (!objectId) return null;
  const fn = `function() {
    const el = this;
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return '#' + CSS.escape(el.id);
    if (el.getAttribute && el.getAttribute('data-testid')) {
      return '[data-testid="' + el.getAttribute('data-testid') + '"]';
    }
    const path = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      let part = cur.tagName.toLowerCase();
      const parent = cur.parentElement;
      if (parent) {
        const sib = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
        if (sib.length > 1) part += ':nth-of-type(' + (sib.indexOf(cur) + 1) + ')';
      }
      path.unshift(part);
      cur = cur.parentElement;
      if (path.length >= 12) break;
    }
    return path.join(' > ');
  }`;
  try {
    const r = await ctx.sendCDP("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: fn,
      returnByValue: true
    });
    if (typeof r?.result?.value === "string") return r.result.value;
  } catch {
  }
  return null;
}
function axStringValue(prop) {
  if (!prop) return "";
  if (typeof prop.value === "string") return prop.value;
  if (typeof prop.value === "object" && prop.value && typeof prop.value.value === "string") {
    return prop.value.value;
  }
  return "";
}
async function buildEnhancedSnapshot(ctx, options) {
  const onlyInteractive = !!options.interactive;
  const { maxDepth } = options;
  const compact = !!options.compact;
  await ctx.sendCDP("Accessibility.enable").catch(() => void 0);
  await ctx.sendCDP("DOM.enable").catch(() => void 0);
  const tree = await ctx.sendCDP("Accessibility.getFullAXTree", {});
  const nodes = tree?.nodes ?? [];
  const byId = /* @__PURE__ */ new Map();
  for (const n of nodes) byId.set(n.nodeId, n);
  let root = null;
  for (const n of nodes) {
    const { parentId } = n;
    if (!parentId || !byId.has(parentId)) {
      const role = n.role?.value;
      if (role === "WebArea" || role === "RootWebArea" || !root) {
        root = n;
        if (role === "WebArea" || role === "RootWebArea") break;
      }
    }
  }
  const refs = {};
  const lines = [];
  const seenCounts = /* @__PURE__ */ new Map();
  const refsByKey = /* @__PURE__ */ new Map();
  let refCounter = 0;
  const nextRef = () => {
    refCounter += 1;
    return `e${refCounter}`;
  };
  const visit = async (node, depth) => {
    if (!node) return;
    if (node.ignored) {
      for (const childId of node.childIds ?? []) {
        await visit(byId.get(childId), depth);
      }
      return;
    }
    if (typeof maxDepth === "number" && depth > maxDepth) return;
    const role = node.role?.value ?? "";
    const roleLower = String(role).toLowerCase();
    const name = axStringValue(node.name);
    const isInteractive = INTERACTIVE_ROLES.has(roleLower);
    const isContentNamed = CONTENT_ROLES.has(roleLower) && !!name;
    const isStructural = STRUCTURAL_ROLES.has(roleLower);
    if (onlyInteractive && !isInteractive) {
      for (const childId of node.childIds ?? []) await visit(byId.get(childId), depth);
      return;
    }
    if (compact && isStructural && !name) {
      for (const childId of node.childIds ?? []) await visit(byId.get(childId), depth);
      return;
    }
    if (!role) {
      for (const childId of node.childIds ?? []) await visit(byId.get(childId), depth);
      return;
    }
    let refId = null;
    if (isInteractive || isContentNamed) {
      refId = nextRef();
      const key = `${roleLower}:${name}`;
      const nth = seenCounts.get(key) ?? 0;
      seenCounts.set(key, nth + 1);
      const list = refsByKey.get(key) ?? [];
      list.push(refId);
      refsByKey.set(key, list);
      let cssSelector = null;
      if (node.backendDOMNodeId) {
        cssSelector = await buildCssSelectorForBackendNode(ctx, node.backendDOMNodeId);
      }
      refs[refId] = {
        role: roleLower,
        name,
        cssSelector: cssSelector ?? void 0,
        backendNodeId: node.backendDOMNodeId,
        nth
        // 后处理时若 list 长度=1 会移除
      };
    }
    const indent = "  ".repeat(depth);
    let line = `${indent}- ${role}`;
    if (name) line += ` "${name}"`;
    if (refId) {
      line += ` [ref=${refId}]`;
      const key = `${roleLower}:${name}`;
      const list = refsByKey.get(key);
      if (list && list.length > 1) line += ` [nth=${list.length - 1}]`;
    }
    lines.push(line);
    for (const childId of node.childIds ?? []) {
      await visit(byId.get(childId), depth + 1);
    }
  };
  if (root && Array.isArray(root.childIds)) {
    for (const childId of root.childIds) {
      await visit(byId.get(childId), 0);
    }
  } else {
    for (const n of nodes) {
      if (!n.parentId) await visit(n, 0);
    }
  }
  for (const [, list] of refsByKey) {
    if (list.length === 1) {
      const onlyRef = list[0];
      if (refs[onlyRef]) delete refs[onlyRef].nth;
    }
  }
  await appendFileInputs(ctx, refs, lines, nextRef);
  return {
    tree: lines.join("\n") || "(empty)",
    refs
  };
}
async function appendFileInputs(ctx, refs, lines, nextRef) {
  const existing = /* @__PURE__ */ new Set();
  for (const r of Object.values(refs)) {
    if (typeof r.backendNodeId === "number") existing.add(r.backendNodeId);
  }
  let rootNodeId;
  try {
    const doc = await ctx.sendCDP("DOM.getDocument", { depth: 0 });
    rootNodeId = doc?.root?.nodeId;
  } catch {
    return;
  }
  if (!rootNodeId) return;
  let qsa;
  try {
    qsa = await ctx.sendCDP("DOM.querySelectorAll", {
      nodeId: rootNodeId,
      selector: 'input[type="file"]'
    });
  } catch {
    return;
  }
  const nodeIds = qsa?.nodeIds ?? [];
  if (nodeIds.length === 0) return;
  let appendedHeader = false;
  for (const nodeId of nodeIds) {
    let backendNodeId;
    try {
      const desc = await ctx.sendCDP("DOM.describeNode", { nodeId });
      backendNodeId = desc?.node?.backendNodeId;
    } catch {
      continue;
    }
    if (!backendNodeId || existing.has(backendNodeId)) continue;
    existing.add(backendNodeId);
    const css = await buildCssSelectorForBackendNode(ctx, backendNodeId);
    const meta = await readFileInputMeta(ctx, backendNodeId);
    const refId = nextRef();
    Object.assign(refs, {
      [refId]: {
        role: "fileinput",
        name: meta.name,
        cssSelector: css ?? void 0,
        backendNodeId
      }
    });
    if (!appendedHeader) {
      lines.push("# file inputs (hidden in AX tree, surfaced for upload)");
      appendedHeader = true;
    }
    const accept = meta.accept ? ` accept="${meta.accept}"` : "";
    const multi = meta.multiple ? " multiple" : "";
    const namePart = meta.name ? ` "${meta.name}"` : "";
    lines.push(`- fileinput${namePart}${accept}${multi} [ref=${refId}]`);
  }
}
async function readFileInputMeta(ctx, backendNodeId) {
  let objectId;
  try {
    const r = await ctx.sendCDP("DOM.resolveNode", { backendNodeId });
    objectId = r?.object?.objectId;
  } catch {
  }
  if (!objectId) return { name: "", accept: "", multiple: false };
  try {
    const r = await ctx.sendCDP("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: `function() {
        // 优先级：aria-label > name 属性 > 关联 label 文本 > id > placeholder
        const ariaLabel = this.getAttribute('aria-label') || '';
        const nameAttr = this.getAttribute('name') || '';
        let labelText = '';
        if (this.id) {
          const lab = document.querySelector('label[for="' + CSS.escape(this.id) + '"]');
          if (lab) labelText = (lab.textContent || '').trim();
        }
        const idAttr = this.getAttribute('id') || '';
        const ph = this.getAttribute('placeholder') || '';
        return {
          name: ariaLabel || nameAttr || labelText || idAttr || ph || '',
          accept: this.getAttribute('accept') || '',
          multiple: !!this.multiple,
        };
      }`,
      returnByValue: true
    });
    const v = r?.result?.value ?? {};
    return {
      name: typeof v.name === "string" ? v.name : "",
      accept: typeof v.accept === "string" ? v.accept : "",
      multiple: !!v.multiple
    };
  } catch {
    return { name: "", accept: "", multiple: false };
  }
}
function describeKey(key) {
  const map = {
    Enter: { code: "Enter", key: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
    Tab: { code: "Tab", key: "Tab", windowsVirtualKeyCode: 9 },
    Escape: { code: "Escape", key: "Escape", windowsVirtualKeyCode: 27 },
    Backspace: { code: "Backspace", key: "Backspace", windowsVirtualKeyCode: 8 },
    Delete: { code: "Delete", key: "Delete", windowsVirtualKeyCode: 46 },
    ArrowUp: { code: "ArrowUp", key: "ArrowUp", windowsVirtualKeyCode: 38 },
    ArrowDown: { code: "ArrowDown", key: "ArrowDown", windowsVirtualKeyCode: 40 },
    ArrowLeft: { code: "ArrowLeft", key: "ArrowLeft", windowsVirtualKeyCode: 37 },
    ArrowRight: { code: "ArrowRight", key: "ArrowRight", windowsVirtualKeyCode: 39 },
    Home: { code: "Home", key: "Home", windowsVirtualKeyCode: 36 },
    End: { code: "End", key: "End", windowsVirtualKeyCode: 35 },
    PageUp: { code: "PageUp", key: "PageUp", windowsVirtualKeyCode: 33 },
    PageDown: { code: "PageDown", key: "PageDown", windowsVirtualKeyCode: 34 },
    Space: { code: "Space", key: " ", windowsVirtualKeyCode: 32, text: " " }
  };
  return map[key] ?? { key, text: key.length === 1 ? key : void 0 };
}
async function withTimeout$2(promise, ms, label) {
  let timer2 = null;
  const timeout = new Promise((_, reject) => {
    timer2 = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer2) clearTimeout(timer2);
  }
}
function sendWithTimeout(ctx, method, params, ms, label) {
  return Promise.race([
    ctx.sendCDP(method, params ?? {}),
    new Promise((_resolve, reject) => setTimeout(
      () => reject(new Error(`${label ?? method} did not reply in ${ms}ms`)),
      ms
    ))
  ]);
}
async function handleNavigate(req, ctx) {
  const { url } = req;
  if (typeof url !== "string" || !url) {
    return fail$1(req.id, "navigate requires a string `url`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  const log2 = ctx.logger;
  const dbgLog = (msg) => {
    try {
      log2?.info?.(`navigate: ${msg}`);
    } catch {
    }
  };
  dbgLog("Page.enable...");
  try {
    await sendWithTimeout(ctx, "Page.enable", {}, PAGE_ENABLE_MS, "Page.enable");
    dbgLog("Page.enable ok");
  } catch (err) {
    dbgLog(`Page.enable FAILED: ${err.message}`);
    return fail$1(req.id, `Page.enable failed: ${err.message}`, ErrorCodes$1.E_CDP_FAIL);
  }
  ctx.refMap = {};
  let loadEventSeen = null;
  const dbg = ctx.debugger;
  const loadPromise = new Promise((resolve2) => {
    const onMessage = (_event, method, params) => {
      if (method === "Page.loadEventFired" || method === "Page.frameStoppedLoading") {
        loadEventSeen = method;
        dbg.removeListener("message", onMessage);
        resolve2();
      } else if (method === "Page.frameNavigated" || method === "Page.frameStartedLoading") {
        dbgLog(`event: ${method} ${JSON.stringify(params ?? {}).slice(0, 200)}`);
      }
    };
    dbg.on("message", onMessage);
    setTimeout(() => {
      dbg.removeListener("message", onMessage);
      resolve2();
    }, NAVIGATE_LOAD_MS);
  });
  dbgLog(`Page.navigate -> ${url}`);
  let nav;
  try {
    nav = await sendWithTimeout(ctx, "Page.navigate", { url }, NAVIGATE_ACK_MS$1, "Page.navigate ack");
  } catch (err) {
    dbgLog(`Page.navigate ack timeout: ${err.message}`);
  }
  if (nav?.errorText) {
    return fail$1(req.id, `navigate failed: ${nav.errorText}`, ErrorCodes$1.E_CDP_FAIL);
  }
  await loadPromise;
  dbgLog(`done loadEventSeen=${loadEventSeen ?? "(timeout)"}`);
  let title = "";
  let finalUrl = url;
  try {
    const t = await ctx.sendCDP("Runtime.evaluate", {
      expression: "document.title",
      returnByValue: true
    });
    if (typeof t?.result?.value === "string") title = t.result.value;
  } catch {
  }
  try {
    const u = await ctx.sendCDP("Runtime.evaluate", {
      expression: "location.href",
      returnByValue: true
    });
    if (typeof u?.result?.value === "string") finalUrl = u.result.value;
  } catch {
  }
  return ok$1(req.id, { url: finalUrl, title, loadEvent: loadEventSeen });
}
async function handleReload(req, ctx) {
  await ctx.sendCDP("Page.enable");
  await ctx.sendCDP("Page.reload", { ignoreCache: !!req.ignoreCache });
  ctx.refMap = {};
  return ok$1(req.id);
}
async function handleHistoryNav(req, ctx, direction) {
  await ctx.sendCDP("Page.enable").catch(() => void 0);
  const hist = await ctx.sendCDP("Page.getNavigationHistory");
  const cur = hist?.currentIndex ?? -1;
  const entries2 = hist?.entries ?? [];
  const target = cur + direction;
  if (target < 0 || target >= entries2.length) {
    return ok$1(req.id, { moved: false });
  }
  const entryId = entries2[target]?.id;
  if (typeof entryId !== "number") {
    return ok$1(req.id, { moved: false });
  }
  await ctx.sendCDP("Page.navigateToHistoryEntry", { entryId });
  ctx.refMap = {};
  return ok$1(req.id, { moved: true });
}
async function handleBack(req, ctx) {
  return handleHistoryNav(req, ctx, -1);
}
async function handleForward(req, ctx) {
  return handleHistoryNav(req, ctx, 1);
}
async function handleClick(req, ctx) {
  if (typeof req.selector !== "string" || !req.selector) {
    return fail$1(req.id, "click requires `selector`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  const button = req.button ?? "left";
  const clickCount = Number(req.clickCount) || 1;
  const delayMs = Number(req.delay) || 0;
  let loc;
  try {
    loc = await resolveLocator(ctx, req.selector);
  } catch (err) {
    return fail$1(req.id, err.message, ErrorCodes$1.E_INVALID_PARAMS);
  }
  if (!loc) {
    return fail$1(req.id, `selector not found: ${req.selector}`, ErrorCodes$1.E_NOT_FOUND);
  }
  const point = await getNodeCenter(ctx, loc.backendNodeId);
  if (!point || point.width === 0 || point.height === 0) {
    return fail$1(
      req.id,
      `selector "${req.selector}" has no visible box`,
      ErrorCodes$1.E_CDP_FAIL
    );
  }
  if (!req.newTab && loc.objectId) {
    try {
      await ctx.sendCDP("Runtime.callFunctionOn", {
        objectId: loc.objectId,
        functionDeclaration: `function() {
          let el = this;
          for (let i = 0; i < 5 && el && el !== document.body; i++) {
            if (el.tagName === 'A') {
              el.removeAttribute('target');
              const rel = el.getAttribute('rel');
              if (rel) {
                el.setAttribute(
                  'rel',
                  rel.split(/\\s+/)
                    .filter(t => t !== 'noopener' && t !== 'noreferrer')
                    .join(' ')
                );
              }
              break;
            }
            el = el.parentElement;
          }
        }`,
        returnByValue: true
      });
    } catch {
    }
  }
  await ctx.sendCDP("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await ctx.sendCDP("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button,
    clickCount
  });
  if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  await ctx.sendCDP("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button,
    clickCount
  });
  return ok$1(req.id, { clicked: true, x: point.x, y: point.y });
}
async function handleDblClick(req, ctx) {
  const next = { ...req, action: "click", clickCount: 2 };
  return handleClick(next, ctx);
}
async function handleFocus(req, ctx) {
  if (typeof req.selector !== "string" || !req.selector) {
    return fail$1(req.id, "focus requires `selector`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  let loc;
  try {
    loc = await resolveLocator(ctx, req.selector);
  } catch (err) {
    return fail$1(req.id, err.message, ErrorCodes$1.E_INVALID_PARAMS);
  }
  if (!loc) return fail$1(req.id, `selector not found: ${req.selector}`, ErrorCodes$1.E_NOT_FOUND);
  try {
    await ctx.sendCDP("DOM.focus", { backendNodeId: loc.backendNodeId });
  } catch (err) {
    return fail$1(req.id, `focus failed: ${err.message}`, ErrorCodes$1.E_CDP_FAIL);
  }
  return ok$1(req.id, { focused: true });
}
async function handleScrollIntoView(req, ctx) {
  if (typeof req.selector !== "string" || !req.selector) {
    return fail$1(req.id, "scroll_into_view requires `selector`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  let loc;
  try {
    loc = await resolveLocator(ctx, req.selector);
  } catch (err) {
    return fail$1(req.id, err.message, ErrorCodes$1.E_INVALID_PARAMS);
  }
  if (!loc) return fail$1(req.id, `selector not found: ${req.selector}`, ErrorCodes$1.E_NOT_FOUND);
  if (!loc.objectId) {
    return fail$1(req.id, `selector "${req.selector}" has no objectId`, ErrorCodes$1.E_CDP_FAIL);
  }
  try {
    await ctx.sendCDP("Runtime.callFunctionOn", {
      objectId: loc.objectId,
      functionDeclaration: 'function() { this.scrollIntoView({ block: "center", inline: "center" }); return true; }',
      returnByValue: true
    });
  } catch (err) {
    return fail$1(req.id, `scroll_into_view failed: ${err.message}`, ErrorCodes$1.E_CDP_FAIL);
  }
  return ok$1(req.id, { scrolled: true });
}
async function handleHover(req, ctx) {
  if (typeof req.selector !== "string" || !req.selector) {
    return fail$1(req.id, "hover requires `selector`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  let loc;
  try {
    loc = await resolveLocator(ctx, req.selector);
  } catch (err) {
    return fail$1(req.id, err.message, ErrorCodes$1.E_INVALID_PARAMS);
  }
  if (!loc) {
    return fail$1(req.id, `selector not found: ${req.selector}`, ErrorCodes$1.E_NOT_FOUND);
  }
  const point = await getNodeCenter(ctx, loc.backendNodeId);
  if (!point) {
    return fail$1(req.id, `selector "${req.selector}" has no visible box`, ErrorCodes$1.E_CDP_FAIL);
  }
  await ctx.sendCDP("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  return ok$1(req.id, { hovered: true, x: point.x, y: point.y });
}
async function handleType(req, ctx) {
  if (typeof req.selector !== "string" || typeof req.text !== "string") {
    return fail$1(req.id, "type requires `selector` and `text`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  const delayMs = Number(req.delay) || 0;
  const clear = !!req.clear;
  let loc;
  try {
    loc = await resolveLocator(ctx, req.selector);
  } catch (err) {
    return fail$1(req.id, err.message, ErrorCodes$1.E_INVALID_PARAMS);
  }
  if (!loc) {
    return fail$1(req.id, `selector not found: ${req.selector}`, ErrorCodes$1.E_NOT_FOUND);
  }
  await ctx.sendCDP("DOM.focus", { backendNodeId: loc.backendNodeId }).catch(() => void 0);
  if (clear) {
    await clearFocusedInput(ctx);
  }
  if (delayMs > 0) {
    for (const ch of req.text) {
      await ctx.sendCDP("Input.insertText", { text: ch });
      await new Promise((r) => setTimeout(r, delayMs));
    }
  } else {
    await ctx.sendCDP("Input.insertText", { text: req.text });
  }
  return ok$1(req.id, { typed: true });
}
async function handleFill(req, ctx) {
  if (typeof req.selector !== "string" || typeof req.text !== "string") {
    return fail$1(req.id, "fill requires `selector` and `text`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  let loc;
  try {
    loc = await resolveLocator(ctx, req.selector);
  } catch (err) {
    return fail$1(req.id, err.message, ErrorCodes$1.E_INVALID_PARAMS);
  }
  if (!loc) {
    return fail$1(req.id, `selector not found: ${req.selector}`, ErrorCodes$1.E_NOT_FOUND);
  }
  if (loc.objectId) {
    const fn = `function(value) {
      const el = this;
      const tag = (el.tagName || '').toUpperCase();
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';
      if (isInput) {
        const proto = tag === 'INPUT'
          ? window.HTMLInputElement.prototype
          : window.HTMLTextAreaElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (el.isContentEditable) {
        el.innerText = value;
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
      } else {
        throw new Error('element is not fillable');
      }
      return true;
    }`;
    try {
      await ctx.sendCDP("Runtime.callFunctionOn", {
        objectId: loc.objectId,
        functionDeclaration: fn,
        arguments: [{ value: req.text }],
        returnByValue: true
      });
      return ok$1(req.id, { filled: true });
    } catch (err) {
      return fail$1(req.id, `fill failed: ${err.message}`, ErrorCodes$1.E_CDP_FAIL);
    }
  }
  await ctx.sendCDP("DOM.focus", { backendNodeId: loc.backendNodeId }).catch(() => void 0);
  await clearFocusedInput(ctx);
  await ctx.sendCDP("Input.insertText", { text: req.text });
  return ok$1(req.id, { filled: true });
}
async function clearFocusedInput(ctx) {
  const modifier = 4;
  await ctx.sendCDP("Input.dispatchKeyEvent", {
    type: "keyDown",
    modifiers: modifier,
    code: "KeyA",
    key: "a",
    windowsVirtualKeyCode: 65
  });
  await ctx.sendCDP("Input.dispatchKeyEvent", {
    type: "keyUp",
    modifiers: modifier,
    code: "KeyA",
    key: "a",
    windowsVirtualKeyCode: 65
  });
  const del = describeKey("Delete");
  await ctx.sendCDP("Input.dispatchKeyEvent", { type: "keyDown", ...del });
  await ctx.sendCDP("Input.dispatchKeyEvent", { type: "keyUp", ...del });
}
async function handlePress(req, ctx) {
  if (typeof req.key !== "string" || !req.key) {
    return fail$1(req.id, "press requires `key`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  if (typeof req.selector === "string" && req.selector) {
    let loc;
    try {
      loc = await resolveLocator(ctx, req.selector);
    } catch (err) {
      return fail$1(req.id, err.message, ErrorCodes$1.E_INVALID_PARAMS);
    }
    if (loc) {
      await ctx.sendCDP("DOM.focus", { backendNodeId: loc.backendNodeId }).catch(() => void 0);
    }
  }
  const desc = describeKey(req.key);
  await ctx.sendCDP("Input.dispatchKeyEvent", { type: "keyDown", ...desc });
  await ctx.sendCDP("Input.dispatchKeyEvent", { type: "keyUp", ...desc });
  return ok$1(req.id, { pressed: true });
}
async function handleKeyboard(req, ctx) {
  const sub = req.subaction ?? "type";
  if (sub === "type" || sub === "inserttext") {
    if (typeof req.text !== "string") {
      return fail$1(req.id, "keyboard.type requires `text`", ErrorCodes$1.E_INVALID_PARAMS);
    }
    await ctx.sendCDP("Input.insertText", { text: req.text });
    return ok$1(req.id);
  }
  if (sub === "press" || sub === "key") {
    return handlePress(req, ctx);
  }
  return fail$1(req.id, `unknown keyboard subaction: ${sub}`, ErrorCodes$1.E_UNKNOWN_ACTION);
}
async function handleScroll(req, ctx) {
  const dx = Number(req.dx ?? req.x ?? 0) || 0;
  const dyRaw = Number(req.dy ?? req.y ?? 0);
  const dy = Number.isFinite(dyRaw) ? dyRaw : 0;
  const expr = req.selector ? `(() => {
        const el = document.querySelector(${JSON.stringify(req.selector)});
        if (!el) return false;
        el.scrollBy(${dx}, ${dy || "window.innerHeight * 0.8"});
        return true;
      })()` : `(() => { window.scrollBy(${dx}, ${dy || "window.innerHeight * 0.8"}); return true; })()`;
  const r = await ctx.sendCDP("Runtime.evaluate", {
    expression: expr,
    returnByValue: true
  });
  if (r?.result?.value === false) {
    return fail$1(req.id, `selector not found: ${req.selector}`, ErrorCodes$1.E_NOT_FOUND);
  }
  return ok$1(req.id, { scrolled: true });
}
async function handleScreenshot(req, ctx) {
  const format = req.format === "jpeg" ? "jpeg" : "png";
  const params = {
    format,
    captureBeyondViewport: !!req.fullPage
  };
  if (format === "jpeg" && typeof req.quality === "number") {
    params.quality = req.quality;
  }
  if (typeof req.selector === "string" && req.selector) {
    let loc;
    try {
      loc = await resolveLocator(ctx, req.selector);
    } catch (err) {
      return fail$1(req.id, err.message, ErrorCodes$1.E_INVALID_PARAMS);
    }
    if (!loc) {
      return fail$1(req.id, `selector not found: ${req.selector}`, ErrorCodes$1.E_NOT_FOUND);
    }
    const point = await getNodeCenter(ctx, loc.backendNodeId);
    const box = await ctx.sendCDP("DOM.getBoxModel", { backendNodeId: loc.backendNodeId }).catch(() => null);
    if (!point || !box?.model || !Array.isArray(box.model.content)) {
      return fail$1(req.id, `selector "${req.selector}" has no visible box`, ErrorCodes$1.E_CDP_FAIL);
    }
    const c = box.model.content;
    const xs = [c[0], c[2], c[4], c[6]];
    const ys = [c[1], c[3], c[5], c[7]];
    params.clip = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: box.model.width,
      height: box.model.height,
      scale: 1
    };
  }
  const r = await ctx.sendCDP("Page.captureScreenshot", params);
  if (typeof r?.data !== "string") {
    return fail$1(req.id, "screenshot returned no data", ErrorCodes$1.E_CDP_FAIL);
  }
  if (typeof req.path === "string" && req.path.length > 0) {
    const out = path__default$1.resolve(req.path);
    fs__default.mkdirSync(path__default$1.dirname(out), { recursive: true });
    fs__default.writeFileSync(out, Buffer.from(r.data, "base64"));
    return ok$1(req.id, { path: out });
  }
  return ok$1(req.id, { data: r.data, format });
}
async function handleSnapshot(req, ctx) {
  ctx.refMap = {};
  const { tree, refs } = await buildEnhancedSnapshot(ctx, {
    interactive: !!req.interactive,
    maxDepth: typeof req.maxDepth === "number" ? req.maxDepth : void 0,
    compact: !!req.compact
  });
  ctx.refMap = refs;
  ctx.lastSnapshotTree = tree;
  const simpleRefs = {};
  for (const k of Object.keys(refs)) {
    simpleRefs[k] = { role: refs[k].role, name: refs[k].name };
  }
  let origin = null;
  try {
    const u = await ctx.sendCDP("Runtime.evaluate", {
      expression: "location.href",
      returnByValue: true
    });
    if (typeof u?.result?.value === "string") origin = u.result.value;
  } catch {
  }
  return ok$1(req.id, {
    snapshot: tree,
    refs: Object.keys(simpleRefs).length > 0 ? simpleRefs : void 0,
    origin
  });
}
async function handleEvaluate(req, ctx) {
  if (typeof req.expression !== "string" && typeof req.script !== "string") {
    return fail$1(
      req.id,
      "evaluate requires `expression` or `script`",
      ErrorCodes$1.E_INVALID_PARAMS
    );
  }
  const expression = req.expression ?? req.script ?? "";
  const r = await ctx.sendCDP("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: !!req.awaitPromise,
    userGesture: true
  });
  if (r?.exceptionDetails) {
    return fail$1(req.id, r.exceptionDetails.text ?? "evaluate threw", ErrorCodes$1.E_CDP_FAIL);
  }
  return ok$1(req.id, { value: r?.result?.value });
}
async function evalString(ctx, expression) {
  try {
    const r = await ctx.sendCDP("Runtime.evaluate", {
      expression,
      returnByValue: true
    });
    return typeof r?.result?.value === "string" ? r.result.value : "";
  } catch {
    return "";
  }
}
async function handleGetText(req, ctx) {
  const sel = typeof req.selector === "string" && req.selector ? req.selector : "body";
  if (sel === "body") {
    const text = await evalString(
      ctx,
      '(document.body && document.body.innerText) ? document.body.innerText : ""'
    );
    return ok$1(req.id, { text });
  }
  let loc;
  try {
    loc = await resolveLocator(ctx, sel);
  } catch (err) {
    return fail$1(req.id, err.message, ErrorCodes$1.E_INVALID_PARAMS);
  }
  if (!loc) {
    return fail$1(req.id, `selector not found: ${sel}`, ErrorCodes$1.E_NOT_FOUND);
  }
  if (!loc.objectId) {
    return fail$1(req.id, `selector "${sel}" has no objectId`, ErrorCodes$1.E_CDP_FAIL);
  }
  try {
    const r = await ctx.sendCDP("Runtime.callFunctionOn", {
      objectId: loc.objectId,
      functionDeclaration: 'function() { return this.innerText || this.textContent || ""; }',
      returnByValue: true
    });
    if (r?.exceptionDetails) {
      return fail$1(req.id, r.exceptionDetails.text ?? "get_text threw", ErrorCodes$1.E_CDP_FAIL);
    }
    const text = typeof r?.result?.value === "string" ? r.result.value : "";
    return ok$1(req.id, { text });
  } catch (err) {
    return fail$1(req.id, `get_text failed: ${err.message}`, ErrorCodes$1.E_CDP_FAIL);
  }
}
async function handleGetUrl(req, ctx) {
  const url = await evalString(ctx, "location.href");
  return ok$1(req.id, { url });
}
async function handleGetTitle(req, ctx) {
  const title = await evalString(ctx, "document.title");
  return ok$1(req.id, { title });
}
async function handleGetHtml(req, ctx) {
  const sel = typeof req.selector === "string" && req.selector ? req.selector : null;
  if (!sel) {
    const html = await evalString(ctx, 'document.documentElement ? document.documentElement.outerHTML : ""');
    return ok$1(req.id, { html });
  }
  let loc;
  try {
    loc = await resolveLocator(ctx, sel);
  } catch (err) {
    return fail$1(req.id, err.message, ErrorCodes$1.E_INVALID_PARAMS);
  }
  if (!loc) return fail$1(req.id, `selector not found: ${sel}`, ErrorCodes$1.E_NOT_FOUND);
  if (!loc.objectId) return fail$1(req.id, `selector "${sel}" has no objectId`, ErrorCodes$1.E_CDP_FAIL);
  try {
    const r = await ctx.sendCDP("Runtime.callFunctionOn", {
      objectId: loc.objectId,
      functionDeclaration: 'function() { return this.innerHTML || ""; }',
      returnByValue: true
    });
    return ok$1(req.id, { html: typeof r?.result?.value === "string" ? r.result.value : "" });
  } catch (err) {
    return fail$1(req.id, `get_html failed: ${err.message}`, ErrorCodes$1.E_CDP_FAIL);
  }
}
async function handleGetValue(req, ctx) {
  if (typeof req.selector !== "string" || !req.selector) {
    return fail$1(req.id, "get_value requires `selector`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  let loc;
  try {
    loc = await resolveLocator(ctx, req.selector);
  } catch (err) {
    return fail$1(req.id, err.message, ErrorCodes$1.E_INVALID_PARAMS);
  }
  if (!loc) return fail$1(req.id, `selector not found: ${req.selector}`, ErrorCodes$1.E_NOT_FOUND);
  if (!loc.objectId) return fail$1(req.id, `selector "${req.selector}" has no objectId`, ErrorCodes$1.E_CDP_FAIL);
  try {
    const r = await ctx.sendCDP("Runtime.callFunctionOn", {
      objectId: loc.objectId,
      functionDeclaration: `function() {
        if ('value' in this) return this.value;
        return this.textContent || '';
      }`,
      returnByValue: true
    });
    const v = r?.result?.value;
    return ok$1(req.id, { value: typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : "" });
  } catch (err) {
    return fail$1(req.id, `get_value failed: ${err.message}`, ErrorCodes$1.E_CDP_FAIL);
  }
}
async function handleGetAttr(req, ctx) {
  if (typeof req.selector !== "string" || !req.selector) {
    return fail$1(req.id, "get_attr requires `selector`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  if (typeof req.name !== "string" || !req.name) {
    return fail$1(req.id, "get_attr requires `name`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  let loc;
  try {
    loc = await resolveLocator(ctx, req.selector);
  } catch (err) {
    return fail$1(req.id, err.message, ErrorCodes$1.E_INVALID_PARAMS);
  }
  if (!loc) return fail$1(req.id, `selector not found: ${req.selector}`, ErrorCodes$1.E_NOT_FOUND);
  if (!loc.objectId) return fail$1(req.id, `selector "${req.selector}" has no objectId`, ErrorCodes$1.E_CDP_FAIL);
  try {
    const r = await ctx.sendCDP("Runtime.callFunctionOn", {
      objectId: loc.objectId,
      functionDeclaration: "function(name) { return this.getAttribute ? this.getAttribute(name) : null; }",
      arguments: [{ value: req.name }],
      returnByValue: true
    });
    const v = r?.result?.value;
    return ok$1(req.id, { value: v === null || v === void 0 ? null : String(v) });
  } catch (err) {
    return fail$1(req.id, `get_attr failed: ${err.message}`, ErrorCodes$1.E_CDP_FAIL);
  }
}
async function handleGetCount(req, ctx) {
  if (typeof req.selector !== "string" || !req.selector) {
    return fail$1(req.id, "get_count requires `selector`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  const expr = `(() => {
    try { return document.querySelectorAll(${JSON.stringify(req.selector)}).length; }
    catch (e) { return -1; }
  })()`;
  const r = await ctx.sendCDP("Runtime.evaluate", {
    expression: expr,
    returnByValue: true
  });
  const n = typeof r?.result?.value === "number" ? r.result.value : -1;
  if (n < 0) {
    return fail$1(req.id, `invalid selector: ${req.selector}`, ErrorCodes$1.E_INVALID_PARAMS);
  }
  return ok$1(req.id, { count: n });
}
async function handleIsVisible(req, ctx) {
  return queryBoolean(req, ctx, `function() {
    const el = this;
    if (!el || el.nodeType !== 1) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  }`, "visible");
}
async function handleIsEnabled(req, ctx) {
  return queryBoolean(req, ctx, `function() {
    const el = this;
    if (!el) return false;
    if ('disabled' in el && el.disabled) return false;
    const aria = el.getAttribute && el.getAttribute('aria-disabled');
    if (aria === 'true') return false;
    return true;
  }`, "enabled");
}
async function handleIsChecked(req, ctx) {
  return queryBoolean(req, ctx, `function() {
    const el = this;
    if (!el) return false;
    if ('checked' in el) return !!el.checked;
    const aria = el.getAttribute && el.getAttribute('aria-checked');
    return aria === 'true';
  }`, "checked");
}
async function queryBoolean(req, ctx, fn, key) {
  if (typeof req.selector !== "string" || !req.selector) {
    return fail$1(req.id, `is_${key} requires \`selector\``, ErrorCodes$1.E_INVALID_PARAMS);
  }
  let loc;
  try {
    loc = await resolveLocator(ctx, req.selector);
  } catch (err) {
    return fail$1(req.id, err.message, ErrorCodes$1.E_INVALID_PARAMS);
  }
  if (!loc) {
    return ok$1(req.id, { [key]: false });
  }
  if (!loc.objectId) return fail$1(req.id, `selector "${req.selector}" has no objectId`, ErrorCodes$1.E_CDP_FAIL);
  try {
    const r = await ctx.sendCDP("Runtime.callFunctionOn", {
      objectId: loc.objectId,
      functionDeclaration: fn,
      returnByValue: true
    });
    return ok$1(req.id, { [key]: !!r?.result?.value });
  } catch (err) {
    return fail$1(req.id, `is_${key} failed: ${err.message}`, ErrorCodes$1.E_CDP_FAIL);
  }
}
async function handleUpload(req, ctx) {
  if (typeof req.selector !== "string" || !req.selector) {
    return fail$1(req.id, "upload requires `selector`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  const { files } = req;
  if (!Array.isArray(files) || files.length === 0 || !files.every((f) => typeof f === "string" && f.length > 0)) {
    return fail$1(req.id, "upload requires non-empty `files: string[]`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  for (const f of files) {
    if (!path__default$1.isAbsolute(f)) {
      return fail$1(req.id, `upload file path must be absolute: ${f}`, ErrorCodes$1.E_INVALID_PARAMS);
    }
    if (!fs__default.existsSync(f)) {
      return fail$1(req.id, `upload file not found: ${f}`, ErrorCodes$1.E_NOT_FOUND);
    }
  }
  let loc;
  try {
    loc = await resolveLocator(ctx, req.selector);
  } catch (err) {
    return fail$1(req.id, err.message, ErrorCodes$1.E_INVALID_PARAMS);
  }
  if (!loc) return fail$1(req.id, `selector not found: ${req.selector}`, ErrorCodes$1.E_NOT_FOUND);
  try {
    await ctx.sendCDP("DOM.setFileInputFiles", {
      backendNodeId: loc.backendNodeId,
      files
    });
  } catch (err) {
    return fail$1(req.id, `upload failed: ${err.message}`, ErrorCodes$1.E_CDP_FAIL);
  }
  return ok$1(req.id, { uploaded: files.length });
}
async function handleWaitSelector(req, ctx) {
  if (typeof req.selector !== "string" || !req.selector) {
    return fail$1(req.id, "wait_selector requires `selector`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  const timeoutMs = numericOr(req.timeoutMs, WAIT_DEFAULT_TIMEOUT_MS);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let loc = null;
    try {
      loc = await resolveLocator(ctx, req.selector);
    } catch (err) {
      return fail$1(req.id, err.message, ErrorCodes$1.E_INVALID_PARAMS);
    }
    if (loc) {
      return ok$1(req.id, { satisfied: true, elapsed: timeoutMs - (deadline - Date.now()) });
    }
    await new Promise((r) => setTimeout(r, WAIT_POLL_INTERVAL_MS));
  }
  return ok$1(req.id, { satisfied: false, elapsed: timeoutMs });
}
async function handleWaitUrl(req, ctx) {
  if (typeof req.pattern !== "string" || !req.pattern) {
    return fail$1(req.id, "wait_url requires `pattern`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  const re = globToRegExp(req.pattern);
  const timeoutMs = numericOr(req.timeoutMs, WAIT_DEFAULT_TIMEOUT_MS);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const u = await evalString(ctx, "location.href");
    if (u && re.test(u)) {
      return ok$1(req.id, { satisfied: true, url: u });
    }
    await new Promise((r) => setTimeout(r, WAIT_POLL_INTERVAL_MS));
  }
  return ok$1(req.id, { satisfied: false });
}
async function handleWaitLoad(req, ctx) {
  const state2 = typeof req.state === "string" ? req.state : "load";
  const timeoutMs = numericOr(req.timeoutMs, WAIT_DEFAULT_TIMEOUT_MS);
  if (state2 !== "domcontentloaded" && state2 !== "load" && state2 !== "networkidle") {
    return fail$1(
      req.id,
      "wait_load `state` must be one of: domcontentloaded | load | networkidle",
      ErrorCodes$1.E_INVALID_PARAMS
    );
  }
  if (state2 === "domcontentloaded" || state2 === "load") {
    const target = state2 === "domcontentloaded" ? "Page.domContentEventFired" : "Page.loadEventFired";
    const dbg = ctx.debugger;
    await ctx.sendCDP("Page.enable").catch(() => void 0);
    const reached = await new Promise((resolve2) => {
      const handler = (_e, method) => {
        if (method === target) {
          dbg.removeListener("message", handler);
          resolve2(true);
        }
      };
      dbg.on("message", handler);
      setTimeout(() => {
        dbg.removeListener("message", handler);
        resolve2(false);
      }, timeoutMs);
    });
    return ok$1(req.id, { satisfied: reached, state: state2 });
  }
  const dbg2 = ctx.debugger;
  await ctx.sendCDP("Network.enable").catch(() => void 0);
  const inflight = /* @__PURE__ */ new Set();
  let lastChangeAt = Date.now();
  const onMsg = (_e, method, params) => {
    const p = params ?? {};
    if (!p.requestId) return;
    if (method === "Network.requestWillBeSent") {
      inflight.add(p.requestId);
      lastChangeAt = Date.now();
    } else if (method === "Network.loadingFinished" || method === "Network.loadingFailed") {
      inflight.delete(p.requestId);
      lastChangeAt = Date.now();
    }
  };
  dbg2.on("message", onMsg);
  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const idleFor = Date.now() - lastChangeAt;
      if (inflight.size === 0 && idleFor >= WAIT_NETWORKIDLE_QUIET_MS) {
        return ok$1(req.id, { satisfied: true, state: state2, idleFor });
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return ok$1(req.id, { satisfied: false, state: state2, inflight: inflight.size });
  } finally {
    dbg2.removeListener("message", onMsg);
  }
}
async function handleWaitTimeout(req, _ctx) {
  const ms = numericOr(req.ms, 0);
  if (ms <= 0) {
    return fail$1(req.id, "wait_timeout requires positive `ms`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  await new Promise((r) => setTimeout(r, ms));
  return ok$1(req.id, { waited: ms });
}
async function handleCheck(req, ctx) {
  if (typeof req.selector !== "string" || !req.selector) {
    return fail$1(req.id, "check requires `selector`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  const checked = req.checked === void 0 ? true : !!req.checked;
  let loc;
  try {
    loc = await resolveLocator(ctx, req.selector);
  } catch (err) {
    return fail$1(req.id, err.message, ErrorCodes$1.E_INVALID_PARAMS);
  }
  if (!loc) return fail$1(req.id, `selector not found: ${req.selector}`, ErrorCodes$1.E_NOT_FOUND);
  if (!loc.objectId) return fail$1(req.id, `selector "${req.selector}" has no objectId`, ErrorCodes$1.E_CDP_FAIL);
  const fn = `function(value) {
    const el = this;
    const tag = (el.tagName || '').toUpperCase();
    if (tag !== 'INPUT') {
      throw new Error('check requires <input type="checkbox|radio">');
    }
    const t = (el.type || '').toLowerCase();
    if (t !== 'checkbox' && t !== 'radio') {
      throw new Error('check requires type="checkbox" or type="radio", got "' + t + '"');
    }
    if (el.checked !== value) {
      el.checked = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return el.checked;
  }`;
  try {
    const r = await ctx.sendCDP("Runtime.callFunctionOn", {
      objectId: loc.objectId,
      functionDeclaration: fn,
      arguments: [{ value: checked }],
      returnByValue: true
    });
    if (r?.exceptionDetails) {
      return fail$1(req.id, r.exceptionDetails.text ?? "check threw", ErrorCodes$1.E_CDP_FAIL);
    }
    return ok$1(req.id, { checked: !!r?.result?.value });
  } catch (err) {
    return fail$1(req.id, `check failed: ${err.message}`, ErrorCodes$1.E_CDP_FAIL);
  }
}
async function handleSelect(req, ctx) {
  if (typeof req.selector !== "string" || !req.selector) {
    return fail$1(req.id, "select requires `selector`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  const raw = req.value;
  if (typeof raw !== "string" && !Array.isArray(raw)) {
    return fail$1(req.id, "select requires `value` (string | string[])", ErrorCodes$1.E_INVALID_PARAMS);
  }
  const values = Array.isArray(raw) ? raw.map(String) : [String(raw)];
  let loc;
  try {
    loc = await resolveLocator(ctx, req.selector);
  } catch (err) {
    return fail$1(req.id, err.message, ErrorCodes$1.E_INVALID_PARAMS);
  }
  if (!loc) return fail$1(req.id, `selector not found: ${req.selector}`, ErrorCodes$1.E_NOT_FOUND);
  if (!loc.objectId) return fail$1(req.id, `selector "${req.selector}" has no objectId`, ErrorCodes$1.E_CDP_FAIL);
  const fn = `function(values) {
    const el = this;
    if ((el.tagName || '').toUpperCase() !== 'SELECT') {
      throw new Error('select requires <select> element');
    }
    const wanted = new Set(values);
    const matched = [];
    for (const opt of Array.from(el.options)) {
      const v = opt.value;
      const t = (opt.text || '').trim();
      const hit = wanted.has(v) || wanted.has(t);
      opt.selected = hit;
      if (hit) matched.push(v);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return matched;
  }`;
  try {
    const r = await ctx.sendCDP("Runtime.callFunctionOn", {
      objectId: loc.objectId,
      functionDeclaration: fn,
      arguments: [{ value: values }],
      returnByValue: true
    });
    if (r?.exceptionDetails) {
      return fail$1(req.id, r.exceptionDetails.text ?? "select threw", ErrorCodes$1.E_CDP_FAIL);
    }
    const matched = Array.isArray(r?.result?.value) ? r.result.value : [];
    if (matched.length === 0) {
      return fail$1(
        req.id,
        `select: no matching option for ${JSON.stringify(values)}`,
        ErrorCodes$1.E_NOT_FOUND
      );
    }
    return ok$1(req.id, { selected: matched });
  } catch (err) {
    return fail$1(req.id, `select failed: ${err.message}`, ErrorCodes$1.E_CDP_FAIL);
  }
}
async function handlePdf(req, ctx) {
  const params = {
    landscape: !!req.landscape,
    printBackground: req.printBackground === void 0 ? true : !!req.printBackground
  };
  if (typeof req.scale === "number" && req.scale > 0) params.scale = req.scale;
  if (typeof req.paperWidth === "number") params.paperWidth = req.paperWidth;
  if (typeof req.paperHeight === "number") params.paperHeight = req.paperHeight;
  const r = await ctx.sendCDP("Page.printToPDF", params);
  if (typeof r?.data !== "string") {
    return fail$1(req.id, "printToPDF returned no data", ErrorCodes$1.E_CDP_FAIL);
  }
  if (typeof req.path === "string" && req.path.length > 0) {
    const out = path__default$1.resolve(req.path);
    fs__default.mkdirSync(path__default$1.dirname(out), { recursive: true });
    fs__default.writeFileSync(out, Buffer.from(r.data, "base64"));
    return ok$1(req.id, { path: out });
  }
  return ok$1(req.id, { data: r.data });
}
function diffLines(a, b) {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const out = [];
  let i = 0;
  let j = 0;
  while (i < aLines.length || j < bLines.length) {
    if (i < aLines.length && j < bLines.length && aLines[i] === bLines[j]) {
      i += 1;
      j += 1;
      continue;
    }
    let foundInB = -1;
    if (i < aLines.length) {
      for (let k = j; k < Math.min(bLines.length, j + 50); k += 1) {
        if (bLines[k] === aLines[i]) {
          foundInB = k;
          break;
        }
      }
    }
    if (foundInB >= 0) {
      while (j < foundInB) {
        out.push(`+ ${bLines[j]}`);
        j += 1;
      }
    } else if (i < aLines.length) {
      out.push(`- ${aLines[i]}`);
      i += 1;
    } else {
      out.push(`+ ${bLines[j]}`);
      j += 1;
    }
  }
  return out;
}
async function handleDiffSnapshot(req, ctx) {
  const cur = await buildEnhancedSnapshot(ctx, {
    interactive: !!req.interactive,
    maxDepth: typeof req.maxDepth === "number" ? req.maxDepth : void 0,
    compact: !!req.compact
  });
  const after = cur.tree;
  let before = null;
  if (typeof req.baseline === "string") {
    before = req.baseline;
  } else {
    before = ctx.lastSnapshotTree;
  }
  if (before === null) {
    return fail$1(
      req.id,
      "diff_snapshot requires either a stored last snapshot (run `snapshot` first) or `baseline` text",
      ErrorCodes$1.E_INVALID_PARAMS
    );
  }
  const lines = diffLines(before, after);
  ctx.lastSnapshotTree = after;
  return ok$1(req.id, {
    diff: lines.join("\n"),
    added: lines.filter((l) => l.startsWith("+ ")).length,
    removed: lines.filter((l) => l.startsWith("- ")).length,
    unchanged: before === after
  });
}
async function handleDiffScreenshot(req, ctx) {
  const r = await ctx.sendCDP("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: !!req.fullPage
  });
  if (typeof r?.data !== "string") {
    return fail$1(req.id, "screenshot returned no data", ErrorCodes$1.E_CDP_FAIL);
  }
  let afterPath;
  if (typeof req.path === "string" && req.path.length > 0) {
    const out = path__default$1.resolve(req.path);
    fs__default.mkdirSync(path__default$1.dirname(out), { recursive: true });
    fs__default.writeFileSync(out, Buffer.from(r.data, "base64"));
    afterPath = out;
  }
  return ok$1(req.id, {
    before: typeof req.baseline === "string" ? req.baseline : null,
    afterPath: afterPath ?? null,
    afterData: afterPath ? null : r.data,
    note: "server returns raw screenshots; pixel diff is the CLI side responsibility"
  });
}
async function handleDiffUrl(req, ctx) {
  if (typeof req.url1 !== "string" || !req.url1 || typeof req.url2 !== "string" || !req.url2) {
    return fail$1(req.id, "diff_url requires `url1` and `url2`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  const opts = { interactive: !!req.interactive, compact: !!req.compact };
  const navResp1 = await handleNavigate({ id: req.id, url: req.url1 }, ctx);
  if (!navResp1.success) return navResp1;
  const snap1 = await buildEnhancedSnapshot(ctx, opts);
  const navResp2 = await handleNavigate({ id: req.id, url: req.url2 }, ctx);
  if (!navResp2.success) return navResp2;
  const snap2 = await buildEnhancedSnapshot(ctx, opts);
  ctx.lastSnapshotTree = snap2.tree;
  const lines = diffLines(snap1.tree, snap2.tree);
  return ok$1(req.id, {
    diff: lines.join("\n"),
    added: lines.filter((l) => l.startsWith("+ ")).length,
    removed: lines.filter((l) => l.startsWith("- ")).length,
    unchanged: snap1.tree === snap2.tree,
    url1: req.url1,
    url2: req.url2
  });
}
function numericOr(v, fallback) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return fallback;
}
function globToRegExp(pattern) {
  let re = "";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        re += ".*";
        i += 2;
        continue;
      }
      re += "[^/]*";
      i += 1;
      continue;
    }
    if (/[\\^$.+?()[\]{}|]/.test(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
    i += 1;
  }
  return new RegExp(`^${re}$`);
}
async function handleDownload(req, ctx) {
  if (typeof req.selector !== "string" || !req.selector) {
    return fail$1(req.id, "download requires `selector`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  if (typeof req.path !== "string" || !req.path) {
    return fail$1(req.id, "download requires absolute `path`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  if (!path__default$1.isAbsolute(req.path)) {
    return fail$1(req.id, "download `path` must be absolute", ErrorCodes$1.E_INVALID_PARAMS);
  }
  const savePath = path__default$1.resolve(req.path);
  const timeoutMs = numericOr(req.timeoutMs, ACTION_TIMEOUT_MS);
  try {
    fs__default.mkdirSync(path__default$1.dirname(savePath), { recursive: true });
  } catch (err) {
    return fail$1(
      req.id,
      `download mkdirp failed: ${err.message}`,
      ErrorCodes$1.E_DOWNLOAD_FAIL
    );
  }
  const claim = { savePath, createdAt: Date.now() };
  ctx.downloadClaims.push(claim);
  const clickReq = { id: req.id, action: "click", selector: req.selector };
  const clickResp = await handleClick(clickReq, ctx);
  if (!clickResp.success) {
    const idx = ctx.downloadClaims.indexOf(claim);
    if (idx >= 0) ctx.downloadClaims.splice(idx, 1);
    return clickResp;
  }
  const record = await waitForDownloadBySavePath(ctx, savePath, timeoutMs);
  if (!record) {
    const idx = ctx.downloadClaims.indexOf(claim);
    if (idx >= 0) ctx.downloadClaims.splice(idx, 1);
    return fail$1(
      req.id,
      `download timed out after ${timeoutMs}ms (no matching will-download for ${savePath})`,
      ErrorCodes$1.E_TIMEOUT
    );
  }
  if (record.state !== "done") {
    return fail$1(
      req.id,
      `download failed: state=${record.state}${record.error ? `, ${record.error}` : ""}`,
      ErrorCodes$1.E_DOWNLOAD_FAIL
    );
  }
  return ok$1(req.id, {
    path: record.savePath,
    url: record.url,
    suggestedFilename: record.suggestedFilename,
    elapsedMs: (record.completedAt ?? Date.now()) - record.startedAt
  });
}
async function handleWaitDownload(req, ctx) {
  const targetPath = typeof req.path === "string" && req.path ? path__default$1.resolve(req.path) : void 0;
  const timeoutMs = numericOr(req.timeoutMs, ACTION_TIMEOUT_MS);
  if (targetPath) {
    const hit = ctx.downloadHistory.find((r) => r.savePath === targetPath);
    if (hit) {
      if (hit.state !== "done") {
        return fail$1(
          req.id,
          `download already finished as ${hit.state}${hit.error ? `: ${hit.error}` : ""}`,
          ErrorCodes$1.E_DOWNLOAD_FAIL
        );
      }
      return ok$1(req.id, {
        path: hit.savePath,
        url: hit.url,
        suggestedFilename: hit.suggestedFilename,
        fromHistory: true
      });
    }
  }
  const record = targetPath ? await waitForDownloadBySavePath(ctx, targetPath, timeoutMs) : await waitForAnyDownload(ctx, timeoutMs);
  if (!record) {
    return fail$1(
      req.id,
      targetPath ? `wait_download timed out after ${timeoutMs}ms for ${targetPath}` : `wait_download timed out after ${timeoutMs}ms (no inflight downloads)`,
      ErrorCodes$1.E_TIMEOUT
    );
  }
  if (record.state !== "done") {
    return fail$1(
      req.id,
      `download failed: state=${record.state}${record.error ? `, ${record.error}` : ""}`,
      ErrorCodes$1.E_DOWNLOAD_FAIL
    );
  }
  return ok$1(req.id, {
    path: record.savePath,
    url: record.url,
    suggestedFilename: record.suggestedFilename,
    elapsedMs: (record.completedAt ?? Date.now()) - record.startedAt
  });
}
async function waitForDownloadBySavePath(ctx, savePath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let record;
  while (Date.now() < deadline) {
    const inHist = ctx.downloadHistory.find((r) => r.savePath === savePath);
    if (inHist) return inHist;
    record = [...ctx.downloadInflight.values()].find((r) => r.savePath === savePath);
    if (record) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!record) return null;
  const remaining = deadline - Date.now();
  if (remaining <= 0) return null;
  return Promise.race([
    record.done,
    new Promise((r) => setTimeout(() => r(null), remaining))
  ]);
}
async function waitForAnyDownload(ctx, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const records = [...ctx.downloadInflight.values()];
    if (records.length > 0) {
      const earliest = records.reduce((a, b) => a.startedAt <= b.startedAt ? a : b);
      const remaining = deadline - Date.now();
      if (remaining <= 0) return null;
      return Promise.race([
        earliest.done,
        new Promise((r) => setTimeout(() => r(null), remaining))
      ]);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}
const HANDLERS = {
  navigate: handleNavigate,
  open: handleNavigate,
  goto: handleNavigate,
  reload: handleReload,
  back: handleBack,
  forward: handleForward,
  click: handleClick,
  dblclick: handleDblClick,
  focus: handleFocus,
  scroll_into_view: handleScrollIntoView,
  hover: handleHover,
  type: handleType,
  fill: handleFill,
  press: handlePress,
  keyboard: handleKeyboard,
  scroll: handleScroll,
  screenshot: handleScreenshot,
  snapshot: handleSnapshot,
  evaluate: handleEvaluate,
  eval: handleEvaluate,
  // get
  get_text: handleGetText,
  get_url: handleGetUrl,
  get_title: handleGetTitle,
  get_html: handleGetHtml,
  get_value: handleGetValue,
  get_attr: handleGetAttr,
  get_count: handleGetCount,
  // is_*
  is_visible: handleIsVisible,
  is_enabled: handleIsEnabled,
  is_checked: handleIsChecked,
  // wait（4 mode）
  wait_selector: handleWaitSelector,
  wait_url: handleWaitUrl,
  wait_load: handleWaitLoad,
  wait_timeout: handleWaitTimeout,
  // 表单
  check: handleCheck,
  uncheck: (req, ctx) => handleCheck({ ...req, checked: false }, ctx),
  select: handleSelect,
  // 文件输入
  upload: handleUpload,
  // 文件输出
  pdf: handlePdf,
  // diff
  diff_snapshot: handleDiffSnapshot,
  diff_screenshot: handleDiffScreenshot,
  diff_url: handleDiffUrl,
  // download
  download: handleDownload,
  wait_download: handleWaitDownload
};
async function dispatch(req, env) {
  const { action } = req;
  if (typeof action !== "string") {
    return fail$1(req.id ?? null, "missing `action`", ErrorCodes$1.E_INVALID_PARAMS);
  }
  if (action === "close" || action === "quit" || action === "exit") {
    env.registry.closeAutomation(env.session);
    return ok$1(req.id ?? null);
  }
  const handler = HANDLERS[action];
  if (!handler) {
    return fail$1(req.id ?? null, `unknown action: ${action}`, ErrorCodes$1.E_UNKNOWN_ACTION);
  }
  let ctx;
  try {
    const headed = req.headed === true;
    ctx = env.registry.getOrCreate(env.session, { headed });
  } catch (err) {
    const code = err.code ?? ErrorCodes$1.E_ATTACH_FAIL;
    return fail$1(req.id ?? null, err.message, code);
  }
  return env.registry.runExclusive(env.session, async () => {
    const started = Date.now();
    ctx.logger = env.logger;
    ctx.lastRequestAt = started;
    try {
      const resp = await withTimeout$2(handler(req, ctx), ACTION_TIMEOUT_MS, action);
      return resp;
    } catch (err) {
      env.logger?.error?.(`handler '${action}' 异常: ${err.stack ?? err.message}`);
      return fail$1(req.id ?? null, err.message, ErrorCodes$1.E_INTERNAL);
    } finally {
      const elapsed = Date.now() - started;
      env.logger?.info?.(`action=${action} session=${env.session} elapsed=${elapsed}ms`);
    }
  });
}
function normalizeSession(session2) {
  if (typeof session2 !== "string" || session2.length === 0) return "default";
  if (/[/\\\u0000\n\r\t]/.test(session2)) return "default";
  if (session2.length > SESSION_NAME_MAX_LENGTH) return session2.slice(0, SESSION_NAME_MAX_LENGTH);
  return session2;
}
function createSessionRegistry(deps2 = {}) {
  const log2 = deps2.logger ?? getLogger("browser-automation:session");
  const now = deps2.now ?? (() => Date.now());
  const idleTimeoutMs = deps2.idleTimeoutMs ?? SESSION_IDLE_TIMEOUT_MS;
  const idleScanIntervalMs = deps2.idleScanIntervalMs ?? SESSION_IDLE_SCAN_INTERVAL_MS;
  const maxSessions = deps2.maxSessions ?? MAX_SESSIONS;
  const createWindow = deps2.createBrowserWindow ?? ((opts) => new BrowserWindow(opts));
  const contexts = /* @__PURE__ */ new Map();
  const queues = /* @__PURE__ */ new Map();
  const idleTimer = setInterval(() => {
    sweepIdle();
  }, idleScanIntervalMs);
  if (typeof idleTimer.unref === "function") idleTimer.unref();
  function buildContext(session2, headed) {
    const win = createWindow({
      // 统一以 show:false 创建；headed 模式下，ready-to-show 后再 show+focus。
      // 这是 Electron 官方推荐做法，避免 dev 模式下「应用拿到焦点但窗口未渲染」的现象。
      show: false,
      width: 1280,
      height: 800,
      title: `Marvis Automation [${session2}]`,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
        partition: `${PARTITION_PREFIX$1}${session2}`
      }
    });
    if (headed) {
      const onReady = () => {
        try {
          if (!win.isDestroyed() && !win.isVisible()) win.show();
          try {
            if (!win.isDestroyed()) win.focus();
          } catch {
          }
        } catch (err) {
          log2.warn(`ready-to-show show 失败: ${err.message}`);
        }
      };
      win.once("ready-to-show", onReady);
      setTimeout(() => {
        if (!win.isDestroyed() && !win.isVisible()) {
          try {
            win.show();
            win.focus();
          } catch {
          }
        }
      }, 300);
    }
    try {
      win.loadURL("about:blank").catch(() => {
      });
    } catch {
    }
    win.webContents.setWindowOpenHandler(({ url, disposition }) => {
      log2.debug(`window open intercepted: url=${url} disposition=${disposition}`);
      if (url && (disposition === "foreground-tab" || disposition === "background-tab" || disposition === "new-window" || disposition === "other")) {
        setImmediate(() => {
          try {
            if (!win.isDestroyed()) win.loadURL(url);
          } catch (err) {
            log2.warn(`loadURL 失败: ${err.message}`);
          }
        });
      }
      return { action: "deny" };
    });
    const dbg = win.webContents.debugger;
    try {
      dbg.attach("1.3");
    } catch (err) {
      try {
        win.destroy();
      } catch {
      }
      const wrapped = new Error(`failed to attach debugger: ${err.message}`);
      wrapped.code = ErrorCodes$1.E_ATTACH_FAIL;
      throw wrapped;
    }
    let willDownloadCleanup = null;
    const ctx = {
      session: session2,
      window: win,
      debugger: dbg,
      refMap: {},
      lastSnapshotTree: null,
      lastRequestAt: now(),
      downloadInflight: /* @__PURE__ */ new Map(),
      downloadHistory: [],
      downloadClaims: [],
      sendCDP: (method, params) => dbg.sendCommand(method, params ?? {}),
      dispose: () => {
        try {
          willDownloadCleanup?.();
        } catch {
        }
        try {
          if (dbg.isAttached()) dbg.detach();
        } catch {
        }
        try {
          if (!win.isDestroyed()) win.destroy();
        } catch {
        }
      }
    };
    try {
      const ses = win.webContents.session;
      const onWillDownload = (_event, item) => {
        const tNow = now();
        ctx.downloadClaims = ctx.downloadClaims.filter((c) => tNow - c.createdAt <= DOWNLOAD_CLAIM_TTL_MS);
        const claim = ctx.downloadClaims.shift();
        const suggested = item.getFilename();
        let savePath;
        if (claim) {
          savePath = claim.savePath;
          try {
            fs__default.mkdirSync(path__default$1.dirname(savePath), { recursive: true });
          } catch (err) {
            log2.warn(`download mkdirp 失败: ${err.message}`);
          }
          item.setSavePath(savePath);
        } else {
          savePath = item.getSavePath() || suggested;
        }
        const id = randomUUID();
        let resolveDone = () => void 0;
        const donePromise = new Promise((resolve2) => {
          resolveDone = resolve2;
        });
        const record = {
          id,
          url: item.getURL(),
          suggestedFilename: suggested,
          savePath,
          state: "inprogress",
          startedAt: tNow,
          done: donePromise
        };
        ctx.downloadInflight.set(id, record);
        const startMsg = `[download] start session=${session2} id=${id.slice(0, 8)} url=${truncate$1(record.url, 120)} savePath=${savePath}`;
        log2.info(startMsg);
        item.once("done", (_e, state2) => {
          const tEnd = now();
          record.completedAt = tEnd;
          if (state2 === "completed") {
            record.state = "done";
            try {
              const finalPath = item.getSavePath();
              if (finalPath) record.savePath = finalPath;
            } catch {
            }
          } else if (state2 === "cancelled") {
            record.state = "cancelled";
            record.error = "cancelled by user / api";
          } else {
            record.state = "interrupted";
            record.error = `download interrupted (state=${state2})`;
          }
          ctx.downloadInflight.delete(id);
          ctx.downloadHistory.push(record);
          if (ctx.downloadHistory.length > DOWNLOAD_HISTORY_MAX) {
            ctx.downloadHistory.splice(0, ctx.downloadHistory.length - DOWNLOAD_HISTORY_MAX);
          }
          const doneMsg = `[download] done session=${session2} id=${id.slice(0, 8)} state=${record.state} elapsed=${tEnd - record.startedAt}ms`;
          log2.info(doneMsg);
          try {
            resolveDone(record);
          } catch {
          }
        });
      };
      ses.on("will-download", onWillDownload);
      willDownloadCleanup = () => {
        try {
          ses.removeListener("will-download", onWillDownload);
        } catch {
        }
      };
    } catch (err) {
      log2.warn(`will-download 监听挂载失败（download 类动作不可用）: ${err.message}`);
    }
    win.on("closed", () => {
      if (contexts.get(session2) === ctx) {
        contexts.delete(session2);
        queues.delete(session2);
      }
    });
    return ctx;
  }
  function getOrCreate(session2, opts) {
    const safe = normalizeSession(session2);
    const headed = !!opts?.headed;
    const existing = contexts.get(safe);
    if (existing && !existing.window.isDestroyed() && existing.debugger.isAttached()) {
      existing.lastRequestAt = now();
      if (headed) {
        showWindow(existing.window);
      }
      return existing;
    }
    if (existing) {
      try {
        existing.dispose();
      } catch {
      }
      contexts.delete(safe);
      queues.delete(safe);
    }
    if (contexts.size >= maxSessions) {
      const wrapped = new Error(`已达最大 session 数 ${maxSessions}，请先关闭其他 session`);
      wrapped.code = ErrorCodes$1.E_TOO_MANY_SESSIONS;
      throw wrapped;
    }
    const ctx = buildContext(safe, headed);
    contexts.set(safe, ctx);
    log2.info(`session 创建: ${safe}（headed=${headed}, active=${contexts.size}/${maxSessions}）`);
    return ctx;
  }
  function showWindow(win) {
    try {
      if (win.isDestroyed()) return;
      if (!win.isVisible()) win.show();
      try {
        win.focus();
      } catch {
      }
    } catch (err) {
      log2.warn(`showWindow 失败: ${err.message}`);
    }
  }
  function closeAutomation(session2) {
    const safe = normalizeSession(session2);
    const ctx = contexts.get(safe);
    if (!ctx) return false;
    try {
      ctx.dispose();
    } catch {
    }
    contexts.delete(safe);
    queues.delete(safe);
    log2.info(`session 关闭: ${safe}（active=${contexts.size}/${maxSessions}）`);
    return true;
  }
  function runExclusive(session2, task) {
    const safe = normalizeSession(session2);
    const prev = queues.get(safe) ?? Promise.resolve();
    const next = prev.then(task, task);
    queues.set(
      safe,
      next.catch(() => void 0)
    );
    return next;
  }
  function disposeAll() {
    for (const [session2, ctx] of contexts) {
      try {
        ctx.dispose();
      } catch {
      }
      log2.info(`session 销毁(shutdown): ${session2}`);
    }
    contexts.clear();
    queues.clear();
  }
  function has(session2) {
    return contexts.has(normalizeSession(session2));
  }
  function list() {
    return [...contexts.keys()];
  }
  function sweepIdle() {
    if (contexts.size === 0) return;
    const cutoff = now() - idleTimeoutMs;
    const stale = [];
    for (const [session2, ctx] of contexts) {
      if (ctx.lastRequestAt < cutoff) {
        stale.push(session2);
      }
    }
    for (const session2 of stale) {
      log2.info(`session 空闲超时回收: ${session2}`);
      closeAutomation(session2);
    }
  }
  function shutdown() {
    clearInterval(idleTimer);
    disposeAll();
  }
  return {
    getOrCreate,
    closeAutomation,
    runExclusive,
    disposeAll,
    has,
    list,
    shutdown
  };
}
function truncate$1(s, max) {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}...`;
}
async function listenUds$1(socketPath, handlers2) {
  const log2 = getModuleLogger$6();
  const server = createServer((sock) => attachConnection$1(sock, handlers2.onConnection(sock), log2));
  if (handlers2.onError) {
    server.on("error", handlers2.onError);
  }
  await bindWithStaleSocketRecovery$1(server, socketPath, log2);
  return server;
}
function shutdownServer$1(server, socketPath) {
  const log2 = getModuleLogger$6();
  return new Promise((resolve2) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      try {
        unlinkSync(socketPath);
      } catch {
      }
      resolve2();
    };
    try {
      server.close(() => {
        settle();
      });
    } catch (err) {
      log2.warn(`server.close 异常: ${err.message}`);
      settle();
      return;
    }
    server.getConnections((err, count) => {
      if (!err && count > 0) {
        log2.info(`shutdownServer: ${count} 个活跃连接将随 close 一同关闭`);
      }
    });
  });
}
function attachConnection$1(sock, handlers2, log2) {
  let chunks = [];
  let buffered = 0;
  sock.on("data", (chunk) => {
    chunks.push(chunk);
    buffered += chunk.length;
    if (buffered > MAX_LINE_BYTES$1) {
      const joined2 = Buffer.concat(chunks, buffered);
      const nl = joined2.indexOf(10);
      if (nl < 0 || nl > MAX_LINE_BYTES$1) {
        log2.warn(`单行超过最大长度 ${MAX_LINE_BYTES$1}，关闭连接`);
        try {
          handlers2.onLineTooLarge?.(sock);
        } catch (err) {
          log2.warn(`onLineTooLarge 回调异常: ${err.message}`);
        }
        try {
          sock.destroy();
        } catch {
        }
        return;
      }
      chunks = [joined2];
      buffered = joined2.length;
    }
    const joined = Buffer.concat(chunks, buffered);
    chunks = [];
    buffered = 0;
    let start2 = 0;
    while (true) {
      const nl = joined.indexOf(10, start2);
      if (nl < 0) break;
      const line = joined.subarray(start2, nl);
      start2 = nl + 1;
      if (line.length === 0) continue;
      try {
        handlers2.onLine(line, sock);
      } catch (err) {
        log2.warn(`onLine 回调异常: ${err.message}`);
      }
    }
    if (start2 < joined.length) {
      const remaining = joined.subarray(start2);
      chunks.push(remaining);
      buffered = remaining.length;
    }
  });
  sock.on("error", (err) => {
    log2.debug(`socket error: ${err.message}`);
  });
  sock.on("close", () => {
  });
}
async function bindWithStaleSocketRecovery$1(server, socketPath, log2) {
  return new Promise((resolve2, reject) => {
    const attemptListen = () => {
      const onError = (err) => {
        if (err.code === "EADDRINUSE") {
          log2.warn(`socket 占用，尝试探测旧实例: ${socketPath}`);
          probeStaleSocket$1(socketPath).then(async (alive) => {
            if (alive) {
              reject(new Error(`socket already in use: ${socketPath}`));
              return;
            }
            try {
              await unlink$1(socketPath);
            } catch {
            }
            server.once("error", onError);
            server.listen(socketPath, () => resolve2());
          }).catch((probeErr) => {
            reject(probeErr);
          });
          return;
        }
        reject(err);
      };
      if (!existsSync(socketPath)) {
        server.once("error", onError);
        server.listen(socketPath, () => resolve2());
        return;
      }
      server.once("error", onError);
      server.listen(socketPath, () => resolve2());
    };
    attemptListen();
  });
}
function probeStaleSocket$1(socketPath) {
  return new Promise((resolve2) => {
    let settled = false;
    const settle = (alive) => {
      if (settled) return;
      settled = true;
      resolve2(alive);
    };
    try {
      const probe = createConnection({ path: socketPath });
      const timer2 = setTimeout(() => {
        try {
          probe.destroy();
        } catch {
        }
        settle(false);
      }, 500);
      probe.once("connect", () => {
        clearTimeout(timer2);
        try {
          probe.destroy();
        } catch {
        }
        settle(true);
      });
      probe.once("error", () => {
        clearTimeout(timer2);
        settle(false);
      });
    } catch {
      settle(false);
    }
  });
}
let cachedLogger$2 = null;
function getModuleLogger$6() {
  if (!cachedLogger$2) {
    cachedLogger$2 = getLogger("browser-automation:transport");
  }
  return cachedLogger$2;
}
const state$2 = {
  status: "idle",
  socketPath: null,
  server: null,
  registry: null,
  connections: /* @__PURE__ */ new Set(),
  logger: null
};
function getModuleLogger$5() {
  if (!state$2.logger) state$2.logger = getLogger("browser-automation");
  return state$2.logger;
}
function resolveSocketPath$1(override) {
  const envPath = process.env[ENV_SOCKET_PATH$1];
  if (envPath && envPath.trim().length > 0) return envPath;
  return defaultBrowserAutomationSocketPath();
}
async function startBrowserAutomationServer(options) {
  const log2 = getModuleLogger$5();
  if (state$2.status !== "idle") {
    log2.warn(`startBrowserAutomationServer 已在 ${state$2.status} 状态，跳过`);
    return;
  }
  const socketPath = resolveSocketPath$1();
  state$2.socketPath = socketPath;
  log2.info(`browser-automation socket 路径: ${socketPath}`);
  try {
    mkdirSync(dirname(socketPath), { recursive: true });
  } catch (err) {
    log2.warn(`mkdir services 目录失败（继续尝试 listen）: ${err.message}`);
  }
  const registry2 = createSessionRegistry();
  state$2.registry = registry2;
  try {
    const server = await listenUds$1(socketPath, {
      onConnection: (sock) => {
        state$2.connections.add(sock);
        sock.on("close", () => {
          state$2.connections.delete(sock);
        });
        return {
          onLine: (line, s) => {
            void handleLine$1(line, s);
          },
          onLineTooLarge: (s) => {
            try {
              s.write(serializeLine$1(fail$1(null, "request too large", ErrorCodes$1.E_TOO_LARGE)));
            } catch {
            }
          }
        };
      },
      onError: (err) => {
        log2.error(`server error: ${err.message}`);
      }
    });
    state$2.server = server;
    state$2.status = "listening";
    try {
      await chmod(socketPath, 384);
    } catch (err) {
      log2.warn(`chmod socket 失败（非致命）: ${err.message}`);
    }
    log2.info(`browser-automation server 已就绪：${socketPath}`);
  } catch (err) {
    log2.error(`browser-automation server 启动失败（fail-soft）: ${err.message}`);
    state$2.status = "idle";
    state$2.server = null;
    state$2.socketPath = null;
    if (state$2.registry) {
      try {
        state$2.registry.shutdown();
      } catch {
      }
      state$2.registry = null;
    }
  }
}
async function stopBrowserAutomationServer(timeoutMs = SHUTDOWN_TIMEOUT_MS$1) {
  const log2 = getModuleLogger$5();
  if (state$2.status === "idle") return;
  if (state$2.status === "shutting-down") {
    log2.warn("stopBrowserAutomationServer 已在进行中");
    return;
  }
  state$2.status = "shutting-down";
  const { server, socketPath, registry: registry2 } = state$2;
  for (const sock of state$2.connections) {
    try {
      sock.destroy();
    } catch {
    }
  }
  state$2.connections.clear();
  if (server && socketPath) {
    try {
      await Promise.race([
        shutdownServer$1(server, socketPath),
        new Promise((resolve2) => setTimeout(resolve2, timeoutMs))
      ]);
    } catch (err) {
      log2.warn(`shutdownServer 异常: ${err.message}`);
    }
  }
  if (registry2) {
    try {
      registry2.shutdown();
    } catch (err) {
      log2.warn(`registry.shutdown 异常: ${err.message}`);
    }
  }
  state$2.server = null;
  state$2.socketPath = null;
  state$2.registry = null;
  state$2.status = "idle";
  log2.info("browser-automation server 已关闭");
}
async function handleLine$1(line, sock) {
  const log2 = getModuleLogger$5();
  let req;
  try {
    req = JSON.parse(line.toString("utf8"));
  } catch (err) {
    log2.warn(`收到非法 JSON: ${err.message}`);
    safeWrite$1(sock, fail$1(null, `invalid json: ${err.message}`, ErrorCodes$1.E_BAD_JSON));
    return;
  }
  const session2 = typeof req?.session === "string" && req.session.length > 0 ? req.session : DEFAULT_SESSION;
  const action = req?.action;
  log2.debug(`recv id=${req?.id} action=${action} session=${session2}`);
  if (!state$2.registry) {
    safeWrite$1(sock, fail$1(req?.id ?? null, "server not initialized", ErrorCodes$1.E_INTERNAL));
    return;
  }
  let resp;
  try {
    resp = await dispatch(req, {
      session: session2,
      registry: state$2.registry,
      logger: {
        info: (msg) => log2.info(msg),
        warn: (msg) => log2.warn(msg),
        error: (msg) => log2.error(msg),
        debug: (msg) => log2.debug(msg)
      }
    });
  } catch (err) {
    log2.error(`dispatch 抛出（不应该）: ${err.stack ?? err.message}`);
    resp = fail$1(req?.id ?? null, err.message, ErrorCodes$1.E_INTERNAL);
  }
  safeWrite$1(sock, resp);
}
function safeWrite$1(sock, envelope) {
  try {
    sock.write(serializeLine$1(envelope));
  } catch {
  }
}
const MAX_LINE_BYTES = 1048576;
const CRAWL_TIMEOUT_MS = 6e4;
const NAVIGATE_ACK_MS = 5e3;
const LOAD_EVENT_TIMEOUT_MS = 15e3;
const NETWORK_IDLE_TIMEOUT_MS = 8e3;
const NETWORK_IDLE_QUIET_MS = 500;
const CONTENT_READY_TIMEOUT_MS = 1e4;
const CONTENT_READY_MIN_TEXT = 200;
const CONTENT_READY_POLL_INTERVAL_MS = 300;
const HUMANIZE_MAX_MS = 3e3;
const HUMANIZE_SCROLL_STEP_PX = 400;
const HUMANIZE_SCROLL_INTERVAL_MS = 250;
const SOCKET_FILENAME = "crawl.sock";
const SERVICES_DIR_NAME = "services";
const PARTITION_PREFIX = "persist:crawl-";
const ENV_SOCKET_PATH = "MARVIS_CRAWL_SOCKET_PATH";
const SHUTDOWN_TIMEOUT_MS = 5e3;
const MAX_CONCURRENT_CRAWLS = 3;
const DEFAULT_VIEWPORT_WIDTH = 1920;
const DEFAULT_VIEWPORT_HEIGHT = 1080;
const DEFAULT_LOCALE = "zh-CN";
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";
function defaultCrawlSocketPath() {
  return join(app.getPath("userData"), SERVICES_DIR_NAME, SOCKET_FILENAME);
}
const STEALTH_INIT_SCRIPT = `
(() => {
    // 1) navigator.webdriver: 在实例与 prototype 上都隔离
    try {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    } catch (e) {}
    try {
        delete Object.getPrototypeOf(navigator).webdriver;
    } catch (e) {}

    // 2) navigator.languages
    try {
        Object.defineProperty(navigator, 'languages', {
            get: () => ['zh-CN', 'zh', 'en-US', 'en'],
        });
    } catch (e) {}

    // 3) navigator.plugins / mimeTypes: 返回伪造的非空列表
    try {
        const fakePlugin = (name) => ({
            name: name,
            filename: name + '.plugin',
            description: name,
            length: 1,
            0: { type: 'application/x-google-chrome-pdf', suffixes: 'pdf' },
        });
        const plugins = [
            fakePlugin('Chrome PDF Plugin'),
            fakePlugin('Chrome PDF Viewer'),
            fakePlugin('Native Client'),
        ];
        Object.defineProperty(navigator, 'plugins', { get: () => plugins });
        Object.defineProperty(navigator, 'mimeTypes', { get: () => plugins[0] });
    } catch (e) {}

    // 4) navigator.hardwareConcurrency / deviceMemory
    try {
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    } catch (e) {}
    try {
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    } catch (e) {}

    // 5) window.chrome: 填充 runtime / loadTimes / csi
    try {
        window.chrome = window.chrome || {};
        window.chrome.runtime = window.chrome.runtime || {};
        window.chrome.loadTimes = window.chrome.loadTimes || function () {
            return {
                commitLoadTime: (Date.now() / 1000) - 1,
                finishDocumentLoadTime: (Date.now() / 1000) - 0.5,
                finishLoadTime: (Date.now() / 1000),
                firstPaintTime: (Date.now() / 1000) - 0.4,
                navigationType: 'Other',
                requestTime: (Date.now() / 1000) - 2,
                startLoadTime: (Date.now() / 1000) - 2,
                wasAlternateProtocolAvailable: false,
                wasFetchedViaSpdy: true,
                wasNpnNegotiated: true,
            };
        };
        window.chrome.csi = window.chrome.csi || function () {
            return {
                onloadT: Date.now(),
                pageT: Date.now() - 100,
                startE: Date.now() - 200,
                tran: 15,
            };
        };
    } catch (e) {}

    // 6) permissions.query: notifications 权限返 'default'（Headless 默认返 'denied'）
    try {
        const originalQuery = window.navigator.permissions
            && window.navigator.permissions.query;
        if (originalQuery) {
            window.navigator.permissions.query = (parameters) => (
                parameters && parameters.name === 'notifications'
                    ? Promise.resolve({ state: Notification.permission || 'default' })
                    : originalQuery(parameters)
            );
        }
    } catch (e) {}

    // 7) WebGL vendor / renderer
    try {
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (parameter) {
            // UNMASKED_VENDOR_WEBGL
            if (parameter === 37445) return 'Intel Inc.';
            // UNMASKED_RENDERER_WEBGL
            if (parameter === 37446) return 'Intel Iris OpenGL Engine';
            return getParameter.call(this, parameter);
        };
    } catch (e) {}

    // 8) iframe.contentWindow / document 在某些检测下需要可访问
    try {
        const origAttachShadow = Element.prototype.attachShadow;
        if (origAttachShadow) {
            Element.prototype.attachShadow = function (init) {
                return origAttachShadow.call(this, init);
            };
        }
    } catch (e) {}

    // 9) outerWidth / outerHeight：headless 下常为 0，对齐 innerWidth/innerHeight
    try {
        if (window.outerWidth === 0 && window.innerWidth > 0) {
            Object.defineProperty(window, 'outerWidth', {
                get: () => window.innerWidth,
            });
        }
        if (window.outerHeight === 0 && window.innerHeight > 0) {
            Object.defineProperty(window, 'outerHeight', {
                get: () => window.innerHeight,
            });
        }
    } catch (e) {}
})();
`;
let cachedLogger$1 = null;
function log$6() {
  if (!cachedLogger$1) cachedLogger$1 = getLogger("crawl");
  return cachedLogger$1;
}
function createCrawler(deps2 = {}) {
  const factory = deps2.createBrowserWindow ?? ((opts) => new BrowserWindow(opts));
  return async function runCrawl2(req) {
    const start2 = nowSeconds();
    const url = (req.url ?? "").trim();
    if (!url) {
      const err = new Error("crawl requires a non-empty `url`");
      err.code = "E_INVALID_PARAMS";
      throw err;
    }
    if (!/^https?:\/\//i.test(url)) {
      const err = new Error("crawl requires http/https url");
      err.code = "E_INVALID_PARAMS";
      throw err;
    }
    const viewportW = req.viewport?.width ?? DEFAULT_VIEWPORT_WIDTH;
    const viewportH = req.viewport?.height ?? DEFAULT_VIEWPORT_HEIGHT;
    const userAgent = req.userAgent ?? DEFAULT_USER_AGENT;
    const locale = req.locale ?? DEFAULT_LOCALE;
    const waitNetworkIdleMs = numOr(req.waitNetworkIdleMs, NETWORK_IDLE_TIMEOUT_MS);
    const contentReadyTimeoutMs = numOr(req.contentReadyTimeoutMs, CONTENT_READY_TIMEOUT_MS);
    const contentReadyMinText = numOr(req.contentReadyMinText, CONTENT_READY_MIN_TEXT);
    const humanizeMaxMs = numOr(req.humanizeMaxMs, HUMANIZE_MAX_MS);
    const partition = `${PARTITION_PREFIX}${randomUUID()}`;
    log$6().info(`crawl start url=${truncate(url, 200)} partition=${partition.slice(-12)}`);
    const win = factory({
      show: false,
      width: viewportW,
      height: viewportH,
      title: "Marvis Crawl",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
        partition
      }
    });
    try {
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    } catch (err) {
      log$6().debug(`setWindowOpenHandler 异常（忽略）: ${err.message}`);
    }
    try {
      win.webContents.setUserAgent(userAgent);
    } catch (err) {
      log$6().debug(`setUserAgent 异常（忽略）: ${err.message}`);
    }
    const dbg = win.webContents.debugger;
    try {
      dbg.attach("1.3");
    } catch (err) {
      try {
        win.destroy();
      } catch {
      }
      const wrapped = new Error(`failed to attach debugger: ${err.message}`);
      wrapped.code = "E_INTERNAL";
      throw wrapped;
    }
    try {
      await win.loadURL("about:blank");
    } catch (err) {
      log$6().debug(`about:blank 预热失败（忽略）: ${err.message}`);
    }
    const sendCDP = (method, params) => dbg.sendCommand(method, params ?? {});
    const dbgEvents = dbg;
    const inflight = /* @__PURE__ */ new Set();
    let lastInflightChangeAt = Date.now();
    const onNetworkMessage = (_evt, method, params) => {
      const p = params ?? {};
      if (!p.requestId) return;
      if (method === "Network.requestWillBeSent") {
        inflight.add(p.requestId);
        lastInflightChangeAt = Date.now();
      } else if (method === "Network.loadingFinished" || method === "Network.loadingFailed") {
        inflight.delete(p.requestId);
        lastInflightChangeAt = Date.now();
      }
    };
    dbgEvents.on("message", onNetworkMessage);
    let loadEventSeen = null;
    let onLoadMessage = null;
    const loadPromise = new Promise((resolve2) => {
      const handler = (_event, method, _p) => {
        if (method === "Page.loadEventFired" || method === "Page.frameStoppedLoading") {
          loadEventSeen = method;
          dbgEvents.removeListener("message", handler);
          resolve2();
        }
      };
      onLoadMessage = handler;
      dbgEvents.on("message", handler);
      setTimeout(() => {
        if (onLoadMessage) {
          dbgEvents.removeListener("message", onLoadMessage);
          onLoadMessage = null;
        }
        resolve2();
      }, LOAD_EVENT_TIMEOUT_MS);
    });
    let finalUrl = url;
    const statusCode = 200;
    const contentType = "text/html";
    let html = "";
    try {
      try {
        await sendCDP("Page.enable");
      } catch (err) {
        log$6().debug(`Page.enable 失败（忽略，仍尝试导航）: ${err.message}`);
      }
      try {
        await sendCDP("Network.enable");
      } catch (err) {
        log$6().debug(`Network.enable 失败（忽略）: ${err.message}`);
      }
      try {
        await sendCDP("Page.addScriptToEvaluateOnNewDocument", {
          source: STEALTH_INIT_SCRIPT
        });
      } catch (err) {
        log$6().debug(`addScriptToEvaluateOnNewDocument 失败（忽略）: ${err.message}`);
      }
      try {
        await sendCDP("Network.setExtraHTTPHeaders", {
          headers: { "Accept-Language": `${locale},zh;q=0.9,en;q=0.8` }
        });
      } catch (err) {
        log$6().debug(`setExtraHTTPHeaders 失败（忽略）: ${err.message}`);
      }
      let nav;
      try {
        nav = await withTimeout$1(
          sendCDP("Page.navigate", { url }),
          NAVIGATE_ACK_MS,
          "Page.navigate ack"
        );
      } catch (err) {
        log$6().debug(`Page.navigate ack timeout: ${err.message}`);
      }
      if (nav?.errorText) {
        const e = new Error(`navigate failed: ${nav.errorText}`);
        e.code = "E_NAVIGATE_FAIL";
        throw e;
      }
      await loadPromise;
      log$6().debug(`load event seen=${loadEventSeen ?? "(timeout)"}`);
      if (waitNetworkIdleMs > 0) {
        await waitForNetworkIdle({
          inflight,
          getLastChangeAt: () => lastInflightChangeAt,
          quietMs: NETWORK_IDLE_QUIET_MS,
          timeoutMs: waitNetworkIdleMs
        });
      }
      if (contentReadyTimeoutMs > 0 && contentReadyMinText > 0) {
        await waitForContentReady(sendCDP, contentReadyMinText, contentReadyTimeoutMs);
      }
      if (humanizeMaxMs > 0) {
        await humanizePage(sendCDP, humanizeMaxMs);
      }
      try {
        const u = await sendCDP("Runtime.evaluate", {
          expression: "location.href",
          returnByValue: true
        });
        if (typeof u?.result?.value === "string" && u.result.value) finalUrl = u.result.value;
      } catch {
      }
      try {
        const r = await sendCDP("Runtime.evaluate", {
          expression: "document.documentElement && document.documentElement.outerHTML",
          returnByValue: true
        });
        if (r?.exceptionDetails) {
          const e = new Error(`evaluate outerHTML threw: ${r.exceptionDetails.text ?? ""}`);
          e.code = "E_INTERNAL";
          throw e;
        }
        if (typeof r?.result?.value === "string") html = r.result.value;
      } catch (err) {
        const e = new Error(`failed to read outerHTML: ${err.message}`);
        e.code = "E_INTERNAL";
        throw e;
      }
    } finally {
      try {
        dbgEvents.removeListener("message", onNetworkMessage);
      } catch {
      }
      try {
        if (onLoadMessage) dbgEvents.removeListener("message", onLoadMessage);
      } catch {
      }
      try {
        if (dbg.isAttached()) dbg.detach();
      } catch {
      }
      try {
        if (!win.isDestroyed()) win.destroy();
      } catch (err) {
        log$6().debug(`win.destroy 异常（忽略）: ${err.message}`);
      }
    }
    const elapsed = nowSeconds() - start2;
    log$6().info(`crawl done url=${truncate(finalUrl, 200)} status=${statusCode} html_len=${html.length} elapsed=${elapsed.toFixed(2)}s`);
    return {
      url: finalUrl,
      statusCode,
      contentType,
      html,
      elapsed
    };
  };
}
const runCrawl = createCrawler();
function withTimeout$1(promise, ms, label) {
  let timer2 = null;
  const timeout = new Promise((_, reject) => {
    timer2 = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer2) clearTimeout(timer2);
  });
}
async function waitForNetworkIdle(opts) {
  const { inflight, getLastChangeAt, quietMs, timeoutMs } = opts;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const idleFor = Date.now() - getLastChangeAt();
    if (inflight.size === 0 && idleFor >= quietMs) {
      log$6().debug(`networkidle reached, idle_for=${idleFor}ms`);
      return;
    }
    await sleep$4(100);
  }
  log$6().debug(`networkidle timeout after ${timeoutMs}ms (inflight=${inflight.size})`);
}
async function waitForContentReady(sendCDP, minText, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let length = 0;
    try {
      const r = await sendCDP("Runtime.evaluate", {
        expression: "(document.body && document.body.innerText) ? document.body.innerText.length : 0",
        returnByValue: true
      });
      const v = r?.result?.value;
      length = typeof v === "number" ? v : 0;
    } catch (err) {
      log$6().debug(`content-ready evaluate 异常（忽略，到时返回）: ${err.message}`);
      return;
    }
    if (length >= minText) {
      log$6().debug(`content ready visible_text=${length} threshold=${minText}`);
      return;
    }
    await sleep$4(CONTENT_READY_POLL_INTERVAL_MS);
  }
  log$6().debug(`content-ready timeout after ${timeoutMs}ms`);
}
async function humanizePage(sendCDP, budgetMs) {
  const deadline = Date.now() + budgetMs;
  for (const [x, y] of [[120, 160], [520, 360], [960, 520]]) {
    if (Date.now() >= deadline) return;
    try {
      await sendCDP("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x,
        y,
        button: "none"
      });
    } catch (err) {
      log$6().debug(`humanize mouse 异常（忽略）: ${err.message}`);
      break;
    }
    await sleep$4(50);
  }
  let scrollHeight = 0;
  let innerHeight = 0;
  try {
    const r = await sendCDP("Runtime.evaluate", {
      expression: "({ scrollHeight: document.documentElement.scrollHeight || 0, innerHeight: window.innerHeight || 0 })",
      returnByValue: true
    });
    const v = r?.result?.value;
    scrollHeight = Number(v?.scrollHeight ?? 0) || 0;
    innerHeight = Number(v?.innerHeight ?? 0) || 0;
  } catch (err) {
    log$6().debug(`humanize 采集滚动尺寸异常（忽略）: ${err.message}`);
    return;
  }
  if (scrollHeight <= innerHeight || innerHeight <= 0) return;
  let current = 0;
  while (current < scrollHeight && Date.now() < deadline) {
    current += HUMANIZE_SCROLL_STEP_PX;
    try {
      await sendCDP("Runtime.evaluate", {
        expression: `window.scrollTo({ top: ${current}, behavior: 'auto' })`,
        returnByValue: false
      });
    } catch (err) {
      log$6().debug(`humanize scroll 异常（忽略）: ${err.message}`);
      return;
    }
    await sleep$4(HUMANIZE_SCROLL_INTERVAL_MS);
  }
  if (Date.now() < deadline) {
    try {
      await sendCDP("Runtime.evaluate", {
        expression: "window.scrollTo({ top: 0, behavior: 'auto' })",
        returnByValue: false
      });
    } catch {
    }
  }
}
function sleep$4(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}
function nowSeconds() {
  return Date.now() / 1e3;
}
function numOr(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}
function truncate(s, max) {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}...`;
}
const ErrorCodes = Object.freeze({
  E_BAD_JSON: "E_BAD_JSON",
  E_TOO_LARGE: "E_TOO_LARGE",
  E_UNKNOWN_ACTION: "E_UNKNOWN_ACTION",
  E_INVALID_PARAMS: "E_INVALID_PARAMS",
  E_NAVIGATE_FAIL: "E_NAVIGATE_FAIL",
  E_TIMEOUT: "E_TIMEOUT",
  E_INTERNAL: "E_INTERNAL",
  E_TOO_MANY_CRAWLS: "E_TOO_MANY_CRAWLS"
});
function ok(id, data) {
  const resp = { id: id ?? null, success: true };
  if (data !== void 0) resp.data = data;
  return resp;
}
function fail(id, error, code) {
  const resp = {
    id: id ?? null,
    success: false,
    error: String(error instanceof Error ? error.message : error)
  };
  if (code) resp.code = code;
  return resp;
}
function serializeLine(envelope) {
  return `${JSON.stringify(envelope)}
`;
}
async function listenUds(socketPath, handlers2) {
  const log2 = getModuleLogger$4();
  const server = createServer((sock) => attachConnection(sock, handlers2.onConnection(sock), log2));
  if (handlers2.onError) {
    server.on("error", handlers2.onError);
  }
  await bindWithStaleSocketRecovery(server, socketPath, log2);
  return server;
}
function shutdownServer(server, socketPath) {
  const log2 = getModuleLogger$4();
  return new Promise((resolve2) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      try {
        unlinkSync(socketPath);
      } catch {
      }
      resolve2();
    };
    try {
      server.close(() => {
        settle();
      });
    } catch (err) {
      log2.warn(`server.close 异常: ${err.message}`);
      settle();
      return;
    }
    server.getConnections((err, count) => {
      if (!err && count > 0) {
        log2.info(`shutdownServer: ${count} 个活跃连接将随 close 一同关闭`);
      }
    });
  });
}
function attachConnection(sock, handlers2, log2) {
  let chunks = [];
  let buffered = 0;
  sock.on("data", (chunk) => {
    chunks.push(chunk);
    buffered += chunk.length;
    if (buffered > MAX_LINE_BYTES) {
      const joined2 = Buffer.concat(chunks, buffered);
      const nl = joined2.indexOf(10);
      if (nl < 0 || nl > MAX_LINE_BYTES) {
        log2.warn(`单行超过最大长度 ${MAX_LINE_BYTES}，关闭连接`);
        try {
          handlers2.onLineTooLarge?.(sock);
        } catch (err) {
          log2.warn(`onLineTooLarge 回调异常: ${err.message}`);
        }
        try {
          sock.destroy();
        } catch {
        }
        return;
      }
      chunks = [joined2];
      buffered = joined2.length;
    }
    const joined = Buffer.concat(chunks, buffered);
    chunks = [];
    buffered = 0;
    let start2 = 0;
    while (true) {
      const nl = joined.indexOf(10, start2);
      if (nl < 0) break;
      const line = joined.subarray(start2, nl);
      start2 = nl + 1;
      if (line.length === 0) continue;
      try {
        handlers2.onLine(line, sock);
      } catch (err) {
        log2.warn(`onLine 回调异常: ${err.message}`);
      }
    }
    if (start2 < joined.length) {
      const remaining = joined.subarray(start2);
      chunks.push(remaining);
      buffered = remaining.length;
    }
  });
  sock.on("error", (err) => {
    log2.debug(`socket error: ${err.message}`);
  });
  sock.on("close", () => {
  });
}
async function bindWithStaleSocketRecovery(server, socketPath, log2) {
  return new Promise((resolve2, reject) => {
    const attemptListen = () => {
      const onError = (err) => {
        if (err.code === "EADDRINUSE") {
          log2.warn(`socket 占用，尝试探测旧实例: ${socketPath}`);
          probeStaleSocket(socketPath).then(async (alive) => {
            if (alive) {
              reject(new Error(`socket already in use: ${socketPath}`));
              return;
            }
            try {
              await unlink$1(socketPath);
            } catch {
            }
            server.once("error", onError);
            server.listen(socketPath, () => resolve2());
          }).catch((probeErr) => {
            reject(probeErr);
          });
          return;
        }
        reject(err);
      };
      if (!existsSync(socketPath)) {
        server.once("error", onError);
        server.listen(socketPath, () => resolve2());
        return;
      }
      server.once("error", onError);
      server.listen(socketPath, () => resolve2());
    };
    attemptListen();
  });
}
function probeStaleSocket(socketPath) {
  return new Promise((resolve2) => {
    let settled = false;
    const settle = (alive) => {
      if (settled) return;
      settled = true;
      resolve2(alive);
    };
    try {
      const probe = createConnection({ path: socketPath });
      const timer2 = setTimeout(() => {
        try {
          probe.destroy();
        } catch {
        }
        settle(false);
      }, 500);
      probe.once("connect", () => {
        clearTimeout(timer2);
        try {
          probe.destroy();
        } catch {
        }
        settle(true);
      });
      probe.once("error", () => {
        clearTimeout(timer2);
        settle(false);
      });
    } catch {
      settle(false);
    }
  });
}
let cachedLogger = null;
function getModuleLogger$4() {
  if (!cachedLogger) {
    cachedLogger = getLogger("crawl:transport");
  }
  return cachedLogger;
}
const state$1 = {
  status: "idle",
  socketPath: null,
  server: null,
  connections: /* @__PURE__ */ new Set(),
  activeCrawls: 0,
  logger: null,
  runCrawl
};
function getModuleLogger$3() {
  if (!state$1.logger) state$1.logger = getLogger("crawl");
  return state$1.logger;
}
function resolveSocketPath(override) {
  const envPath = process.env[ENV_SOCKET_PATH];
  if (envPath && envPath.trim().length > 0) return envPath;
  return defaultCrawlSocketPath();
}
async function startCrawlServer(options) {
  const log2 = getModuleLogger$3();
  if (state$1.status !== "idle") {
    log2.warn(`startCrawlServer 已在 ${state$1.status} 状态，跳过`);
    return;
  }
  const socketPath = resolveSocketPath();
  state$1.socketPath = socketPath;
  log2.info(`crawl socket 路径: ${socketPath}`);
  try {
    mkdirSync(dirname(socketPath), { recursive: true });
  } catch (err) {
    log2.warn(`mkdir services 目录失败（继续尝试 listen）: ${err.message}`);
  }
  try {
    const server = await listenUds(socketPath, {
      onConnection: (sock) => {
        state$1.connections.add(sock);
        sock.on("close", () => {
          state$1.connections.delete(sock);
        });
        return {
          onLine: (line, s) => {
            void handleLine(line, s);
          },
          onLineTooLarge: (s) => {
            try {
              s.write(serializeLine(fail(null, "request too large", ErrorCodes.E_TOO_LARGE)));
            } catch {
            }
          }
        };
      },
      onError: (err) => {
        log2.error(`server error: ${err.message}`);
      }
    });
    state$1.server = server;
    state$1.status = "listening";
    try {
      await chmod(socketPath, 384);
    } catch (err) {
      log2.warn(`chmod socket 失败（非致命）: ${err.message}`);
    }
    log2.info(`crawl server 已就绪：${socketPath}`);
  } catch (err) {
    log2.error(`crawl server 启动失败（fail-soft）: ${err.message}`);
    state$1.status = "idle";
    state$1.server = null;
    state$1.socketPath = null;
  }
}
async function stopCrawlServer(timeoutMs = SHUTDOWN_TIMEOUT_MS) {
  const log2 = getModuleLogger$3();
  if (state$1.status === "idle") return;
  if (state$1.status === "shutting-down") {
    log2.warn("stopCrawlServer 已在进行中");
    return;
  }
  state$1.status = "shutting-down";
  const { server, socketPath } = state$1;
  for (const sock of state$1.connections) {
    try {
      sock.destroy();
    } catch {
    }
  }
  state$1.connections.clear();
  if (server && socketPath) {
    try {
      await Promise.race([
        shutdownServer(server, socketPath),
        new Promise((resolve2) => setTimeout(resolve2, timeoutMs))
      ]);
    } catch (err) {
      log2.warn(`shutdownServer 异常: ${err.message}`);
    }
  }
  state$1.server = null;
  state$1.socketPath = null;
  state$1.activeCrawls = 0;
  state$1.status = "idle";
  log2.info("crawl server 已关闭");
}
async function handleLine(line, sock) {
  const log2 = getModuleLogger$3();
  let req;
  try {
    req = JSON.parse(line.toString("utf8"));
  } catch (err) {
    log2.warn(`收到非法 JSON: ${err.message}`);
    safeWrite(sock, fail(null, `invalid json: ${err.message}`, ErrorCodes.E_BAD_JSON));
    return;
  }
  const { id, action } = req;
  log2.debug(`recv id=${id} action=${action}`);
  if (action !== "crawl") {
    safeWrite(sock, fail(id ?? null, `unknown action: ${action ?? "(missing)"}`, ErrorCodes.E_UNKNOWN_ACTION));
    return;
  }
  const url = (typeof req.url === "string" ? req.url : "").trim();
  if (!url) {
    safeWrite(sock, fail(id ?? null, "crawl requires a non-empty `url`", ErrorCodes.E_INVALID_PARAMS));
    return;
  }
  if (!/^https?:\/\//i.test(url)) {
    safeWrite(sock, fail(id ?? null, "crawl requires http/https url", ErrorCodes.E_INVALID_PARAMS));
    return;
  }
  if (state$1.activeCrawls >= MAX_CONCURRENT_CRAWLS) {
    safeWrite(sock, fail(
      id ?? null,
      `too many concurrent crawls (limit=${MAX_CONCURRENT_CRAWLS})`,
      ErrorCodes.E_TOO_MANY_CRAWLS
    ));
    return;
  }
  state$1.activeCrawls += 1;
  const started = Date.now();
  const timeoutMs = typeof req.timeoutMs === "number" && req.timeoutMs > 0 ? req.timeoutMs : CRAWL_TIMEOUT_MS;
  try {
    const data = await withTimeout(state$1.runCrawl(req), timeoutMs);
    const elapsed = Date.now() - started;
    log2.info(`crawl ok id=${id} elapsed=${elapsed}ms html_len=${data.html.length}`);
    safeWrite(sock, ok(id, data));
  } catch (err) {
    const elapsed = Date.now() - started;
    const code = mapErrorCode(err);
    log2.error(`crawl failed id=${id} code=${code} elapsed=${elapsed}ms err=${err.message}`);
    safeWrite(sock, fail(id ?? null, err.message, code));
  } finally {
    state$1.activeCrawls -= 1;
  }
}
function mapErrorCode(err) {
  const e = err;
  const code = e?.code;
  if (code === ErrorCodes.E_INVALID_PARAMS) return ErrorCodes.E_INVALID_PARAMS;
  if (code === ErrorCodes.E_NAVIGATE_FAIL) return ErrorCodes.E_NAVIGATE_FAIL;
  if (code === ErrorCodes.E_TIMEOUT) return ErrorCodes.E_TIMEOUT;
  if (code === ErrorCodes.E_INTERNAL) return ErrorCodes.E_INTERNAL;
  if (typeof e?.message === "string" && /timed out/i.test(e.message)) {
    return ErrorCodes.E_TIMEOUT;
  }
  return ErrorCodes.E_INTERNAL;
}
function withTimeout(promise, ms) {
  if (!ms || ms <= 0) return promise;
  let timer2 = null;
  const timeout = new Promise((_, reject) => {
    timer2 = setTimeout(() => {
      const e = new Error(`crawl timed out after ${ms}ms`);
      e.code = ErrorCodes.E_TIMEOUT;
      reject(e);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer2) clearTimeout(timer2);
  });
}
function safeWrite(sock, envelope) {
  try {
    sock.write(serializeLine(envelope));
  } catch {
  }
}
const COS_CONFIG_PATH = "/v3/pcyyb_get_cos_conf_by_name_sign";
const COS_BUCKET = "marvis-private-1258344701";
const COS_REGION = "ap-shanghai";
const COS_CONFIG_REQUEST_NAME = "MarvisLog";
const COLLECT_REPORT_URL = "https://yybadaccess.3g.qq.com/v3/marvis_report_task";
const REMOTE_PATH_TEMPLATE = "marvis/collect_info/{task_id}/{guid}/{filename}";
const DIAGNOSIS_NAME = "marvis";
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const COLLECT_INFO_TYPE = 6001;
const DISTRIBUTE_TYPE = "6001";
const CollectStatus = {
  /** 已收到指令 */
  RECEIVED: 1,
  /** 收集+上传成功 */
  SUCCESS: 2,
  /** 上传失败 */
  UPLOAD_FAILED: 3,
  /** 收集失败 */
  COLLECT_FAILED: 4,
  /** JSON 解析异常 */
  JSON_EXCEPTION: 5,
  /** 打包压缩异常 */
  ZIP_EXCEPTION: 6
};
const HTTP_TIMEOUT_MS$1 = 3e4;
const UPLOAD_TIMEOUT_MS$1 = 12e4;
const LOG_COLLECTOR_MOD_ID = "log_collector";
const LOG_COLLECTOR_MOD_NAME = "日志收集";
const LOG_COLLECTOR_REPORT_EVENTS = {
  /** 收到日志收集指令 */
  COLLECT_RECEIVED: "log_collector__collect_received",
  /** 日志打包成功 */
  PACK_SUCCESS: "log_collector__pack_success",
  /** 日志打包失败（严重错误，实时上报） */
  PACK_FAILED: "log_collector__pack_failed",
  /** COS 上传成功 */
  UPLOAD_SUCCESS: "log_collector__upload_success",
  /** COS 上传失败（严重错误，实时上报） */
  UPLOAD_FAILED: "log_collector__upload_failed",
  /** 整体收集流程失败（严重错误，实时上报） */
  COLLECT_FAILED: "log_collector__collect_failed"
};
const execFileAsync$3 = promisify$1(execFile);
let logger$Q = null;
function generateTimestampDirName() {
  const now = /* @__PURE__ */ new Date();
  const yyyy = String(now.getFullYear()).padStart(4, "0");
  const MM = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const HH = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const fff = String(now.getMilliseconds()).padStart(3, "0");
  return `${yyyy}${MM}${dd}_${HH}${mm}${ss}_${fff}`;
}
function getModuleLogger$2() {
  if (!logger$Q) {
    logger$Q = getLogger("log-collector");
  }
  return logger$Q;
}
async function handleTextMessage(rawJson) {
  const log2 = getModuleLogger$2();
  let message;
  try {
    message = JSON.parse(rawJson);
  } catch (err) {
    log2.warn(`WS 消息 JSON 解析失败: ${err.message}`);
    return;
  }
  if (!message.Items || !Array.isArray(message.Items)) {
    log2.debug("WS 消息无 Items 字段,跳过");
    return;
  }
  for (const item of message.Items) {
    if (item.Type === COLLECT_INFO_TYPE) {
      void processCollectLogItem(item).catch((err) => {
        log2.error(`日志收集任务执行失败: ${err.message}`);
      });
    }
  }
}
async function processCollectLogItem(item) {
  const log2 = getModuleLogger$2();
  let task;
  try {
    task = JSON.parse(item.Content);
  } catch (err) {
    log2.error(`收集任务 Content 解析失败: ${err.message}`);
    await reportStatus(item.TaskId, CollectStatus.JSON_EXCEPTION);
    return;
  }
  log2.info(`开始日志收集: task_id=${task.task_id} has_log=${task.has_log} has_dump=${task.has_dump}`);
  void reportBeaconEvent(LOG_COLLECTOR_REPORT_EVENTS.COLLECT_RECEIVED, {
    mod_id: LOG_COLLECTOR_MOD_ID,
    mod_name: LOG_COLLECTOR_MOD_NAME,
    task_id: task.task_id
  });
  await reportStatus(task.task_id, CollectStatus.RECEIVED);
  let files;
  try {
    files = await collectLogFiles(task);
  } catch (err) {
    log2.error(`日志文件收集失败: ${err.message}`);
    void reportBeaconRealtimeEvent(LOG_COLLECTOR_REPORT_EVENTS.COLLECT_FAILED, {
      mod_id: LOG_COLLECTOR_MOD_ID,
      mod_name: LOG_COLLECTOR_MOD_NAME,
      task_id: task.task_id,
      reason: String(err.message)
    });
    await reportStatus(task.task_id, CollectStatus.COLLECT_FAILED);
    return;
  }
  if (files.length === 0) {
    log2.warn("无可收集的日志文件");
    void reportBeaconRealtimeEvent(LOG_COLLECTOR_REPORT_EVENTS.COLLECT_FAILED, {
      mod_id: LOG_COLLECTOR_MOD_ID,
      mod_name: LOG_COLLECTOR_MOD_NAME,
      task_id: task.task_id,
      reason: "no_files"
    });
    await reportStatus(task.task_id, CollectStatus.COLLECT_FAILED);
    return;
  }
  log2.info(`收集到 ${files.length} 个文件`);
  let archivePath;
  let tempDir;
  try {
    const result = await packLogs(files, task.task_id);
    archivePath = result.archivePath;
    tempDir = result.tempDir;
  } catch (err) {
    log2.error(`日志打包失败: ${err.message}`);
    void reportBeaconRealtimeEvent(LOG_COLLECTOR_REPORT_EVENTS.PACK_FAILED, {
      mod_id: LOG_COLLECTOR_MOD_ID,
      mod_name: LOG_COLLECTOR_MOD_NAME,
      task_id: task.task_id,
      reason: String(err.message)
    });
    await reportStatus(task.task_id, CollectStatus.ZIP_EXCEPTION);
    return;
  }
  void reportBeaconEvent(LOG_COLLECTOR_REPORT_EVENTS.PACK_SUCCESS, {
    mod_id: LOG_COLLECTOR_MOD_ID,
    mod_name: LOG_COLLECTOR_MOD_NAME,
    task_id: task.task_id,
    file_count: String(files.length)
  });
  try {
    await uploadArchive(archivePath, task.task_id);
    log2.info("日志上传成功");
    void reportBeaconEvent(LOG_COLLECTOR_REPORT_EVENTS.UPLOAD_SUCCESS, {
      mod_id: LOG_COLLECTOR_MOD_ID,
      mod_name: LOG_COLLECTOR_MOD_NAME,
      task_id: task.task_id
    });
    await reportStatus(task.task_id, CollectStatus.SUCCESS);
  } catch (err) {
    log2.error(`日志上传失败: ${err.message}`);
    void reportBeaconRealtimeEvent(LOG_COLLECTOR_REPORT_EVENTS.UPLOAD_FAILED, {
      mod_id: LOG_COLLECTOR_MOD_ID,
      mod_name: LOG_COLLECTOR_MOD_NAME,
      task_id: task.task_id,
      reason: String(err.message)
    });
    await reportStatus(task.task_id, CollectStatus.UPLOAD_FAILED);
  }
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch {
  }
}
async function collectLogFiles(task) {
  const files = [];
  if (!task.has_log) {
    return files;
  }
  const logDir = getLogDir();
  if (logDir && existsSync(logDir)) {
    await collectFilesRecursive(logDir, files);
  }
  const daemonLogDir = join(app.getPath("userData"), "log");
  if (existsSync(daemonLogDir)) {
    const entries2 = await readdir(daemonLogDir);
    for (const entry of entries2) {
      if (entry.startsWith("daemon.log")) {
        const fullPath = join(daemonLogDir, entry);
        if (isCollectableLogFile(fullPath)) {
          files.push(fullPath);
        }
      }
    }
  }
  return files;
}
async function collectFilesRecursive(dir, result) {
  const entries2 = await readdir(dir);
  for (const entry of entries2) {
    if (entry === "Diagnosis") {
      continue;
    }
    const fullPath = join(dir, entry);
    const stat2 = statSync$1(fullPath);
    if (stat2.isDirectory()) {
      await collectFilesRecursive(fullPath, result);
    } else if (isCollectableLogFile(fullPath)) {
      result.push(fullPath);
    }
  }
}
function isCollectableLogFile(filePath) {
  try {
    const stat2 = statSync$1(filePath);
    return stat2.isFile() && stat2.size <= MAX_FILE_SIZE && stat2.size > 0;
  } catch {
    return false;
  }
}
async function packLogs(files, taskId) {
  const log2 = getModuleLogger$2();
  const tempDir = await mkdtemp(join(tmpdir(), "marvis-log-collect-"));
  const archiveName = `marvis-${taskId}-${Date.now()}.tar.gz`;
  const archivePath = join(tempDir, archiveName);
  log2.info(`打包 ${files.length} 个文件到 ${archivePath}`);
  const tarArgs = ["-czf", archivePath];
  const baseDir = getLogDir();
  const normalizedBase = baseDir?.endsWith("/") ? baseDir : `${baseDir}/`;
  const relativeFiles = [];
  const otherFiles = [];
  for (const filePath of files) {
    if (baseDir && filePath.startsWith(normalizedBase)) {
      relativeFiles.push(filePath.slice(normalizedBase.length));
    } else if (baseDir && filePath === baseDir) ;
    else {
      otherFiles.push(filePath);
    }
  }
  if (relativeFiles.length > 0) {
    tarArgs.push("-C", baseDir, ...relativeFiles);
  }
  for (const filePath of otherFiles) {
    tarArgs.push("-C", dirname(filePath), basename(filePath));
  }
  await execFileAsync$3("tar", tarArgs);
  return { archivePath, tempDir };
}
async function packDiagnosisLogs(files, _taskId) {
  const log2 = getModuleLogger$2();
  const logDir = getLogDir();
  if (!logDir) {
    throw new Error("日志目录未初始化");
  }
  const diagnosisDir = join(logDir, "Diagnosis");
  await mkdir(diagnosisDir, { recursive: true });
  const timestampDir = generateTimestampDirName();
  const subDir = join(diagnosisDir, timestampDir);
  await mkdir(subDir, { recursive: true });
  const archiveName = `marvis-diagnosis-${Date.now()}.tar.gz`;
  const archivePath = join(subDir, archiveName);
  log2.info(`打包 ${files.length} 个诊断日志文件到 ${archivePath}`);
  const normalizedBase = logDir.endsWith("/") ? logDir : `${logDir}/`;
  const relativeFiles = [];
  const otherFiles = [];
  for (const filePath of files) {
    if (filePath.startsWith(normalizedBase)) {
      relativeFiles.push(filePath.slice(normalizedBase.length));
    } else {
      otherFiles.push(filePath);
    }
  }
  const tarArgs = ["-czf", archivePath];
  if (relativeFiles.length > 0) {
    tarArgs.push("-C", logDir, ...relativeFiles);
  }
  for (const filePath of otherFiles) {
    tarArgs.push("-C", dirname(filePath), basename(filePath));
  }
  await execFileAsync$3("tar", tarArgs);
  await cleanupOldDiagnosisArchives(diagnosisDir);
  return archivePath;
}
const MAX_DIAGNOSIS_ARCHIVES = 3;
async function cleanupOldDiagnosisArchives(diagnosisDir) {
  try {
    const entries2 = await readdir(diagnosisDir);
    const subdirs = entries2.filter((e) => /^\d{8}_\d{6}_\d{3}$/.test(e)).map((e) => ({ name: e, path: join(diagnosisDir, e) })).filter(({ path: p }) => {
      try {
        return statSync$1(p).isDirectory();
      } catch {
        return false;
      }
    }).sort((a, b) => b.name.localeCompare(a.name));
    for (let i = MAX_DIAGNOSIS_ARCHIVES; i < subdirs.length; i++) {
      try {
        await rm(subdirs[i].path, { recursive: true, force: true });
      } catch {
      }
    }
  } catch {
  }
}
async function uploadArchive(archivePath, taskId) {
  const log2 = getModuleLogger$2();
  const guid = await getDeviceGuid();
  const remotePath = REMOTE_PATH_TEMPLATE.replace("{task_id}", taskId).replace("{guid}", guid).replace("{filename}", `${DIAGNOSIS_NAME}.7z`);
  log2.info("获取 COS 临时凭证...");
  const credentials = await fetchCosCredentials();
  log2.info("获取 COS 临时凭证成功");
  const cosUrl = `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${remotePath}`;
  log2.info(`COS 上传: ${cosUrl}`);
  await cosPutObject(cosUrl, archivePath, credentials);
  log2.info("COS 上传成功");
}
async function fetchCosCredentials() {
  const body = JSON.stringify({ name: COS_CONFIG_REQUEST_NAME });
  const headers = buildSignatureHeaders(body);
  const guid = await getDeviceGuid();
  headers["Ual-Access-Guid"] = guid;
  const host = getCosConfigHost();
  const url = `${host}${COS_CONFIG_PATH}`;
  const resp = await httpPost$1(url, body, headers);
  let parsed;
  try {
    parsed = JSON.parse(resp.body);
  } catch {
    throw new Error(`COS 凭证响应 JSON 解析失败: status=${resp.statusCode} body=${resp.body.slice(0, 200)}`);
  }
  if (!parsed.cos_conf?.secret_id || !parsed.cos_conf?.secret_key) {
    throw new Error(`COS 凭证响应缺少必要字段: status=${resp.statusCode} body=${resp.body.slice(0, 200)}`);
  }
  return parsed.cos_conf;
}
function getCosConfigHost() {
  const dev = process.env.MARVIS_API_DEBUG_MODE === "1" || process.env.MARVIS_API_DEBUG_MODE === "true";
  return dev ? "https://yybadaccess.sparta.html5.qq.com" : "https://yybadaccess.3g.qq.com";
}
function cosPutObject(url, filePath, credentials) {
  return new Promise((resolve2, reject) => {
    const fileStat = statSync$1(filePath);
    const urlObj = new URL(url);
    const now = Math.floor(Date.now() / 1e3);
    const expireTime = now + 600;
    const keyTime = `${now};${expireTime}`;
    const contentType = "application/octet-stream";
    const signedHeaders = {
      "content-length": String(fileStat.size),
      "content-type": contentType,
      host: urlObj.hostname,
      "x-cos-security-token": credentials.session_token
    };
    const authorization = buildCosAuthorization(
      credentials.secret_id,
      credentials.secret_key,
      "PUT",
      urlObj.pathname,
      signedHeaders,
      keyTime
    );
    const req = request(
      {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname,
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "Content-Length": fileStat.size,
          Authorization: authorization,
          "x-cos-security-token": credentials.session_token
        },
        timeout: UPLOAD_TIMEOUT_MS$1
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve2();
          } else {
            reject(new Error(`COS PUT 上传失败: status=${res.statusCode} body=${data}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("COS PUT 上传超时"));
    });
    const fileStream = createReadStream(filePath);
    fileStream.pipe(req);
  });
}
function buildCosAuthorization(secretId, secretKey, method, pathname, headers, keyTime) {
  const signKey = hmacSha1(secretKey, keyTime);
  const httpMethod = method.toLowerCase();
  const httpParameters = "";
  const sortedHeaderKeys = Object.keys(headers).sort();
  const headerList = sortedHeaderKeys.join(";");
  const httpHeaders = sortedHeaderKeys.map((k) => `${camSafeUrlEncode(k.toLowerCase())}=${camSafeUrlEncode(headers[k])}`).join("&");
  const httpString = `${httpMethod}
${pathname}
${httpParameters}
${httpHeaders}
`;
  const httpStringHash = sha1(httpString);
  const stringToSign = `sha1
${keyTime}
${httpStringHash}
`;
  const signature = hmacSha1(signKey, stringToSign);
  return `q-sign-algorithm=sha1&q-ak=${secretId}&q-sign-time=${keyTime}&q-key-time=${keyTime}&q-header-list=${headerList}&q-url-param-list=&q-signature=${signature}`;
}
function camSafeUrlEncode(str) {
  return encodeURIComponent(str).replace(/!/g, "%21").replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\*/g, "%2A");
}
function hmacSha1(key, data) {
  return createHmac("sha1", key).update(data, "utf8").digest("hex");
}
function sha1(data) {
  return createHash("sha1").update(data, "utf8").digest("hex");
}
async function reportStatus(taskId, status) {
  const log2 = getModuleLogger$2();
  const guid = await getDeviceGuid();
  const body = {
    task_id: taskId,
    guid,
    distribute_type: DISTRIBUTE_TYPE,
    status,
    extra: ""
  };
  const bodyStr = JSON.stringify(body);
  const headers = buildSignatureHeaders(bodyStr);
  headers["Ual-Access-Guid"] = guid;
  log2.info(`上报状态: task_id=${taskId} status=${status}`);
  try {
    const resp = await httpPost$1(COLLECT_REPORT_URL, bodyStr, headers);
    log2.info(`上报响应: status=${resp.statusCode} body=${resp.body}`);
  } catch (err) {
    log2.warn(`状态上报失败(非致命): ${err.message}`);
  }
}
function httpPost$1(url, body, customHeaders) {
  return new Promise((resolve2, reject) => {
    const urlObj = new URL(url);
    const headers = customHeaders ? { ...customHeaders } : { "Content-Type": "application/json" };
    headers["Content-Length"] = Buffer.byteLength(body);
    const req = request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: `${urlObj.pathname}${urlObj.search}`,
        method: "POST",
        headers,
        timeout: HTTP_TIMEOUT_MS$1
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          resolve2({ statusCode: res.statusCode ?? 0, body: data });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("HTTP POST 超时"));
    });
    req.write(body);
    req.end();
  });
}
const SCAN_PATHS = [
  "/Applications",
  "~/Applications",
  "/System/Applications",
  "/System/Applications/Utilities",
  "/Library/Input Methods"
];
const EXCLUDED_BUNDLE_IDS = /* @__PURE__ */ new Set([
  "com.tencent.mac.marvis"
]);
const MAX_PARSE_CONCURRENCY = 8;
const INCREMENTAL_DEBOUNCE_MS = 2e3;
const DB_FILE_NAME = "local_app_info.db";
const DB_DIR_NAME = "db";
const DB_TABLE_NAME = "app_info";
const DEFAULTS_TIMEOUT_MS = 5e3;
const LOG_SCOPE = "app-info-collection";
const ICON_CACHE_DIR_NAME = "icon_cache";
function getModuleDataRoot() {
  const { app: app2 } = require2("electron");
  return app2.getPath("userData");
}
const DEFAULT_GAME_TYPE_MAC = 22;
const MIN_VALID_PNG_BYTES = 3e3;
const RECALL_API_PATH = "/marvis/pcyyb_recall_s";
const RECALL_HOST_PROD = "https://yybadaccess.3g.qq.com";
const RECALL_HOST_DEV = "https://yybadaccess.sparta.html5.qq.com";
const RECALL_BID = "yybpcclient";
const RECALL_BUSINESS_ID = "marvis";
const RECALL_ACCESS_KEY = "fwhBlg99BuNQOyj6o7U1F7iJcb9FN5cu";
const RECALL_CMD = "RecallMarvisMacApp";
const RECALL_BATCH_SIZE = 100;
const RECALL_REQUEST_TIMEOUT_MS = 1e4;
const RECALL_RETRY_COUNT = 3;
const RECALL_RETRY_INTERVAL_MS = 100;
const REPORT_API_PATH = "/v3/report_marvis_mac_app";
const REPORT_HOST_PROD = "https://yybadaccess.3g.qq.com";
const REPORT_HOST_DEV = "https://yybadaccess.sparta.html5.qq.com";
const REPORT_BATCH_SIZE = 50;
const REPORT_REQUEST_TIMEOUT_MS$1 = 3e4;
const REPORT_RETRY_COUNT = 3;
const REPORT_RETRY_INTERVAL_MS = 500;
var AppInstallSource = /* @__PURE__ */ ((AppInstallSource2) => {
  AppInstallSource2[AppInstallSource2["OTHER"] = 0] = "OTHER";
  AppInstallSource2[AppInstallSource2["MAC_APP_STORE"] = 1] = "MAC_APP_STORE";
  AppInstallSource2[AppInstallSource2["OFFICIAL_WEBSITE"] = 2] = "OFFICIAL_WEBSITE";
  AppInstallSource2[AppInstallSource2["PC_APP_STORE"] = 3] = "PC_APP_STORE";
  AppInstallSource2[AppInstallSource2["SYSTEM_PREINSTALLED"] = 4] = "SYSTEM_PREINSTALLED";
  return AppInstallSource2;
})(AppInstallSource || {});
var AppInstallState = /* @__PURE__ */ ((AppInstallState2) => {
  AppInstallState2[AppInstallState2["NONE"] = 0] = "NONE";
  AppInstallState2[AppInstallState2["UNKNOWN"] = 1001] = "UNKNOWN";
  AppInstallState2[AppInstallState2["CHECKING"] = 1002] = "CHECKING";
  AppInstallState2[AppInstallState2["INSTALLED"] = 1003] = "INSTALLED";
  AppInstallState2[AppInstallState2["UNINSTALLED"] = 1004] = "UNINSTALLED";
  AppInstallState2[AppInstallState2["UPDATE_AVAILABLE"] = 1005] = "UPDATE_AVAILABLE";
  return AppInstallState2;
})(AppInstallState || {});
function mapGameTypeToAppType(gameType) {
  switch (gameType) {
    case 21:
      return "mac_game";
    case 22:
      return "mac_app";
    default:
      return "unknown";
  }
}
function emptyToNull(val) {
  return val && val.length > 0 ? val : null;
}
function parseIntField(val, defaultVal) {
  if (!val) return defaultVal;
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? defaultVal : n;
}
function toDbRow(appInfo, backend) {
  const fieldI = backend?.fieldI ?? {};
  const fieldS = backend?.fieldS ?? {};
  const lastModifiedUnix = appInfo.lastModified ? Math.floor(appInfo.lastModified.getTime() / 1e3) : 0;
  return {
    // ─── 本地字段 ───
    local_pkg_name: appInfo.bundleId,
    display_name: appInfo.displayName,
    launcher_path: appInfo.appPath,
    state: appInfo.state,
    install_ts: appInfo.installTimestamp ? Math.floor(appInfo.installTimestamp.getTime() / 1e3) : 0,
    extra_data: appInfo.extraData ?? null,
    config_icon: appInfo.displayIcon ?? "",
    launcher_icon: appInfo.displayIcon ?? "",
    // ─── 后台字段（有匹配时取后台值，无匹配时用默认值） ───
    pkg_name: fieldS.pkg_name || appInfo.bundleId,
    app_id: fieldI.app_id ? parseIntField(fieldI.app_id, 0) || null : null,
    game_type: parseIntField(fieldI.game_type, DEFAULT_GAME_TYPE_MAC),
    parent_cate_id: parseIntField(fieldI.parent_cate_id, 0),
    cate_id_new: fieldI.cate_id_new ? parseIntField(fieldI.cate_id_new, 0) || null : null,
    cate_name_new: emptyToNull(fieldS.cate_name_new),
    tag_id: emptyToNull(fieldS.tag_id),
    tag_name: emptyToNull(fieldS.tag_name),
    game_tag_id: emptyToNull(fieldS.game_tag_id),
    game_tag_name: emptyToNull(fieldS.game_tag_name),
    launcher_param: null,
    can_remove: 1,
    status: parseIntField(fieldI.status, 0),
    check_level: parseIntField(fieldI.check_level, 0),
    update_time: fieldI.update_time ? parseIntField(fieldI.update_time, 0) : lastModifiedUnix || null,
    icon: fieldS.icon || "",
    // ─── 旧表保留字段 ───
    bundle_version: appInfo.bundleVersion,
    scan_priority: appInfo.scanPriority,
    min_system_version: appInfo.minSystemVersion ?? "",
    last_modified_ts: lastModifiedUnix,
    display_icon: appInfo.displayIcon ?? "",
    upload_type: 2,
    upload_key: appInfo.bundleId,
    support_platform: appInfo.supportPlatform,
    // ─── 上报相关字段 ───
    reported: 0,
    install_source: appInfo.installSource ?? AppInstallSource.OTHER
  };
}
function fromDbRow(row) {
  return {
    bundleId: row.local_pkg_name,
    displayName: row.display_name,
    bundleVersion: row.bundle_version,
    appPath: row.launcher_path,
    state: row.state,
    scanPriority: row.scan_priority,
    minSystemVersion: row.min_system_version || null,
    extraData: row.extra_data || null,
    installTimestamp: row.install_ts ? new Date(row.install_ts * 1e3) : /* @__PURE__ */ new Date(),
    lastModified: row.last_modified_ts ? new Date(row.last_modified_ts * 1e3) : /* @__PURE__ */ new Date(),
    displayIcon: row.display_icon || null,
    supportPlatform: row.support_platform || "macos",
    installSource: row.install_source ?? AppInstallSource.OTHER
  };
}
function calcPriority(appPath) {
  if (appPath.startsWith("/Applications/")) return 1;
  if (appPath.startsWith("/System/Applications/")) return 2;
  if (appPath.includes("/Applications/") && !appPath.startsWith("/Applications/")) return 2;
  return 3;
}
const execFileAsync$2 = promisify$1(execFile);
const iconLogger = getLogger(LOG_SCOPE);
let cachedSystemLanguage = null;
function getSystemLanguage() {
  if (cachedSystemLanguage) return cachedSystemLanguage;
  try {
    const output = execSync("defaults read .GlobalPreferences AppleLanguages", {
      encoding: "utf-8",
      timeout: DEFAULTS_TIMEOUT_MS
    }).trim();
    const match = output.match(/"([^"]+)"/);
    if (match?.[1]) {
      const parts = match[1].split("-");
      cachedSystemLanguage = parts.length >= 2 ? `${parts[0]}-${parts[1]}` : parts[0];
      return cachedSystemLanguage;
    }
  } catch {
  }
  cachedSystemLanguage = "en";
  return cachedSystemLanguage;
}
function parsePlist(plistPath) {
  try {
    if (!existsSync(plistPath)) return null;
    const buffer = readFileSync$1(plistPath);
    if (buffer.length >= 6 && buffer.toString("ascii", 0, 6) === "bplist") {
      const result = bplistParser.parseBuffer(buffer);
      if (Array.isArray(result) && result.length > 0) {
        return result[0];
      }
      return null;
    }
    const xmlContent = buffer.toString("utf-8");
    const parsed = plist.parse(xmlContent);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
function parseStringsFile(stringsPath) {
  try {
    if (!existsSync(stringsPath)) return null;
    const buffer = readFileSync$1(stringsPath);
    if (buffer.length >= 6 && buffer.toString("ascii", 0, 6) === "bplist") {
      const result2 = bplistParser.parseBuffer(buffer);
      if (Array.isArray(result2) && result2.length > 0 && typeof result2[0] === "object") {
        return result2[0];
      }
      return null;
    }
    let content;
    if (buffer.length >= 2 && buffer[0] === 255 && buffer[1] === 254) {
      content = buffer.toString("utf16le");
    } else if (buffer.length >= 2 && buffer[0] === 254 && buffer[1] === 255) {
      const swapped = Buffer.alloc(buffer.length);
      for (let i = 0; i < buffer.length - 1; i += 2) {
        swapped[i] = buffer[i + 1];
        swapped[i + 1] = buffer[i];
      }
      content = swapped.toString("utf16le");
    } else {
      content = buffer.toString("utf-8");
    }
    if (content.includes("<?xml") || content.includes("<plist")) {
      try {
        const parsed = plist.parse(content);
        if (typeof parsed === "object" && parsed !== null) {
          return parsed;
        }
      } catch {
      }
    }
    const result = {};
    const regex = /(?:"([^"\\]*(?:\\.[^"\\]*)*)"|(\w[\w.]*\w|\w+))\s*=\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*;/g;
    let match;
    match = regex.exec(content);
    while (match !== null) {
      const key = (match[1] ?? match[2]).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      const value = match[3].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      result[key] = value;
      match = regex.exec(content);
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}
function getNameFromLoctable(resourcesDir) {
  const loctablePath = join(resourcesDir, "InfoPlist.loctable");
  if (!existsSync(loctablePath)) return null;
  try {
    const buffer = readFileSync$1(loctablePath);
    const result = bplistParser.parseBuffer(buffer);
    if (!Array.isArray(result) || result.length === 0) return null;
    const data = result[0];
    const langMap = data["localized-strings"] ?? data;
    const lang = getSystemLanguage();
    const underscoreLang = lang.replace("-", "_");
    const candidates2 = [
      lang,
      // "zh-Hans"
      underscoreLang,
      // "zh_Hans"
      `${lang.split("-")[0]}_CN`,
      // "zh_CN"
      `${lang.split("-")[0]}_TW`,
      // "zh_TW"
      lang.split("-")[0],
      // "zh"
      "en",
      "Base"
    ];
    for (const candidate of candidates2) {
      const langData = langMap[candidate];
      if (langData && typeof langData === "object") {
        const name = langData.CFBundleDisplayName || langData.CFBundleName;
        if (name) return name;
      }
    }
    return null;
  } catch {
    return null;
  }
}
function getNameFromLproj(resourcesDir) {
  if (!existsSync(resourcesDir)) return null;
  const lang = getSystemLanguage();
  const underscoreLang = lang.replace("-", "_");
  const candidates2 = [
    `${lang}.lproj`,
    // "zh-Hans.lproj"
    `${underscoreLang}.lproj`,
    // "zh_Hans.lproj"
    `${lang.split("-")[0]}_CN.lproj`,
    // "zh_CN.lproj"
    `${lang.split("-")[0]}.lproj`,
    // "zh.lproj"
    "Base.lproj",
    "en.lproj"
  ];
  for (const lprojDir of candidates2) {
    const stringsPath = join(resourcesDir, lprojDir, "InfoPlist.strings");
    const parsed = parseStringsFile(stringsPath);
    if (parsed) {
      const name = parsed.CFBundleDisplayName || parsed.CFBundleName;
      if (name) return name;
    }
  }
  return null;
}
function getLocalizedDisplayName(appPath, plistData, ctx) {
  const resourcesDir = ctx?.resourcesDir ?? join(appPath, "Contents", "Resources");
  const loctableName = getNameFromLoctable(resourcesDir);
  if (loctableName) return loctableName;
  const lprojName = getNameFromLproj(resourcesDir);
  if (lprojName) return lprojName;
  if (plistData) {
    const displayName = plistData.CFBundleDisplayName;
    if (typeof displayName === "string" && displayName) return displayName;
    const bundleName = plistData.CFBundleName;
    if (typeof bundleName === "string" && bundleName) return bundleName;
  }
  return basename(appPath, ".app");
}
function getIconCacheDir() {
  return join(getModuleDataRoot(), ICON_CACHE_DIR_NAME);
}
const ICON_EXTRACTOR_BIN = "icon-extractor";
function resolveIconExtractorPath() {
  const { resourcesPath } = process;
  if (resourcesPath) {
    const packed = join(resourcesPath, "bin", ICON_EXTRACTOR_BIN);
    if (existsSync(packed)) return packed;
  }
  const dev = join(process.cwd(), "resources", "bin", ICON_EXTRACTOR_BIN);
  if (existsSync(dev)) return dev;
  return null;
}
async function extractIconFromAssetCatalog(appPath, bundleId) {
  const cacheDir = getIconCacheDir();
  const outPath = join(cacheDir, `${bundleId}.png`);
  if (existsSync(outPath)) return outPath;
  const extractorPath = resolveIconExtractorPath();
  if (!extractorPath) {
    iconLogger.warn(`icon-extractor 工具未找到，跳过 Asset Catalog 提取 (${bundleId})`);
    return null;
  }
  try {
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }
    await execFileAsync$2(extractorPath, [appPath, outPath, "256"], { timeout: 5e3 });
    if (existsSync(outPath)) {
      const pngSize = statSync$1(outPath).size;
      if (pngSize < MIN_VALID_PNG_BYTES) {
        iconLogger.info(`icon-extractor 产出疑似无效图标，删除 (${bundleId}): ${pngSize} bytes < ${MIN_VALID_PNG_BYTES}`);
        try {
          unlinkSync(outPath);
        } catch {
        }
        return null;
      }
      iconLogger.info(`Asset Catalog 图标提取成功: ${bundleId} → ${outPath}`);
      return outPath;
    }
  } catch (err) {
    iconLogger.warn(`Asset Catalog 图标提取失败 (${bundleId}): ${err.message}`);
  }
  return null;
}
async function convertIcnsToPng(icnsPath, bundleId) {
  const cacheDir = getIconCacheDir();
  const outPath = join(cacheDir, `${bundleId}.png`);
  if (existsSync(outPath)) {
    try {
      const srcMtime = statSync$1(icnsPath).mtimeMs;
      const cachedStat = statSync$1(outPath);
      if (cachedStat.mtimeMs >= srcMtime) {
        return cachedStat.size >= MIN_VALID_PNG_BYTES ? outPath : null;
      }
    } catch {
    }
  }
  try {
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }
    await execFileAsync$2("sips", ["-s", "format", "png", "-z", "256", "256", icnsPath, "--out", outPath], {
      timeout: 5e3
    });
    if (!existsSync(outPath)) return null;
    const pngSize = statSync$1(outPath).size;
    if (pngSize < MIN_VALID_PNG_BYTES) {
      iconLogger.info(`icns→png 结果疑似空白图，删除无效缓存 (${bundleId}): ${pngSize} bytes < ${MIN_VALID_PNG_BYTES}`);
      try {
        unlinkSync(outPath);
      } catch {
      }
      return null;
    }
    return outPath;
  } catch (err) {
    iconLogger.warn(`icns→png 转换失败 (${bundleId}): ${err.message}`);
    return null;
  }
}
async function scaleIOSIconToPng(srcPngPath, bundleId) {
  const cacheDir = getIconCacheDir();
  const outPath = join(cacheDir, `${bundleId}.png`);
  if (existsSync(outPath)) {
    try {
      const srcMtime = statSync$1(srcPngPath).mtimeMs;
      const cachedStat = statSync$1(outPath);
      if (cachedStat.mtimeMs >= srcMtime && cachedStat.size >= MIN_VALID_PNG_BYTES) {
        return outPath;
      }
    } catch {
    }
  }
  try {
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }
    await execFileAsync$2("sips", ["-s", "format", "png", "-z", "256", "256", srcPngPath, "--out", outPath], {
      timeout: 5e3
    });
    if (existsSync(outPath) && statSync$1(outPath).size >= MIN_VALID_PNG_BYTES) {
      iconLogger.info(`iOS 图标缩放成功: ${bundleId} → ${outPath}`);
      return outPath;
    }
  } catch (err) {
    iconLogger.warn(`iOS 图标缩放失败 (${bundleId}): ${err.message}`);
  }
  return null;
}
async function extractIOSAppIcon(innerAppPath, bundleId) {
  try {
    const files = readdirSync$1(innerAppPath).filter((f) => f.startsWith("AppIcon") && f.endsWith(".png"));
    if (files.length === 0) return null;
    const preferredOrder = ["AppIcon76x76@2x~ipad.png", "AppIcon60x60@2x.png", "AppIcon83.5x83.5@2x~ipad.png"];
    for (const preferred of preferredOrder) {
      if (files.includes(preferred)) {
        const iconPath = join(innerAppPath, preferred);
        return scaleIOSIconToPng(iconPath, bundleId);
      }
    }
    let maxSize = 0;
    let maxFile = "";
    for (const file of files) {
      try {
        const filePath = join(innerAppPath, file);
        const stat2 = statSync$1(filePath);
        if (stat2.size > maxSize) {
          maxSize = stat2.size;
          maxFile = filePath;
        }
      } catch {
      }
    }
    if (maxFile) {
      return scaleIOSIconToPng(maxFile, bundleId);
    }
  } catch {
  }
  return null;
}
async function getDisplayIconPath(appPath, plistData, ctx) {
  const bundleId = plistData?.CFBundleIdentifier;
  const hasBundleId = typeof bundleId === "string" && bundleId.length > 0;
  if (ctx?.isIOSPorted && ctx.innerAppPath && hasBundleId) {
    const wsIcon = await extractIconFromAssetCatalog(appPath, bundleId);
    if (wsIcon) return wsIcon;
    return extractIOSAppIcon(ctx.innerAppPath, bundleId);
  }
  const resourcesDir = join(appPath, "Contents", "Resources");
  if (!existsSync(resourcesDir)) return null;
  if (plistData) {
    const iconFields = ["CFBundleIconFile", "CFBundleIconName"];
    for (const field of iconFields) {
      const iconName = plistData[field];
      if (typeof iconName === "string" && iconName) {
        const name = iconName.endsWith(".icns") ? iconName : `${iconName}.icns`;
        const iconPath = join(resourcesDir, name);
        if (existsSync(iconPath) && hasBundleId) {
          const pngPath = await convertIcnsToPng(iconPath, bundleId);
          if (pngPath) return pngPath;
        }
      }
    }
  }
  const defaultIcon = join(resourcesDir, "AppIcon.icns");
  if (existsSync(defaultIcon) && hasBundleId) {
    const pngPath = await convertIcnsToPng(defaultIcon, bundleId);
    if (pngPath) return pngPath;
  }
  try {
    const files = readdirSync$1(resourcesDir).filter((f) => f.endsWith(".icns"));
    if (files.length > 0) {
      let maxSize = 0;
      let maxFile = "";
      for (const file of files) {
        const filePath = join(resourcesDir, file);
        try {
          const stat2 = statSync$1(filePath);
          if (stat2.size > maxSize) {
            maxSize = stat2.size;
            maxFile = filePath;
          }
        } catch {
        }
      }
      if (maxFile && hasBundleId) {
        const pngPath = await convertIcnsToPng(maxFile, bundleId);
        if (pngPath) return pngPath;
      }
    }
  } catch {
  }
  const assetsCar = join(resourcesDir, "Assets.car");
  if (existsSync(assetsCar) && hasBundleId) {
    return extractIconFromAssetCatalog(appPath, bundleId);
  }
  return null;
}
function getSupportPlatform(plistData) {
  if (!plistData) return "macos";
  const platforms = plistData.CFBundleSupportedPlatforms;
  if (Array.isArray(platforms) && platforms.length > 0) {
    return platforms.filter((p) => typeof p === "string").join(",");
  }
  return "macos";
}
const logger$P = getLogger(LOG_SCOPE);
function resolveAppPathContext(appPath) {
  const nativePlistPath = join(appPath, "Contents", "Info.plist");
  if (existsSync(nativePlistPath)) {
    return {
      outerAppPath: appPath,
      plistPath: nativePlistPath,
      resourcesDir: join(appPath, "Contents", "Resources"),
      isIOSPorted: false,
      innerAppPath: null
    };
  }
  const wrapperDir = join(appPath, "Wrapper");
  if (existsSync(wrapperDir)) {
    try {
      const entries2 = readdirSync$1(wrapperDir, { withFileTypes: true });
      for (const entry of entries2) {
        if (entry.isDirectory() && entry.name.endsWith(".app")) {
          const innerApp = join(wrapperDir, entry.name);
          const innerPlist = join(innerApp, "Info.plist");
          if (existsSync(innerPlist)) {
            return {
              outerAppPath: appPath,
              plistPath: innerPlist,
              resourcesDir: innerApp,
              isIOSPorted: true,
              innerAppPath: innerApp
            };
          }
        }
      }
    } catch {
    }
  }
  const flatPlistPath = join(appPath, "Info.plist");
  if (existsSync(flatPlistPath)) {
    return {
      outerAppPath: appPath,
      plistPath: flatPlistPath,
      resourcesDir: appPath,
      isIOSPorted: false,
      innerAppPath: null
    };
  }
  return null;
}
function detectInstallSource(ctx, bundleId) {
  const { outerAppPath, isIOSPorted } = ctx;
  if (isIOSPorted) {
    const itunesMeta = join(outerAppPath, "Wrapper", "iTunesMetadata.plist");
    if (existsSync(itunesMeta)) {
      return AppInstallSource.MAC_APP_STORE;
    }
  }
  const receiptPath = join(outerAppPath, "Contents", "_MASReceipt", "receipt");
  if (existsSync(receiptPath)) {
    return AppInstallSource.MAC_APP_STORE;
  }
  if (bundleId.startsWith("com.tencent.yybmac.app")) {
    return AppInstallSource.PC_APP_STORE;
  }
  if (outerAppPath.startsWith("/System/Applications/") || bundleId.startsWith("com.apple.")) {
    return AppInstallSource.SYSTEM_PREINSTALLED;
  }
  return AppInstallSource.OTHER;
}
function expandHome(p) {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  if (p === "~") return homedir();
  return p;
}
class MacAppScanner {
  /**
   * 全量扫描：遍历 SCAN_PATHS → 递归发现 .app → 并发解析
   *
   * @returns 解析成功的应用信息列表
   */
  async scanAll() {
    const startTime = Date.now();
    logger$P.info("开始全量扫描...");
    const paths = this.findAllAppPaths();
    logger$P.info(`发现 ${paths.length} 个候选 .app 路径`);
    const apps = await this.parseAppBatch(paths);
    const elapsed = Date.now() - startTime;
    logger$P.info(`全量扫描完成: ${apps.length} 个有效应用, 耗时 ${elapsed}ms`);
    return apps;
  }
  /**
   * 单个 .app 解析（增量监听事件触发时使用）
   *
   * @param appPath - .app 目录绝对路径
   * @returns 解析成功的应用信息，失败返回 null
   */
  async scanSingle(appPath) {
    return this.parseApp(appPath);
  }
  /**
   * 遍历 SCAN_PATHS 收集所有 .app 路径（Set 去重）
   *
   * @returns 去重后的 .app 路径列表
   */
  findAllAppPaths() {
    const pathSet = /* @__PURE__ */ new Set();
    for (const rawPath of SCAN_PATHS) {
      const scanPath = expandHome(rawPath);
      if (!existsSync(scanPath)) {
        logger$P.info(`扫描目录不存在，跳过: ${scanPath}`);
        continue;
      }
      try {
        this.scanRecursiveStopAtApp(scanPath, pathSet);
      } catch (err) {
        logger$P.warn(`扫描目录失败 ${scanPath}: ${err.message}`);
      }
    }
    logger$P.info(`目录扫描完成: 共发现 ${pathSet.size} 个 .app 路径`);
    return Array.from(pathSet);
  }
  /**
   * 递归扫描目录，遇到 .app 就加入结果并停止递归（不进入 .app 内部）
   *
   * @param dir - 要扫描的目录
   * @param results - 结果收集 Set
   */
  scanRecursiveStopAtApp(dir, results) {
    try {
      const entries2 = readdirSync$1(dir, { withFileTypes: true });
      for (const entry of entries2) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        const fullPath = join(dir, entry.name);
        if (entry.name.endsWith(".app")) {
          results.add(fullPath);
          continue;
        }
        if (entry.isDirectory()) {
          this.scanRecursiveStopAtApp(fullPath, results);
        }
      }
    } catch {
    }
  }
  /**
   * 过滤 + plist 解析（单个应用）
   *
   * 支持三种 .app 目录结构：
   * - 原生 macOS（Contents/Info.plist）
   * - iOS 移植应用（Wrapper/*.app/Info.plist）
   * - 扁平结构（顶层 Info.plist）
   *
   * @param appPath - .app 目录绝对路径
   * @returns 解析成功的应用信息，过滤或失败返回 null
   */
  async parseApp(appPath) {
    try {
      if (!appPath.endsWith(".app")) return null;
      if (appPath.includes(".framework/")) {
        const depth = appPath.split(".framework/").length - 1;
        if (depth > 0) return null;
      }
      const ctx = resolveAppPathContext(appPath);
      if (!ctx) return null;
      const plistData = parsePlist(ctx.plistPath);
      if (!plistData) return null;
      const bundleId = plistData.CFBundleIdentifier;
      if (typeof bundleId !== "string" || !bundleId) return null;
      if (EXCLUDED_BUNDLE_IDS.has(bundleId)) return null;
      const bundleVersion = plistData.CFBundleShortVersionString ?? plistData.CFBundleVersion ?? "";
      const minSystemVersion = plistData.LSMinimumSystemVersion ?? null;
      const displayName = getLocalizedDisplayName(appPath, plistData, ctx);
      const displayIcon = await getDisplayIconPath(appPath, plistData, ctx);
      const supportPlatform = getSupportPlatform(plistData);
      const installSource = detectInstallSource(ctx, bundleId);
      let lastModified = /* @__PURE__ */ new Date();
      try {
        const stat2 = statSync$1(ctx.plistPath);
        lastModified = stat2.mtime;
      } catch {
      }
      const extraFields = {};
      const extraKeys = ["CFBundleVersion", "CFBundleExecutable", "CFBundlePackageType"];
      for (const key of extraKeys) {
        if (plistData[key] !== void 0) {
          extraFields[key] = plistData[key];
        }
      }
      const extraData = Object.keys(extraFields).length > 0 ? JSON.stringify(extraFields) : null;
      const appInfo = {
        bundleId,
        displayName,
        bundleVersion: String(bundleVersion),
        appPath,
        installTimestamp: /* @__PURE__ */ new Date(),
        lastModified,
        minSystemVersion: minSystemVersion ? String(minSystemVersion) : null,
        state: AppInstallState.INSTALLED,
        scanPriority: calcPriority(appPath),
        extraData,
        displayIcon,
        supportPlatform,
        installSource,
        isIOSPortedApp: ctx.isIOSPorted
      };
      return appInfo;
    } catch (err) {
      logger$P.warn(`解析应用失败 ${appPath}: ${err.message}`);
      return null;
    }
  }
  /**
   * 并发控制批量解析
   *
   * 将路径列表按并发数分块，每块内并行解析，避免同时打开过多文件
   *
   * @param paths - .app 路径列表
   * @returns 解析成功的应用信息列表
   */
  async parseAppBatch(paths) {
    const results = [];
    for (let i = 0; i < paths.length; i += MAX_PARSE_CONCURRENCY) {
      const chunk = paths.slice(i, i + MAX_PARSE_CONCURRENCY);
      const chunkResults = await Promise.allSettled(chunk.map((p) => this.parseApp(p)));
      for (const result of chunkResults) {
        if (result.status === "fulfilled" && result.value) {
          results.push(result.value);
        }
      }
    }
    return results;
  }
}
const logger$O = getLogger(LOG_SCOPE);
const UPSERT_COLUMNS = [
  "local_pkg_name",
  "pkg_name",
  "app_id",
  "display_name",
  "game_type",
  "parent_cate_id",
  "cate_id_new",
  "cate_name_new",
  "tag_id",
  "tag_name",
  "game_tag_id",
  "game_tag_name",
  "launcher_path",
  "launcher_param",
  "can_remove",
  "state",
  "status",
  "check_level",
  "install_ts",
  "extra_data",
  "update_time",
  "icon",
  "config_icon",
  "launcher_icon",
  "bundle_version",
  "scan_priority",
  "min_system_version",
  "last_modified_ts",
  "display_icon",
  "upload_type",
  "upload_key",
  "support_platform",
  "install_source"
];
const UPDATE_ON_CONFLICT_COLUMNS = UPSERT_COLUMNS.filter((col) => col !== "local_pkg_name" && col !== "install_ts" && col !== "reported");
function getTodayDateInt() {
  const now = /* @__PURE__ */ new Date();
  return now.getFullYear() * 1e4 + (now.getMonth() + 1) * 100 + now.getDate();
}
const UPSERT_SQL = `
  INSERT INTO ${DB_TABLE_NAME} (${UPSERT_COLUMNS.join(", ")})
  VALUES (${UPSERT_COLUMNS.map(() => "?").join(", ")})
  ON CONFLICT(local_pkg_name) DO UPDATE SET
    ${UPDATE_ON_CONFLICT_COLUMNS.map((col) => `${col} = excluded.${col}`).join(",\n    ")}
`;
function rowToParams(row) {
  return UPSERT_COLUMNS.map((col) => row[col] ?? null);
}
class MacAppDAO {
  db = null;
  dbPath;
  /** 脏标记：有未落盘的写操作 */
  dirty = false;
  /**
   * @param dbPath - SQLite 数据库文件绝对路径
   */
  constructor(dbPath) {
    this.dbPath = dbPath;
  }
  /**
   * 确保数据库和表存在（自动建表 + 建索引）
   *
   * sql.js 需要异步初始化 WASM，因此本方法为 async。
   * 如果磁盘上已有 .db 文件，会从文件加载；否则创建空库。
   */
  async ensureDbAndTable() {
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const SQL = await initSqlJs();
    if (existsSync(this.dbPath)) {
      const fileBuffer = readFileSync$1(this.dbPath);
      this.db = new SQL.Database(fileBuffer);
      logger$O.info(`从磁盘加载数据库: ${this.dbPath}`);
    } else {
      this.db = new SQL.Database();
      logger$O.info(`创建新数据库: ${this.dbPath}`);
    }
    this.db.run(`
      CREATE TABLE IF NOT EXISTS ${DB_TABLE_NAME} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        local_pkg_name TEXT UNIQUE NOT NULL,
        pkg_name TEXT NOT NULL,
        app_id BIGINT,
        display_name TEXT NOT NULL,
        game_type INTEGER NOT NULL,
        parent_cate_id INTEGER NOT NULL,
        cate_id_new INTEGER,
        cate_name_new TEXT,
        tag_id TEXT,
        tag_name TEXT,
        game_tag_id TEXT,
        game_tag_name TEXT,
        launcher_path TEXT,
        launcher_param TEXT,
        can_remove INTEGER NOT NULL,
        state INTEGER NOT NULL,
        status INTEGER NOT NULL,
        check_level INTEGER NOT NULL,
        install_ts INTEGER NOT NULL,
        extra_data TEXT,
        update_time INTEGER,
        icon TEXT NOT NULL,
        config_icon TEXT NOT NULL,
        launcher_icon TEXT NOT NULL,
        bundle_version TEXT,
        scan_priority INTEGER DEFAULT 3,
        min_system_version TEXT,
        last_modified_ts INTEGER,
        display_icon TEXT,
        upload_type INTEGER DEFAULT 2,
        upload_key TEXT,
        support_platform TEXT DEFAULT 'macos',
        create_time INTEGER DEFAULT (strftime('%s', 'now')),
        reported INTEGER DEFAULT 0,
        install_source INTEGER DEFAULT 0
      );
    `);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_local_pkg_name ON ${DB_TABLE_NAME}(local_pkg_name);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_launcher_path ON ${DB_TABLE_NAME}(launcher_path);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_state ON ${DB_TABLE_NAME}(state);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_pkg_name ON ${DB_TABLE_NAME}(pkg_name);`);
    this.migrateAddColumn("reported", "INTEGER DEFAULT 0");
    this.migrateAddColumn("install_source", "INTEGER DEFAULT 0");
    this.flush();
    logger$O.info(`数据库已就绪: ${this.dbPath}`);
  }
  /**
   * 单条 upsert（INSERT OR UPDATE）
   *
   * @param row - 已整合的 DB 行数据（由 toDbRow 生成）
   * @returns 是否操作成功
   */
  upsert(row) {
    this.ensureDb();
    try {
      this.db.run(UPSERT_SQL, rowToParams(row));
      this.markDirtyAndFlush();
      return true;
    } catch (err) {
      logger$O.warn(`upsert 失败 (${row.local_pkg_name}): ${err.message}`);
      return false;
    }
  }
  /**
   * 批量 upsert（事务包裹，性能最优）
   *
   * sql.js 支持 BEGIN/COMMIT 手动事务，批量写入后一次性落盘
   *
   * @param rows - 已整合的 DB 行数据列表
   * @returns 成功写入的数量
   */
  upsertBatch(rows) {
    this.ensureDb();
    if (rows.length === 0) return 0;
    let successCount = 0;
    try {
      this.db.run("BEGIN TRANSACTION");
      for (const row of rows) {
        try {
          this.db.run(UPSERT_SQL, rowToParams(row));
          successCount += 1;
        } catch (err) {
          logger$O.warn(`批量 upsert 单条失败 (${row.local_pkg_name}): ${err.message}`);
        }
      }
      this.db.run("COMMIT");
      this.markDirtyAndFlush();
      logger$O.info(`批量 upsert 完成: ${successCount}/${rows.length}`);
    } catch (err) {
      try {
        this.db.run("ROLLBACK");
      } catch {
      }
      logger$O.error(`批量 upsert 事务失败: ${err.message}`);
    }
    return successCount;
  }
  /**
   * 根据路径软删除（state → UNINSTALLED）
   *
   * @param appPath - .app 目录绝对路径
   * @returns 是否有记录被更新
   */
  softDeleteByPath(appPath) {
    this.ensureDb();
    try {
      this.db.run(
        `UPDATE ${DB_TABLE_NAME} SET state = ?, update_time = strftime('%s', 'now') WHERE launcher_path = ?`,
        [AppInstallState.UNINSTALLED, appPath]
      );
      const changes = this.db.getRowsModified();
      if (changes > 0) this.markDirtyAndFlush();
      return changes > 0;
    } catch (err) {
      logger$O.warn(`softDeleteByPath 失败 (${appPath}): ${err.message}`);
      return false;
    }
  }
  /**
   * 根据 bundleId 软删除
   *
   * @param bundleId - CFBundleIdentifier
   * @returns 是否有记录被更新
   */
  softDeleteByBundleId(bundleId) {
    this.ensureDb();
    try {
      this.db.run(
        `UPDATE ${DB_TABLE_NAME} SET state = ?, update_time = strftime('%s', 'now') WHERE local_pkg_name = ?`,
        [AppInstallState.UNINSTALLED, bundleId]
      );
      const changes = this.db.getRowsModified();
      if (changes > 0) this.markDirtyAndFlush();
      return changes > 0;
    } catch (err) {
      logger$O.warn(`softDeleteByBundleId 失败 (${bundleId}): ${err.message}`);
      return false;
    }
  }
  /**
   * 根据 bundleId 查询
   *
   * @param bundleId - CFBundleIdentifier
   * @returns 应用信息，不存在返回 null
   */
  queryByBundleId(bundleId) {
    this.ensureDb();
    try {
      const result = this.db.exec(
        `SELECT * FROM ${DB_TABLE_NAME} WHERE local_pkg_name = ?`,
        [bundleId]
      );
      const rows = this.resultToRows(result);
      return rows.length > 0 ? fromDbRow(rows[0]) : null;
    } catch (err) {
      logger$O.warn(`queryByBundleId 失败 (${bundleId}): ${err.message}`);
      return null;
    }
  }
  /**
   * 根据路径查询
   *
   * @param appPath - .app 目录绝对路径
   * @returns 应用信息，不存在返回 null
   */
  queryByPath(appPath) {
    this.ensureDb();
    try {
      const result = this.db.exec(
        `SELECT * FROM ${DB_TABLE_NAME} WHERE launcher_path = ?`,
        [appPath]
      );
      const rows = this.resultToRows(result);
      return rows.length > 0 ? fromDbRow(rows[0]) : null;
    } catch (err) {
      logger$O.warn(`queryByPath 失败 (${appPath}): ${err.message}`);
      return null;
    }
  }
  /**
   * 根据路径查询原始行数据（含 game_type 等后台字段）
   *
   * @param appPath - .app 目录绝对路径
   * @returns DB 原始行，不存在返回 null
   */
  queryRawByPath(appPath) {
    this.ensureDb();
    try {
      const result = this.db.exec(
        `SELECT * FROM ${DB_TABLE_NAME} WHERE launcher_path = ?`,
        [appPath]
      );
      const rows = this.resultToRows(result);
      return rows.length > 0 ? rows[0] : null;
    } catch (err) {
      logger$O.warn(`queryRawByPath 失败 (${appPath}): ${err.message}`);
      return null;
    }
  }
  /**
   * 查询所有应用原始行数据（不经过 fromDbRow 转换）
   *
   * 供 JSB GetAllAppInfo / GetAppInfoByPkgNames 等接口使用，
   * 保留后台字段（game_type、parent_cate_id、cate_id_new 等）以便做前端协议字段映射。
   *
   * @returns DB 原始行数组
   */
  queryAllRaw() {
    this.ensureDb();
    try {
      const result = this.db.exec(`SELECT * FROM ${DB_TABLE_NAME}`);
      return this.resultToRows(result);
    } catch (err) {
      logger$O.warn(`queryAllRaw 失败: ${err.message}`);
      return [];
    }
  }
  /**
   * 根据 local_pkg_name 列表批量查询原始行数据
   *
   * @param pkgNames - bundleId 列表
   * @returns DB 原始行数组（找不到的静默跳过）
   */
  queryByPkgNamesRaw(pkgNames) {
    this.ensureDb();
    if (pkgNames.length === 0) return [];
    try {
      const placeholders = pkgNames.map(() => "?").join(", ");
      const result = this.db.exec(
        `SELECT * FROM ${DB_TABLE_NAME} WHERE local_pkg_name IN (${placeholders})`,
        pkgNames
      );
      return this.resultToRows(result);
    } catch (err) {
      logger$O.warn(`queryByPkgNamesRaw 失败: ${err.message}`);
      return [];
    }
  }
  /**
   * 查询所有应用
   *
   * @param options - 查询选项（分页、状态过滤）
   * @returns 应用信息列表
   */
  queryAll(options) {
    this.ensureDb();
    try {
      let sql = `SELECT * FROM ${DB_TABLE_NAME}`;
      const params = [];
      if (options?.state !== void 0) {
        sql += " WHERE state = ?";
        params.push(options.state);
      }
      sql += " ORDER BY scan_priority ASC, display_name ASC";
      if (options?.limit !== void 0) {
        sql += " LIMIT ?";
        params.push(options.limit);
        if (options.offset !== void 0) {
          sql += " OFFSET ?";
          params.push(options.offset);
        }
      }
      const result = this.db.exec(sql, params);
      return this.resultToRows(result).map(fromDbRow);
    } catch (err) {
      logger$O.warn(`queryAll 失败: ${err.message}`);
      return [];
    }
  }
  /**
   * 查询数量
   *
   * @param state - 可选，按状态过滤
   * @returns 记录数量
   */
  queryCount(state2) {
    this.ensureDb();
    try {
      let sql = `SELECT COUNT(*) as count FROM ${DB_TABLE_NAME}`;
      const params = [];
      if (state2 !== void 0) {
        sql += " WHERE state = ?";
        params.push(state2);
      }
      const result = this.db.exec(sql, params);
      if (result.length > 0 && result[0].values.length > 0) {
        return result[0].values[0][0];
      }
      return 0;
    } catch (err) {
      logger$O.warn(`queryCount 失败: ${err.message}`);
      return 0;
    }
  }
  /**
   * 查询今日未上报且后台未匹配的已安装应用
   *
   * reported 字段存储上报日期（YYYYMMDD 整数），0 表示从未上报。
   * 条件：(reported = 0 OR reported < 今天日期) AND app_id IS NULL AND state = INSTALLED
   * 排除图标为空的应用（无法上报）
   *
   * @returns DB 原始行数组
   */
  queryUnreportedApps() {
    this.ensureDb();
    try {
      const today = getTodayDateInt();
      const result = this.db.exec(
        `SELECT * FROM ${DB_TABLE_NAME} WHERE (reported = 0 OR reported < ?) AND app_id IS NULL AND state = ? AND display_icon != ''`,
        [today, AppInstallState.INSTALLED]
      );
      return this.resultToRows(result);
    } catch (err) {
      logger$O.warn(`queryUnreportedApps 失败: ${err.message}`);
      return [];
    }
  }
  /**
   * 批量标记应用为今日已上报
   *
   * 将 reported 设为当天日期整数（YYYYMMDD），次日自动视为"需要再报"
   *
   * @param bundleIds - 已上报成功的 bundleId 列表
   * @returns 成功更新的数量
   */
  markAsReported(bundleIds) {
    this.ensureDb();
    if (bundleIds.length === 0) return 0;
    try {
      const today = getTodayDateInt();
      const placeholders = bundleIds.map(() => "?").join(", ");
      this.db.run(
        `UPDATE ${DB_TABLE_NAME} SET reported = ? WHERE local_pkg_name IN (${placeholders})`,
        [today, ...bundleIds]
      );
      const changes = this.db.getRowsModified();
      if (changes > 0) this.markDirtyAndFlush();
      logger$O.info(`标记已上报: ${changes}/${bundleIds.length} (date=${today})`);
      return changes;
    } catch (err) {
      logger$O.warn(`markAsReported 失败: ${err.message}`);
      return 0;
    }
  }
  /**
   * 对账清理：将 state=INSTALLED 但路径不在 validPaths 中的行标记为 UNINSTALLED
   *
   * 用于全量扫描后清理存量脏数据（如 fsevents 误入的嵌套 helper app）。
   * 不做硬删，保留历史记录。
   *
   * @param validPaths - 本次全量扫描发现的所有合法 .app 路径集合
   * @returns 被标记为 UNINSTALLED 的行数
   */
  markUninstalledExcept(validPaths) {
    this.ensureDb();
    try {
      const result = this.db.exec(
        `SELECT launcher_path FROM ${DB_TABLE_NAME} WHERE state = ?`,
        [AppInstallState.INSTALLED]
      );
      if (!result || result.length === 0 || result[0].values.length === 0) return 0;
      const toRemove = result[0].values.map((row) => row[0]).filter((p) => !validPaths.has(p));
      if (toRemove.length === 0) return 0;
      const placeholders = toRemove.map(() => "?").join(", ");
      this.db.run(
        `UPDATE ${DB_TABLE_NAME} SET state = ?, update_time = strftime('%s', 'now') WHERE launcher_path IN (${placeholders})`,
        [AppInstallState.UNINSTALLED, ...toRemove]
      );
      const changes = this.db.getRowsModified();
      if (changes > 0) this.markDirtyAndFlush();
      logger$O.info(`对账清理: ${changes} 个不在扫描结果中的应用已标记为 UNINSTALLED`);
      return changes;
    } catch (err) {
      logger$O.warn(`markUninstalledExcept 失败: ${err.message}`);
      return 0;
    }
  }
  /**
   * 关闭 DB 连接
   *
   * 关闭前如果有未落盘数据会先 flush
   */
  close() {
    try {
      if (this.db) {
        if (this.dirty) {
          this.flush();
        }
        this.db.close();
        this.db = null;
        logger$O.info("数据库连接已关闭");
      }
    } catch (err) {
      logger$O.warn(`关闭数据库失败: ${err.message}`);
    }
  }
  /**
   * 确保 DB 已初始化
   */
  ensureDb() {
    if (!this.db) {
      throw new Error("数据库未初始化，请先调用 ensureDbAndTable()");
    }
  }
  /**
   * 将内存中的数据库落盘到磁盘
   */
  flush() {
    if (!this.db) return;
    try {
      const data = this.db.export();
      writeFileSync(this.dbPath, Buffer.from(data));
      this.dirty = false;
    } catch (err) {
      logger$O.warn(`数据库落盘失败: ${err.message}`);
    }
  }
  /**
   * 标记脏数据并落盘
   */
  markDirtyAndFlush() {
    this.dirty = true;
    this.flush();
  }
  /**
   * 将 sql.js 查询结果转换为行对象数组
   */
  resultToRows(result) {
    if (!result || result.length === 0 || result[0].values.length === 0) return [];
    const { columns, values } = result[0];
    return values.map((row) => {
      const obj = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
  }
  /**
   * 迁移辅助：安全添加新列（已存在则忽略）
   *
   * @param columnName - 列名
   * @param columnDef - 列定义（如 "INTEGER DEFAULT 0"）
   */
  migrateAddColumn(columnName, columnDef) {
    try {
      this.db.run(`ALTER TABLE ${DB_TABLE_NAME} ADD COLUMN ${columnName} ${columnDef}`);
      logger$O.info(`迁移: 新增列 ${columnName}`);
    } catch (err) {
      const msg = err.message;
      if (!msg.includes("duplicate column")) {
        logger$O.warn(`迁移列 ${columnName} 失败: ${msg}`);
      }
    }
  }
}
const logger$N = getLogger(LOG_SCOPE);
class MacAppMonitor {
  callbacks;
  /** 每个 watcher 是 fsevents.watch 返回的 stop 函数 */
  stopFns = [];
  running = false;
  /**
   * @param callbacks - 事件回调
   */
  constructor(callbacks) {
    this.callbacks = callbacks;
  }
  /**
   * 启动 FSEvents 多目录监听
   *
   * 为 SCAN_PATHS 中每个存在的目录各创建一个 watcher 实例
   *
   * @returns 是否成功启动（至少一个目录监听成功即为 true）
   */
  start() {
    if (this.running) {
      logger$N.warn("监听器已在运行中，跳过重复启动");
      return true;
    }
    try {
      const fsevents = require2("fsevents");
      for (const rawPath of SCAN_PATHS) {
        const watchPath = expandHome(rawPath);
        if (!existsSync(watchPath)) {
          logger$N.info(`监听目录不存在，跳过: ${watchPath}`);
          continue;
        }
        const stop2 = fsevents.watch(watchPath, (path2, flags, id) => {
          this.handleEvent(path2, flags, id);
        });
        this.stopFns.push(stop2);
      }
      if (this.stopFns.length === 0) {
        logger$N.warn("没有可监听的目录");
        return false;
      }
      this.running = true;
      logger$N.info(`FSEvents 监听已启动: ${this.stopFns.length} 个目录`);
      return true;
    } catch (err) {
      logger$N.error(`FSEvents 监听启动失败: ${err.message}`);
      return false;
    }
  }
  /**
   * 停止所有 watcher
   */
  stop() {
    if (!this.running) return;
    for (const stopFn of this.stopFns) {
      try {
        void stopFn();
      } catch (err) {
        logger$N.warn(`停止 watcher 失败: ${err.message}`);
      }
    }
    this.stopFns = [];
    this.running = false;
    logger$N.info("FSEvents 监听已停止");
  }
  /**
   * 是否正在运行
   */
  isRunning() {
    return this.running;
  }
  /**
   * 处理 FSEvents 事件
   *
   * 仅关注以 .app 结尾的目录变更。
   * 对于 iOS 移植应用（Wrapper 结构），内部 Wrapper/*.app 的变更
   * 会被归因到外层 .app 路径，统一触发回调。
   *
   * @param path - 变更路径
   * @param flags - FSEvents 标志位
   * @param _id - 事件 ID（未使用）
   */
  handleEvent(path2, flags, _id) {
    if (!path2.endsWith(".app")) return;
    if (/\.app\/Contents\/(Applications|Helpers|XPCServices|PlugIns|Frameworks|Library\/LoginItems)\//.test(path2)) {
      return;
    }
    const FLAG_ITEM_CREATED = 256;
    const FLAG_ITEM_REMOVED = 512;
    const FLAG_ITEM_RENAMED = 2048;
    const FLAG_ITEM_MODIFIED = 4096;
    const FLAG_ITEM_IS_DIR = 131072;
    const isDir = (flags & FLAG_ITEM_IS_DIR) !== 0;
    if (!isDir) return;
    let resolvedPath = path2;
    const wrapperIdx = path2.indexOf("/Wrapper/");
    if (wrapperIdx !== -1) {
      const beforeWrapper = path2.substring(0, wrapperIdx);
      if (beforeWrapper.endsWith(".app")) {
        resolvedPath = beforeWrapper;
        logger$N.info(`[monitor] iOS 移植应用内部变更，归因到外层: ${path2} → ${resolvedPath}`);
      }
    }
    try {
      if ((flags & FLAG_ITEM_CREATED) !== 0) {
        logger$N.info(`[monitor] 应用新增: ${resolvedPath}`);
        this.callbacks.onCreated(resolvedPath);
      } else if ((flags & FLAG_ITEM_REMOVED) !== 0) {
        logger$N.info(`[monitor] 应用删除: ${resolvedPath}`);
        this.callbacks.onRemoved(resolvedPath);
      } else if ((flags & FLAG_ITEM_RENAMED) !== 0) {
        if (existsSync(resolvedPath)) {
          logger$N.info(`[monitor] 应用移入: ${resolvedPath}`);
          this.callbacks.onCreated(resolvedPath);
        } else {
          logger$N.info(`[monitor] 应用移出: ${resolvedPath}`);
          this.callbacks.onRemoved(resolvedPath);
        }
      } else if ((flags & FLAG_ITEM_MODIFIED) !== 0) {
        logger$N.info(`[monitor] 应用更新: ${resolvedPath}`);
        this.callbacks.onModified(resolvedPath);
      }
    } catch (err) {
      logger$N.warn(`[monitor] 处理事件失败 (${resolvedPath}): ${err.message}`);
    }
  }
}
const logger$M = getLogger(LOG_SCOPE);
function getRecallHost() {
  const dev = process.env.MARVIS_API_DEBUG_MODE === "1" || process.env.MARVIS_API_DEBUG_MODE === "true";
  return dev ? RECALL_HOST_DEV : RECALL_HOST_PROD;
}
function buildRequestBody(bundleIds, guid, qimei36) {
  return {
    condition: {
      bid: RECALL_BID,
      listS: {
        mac_bundle_id: {
          repStr: bundleIds
        }
      }
    },
    reqHead: {
      requestId: randomUUID(),
      cmd: RECALL_CMD,
      userInfo: {
        guid,
        qimei36
      },
      netInfo: {
        ipv4: ""
      }
    }
  };
}
function sleep$3(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function postOnce$2(url, headers, body) {
  const controller = new AbortController();
  const timer2 = setTimeout(() => controller.abort(), RECALL_REQUEST_TIMEOUT_MS);
  try {
    const res = await net.fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      bypassCustomProtocolHandlers: true
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text };
  } finally {
    clearTimeout(timer2);
  }
}
async function postWithRetry$2(url, body, guid) {
  let lastErr = null;
  for (let i = 0; i < RECALL_RETRY_COUNT; i++) {
    try {
      const timestamp = Date.now();
      const nonce = String(Math.floor(Math.random() * 1e4));
      const signature = computeSignature(body, timestamp, nonce, RECALL_ACCESS_KEY);
      const headers = {
        "Content-Type": "application/json",
        "Ual-Access-Businessid": RECALL_BUSINESS_ID,
        "Ual-Access-Timestamp": String(timestamp),
        "Ual-Access-Nonce": nonce,
        "Ual-Access-Signature": signature,
        "Ual-Access-Guid": guid,
        "Ual-Access-Requestid": `${guid}-${timestamp}`
      };
      logger$M.info(`POST ${url} attempt=${i + 1}/${RECALL_RETRY_COUNT}`);
      const resp = await postOnce$2(url, headers, body);
      if (!resp.ok) {
        logger$M.warn(`POST ${url} attempt=${i + 1} status=${resp.status}`);
        if (i < RECALL_RETRY_COUNT - 1) await sleep$3(RECALL_RETRY_INTERVAL_MS);
        continue;
      }
      const parsed = JSON.parse(resp.body);
      return parsed;
    } catch (err) {
      lastErr = err;
      logger$M.warn(`POST ${url} attempt=${i + 1} exception: ${lastErr.message}`);
      if (i < RECALL_RETRY_COUNT - 1) await sleep$3(RECALL_RETRY_INTERVAL_MS);
    }
  }
  if (lastErr) {
    logger$M.warn(`POST ${url} all ${RECALL_RETRY_COUNT} attempts failed: ${lastErr.message}`);
  }
  return null;
}
function extractItems(response) {
  const result = /* @__PURE__ */ new Map();
  if (response.ret !== 0) {
    logger$M.warn(`后台响应 ret=${response.ret} msg=${response.msg}`);
    return result;
  }
  for (const queue of response.queue) {
    if (queue.ret !== 0) {
      logger$M.warn(`后台 queue "${queue.name}" ret=${queue.ret} msg=${queue.msg}`);
      continue;
    }
    for (const item of queue.items) {
      const bundleId = item.fieldS?.mac_bundle_id;
      if (!bundleId) continue;
      result.set(bundleId, item);
    }
  }
  return result;
}
async function fetchAppInfoFromBackend(bundleIds) {
  const result = /* @__PURE__ */ new Map();
  if (bundleIds.length === 0) return result;
  let guid;
  let qimei36;
  try {
    guid = await getDeviceGuid();
    const qimeiSnap = getQimei();
    qimei36 = qimeiSnap.q36;
  } catch (err) {
    logger$M.warn(`获取鉴权信息失败，跳过后台请求: ${err.message}`);
    return result;
  }
  const url = getRecallHost() + RECALL_API_PATH;
  const batches = [];
  for (let i = 0; i < bundleIds.length; i += RECALL_BATCH_SIZE) {
    batches.push(bundleIds.slice(i, i + RECALL_BATCH_SIZE));
  }
  logger$M.info(`后台召回请求: 共 ${bundleIds.length} 个 bundleId，分 ${batches.length} 批`);
  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    try {
      const reqBody = buildRequestBody(batch, guid, qimei36);
      const bodyStr = JSON.stringify(reqBody);
      logger$M.info(`第 ${batchIdx + 1}/${batches.length} 批: ${batch.length} 个 bundleId`);
      const response = await postWithRetry$2(url, bodyStr, guid);
      if (!response) {
        logger$M.warn(`第 ${batchIdx + 1} 批请求失败，该批应用无后台数据`);
        continue;
      }
      const items = extractItems(response);
      for (const [key, value] of items) {
        result.set(key, value);
      }
      logger$M.info(`第 ${batchIdx + 1} 批完成: 匹配到 ${items.size} 个应用`);
    } catch (err) {
      logger$M.warn(`第 ${batchIdx + 1} 批异常: ${err.message}`);
    }
  }
  logger$M.info(`后台召回完成: 共匹配 ${result.size}/${bundleIds.length} 个应用`);
  return result;
}
const logger$L = getLogger(LOG_SCOPE);
function getReportHost() {
  const dev = process.env.MARVIS_API_DEBUG_MODE === "1" || process.env.MARVIS_API_DEBUG_MODE === "true";
  return dev ? REPORT_HOST_DEV : REPORT_HOST_PROD;
}
function iconToBase64(iconPath) {
  if (!iconPath) return "";
  try {
    const buffer = readFileSync$1(iconPath);
    return buffer.toString("base64");
  } catch (err) {
    logger$L.warn(`图标转 base64 失败 (${iconPath}): ${err.message}`);
    return "";
  }
}
function determineIsNative(supportPlatform, source) {
  if (source !== AppInstallSource.MAC_APP_STORE) {
    return 1;
  }
  if (supportPlatform.includes("iPhoneOS") || supportPlatform.includes("iPadOS")) {
    return 0;
  }
  return 1;
}
function toReportItem(row) {
  const iconBase64 = iconToBase64(row.display_icon);
  if (!iconBase64) return null;
  const source = row.install_source ?? AppInstallSource.OTHER;
  return {
    source,
    is_native: determineIsNative(row.support_platform, source),
    bundle_id: row.local_pkg_name,
    name: row.display_name,
    icon: iconBase64,
    min_mac_os: row.min_system_version ?? "",
    support_platform: row.support_platform ?? "macos",
    bundle_version: row.bundle_version ?? ""
  };
}
function sleep$2(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function postOnce$1(url, headers, body) {
  const controller = new AbortController();
  const timer2 = setTimeout(() => controller.abort(), REPORT_REQUEST_TIMEOUT_MS$1);
  try {
    const res = await net.fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      bypassCustomProtocolHandlers: true
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text };
  } finally {
    clearTimeout(timer2);
  }
}
async function postWithRetry$1(url, body, guid) {
  let lastErr = null;
  for (let i = 0; i < REPORT_RETRY_COUNT; i++) {
    try {
      const timestamp = Date.now();
      const nonce = String(Math.floor(Math.random() * 1e4));
      const signature = computeSignature(body, timestamp, nonce, RECALL_ACCESS_KEY);
      const headers = {
        "Content-Type": "application/json",
        "Ual-Access-Businessid": RECALL_BUSINESS_ID,
        "Ual-Access-Timestamp": String(timestamp),
        "Ual-Access-Nonce": nonce,
        "Ual-Access-Signature": signature,
        "Ual-Access-Guid": guid,
        "Ual-Access-Requestid": `${guid}-${timestamp}`
      };
      logger$L.info(`上报 POST ${url} attempt=${i + 1}/${REPORT_RETRY_COUNT}`);
      const resp = await postOnce$1(url, headers, body);
      if (!resp.ok) {
        logger$L.warn(`上报 POST attempt=${i + 1} status=${resp.status} body=${resp.body.slice(0, 500)}`);
        if (i < REPORT_RETRY_COUNT - 1) await sleep$2(REPORT_RETRY_INTERVAL_MS);
        continue;
      }
      const parsed = JSON.parse(resp.body);
      return parsed;
    } catch (err) {
      lastErr = err;
      logger$L.warn(`上报 POST attempt=${i + 1} exception: ${lastErr.message}`);
      if (i < REPORT_RETRY_COUNT - 1) await sleep$2(REPORT_RETRY_INTERVAL_MS);
    }
  }
  if (lastErr) {
    logger$L.warn(`上报 POST 所有 ${REPORT_RETRY_COUNT} 次重试失败: ${lastErr.message}`);
  }
  return null;
}
async function reportUnmatchedApps(rows) {
  const result = {
    total: rows.length,
    successBundleIds: [],
    failedBundleIds: []
  };
  if (rows.length === 0) return result;
  const itemsWithBundleId = [];
  for (const row of rows) {
    const item = toReportItem(row);
    if (item) {
      itemsWithBundleId.push({ item, bundleId: row.local_pkg_name });
    } else {
      result.total -= 1;
    }
  }
  if (itemsWithBundleId.length === 0) {
    logger$L.info("无可上报的应用（均缺少图标）");
    return result;
  }
  let guid;
  try {
    guid = await getDeviceGuid();
  } catch (err) {
    logger$L.warn(`获取 GUID 失败，跳过上报: ${err.message}`);
    result.failedBundleIds = itemsWithBundleId.map((x) => x.bundleId);
    return result;
  }
  const url = getReportHost() + REPORT_API_PATH;
  for (let i = 0; i < itemsWithBundleId.length; i += REPORT_BATCH_SIZE) {
    const batch = itemsWithBundleId.slice(i, i + REPORT_BATCH_SIZE);
    const batchItems = batch.map((x) => x.item);
    const batchBundleIds = batch.map((x) => x.bundleId);
    const batchIdx = Math.floor(i / REPORT_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(itemsWithBundleId.length / REPORT_BATCH_SIZE);
    try {
      const bodyStr = JSON.stringify({ apps: batchItems });
      logger$L.info(`上报第 ${batchIdx}/${totalBatches} 批: ${batch.length} 个应用, 请求体 ${(bodyStr.length / 1024).toFixed(1)}KB`);
      const response = await postWithRetry$1(url, bodyStr, guid);
      if (response && response.ret === 0) {
        result.successBundleIds.push(...batchBundleIds);
        logger$L.info(`第 ${batchIdx} 批上报成功`);
      } else {
        result.failedBundleIds.push(...batchBundleIds);
        logger$L.warn(`第 ${batchIdx} 批上报失败: ret=${response?.ret} msg=${response?.msg}`);
      }
    } catch (err) {
      result.failedBundleIds.push(...batchBundleIds);
      logger$L.warn(`第 ${batchIdx} 批上报异常: ${err.message}`);
    }
  }
  logger$L.info(`上报完成: 成功 ${result.successBundleIds.length}, 失败 ${result.failedBundleIds.length}`);
  return result;
}
const logger$K = getLogger(LOG_SCOPE);
function getDbDir() {
  return join(getModuleDataRoot(), DB_DIR_NAME);
}
function getDbPath() {
  return join(getDbDir(), DB_FILE_NAME);
}
class AppInfoCollectionManager {
  scanner;
  monitor = null;
  dao;
  isStarted = false;
  // ─── 增量事件去抖攒批 ───
  /** 待处理的增量事件队列（appPath → 事件类型） */
  pendingEvents = /* @__PURE__ */ new Map();
  /** 去抖定时器 */
  debounceTimer = null;
  /** 是否正在执行 flush（防止并发） */
  flushing = false;
  /** 安装/卸载状态变化事件监听器列表 */
  installStateListeners = [];
  /** 是否正在执行上报（防并发） */
  reporting = false;
  constructor() {
    this.scanner = new MacAppScanner();
    this.dao = new MacAppDAO(getDbPath());
  }
  /**
   * 启动管理器：建表 → 全量扫描 → 请求后台 → 整合 → 写库 → 启动监听 → 启动定时重扫
   */
  async start() {
    if (this.isStarted) {
      logger$K.warn("管理器已启动，跳过重复启动");
      return;
    }
    logger$K.info("管理器启动中...");
    await this.dao.ensureDbAndTable();
    await this.scanAll();
    this.startMonitor();
    this.isStarted = true;
    logger$K.info("管理器启动完成");
  }
  /**
   * 停止管理器：停止监听 → 清除定时器 → flush 待处理事件 → 关闭 DB
   */
  stop() {
    if (!this.isStarted) return;
    logger$K.info("管理器停止中...");
    if (this.monitor) {
      this.monitor.stop();
      this.monitor = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.pendingEvents.size > 0) {
      logger$K.info(`停止前 flush ${this.pendingEvents.size} 个待处理事件（不请求后台）`);
      this.flushPendingEventsSync();
    }
    this.dao.close();
    this.isStarted = false;
    logger$K.info("管理器已停止");
  }
  /**
   * 全量扫描 + 请求后台 + 整合 + 写入 DB
   *
   * @returns 扫描到的应用信息列表
   */
  async scanAll() {
    const apps = await this.scanner.scanAll();
    if (apps.length === 0) return apps;
    const bundleIds = apps.map((app2) => app2.bundleId);
    let backendMap = /* @__PURE__ */ new Map();
    try {
      backendMap = await fetchAppInfoFromBackend(bundleIds);
    } catch (err) {
      logger$K.warn(`后台召回请求失败，使用纯本地数据: ${err.message}`);
    }
    const rows = apps.map((app2) => toDbRow(app2, backendMap.get(app2.bundleId)));
    this.dao.upsertBatch(rows);
    const scannedPaths = new Set(apps.map((app2) => app2.appPath));
    this.dao.markUninstalledExcept(scannedPaths);
    this.notifyInstallStateChange({
      local_pkg_name: "",
      status: "update_all",
      app_type: "",
      install_from: ""
    });
    this.reportUnmatchedAppsAsync();
    return apps;
  }
  /**
   * 查询单个应用
   *
   * @param bundleId - CFBundleIdentifier
   * @returns 应用信息，不存在返回 null
   */
  getApp(bundleId) {
    return this.dao.queryByBundleId(bundleId);
  }
  /**
   * 查询应用列表
   *
   * @param options - 查询选项
   * @returns 应用信息列表
   */
  listApps(options) {
    return this.dao.queryAll(options);
  }
  /**
   * 订阅应用安装/卸载状态变化
   *
   * @param listener - 事件回调函数
   * @returns 取消订阅函数
   */
  onInstallStateChange(listener) {
    this.installStateListeners.push(listener);
    return () => {
      this.installStateListeners = this.installStateListeners.filter((l) => l !== listener);
    };
  }
  /**
   * 查询所有原始行（供 JSB 使用）
   *
   * @returns DB 原始行数组
   */
  listAppsRaw() {
    return this.dao.queryAllRaw();
  }
  /**
   * 按包名批量查询原始行（供 JSB 使用）
   *
   * @param pkgNames - bundleId 列表
   * @returns DB 原始行数组
   */
  getAppsByPkgNamesRaw(pkgNames) {
    return this.dao.queryByPkgNamesRaw(pkgNames);
  }
  /**
   * 通知所有安装状态监听器
   *
   * @param event - 安装/卸载状态变化事件
   */
  notifyInstallStateChange(event) {
    for (const listener of this.installStateListeners) {
      try {
        listener(event);
      } catch (err) {
        logger$K.warn(`安装状态通知回调异常: ${err.message}`);
      }
    }
  }
  /**
   * 启动增量监听
   */
  startMonitor() {
    this.monitor = new MacAppMonitor({
      onCreated: (appPath) => this.onAppCreated(appPath),
      onModified: (appPath) => this.onAppModified(appPath),
      onRemoved: (appPath) => this.onAppRemoved(appPath)
    });
    const started = this.monitor.start();
    if (!started) {
      logger$K.warn("FSEvents 监听启动失败，降级为仅定时重扫模式");
      this.monitor = null;
    }
  }
  /**
   * 新增应用事件回调（加入去抖队列）
   *
   * @param appPath - 新增应用的 .app 路径
   */
  onAppCreated(appPath) {
    this.enqueueEvent(appPath, "created");
  }
  /**
   * 更新应用事件回调（加入去抖队列）
   *
   * @param appPath - 更新的应用 .app 路径
   */
  onAppModified(appPath) {
    this.enqueueEvent(appPath, "modified");
  }
  /**
   * 删除应用事件回调（立即执行，不去抖）
   *
   * @param appPath - 被删除的应用 .app 路径
   */
  onAppRemoved(appPath) {
    const row = this.dao.queryRawByPath(appPath);
    const deleted = this.dao.softDeleteByPath(appPath);
    if (deleted) {
      logger$K.info(`应用已标记卸载: ${appPath}`);
      if (row) {
        this.notifyInstallStateChange({
          local_pkg_name: row.local_pkg_name,
          status: "uninstall",
          app_type: mapGameTypeToAppType(row.game_type),
          install_from: "unknown"
        });
      }
    }
  }
  // ─────────────────────────────────────────────────────────────
  // 增量事件去抖攒批
  // ─────────────────────────────────────────────────────────────
  /**
   * 将增量事件加入待处理队列，重置去抖定时器
   *
   * 同一 appPath 的重复事件会被去重（后到的覆盖先到的）。
   * 窗口期（INCREMENTAL_DEBOUNCE_MS = 2s）内无新事件后触发 flushPendingEvents()。
   */
  enqueueEvent(appPath, type) {
    this.pendingEvents.set(appPath, type);
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.flushPendingEvents().catch((err) => {
        logger$K.warn(`flush 待处理事件失败: ${err.message}`);
      });
    }, INCREMENTAL_DEBOUNCE_MS);
  }
  /**
   * 批量处理攒积的增量事件（异步）
   *
   * 1. 取出 pendingEvents 全部条目并清空队列
   * 2. 逐个 scanSingle → 过滤有效 MacAppInfo
   * 3. 收集 bundleIds → fetchAppInfoFromBackend（一次批量请求）
   * 4. 遍历整合 toDbRow(app, backend) → dao.upsertBatch(rows)
   */
  async flushPendingEvents() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const events = new Map(this.pendingEvents);
      this.pendingEvents.clear();
      if (events.size === 0) return;
      logger$K.info(`开始处理 ${events.size} 个攒积的增量事件`);
      const apps = [];
      for (const [appPath] of events) {
        try {
          const app2 = await this.scanner.scanSingle(appPath);
          if (app2) apps.push(app2);
        } catch (err) {
          logger$K.warn(`增量扫描失败 (${appPath}): ${err.message}`);
        }
      }
      if (apps.length === 0) {
        logger$K.info("增量事件处理完成: 无有效应用");
        return;
      }
      const bundleIds = apps.map((app2) => app2.bundleId);
      let backendMap = /* @__PURE__ */ new Map();
      try {
        backendMap = await fetchAppInfoFromBackend(bundleIds);
      } catch (err) {
        logger$K.warn(`增量后台召回失败，使用纯本地数据: ${err.message}`);
      }
      const rows = apps.map((app2) => toDbRow(app2, backendMap.get(app2.bundleId)));
      this.dao.upsertBatch(rows);
      for (const row of rows) {
        this.notifyInstallStateChange({
          local_pkg_name: row.local_pkg_name,
          status: "install",
          app_type: mapGameTypeToAppType(row.game_type),
          install_from: "unknown"
        });
      }
      this.reportUnmatchedAppsAsync();
      logger$K.info(`增量事件处理完成: ${apps.length} 个应用已入库`);
    } finally {
      this.flushing = false;
    }
  }
  /**
   * 同步 flush 待处理事件（仅用于 stop 时，不请求后台）
   */
  flushPendingEventsSync() {
    const events = new Map(this.pendingEvents);
    this.pendingEvents.clear();
    if (events.size === 0) return;
    for (const [appPath] of events) {
      try {
        logger$K.info(`停止时跳过未处理事件: ${appPath}（下次全量重扫补偿）`);
      } catch {
      }
    }
  }
  // ─────────────────────────────────────────────────────────────
  // 未匹配应用上报
  // ─────────────────────────────────────────────────────────────
  /**
   * 异步上报后台未匹配的应用（不阻塞主流程）
   *
   * 查询 DB 中 reported=0 且 app_id IS NULL 的应用，批量上报后标记为已上报
   */
  reportUnmatchedAppsAsync() {
    if (this.reporting) {
      logger$K.info("上报任务正在进行中，跳过");
      return;
    }
    this.doReportUnmatchedApps().catch((err) => {
      logger$K.warn(`上报未匹配应用失败: ${err.message}`);
    });
  }
  /**
   * 执行上报未匹配应用
   */
  async doReportUnmatchedApps() {
    this.reporting = true;
    try {
      const unreportedRows = this.dao.queryUnreportedApps();
      if (unreportedRows.length === 0) {
        logger$K.info("无需上报的未匹配应用");
        return;
      }
      logger$K.info(`发现 ${unreportedRows.length} 个未上报的未匹配应用，开始上报`);
      const result = await reportUnmatchedApps(unreportedRows);
      if (result.successBundleIds.length > 0) {
        this.dao.markAsReported(result.successBundleIds);
      }
    } finally {
      this.reporting = false;
    }
  }
}
let manager = null;
const pendingListeners = [];
const pendingDisposes = [];
async function startAppInfoCollection() {
  if (manager) {
    logger$K.warn("应用信息采集模块已启动，跳过");
    return;
  }
  manager = new AppInfoCollectionManager();
  if (pendingListeners.length > 0) {
    logger$K.info(`延迟绑定的 ${pendingListeners.length} 个监听器已 flush 到 manager`);
    for (let i = 0; i < pendingListeners.length; i++) {
      const realDispose = manager.onInstallStateChange(pendingListeners[i]);
      pendingDisposes[i].dispose = realDispose;
    }
    pendingListeners.length = 0;
    pendingDisposes.length = 0;
  }
  await manager.start();
}
function stopAppInfoCollection() {
  if (!manager) return;
  manager.stop();
  manager = null;
}
function onInstallStateChange(listener) {
  if (manager) {
    return manager.onInstallStateChange(listener);
  }
  const disposeHolder = { dispose: () => {
  } };
  pendingListeners.push(listener);
  pendingDisposes.push(disposeHolder);
  return () => {
    const idx = pendingListeners.indexOf(listener);
    if (idx !== -1) {
      pendingListeners.splice(idx, 1);
      pendingDisposes.splice(idx, 1);
      return;
    }
    disposeHolder.dispose();
  };
}
function listAppsRaw() {
  return manager?.listAppsRaw() ?? [];
}
function getAppsByPkgNamesRaw(pkgNames) {
  return manager?.getAppsByPkgNamesRaw(pkgNames) ?? [];
}
const JSB_CHANNEL_INVOKE = "jsb:invoke";
const JSB_CHANNEL_CONTENT_CHANGED = "jsb:content-changed";
const JsbCode = {
  /** 成功 */
  kSuccess: 0,
  /** 通用失败 */
  kError: -1,
  /** 超时 */
  kTimeout: -2,
  /** 用户取消 */
  kCancel: -3,
  /** 桥 object 不存在（前端会 reject） */
  kMethodObjectError: -10022,
  /** 桥 method 不存在（前端会 reject） */
  kMethodNameError: -10023,
  /** 桥调用参数异常（前端会 reject） */
  kMethodParamError: -10024,
  /** 通用参数错误 */
  kParameterError: -10001,
  /** 路径错误 */
  kPathError: -10002,
  /** KV 读取时 key 不存在（KVStorage.Read 专用，前端据此走默认偏好分支） */
  kKeyNotFound: -10003,
  /** 写入失败（KVStorage.Write / 其他持久化场景可复用） */
  kWriteFailed: -10004,
  /** 文件删除失败（对齐前端 ClientResponseCode.kFileDeleteError） */
  kFileDeleteError: -10025,
  /** 文件重命名失败（对齐前端 ClientResponseCode.kFileRenameError） */
  kFileRenameError: -10031
};
async function dispatchInvoke(ctx, payload, deps2) {
  const { registry: registry2, logger: logger2 } = deps2;
  const { methodName, callbackId, args } = payload;
  trace("jsb:in", `wc=${ctx.webContentsId} ${methodName} cid=${callbackId} argc=${args.length}`);
  const dotIdx = methodName.indexOf(".");
  if (dotIdx <= 0 || dotIdx === methodName.length - 1) {
    logger2.warn(`[dispatch] invalid methodName: ${methodName}`);
    trace("jsb:out", `cid=${callbackId} code=kMethodNameError reason=invalid-name`);
    ctx.emit(callbackId, JsbCode.kMethodNameError, "", `invalid methodName: ${methodName}`);
    return;
  }
  const moduleName = methodName.slice(0, dotIdx);
  const funcName = methodName.slice(dotIdx + 1);
  const handler = registry2.get(moduleName);
  if (!handler) {
    logger2.warn(`[dispatch] no module: ${moduleName} (cid=${callbackId})`);
    trace("jsb:out", `cid=${callbackId} code=kMethodObjectError reason=no-module:${moduleName}`);
    ctx.emit(
      callbackId,
      JsbCode.kMethodObjectError,
      "",
      `no jsbridge module: ${moduleName}`
    );
    return;
  }
  const fn = handler[funcName];
  if (typeof fn !== "function") {
    logger2.warn(`[dispatch] no method: ${methodName} (cid=${callbackId})`);
    trace("jsb:out", `cid=${callbackId} code=kMethodNameError reason=no-method:${methodName}`);
    ctx.emit(
      callbackId,
      JsbCode.kMethodNameError,
      "",
      `no jsbridge method: ${methodName}`
    );
    return;
  }
  logger2.debug(`[dispatch] → ${methodName} cid=${callbackId} argc=${args.length} wc=${ctx.webContentsId}`);
  try {
    const boundFn = fn.bind(handler);
    await Promise.resolve(boundFn(ctx, callbackId, ...args));
    trace("jsb:out", `cid=${callbackId} ${methodName} ok`);
  } catch (err) {
    const msg = err.message || String(err);
    logger2.error(`[dispatch] ${methodName} threw: ${msg}`);
    trace("jsb:out", `cid=${callbackId} ${methodName} THREW: ${msg}`);
    if (ctx.isAlive()) {
      ctx.emit(callbackId, JsbCode.kError, "", msg);
    }
  }
}
class JsbRegistry {
  handlers = /* @__PURE__ */ new Map();
  /**
   * 注册 handler
   *
   * @throws 同名 handler 重复注册时抛错（开发期硬失败，避免混乱）
   */
  register(handler) {
    if (this.handlers.has(handler.name)) {
      throw new Error(`[jsbridge] duplicate handler name: ${handler.name}`);
    }
    this.handlers.set(handler.name, handler);
  }
  get(name) {
    return this.handlers.get(name);
  }
  has(name) {
    return this.handlers.has(name);
  }
  /** 全量遍历（只读） */
  forEach(visitor) {
    for (const handler of this.handlers.values()) {
      visitor(handler);
    }
  }
  /**
   * 聚合所有 handler 的方法清单
   *
   * 返回格式与 Windows 的 `Window.GetApiList` 保持一致：
   * `[{module_name: "AiStarter", apis: ["OpenFile", ...]}, ...]`
   */
  snapshotApiList() {
    const list = [];
    for (const handler of this.handlers.values()) {
      list.push({
        module_name: handler.name,
        apis: handler.listMethods()
      });
    }
    return list;
  }
  /** webContents 销毁时，通知所有 handler 清理 cid 映射 */
  notifyWebContentsDestroyed(webContentsId) {
    for (const handler of this.handlers.values()) {
      try {
        handler.onWebContentsDestroyed?.(webContentsId);
      } catch {
      }
    }
  }
  /** 全量 dispose（应用退出时调用） */
  disposeAll() {
    for (const handler of this.handlers.values()) {
      try {
        handler.dispose?.();
      } catch {
      }
    }
    this.handlers.clear();
  }
}
const RESERVED_METHOD_NAMES = /* @__PURE__ */ new Set([
  "constructor",
  "name",
  "listMethods",
  "onWebContentsDestroyed",
  "dispose"
]);
class ListenerRegistry {
  entries = /* @__PURE__ */ new Map();
  add(ctx, callbackId) {
    this.entries.set(ctx.webContentsId, { webContentsId: ctx.webContentsId, callbackId, ctx });
  }
  removeByWebContents(webContentsId) {
    this.entries.delete(webContentsId);
  }
  clear() {
    this.entries.clear();
  }
  size() {
    return this.entries.size;
  }
  /** 返回所有仍然存活的 entry（webContents 已销毁的会被跳过） */
  aliveEntries() {
    const result = [];
    for (const entry of this.entries.values()) {
      if (entry.ctx.isAlive()) result.push(entry);
    }
    return result;
  }
}
class BaseHandler {
  /**
   * 列出本 handler 对外暴露的 jsb 方法名
   *
   * 默认实现：反射本实例原型链（只取**直接原型**，不递归父类），过滤：
   * - 非函数
   * - 以下划线开头（私有约定）
   * - 保留字（name / listMethods / onWebContentsDestroyed / dispose）
   */
  listMethods() {
    const proto = Object.getPrototypeOf(this);
    if (!proto) return [];
    const names = Object.getOwnPropertyNames(proto);
    const methods = [];
    for (const key of names) {
      if (RESERVED_METHOD_NAMES.has(key)) continue;
      if (key.startsWith("_")) continue;
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (!desc || typeof desc.value !== "function") continue;
      methods.push(key);
    }
    return methods;
  }
  /**
   * 辅助：反射获取指定方法（dispatcher 用不到，此处方便派生类自查）
   */
  _getMethod(methodName) {
    const fn = this[methodName];
    return typeof fn === "function" ? fn.bind(this) : void 0;
  }
}
const FALLBACK_BUILD_JSON = {
  channelId: "",
  version: "0.0.0",
  buildTime: "19700101000000",
  arch: process.arch === "arm64" ? "arm64" : "x64",
  components: []
};
function versionLessThan$1(a, b) {
  const parse2 = (s) => s.split(".").map((p) => parseInt(p, 10) || 0);
  const va = parse2(a);
  const vb = parse2(b);
  const maxLen = Math.max(va.length, vb.length);
  for (let i = 0; i < maxLen; i++) {
    const sa = va[i] ?? 0;
    const sb = vb[i] ?? 0;
    if (sa < sb) return true;
    if (sa > sb) return false;
  }
  return false;
}
const logger$J = getLogger("updater:build-info");
function loadBuildJson() {
  try {
    const buildJsonPath = getResourcePath("build.json");
    const raw = readFileSync$1(buildJsonPath, "utf-8");
    const data = JSON.parse(raw);
    if (!data.version || !Array.isArray(data.components)) {
      logger$J.warn("build.json 格式不完整，使用兜底值");
      return FALLBACK_BUILD_JSON;
    }
    logger$J.info(`loaded build.json: version=${data.version}, components=[${data.components.map((c) => `${c.name}:${c.version}`).join(", ")}]`);
    return data;
  } catch (err) {
    logger$J.warn(`build.json 加载失败（使用兜底值）: ${err.message}`);
    return FALLBACK_BUILD_JSON;
  }
}
function loadInstalledJson() {
  try {
    const installedPath = getInstalledJsonPath();
    if (!existsSync(installedPath)) {
      return null;
    }
    const raw = readFileSync$1(installedPath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    logger$J.warn(`installed.json 加载失败: ${err.message}`);
    return null;
  }
}
function resolveComponents(build, installed2) {
  return build.components.map((comp) => {
    const name = comp.name;
    const type = Number(comp.componentType) || 0;
    const buildVersion = comp.version || "0.0.0";
    const installedComp = installed2?.components?.find((c) => c.name === name);
    const installedVersion = installedComp?.version;
    if (installedVersion && installedVersion !== "0.0.0") {
      return { name, type, version: installedVersion, source: "installed" };
    }
    if (buildVersion && buildVersion !== "0.0.0") {
      return { name, type, version: buildVersion, source: "build" };
    }
    return { name, type, version: "0.0.0", source: "fallback" };
  });
}
function resolveComponentsForCheckUpdate(installed2) {
  return MANAGED_COMPONENTS.map(({ name, type }) => {
    const installedComp = installed2?.components?.find((c) => c.name === name);
    const installedVersion = installedComp?.version;
    if (installedVersion && installedVersion !== "0.0.0" && installedVersion !== "0.0.0.0") {
      return { name, type, version: installedVersion, source: "installed" };
    }
    return { name, type, version: DEFAULT_COMPONENT_VERSION, source: "fallback" };
  });
}
function willBootstrapUpgrade() {
  try {
    const build = loadBuildJson();
    const installed2 = loadInstalledJson();
    if (!installed2) return true;
    if (build.version && installed2.appVersion && versionLessThan$1(installed2.appVersion, build.version)) {
      logger$J.info(`willBootstrapUpgrade: 检测到主框架版本升级 (${installed2.appVersion} -> ${build.version})，判定为需放宽超时`);
      return true;
    }
    for (const comp of build.components) {
      if (comp.name === "Marvis") continue;
      const installedComp = installed2.components?.find((c) => c.name === comp.name);
      const installedVersion = installedComp?.version;
      if (!installedVersion || installedVersion === "0.0.0" || versionLessThan$1(installedVersion, comp.version)) {
        return true;
      }
    }
    return false;
  } catch (err) {
    logger$J.warn(`willBootstrapUpgrade 预判失败（降级返回 false）: ${err.message}`);
    return false;
  }
}
const STATUS_ONLINE = 1;
function mapIsGame(parentCateId) {
  return parentCateId === -2 ? 1 : 0;
}
function mapCategory(cateIdNew, gameTagId) {
  if (gameTagId && gameTagId.length > 0) return "entertainment";
  switch (cateIdNew) {
    case 20:
    case 21:
    case 22:
    case 14:
      return "office";
    case 12:
    case 15:
    case 13:
      return "entertainment";
    case 16:
      return "system";
    default:
      return "other";
  }
}
function extractUwpPath(extraData) {
  if (!extraData) return "";
  try {
    const parsed = JSON.parse(extraData);
    return typeof parsed.uwp_exe_path === "string" ? parsed.uwp_exe_path : "";
  } catch {
    return "";
  }
}
function toAppInfoItem(row) {
  return {
    local_pkg_name: row.local_pkg_name,
    pkg_name: row.pkg_name,
    appid: row.app_id ?? 0,
    display_name: row.display_name,
    app_type: mapGameTypeToAppType(row.game_type),
    is_game: mapIsGame(row.parent_cate_id),
    category: mapCategory(row.cate_id_new, row.game_tag_id),
    launcher_path: row.launcher_path ?? "",
    launcher_param: row.launcher_param ?? "",
    can_remove: row.can_remove === 1,
    install_ts: row.install_ts,
    config_icon: row.config_icon ?? "",
    launcher_icon: row.launcher_icon ?? "",
    uwp_path: extractUwpPath(row.extra_data)
  };
}
function filterForGetAllAppInfo(row) {
  if (!row.launcher_path || row.launcher_path.length === 0) return false;
  if (row.state !== AppInstallState.INSTALLED) return false;
  if ([1, 2, 3].includes(row.game_type) && row.status !== STATUS_ONLINE) return false;
  return true;
}
const DOC_PREVIEW_NAME$1 = "DocPreview";
let logger$I = null;
function log$5() {
  if (!logger$I) logger$I = getLogger("docpreview:resolver");
  return logger$I;
}
function resolveDocPreview() {
  let installed2;
  try {
    installed2 = loadInstalledJson();
  } catch (err) {
    log$5().warn(`resolveDocPreview: 读取 installed.json 失败: ${err.message}`);
    return null;
  }
  if (!installed2?.components?.length) {
    return null;
  }
  const comp = installed2.components.find((c) => c.name === DOC_PREVIEW_NAME$1);
  if (!comp) {
    return null;
  }
  const { version } = comp;
  if (!version || version === "0.0.0") {
    log$5().debug(`resolveDocPreview: version=${version}，视为未安装`);
    return null;
  }
  const installDir = join(getComponentsDir(), DOC_PREVIEW_NAME$1, "Versions", version);
  const dylibPath = join(installDir, DOC_PREVIEW_DYLIB_NAME);
  if (!existsSync(dylibPath)) {
    log$5().warn(`resolveDocPreview: dylib 不存在 path=${dylibPath}，视为未就绪`);
    return null;
  }
  return {
    path: dylibPath,
    version,
    installDir
  };
}
function isDocPreviewReady() {
  return resolveDocPreview() !== null;
}
const DOC_PREVIEW_NAMESPACE = "doc_preview";
const METHOD_ON_DOC_PREVIEW_READY = "onDocPreviewReady";
const state = {
  started: false,
  logger: null,
  pending: null,
  notified: false,
  unsubscribeConnect: null
};
const broadcastCallbacks = /* @__PURE__ */ new Set();
function log$4() {
  if (!state.logger) state.logger = getLogger("docpreview:notifier");
  return state.logger;
}
function startDocPreviewNotifier() {
  if (state.started) {
    log$4().warn("DocPreview notifier 已启动，跳过");
    return;
  }
  state.unsubscribeConnect = onConnect(() => {
    state.notified = false;
    if (state.pending) {
      log$4().info("onConnect: 检测到 pending DocPreview info，补发");
      doSend(state.pending, "onConnect");
    }
  });
  state.started = true;
  log$4().info("DocPreview notifier 已启动");
}
function stopDocPreviewNotifier() {
  if (!state.started) return;
  if (state.unsubscribeConnect) {
    try {
      state.unsubscribeConnect();
    } catch (err) {
      log$4().warn(`取消 onConnect 订阅异常: ${err.message}`);
    }
    state.unsubscribeConnect = null;
  }
  state.started = false;
  state.pending = null;
  state.notified = false;
  log$4().info("DocPreview notifier 已停止");
}
function notifyIfReady() {
  if (!state.started) {
    log$4().warn("notifyIfReady: notifier 未启动，跳过");
    return;
  }
  const info = resolveDocPreview();
  if (!info) {
    if (state.pending) {
      log$4().debug("notifyIfReady: DocPreview 未就绪，清空 pending");
      state.pending = null;
      state.notified = false;
    } else {
      log$4().debug("notifyIfReady: DocPreview 未就绪");
    }
    return;
  }
  if (state.pending && state.pending.path === info.path && state.pending.version === info.version && state.notified) {
    log$4().debug(`notifyIfReady: 已通知过相同 info (version=${info.version})，跳过`);
    return;
  }
  if (state.pending && state.pending.version !== info.version) {
    state.notified = false;
  }
  state.pending = info;
  if (!isConnected()) {
    log$4().info(`notifyIfReady: IPC 未连接，缓存 pending (version=${info.version})，等待 onConnect 补发`);
    return;
  }
  if (state.notified) {
    log$4().debug(`notifyIfReady: 本周期已通知过 (version=${info.version})`);
    return;
  }
  doSend(info, "notifyIfReady");
}
function doSend(info, trigger) {
  const params = {
    path: info.path,
    version: info.version,
    install_dir: info.installDir
  };
  const callbackId = `doc_preview_onDocPreviewReady_${Date.now()}_${Math.floor(Math.random() * 1e4)}`;
  const ok2 = sendMessage(
    DOC_PREVIEW_NAMESPACE,
    METHOD_ON_DOC_PREVIEW_READY,
    params,
    callbackId
  );
  if (ok2) {
    state.notified = true;
    log$4().info(`[${trigger}] onDocPreviewReady 已推送: version=${info.version} path=${info.path}`);
    for (const cb of broadcastCallbacks) {
      try {
        cb(info);
      } catch (err) {
        log$4().warn(`[${trigger}] broadcast callback 异常: ${err.message}`);
      }
    }
  } else {
    state.notified = false;
    log$4().warn(`[${trigger}] onDocPreviewReady 推送失败（IPC 未连接或写入失败），等待 onConnect 补发`);
  }
}
function onDocPreviewNotified(callback) {
  broadcastCallbacks.add(callback);
  return () => {
    broadcastCallbacks.delete(callback);
  };
}
const execAsync = promisify$1(exec);
const SHELL_INJECTION_CHARS = /[;&|`$(){}]/;
const OPEN_SYSPREFS_RE = /^open\s+"?(x-apple\.systempreferences:[^"]+)"?\s*$/i;
const BARE_SYSPREFS_RE = /^x-apple\.systempreferences:/i;
const OPEN_APP_RE = /^open\s+-a\s+"?([^"]+)"?\s*$/i;
const ALLOWED_SYSTEM_APPS = /* @__PURE__ */ new Set([
  "Activity Monitor",
  "Font Book",
  "Screenshot"
]);
const ALLOWED_SHELL_COMMANDS = /* @__PURE__ */ new Set([
  // 刷新 DNS 缓存：macOS 上 dscacheutil 不需 sudo 即可清空当前用户 DNS 缓存；
  // killall -HUP mDNSResponder 需要 root 权限，此处省略（大部分场景仅 flush 已够用）
  "sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder"
]);
function normalizeInputPath(raw) {
  if (typeof raw !== "string" || raw.length === 0) return raw;
  let path2 = raw.trim();
  if (/^file:\/\/\//i.test(path2)) {
    path2 = path2.replace(/^file:\/\/\//i, "");
  } else if (/^file:\/\//i.test(path2)) {
    path2 = path2.replace(/^file:\/\//i, "");
  }
  try {
    path2 = decodeURIComponent(path2);
  } catch {
  }
  if (process.platform === "win32") {
    path2 = path2.replace(/\//g, "\\");
  } else {
    path2 = path2.replace(/\\/g, "/");
  }
  return path2;
}
const PCYYB_OFFICIAL_BUSINESS_ID = "pcyyb_official";
const PCYYB_OFFICIAL_ACCESS_KEY = "z6AA@ZAm_Agw!8fHWG3XAPRQPesJR!n6";
const UAL_HOST = "https://yybadaccess.3g.qq.com";
const TOKEN_EXPIRE_AHEAD_MS = 30 * 1e3;
let pcyybTokenCache = null;
function getUalSignature(opt) {
  return createHash("md5").update(`${opt.body}${opt.timestamp}${opt.accessKey}${opt.nonce}`).digest("hex");
}
async function fetchPcyybTempTokenFromUal(logger2) {
  if (pcyybTokenCache && Date.now() < pcyybTokenCache.expireAt - TOKEN_EXPIRE_AHEAD_MS) {
    return pcyybTokenCache;
  }
  const host = UAL_HOST;
  const path2 = `/${PCYYB_OFFICIAL_BUSINESS_ID}/pcyyb_get_credential`;
  const timestamp = `${Date.now()}`;
  const nonce = `${Math.floor(Math.random() * 1e4)}`;
  const bodyStr = JSON.stringify({});
  const signature = getUalSignature({
    body: bodyStr,
    timestamp,
    accessKey: PCYYB_OFFICIAL_ACCESS_KEY,
    nonce
  });
  const requestId = `${Math.floor(Math.random() * 1e4)}`;
  const url = `${host}${path2}`;
  logger2.info(`fetchPcyybTempToken: PROD ${url}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ual-Access-Businessid": PCYYB_OFFICIAL_BUSINESS_ID,
      "Ual-Access-Timestamp": timestamp,
      "Ual-Access-Nonce": nonce,
      "Ual-Access-Signature": signature,
      "Ual-Access-Requestid": requestId
    },
    body: bodyStr
  });
  if (!res.ok) {
    const trpcErrMsg = res.headers.get("trpc-error-msg") || "";
    throw new Error(`UAL request failed: status=${res.status} trpc=${trpcErrMsg}`);
  }
  const json = await res.json();
  if (json.code !== 0) {
    throw new Error(`getToken failed: code=${json.code} msg=${json.msg}`);
  }
  pcyybTokenCache = {
    token: json.data.temp_token,
    expireAt: json.data.expire_time * 1e3
  };
  logger2.info(`fetchPcyybTempToken ok, expireAt=${new Date(pcyybTokenCache.expireAt).toISOString()}`);
  return pcyybTokenCache;
}
class AiStarterHandler extends BaseHandler {
  constructor(deps2) {
    super();
    this.deps = deps2;
    this.logger = getLogger("jsb:AiStarter");
    this.disposePortChange = deps2.onPortChange((info) => {
      if (info.name !== "gateway") return;
      this._broadcastGatewayToken(info);
    });
    this.disposeInstallStateChange = deps2.onInstallStateChange?.((event) => {
      this._broadcastAppInstallState(event);
    }) ?? (() => {
    });
    this.disposeDocPreviewNotified = onDocPreviewNotified((info) => {
      this._broadcastDocPreviewReady(info);
    });
  }
  deps;
  name = "AiStarter";
  logger;
  /** AddGatewayTokenListener 的 cid 登记（按 webContentsId 索引） */
  gatewayTokenListeners = new ListenerRegistry();
  /** AddAppInstallStateListener 的 cid 登记（按 webContentsId 索引） */
  appInstallStateListeners = new ListenerRegistry();
  /** AddDocPreviewReadyListener 的 cid 登记（按 webContentsId 索引） */
  docPreviewReadyListeners = new ListenerRegistry();
  /** port-registry 订阅取消函数（dispose 时调用） */
  disposePortChange;
  /** app-info-collection 安装状态订阅取消函数（dispose 时调用） */
  disposeInstallStateChange;
  /** DocPreview notifier 广播取消函数（dispose 时调用） */
  disposeDocPreviewNotified;
  /**
   * 打开文件（使用系统默认程序）
   *
   * - Windows 行为：`ShellExecute` 调默认关联程序
   * - Mac 行为：`shell.openPath(path)` 走 LaunchServices，效果一致
   *
   * 失败场景：
   *   - 路径为空 → kParameterError
   *   - 路径不存在 → kPathError
   *   - 打开失败（shell.openPath 返回非空字符串时表示错误） → kError
   */
  async OpenFile(ctx, callbackId, ...args) {
    const rawPath = args[0];
    if (typeof rawPath !== "string" || rawPath.length === 0) {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "path is required");
      return;
    }
    const path2 = normalizeInputPath(rawPath);
    if (path2 !== rawPath) {
      this.logger.info(`OpenFile: normalize path '${rawPath}' -> '${path2}'`);
    }
    try {
      await promises.access(path2);
    } catch {
      this.logger.warn(`OpenFile: path not exist: ${path2}`);
      ctx.emit(callbackId, JsbCode.kPathError, "", `path not exist: ${path2}`);
      return;
    }
    const errMsg = await shell.openPath(path2);
    if (errMsg) {
      this.logger.error(`OpenFile failed: ${errMsg}`);
      ctx.emit(callbackId, JsbCode.kError, "", errMsg);
      return;
    }
    this.logger.info(`OpenFile ok: ${path2}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "", "");
  }
  /**
   * 主动获取网关 token + port
   *
   * 数据结构对齐 Windows：`{"token": string, "port": number}`
   * 前端 `store/slices/gateway.ts::fetchGatewayToken` 会 `JSON.parse(res.data)` 解构。
   */
  async GetGatewayToken(ctx, callbackId) {
    const info = this.deps.getGatewayPortInfo();
    if (!info?.token) {
      this.logger.warn("GetGatewayToken: gateway not ready");
      ctx.emit(callbackId, JsbCode.kError, "", "gateway not ready");
      return;
    }
    const payload = JSON.stringify({ token: info.token, port: info.port });
    ctx.emit(callbackId, JsbCode.kSuccess, payload, "");
  }
  /**
   * 注册网关 token 监听
   *
   * - 注册后立即 emit 一次 ack（`code=0, data=''`）
   * - 如果 gateway 已就绪，紧接着推一帧数据（方便前端快速拿到首帧）
   * - 后续 gateway 端口/token 变更时自动推送
   *
   * 幂等：同一 webContents 重复注册会覆盖旧 cid。
   */
  async AddGatewayTokenListener(ctx, callbackId) {
    this.gatewayTokenListeners.add(ctx, callbackId);
    this.logger.info(`AddGatewayTokenListener: wc=${ctx.webContentsId} cid=${callbackId}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "", "");
    const info = this.deps.getGatewayPortInfo();
    if (info?.token) {
      const payload = JSON.stringify({ token: info.token, port: info.port });
      ctx.emit(callbackId, JsbCode.kSuccess, payload, "");
    }
  }
  /**
   * 注册 DocPreview 组件就绪监听
   *
   * - Mac 平台专用：修复首次安装首次启动时 bootstrap 异步解压导致
   *   installed.json 尚未写入、前端误判"预览组件未安装"的竞态问题。
   * - 注册后立即 ack（code=0, data=''）。
   * - 如果 DocPreview 已经就绪（bootstrap 已完成），立即推送一帧。
   * - 后续 bootstrap 完成或 Gateway 重连补发时自动推送。
   * - Windows 端此 JSBridge 方法不存在（mock 不注册），前端调用安全降级。
   *
   * 推送数据格式：`{"path": string, "version": string, "install_dir": string}`
   */
  async AddDocPreviewReadyListener(ctx, callbackId) {
    this.docPreviewReadyListeners.add(ctx, callbackId);
    this.logger.info(`AddDocPreviewReadyListener: wc=${ctx.webContentsId} cid=${callbackId}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "", "");
  }
  /**
   * 打开文件夹（或在 Finder 中定位文件）
   *
   * 行为对齐 Windows `ai_starter.cc:114`：
   *   - path 是目录：`shell.openPath(path)` — 打开该目录
   *   - path 是文件：`shell.showItemInFolder(path)` — 在 Finder 中定位并高亮父目录
   *
   * 失败场景：
   *   - path 为空或非字符串 → kParameterError
   *   - path 不存在 → kPathError
   *   - shell.openPath 失败 → kError（带错误详情）
   */
  async OpenFolder(ctx, callbackId, ...args) {
    const rawPath = args[0];
    if (typeof rawPath !== "string" || rawPath.length === 0) {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "path is required");
      return;
    }
    const path2 = normalizeInputPath(rawPath);
    if (path2 !== rawPath) {
      this.logger.info(`OpenFolder: normalize path '${rawPath}' -> '${path2}'`);
    }
    let stat2;
    try {
      stat2 = await promises.stat(path2);
    } catch {
      this.logger.warn(`OpenFolder: path not exist: ${path2}`);
      ctx.emit(callbackId, JsbCode.kPathError, "", `path not exist: ${path2}`);
      return;
    }
    if (stat2.isDirectory()) {
      const errMsg = await shell.openPath(path2);
      if (errMsg) {
        this.logger.error(`OpenFolder(dir) failed: ${errMsg}`);
        ctx.emit(callbackId, JsbCode.kError, "", errMsg);
        return;
      }
      this.logger.info(`OpenFolder(dir) ok: ${path2}`);
    } else {
      shell.showItemInFolder(path2);
      this.logger.info(`OpenFolder(showItemInFolder) ok: ${path2}`);
    }
    ctx.emit(callbackId, JsbCode.kSuccess, "", "");
  }
  /**
   * 刷新 cookie 存储到磁盘（M3.2）
   *
   * 对齐 Windows `ai_starter.cc` 的 `FlushCookieStore`：Qt WebEngine 调用
   * `webView->page()->profile()->cookieStore()->flushStore()`，作用是把内存中的 cookie
   * 立刻刷盘以防止进程意外退出时丢失。
   *
   * Mac/Electron 侧使用 `session.defaultSession.cookies.flushStore()` 对齐此语义。
   * 主要用于 `Logout` 链路后，保证过期/清除的 cookie 被及时持久化到 Cookie 文件。
   *
   * 无入参；成功与失败都通过 `ctx.emit` 回一次（失败走 kError，但前端调用方一般不关心返回值）。
   */
  async FlushCookieStore(ctx, callbackId) {
    try {
      await session.defaultSession.cookies.flushStore();
      this.logger.info("FlushCookieStore ok");
      ctx.emit(callbackId, JsbCode.kSuccess, "", "");
    } catch (err) {
      const msg = err.message;
      this.logger.warn(`FlushCookieStore failed: ${msg}`);
      ctx.emit(callbackId, JsbCode.kError, "", msg);
    }
  }
  /**
   * 显示系统原生文件/目录选择对话框
   *
   * 对齐 Windows `ai_starter.cc:943` 的 `ShowFileSelectDialog`：
   *   - 入参为 JSON 字符串，解析为 `FileSelectDialogParams`
   *   - 返回 `{cancelled: bool, items: FileItemInfo[]}`
   *   - 即便用户取消也返回 `code=0`、`cancelled=true`（不走 kError）
   *
   * Mac 行为细节：
   *   - `multi_select=false` 时用 `openFile`/`openDirectory` + 不带 `multiSelections`
   *   - `modal=true` 时传入主窗口作为 parent（sheet 样式），否则 parent=undefined
   *   - `filters` 只在 `mode=file` 时生效；`mode=folder` 时忽略
   */
  async ShowFileSelectDialog(ctx, callbackId, ...args) {
    const paramsJson = args[0];
    let params = {};
    if (typeof paramsJson === "string" && paramsJson.length > 0) {
      try {
        const parsed = JSON.parse(paramsJson);
        if (parsed && typeof parsed === "object") {
          params = parsed;
        }
      } catch (err) {
        this.logger.warn(`ShowFileSelectDialog: parse params failed: ${err.message}`);
        ctx.emit(
          callbackId,
          JsbCode.kParameterError,
          "",
          `parse params failed: ${err.message}`
        );
        return;
      }
    }
    const mode = params.mode === "folder" ? "folder" : "file";
    const multiSelect = params.multi_select !== false;
    const modal = params.modal !== false;
    const title = typeof params.title === "string" && params.title.length > 0 ? params.title : "选择";
    const properties = [];
    if (mode === "folder") {
      properties.push("openDirectory");
    } else {
      properties.push("openFile");
    }
    if (multiSelect) {
      properties.push("multiSelections");
    }
    if (mode === "file" && process.platform === "darwin") {
      properties.push("treatPackageAsDirectory");
    }
    const electronFilters = [];
    if (mode === "file" && Array.isArray(params.filters)) {
      for (const group of params.filters) {
        if (!Array.isArray(group) || group.length < 2) continue;
        const [name, ...exts] = group;
        if (typeof name !== "string") continue;
        const cleanExts = [];
        for (const e of exts) {
          if (typeof e !== "string" || e.length === 0) continue;
          cleanExts.push(e.startsWith(".") ? e.slice(1) : e);
        }
        if (cleanExts.length > 0) {
          electronFilters.push({ name, extensions: cleanExts });
        }
      }
    }
    const options = {
      title,
      properties
    };
    if (electronFilters.length > 0) options.filters = electronFilters;
    if (typeof params.initial_dir === "string" && params.initial_dir.length > 0) {
      options.defaultPath = params.initial_dir;
    }
    const parent = modal && this.deps.getMainWindow ? this.deps.getMainWindow() : null;
    let result;
    try {
      result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    } catch (err) {
      this.logger.error(`ShowFileSelectDialog failed: ${err.message}`);
      ctx.emit(callbackId, JsbCode.kError, "", err.message);
      return;
    }
    if (result.canceled || result.filePaths.length === 0) {
      this.logger.info("ShowFileSelectDialog: user cancelled");
      const payload2 = JSON.stringify({ cancelled: true, items: [] });
      ctx.emit(callbackId, JsbCode.kSuccess, payload2, "");
      return;
    }
    const items = [];
    for (const p of result.filePaths) {
      try {
        const item = await this._buildFileItemInfo(p);
        items.push(item);
      } catch (err) {
        const errMsg = err.message;
        this.logger.warn(`ShowFileSelectDialog: stat failed for ${p}: ${errMsg}`);
        items.push({
          path: p,
          name: basename(p),
          extension: extname(p),
          size: 0,
          is_directory: false,
          last_modified: 0,
          created_time: 0,
          is_readonly: false,
          is_hidden: basename(p).startsWith(".")
        });
      }
    }
    this.logger.info(`ShowFileSelectDialog ok: ${items.length} item(s) selected`);
    const payload = JSON.stringify({ cancelled: false, items });
    ctx.emit(callbackId, JsbCode.kSuccess, payload, "");
  }
  /**
   * 选择文件夹（简化的目录选择接口）
   *
   * 前端 Filter 组件（搜索页"自定义目录"）通过
   * `AiStarter.SelectFileFolder()` 调用此方法。
   *
   * 内部委托给 ShowFileSelectDialog，参数固定为 folder 模式、单选。
   * 返回 data 格式与前端 `selectFileFolder()` 期望一致：
   * `{"select_folder": string}`（选中路径）或空字符串（用户取消）。
   */
  async SelectFileFolder(ctx, callbackId) {
    const options = {
      properties: ["openDirectory"],
      title: "选择文件夹"
    };
    const parent = this.deps.getMainWindow ? this.deps.getMainWindow() : null;
    let result;
    try {
      result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    } catch (err) {
      this.logger.error(`SelectFileFolder failed: ${err.message}`);
      ctx.emit(callbackId, JsbCode.kError, "", err.message);
      return;
    }
    if (result.canceled || result.filePaths.length === 0) {
      this.logger.info("SelectFileFolder: user cancelled");
      ctx.emit(callbackId, JsbCode.kSuccess, "", "");
      return;
    }
    const selectedPath = result.filePaths[0];
    this.logger.info(`SelectFileFolder ok: ${selectedPath}`);
    const payload = JSON.stringify({ select_folder: selectedPath });
    ctx.emit(callbackId, JsbCode.kSuccess, payload, "");
  }
  // ============================================================
  //  [mock/伪实现] 对齐 Windows AiStarter 的剩余方法
  //
  //  详细背景见 `doc/jsbridge-mock-plan.md`。
  // ============================================================
  /**
   * 返回已安装组件列表
   *
   * 对齐 `androws/src/ai_starter/src/web_object/ai_starter.cc:490` `GetInstalledComponentList`。
   *
   * 数据结构（与 Windows C++ 完全一致）：
   *   `{"list":[{"type": number, "name": string, "version": string}, ...]}`
   *
   * Mac 侧数据源：`~/Library/Application Support/com.tencent.mac.marvis/installed.json`
   * （由 updater bootstrap/finalize 维护）。
   *   - installed.json 的 `componentType` 字段为字符串（如 "400"），需转为 number。
   *   - installed.json 缺失或读取失败时，返回 `{"list":[]}`（与 C++ 组件全未安装的行为一致）。
   *
   * 前端消费方（`ai-launcher/src/anticorruption/ComponentAdapter.ts`）使用
   * `jsonParseSafe<{list:[{name,type,version}]}>` 解析，字段命名与此处严格匹配。
   */
  async GetInstalledComponentList(ctx, callbackId) {
    const installed2 = loadInstalledJson();
    const list = [];
    if (installed2 && Array.isArray(installed2.components)) {
      for (const comp of installed2.components) {
        if (!comp || typeof comp.name !== "string" || comp.name.length === 0) continue;
        const type = Number(comp.componentType);
        list.push({
          type: Number.isFinite(type) ? type : 0,
          name: comp.name,
          version: typeof comp.version === "string" ? comp.version : ""
        });
      }
    } else {
      this.logger.warn("GetInstalledComponentList: installed.json 不存在或加载失败，返回空列表");
    }
    this.logger.info(`GetInstalledComponentList: ${list.length} component(s)`);
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ list }), "");
  }
  /**
   * 返回所有已安装应用信息（对齐 Windows AiStarter.GetAllAppInfo）
   *
   * 行过滤规则：
   *   1. launcher_path 非空
   *   2. state == INSTALLED (1003)
   *   3. APK/wxgame/wxapp (game_type 1/2/3) 需 status == kOnline
   *
   * 返回 data：AppInfoItem[] 的 JSON 字符串
   */
  async GetAllAppInfo(ctx, callbackId) {
    const rows = this.deps.listAppsRaw?.() ?? [];
    const items = rows.filter(filterForGetAllAppInfo).map(toAppInfoItem);
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(items), "");
  }
  /**
   * 根据包名列表查询应用信息（对齐 Windows AiStarter.GetAppInfoByPkgNames）
   *
   * 入参 JSON 字符串：`{"local_pkg_names": ["com.xxx.app", ...]}`
   * 返回 data：AppInfoItem[] 的 JSON 字符串（无行过滤）
   */
  async GetAppInfoByPkgNames(ctx, callbackId, ...args) {
    const raw = typeof args[0] === "string" ? args[0] : "";
    if (!raw) {
      ctx.emit(callbackId, JsbCode.kSuccess, "[]", "");
      return;
    }
    let pkgNames;
    try {
      const parsed = JSON.parse(raw);
      pkgNames = parsed.local_pkg_names ?? [];
    } catch (err) {
      ctx.emit(callbackId, JsbCode.kParameterError, "", `json parse error: ${err.message}`);
      return;
    }
    if (pkgNames.length === 0) {
      ctx.emit(callbackId, JsbCode.kSuccess, "[]", "");
      return;
    }
    const rows = this.deps.getAppsByPkgNamesRaw?.(pkgNames) ?? [];
    const items = rows.map(toAppInfoItem);
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(items), "");
  }
  /**
   * 注册应用安装/卸载事件监听（对齐 Windows AiStarter.AddAppInstallStateListener）
   *
   * 注册后立即 ack（code=0）。后续有应用安装/卸载时通过保存的 callbackId 推送事件。
   * 幂等：同一 webContents 重复注册会覆盖旧 cid。
   */
  async AddAppInstallStateListener(ctx, callbackId) {
    this.appInstallStateListeners.add(ctx, callbackId);
    this.logger.info(`AddAppInstallStateListener: wc=${ctx.webContentsId} cid=${callbackId}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "", "");
  }
  /**
   * [mock] 注册应用宝 SDK 下载进度监听
   *
   * 对齐 `ai_starter.cc:1335` `AddPcyybSdkInstallListener`。macOS 无 PC 应用宝 SDK。
   */
  async AddPcyybSdkInstallListener(ctx, callbackId) {
    this.logger.debug(`[mock] AddPcyybSdkInstallListener cid=${callbackId}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  /**
   * [mock] 注册"拉起来源"事件监听
   *
   * 对齐 `ai_starter.cc` `AddFromSourceListener`。macOS 暂未接入自定义协议唤起链路。
   */
  async AddFromSourceListener(ctx, callbackId) {
    this.logger.debug(`[mock] AddFromSourceListener cid=${callbackId}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  /**
   * [伪实现] 返回本次拉起来源
   *
   * 对齐 `ai_starter.cc:525` `GetFromSource`。macOS 无"从哪唤起"语义，首次启动/正常启动
   * 一律返回 `{from:"", session_id:""}`。
   */
  async GetFromSource(ctx, callbackId) {
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ from: "", session_id: "" }));
  }
  /**
   * 重启应用并应用更新
   *
   * 对齐 Windows `ai_starter.cc` 的 `RestartApp`。
   * 先 ack，再异步调用 deps.restartApp()（不 await）。
   * 状态机约束：仅 state=Prepared 或 Downloaded 时有效（由 deps 内部检查）。
   */
  async RestartApp(ctx, callbackId) {
    ctx.emit(callbackId, JsbCode.kSuccess, "");
    if (!this.deps.restartApp) {
      this.logger.warn("RestartApp: restartApp 未注入");
      return;
    }
    void this.deps.restartApp().catch((err) => {
      this.logger.error(`RestartApp: ${err.message}`);
    });
  }
  /**
   * 返回 Marvis 文件存储根目录
   *
   * 对齐 Windows C++ `ai_starter.cc` `GetMarvisHomeDir`。
   * 实际实现委托给 MarvisSettingsHandler（通过 deps 注入），
   * 因为 Mac 侧的设置持久化由 MarvisSettings 模块负责。
   */
  async GetMarvisHomeDir(ctx, callbackId) {
    if (this.deps.getMarvisHomeDir) {
      return this.deps.getMarvisHomeDir(ctx, callbackId);
    }
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  /**
   * 前端离线包增量更新（对齐 Windows `AiStarter.UpdateOfflinePage` 同名同语义）
   *
   * 入参 JSON 字符串：`{"url": string, "md5": string, "version": string}`
   *   - `version`：14 位时间戳字符串（YYYYMMDDHHmmss），必须严格大于 currentVersion
   *   - `md5`：下载产物的 md5（小写 hex）
   *   - `url`：离线包下载 URL（Mac 端约定后缀 .zip）
   *
   * 行为：主程序在后台串行执行"下载 → md5 → 解压 → 落盘 pending"。
   * 成功不会触发 reload；新版本会在下次客户端启动时由 bootstrap 晋升生效。
   *
   * 返回 data JSON：`{"code": number, "pendingVersion": string, "message": string}`
   * code 详见 `specs/004-mac-offline-pack-update/contracts/jsbridge-offline-pack.md`。
   */
  async UpdateOfflinePage(ctx, callbackId, ...args) {
    const rawJson = args[0];
    if (typeof rawJson !== "string" || rawJson.length === 0) {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "payload is required");
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch (err) {
      ctx.emit(callbackId, JsbCode.kParameterError, "", `invalid json: ${err.message}`);
      return;
    }
    try {
      const result = await handleUpdateOfflinePage(parsed);
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(result), "");
    } catch (err) {
      this.logger.error(`UpdateOfflinePage uncaught: ${err.message}`);
      ctx.emit(callbackId, JsbCode.kError, "", err.message);
    }
  }
  /**
   * 查询前端离线包当前状态（只读）
   *
   * 返回 data JSON：
   * `{"currentVersion","pendingVersion","baselineVersion","updating","lastError"}`
   *
   * 主要面向客服 / 诊断；前端可不调用。
   */
  async GetOfflinePackState(ctx, callbackId) {
    try {
      const state2 = await getOfflinePackState();
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(state2), "");
    } catch (err) {
      this.logger.error(`GetOfflinePackState: ${err.message}`);
      ctx.emit(callbackId, JsbCode.kError, "", err.message);
    }
  }
  /**
   * 启动指定路径的 macOS 应用（.app）
   *
   * 对齐前端协议：`AiStarter.LaunchMacApp(callback_id, path)`
   *
   * 行为：
   *   - 使用 `shell.openPath(path)` 启动应用（底层走 LaunchServices，等同双击）
   *
   * 失败场景：
   *   - path 为空或非字符串 → kParameterError
   *   - path 不存在 → kPathError
   *   - 打开失败（shell.openPath 返回非空错误信息） → kError
   */
  async LaunchMacApp(ctx, callbackId, ...args) {
    const rawPath = args[0];
    if (typeof rawPath !== "string" || rawPath.length === 0) {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "path is required");
      return;
    }
    const appPath = normalizeInputPath(rawPath);
    if (appPath !== rawPath) {
      this.logger.info(`LaunchMacApp: normalize path '${rawPath}' -> '${appPath}'`);
    }
    try {
      await promises.access(appPath);
    } catch {
      this.logger.warn(`LaunchMacApp: path not exist: ${appPath}`);
      ctx.emit(callbackId, JsbCode.kPathError, "", `path not exist: ${appPath}`);
      return;
    }
    try {
      await execAsync(`open "${appPath.replace(/"/g, '\\"')}"`, { timeout: 1e4 });
    } catch (err) {
      const msg = err.message;
      this.logger.error(`LaunchMacApp failed: ${msg}`);
      ctx.emit(callbackId, JsbCode.kError, "", msg);
      return;
    }
    this.logger.info(`LaunchMacApp ok: ${appPath}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "", "");
  }
  /**
   * 获取 PCYYB 临时 token（通过 UAL 签名请求）
   *
   * 对齐 yyb-official-web/lib/api/token.ts getToken() 的签名逻辑：
   *   - 请求 UAL 统一接入层 /pcyyb_official/pcyyb_get_credential
   *   - 请求头带 UAL 签名（businessid / timestamp / nonce / signature）
   *   - 内置 token 缓存 + 提前 30s 过期机制
   *
   * 返回 data JSON：`{"temp_token": string, "expire_time": number}`
   * - temp_token：临时凭证字符串
   * - expire_time：过期时间（秒级时间戳）
   */
  async GetPcyybTempToken(ctx, callbackId) {
    try {
      const tokenCache = await fetchPcyybTempTokenFromUal(this.logger);
      const payload = JSON.stringify({
        temp_token: tokenCache.token,
        expire_time: Math.floor(tokenCache.expireAt / 1e3),
        is_dev: 0
      });
      ctx.emit(callbackId, JsbCode.kSuccess, payload, "");
    } catch (err) {
      const msg = err.message;
      this.logger.error(`GetPcyybTempToken failed: ${msg}`);
      ctx.emit(callbackId, JsbCode.kError, "", msg);
    }
  }
  /**
   * 获取 macOS 剪贴板中的文件路径列表
   *
   * macOS 上用户在 Finder 中复制文件后，浏览器 `clipboardData.items` 不会暴露文件条目。
   * 此方法通过 Electron 的 `clipboard` API 读取 macOS `NSPasteboard` 中
   * `NSFilenamesPboardType`（XML plist 格式）或 `public.file-url` 格式的文件路径列表，
   * 并对每个路径执行 `fs.stat` 获取文件元信息，返回 `FileItemInfo[]`。
   *
   * 返回 data JSON：`{"items": FileItemInfo[]}`
   * - 剪贴板无文件时返回 `{"items": []}`
   * - 单个文件 stat 失败时跳过该条目（不阻断整体）
   */
  async GetClipboardFiles(ctx, callbackId) {
    if (process.platform !== "darwin") {
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ items: [] }), "");
      return;
    }
    let filePaths = [];
    try {
      const plistStr = clipboard.read("NSFilenamesPboardType");
      if (plistStr && plistStr.length > 0) {
        filePaths = this._parsePlistFilePaths(plistStr);
      }
      if (filePaths.length === 0) {
        const fileUrl = clipboard.read("public.file-url");
        if (fileUrl?.startsWith("file://")) {
          try {
            const decodedPath = decodeURIComponent(fileUrl.replace("file://", ""));
            filePaths = [decodedPath];
          } catch {
          }
        }
      }
    } catch (err) {
      this.logger.warn(`GetClipboardFiles: read clipboard failed: ${err.message}`);
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ items: [] }), "");
      return;
    }
    if (filePaths.length === 0) {
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ items: [] }), "");
      return;
    }
    const items = [];
    const results = await Promise.allSettled(filePaths.map((p) => this._buildFileItemInfo(p)));
    for (const result of results) {
      if (result.status === "fulfilled") {
        items.push(result.value);
      }
    }
    this.logger.info(`GetClipboardFiles: ${items.length} file(s) from clipboard`);
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ items }), "");
  }
  /**
   * 将 base64 编码的图片保存到本地临时目录
   *
   * 对齐 Windows C++ `ai_starter.cc` 的 `SaveImageToLocal`：
   *   - 入参 JSON 字符串：`{"base64_data": string, "file_name"?: string, "image_format"?: string}`
   *   - base64_data 可带 data URI 前缀（如 "data:image/png;base64,..."）
   *   - 返回 data JSON：FileItemInfo（snake_case 字段、extension 含点）
   *
   * 行为：
   *   1. 解析 base64 数据（去掉 data URI 前缀）
   *   2. 确定文件名（使用 file_name 参数或自动生成 UUID）
   *   3. 写入 os.tmpdir() 下的文件
   *   4. fs.stat 获取元信息，返回 FileItemInfo
   */
  async SaveImageToLocal(ctx, callbackId, ...args) {
    const rawJson = args[0];
    if (typeof rawJson !== "string" || rawJson.length === 0) {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "params is required");
      return;
    }
    let params;
    try {
      params = JSON.parse(rawJson);
    } catch (err) {
      ctx.emit(callbackId, JsbCode.kParameterError, "", `invalid json: ${err.message}`);
      return;
    }
    const { base64_data: base64Data, file_name: fileName, image_format: imageFormat } = params;
    if (!base64Data || typeof base64Data !== "string") {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "base64_data is required");
      return;
    }
    let rawBase64 = base64Data;
    let detectedFormat = imageFormat || "png";
    const dataUriMatch = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
    if (dataUriMatch) {
      [, detectedFormat] = dataUriMatch;
      [, , rawBase64] = dataUriMatch;
    }
    const ext = `.${detectedFormat === "jpeg" ? "jpg" : detectedFormat}`;
    const generatedName = `clipboard_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const resolvedFileName = fileName || generatedName;
    const finalFileName = resolvedFileName.includes(".") ? resolvedFileName : `${resolvedFileName}${ext}`;
    const tmpDir = join(os$1.tmpdir(), "marvis-clipboard");
    try {
      await promises.mkdir(tmpDir, { recursive: true });
    } catch {
    }
    const filePath = join(tmpDir, finalFileName);
    try {
      const buffer = Buffer.from(rawBase64, "base64");
      await promises.writeFile(filePath, buffer);
    } catch (err) {
      this.logger.error(`SaveImageToLocal: write file failed: ${err.message}`);
      ctx.emit(callbackId, JsbCode.kError, "", `write file failed: ${err.message}`);
      return;
    }
    try {
      const item = await this._buildFileItemInfo(filePath);
      this.logger.info(`SaveImageToLocal ok: ${filePath} (${item.size} bytes)`);
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(item), "");
    } catch (err) {
      this.logger.error(`SaveImageToLocal: stat failed: ${err.message}`);
      ctx.emit(callbackId, JsbCode.kError, "", `stat failed: ${err.message}`);
    }
  }
  /**
   * 窗口销毁时清理该 wc 的监听登记
   */
  onWebContentsDestroyed(webContentsId) {
    this.gatewayTokenListeners.removeByWebContents(webContentsId);
    this.appInstallStateListeners.removeByWebContents(webContentsId);
    this.docPreviewReadyListeners.removeByWebContents(webContentsId);
  }
  /**
   * 模块销毁时取消对 port-registry 和 app-info-collection 的订阅
   * 模块销毁时取消对 port-registry 和 notifier 的订阅
   */
  dispose() {
    this.disposePortChange();
    this.disposeInstallStateChange();
    this.disposeDocPreviewNotified();
    this.gatewayTokenListeners.clear();
    this.appInstallStateListeners.clear();
    this.docPreviewReadyListeners.clear();
  }
  /**
   * 打开系统废纸篓（macOS 专用）
   *
   * 行为：
   *   - macOS: 优先使用 AppleScript 激活 Finder 并打开废纸篓，失败时降级为 open 命令
   *   - 其他平台: 暂不支持，返回 kError
   *
   * 技术细节：
   *   - AppleScript 使用 `activate` 确保废纸篓窗口显示在最上层
   *   - 降级方案使用 `open` 命令（窗口可能不在最前）
   *
   * 失败场景：
   *   - AppleScript 和 open 命令均失败 → kError
   *   - 非 macOS 平台 → kError
   *
   * 无入参。
   */
  async OpenTrash(ctx, callbackId) {
    if (process.platform !== "darwin") {
      this.logger.warn("OpenTrash: not supported on non-macOS platform");
      ctx.emit(callbackId, JsbCode.kError, "", "not supported on this platform");
      return;
    }
    try {
      const { stderr } = await execAsync(`osascript -e 'tell application "Finder"' -e 'activate' -e 'open trash' -e 'end tell'`);
      if (stderr && stderr.trim().length > 0) {
        this.logger.warn(`OpenTrash: AppleScript stderr: ${stderr}, trying fallback`);
        await this._openTrashFallback(ctx, callbackId);
        return;
      }
      this.logger.info("OpenTrash ok (AppleScript)");
      ctx.emit(callbackId, JsbCode.kSuccess, "", "");
    } catch (err) {
      const msg = err.message;
      this.logger.warn(`OpenTrash: AppleScript failed (${msg}), trying fallback`);
      await this._openTrashFallback(ctx, callbackId);
    }
  }
  /**
   * 打开 macOS 系统设置面板或系统应用
   *
   * 前端调用：`CallBridge.invokeMethod('AiStarter.OpenSystemSetting', callbackId, command)`
   *
   * 支持三种入参格式（均为完整 open 命令）：
   *   1. `open "x-apple.systempreferences:..."` — 打开系统设置指定面板
   *   2. `open -a "AppName"` — 打开系统自带应用（白名单限制）
   *   3. 纯 URI `x-apple.systempreferences:...` — 向后兼容，自动补 open 前缀
   *
   * 示例：
   *   - `open "x-apple.systempreferences:com.apple.BluetoothSettings"` — 蓝牙设置
   *   - `open -a "Activity Monitor"` — 活动监视器
   *   - `open -a "Font Book"` — 字体册
   *
   * 安全策略：
   *   - systempreferences URI：仅允许 `x-apple.systempreferences:` 协议前缀
   *   - open -a：仅允许白名单内的系统应用名称
   *   - 所有输入均做 shell 元字符注入检测
   *
   * @param ctx - 发射上下文
   * @param callbackId - 回调 ID
   * @param args - args[0] 为 open 命令或系统设置 URI
   */
  async OpenSystemSetting(ctx, callbackId, ...args) {
    if (process.platform !== "darwin") {
      this.logger.warn("OpenSystemSetting: not supported on non-macOS platform");
      ctx.emit(callbackId, JsbCode.kError, "", "not supported on this platform");
      return;
    }
    const raw = args[0];
    if (typeof raw !== "string" || raw.length === 0) {
      this.logger.warn("OpenSystemSetting: 参数不合法");
      ctx.emit(callbackId, JsbCode.kError, "", "command is required");
      return;
    }
    const cmd = this.parseSystemSettingCommand(raw);
    if (!cmd) {
      this.logger.warn(`OpenSystemSetting: 不支持的命令 raw=${raw}`);
      ctx.emit(callbackId, JsbCode.kError, "", "unsupported command");
      return;
    }
    try {
      await execAsync(cmd, { timeout: 3e4 });
      this.logger.info(`OpenSystemSetting ok: ${cmd}`);
      ctx.emit(callbackId, JsbCode.kSuccess, "", "");
    } catch (err) {
      const msg = err.message;
      this.logger.error(`OpenSystemSetting failed: cmd=${cmd} error=${msg}`);
      ctx.emit(callbackId, JsbCode.kError, "", msg);
    }
  }
  /**
   * 解析并校验 OpenSystemSetting 的输入，返回安全的 shell 命令
   *
   * @param raw - 前端传入的原始字符串
   * @returns 安全的 shell 命令字符串，校验失败返回 null
   */
  parseSystemSettingCommand(raw) {
    if (ALLOWED_SHELL_COMMANDS.has(raw)) {
      if (raw.includes("sudo")) {
        const noSudo = raw.replace(/sudo\s+/g, "");
        const escaped = noSudo.replace(/"/g, '\\"');
        return `osascript -e 'do shell script "${escaped}" with administrator privileges'`;
      }
      return raw;
    }
    if (SHELL_INJECTION_CHARS.test(raw)) {
      this.logger.warn(`parseSystemSettingCommand: 含非法字符 raw=${raw}`);
      return null;
    }
    const sysPrefsMatch = raw.match(OPEN_SYSPREFS_RE);
    if (sysPrefsMatch) {
      const uri = sysPrefsMatch[1];
      return `open "${uri}"`;
    }
    const openAppMatch = raw.match(OPEN_APP_RE);
    if (openAppMatch) {
      const appName = openAppMatch[1];
      if (!ALLOWED_SYSTEM_APPS.has(appName)) {
        this.logger.warn(`parseSystemSettingCommand: 应用不在白名单 app=${appName}`);
        return null;
      }
      return `open -a "${appName}"`;
    }
    if (BARE_SYSPREFS_RE.test(raw)) {
      return `open "${raw}"`;
    }
    return null;
  }
  // ============================================================
  //  私有：事件触发时广播给所有 listener
  // ============================================================
  _broadcastGatewayToken(info) {
    if (!info.token) return;
    const payload = JSON.stringify({ token: info.token, port: info.port });
    for (const entry of this.gatewayTokenListeners.aliveEntries()) {
      entry.ctx.emit(entry.callbackId, JsbCode.kSuccess, payload, "");
    }
  }
  /**
   * 广播应用安装/卸载状态变化给所有已注册的 listener
   */
  _broadcastAppInstallState(event) {
    const payload = JSON.stringify(event);
    for (const entry of this.appInstallStateListeners.aliveEntries()) {
      entry.ctx.emit(entry.callbackId, JsbCode.kSuccess, payload, "");
    }
  }
  /**
   * 将 DocPreview 就绪事件广播到所有前端 listener
   */
  _broadcastDocPreviewReady(info) {
    const payload = JSON.stringify({ path: info.path, version: info.version, install_dir: info.installDir });
    for (const entry of this.docPreviewReadyListeners.aliveEntries()) {
      entry.ctx.emit(entry.callbackId, JsbCode.kSuccess, payload, "");
    }
    this.logger.info(`_broadcastDocPreviewReady: 已推送到 ${this.docPreviewReadyListeners.size()} 个 listener`);
  }
  /**
   * 降级方案：使用 open 命令打开废纸篓
   */
  async _openTrashFallback(ctx, callbackId) {
    try {
      const trashPath = join(os$1.homedir(), ".Trash");
      await execAsync(`open "${trashPath}"`);
      this.logger.info("OpenTrash ok (open fallback)");
      ctx.emit(callbackId, JsbCode.kSuccess, "", "");
    } catch (err) {
      const msg = err.message;
      this.logger.error(`OpenTrash: fallback also failed: ${msg}`);
      ctx.emit(callbackId, JsbCode.kError, "", `Failed to open trash: ${msg}`);
    }
  }
  /**
   * 解析 NSFilenamesPboardType 返回的 XML plist 格式字符串，提取文件路径数组
   *
   * macOS 剪贴板 `NSFilenamesPboardType` 返回格式示例：
   * ```xml
   * <?xml version="1.0" encoding="UTF-8"?>
   * <!DOCTYPE plist PUBLIC ...>
   * <plist version="1.0">
   * <array>
   *   <string>/Users/xxx/file1.txt</string>
   *   <string>/Users/xxx/file2.pdf</string>
   * </array>
   * </plist>
   * ```
   *
   * 使用正则提取 `<string>...</string>` 中的路径。
   */
  _parsePlistFilePaths(plistStr) {
    const paths = [];
    const regex = /<string>(.*?)<\/string>/g;
    let match;
    while ((match = regex.exec(plistStr)) !== null) {
      const path2 = match[1].trim();
      if (path2.length > 0) {
        paths.push(path2);
      }
    }
    return paths;
  }
  /**
   * 构造 FileItemInfo（对齐 Windows C++ 的 snake_case 字段约定）
   *
   * `extension` 含点前缀（如 `.txt`），目录返回空串。
   * `is_readonly` 在 macOS 通过 mode 位 `0o200`（owner write）取反判断。
   * `is_hidden` 简化用文件名是否以 `.` 开头判断（不读 chflags UF_HIDDEN）。
   */
  async _buildFileItemInfo(path2) {
    const stat2 = await promises.stat(path2);
    const name = basename(path2);
    const isDir = stat2.isDirectory();
    return {
      path: path2,
      name,
      extension: isDir ? "" : extname(path2),
      size: isDir ? 0 : stat2.size,
      is_directory: isDir,
      last_modified: Math.floor(stat2.mtimeMs),
      created_time: Math.floor(stat2.birthtimeMs),
      is_readonly: (stat2.mode & 128) === 0,
      is_hidden: name.startsWith(".")
    };
  }
}
const POS_THROTTLE_MS = 100;
const ALLOWED_EXTERNAL_PROTOCOLS = /^(?:https?|macappstore|itms-apps|mailto):/i;
class WindowHandler extends BaseHandler {
  constructor(deps2) {
    super();
    this.deps = deps2;
    this.logger = getLogger("jsb:window");
  }
  deps;
  name = "window";
  logger;
  /** AddPosToScreenListener 的 cid 登记 */
  posListeners = new ListenerRegistry();
  /** AddWindowStateListener 的 cid 登记 */
  windowStateListeners = new ListenerRegistry();
  /** 窗口事件是否已绑定（仅绑定一次） */
  windowEventsBound = false;
  /** 当前全屏状态（用于 macOS 全屏检测） */
  isFullScreen = false;
  /** 节流状态 */
  posThrottleTimer = null;
  posThrottleLastEmitAt = 0;
  // ============================================================
  //  方法类接口
  // ============================================================
  /**
   * 最小化主窗口
   */
  async Minimize(ctx, callbackId) {
    const win = this.deps.getMainWindow();
    if (!win || win.isDestroyed()) {
      ctx.emit(callbackId, JsbCode.kError, "", "main window not available");
      return;
    }
    win.minimize();
    this.logger.info("Minimize");
    ctx.emit(callbackId, JsbCode.kSuccess, "", "");
  }
  /**
   * 关闭主窗口
   *
   * 走现有 `window` 模块的 close 逻辑 —— 在 Mac 上表现为"隐藏到托盘 / Dock"，
   * 而不是真正销毁窗口。这与 Windows 客户端行为一致。
   */
  async Close(ctx, callbackId) {
    const win = this.deps.getMainWindow();
    if (!win || win.isDestroyed()) {
      ctx.emit(callbackId, JsbCode.kError, "", "main window not available");
      return;
    }
    win.close();
    this.logger.info("Close");
    ctx.emit(callbackId, JsbCode.kSuccess, "", "");
  }
  /**
   * 关闭或隐藏窗口
   *
   * 前端在不同平台期望的语义不同：Windows 上有"最小化到托盘"的特殊处理，
   * Mac 上 close 本身就是隐藏，所以此处行为与 Close 一致。
   */
  async HideOrClose(ctx, callbackId) {
    const win = this.deps.getMainWindow();
    if (!win || win.isDestroyed()) {
      ctx.emit(callbackId, JsbCode.kError, "", "main window not available");
      return;
    }
    win.close();
    this.logger.info("HideOrClose");
    ctx.emit(callbackId, JsbCode.kSuccess, "", "");
  }
  /**
   * 获取窗口屏幕坐标 + 尺寸
   *
   * 返回 JSON：`{x, y, w, h}`（与前端 `IGeometry` 对齐）
   */
  async GeometryToScreen(ctx, callbackId) {
    const win = this.deps.getMainWindow();
    if (!win || win.isDestroyed()) {
      ctx.emit(callbackId, JsbCode.kError, "", "main window not available");
      return;
    }
    const bounds = win.getBounds();
    const payload = JSON.stringify({
      x: bounds.x,
      y: bounds.y,
      w: bounds.width,
      h: bounds.height
    });
    ctx.emit(callbackId, JsbCode.kSuccess, payload, "");
  }
  /**
   * 获取窗口最大化状态
   *
   * 对齐 Windows C++ `window.cc` 的 `GetWindowState`：
   *   - 返回 data 为 `JSON.stringify(number)`：`"1"` 最大化，`"0"` 非最大化
   *   - 前端 `WindowModule.GetWindowState()` 会 `JSON.parse(result.data)` 得到 number
   *   - 前端 `normalizeMaximized` 将 1 → true，0 → false
   *
   * macOS 特殊处理：
   *   - 仅全屏状态视为等效最大化，maximize / zoom 不视为最大化
   *   - 使用 `_isEffectivelyMaximized()` 判断全屏状态
   *
   * 窗口不可用时返回 `"0"`（非最大化），与前端 catch 降级行为一致。
   */
  async GetWindowState(ctx, callbackId) {
    const win = this.deps.getMainWindow();
    const isMaximized = win && !win.isDestroyed() && this._isEffectivelyMaximized(win);
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(isMaximized ? 1 : 0), "");
  }
  /**
   * 返回当前进程支持的 API 清单
   *
   * 前端 `ApiManager.initApiManager()` 启动时必调，用于决定 `checkHasApi(mod, fn)` 结果。
   * 返回格式对齐 Windows：`[{module_name, apis:[...]}, ...]`
   */
  async GetApiList(ctx, callbackId) {
    const list = this.deps.registry.snapshotApiList();
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(list), "");
  }
  /**
   * 返回当前 webContents 对应的窗口 ID
   *
   * 前端 `ApiManager.initializeApis()` 紧跟 GetApiList 之后会调 GetWebWindowId，
   * 用 data 设置 `window.__winId__`。M1 阶段简单返回 webContentsId 字符串形式即可。
   */
  async GetWebWindowId(ctx, callbackId) {
    ctx.emit(callbackId, JsbCode.kSuccess, String(ctx.webContentsId), "");
  }
  /**
   * 打开 URI Scheme 链接
   *
   * 前端调用：`CallBridge.invokeMethod('window.OpenScheme', callbackId, url)`
   *
   * 安全策略：仅允许白名单协议，拒绝 file:// / javascript: 等危险协议。
   * 当前白名单：http / https / macappstore / itms-apps / mailto
   *
   * @param ctx - 发射上下文
   * @param callbackId - 回调 ID
   * @param url - 要打开的 URI Scheme 链接
   */
  async OpenScheme(ctx, callbackId, url) {
    if (typeof url !== "string" || url.length === 0) {
      this.logger.warn("OpenScheme: url 参数不合法");
      ctx.emit(callbackId, JsbCode.kError, "", "invalid url");
      return;
    }
    if (!ALLOWED_EXTERNAL_PROTOCOLS.test(url)) {
      this.logger.warn(`OpenScheme: 不支持的协议 url=${url}`);
      ctx.emit(callbackId, JsbCode.kError, "", "unsupported protocol");
      return;
    }
    try {
      await shell.openExternal(url);
      this.logger.info(`OpenScheme: 已打开 ${url}`);
      ctx.emit(callbackId, JsbCode.kSuccess, "", "");
    } catch (err) {
      this.logger.error(`OpenScheme: 打开失败 url=${url} error=${err.message}`);
      ctx.emit(callbackId, JsbCode.kError, "", err.message);
    }
  }
  // ============================================================
  //  监听类接口
  // ============================================================
  /**
   * 注册窗口位置 / 尺寸变化监听
   *
   * 行为：
   *   - 注册后立即 ack（`code=0, data=''`）
   *   - 首次绑定窗口 `move`/`resize` 事件
   *   - 推送数据节流为 100ms 一次，对齐前端 `jsb-logger.ts` 的 THROTTLE_FUNCTIONS 配置
   *   - 推送数据格式同 GeometryToScreen：`{x, y, w, h}`
   */
  async AddPosToScreenListener(ctx, callbackId) {
    this.posListeners.add(ctx, callbackId);
    this.logger.info(`AddPosToScreenListener: wc=${ctx.webContentsId} cid=${callbackId}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "", "");
    this._ensureWindowEventsBound();
    const win = this.deps.getMainWindow();
    if (win && !win.isDestroyed()) {
      const b = win.getBounds();
      ctx.emit(
        callbackId,
        JsbCode.kSuccess,
        JSON.stringify({ x: b.x, y: b.y, w: b.width, h: b.height }),
        ""
      );
    }
  }
  /**
   * 注册窗口最大化 / 恢复状态变化监听
   *
   * 对齐 Windows C++ `window.cc` 的 `AddWindowStateListener`：
   *   - 注册后立即 ack（`code=0, data=''`）
   *   - 紧接着推一帧当前状态（`"1"` 或 `"0"`）
   *   - 全屏进入/退出时推送状态变化
   *   - 前端 `normalizeMaximized` 将 1/0 归一化为 boolean
   *
   * macOS 增强：
   *   - 监听 enter-full-screen / leave-full-screen 事件
   *   - 仅全屏状态视为等效最大化，maximize / zoom 不视为最大化
   */
  async AddWindowStateListener(ctx, callbackId) {
    this.windowStateListeners.add(ctx, callbackId);
    this.logger.info(`AddWindowStateListener: wc=${ctx.webContentsId} cid=${callbackId}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "", "");
    this._ensureWindowEventsBound();
    const win = this.deps.getMainWindow();
    const isMaximized = win && !win.isDestroyed() && this._isEffectivelyMaximized(win);
    const maximized = isMaximized ? 1 : 0;
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(maximized), "");
  }
  // ============================================================
  //  生命周期钩子
  // ============================================================
  onWebContentsDestroyed(webContentsId) {
    this.posListeners.removeByWebContents(webContentsId);
    this.windowStateListeners.removeByWebContents(webContentsId);
  }
  dispose() {
    if (this.posThrottleTimer) {
      clearTimeout(this.posThrottleTimer);
      this.posThrottleTimer = null;
    }
    this.posThrottleLastEmitAt = 0;
    this.posListeners.clear();
    this.windowStateListeners.clear();
    this.windowEventsBound = false;
    this.isFullScreen = false;
  }
  // ============================================================
  //  私有辅助
  // ============================================================
  /**
   * 首次调用时绑定窗口 move / resize / full-screen 事件；再次调用幂等。
   *
   * 窗口事件触发：
   *   - move / resize → 走节流器 → 广播给 posListeners
   *   - enter-full-screen / leave-full-screen → 广播给 windowStateListeners
   */
  _ensureWindowEventsBound() {
    if (this.windowEventsBound) return;
    const win = this.deps.getMainWindow();
    if (!win || win.isDestroyed()) return;
    const scheduleEmit = () => this._scheduleBroadcast();
    win.on("move", scheduleEmit);
    win.on("resize", scheduleEmit);
    win.on("enter-full-screen", () => {
      this.isFullScreen = true;
      this._broadcastWindowState(true);
    });
    win.on("leave-full-screen", () => {
      this.isFullScreen = false;
      this._broadcastWindowState(false);
    });
    win.once("closed", () => {
      this.windowEventsBound = false;
      this.isFullScreen = false;
    });
    this.windowEventsBound = true;
  }
  /**
   * 节流广播：首次立即发、之后每 100ms 最多一次
   */
  _scheduleBroadcast() {
    const now = Date.now();
    const elapsed = now - this.posThrottleLastEmitAt;
    if (elapsed >= POS_THROTTLE_MS) {
      this._broadcastPosNow();
      return;
    }
    if (this.posThrottleTimer) return;
    this.posThrottleTimer = setTimeout(() => {
      this.posThrottleTimer = null;
      this._broadcastPosNow();
    }, POS_THROTTLE_MS - elapsed);
  }
  _broadcastPosNow() {
    this.posThrottleLastEmitAt = Date.now();
    const win = this.deps.getMainWindow();
    if (!win || win.isDestroyed()) return;
    const b = win.getBounds();
    const payload = JSON.stringify({ x: b.x, y: b.y, w: b.width, h: b.height });
    for (const entry of this.posListeners.aliveEntries()) {
      entry.ctx.emit(entry.callbackId, JsbCode.kSuccess, payload, "");
    }
  }
  /**
   * 判断窗口是否处于等效最大化状态（即全屏）
   *
   * 按需求仅将全屏状态视为等效最大化，不检测 maximize / zoom 等路径。
   *
   * @param win - 浏览器窗口实例
   * @returns 是否等效最大化（全屏）
   */
  _isEffectivelyMaximized(win) {
    return win.isFullScreen() || this.isFullScreen;
  }
  /**
   * 广播窗口最大化状态给所有存活的 windowStateListeners
   */
  _broadcastWindowState(isMaximized) {
    const payload = JSON.stringify(isMaximized ? 1 : 0);
    for (const entry of this.windowStateListeners.aliveEntries()) {
      entry.ctx.emit(entry.callbackId, JsbCode.kSuccess, payload, "");
    }
  }
}
class FileHandler extends BaseHandler {
  name = "file";
  logger;
  constructor() {
    super();
    this.logger = getLogger("jsb:file");
  }
  /**
   * 判断文件/目录是否存在
   */
  async Exists(ctx, callbackId, ...args) {
    const filePath = args[0];
    if (typeof filePath !== "string" || filePath.length === 0) {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "filePath is required");
      return;
    }
    try {
      await promises.access(filePath);
      ctx.emit(callbackId, JsbCode.kSuccess, "", "");
    } catch {
      this.logger.debug(`Exists: not found: ${filePath}`);
      ctx.emit(callbackId, JsbCode.kPathError, "", `path not exist: ${filePath}`);
    }
  }
  /**
   * 批量获取文件元信息
   *
   * 入参：JSON 字符串数组（至少 1 个元素），例如 `'["/tmp/a.txt", "/var"]'`
   *
   * 错误场景：
   *   - 入参不是字符串 / 不是合法 JSON → `kParameterError`
   *   - JSON 解析后不是数组 / 空数组 → `kParameterError`
   *   - 数组含非字符串或空串元素 → `kParameterError`
   *
   * 逐条路径用 `fs.stat` 取元信息；单条失败不会中断整体，该条只保留
   * `path`/`name`/`extension`，其他字段填默认值。
   */
  async GetFileInfo(ctx, callbackId, ...args) {
    const pathsJson = args[0];
    if (typeof pathsJson !== "string" || pathsJson.length === 0) {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "pathsJson is required");
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(pathsJson);
    } catch (err) {
      const msg = `parse pathsJson failed: ${err.message}`;
      this.logger.warn(`GetFileInfo: ${msg}`);
      ctx.emit(callbackId, JsbCode.kParameterError, "", msg);
      return;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      ctx.emit(
        callbackId,
        JsbCode.kParameterError,
        "",
        "paths must be a non-empty array"
      );
      return;
    }
    const paths = [];
    for (const item of parsed) {
      if (typeof item !== "string" || item.length === 0) {
        ctx.emit(
          callbackId,
          JsbCode.kParameterError,
          "",
          "each path must be a non-empty string"
        );
        return;
      }
      paths.push(item);
    }
    const results = [];
    for (const p of paths) {
      const name = basename(p);
      const info = {
        path: p,
        name,
        extension: this._extensionWithoutDot(p),
        isDirectory: false,
        isHidden: name.startsWith("."),
        size: 0,
        lastModified: 0
      };
      try {
        const stat2 = await promises.stat(p);
        info.isDirectory = stat2.isDirectory();
        info.size = info.isDirectory ? 0 : stat2.size;
        info.lastModified = Math.floor(stat2.mtimeMs);
        if (info.isDirectory) info.extension = "";
      } catch (err) {
        this.logger.debug(`GetFileInfo: stat failed for ${p}: ${err.message}`);
      }
      results.push(info);
    }
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(results), "");
  }
  /**
   * 重命名文件或目录
   *
   * 入参：
   *   args[0] src  — 源绝对路径
   *   args[1] dest — 新文件名（**只能是基础名 + 扩展名，不含路径分隔符**）
   *
   * 返回：
   *   - 成功：{code: 0, data: "<真实新文件名>"}
   *   - 参数错：kParameterError
   *   - 源不存在：kPathError
   *   - 同名已存在 / fs.rename 失败：kFileRenameError
   */
  async RenameItem(ctx, callbackId, ...args) {
    const src = args[0];
    const dest = args[1];
    if (typeof src !== "string" || src.length === 0) {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "src is required");
      return;
    }
    if (typeof dest !== "string" || dest.length === 0) {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "dest is required");
      return;
    }
    if (/[/\\]/.test(dest) || dest.includes("\0")) {
      ctx.emit(
        callbackId,
        JsbCode.kParameterError,
        "",
        "dest must be a plain filename (no path separators)"
      );
      return;
    }
    if (/[<>:"|?*]/.test(dest)) {
      ctx.emit(
        callbackId,
        JsbCode.kParameterError,
        "",
        "dest contains illegal characters"
      );
      return;
    }
    try {
      await promises.access(src);
    } catch {
      this.logger.warn(`RenameItem: src not found: ${src}`);
      ctx.emit(callbackId, JsbCode.kPathError, "", `src not found: ${src}`);
      return;
    }
    const destPath = join(dirname(src), dest);
    if (src === destPath) {
      ctx.emit(callbackId, JsbCode.kSuccess, dest, "");
      return;
    }
    try {
      await promises.access(destPath);
      this.logger.warn(`RenameItem: dest already exists: ${destPath}`);
      ctx.emit(
        callbackId,
        JsbCode.kFileRenameError,
        "",
        `dest already exists: ${destPath}`
      );
      return;
    } catch {
    }
    try {
      await promises.rename(src, destPath);
      this.logger.info(`RenameItem ok: ${src} -> ${destPath}`);
      ctx.emit(callbackId, JsbCode.kSuccess, dest, "");
    } catch (err) {
      const msg = err.message;
      this.logger.error(`RenameItem failed: ${src} -> ${destPath}: ${msg}`);
      ctx.emit(callbackId, JsbCode.kFileRenameError, "", msg);
    }
  }
  /**
   * 删除文件/目录（移动到废纸篓）
   *
   * 入参：args[0] path — 目标绝对路径
   *
   * 返回：
   *   - 成功：{code: 0, data: ""}
   *   - path 非字符串/空串：kParameterError
   *   - path 不存在：kPathError
   *   - shell.trashItem 抛错：kFileDeleteError + errno message
   *
   * 语义说明：
   *   使用 Electron `shell.trashItem`（macOS 走 Cocoa / FileManager 的
   *   `trashItemAtURL`，效果等同 Finder 的 ⌘+Delete）。
   *   - **可恢复**（用户随时可从废纸篓取回），对齐 Windows C++ `File::DeleteItem`
   *     使用 `SHFileOperationW` 到回收站的语义；
   *   - 不使用 `fs.unlink`：物理删除不可恢复，不符合业务预期，且 menu.tsx 里
   *     的"删除"入口仅带确认弹窗，没有二次告警。
   */
  async DeleteItem(ctx, callbackId, ...args) {
    const path2 = args[0];
    if (typeof path2 !== "string" || path2.length === 0) {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "path is required");
      return;
    }
    try {
      await promises.access(path2);
    } catch {
      this.logger.warn(`DeleteItem: path not found: ${path2}`);
      ctx.emit(callbackId, JsbCode.kPathError, "", `path not found: ${path2}`);
      return;
    }
    try {
      await shell.trashItem(path2);
      this.logger.info(`DeleteItem ok (to trash): ${path2}`);
      ctx.emit(callbackId, JsbCode.kSuccess, "", "");
    } catch (err) {
      const msg = err.message;
      this.logger.error(`DeleteItem failed: ${path2}: ${msg}`);
      ctx.emit(callbackId, JsbCode.kFileDeleteError, "", msg);
    }
  }
  /**
   * Delete —— DeleteItem 的别名（兼容旧调用点 cleanUserSession.ts 里使用的
   * `File.Delete`）。行为与 `DeleteItem` 完全一致：移至废纸篓。
   */
  async Delete(ctx, callbackId, ...args) {
    await this.DeleteItem(ctx, callbackId, ...args);
  }
  /**
   * 提取扩展名（不含点）；无扩展名返回空串
   */
  _extensionWithoutDot(p) {
    const ext = extname(p);
    return ext.startsWith(".") ? ext.slice(1) : ext;
  }
}
const ALLOWED_LOGIN_TYPES = /* @__PURE__ */ new Set(["", "QC", "WX", "WXAPP", "Marvis"]);
class CLoginManagerHandler extends BaseHandler {
  name = "cloginManager";
  logger;
  deps;
  listeners = new ListenerRegistry();
  /** 订阅 LoginStore 事件的 unsubscribe 句柄 */
  unsubscribeStore = null;
  constructor(deps2) {
    super();
    this.deps = deps2;
    this.logger = getLogger("jsb:cloginManager");
    this.unsubscribeStore = this.deps.onEvent((ev) => this._fanoutEvent(ev));
  }
  // ─────────────────────────────────────────────────────────
  // JSBridge 方法
  // ─────────────────────────────────────────────────────────
  /**
   * 登录服务是否可用
   *
   * 前端调用 `IsEnable` 前会先通过 `ApiManager.checkHasApi` 判断；
   * 这里只要 handler 存在就返回 `{enable:true}`，让前端后续 Login 能走下去。
   */
  async IsEnable(ctx, callbackId) {
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ enable: true }), "");
  }
  /**
   * 登录
   *
   * 入参：`JSON.stringify({prefix: 'main'|'wxApp', userInfo: {...}})`
   *
   * 参数错误：
   *   - 非字符串 / 非合法 JSON → `kParameterError`
   *   - prefix 非法 → `kParameterError`
   *   - userInfo 非对象 / openId 缺失 → `kParameterError`
   *
   * 成功后返回完整的 `ClientUserInfo`（包含 main + wxApp 两个分区）。
   */
  async Login(ctx, callbackId, ...args) {
    const paramJson = args[0];
    if (typeof paramJson !== "string" || paramJson.length === 0) {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "paramJson is required");
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(paramJson);
    } catch (err) {
      const msg = `parse paramJson failed: ${err.message}`;
      this.logger.warn(`Login: ${msg}`);
      ctx.emit(callbackId, JsbCode.kParameterError, "", msg);
      return;
    }
    if (!parsed || typeof parsed !== "object") {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "paramJson must be an object");
      return;
    }
    const { prefix } = parsed;
    if (prefix !== "main" && prefix !== "wxApp") {
      ctx.emit(
        callbackId,
        JsbCode.kParameterError,
        "",
        `invalid prefix: ${String(prefix)}`
      );
      return;
    }
    const rawInfo = parsed.userInfo;
    if (!rawInfo || typeof rawInfo !== "object") {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "userInfo is required");
      return;
    }
    if (typeof rawInfo.openId !== "string" || rawInfo.openId.length === 0) {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "userInfo.openId is required");
      return;
    }
    const info = this._normalizeUserInfo(rawInfo);
    this.logger.info(`Login: prefix=${prefix} loginType=${info.loginType || "(empty)"} openId=${info.openId}`);
    const winId = String(ctx.webContentsId);
    let mergedInfo = info;
    if (this.deps.fetchUserInfoFromServer) {
      try {
        const res = await this.deps.fetchUserInfoFromServer(info);
        if (res.success && res.patch) {
          const { patch } = res;
          mergedInfo = {
            ...info,
            // 仅在后端返回非空时覆盖，空串/undefined 保留传入值（与 Windows 行为一致）
            nickName: patch.nickName && patch.nickName.length > 0 ? patch.nickName : info.nickName,
            headImg: patch.headImg && patch.headImg.length > 0 ? patch.headImg : info.headImg
          };
          this.logger.info(`Login: user profile fetched nickName=${mergedInfo.nickName ? "(set)" : "(empty)"} headImg=${mergedInfo.headImg ? "(set)" : "(empty)"}`);
        } else if (!res.success) {
          this.logger.warn("Login: fetchUserInfoFromServer failed, nickName/headImg not updated");
        }
      } catch (err) {
        this.logger.warn(`Login: fetchUserInfoFromServer threw ${err.message}`);
      }
    }
    this.deps.login(prefix, mergedInfo, winId);
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(this.deps.getUserInfo()), "");
  }
  /**
   * 登出
   *
   * 对齐 Windows `CLoginService::Logout`（`clogin_service.cc:533-568`）：
   *   1) 读取当前登录态（用于通知服务端）
   *   2) 若已登录，调 `CLoginBackend::MarvisLogout` 通知服务端吊销（无重试，失败仅 warn）
   *   3) `SaveUserInfo({})` 清本地
   *   4) `EmitLogout(winId, kLogoutReason_Mannel)` 广播登出事件
   *   5) 返回空 `ClientUserInfo`（与 Windows 一致）
   *
   * 兼容：`logoutFromServer` 未注入时跳过第 2 步（MVP 行为）。
   */
  async Logout(ctx, callbackId) {
    this.logger.info("Logout: requested");
    const currentMain = this.deps.getUserInfo().main;
    if (this.deps.logoutFromServer && currentMain?.openId && currentMain.loginType) {
      try {
        const res = await this.deps.logoutFromServer(currentMain);
        this.logger.info(`Logout: logoutFromServer ${res.success ? "ok" : "failed"}`);
      } catch (err) {
        this.logger.warn(`Logout: logoutFromServer threw ${err.message} — ignored, proceed to local logout`);
      }
    } else if (!this.deps.logoutFromServer) {
      this.logger.debug("Logout: logoutFromServer not injected, skip server revoke");
    } else {
      this.logger.debug("Logout: no active session, skip server revoke");
    }
    this.deps.logout("mannel");
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(this.deps.getUserInfo()), "");
  }
  /**
   * 获取当前登录态（不触发服务端校验）
   */
  async GetUserInfo(ctx, callbackId) {
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(this.deps.getUserInfo()), "");
  }
  /**
   * 获取当前登录态（Legacy 版：Windows 上会额外触发 checkLogin）
   *
   * TODO-1 已落地：若注入了 `checkLoginTick`，则先触发一次后端校验/刷新，
   * 等 tick 完成后再返回最新登录态；未注入时等价 `GetUserInfo`（兼容 MVP 行为）。
   */
  async GetUserInfoLegacy(ctx, callbackId) {
    if (this.deps.checkLoginTick) {
      try {
        await this.deps.checkLoginTick();
      } catch (err) {
        this.logger.warn(`GetUserInfoLegacy: checkLoginTick threw ${err.message}`);
      }
    }
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(this.deps.getUserInfo()), "");
  }
  /**
   * 打开独立 QQ OAuth 登录窗口（Mac Electron 专有）
   *
   * 入参：`JSON.stringify({authUrl: string})`
   * 成功：emit kSuccess + `JSON.stringify({code, state})`
   * 用户取消：emit kCancel
   * 其他失败：emit kError
   */
  async OpenQCLoginWindow(ctx, callbackId, ...args) {
    if (!this.deps.openQQLoginWindow) {
      this.logger.warn("OpenQCLoginWindow: openQQLoginWindow 未注入，当前平台不支持");
      ctx.emit(callbackId, JsbCode.kError, "", "OpenQCLoginWindow not supported on this platform");
      return;
    }
    const paramJson = args[0];
    if (typeof paramJson !== "string" || paramJson.length === 0) {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "paramJson is required");
      return;
    }
    let authUrl;
    try {
      const parsed = JSON.parse(paramJson);
      authUrl = parsed?.authUrl ?? "";
    } catch {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "invalid paramJson");
      return;
    }
    if (!authUrl) {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "authUrl is required");
      return;
    }
    try {
      this.logger.info(`OpenQCLoginWindow: 打开登录窗口 ${authUrl.slice(0, 60)}...`);
      const result = await this.deps.openQQLoginWindow(authUrl);
      this.logger.info(`OpenQCLoginWindow: 授权成功 code=${result.code.slice(0, 8)}...`);
      if (result.userInfo?.openId) {
        const rawInfo = result.userInfo;
        const winId = String(ctx.webContentsId);
        let mergedInfo = {
          loginType: rawInfo.loginType,
          openId: rawInfo.openId,
          accessToken: rawInfo.accessToken,
          refreshToken: rawInfo.refreshToken,
          nickName: rawInfo.nickName,
          headImg: rawInfo.headImg,
          scope: [],
          expireTime: rawInfo.expireTime
        };
        if (this.deps.fetchUserInfoFromServer && (!mergedInfo.nickName || !mergedInfo.headImg)) {
          try {
            const res = await this.deps.fetchUserInfoFromServer(mergedInfo);
            if (res.success && res.patch) {
              mergedInfo = {
                ...mergedInfo,
                nickName: res.patch.nickName && res.patch.nickName.length > 0 ? res.patch.nickName : mergedInfo.nickName,
                headImg: res.patch.headImg && res.patch.headImg.length > 0 ? res.patch.headImg : mergedInfo.headImg
              };
              this.logger.info(`OpenQCLoginWindow: user profile fetched nickName=${mergedInfo.nickName ? "(set)" : "(empty)"} headImg=${mergedInfo.headImg ? "(set)" : "(empty)"}`);
            }
          } catch (err) {
            this.logger.warn(`OpenQCLoginWindow: fetchUserInfoFromServer threw ${err.message}`);
          }
        }
        if (this.deps.checkLoginFromServer && mergedInfo.expireTime === void 0) {
          try {
            const res = await this.deps.checkLoginFromServer(mergedInfo);
            if (res.success && res.patch) {
              const { patch } = res;
              mergedInfo = {
                ...mergedInfo,
                // 仅在后端返回有效值时覆盖，保持"空值不污染"的语义（与 checker.applyPatch 对齐）
                accessToken: typeof patch.accessToken === "string" && patch.accessToken.length > 0 ? patch.accessToken : mergedInfo.accessToken,
                refreshToken: typeof patch.refreshToken === "string" && patch.refreshToken.length > 0 ? patch.refreshToken : mergedInfo.refreshToken,
                expireTime: typeof patch.expireTime === "number" && patch.expireTime > 0 ? patch.expireTime : mergedInfo.expireTime
              };
              this.logger.info(`OpenQCLoginWindow: check_login fetched expireTime=${mergedInfo.expireTime ?? "(none)"}`);
            } else if (!res.success) {
              this.logger.warn("OpenQCLoginWindow: checkLoginFromServer failed, expireTime 仍为空（会由 login-checker 定时器兜底）");
            }
          } catch (err) {
            this.logger.warn(`OpenQCLoginWindow: checkLoginFromServer threw ${err.message}`);
          }
        }
        this.deps.login("main", mergedInfo, winId);
        this.logger.info(`OpenQCLoginWindow: LoginStore 已更新 openId=${mergedInfo.openId} expireTime=${mergedInfo.expireTime ?? "(none)"}`);
      } else {
        this.logger.warn("OpenQCLoginWindow: userInfo 未从 Cookie 读取到，前端将走 postMessage 兜底链路");
      }
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(result), "");
    } catch (err) {
      const message = err.message || "unknown";
      this.logger.warn(`OpenQCLoginWindow: 失败 — ${message}`);
      const code = message === "user cancelled" ? JsbCode.kCancel : JsbCode.kError;
      ctx.emit(callbackId, code, "", message);
    }
  }
  /**
   * 保活检查
   *
   * TODO-1 已落地：若注入了 `checkLoginTick`，则异步触发一次后端校验/刷新
   * （不阻塞 ack）；前端仍立即拿到 ack，登录态变化通过 listener 广播推送。
   * 未注入时沿用 MVP 行为（直接 ack）。
   */
  async KeepAliveCheckLogin(ctx, callbackId) {
    const hasTick = !!this.deps.checkLoginTick;
    this.logger.info(`KeepAliveCheckLogin: invoked cid=${callbackId} hasTick=${hasTick}`);
    if (this.deps.checkLoginTick) {
      void this.deps.checkLoginTick().then(() => {
        this.logger.info(`KeepAliveCheckLogin: checkLoginTick resolved cid=${callbackId}`);
      }).catch((err) => {
        this.logger.warn(`KeepAliveCheckLogin: checkLoginTick threw ${err.message}`);
      });
    }
    ctx.emit(callbackId, JsbCode.kSuccess, "", "");
  }
  /**
   * 注册登录事件监听
   *
   * 监听类接口：
   *   - 每个 webContents 幂等登记 callbackId
   *   - `LoginStore.onEvent` 的每次触发都会扇出到所有存活的 cid
   *   - 注册时先 ack 一次（code=0，data=空）让前端 Promise 不挂起
   */
  async AddYybClientLoginListener(ctx, callbackId) {
    this.listeners.add(ctx, callbackId);
    this.logger.debug(`AddYybClientLoginListener: wcId=${ctx.webContentsId} cid=${callbackId} size=${this.listeners.size()}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "", "");
  }
  // ─────────────────────────────────────────────────────────
  // BaseHandler 钩子
  // ─────────────────────────────────────────────────────────
  /** 覆盖 listMethods：显式声明，避免反射把 `dispose`/`onWebContentsDestroyed` 等漏进去 */
  listMethods() {
    return [
      "IsEnable",
      "Login",
      "Logout",
      "GetUserInfo",
      "GetUserInfoLegacy",
      "KeepAliveCheckLogin",
      "AddYybClientLoginListener",
      "OpenQCLoginWindow"
    ];
  }
  /** 窗口销毁时移除对应的 listener cid */
  onWebContentsDestroyed(webContentsId) {
    this.listeners.removeByWebContents(webContentsId);
  }
  /** 模块销毁：取消订阅 LoginStore，清空 listener */
  dispose() {
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
    this.listeners.clear();
  }
  // ─────────────────────────────────────────────────────────
  // 内部
  // ─────────────────────────────────────────────────────────
  /**
   * 把前端传入的 partial userInfo 规范化为 `ClientUserInfoBase`
   *
   * 对齐 Windows 的"宽容解析"：缺省字段用默认值补齐，不因非核心字段缺失而拒绝。
   */
  _normalizeUserInfo(raw) {
    const loginTypeRaw = typeof raw.loginType === "string" ? raw.loginType : "";
    const loginType = ALLOWED_LOGIN_TYPES.has(loginTypeRaw) ? loginTypeRaw : "";
    const scope = Array.isArray(raw.scope) ? raw.scope.filter((x) => typeof x === "string") : [];
    return {
      loginType,
      openId: raw.openId,
      accessToken: typeof raw.accessToken === "string" ? raw.accessToken : "",
      refreshToken: typeof raw.refreshToken === "string" ? raw.refreshToken : "",
      nickName: typeof raw.nickName === "string" ? raw.nickName : "",
      headImg: typeof raw.headImg === "string" ? raw.headImg : "",
      scope,
      expireTime: typeof raw.expireTime === "number" ? raw.expireTime : void 0
    };
  }
  /**
   * 把 LoginStore 事件扇出给所有活跃 listener
   */
  _fanoutEvent(ev) {
    const alive = this.listeners.aliveEntries();
    if (alive.length === 0) {
      this.logger.debug(`fanout: no listeners for ${ev.eventName}`);
      return;
    }
    const data = JSON.stringify(ev);
    for (const entry of alive) {
      try {
        entry.ctx.emit(entry.callbackId, JsbCode.kSuccess, data, "");
      } catch (err) {
        this.logger.warn(`fanout emit failed wcId=${entry.webContentsId}: ${err.message}`);
      }
    }
    this.logger.debug(`fanout: ${ev.eventName} → ${alive.length} listener(s)`);
  }
  // 测试辅助
  get __test__() {
    return {
      listenerCount: () => this.listeners.size(),
      fanout: (ev) => this._fanoutEvent(ev)
    };
  }
}
const execFileAsync$1 = promisify$1(execFile);
const logger$H = getLogger("basic-info");
let hardwareCache = null;
function inferCpuVendor(model) {
  const m = model.toLowerCase();
  if (m.includes("intel")) return "Intel";
  if (m.includes("amd")) return "AMD";
  if (m.includes("apple")) return "Apple";
  if (m.includes("qualcomm") || m.includes("snapdragon")) return "Qualcomm";
  return "Unknown";
}
function inferGpuVendor(model) {
  const m = model.toLowerCase();
  if (m.includes("intel")) return "Intel";
  if (m.includes("amd") || m.includes("radeon")) return "AMD";
  if (m.includes("nvidia") || m.includes("geforce")) return "NVIDIA";
  if (m.includes("apple")) return "Apple";
  if (m.includes("qualcomm")) return "Qualcomm";
  return "Unknown";
}
async function fetchMacGpuInfo() {
  try {
    const { stdout } = await execFileAsync$1("system_profiler", ["SPDisplaysDataType", "-json"], {
      timeout: 5e3
    });
    const parsed = JSON.parse(stdout);
    const displays = parsed.SPDisplaysDataType;
    if (Array.isArray(displays) && displays.length > 0) {
      const isApple = (d) => {
        const name = String(d.sppci_model ?? "").toLowerCase();
        return name.includes("apple");
      };
      const discrete = displays.find((d) => !isApple(d));
      const gpu = discrete ?? displays[0];
      const model = String(gpu.sppci_model ?? gpu._name ?? "");
      return { model, vendor: inferGpuVendor(model) };
    }
  } catch (err) {
    logger$H.warn(`fetchMacGpuInfo: system_profiler 失败 — ${err.message}`);
  }
  return { model: "", vendor: "Unknown" };
}
async function getHardwareInfo() {
  if (hardwareCache) return hardwareCache;
  const cpus = os$1.cpus();
  const cpuModel = cpus[0]?.model ?? "";
  const cpuCoreNumber = cpus.length;
  const cpuVendor = inferCpuVendor(cpuModel);
  const physicalMemoryGb = Math.floor(os$1.totalmem() / (1024 * 1024 * 1024));
  const archMap = {
    x64: "x64",
    ia32: "x86",
    arm: "ARM",
    arm64: "ARM64"
  };
  const architecture = archMap[os$1.arch()] ?? "Unknown";
  const systemVersion = os$1.release();
  const { model: graphicsModel, vendor: graphicsVendor } = await fetchMacGpuInfo();
  hardwareCache = {
    cpuCoreNumber,
    cpuModel,
    cpuVendor,
    physicalMemoryGb,
    architecture,
    systemVersion,
    graphicsModel,
    graphicsVendor
  };
  logger$H.info(`[basic-info] hardware: cpu="${cpuModel}" vendor=${cpuVendor} cores=${cpuCoreNumber} mem=${physicalMemoryGb}G arch=${architecture} gpu="${graphicsModel}" gpuVendor=${graphicsVendor}`);
  return hardwareCache;
}
class BasicInfoHandler extends BaseHandler {
  name = "basicInfo";
  deps;
  constructor(deps2) {
    super();
    this.deps = deps2;
  }
  /**
   * 返回环境信息
   *
   * 对齐 C++ `BasicInfo::GetRequestEnvInfo` → `request_info::GetFieldsMap()`
   */
  async GetRequestEnvInfo(ctx, callbackId) {
    const hw = await getHardwareInfo();
    const userInfo2 = this.deps.getUserInfo();
    const { main } = userInfo2;
    const loginOpenid = main?.openId ?? "";
    const loginType = main?.loginType ?? "";
    const guid = await getDeviceGuid();
    const envInfo = {
      abox_version: "",
      androws_version: "",
      architecture: hw.architecture,
      architecture_machine: hw.architecture,
      client_type: 0,
      cpu_core_number: hw.cpuCoreNumber,
      cpu_model: hw.cpuModel,
      cpu_vendor: hw.cpuVendor,
      graphics_model: hw.graphicsModel,
      graphics_vendor: hw.graphicsVendor,
      guid,
      hyperv_state: 0,
      hyperv_env_state: 0,
      image_version: "",
      is_auto_pre_download: 0,
      is_open_market: 0,
      is_support_hyperv: 0,
      locale: app.getLocale().replace("-", "_"),
      // "zh-CN" → "zh_CN"
      login_openid: loginOpenid,
      login_type: loginType,
      main_version: loadInstalledJson()?.appVersion || app.getVersion(),
      max_disk_size: 0,
      media_channel: "",
      oem_type: 0,
      physical_memory: hw.physicalMemoryGb,
      physical_cpu_core_number: hw.cpuCoreNumber,
      qimei: guid,
      region: app.getLocale().split("-")[1] ?? "",
      system_version: hw.systemVersion,
      vt_state: 0,
      yyb_install_time: 0,
      yyb_open_time: 0
    };
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(envInfo));
  }
  /**
   * 返回主板型号（Mac 阶段暂返回空字符串）
   */
  async GetBaseboardVendor(ctx, callbackId) {
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
}
const logger$G = getLogger("jsb:application");
class ApplicationHandler extends BaseHandler {
  /** 进程启动时间（UTC 毫秒），由主入口 `setBootTime()` 尽早注入，近似 `whenReady` 时刻 */
  static bootTimeUtcMsec = Date.now();
  /** 由主入口在 `app.whenReady()` 最早处调用一次 */
  static setBootTime(ms) {
    ApplicationHandler.bootTimeUtcMsec = ms;
  }
  name = "application";
  buildStore;
  constructor(buildStore) {
    super();
    this.buildStore = buildStore;
  }
  // ─── 真实现 ─────────────────────────────────────────────────────
  /** 进程启动 UTC 毫秒；对齐 `Application::GetBootTimeUtcMsec` */
  async GetBootTimeUtcMsec(ctx, callbackId) {
    ctx.emit(callbackId, JsbCode.kSuccess, String(ApplicationHandler.bootTimeUtcMsec));
  }
  /** 渠道号；从 BuildStore 读取 channelId（降级 "0"，与 Windows 字符串化 std::to_string 对齐） */
  async GetChannel(ctx, callbackId) {
    const channel = this.buildStore.get("channelId") || "0";
    ctx.emit(callbackId, JsbCode.kSuccess, channel);
  }
  /** Marvis 主版本号（大版本号）；优先从 installed.json 读取，降级使用 BuildStore */
  async GetMainVersion(ctx, callbackId) {
    const installedJson = loadInstalledJson();
    const version = installedJson?.appVersion || this.buildStore.get("version");
    ctx.emit(callbackId, JsbCode.kSuccess, version);
  }
  /**
   * 生成诊断日志压缩包
   *
   * 复用 log-collector 模块的 collectLogFiles + packDiagnosisLogs 能力，
   * 但不执行上传 COS 和状态上报（仅本地打包，供用户查看）。
   *
   * 与 Windows C++ 端 `Application::GenerateDiagnosisZip` 对齐：
   * - 成功时 data 为压缩包文件路径
   * - 失败时 code 为错误码，data 为空串
   *
   * 压缩包输出到 <logDir>/Diagnosis/ 目录，自动保留最近 3 次诊断包。
   */
  async GenerateDiagnosisZip(ctx, callbackId) {
    const taskId = `diagnosis-${Date.now()}`;
    try {
      const task = {
        task_id: taskId,
        has_log: 1,
        has_dump: 0,
        has_windows_event: 0
      };
      const files = await collectLogFiles(task);
      if (files.length === 0) {
        logger$G.warn("GenerateDiagnosisZip: 无可收集的日志文件");
        ctx.emit(callbackId, JsbCode.kError, "", "No log files found");
        return;
      }
      const archivePath = await packDiagnosisLogs(files, taskId);
      logger$G.info(`诊断日志已生成: ${archivePath}`);
      ctx.emit(callbackId, JsbCode.kSuccess, archivePath);
    } catch (err) {
      const msg = err.message;
      logger$G.error(`GenerateDiagnosisZip 失败: ${msg}`);
      ctx.emit(callbackId, JsbCode.kError, "", msg);
    }
  }
  /**
   * 透传渲染端事件到主进程灯塔上报（普通通道）
   *
   * 对齐 Windows C++ 侧 `Application::ReportBeaconEvent`：渲染层无法直接调用
   * 灯塔 SDK，需要通过桥让主进程代为上报，公参（如登录态、设备 GUID 等）由
   * 主进程统一注入，不依赖渲染端传入。
   *
   * 入参：
   * - args[0] = event：事件码（非空字符串）
   * - args[1] = paramsJson：事件级参数 JSON 字符串（可省略 / 空串 / 'null'）
   *
   * 返回：
   * - 成功：code = kSuccess，data 为底层返回码字符串（前端只判断 code === 0）
   * - 失败：code = kParameterError 或 kError，data = ''，message 携带原因
   *
   * 注意：渲染端是不可信源，对 paramsJson 做严格 JSON.parse 校验，且仅接受
   * 顶层为 object 的 JSON；其他类型一律拒绝（防止把非法 payload 上报到灯塔
   * 后台造成数据污染）。
   */
  async ReportBeaconEvent(ctx, callbackId, event, paramsJson) {
    if (typeof event !== "string" || event.length === 0) {
      logger$G.warn(`ReportBeaconEvent: 事件码非法 type=${typeof event}`);
      ctx.emit(callbackId, JsbCode.kParameterError, "", "event code must be non-empty string");
      return;
    }
    let params;
    if (paramsJson !== void 0 && paramsJson !== null && paramsJson !== "" && paramsJson !== "null") {
      if (typeof paramsJson !== "string") {
        logger$G.warn(`ReportBeaconEvent(${event}): paramsJson 非字符串 type=${typeof paramsJson}`);
        ctx.emit(callbackId, JsbCode.kParameterError, "", "paramsJson must be string");
        return;
      }
      try {
        const parsed = JSON.parse(paramsJson);
        if (parsed !== null && (typeof parsed !== "object" || Array.isArray(parsed))) {
          logger$G.warn(`ReportBeaconEvent(${event}): paramsJson 顶层非对象`);
          ctx.emit(callbackId, JsbCode.kParameterError, "", "paramsJson must be a JSON object");
          return;
        }
        params = parsed ?? void 0;
      } catch (err) {
        logger$G.warn(`ReportBeaconEvent(${event}): paramsJson 解析失败: ${err.message}`);
        ctx.emit(callbackId, JsbCode.kParameterError, "", "paramsJson is not valid JSON");
        return;
      }
    }
    try {
      const ret = await reportBeaconEvent(event, params);
      logger$G.debug(`ReportBeaconEvent(${event}) ret=${ret}`);
      ctx.emit(callbackId, JsbCode.kSuccess, String(ret));
    } catch (err) {
      const msg = err.message;
      logger$G.error(`ReportBeaconEvent(${event}) 抛错: ${msg}`);
      ctx.emit(callbackId, JsbCode.kError, "", msg);
    }
  }
  // ─── mock ──────────────────────────────────────────────────────
  /** [mock] 伪协议列表；macOS 无伪协议处理链，返回空数组 */
  async GetPseudoProtocolList(ctx, callbackId) {
    logger$G.debug(`[mock] GetPseudoProtocolList cid=${callbackId}`);
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify([]));
  }
  /** [mock] 注册伪协议监听；macOS 永不推送事件 */
  async AddPseudoProtocolListener(ctx, callbackId) {
    logger$G.debug(`[mock] AddPseudoProtocolListener cid=${callbackId}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  /** [mock] 标记伪协议已执行；macOS 直接成功 */
  async MarkPseudoProtocolHasExecuted(ctx, callbackId) {
    logger$G.debug(`[mock] MarkPseudoProtocolHasExecuted cid=${callbackId}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
}
class HideFileStore {
  store;
  constructor() {
    this.store = new Store({
      name: "marvis-hide-files",
      defaults: {
        items: []
      }
    });
  }
  // ─── 读取 ──────────────────────────────────────────────
  /** 获取所有隐藏项 */
  getAll() {
    return this.store.get("items");
  }
  /**
   * 按 key 获取单条隐藏项
   *
   * @param key   - topic 类型传 topic_id，非 topic 类型传 path
   * @param isTopic - 是否为 topic 类型
   * @returns 匹配的隐藏项，未找到返回 undefined
   */
  getByKey(key, isTopic) {
    const items = this.getAll();
    if (isTopic) {
      return items.find((item) => item.is_topic && item.topic_id === key);
    }
    return items.find((item) => !item.is_topic && item.path === key);
  }
  // ─── 写入 ──────────────────────────────────────────────
  /**
   * 添加一条隐藏项
   *
   * 如果同 key 的项已存在，则覆盖（保持幂等）。
   */
  add(item) {
    const key = item.is_topic ? item.topic_id : item.path;
    const items = this.getAll();
    const idx = this._findIndex(items, key, item.is_topic);
    if (idx >= 0) {
      items[idx] = item;
    } else {
      items.push(item);
    }
    this.store.set("items", items);
  }
  /**
   * 移除一条隐藏项
   *
   * @param key   - topic 类型传 topic_id，非 topic 类型传 path
   * @param isTopic - 是否为 topic 类型
   */
  remove(key, isTopic) {
    const items = this.getAll();
    const idx = this._findIndex(items, key, isTopic);
    if (idx >= 0) {
      items.splice(idx, 1);
      this.store.set("items", items);
    }
  }
  /**
   * 更新一条隐藏项
   *
   * 按 key 定位后全量替换。如果不存在则新增（upsert 语义）。
   */
  update(item) {
    this.add(item);
  }
  // ─── 调试 ──────────────────────────────────────────────
  /** 获取 store 文件路径（调试/日志用） */
  getStorePath() {
    return this.store.path;
  }
  // ─── 内部辅助 ──────────────────────────────────────────
  /**
   * 在数组中按 key 查找索引
   */
  _findIndex(items, key, isTopic) {
    if (isTopic) {
      return items.findIndex((item) => item.is_topic && item.topic_id === key);
    }
    return items.findIndex((item) => !item.is_topic && item.path === key);
  }
}
const logger$F = getLogger("jsb:AiStarterSettings");
class AiStarterSettingsHandler extends BaseHandler {
  name = "AiStarterSettings";
  hideFileStore = new HideFileStore();
  /**
   * 获取所有隐藏项列表
   *
   * 前端调用：`AiStarterSettings.GetHideFileInfos()`
   * 返回：`JSON.stringify(IHiddenItemInfo[])`
   */
  async GetHideFileInfos(ctx, callbackId) {
    try {
      const items = this.hideFileStore.getAll();
      logger$F.debug(`GetHideFileInfos cid=${callbackId} count=${items.length}`);
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(items));
    } catch (err) {
      logger$F.error(`GetHideFileInfos failed: ${err}`);
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify([]));
    }
  }
  /**
   * 获取单条隐藏项
   *
   * 前端调用：`AiStarterSettings.GetHideFileInfo(key, isTopic)`
   * - args[0]: key (string) — topic 类型传 topic_id，非 topic 类型传 path
   * - args[1]: isTopic (boolean)
   * 返回：找到时返回 `JSON.stringify(IHiddenItemInfo)`，未找到返回空字符串
   */
  async GetHideFileInfo(ctx, callbackId, ...args) {
    try {
      const key = String(args[0] ?? "");
      const isTopic = Boolean(args[1]);
      logger$F.debug(`GetHideFileInfo cid=${callbackId} key=${key} isTopic=${isTopic}`);
      const item = this.hideFileStore.getByKey(key, isTopic);
      if (item) {
        ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(item));
      } else {
        ctx.emit(callbackId, JsbCode.kSuccess, "");
      }
    } catch (err) {
      logger$F.error(`GetHideFileInfo failed: ${err}`);
      ctx.emit(callbackId, JsbCode.kSuccess, "");
    }
  }
  /**
   * 添加隐藏项
   *
   * 前端调用：`AiStarterSettings.HideFileInfo(fileInfo)`
   *   → `handler.HideFileInfo(JSON.stringify(fileInfo))`
   * - args[0]: JSON 字符串 (IHiddenItemInfo)
   */
  async HideFileInfo(ctx, callbackId, ...args) {
    try {
      const jsonStr = String(args[0] ?? "{}");
      const item = JSON.parse(jsonStr);
      logger$F.debug(`HideFileInfo cid=${callbackId} path=${item.path} isTopic=${item.is_topic}`);
      this.hideFileStore.add(item);
      ctx.emit(callbackId, JsbCode.kSuccess, "");
    } catch (err) {
      logger$F.error(`HideFileInfo failed: ${err}`);
      ctx.emit(callbackId, JsbCode.kSuccess, "");
    }
  }
  /**
   * 移除隐藏项
   *
   * 前端调用：`AiStarterSettings.CancelHideFileInfo(key, isTopic)`
   *   → `handler.UnHideFileInfo(key, isTopic)`
   * - args[0]: key (string)
   * - args[1]: isTopic (boolean)
   */
  async UnHideFileInfo(ctx, callbackId, ...args) {
    try {
      const key = String(args[0] ?? "");
      const isTopic = Boolean(args[1]);
      logger$F.debug(`UnHideFileInfo cid=${callbackId} key=${key} isTopic=${isTopic}`);
      this.hideFileStore.remove(key, isTopic);
      ctx.emit(callbackId, JsbCode.kSuccess, "");
    } catch (err) {
      logger$F.error(`UnHideFileInfo failed: ${err}`);
      ctx.emit(callbackId, JsbCode.kSuccess, "");
    }
  }
  /**
   * 更新隐藏项
   *
   * 前端调用：`AiStarterSettings.UpdateHideFileInfo(fileInfo)`
   *   → `handler.UpdateHideFileInfo(JSON.stringify(fileInfo))`
   * - args[0]: JSON 字符串 (IHiddenItemInfo)
   */
  async UpdateHideFileInfo(ctx, callbackId, ...args) {
    try {
      const jsonStr = String(args[0] ?? "{}");
      const item = JSON.parse(jsonStr);
      logger$F.debug(`UpdateHideFileInfo cid=${callbackId} path=${item.path} isTopic=${item.is_topic}`);
      this.hideFileStore.update(item);
      ctx.emit(callbackId, JsbCode.kSuccess, "");
    } catch (err) {
      logger$F.error(`UpdateHideFileInfo failed: ${err}`);
      ctx.emit(callbackId, JsbCode.kSuccess, "");
    }
  }
}
const logger$E = getLogger("jsb:DiskManager");
class DiskManagerHandler extends BaseHandler {
  name = "DiskManager";
  /** [mock] 磁盘变更监听；注册即成功，不会推事件 */
  async AddDeviceChangeListener(ctx, callbackId) {
    logger$E.debug(`[mock] AddDeviceChangeListener cid=${callbackId}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  /** [mock] 弹出磁盘；返回成功表示"已处理"，前端据此更新 UI */
  async EjectDrive(ctx, callbackId) {
    logger$E.debug(`[mock] EjectDrive cid=${callbackId}`);
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ success: true }));
  }
  /** [mock] 批量创建快捷方式；全部视为失败，前端按"一个都没成功"处理 */
  async CreateFileShortcuts(ctx, callbackId) {
    logger$E.debug(`[mock] CreateFileShortcuts cid=${callbackId}`);
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ success: [], failed: [] }));
  }
}
const logger$D = getLogger("jsb:KnowledgeBase");
const STATUS_PROCESS_ACTIVE = 31;
const STATUS_PROCESS_NOT_FOUND = 32;
class KnowledgeBaseHandler extends BaseHandler {
  name = "KnowledgeBase";
  /** 退出事件监听注册中心（无论开关开关都可注册） */
  exitListeners = new ListenerRegistry();
  /** 端口就绪事件监听注册中心（用于知识库重启后前端自愈重建 socket.io） */
  portReadyListeners = new ListenerRegistry();
  /** onKbExit 订阅取消句柄 */
  disposeKbExitSub = null;
  /** onKbPortReady 订阅取消句柄 */
  disposeKbPortReadySub = null;
  constructor() {
    super();
    this.disposeKbExitSub = onKbExit((ev) => this.handleKbExitEvent(ev));
    this.disposeKbPortReadySub = onKbPortReady((ev) => this.handleKbPortReadyEvent(ev));
  }
  // ─── Launch / LaunchByLimit ─────────────────────────────────
  /**
   * 启动知识库（最简路径，不做限流）
   *
   * - 开关关闭：保留 mock 行为 — 直接返回 `{ code: 0 }`（不真启动）
   * - 开关开启：异步启动；**返回立即 ack（不 await 启动完成）**，避免
   *   前端被 MarvisKnowledgebase ~30s 冷启阻塞。真实的启动结果由
   *   `onKbExit` 事件 + 前端 `GetPort` 轮询体现。
   */
  async Launch(ctx, callbackId) {
    if (!isKbEnabled()) {
      logger$D.debug(`[disabled] Launch cid=${callbackId}`);
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ code: 0 }));
      return;
    }
    if (isKbRunning()) {
      logger$D.debug(`Launch cid=${callbackId} — 已在运行，幂等返回 0`);
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ code: 0 }));
      return;
    }
    logger$D.info(`Launch cid=${callbackId} — 后台触发 startKb`);
    void startKb().catch((err) => {
      logger$D.warn(`Launch 触发的 startKb 启动失败: ${err.message}`);
    });
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ code: 0 }));
  }
  /**
   * 限流启动（对齐前端 `LaunchKnowledgeBaseByLimit`）
   *
   * 前端只关心 `{ code, data: '{...}' }`，`data` 里可带 `{ success }`。
   *
   * - 开关关闭：`{ success: false }`（原 mock 行为）
   * - 开关开启：根据限流器 + 进程状态返回 true/false
   */
  async LaunchKnowledgeBaseByLimit(ctx, callbackId) {
    if (!isKbEnabled()) {
      logger$D.debug(`[disabled] LaunchKnowledgeBaseByLimit cid=${callbackId}`);
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ success: false }));
      return;
    }
    if (isKbRunning()) {
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ success: true }));
      return;
    }
    logger$D.info(`LaunchKnowledgeBaseByLimit cid=${callbackId}`);
    void launchKbByLimit().then((result) => {
      if (!result.ok) {
        logger$D.info(`LaunchKnowledgeBaseByLimit 未实际启动: ${result.reason ?? "unknown"}`);
      }
    });
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ success: true }));
  }
  // ─── 状态查询 ──────────────────────────────────────────────
  /**
   * 获取知识库端口
   *
   * 对齐前端：`res.data` 是**字符串化**的端口号，未就绪返回 `"0"`。
   *
   * 对齐 Windows C++ `KnowledgeBase::GetPort` 的**实际**行为：Windows 的
   * `ai_starter_controller::Initialize` 先阻塞 `KnowledgeBaseManager::Initialize`
   * 再 `InitCef()` + 创建主窗口，前端首次调 GetPort 时 INI 早已写出；我们这边
   * 窗口创建和 `startKb()` 并行，前端 ~600ms 就调到 GetPort，但 MarvisKnowledgebase
   * 需 ~800ms 才把 port 写入 INI，这个窗口期返回 `0` 会让前端 fallback 到
   * `DEFAULT_PORT=5151`、baseURL 被定死、业务请求全部 5s timeout × 3 → 卡 loading。
   *
   * 因此启用态走 `awaitKbPort()`：启动中会短时阻塞等 INI 就绪，超时才返回 0。
   */
  async GetPort(ctx, callbackId) {
    const port = isKbEnabled() ? await awaitKbPort() : 0;
    logger$D.debug(`GetPort cid=${callbackId} -> ${port}`);
    ctx.emit(callbackId, JsbCode.kSuccess, String(port));
  }
  /**
   * 获取知识库进程状态（对齐 `KnowledgeBaseProcessStatus` 枚举）
   *
   * - 开关关闭：`{ status_code: 32 }`（ProcessNotFound）
   * - 开关开启 + 运行中：`{ status_code: 31 }`（ProcessActive）
   * - 开关开启 + 未运行：`{ status_code: 32 }`
   *
   * 说明：Windows 侧还会返回 NotInited/NotInstalled 等 SDK 状态，macOS 没有
   * SDK 所以简化为两态。前端 `KeepAliveManager.isKnowledgeBaseAlive()` 视
   * `Unknown | ProcessActive` 为存活，所以 32（ProcessNotFound）才表示"没跑"。
   */
  async GetStatus(ctx, callbackId) {
    let statusCode;
    if (!isKbEnabled()) {
      statusCode = STATUS_PROCESS_NOT_FOUND;
    } else if (isKbRunning()) {
      statusCode = STATUS_PROCESS_ACTIVE;
    } else {
      statusCode = STATUS_PROCESS_NOT_FOUND;
    }
    logger$D.debug(`GetStatus cid=${callbackId} -> status_code=${statusCode}`);
    ctx.emit(
      callbackId,
      JsbCode.kSuccess,
      JSON.stringify({ status_code: statusCode })
    );
  }
  /**
   * 获取知识库运行状态（对齐前端 `IKnowledgeBaseRunningStatus { code, is_running }`）
   */
  async GetKnowledgeBaseRunningStatus(ctx, callbackId) {
    const running2 = isKbEnabled() && isKbRunning();
    logger$D.debug(`GetKnowledgeBaseRunningStatus cid=${callbackId} -> ${running2}`);
    ctx.emit(
      callbackId,
      JsbCode.kSuccess,
      JSON.stringify({ code: 0, is_running: running2 })
    );
  }
  // ─── Restart ────────────────────────────────────────────────
  /**
   * 重启知识库（对齐前端 `IRestartResponse { code, message }`）
   *
   *   - `code=0` / message=`restart_success`
   *   - `code=-2` / message=`restart_in_progress`
   *   - `code=-1` / message=`restart_failed` / `disabled`
   */
  async RestartKnowledgeBase(ctx, callbackId) {
    if (!isKbEnabled()) {
      logger$D.info(`[disabled] RestartKnowledgeBase cid=${callbackId}`);
      ctx.emit(
        callbackId,
        JsbCode.kSuccess,
        JSON.stringify({ code: -1, message: "disabled" })
      );
      return;
    }
    logger$D.info(`RestartKnowledgeBase cid=${callbackId}`);
    try {
      const result = await restartKb();
      let code;
      let message;
      switch (result) {
        case "success":
          code = 0;
          message = "restart_success";
          break;
        case "in-progress":
          code = -2;
          message = "restart_in_progress";
          break;
        case "failed":
        default:
          code = -1;
          message = "restart_failed";
          break;
      }
      ctx.emit(
        callbackId,
        JsbCode.kSuccess,
        JSON.stringify({ code, message })
      );
    } catch (err) {
      logger$D.error(`RestartKnowledgeBase 异常: ${err.message}`);
      ctx.emit(
        callbackId,
        JsbCode.kSuccess,
        JSON.stringify({ code: -1, message: "restart_failed" })
      );
    }
  }
  // ─── 监听类接口 ────────────────────────────────────────────
  /**
   * 监听知识库进程状态（前端已废弃，但兼容保留）
   *
   * 与 Windows 对齐：注册即成功，不推送事件。
   */
  async MonitorKnowledgeBaseProcess(ctx, callbackId) {
    logger$D.debug(`MonitorKnowledgeBaseProcess cid=${callbackId} — noop`);
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  /**
   * 订阅知识库退出事件
   *
   * 注册后立即 ack 空 data；进程退出时通过同 callbackId 推送事件体：
   * ```
   * { status: 'exited', exit_code, reason: 'error' | 'shutdown' }
   * ```
   *
   * 对齐前端 `IKnowledgeBaseExitData`：
   *   - `reason='shutdown'`：退出码 0 / 主动 stop
   *   - `reason='error'`：退出码非 0 / 熔断
   *
   * 注：**前端主动调 RestartKnowledgeBase 产生的中间停止**也会经由此通道推送
   * 一次 `shutdown`；此行为与 Windows 保持一致（Windows 也不抑制）。
   */
  async AddKnowledgeBaseExitListener(ctx, callbackId) {
    this.exitListeners.add(ctx, callbackId);
    logger$D.debug(`AddKnowledgeBaseExitListener cid=${callbackId} wc=${ctx.webContentsId} size=${this.exitListeners.size()}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  async RemoveKnowledgeBaseExitListener(ctx, callbackId) {
    this.exitListeners.removeByWebContents(ctx.webContentsId);
    logger$D.debug(`RemoveKnowledgeBaseExitListener cid=${callbackId} wc=${ctx.webContentsId} size=${this.exitListeners.size()}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  /**
   * 订阅"知识库端口就绪"事件（新增通道）
   *
   * 背景：知识库重启后端口可能漂移（OS 分配新端口），但前端的 socket.io client
   * 的 baseURL 在 app init 时就被烘焙成固定端口，导致重启后前端 socket.io 一直
   * 打老端口、ERR_CONNECTION_REFUSED、页面卡在 loading。
   *
   * 前端如果订阅了本事件：每次知识库启动就绪时会收到 `{ port }`，此时可以
   * disconnect 旧 socket.io、用新端口重建连接，实现自愈。
   *
   * 单次 callbackId 注册后以后每次知识库启动就绪都会复用同一个 callbackId 推送。
   * 注册后立即空 ack（和 AddKnowledgeBaseExitListener 一致）。
   *
   * 开关关闭下仍然接受注册（首次 ack），但永不会触发事件（onKbPortReady 永不派发）。
   */
  async AddKnowledgeBasePortReadyListener(ctx, callbackId) {
    this.portReadyListeners.add(ctx, callbackId);
    logger$D.debug(`AddKnowledgeBasePortReadyListener cid=${callbackId} wc=${ctx.webContentsId} size=${this.portReadyListeners.size()}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  async RemoveKnowledgeBasePortReadyListener(ctx, callbackId) {
    this.portReadyListeners.removeByWebContents(ctx.webContentsId);
    logger$D.debug(`RemoveKnowledgeBasePortReadyListener cid=${callbackId} wc=${ctx.webContentsId} size=${this.portReadyListeners.size()}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  // ─── BaseHandler 钩子 ──────────────────────────────────────
  onWebContentsDestroyed(webContentsId) {
    this.exitListeners.removeByWebContents(webContentsId);
    this.portReadyListeners.removeByWebContents(webContentsId);
  }
  dispose() {
    if (this.disposeKbExitSub) {
      try {
        this.disposeKbExitSub();
      } catch {
      }
      this.disposeKbExitSub = null;
    }
    if (this.disposeKbPortReadySub) {
      try {
        this.disposeKbPortReadySub();
      } catch {
      }
      this.disposeKbPortReadySub = null;
    }
    this.exitListeners.clear();
    this.portReadyListeners.clear();
  }
  // ─── 内部：knowledgebase 退出事件 → 前端推送 ────────────
  handleKbExitEvent(ev) {
    const entries2 = this.exitListeners.aliveEntries();
    if (entries2.length === 0) {
      logger$D.debug(`KbExit(${ev.reason}) — 无监听者，跳过推送`);
      return;
    }
    const payload = {
      status: "exited",
      exit_code: ev.exitCode ?? 0,
      reason: ev.reason
    };
    const data = JSON.stringify(payload);
    logger$D.info(`推送 KbExit 给 ${entries2.length} 个监听者: reason=${ev.reason} exit_code=${payload.exit_code}`);
    for (const entry of entries2) {
      try {
        entry.ctx.emit(entry.callbackId, JsbCode.kSuccess, data);
      } catch (err) {
        logger$D.warn(`KbExit 推送失败 wc=${entry.webContentsId}: ${err.message}`);
      }
    }
  }
  // ─── 内部：knowledgebase 端口就绪事件 → 前端推送 ────────────
  handleKbPortReadyEvent(ev) {
    const entries2 = this.portReadyListeners.aliveEntries();
    if (entries2.length === 0) {
      logger$D.debug(`KbPortReady(port=${ev.port}) — 无监听者，跳过推送`);
      return;
    }
    const payload = { port: ev.port };
    const data = JSON.stringify(payload);
    logger$D.info(`推送 KbPortReady 给 ${entries2.length} 个监听者: port=${ev.port}`);
    for (const entry of entries2) {
      try {
        entry.ctx.emit(entry.callbackId, JsbCode.kSuccess, data);
      } catch (err) {
        logger$D.warn(`KbPortReady 推送失败 wc=${entry.webContentsId}: ${err.message}`);
      }
    }
  }
}
const ENV_LLM_SDK_ADDON_PATH = "MARVIS_LLM_SDK_ADDON_PATH";
const ENV_LLM_SDK_DISABLED = "MARVIS_LLM_SDK_DISABLED";
const LOCAL_LLM_LOG_SCOPE = "local-llm";
const LOCAL_LLM_SDK_LOG_SCOPE = "local-llm:sdk";
const LLM_EVENT_NAMES = {
  /** 安装状态变更（下载 → 解压 → 安装完成） */
  InstallStatus: "install_status",
  /** 服务状态变更（kIdle/kStarting/kRunning 等） */
  ServiceState: "service_state",
  /** 设备信息/兼容性检测结果 */
  DeviceInfo: "device_info",
  /** 下载聚合进度 */
  DownloadProgress: "download_progress"
};
var LlmLogLevel = /* @__PURE__ */ ((LlmLogLevel2) => {
  LlmLogLevel2[LlmLogLevel2["Trace"] = 0] = "Trace";
  LlmLogLevel2[LlmLogLevel2["Debug"] = 1] = "Debug";
  LlmLogLevel2[LlmLogLevel2["Info"] = 2] = "Info";
  LlmLogLevel2[LlmLogLevel2["Warn"] = 3] = "Warn";
  LlmLogLevel2[LlmLogLevel2["Error"] = 4] = "Error";
  return LlmLogLevel2;
})(LlmLogLevel || {});
const LLM_ARIA2_POLL_INTERVAL_MS = 500;
const LLM_ARIA2_PROGRESS_REPORT_MIN_INTERVAL_MS = 1500;
const LLM_ARIA2_IDLE_SHUTDOWN_DELAY_MS = 6e4;
const LLM_ARIA2_SILENT_SPEED_RATIO = 0.1;
const LLM_ARIA2_SILENT_MIN_SPEED_LIMIT = 2 * 1024 * 1024;
const LLM_ARIA2_SILENT_PROGRESS_REPORT_MIN_INTERVAL_MS = 3e4;
const LLM_ARIA2_AGGRESSIVE_OPTIONS = {
  maxConcurrentDownloads: 2,
  split: 8,
  continue: true,
  maxTries: 50,
  retryWait: 10,
  fileAllocation: "none",
  allowOverwrite: true,
  autoFileRenaming: false,
  maxConnectionPerServer: 8,
  timeout: 120,
  connectTimeout: 30,
  lowestSpeedLimit: "10K",
  maxFileNotFound: 3,
  diskCache: "64M"
};
const log$3 = () => getLogger(LOCAL_LLM_LOG_SCOPE);
const nativeRequire = createRequire(import.meta.url);
function resolveCandidatePaths() {
  const list = [];
  const { [ENV_LLM_SDK_ADDON_PATH]: envValue } = process.env;
  const envPath = envValue?.trim();
  if (envPath && envPath.length > 0) {
    list.push(isAbsolute(envPath) ? envPath : resolve(process.cwd(), envPath));
  }
  list.push(resolve(process.cwd(), "native/llm-sdk/build/Release/llm_sdk.node"));
  const { resourcesPath } = process;
  if (typeof resourcesPath === "string" && resourcesPath.length > 0) {
    list.push(join(resourcesPath, "native", "llm-sdk", "llm_sdk.node"));
    list.push(join(resourcesPath, "native", "llm_sdk.node"));
  }
  return Array.from(new Set(list));
}
const REQUIRED_EXPORTS = [
  "create",
  "destroy",
  "initialize",
  "shutdown",
  "setLogCallback",
  "addListener",
  "removeListener",
  "getCurrentVersion",
  "setHttpCallback",
  "setDownloadCallback",
  "reportHttpResponse",
  "refreshDeviceInfo",
  "getDeviceInfo",
  "getServiceState"
];
function looksLikeBinding(mod) {
  if (!mod || typeof mod !== "object") return false;
  const r = mod;
  return REQUIRED_EXPORTS.every((k) => typeof r[k] === "function");
}
function loadNativeBinding() {
  if (process.platform !== "darwin") {
    return { binding: null, resolvedPath: null, reason: "non-darwin platform" };
  }
  const cwd = process.cwd();
  const { resourcesPath } = process;
  const envPath = process.env[ENV_LLM_SDK_ADDON_PATH]?.trim() ?? "";
  log$3().info(`[loader] 诊断信息: cwd=${cwd}, resourcesPath=${resourcesPath ?? "(undefined)"}, env(ADDON_PATH)=${envPath || "(empty)"}`);
  const candidates2 = resolveCandidatePaths();
  log$3().info(`[loader] 候选路径列表(${candidates2.length}): ${JSON.stringify(candidates2)}`);
  let lastError = null;
  for (const path2 of candidates2) {
    if (!existsSync(path2)) {
      log$3().info(`[loader] 跳过(文件不存在): ${path2}`);
      continue;
    }
    log$3().info(`[loader] 文件存在，尝试加载: ${path2}`);
    try {
      const mod = nativeRequire(path2);
      if (!looksLikeBinding(mod)) {
        const r = mod;
        const missing = REQUIRED_EXPORTS.filter((k) => typeof r[k] !== "function");
        lastError = `addon at ${path2} does not export expected API (missing: ${missing.join(", ")})`;
        log$3().warn(`[loader] ${lastError}`);
        continue;
      }
      return { binding: mod, resolvedPath: path2 };
    } catch (err) {
      lastError = `require(${path2}) failed: ${err.message}`;
      log$3().warn(`[loader] ${lastError}`);
    }
  }
  const reason = lastError ?? `llm_sdk.node not found in any candidate path (checked ${candidates2.length} paths, none exist)`;
  log$3().warn(`[loader] addon 加载最终失败: ${reason}`);
  return { binding: null, resolvedPath: null, reason };
}
const STUB_HANDLE = 1n;
function createStubBinding() {
  return {
    // A1
    create: (_optionsJson) => STUB_HANDLE,
    destroy: (_handle) => {
    },
    initialize: (_handle) => Promise.resolve(0),
    shutdown: (_handle) => {
    },
    setLogCallback: (_handle, _cb) => {
    },
    addListener: (_handle, _eventName, _cb) => 1n,
    removeListener: (_handle, _token) => {
    },
    getCurrentVersion: (_handle) => "",
    // A2
    setHttpCallback: (_handle, _cb) => {
    },
    setDownloadCallback: (_handle, _cb) => {
    },
    setDownloadPauseCallback: (_handle, _cb) => {
    },
    setDownloadResumeCallback: (_handle, _cb) => {
    },
    setDownloadCancelCallback: (_handle, _cb) => {
    },
    reportHttpResponse: (_handle, _responseJson) => {
    },
    refreshDeviceInfo: (_handle) => 0,
    startAutoDetection: (_handle) => 0,
    getDeviceInfo: (_handle) => "{}",
    getServiceState: (_handle) => "{}",
    isServiceReady: (_handle) => false,
    reportDownloadProgress: (_handle, _downloadId, _progressJson) => {
    },
    // A3
    startDownload: (_handle) => 0,
    pauseDownload: (_handle) => 0,
    resumeDownload: (_handle) => 0,
    cancelDownload: (_handle) => 0,
    startSilentDownload: (_handle) => 0,
    activateAndLaunch: (_handle) => 0,
    activateNewVersion: (_handle) => 0,
    cleanupOldVersions: (_handle, _keepCount) => 0,
    startService: (_handle, _launchInfoJson) => 0,
    stopService: (_handle) => 0,
    getNewVersion: (_handle) => "",
    setNewVersion: (_handle, _versionJson) => 0
  };
}
const LOCAL_LLM_MOD_ID = "local_llm";
const LOCAL_LLM_MOD_NAME = "本地 LLM";
const LOCAL_LLM_REPORT_EVENTS = {
  /** Native addon 加载失败（回退到 stub） */
  ADDON_LOAD_FAILED: "local_llm__addon_load_failed",
  /** SDK 初始化成功 */
  INIT_SUCCESS: "local_llm__init_success",
  /** SDK create 失败（严重错误，实时上报） */
  SDK_CREATE_FAILED: "local_llm__sdk_create_failed",
  /** SDK initialize 结果 */
  INITIALIZE_RESULT: "local_llm__initialize_result",
  /** aria2 进程启动失败（严重错误，实时上报） */
  ARIA2_SPAWN_FAILED: "local_llm__aria2_spawn_failed",
  /** 下载任务完成 */
  DOWNLOAD_COMPLETE: "local_llm__download_complete",
  /** 下载任务失败 */
  DOWNLOAD_FAILED: "local_llm__download_failed"
};
async function isPortAvailable(port) {
  return new Promise((resolve2) => {
    const server = createServer();
    server.once("error", () => resolve2(false));
    server.once("listening", () => {
      server.close(() => resolve2(true));
    });
    server.listen(port, "127.0.0.1");
  });
}
async function pickAria2Port() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const port = ARIA2_PORT_MIN + Math.floor(Math.random() * (ARIA2_PORT_MAX - ARIA2_PORT_MIN));
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error("无法找到可用的 aria2c RPC 端口");
}
const logger$C = getLogger("updater:aria2-manager");
class Aria2Manager {
  _session = null;
  _process = null;
  /** 当前会话信息 */
  get session() {
    return this._session;
  }
  /** 是否已启动 */
  get isRunning() {
    return !!this._session?.ready;
  }
  /**
   * 启动 aria2c 会话
   *
   * 延迟 spawn：等首次 StartUpdate 时调用
   * 失败换端口重试 ARIA2_PORT_RETRY_COUNT 次
   *
   * @param options - 可选的 aria2c 启动参数覆盖（大模型场景需要更激进的重试策略）
   */
  async startSession(options) {
    if (this._session?.ready) {
      return this._createRpcClient();
    }
    const aria2cPath = this._getAria2cPath();
    const token = randomBytes(16).toString("hex");
    const merged = { ...ARIA2_DEFAULT_SPAWN_OPTIONS, ...options };
    for (let attempt = 0; attempt < ARIA2_PORT_RETRY_COUNT; attempt++) {
      try {
        const port = await pickAria2Port();
        logger$C.info(`startSession: 尝试启动 aria2c port=${port} attempt=${attempt + 1}/${ARIA2_PORT_RETRY_COUNT}`);
        const extraArgs = buildAria2Args(merged);
        const proc = spawn(aria2cPath, [
          "--enable-rpc",
          `--rpc-listen-port=${port}`,
          `--rpc-secret=${token}`,
          "--rpc-listen-all=false",
          ...extraArgs
        ], {
          stdio: ["ignore", "ignore", "pipe"],
          detached: false
        });
        let stderrOutput = "";
        proc.stderr?.on("data", (chunk) => {
          stderrOutput += chunk.toString();
        });
        let earlyExit = false;
        let earlyExitCode = null;
        proc.on("exit", (code) => {
          earlyExit = true;
          earlyExitCode = code;
        });
        const ready = await this._waitForReady(port, 5e3);
        if (!ready) {
          if (earlyExit) {
            logger$C.warn(`startSession: aria2c 进程提前退出 exitCode=${earlyExitCode} (可能是签名/权限问题) stderr=${stderrOutput.slice(0, 500) || "(empty)"}`);
          } else {
            proc.kill("SIGKILL");
            logger$C.warn(`startSession: aria2c 端口 ${port} 未就绪（进程仍存活但未监听），换端口重试`);
          }
          continue;
        }
        this._process = proc;
        this._session = {
          pid: proc.pid,
          port,
          token,
          ready: true,
          startedAt: Date.now()
        };
        proc.on("exit", (code, signal) => {
          logger$C.warn(`aria2c 进程退出: code=${code} signal=${signal}`);
          this._session = null;
          this._process = null;
        });
        logger$C.info(`startSession: aria2c 已启动 pid=${proc.pid} port=${port}`);
        return this._createRpcClient();
      } catch (err) {
        logger$C.warn(`startSession: 尝试 ${attempt + 1} 失败: ${err.message}`);
      }
    }
    throw new Error("aria2c 启动失败（所有端口重试耗尽）");
  }
  /**
   * 停止 aria2c 会话
   *
   * SIGTERM → ARIA2_SHUTDOWN_TIMEOUT_MS → SIGKILL
   */
  async stopSession() {
    if (!this._process) {
      logger$C.info("stopSession: 无运行中的 aria2c 进程");
      return;
    }
    const proc = this._process;
    logger$C.info(`stopSession: 发送 SIGTERM 到 aria2c pid=${proc.pid}`);
    return new Promise((resolve2) => {
      const timeout = setTimeout(() => {
        logger$C.warn("stopSession: SIGTERM 超时，发送 SIGKILL");
        try {
          proc.kill("SIGKILL");
        } catch {
        }
      }, ARIA2_SHUTDOWN_TIMEOUT_MS);
      proc.on("exit", () => {
        clearTimeout(timeout);
        this._session = null;
        this._process = null;
        logger$C.info("stopSession: aria2c 已停止");
        resolve2();
      });
      try {
        proc.kill("SIGTERM");
      } catch {
        clearTimeout(timeout);
        this._session = null;
        this._process = null;
        resolve2();
      }
    });
  }
  /**
   * 获取 RPC 客户端
   */
  getRpcClient() {
    if (!this._session?.ready) return null;
    return this._createRpcClient();
  }
  /** 获取 aria2c 可执行文件路径 */
  _getAria2cPath() {
    const resourcesDir = app.isPackaged ? process.resourcesPath : path__default$1.resolve(app.getAppPath(), "resources");
    const aria2cPath = path__default$1.join(resourcesDir, "bin", "aria2c");
    logger$C.info(`_getAria2cPath: isPackaged=${app.isPackaged} resourcesDir=${resourcesDir} aria2cPath=${aria2cPath}`);
    return aria2cPath;
  }
  /** 等待 aria2c RPC 端口就绪 */
  async _waitForReady(port, timeoutMs) {
    const start2 = Date.now();
    while (Date.now() - start2 < timeoutMs) {
      if (await isPortAvailable(port)) {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      return true;
    }
    return false;
  }
  /** 创建 RPC 客户端（简化版：基于 HTTP JSON-RPC） */
  _createRpcClient() {
    const session2 = this._session;
    const baseUrl = `http://127.0.0.1:${session2.port}/jsonrpc`;
    const call = async (method, params) => {
      const resp = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now().toString(),
          method: `aria2.${method}`,
          params: [`token:${session2.token}`, ...params]
        })
      });
      const json = await resp.json();
      if (json.error) {
        throw new Error(`aria2 RPC error: ${json.error.code} ${json.error.message}`);
      }
      return json.result;
    };
    return {
      async addUri(urls, opts) {
        const result = await call("addUri", [urls, opts]);
        return result;
      },
      async tellStatus(gid) {
        const result = await call("tellStatus", [gid, ["status", "completedLength", "totalLength", "downloadSpeed", "errorCode", "errorMessage"]]);
        return result;
      },
      async forcePause(gid) {
        await call("forcePause", [gid]);
      },
      async unpause(gid) {
        await call("unpause", [gid]);
      },
      async forceRemove(gid) {
        await call("forceRemove", [gid]);
      },
      async purgeDownloadResult() {
        await call("purgeDownloadResult", []);
      },
      async changeOption(gid, options) {
        await call("changeOption", [gid, options]);
      }
    };
  }
}
const ARIA2_DEFAULT_SPAWN_OPTIONS = {
  maxConcurrentDownloads: 2,
  split: 8,
  continue: true,
  maxTries: 3,
  retryWait: 5,
  fileAllocation: "none",
  allowOverwrite: true,
  autoFileRenaming: false,
  maxConnectionPerServer: 1,
  timeout: 60,
  connectTimeout: 60,
  lowestSpeedLimit: "0",
  maxFileNotFound: 0,
  diskCache: "16M"
};
function buildAria2Args(opts) {
  return [
    `--max-concurrent-downloads=${opts.maxConcurrentDownloads}`,
    `--split=${opts.split}`,
    `--continue=${opts.continue}`,
    `--max-tries=${opts.maxTries}`,
    `--retry-wait=${opts.retryWait}`,
    `--file-allocation=${opts.fileAllocation}`,
    `--allow-overwrite=${opts.allowOverwrite}`,
    `--auto-file-renaming=${opts.autoFileRenaming}`,
    `--max-connection-per-server=${opts.maxConnectionPerServer}`,
    `--timeout=${opts.timeout}`,
    `--connect-timeout=${opts.connectTimeout}`,
    `--lowest-speed-limit=${opts.lowestSpeedLimit}`,
    `--max-file-not-found=${opts.maxFileNotFound}`,
    `--disk-cache=${opts.diskCache}`
  ];
}
const LOCAL_LLM_ORCH_LOG_SCOPE = "local-llm-orch";
const INSTALL_STATUS = {
  NotInstalled: 0,
  DownloadStarting: 1,
  Downloading: 2,
  DownloadPaused: 3,
  DownloadCompleted: 4,
  DownloadFailed: 5,
  InstallStarting: 6,
  Installing: 7,
  InstallCompleted: 8,
  InstallFailed: 9
};
const INSTALL_STATUS_TEXT = {
  NotInstalled: "not_installed",
  DownloadStarting: "download_starting",
  Downloading: "downloading",
  DownloadPaused: "download_paused",
  DownloadCompleted: "download_completed",
  DownloadFailed: "download_failed",
  InstallStarting: "install_starting",
  Installing: "installing",
  InstallCompleted: "install_completed",
  InstallFailed: "install_failed"
};
const SERVICE_STATUS = {
  Starting: 1,
  Loading: 2,
  Running: 3,
  Stopped: 4,
  Error: 5
};
const START_DOWNLOAD_RETRY_DELAY_MS = 5e3;
const START_DOWNLOAD_MAX_RETRIES = 3;
const START_SERVICE_RETRY_DELAY_MS = 1e3;
const START_SERVICE_MAX_RETRIES = 3;
const SILENT_DOWNLOAD_DELAY_MS = 6e4;
const SUSPEND_COOLDOWN_MS = 5e3;
const CONSISTENCY_CHECK_DELAY_MS = 25e3;
const CONSISTENCY_CHECK_MAX_RETRIES = 3;
const DOWNLOAD_FAIL_RETRY_DELAYS_MS = [5e3, 15e3, 3e4];
const NETWORK_SETTLE_AFTER_RESUME_MS = 5e3;
const CHUNK_SIZE = 16 * 1024;
async function parseAria2ControlFile(controlFilePath) {
  const logger2 = getLogger(`${LOCAL_LLM_LOG_SCOPE}:aria2-control`);
  let buf;
  try {
    buf = await promises.readFile(controlFilePath);
  } catch {
    return null;
  }
  try {
    if (buf.length < 38) {
      logger2.warn(`[aria2-control] 控制文件过小: ${buf.length} bytes, path=${controlFilePath}`);
      return null;
    }
    let offset = 0;
    const version = buf.readUInt16BE(offset);
    offset += 2;
    if (version > 1) {
      logger2.warn(`[aria2-control] 不支持的版本: ${version}`);
      return null;
    }
    const readUInt32 = version === 1 ? (o) => buf.readUInt32BE(o) : (o) => buf.readUInt32LE(o);
    const readBigUInt64 = version === 1 ? (o) => buf.readBigUInt64BE(o) : (o) => buf.readBigUInt64LE(o);
    offset += 4;
    const infoHashLength = readUInt32(offset);
    offset += 4;
    offset += infoHashLength;
    const pieceLength = readUInt32(offset);
    offset += 4;
    const totalLength = Number(readBigUInt64(offset));
    offset += 8;
    offset += 8;
    const bitfieldLength = readUInt32(offset);
    offset += 4;
    const bitfield = buf.subarray(offset, offset + bitfieldLength);
    offset += bitfieldLength;
    const totalPieceCount = pieceLength > 0 ? Math.ceil(totalLength / pieceLength) : 0;
    let completedPieceCount = 0;
    for (let i = 0; i < bitfieldLength; i++) {
      completedPieceCount += countBits(bitfield[i]);
    }
    let completedBytes = 0;
    if (pieceLength > 0 && totalPieceCount > 0) {
      const lastPieceIndex = totalPieceCount - 1;
      const lastPieceLength = totalLength - lastPieceIndex * pieceLength;
      for (let pieceIdx = 0; pieceIdx < totalPieceCount; pieceIdx++) {
        const byteIdx = Math.floor(pieceIdx / 8);
        const bitIdx = 7 - pieceIdx % 8;
        if (byteIdx < bitfieldLength && (bitfield[byteIdx] & 1 << bitIdx) !== 0) {
          completedBytes += pieceIdx === lastPieceIndex ? lastPieceLength : pieceLength;
        }
      }
    }
    if (offset + 4 <= buf.length) {
      const numInFlight = readUInt32(offset);
      offset += 4;
      for (let i = 0; i < numInFlight; i++) {
        if (offset + 12 > buf.length) break;
        offset += 4;
        const pLength = readUInt32(offset);
        offset += 4;
        const pbfLength = readUInt32(offset);
        offset += 4;
        if (offset + pbfLength > buf.length) break;
        const pbf = buf.subarray(offset, offset + pbfLength);
        offset += pbfLength;
        const totalChunks = pLength > 0 ? Math.ceil(pLength / CHUNK_SIZE) : 0;
        const lastChunkSize = pLength - (totalChunks - 1) * CHUNK_SIZE;
        for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
          const cByteIdx = Math.floor(chunkIdx / 8);
          const cBitIdx = 7 - chunkIdx % 8;
          if (cByteIdx < pbfLength && (pbf[cByteIdx] & 1 << cBitIdx) !== 0) {
            completedBytes += chunkIdx === totalChunks - 1 ? lastChunkSize : CHUNK_SIZE;
          }
        }
      }
    }
    logger2.info(`[aria2-control] 解析成功: version=${version} pieceLength=${pieceLength} totalLength=${totalLength} completed=${completedPieceCount}/${totalPieceCount} pieces completedBytes=${completedBytes} (${totalLength > 0 ? Math.round(completedBytes / totalLength * 100) : 0}%)`);
    return {
      version,
      pieceLength,
      totalLength,
      completedPieceCount,
      totalPieceCount,
      completedBytes
    };
  } catch (err) {
    logger2.warn(`[aria2-control] 解析失败: ${err.message} path=${controlFilePath}`);
    return null;
  }
}
async function aria2ControlFileExists(controlFilePath) {
  try {
    await promises.access(controlFilePath);
    return true;
  } catch {
    return false;
  }
}
async function getFileSize(filePath) {
  try {
    const stat2 = await promises.stat(filePath);
    return stat2.size;
  } catch {
    return -1;
  }
}
function countBits(byte) {
  let count = 0;
  let n = byte;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}
const ERR_INVALID_REQUEST = 400;
const ERR_NETWORK = 500;
const ERR_IO = 600;
const ERR_ABORTED = 700;
const inflightTasks = /* @__PURE__ */ new Map();
const gidToDownloadId = /* @__PURE__ */ new Map();
let logger$B = null;
let reporter = () => {
};
let getInstallStateFn = () => "{}";
let aria2Manager$1 = null;
let rpcClient = null;
let pollTimer = null;
let idleShutdownTimer = null;
let startingPromise = null;
function log$2() {
  if (!logger$B) logger$B = getLogger(`${LOCAL_LLM_LOG_SCOPE}:downloader`);
  return logger$B;
}
function buildProgressJson(p) {
  const full = {
    downloaded_bytes: p.downloaded_bytes ?? 0,
    total_bytes: p.total_bytes ?? 0,
    speed: p.speed ?? 0,
    is_completed: p.is_completed ?? false,
    is_failed: p.is_failed ?? false,
    error_code: p.error_code ?? 0,
    error_message: p.error_message ?? ""
  };
  return JSON.stringify(full);
}
function parseRequest(json) {
  try {
    const obj = JSON.parse(json);
    if (obj && typeof obj === "object") {
      return obj;
    }
  } catch {
  }
  return {};
}
async function ensureDir(dir) {
  await promises.mkdir(dir, { recursive: true });
}
function checkSilentDownload() {
  try {
    const state2 = getInstallStateFn();
    const parsed = JSON.parse(state2);
    return Number(parsed.status) === INSTALL_STATUS.InstallCompleted;
  } catch {
    return false;
  }
}
async function ensureAria2Ready() {
  cancelIdleShutdown();
  if (rpcClient && aria2Manager$1?.isRunning) {
    return rpcClient;
  }
  if (startingPromise) {
    return startingPromise;
  }
  startingPromise = doStartAria2();
  try {
    const client = await startingPromise;
    return client;
  } finally {
    startingPromise = null;
  }
}
async function doStartAria2() {
  if (!aria2Manager$1) {
    aria2Manager$1 = new Aria2Manager();
  }
  log$2().info("[aria2] 懒启动 aria2c 子进程（大模型激进参数）...");
  const client = await aria2Manager$1.startSession(LLM_ARIA2_AGGRESSIVE_OPTIONS);
  rpcClient = client;
  startPolling();
  log$2().info("[aria2] aria2c 已就绪");
  return client;
}
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    void pollAllTasks();
  }, LLM_ARIA2_POLL_INTERVAL_MS);
}
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
function scheduleIdleShutdown() {
  cancelIdleShutdown();
  idleShutdownTimer = setTimeout(() => {
    void shutdownAria2();
  }, LLM_ARIA2_IDLE_SHUTDOWN_DELAY_MS);
  log$2().info(`[aria2] 所有下载完成，${LLM_ARIA2_IDLE_SHUTDOWN_DELAY_MS}ms 后自动退出 aria2c`);
}
function cancelIdleShutdown() {
  if (idleShutdownTimer) {
    clearTimeout(idleShutdownTimer);
    idleShutdownTimer = null;
  }
}
async function shutdownAria2() {
  stopPolling();
  cancelIdleShutdown();
  if (aria2Manager$1) {
    log$2().info("[aria2] 停止 aria2c 子进程");
    await aria2Manager$1.stopSession();
  }
  rpcClient = null;
}
async function pollAllTasks() {
  if (!rpcClient || inflightTasks.size === 0) return;
  const client = rpcClient;
  const now = Date.now();
  for (const task of inflightTasks.values()) {
    if (task.terminated) continue;
    try {
      const status = await client.tellStatus(task.gid);
      handleTaskStatus(task, status, now);
    } catch (err) {
      log$2().warn(`[aria2] tellStatus 失败 gid=${task.gid} id=${task.downloadId}: ${err.message}`);
      if (!aria2Manager$1?.isRunning) {
        terminateTask(task, {
          is_failed: true,
          error_code: ERR_NETWORK,
          error_message: "aria2c process died"
        });
      }
    }
  }
}
function handleTaskStatus(task, status, now) {
  const completedBytes = Number(status.completedLength);
  const totalBytes = Number(status.totalLength);
  const speed = Number(status.downloadSpeed);
  switch (status.status) {
    case "complete": {
      terminateTask(task, {
        downloaded_bytes: completedBytes,
        total_bytes: totalBytes > 0 ? totalBytes : completedBytes,
        speed,
        is_completed: true
      });
      break;
    }
    case "error": {
      const errorCode = status.errorCode ? Number(status.errorCode) : ERR_NETWORK;
      terminateTask(task, {
        downloaded_bytes: completedBytes,
        total_bytes: totalBytes,
        is_failed: true,
        error_code: errorCode,
        error_message: status.errorMessage ?? `aria2 error code=${status.errorCode}`
      });
      break;
    }
    case "removed": {
      terminateTask(task, {
        downloaded_bytes: completedBytes,
        total_bytes: totalBytes,
        is_failed: true,
        error_code: ERR_ABORTED,
        error_message: "removed"
      });
      break;
    }
    case "paused": {
      break;
    }
    case "active":
    case "waiting":
    default: {
      if (task.silent && !task.speedLimited && speed > 0 && rpcClient) {
        const limitSpeed = Math.max(
          Math.floor(speed * LLM_ARIA2_SILENT_SPEED_RATIO),
          LLM_ARIA2_SILENT_MIN_SPEED_LIMIT
        );
        log$2().info(`[download] 静默下载限速 id=${task.downloadId} gid=${task.gid} 原始速度=${speed}B/s 限速=${limitSpeed}B/s`);
        void rpcClient.changeOption(task.gid, {
          "max-download-limit": String(limitSpeed)
        }).then(() => {
          const tracked = inflightTasks.get(task.downloadId);
          if (tracked) tracked.speedLimited = true;
        }).catch((err) => {
          log$2().warn(`[aria2] changeOption 限速失败 gid=${task.gid}: ${err.message}`);
        });
      }
      const reportInterval = task.silent ? LLM_ARIA2_SILENT_PROGRESS_REPORT_MIN_INTERVAL_MS : LLM_ARIA2_PROGRESS_REPORT_MIN_INTERVAL_MS;
      if (now - task.lastReportMs >= reportInterval) {
        const pct = totalBytes > 0 ? Math.round(completedBytes / totalBytes * 100) : 0;
        const msg = `[download] 进度 id=${task.downloadId} gid=${task.gid} ${completedBytes}/${totalBytes} (${pct}%) speed=${speed}B/s status=${status.status}`;
        log$2().info(msg);
        reporter(task.downloadId, buildProgressJson({
          downloaded_bytes: completedBytes,
          total_bytes: totalBytes,
          speed,
          is_completed: false,
          is_failed: false
        }));
        const tracked = inflightTasks.get(task.downloadId);
        if (tracked) tracked.lastReportMs = now;
      }
      break;
    }
  }
}
function terminateTask(task, progress) {
  if (task.terminated) return;
  const tracked = inflightTasks.get(task.downloadId);
  if (tracked) tracked.terminated = true;
  const isComplete = progress.is_completed ?? false;
  const isFailed = progress.is_failed ?? false;
  const verb = isComplete ? "完成" : "失败";
  const msg = `[download] ${verb} id=${task.downloadId} gid=${task.gid} bytes=${progress.downloaded_bytes ?? 0}/${progress.total_bytes ?? 0}`;
  log$2().info(msg);
  reporter(task.downloadId, buildProgressJson(progress));
  inflightTasks.delete(task.downloadId);
  gidToDownloadId.delete(task.gid);
  if (rpcClient && (isComplete || isFailed)) {
    void rpcClient.purgeDownloadResult().catch(() => {
    });
  }
  if (inflightTasks.size === 0) {
    stopPolling();
    scheduleIdleShutdown();
  }
}
function setReporter(fn) {
  reporter = fn;
}
function setGetInstallStateFn(fn) {
  getInstallStateFn = fn;
}
function executeDownload(downloadId, taskJson) {
  void doExecute(downloadId, taskJson).catch((err) => {
    log$2().error(`[download] 未捕获异常 id=${downloadId}: ${err.message}`);
    reporter(downloadId, buildProgressJson({
      is_failed: true,
      error_code: ERR_IO,
      error_message: err.message ?? "unknown error"
    }));
  });
}
function abortDownload(downloadId) {
  const task = inflightTasks.get(downloadId);
  if (!task) return false;
  if (rpcClient) {
    void rpcClient.forceRemove(task.gid).catch((err) => {
      log$2().warn(`[aria2] forceRemove gid=${task.gid} 失败: ${err.message}`);
    });
  }
  terminateTask(task, {
    is_failed: true,
    error_code: ERR_ABORTED,
    error_message: "aborted by caller"
  });
  return true;
}
function pauseInflightDownload(downloadId) {
  const task = inflightTasks.get(downloadId);
  if (!task || task.terminated) {
    log$2().warn(`[download] pauseInflightDownload: 未找到任务或已终结 id=${downloadId}`);
    return false;
  }
  if (!rpcClient) {
    log$2().warn(`[download] pauseInflightDownload: rpcClient 不可用 id=${downloadId}`);
    return false;
  }
  const client = rpcClient;
  log$2().info(`[download] 暂停 id=${downloadId} gid=${task.gid}`);
  void client.forcePause(task.gid).catch((err) => {
    log$2().warn(`[aria2] forcePause gid=${task.gid} 失败: ${err.message}`);
  });
  return true;
}
const UNPAUSE_RETRY_DELAY_MS = 300;
const UNPAUSE_MAX_RETRIES = 5;
function resumeInflightDownload(downloadId) {
  const task = inflightTasks.get(downloadId);
  if (!task || task.terminated) {
    log$2().warn(`[download] resumeInflightDownload: 未找到任务或已终结 id=${downloadId}`);
    return false;
  }
  if (!rpcClient) {
    log$2().warn(`[download] resumeInflightDownload: rpcClient 不可用 id=${downloadId}`);
    return false;
  }
  const client = rpcClient;
  log$2().info(`[download] 恢复 id=${downloadId} gid=${task.gid}`);
  void doResumeWithRetry(client, task).catch((err) => {
    log$2().warn(`[aria2] unpause 最终失败 gid=${task.gid}: ${err.message}`);
  });
  return true;
}
async function doResumeWithRetry(client, task) {
  for (let attempt = 0; attempt < UNPAUSE_MAX_RETRIES; attempt++) {
    if (task.terminated) {
      log$2().info(`[aria2] unpause 放弃：任务已终结 gid=${task.gid}`);
      return;
    }
    try {
      const status = await client.tellStatus(task.gid);
      if (status.status === "active" || status.status === "waiting") {
        log$2().info(`[aria2] unpause 跳过：任务已是 ${status.status} gid=${task.gid}`);
        return;
      }
      if (status.status === "paused") {
        await client.unpause(task.gid);
        log$2().info(`[aria2] unpause 成功 gid=${task.gid}`);
        return;
      }
      log$2().warn(`[aria2] unpause 放弃：任务状态 ${status.status} gid=${task.gid}`);
      return;
    } catch (err) {
      const msg = `[aria2] unpause 第 ${attempt + 1}/${UNPAUSE_MAX_RETRIES} 次尝试失败 gid=${task.gid}: ${err.message}`;
      log$2().warn(msg);
    }
    await new Promise((r) => setTimeout(r, UNPAUSE_RETRY_DELAY_MS));
  }
  throw new Error(`unpause 重试 ${UNPAUSE_MAX_RETRIES} 次仍失败 gid=${task.gid}`);
}
function abortAllDownloads() {
  for (const task of inflightTasks.values()) {
    if (rpcClient && !task.terminated) {
      void rpcClient.forceRemove(task.gid).catch(() => {
      });
    }
    task.terminated = true;
  }
  inflightTasks.clear();
  gidToDownloadId.clear();
}
async function stopAria2() {
  abortAllDownloads();
  await shutdownAria2();
}
async function doExecute(downloadId, taskJson) {
  const request2 = parseRequest(taskJson);
  if (!request2.url || !request2.save_dir || !request2.file_name) {
    log$2().warn(`[download] 非法任务 id=${downloadId}: url/save_dir/file_name 必填`);
    reporter(downloadId, buildProgressJson({
      is_failed: true,
      error_code: ERR_INVALID_REQUEST,
      error_message: "missing url/save_dir/file_name"
    }));
    return;
  }
  const targetPath = join(request2.save_dir, request2.file_name);
  const allowResume = request2.allow_resume !== false;
  const silent = checkSilentDownload();
  const logMsg = `[download] 启动 id=${downloadId} name=${request2.name ?? ""} url=${request2.url} target=${targetPath} allow_resume=${allowResume} silent=${silent}`;
  log$2().info(logMsg);
  try {
    await ensureDir(dirname(targetPath));
  } catch (err) {
    log$2().error(`[download] mkdir 失败 id=${downloadId}: ${err.message}`);
    reporter(downloadId, buildProgressJson({
      is_failed: true,
      error_code: ERR_IO,
      error_message: `mkdir: ${err.message}`
    }));
    return;
  }
  if (!allowResume) {
    try {
      await promises.rm(targetPath, { force: true });
      await promises.rm(`${targetPath}.aria2`, { force: true });
    } catch {
    }
  } else {
    const controlFilePath = `${targetPath}.aria2`;
    const hasControlFile = await aria2ControlFileExists(controlFilePath);
    const dataFileSize = await getFileSize(targetPath);
    const expectedSize = request2.expected_size ?? 0;
    if (hasControlFile) {
      const controlInfo = await parseAria2ControlFile(controlFilePath);
      if (controlInfo) {
        const pct = controlInfo.totalLength > 0 ? Math.round(controlInfo.completedBytes / controlInfo.totalLength * 100) : 0;
        log$2().info(`[download] 续传校验 id=${downloadId}: .aria2 存在，真实已下载=${controlInfo.completedBytes} (${pct}%) 数据文件大小=${dataFileSize} 预期大小=${expectedSize}`);
      }
    } else if (dataFileSize > 0 && expectedSize > 0 && dataFileSize < expectedSize) {
      log$2().warn(`[download] 续传校验 id=${downloadId}: .aria2 控制文件缺失，数据文件不完整 (${dataFileSize}/${expectedSize})，无法确定有效下载区域，删除数据文件从头下载`);
      try {
        await promises.rm(targetPath, { force: true });
      } catch {
      }
    } else if (dataFileSize > 0) {
      log$2().info(`[download] 续传校验 id=${downloadId}: .aria2 不存在，数据文件大小=${dataFileSize} 预期大小=${expectedSize}，交由 aria2 判断`);
    }
  }
  let client;
  try {
    client = await ensureAria2Ready();
  } catch (err) {
    log$2().error(`[download] aria2c 启动失败 id=${downloadId}: ${err.message}`);
    reporter(downloadId, buildProgressJson({
      is_failed: true,
      error_code: ERR_NETWORK,
      error_message: `aria2c start failed: ${err.message}`
    }));
    return;
  }
  let gid;
  try {
    gid = await client.addUri([request2.url], {
      dir: request2.save_dir,
      out: request2.file_name,
      continue: allowResume
    });
  } catch (err) {
    log$2().error(`[download] aria2.addUri 失败 id=${downloadId}: ${err.message}`);
    reporter(downloadId, buildProgressJson({
      is_failed: true,
      error_code: ERR_NETWORK,
      error_message: `addUri: ${err.message}`
    }));
    return;
  }
  const task = {
    downloadId,
    request: request2,
    gid,
    targetPath,
    lastReportMs: 0,
    terminated: false,
    silent,
    speedLimited: false
  };
  inflightTasks.set(downloadId, task);
  gidToDownloadId.set(gid, downloadId);
  log$2().info(`[download] 已入队 id=${downloadId} gid=${gid}`);
  startPolling();
}
let binding = null;
let handle = 0n;
let isStub = false;
let initialized$1 = false;
let sdkInitialized = false;
let logger$A = null;
let sdkLogger = null;
const RECENT_LOG_LIMIT = 200;
const recentLogs = [];
let currentVersion = "";
const subscribedTokens = /* @__PURE__ */ new Map();
const bus = new EventEmitter();
bus.setMaxListeners(50);
const BUS_EVENT_LOG = "log";
const BUS_EVENT_SDK_EVENT = "sdk-event";
function log$1() {
  if (!logger$A) logger$A = getLogger(LOCAL_LLM_LOG_SCOPE);
  return logger$A;
}
function sdkLog() {
  if (!sdkLogger) sdkLogger = getLogger(LOCAL_LLM_SDK_LOG_SCOPE);
  return sdkLogger;
}
function assertMainProcess() {
  const t = process.type;
  if (t === "renderer" || t === "worker") {
    throw new Error(`local-llm 必须在主进程调用，当前 process.type=${String(t)}`);
  }
}
function pushRecentLog(entry) {
  recentLogs.push(entry);
  if (recentLogs.length > RECENT_LOG_LIMIT) {
    recentLogs.splice(0, recentLogs.length - RECENT_LOG_LIMIT);
  }
}
function forwardSdkLog(level, tag, msg) {
  const line = tag ? `[${tag}] ${msg}` : msg;
  const l = sdkLog();
  switch (level) {
    case LlmLogLevel.Error:
      l.error(line);
      break;
    case LlmLogLevel.Warn:
      l.warn(line);
      break;
    case LlmLogLevel.Info:
      l.info(line);
      break;
    case LlmLogLevel.Debug:
    case LlmLogLevel.Trace:
    default:
      l.error(line);
      break;
  }
}
function logSdkEvent(eventName, payloadJson) {
  switch (eventName) {
    case LLM_EVENT_NAMES.DownloadProgress: {
      try {
        const p = JSON.parse(payloadJson);
        const downloaded = p.downloaded_bytes ?? p.downloadedBytes ?? 0;
        const total = p.total_bytes ?? p.totalBytes ?? 0;
        const speed = p.speed ?? 0;
        const items = `${p.current_item_index ?? "?"}/${p.total_items ?? "?"}`;
        log$1().info(`[download-progress] ${downloaded}/${total} bytes  speed=${speed} B/s  items=${items}`);
      } catch {
        log$1().info(`[download-progress] ${payloadJson.slice(0, 300)}`);
      }
      break;
    }
    case LLM_EVENT_NAMES.InstallStatus: {
      log$1().info(`[install-status] ${payloadJson.slice(0, 500)}`);
      break;
    }
    case LLM_EVENT_NAMES.ServiceState: {
      log$1().info(`[service-state] ${payloadJson.slice(0, 500)}`);
      break;
    }
    case LLM_EVENT_NAMES.DeviceInfo: {
      log$1().info(`[device-info] ${payloadJson.slice(0, 500)}`);
      break;
    }
    default: {
      log$1().debug(`[sdk-event:${eventName}] ${payloadJson.slice(0, 300)}`);
      break;
    }
  }
}
async function initLocalLlm(options) {
  assertMainProcess();
  if (initialized$1) {
    log$1().debug("local-llm 已初始化，跳过");
    return !isStub;
  }
  if (process.platform !== "darwin") {
    log$1().info("local-llm 未启用（非 darwin 平台），走 stub");
    return bootstrapStub(options);
  }
  if (process.env[ENV_LLM_SDK_DISABLED]?.trim()) {
    log$1().info(`local-llm 被显式禁用（${ENV_LLM_SDK_DISABLED}），走 stub`);
    return bootstrapStub(options);
  }
  const result = loadNativeBinding();
  if (!result.binding) {
    log$1().warn(`local-llm addon 加载失败，走 stub: ${result.reason ?? "unknown"}`);
    reportBeaconEvent(LOCAL_LLM_REPORT_EVENTS.ADDON_LOAD_FAILED, {
      reason: result.reason ?? "unknown"
    });
    return bootstrapStub(options);
  }
  binding = result.binding;
  log$1().info(`local-llm addon 已加载 → ${result.resolvedPath ?? "(unknown path)"}`);
  try {
    const sdkOptions = {
      work_dir: options.create.workDir,
      cache_dir: options.create.cacheDir,
      service_bin_path: options.create.serviceBinPath
    };
    if (options.create.logLevel) sdkOptions.log_level = options.create.logLevel;
    if (options.create.appVersion) sdkOptions.app_version = options.create.appVersion;
    if (options.create.deviceGuid) sdkOptions.device_guid = options.create.deviceGuid;
    const optionsJson = JSON.stringify(sdkOptions);
    log$1().info(`[sdk-create] options=${optionsJson}`);
    const h = binding.create(optionsJson);
    if (h === 0n) {
      log$1().warn("local-llm create 返回 0 句柄（SDK 拒绝），走 stub");
      return bootstrapStub(options);
    }
    handle = h;
    binding.setLogCallback(handle, (level, tag, msg) => {
      setImmediate(() => {
        const entry = { timestamp: Date.now(), level, tag, msg };
        pushRecentLog(entry);
        forwardSdkLog(level, tag, msg);
        bus.emit(BUS_EVENT_LOG, entry);
      });
    });
    binding.setHttpCallback(handle, (requestJson) => {
      setImmediate(() => {
        log$1().info(`[http-bridge] SDK 请求: ${requestJson.slice(0, 200)}`);
        bus.emit(BUS_EVENT_SDK_EVENT, "http_request", requestJson);
        void executeHttpRequest(requestJson);
      });
    });
    log$1().info("HTTP 回调已自动注入（electron.net.fetch）");
    binding.setDownloadCallback(handle, (downloadId, taskJson) => {
      setImmediate(() => {
        log$1().info(`[download-bridge] SDK 下载请求 id=${downloadId}: ${taskJson.slice(0, 200)}`);
        bus.emit(BUS_EVENT_SDK_EVENT, "download_request", JSON.stringify({ download_id: downloadId.toString(), task: taskJson }));
        executeDownload(downloadId, taskJson);
      });
    });
    setReporter((downloadId, progressJson) => {
      reportDownloadProgress(downloadId, progressJson);
    });
    setGetInstallStateFn(() => getInstallState());
    binding.setDownloadPauseCallback(handle, (downloadId) => {
      setImmediate(() => {
        log$1().info(`[download-ctrl] SDK 请求暂停 id=${downloadId}`);
        pauseInflightDownload(downloadId);
      });
    });
    binding.setDownloadResumeCallback(handle, (downloadId) => {
      setImmediate(() => {
        log$1().info(`[download-ctrl] SDK 请求恢复 id=${downloadId}`);
        resumeInflightDownload(downloadId);
      });
    });
    binding.setDownloadCancelCallback(handle, (downloadId) => {
      setImmediate(() => {
        log$1().info(`[download-ctrl] SDK 请求取消 id=${downloadId}`);
        abortDownload(downloadId);
      });
    });
    log$1().info("下载控制回调已注入（pause/resume/cancel）");
    isStub = false;
    initialized$1 = true;
    log$1().info(`local-llm 创建完成 handle=${handle}`);
    reportBeaconEvent(LOCAL_LLM_REPORT_EVENTS.INIT_SUCCESS, {
      mod_id: LOCAL_LLM_MOD_ID,
      mod_name: LOCAL_LLM_MOD_NAME
    });
    if (options.autoInitialize !== false) {
      await initializeLocalLlm();
    }
    if (options.subscribeEvents) {
      for (const name of options.subscribeEvents) {
        subscribeEvent(name);
      }
      log$1().info(`事件订阅完成: [${Array.from(subscribedTokens.keys()).join(",")}]`);
    }
    return true;
  } catch (err) {
    log$1().warn(`local-llm 初始化抛错，降级 stub: ${err.message}`);
    reportBeaconRealtimeEvent(LOCAL_LLM_REPORT_EVENTS.SDK_CREATE_FAILED, {
      mod_id: LOCAL_LLM_MOD_ID,
      mod_name: LOCAL_LLM_MOD_NAME,
      error_msg: err.message ?? ""
    });
    if (binding && handle !== 0n) {
      try {
        binding.destroy(handle);
      } catch {
      }
    }
    handle = 0n;
    return bootstrapStub(options);
  }
}
async function bootstrapStub(options) {
  binding = createStubBinding();
  handle = binding.create(JSON.stringify(options.create));
  isStub = true;
  initialized$1 = true;
  if (options.autoInitialize !== false) {
    await binding.initialize(handle);
    sdkInitialized = true;
  }
  return false;
}
async function initializeLocalLlm() {
  if (!binding || handle === 0n) {
    log$1().warn("initializeLocalLlm: 未初始化");
    return -1;
  }
  const rc = await binding.initialize(handle);
  if (rc === 0) {
    sdkInitialized = true;
    try {
      currentVersion = binding.getCurrentVersion(handle) ?? "";
    } catch {
      currentVersion = "";
    }
    log$1().info(`local-llm initialize 成功 currentVersion=${currentVersion || "(empty)"}`);
    const diRc = refreshDeviceInfo();
    log$1().info(`initialize 后 refreshDeviceInfo rc=${diRc}`);
  } else {
    log$1().warn(`local-llm initialize 失败 rc=${rc}`);
  }
  return rc;
}
function shutdownLocalLlm() {
  if (!binding || handle === 0n) return;
  try {
    binding.shutdown(handle);
  } catch (err) {
    log$1().warn(`shutdown 抛错: ${err.message}`);
  }
  sdkInitialized = false;
  log$1().info("local-llm shutdown 完成");
}
async function destroyLocalLlm() {
  if (!binding || handle === 0n) return;
  try {
    await stopAria2();
  } catch {
  }
  for (const [name, token] of subscribedTokens) {
    try {
      binding.removeListener(handle, token);
    } catch (err) {
      log$1().debug(`removeListener(${name}) 抛错: ${err.message}`);
    }
  }
  subscribedTokens.clear();
  try {
    binding.destroy(handle);
  } catch (err) {
    log$1().warn(`destroy 抛错: ${err.message}`);
  }
  handle = 0n;
  initialized$1 = false;
  sdkInitialized = false;
  log$1().info("local-llm destroy 完成");
}
function subscribeEvent(eventName) {
  if (!binding || handle === 0n) return false;
  if (subscribedTokens.has(eventName)) return true;
  try {
    const token = binding.addListener(handle, eventName, (name, payload) => {
      setImmediate(() => {
        logSdkEvent(name, payload);
        bus.emit(BUS_EVENT_SDK_EVENT, name, payload);
      });
    });
    if (token === 0n) {
      log$1().warn(`addListener(${eventName}) 返回 0 token`);
      return false;
    }
    subscribedTokens.set(eventName, token);
    log$1().debug(`addListener(${eventName}) 订阅成功 token=${token}`);
    return true;
  } catch (err) {
    log$1().warn(`addListener(${eventName}) 抛错: ${err.message}`);
    return false;
  }
}
function onLlmLog(listener) {
  bus.on(BUS_EVENT_LOG, listener);
  return () => bus.off(BUS_EVENT_LOG, listener);
}
function onLlmEvent(observer) {
  bus.on(BUS_EVENT_SDK_EVENT, observer);
  return () => bus.off(BUS_EVENT_SDK_EVENT, observer);
}
function emitSyntheticServiceState(payloadJson) {
  log$1().info(`[synthetic-service-state] ${payloadJson.slice(0, 500)}`);
  bus.emit(BUS_EVENT_SDK_EVENT, LLM_EVENT_NAMES.ServiceState, payloadJson);
}
function getCurrentVersion() {
  if (!binding || handle === 0n) return "";
  try {
    const ver = binding.getCurrentVersion(handle) ?? "";
    currentVersion = ver || currentVersion;
    return ver;
  } catch (err) {
    log$1().warn(`getCurrentVersion 抛错: ${err.message}`);
    return "";
  }
}
function getLlmSnapshot() {
  if (binding && handle !== 0n && !isStub) {
    try {
      currentVersion = binding.getCurrentVersion(handle) ?? currentVersion;
    } catch {
    }
  }
  return {
    isNative: !isStub && initialized$1,
    isInitialized: sdkInitialized,
    recentLogs: recentLogs.slice(),
    // 拷贝一份，避免外部改写
    currentVersion,
    subscribedEvents: Array.from(subscribedTokens.keys())
  };
}
function isLocalLlmReady() {
  return sdkInitialized;
}
function setHttpHandler(httpHandler) {
  if (!binding || handle === 0n) return;
  try {
    binding.setHttpCallback(handle, httpHandler);
    log$1().debug("setHttpCallback 已注入");
  } catch (err) {
    log$1().warn(`setHttpCallback 抛错: ${err.message}`);
  }
}
function setDownloadHandler(downloadHandler) {
  if (!binding || handle === 0n) return;
  try {
    binding.setDownloadCallback(handle, downloadHandler);
    log$1().debug("setDownloadCallback 已注入");
  } catch (err) {
    log$1().warn(`setDownloadCallback 抛错: ${err.message}`);
  }
}
function reportHttpResponse(responseJson) {
  if (!binding || handle === 0n) return;
  setImmediate(() => {
    try {
      binding.reportHttpResponse(handle, responseJson);
    } catch (err) {
      log$1().warn(`reportHttpResponse 抛错: ${err.message}`);
    }
  });
}
function reportDownloadProgress(downloadId, progressJson) {
  if (!binding || handle === 0n) return;
  setImmediate(() => {
    try {
      binding.reportDownloadProgress(handle, downloadId, progressJson);
    } catch (err) {
      log$1().warn(`reportDownloadProgress 抛错: ${err.message}`);
    }
  });
}
function refreshDeviceInfo() {
  if (!binding || handle === 0n) return -1;
  try {
    return binding.refreshDeviceInfo(handle);
  } catch (err) {
    log$1().warn(`refreshDeviceInfo 抛错: ${err.message}`);
    return -1;
  }
}
function startAutoDetection() {
  if (!binding || handle === 0n) return -1;
  try {
    return binding.startAutoDetection(handle);
  } catch (err) {
    log$1().warn(`startAutoDetection 抛错: ${err.message}`);
    return -1;
  }
}
function getDeviceInfo() {
  if (!binding || handle === 0n) return "{}";
  try {
    const info = binding.getDeviceInfo(handle);
    log$1().info(`getDeviceInfo: ${info}`);
    return info;
  } catch (err) {
    log$1().warn(`getDeviceInfo 抛错: ${err.message}`);
    return "{}";
  }
}
function getServiceState() {
  if (!binding || handle === 0n) return "{}";
  try {
    return binding.getServiceState(handle);
  } catch (err) {
    log$1().warn(`getServiceState 抛错: ${err.message}`);
    return "{}";
  }
}
function getInstallState() {
  if (!binding || handle === 0n) return "{}";
  try {
    const state2 = binding.getInstallState(handle);
    log$1().info(`getInstallState: ${state2}`);
    return state2;
  } catch (err) {
    log$1().warn(`getInstallState 抛错: ${err.message}`);
    return "{}";
  }
}
function loadDeviceInfoFromCache() {
  if (!binding || handle === 0n) return -1;
  try {
    const rc = binding.loadDeviceInfoFromCache(handle);
    log$1().info(`loadDeviceInfoFromCache: rc=${rc}`);
    return rc;
  } catch (err) {
    log$1().warn(`loadDeviceInfoFromCache 抛错: ${err.message}`);
    return -1;
  }
}
function isServiceReady() {
  if (!binding || handle === 0n) return false;
  try {
    return binding.isServiceReady(handle);
  } catch (err) {
    log$1().warn(`isServiceReady 抛错: ${err.message}`);
    return false;
  }
}
function startDownload() {
  if (!binding || handle === 0n) {
    log$1().warn(`startDownload 失败: SDK 未就绪 (binding=${!!binding}, handle=${handle})`);
    return -1;
  }
  try {
    return binding.startDownload(handle);
  } catch (err) {
    log$1().warn(`startDownload 抛错: ${err.message}`);
    return -1;
  }
}
function pauseDownload() {
  if (!binding || handle === 0n) return -1;
  try {
    return binding.pauseDownload(handle);
  } catch (err) {
    log$1().warn(`pauseDownload 抛错: ${err.message}`);
    return -1;
  }
}
function resumeDownload() {
  if (!binding || handle === 0n) return -1;
  try {
    return binding.resumeDownload(handle);
  } catch (err) {
    log$1().warn(`resumeDownload 抛错: ${err.message}`);
    return -1;
  }
}
function cancelDownload() {
  if (!binding || handle === 0n) return -1;
  try {
    return binding.cancelDownload(handle);
  } catch (err) {
    log$1().warn(`cancelDownload 抛错: ${err.message}`);
    return -1;
  }
}
function startSilentDownload() {
  if (!binding || handle === 0n) return -1;
  try {
    return binding.startSilentDownload(handle);
  } catch (err) {
    log$1().warn(`startSilentDownload 抛错: ${err.message}`);
    return -1;
  }
}
function activateAndLaunch() {
  if (!binding || handle === 0n) return -1;
  try {
    return binding.activateAndLaunch(handle);
  } catch (err) {
    log$1().warn(`activateAndLaunch 抛错: ${err.message}`);
    return -1;
  }
}
function activateNewVersion() {
  if (!binding || handle === 0n) return -1;
  try {
    return binding.activateNewVersion(handle);
  } catch (err) {
    log$1().warn(`activateNewVersion 抛错: ${err.message}`);
    return -1;
  }
}
function cleanupOldVersions(keepCount = 1) {
  if (!binding || handle === 0n) return -1;
  try {
    return binding.cleanupOldVersions(handle, keepCount);
  } catch (err) {
    log$1().warn(`cleanupOldVersions 抛错: ${err.message}`);
    return -1;
  }
}
function startService(launchInfoJson) {
  if (!binding || handle === 0n) return -1;
  try {
    let effectiveLaunchInfo = launchInfoJson;
    if (!effectiveLaunchInfo) {
      const verJson = binding.getCurrentVersion(handle) ?? "";
      if (verJson) {
        try {
          const ver = JSON.parse(verJson);
          const enginePath = ver.engine_path ?? "";
          const modelFilePath = ver.model_path ?? "";
          if (!enginePath || !modelFilePath) {
            log$1().warn(`startService: 关键路径为空，跳过启动 (engine_path='${enginePath}', model_file_path='${modelFilePath}')`);
            return -1;
          }
          const launchInfo = {
            engine_path: enginePath,
            model_file_path: modelFilePath,
            runtime_args: ver.runtime_args ?? "",
            model_load_size: 0
          };
          effectiveLaunchInfo = JSON.stringify(launchInfo);
        } catch {
          log$1().warn("startService: 解析 currentVersion JSON 失败，使用原始值");
          effectiveLaunchInfo = verJson;
        }
      }
    }
    log$1().info(`startService launchInfo=${effectiveLaunchInfo || "(empty)"}`);
    return binding.startService(handle, effectiveLaunchInfo || void 0);
  } catch (err) {
    log$1().warn(`startService 抛错: ${err.message}`);
    return -1;
  }
}
function stopService() {
  if (!binding || handle === 0n) return -1;
  try {
    return binding.stopService(handle);
  } catch (err) {
    log$1().warn(`stopService 抛错: ${err.message}`);
    return -1;
  }
}
function getNewVersion() {
  if (!binding || handle === 0n) return "";
  try {
    return binding.getNewVersion(handle);
  } catch (err) {
    log$1().warn(`getNewVersion 抛错: ${err.message}`);
    return "";
  }
}
function setNewVersion(versionJson) {
  if (!binding || handle === 0n) return -1;
  try {
    return binding.setNewVersion(handle, versionJson);
  } catch (err) {
    log$1().warn(`setNewVersion 抛错: ${err.message}`);
    return -1;
  }
}
async function executeHttpRequest(requestJson) {
  let requestId = "";
  try {
    const req = JSON.parse(requestJson);
    requestId = req.request_id ?? "";
    let headers = {};
    if (req.headers_json) {
      try {
        headers = JSON.parse(req.headers_json);
      } catch {
      }
    }
    const timeoutMs = req.timeout_ms ?? 15e3;
    const controller = new AbortController();
    const timer2 = setTimeout(() => controller.abort(), timeoutMs);
    const response = await net.fetch(req.url, {
      method: req.method || "POST",
      headers,
      body: req.body || void 0,
      signal: controller.signal
    });
    clearTimeout(timer2);
    const body = await response.text();
    const responseJson = JSON.stringify({
      request_id: requestId,
      success: response.ok,
      http_code: response.status,
      body,
      error_message: response.ok ? "" : `HTTP ${response.status}`
    });
    log$1().info(`[http-bridge] 响应 url=${req.url} status=${response.status} body_len=${body.length}`);
    reportHttpResponse(responseJson);
  } catch (err) {
    const errMsg = err.message ?? String(err);
    log$1().warn(`[http-bridge] 请求失败 request_id=${requestId}: ${errMsg}`);
    const responseJson = JSON.stringify({
      request_id: requestId,
      success: false,
      http_code: 0,
      body: "",
      error_message: errMsg
    });
    reportHttpResponse(responseJson);
  }
}
const logger$z = getLogger("jsb:LocalLLMManager");
class LocalLLMManagerHandler extends BaseHandler {
  name = "LocalLLMManager";
  // ─── 监听注册中心 ─────────────────────────────────────
  llmStatusListeners = new ListenerRegistry();
  serviceStatusListeners = new ListenerRegistry();
  deviceInfoListeners = new ListenerRegistry();
  // ─── dispose 函数列表 ─────────────────────────────────
  disposers = [];
  // ─── 静默下载拦截标记 ──────────────────────────────────
  /**
   * 模型是否已安装完成
   *
   * 在 AddLlmStatusListener 注册时根据当前 installState 初始化；
   * 在 broadcastEvent 收到 install_completed 时也会翻转为 true。
   * 一旦模型已安装，后续的 llmStatus（InstallStatus）事件属于静默下载，不再派发给前端。
   */
  llmInstalled = false;
  // ─── 设置持久化 ────────────────────────────────────────
  settingsStore;
  constructor() {
    super();
    this.settingsStore = new SettingsStore();
    const dispose = onLlmEvent((eventName, payloadJson) => this.broadcastEvent(eventName, payloadJson));
    this.disposers.push(dispose);
  }
  // ─── 生命周期钩子 ─────────────────────────────────────
  onWebContentsDestroyed(webContentsId) {
    this.llmStatusListeners.removeByWebContents(webContentsId);
    this.serviceStatusListeners.removeByWebContents(webContentsId);
    this.deviceInfoListeners.removeByWebContents(webContentsId);
  }
  dispose() {
    for (const d of this.disposers) {
      try {
        d();
      } catch {
      }
    }
    this.disposers.length = 0;
    this.llmStatusListeners.clear();
    this.serviceStatusListeners.clear();
    this.deviceInfoListeners.clear();
  }
  // ─── 监听族（注册即 ack，后续事件通过同一 cid 推送） ────
  /**
   * 大模型安装状态监听 — 注册后立即通过 getInstallState 推送当前状态
   */
  async AddLlmStatusListener(ctx, callbackId) {
    logger$z.debug(`AddLlmStatusListener cid=${callbackId}`);
    this.llmStatusListeners.add(ctx, callbackId);
    const state2 = getInstallState();
    logger$z.info(`AddLlmStatusListener: installState=${state2}`);
    try {
      const parsed = JSON.parse(state2);
      if (Number(parsed.status) === INSTALL_STATUS.InstallCompleted) {
        this.llmInstalled = true;
        logger$z.info("AddLlmStatusListener: 模型已安装，设置 llmInstalled=true");
      }
    } catch {
    }
    ctx.emit(callbackId, JsbCode.kSuccess, state2);
  }
  /**
   * 本地模型服务状态监听 — 对齐 Windows PC 端：注册后立即推送当前状态
   *
   * Windows 实现：首次调用从 `LocalModelClient::Instance()` 读取当前状态立即推送，
   * 若当前状态为 kError 还会补充缓存的错误信息。
   * Mac 实现：从 `getServiceState()` 读取当前状态 JSON 立即推送。
   */
  async AddLLMServiceStatusListener(ctx, callbackId) {
    logger$z.debug(`AddLLMServiceStatusListener cid=${callbackId}`);
    this.serviceStatusListeners.add(ctx, callbackId);
    let payload;
    try {
      const stateJson = getServiceState();
      if (stateJson && stateJson !== "{}") {
        payload = stateJson;
      } else {
        payload = JSON.stringify({
          status: 0,
          service_port: 0,
          service_ip: "",
          error_message: "",
          error_code: 0,
          is_retry_failed: false
        });
      }
    } catch (err) {
      const errMsg = err.message ?? "unknown";
      logger$z.warn(`AddLLMServiceStatusListener: 获取 serviceState 失败: ${errMsg}`);
      payload = JSON.stringify({
        status: SERVICE_STATUS.Error,
        service_port: 0,
        service_ip: "",
        error_message: errMsg,
        error_code: -1,
        is_retry_failed: true
      });
    }
    ctx.emit(callbackId, JsbCode.kSuccess, payload);
  }
  /**
   * 设备信息监听 — 对齐 Windows PC 端：注册后立即推送当前设备信息
   *
   * Windows 实现：注册 listener 后若有缓存的 DeviceInfoResult 则立即推送。
   * Mac 实现：从 `getDeviceInfo()` 读取当前设备信息 JSON 立即推送。
   */
  async AddDeviceInfoListener(ctx, callbackId) {
    logger$z.debug(`AddDeviceInfoListener cid=${callbackId}`);
    this.deviceInfoListeners.add(ctx, callbackId);
    const loadRc = loadDeviceInfoFromCache();
    logger$z.info(`AddDeviceInfoListener: loadDeviceInfoFromCache rc=${loadRc}`);
    const info = getDeviceInfo();
    ctx.emit(callbackId, JsbCode.kSuccess, info);
  }
  // ─── 查询族 ───────────────────────────────────────────
  /**
   * 大模型安装状态 — 通过 getInstallState 直接获取当前安装状态
   */
  async GetLlmStatus(ctx, callbackId) {
    logger$z.debug(`GetLlmStatus cid=${callbackId}`);
    const state2 = getInstallState();
    logger$z.info(`GetLlmStatus: installState=${state2}`);
    ctx.emit(callbackId, JsbCode.kSuccess, state2);
  }
  /** 设备信息 — 直接透传 SDK 返回的 JSON */
  async GetDeviceInfo(ctx, callbackId) {
    logger$z.debug(`GetDeviceInfo cid=${callbackId}`);
    const loadRc = loadDeviceInfoFromCache();
    logger$z.info(`GetDeviceInfo: loadDeviceInfoFromCache rc=${loadRc}`);
    const info = getDeviceInfo();
    ctx.emit(callbackId, JsbCode.kSuccess, info);
  }
  /** 设备条件 — 从设备信息中提取（当前直接透传） */
  async GetDeviceCondition(ctx, callbackId) {
    logger$z.debug(`GetDeviceCondition cid=${callbackId}`);
    const info = getDeviceInfo();
    ctx.emit(callbackId, JsbCode.kSuccess, info);
  }
  /**
   * 获取当前 AI 工作模式 — 从 SettingsStore 读取持久化值
   *
   * 注意：前端 adapter 实际调用的是 `MarvisAgent.GetWorkMode`（见 marvis-agent.ts），
   * 这里保留是为了兼容可能仍旧依赖 LocalLLMManager.GetWorkMode 的老链路 / 测试代码。
   * 两个 handler 共享同一个 SettingsStore 持久化文件，数据一致。
   */
  async GetWorkMode(ctx, callbackId) {
    const mode = this.settingsStore.getWorkMode();
    logger$z.debug(`GetWorkMode cid=${callbackId} -> ${mode}`);
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ code: 0, mode_value: mode }));
  }
  // ─── 下载族 ───────────────────────────────────────────
  /** 开始下载 */
  async StartDownload(ctx, callbackId) {
    logger$z.info(`StartDownload cid=${callbackId}`);
    const rc = startDownload();
    ctx.emit(callbackId, rc === 0 ? JsbCode.kSuccess : JsbCode.kError, JSON.stringify({ code: rc }));
  }
  /** 暂停下载 */
  async PauseDownload(ctx, callbackId) {
    logger$z.info(`PauseDownload cid=${callbackId}`);
    const rc = pauseDownload();
    ctx.emit(callbackId, rc === 0 ? JsbCode.kSuccess : JsbCode.kError, JSON.stringify({ code: rc }));
  }
  /** 恢复下载 */
  async ResumeDownload(ctx, callbackId) {
    logger$z.info(`ResumeDownload cid=${callbackId}`);
    const rc = resumeDownload();
    ctx.emit(callbackId, rc === 0 ? JsbCode.kSuccess : JsbCode.kError, JSON.stringify({ code: rc }));
  }
  /** 取消下载 */
  async CancelDownload(ctx, callbackId) {
    logger$z.info(`CancelDownload cid=${callbackId}`);
    const rc = cancelDownload();
    ctx.emit(callbackId, rc === 0 ? JsbCode.kSuccess : JsbCode.kError, JSON.stringify({ code: rc }));
  }
  // ─── 服务族 ───────────────────────────────────────────
  /**
   * 大模型是否就绪 — 对齐 Windows PC 端 LLMReadyStatus 结构
   *
   * 就绪判断：SDK 已 initialize + 服务正在运行（isServiceReady）
   * 返回结构：`{ready, engine_framework, engine_version, model_id, model_name}`
   */
  async IsLLMReady(ctx, callbackId) {
    logger$z.debug(`IsLLMReady cid=${callbackId}`);
    const ready = isLocalLlmReady() && isServiceReady();
    const result = {
      ready,
      engine_framework: "",
      engine_version: "",
      model_id: "",
      model_name: ""
    };
    if (ready) {
      try {
        const verJson = getCurrentVersion();
        if (verJson) {
          const ver = JSON.parse(verJson);
          result.engine_framework = ver.engine_name ?? "";
          result.engine_version = ver.engine_version ?? "";
          result.model_id = ver.model_name ?? "";
          result.model_name = ver.model_name ?? "";
        }
      } catch {
        logger$z.warn("IsLLMReady: 解析 currentVersion 失败");
      }
    }
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(result));
  }
  /**
   * 本地模型服务是否曾经成功拉起过 — 对齐 Windows PC 端语义
   *
   * 通过 `getCurrentVersion()` 判断：Current 版本槽位仅在服务成功启动后写入，
   * 有值即代表曾成功拉起过。
   */
  async HasLocalModelServiceLaunched(ctx, callbackId) {
    logger$z.debug(`HasLocalModelServiceLaunched cid=${callbackId}`);
    let launched = false;
    try {
      const verJson = getCurrentVersion();
      if (verJson) {
        const ver = JSON.parse(verJson);
        launched = Boolean(ver.engine_name) || Boolean(ver.model_name);
      }
    } catch {
      logger$z.warn("HasLocalModelServiceLaunched: 解析 currentVersion 失败");
    }
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ launched }));
  }
  /**
   * 启动本地模型服务 — 对齐 Windows PC 端 `{code, message}` 返回格式
   *
   * 返回码说明：
   *   - 0 = `service_starting`    启动指令已发出
   *   - 1 = `engine_not_installed` 引擎未安装
   *   - 2 = `model_not_installed`  模型未安装
   *   - 3 = `start_failed`        startService 同步返回失败
   */
  async StartLocalModelService(ctx, callbackId) {
    logger$z.info(`StartLocalModelService cid=${callbackId}`);
    try {
      const verJson = getCurrentVersion();
      if (verJson) {
        const ver = JSON.parse(verJson);
        if (!ver.engine_path && !ver.engine_name) {
          ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ code: 1, message: "engine_not_installed" }));
          return;
        }
        if (!ver.model_path && !ver.model_name) {
          ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ code: 2, message: "model_not_installed" }));
          return;
        }
      } else {
        ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ code: 1, message: "engine_not_installed" }));
        return;
      }
    } catch {
      logger$z.warn("StartLocalModelService: 解析 currentVersion 失败");
    }
    const rc = startService();
    if (rc === 0) {
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ code: 0, message: "service_starting" }));
    } else {
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ code: 3, message: "start_failed" }));
    }
  }
  /** 刷新设备信息：refresh → loadDeviceInfoFromCache → getDeviceInfo 回调 */
  async RefreshDeviceInfo(ctx, callbackId) {
    logger$z.info(`RefreshDeviceInfo cid=${callbackId}`);
    const rc = refreshDeviceInfo();
    logger$z.info(`RefreshDeviceInfo: refreshDeviceInfo rc=${rc}`);
    const loadRc = loadDeviceInfoFromCache();
    logger$z.info(`RefreshDeviceInfo: loadDeviceInfoFromCache rc=${loadRc}`);
    const info = getDeviceInfo();
    logger$z.info(`RefreshDeviceInfo: getDeviceInfo=${info}`);
    ctx.emit(callbackId, JsbCode.kSuccess, info);
  }
  // ─── 内部方法：事件分发 ────────────────────────────────
  broadcastEvent(eventName, payloadJson) {
    let registry2;
    switch (eventName) {
      case LLM_EVENT_NAMES.InstallStatus: {
        if (this.llmInstalled) {
          logger$z.info(`broadcastEvent: llmInstalled=true，拦截 InstallStatus 事件不派发 payload=${payloadJson}`);
          return;
        }
        try {
          const parsed = JSON.parse(payloadJson);
          if (Number(parsed.status) === INSTALL_STATUS.InstallCompleted) {
            this.llmInstalled = true;
            logger$z.info("broadcastEvent: 首次安装完成，派发本次事件后设置 llmInstalled=true");
          }
        } catch {
        }
        registry2 = this.llmStatusListeners;
        break;
      }
      case LLM_EVENT_NAMES.ServiceState:
        registry2 = this.serviceStatusListeners;
        break;
      case LLM_EVENT_NAMES.DeviceInfo:
        registry2 = this.deviceInfoListeners;
        break;
      default:
        return;
    }
    const entries2 = [...registry2.aliveEntries()];
    logger$z.info(`broadcastEvent: event=${eventName} listenerCount=${entries2.length} payload=${payloadJson}`);
    for (const entry of entries2) {
      logger$z.debug(`broadcastEvent: emit to cid=${entry.callbackId}`);
      entry.ctx.emit(entry.callbackId, JsbCode.kSuccess, payloadJson);
    }
  }
}
const logger$y = getLogger("jsb:LocalLLMManagerV2");
class LocalLLMManagerV2Handler extends BaseHandler {
  name = "LocalLLMManagerV2";
  /** 日志流监听 */
  logListeners = new ListenerRegistry();
  /** 事件监听：eventName → ListenerRegistry */
  eventListeners = /* @__PURE__ */ new Map();
  /** 模块级 dispose 清理函数 */
  disposers = [];
  constructor() {
    super();
    this.disposers.push(onLlmLog((entry) => this.broadcastLog(entry)));
    this.disposers.push(onLlmEvent((eventName, payloadJson) => this.broadcastEvent(eventName, payloadJson)));
  }
  // ─── A1 方法 ─────────────────────────────────────────
  /**
   * 初始化 SDK（幂等）
   *
   * 前端点「初始化 SDK」按钮时调用。返回快照 JSON。
   */
  async InitializeSDK(ctx, callbackId, ..._args) {
    logger$y.info(`InitializeSDK cid=${callbackId}`);
    try {
      const { app: app2 } = await import("electron");
      const { getResourcePath: getResourcePath2 } = await Promise.resolve().then(() => resource);
      const workDir = `${app2.getPath("userData")}/llm-sdk`;
      await initLocalLlm({
        create: {
          workDir,
          cacheDir: `${workDir}/cache`,
          serviceBinPath: getResourcePath2("bin", "llm_service"),
          logLevel: "debug"
        },
        subscribeEvents: Object.values(LLM_EVENT_NAMES),
        autoInitialize: true
      });
      const snapshot2 = getLlmSnapshot();
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(snapshot2));
    } catch (err) {
      logger$y.error(`InitializeSDK 失败: ${err.message}`);
      ctx.emit(callbackId, JsbCode.kError, "", err.message);
    }
  }
  /**
   * 重新 initialize（SDK 已 create 场景下手动触发）
   */
  async ReInitialize(ctx, callbackId) {
    logger$y.info(`ReInitialize cid=${callbackId}`);
    const rc = await initializeLocalLlm();
    ctx.emit(callbackId, rc === 0 ? JsbCode.kSuccess : JsbCode.kError, JSON.stringify({ code: rc }));
  }
  /**
   * 关闭 SDK（不销毁句柄，可再次 ReInitialize）
   */
  async ShutdownSDK(ctx, callbackId) {
    logger$y.info(`ShutdownSDK cid=${callbackId}`);
    shutdownLocalLlm();
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  /**
   * 读快照
   */
  async GetSnapshot(ctx, callbackId) {
    const snapshot2 = getLlmSnapshot();
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(snapshot2));
  }
  /**
   * SDK 是否已 initialize
   */
  async IsReady(ctx, callbackId) {
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ ready: isLocalLlmReady() }));
  }
  /**
   * 订阅 SDK 日志流
   *
   * 通过同一 callbackId 多次 emit（监听模式）。
   * 前端收到的 data 格式：JSON `{timestamp, level, tag, msg}`
   */
  async AddLogListener(ctx, callbackId) {
    logger$y.debug(`AddLogListener cid=${callbackId}`);
    this.logListeners.add(ctx, callbackId);
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  /**
   * 订阅指定 SDK 事件
   *
   * 用法：`LocalLLMManagerV2.AddEventListener(callbackId, "install_status")`
   *
   * 通过同一 callbackId 多次推送事件 payload。
   */
  async AddEventListener(ctx, callbackId, ...args) {
    const eventName = typeof args[0] === "string" ? args[0] : "";
    if (!eventName) {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "eventName required");
      return;
    }
    logger$y.debug(`AddEventListener cid=${callbackId} event=${eventName}`);
    let reg = this.eventListeners.get(eventName);
    if (!reg) {
      reg = new ListenerRegistry();
      this.eventListeners.set(eventName, reg);
    }
    reg.add(ctx, callbackId);
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  // ─── A2：设备检测 + 查询 ─────────────────────────────────
  /**
   * 触发设备信息刷新（异步 → 结果通过 device_info 事件推送到 AddEventListener）
   */
  async RefreshDeviceInfo(ctx, callbackId) {
    logger$y.info(`RefreshDeviceInfo cid=${callbackId}`);
    const rc = refreshDeviceInfo();
    ctx.emit(callbackId, rc === 0 ? JsbCode.kSuccess : JsbCode.kError, JSON.stringify({ code: rc }));
  }
  /** 启动自动检测 */
  async StartAutoDetection(ctx, callbackId) {
    logger$y.info(`StartAutoDetection cid=${callbackId}`);
    const rc = startAutoDetection();
    ctx.emit(callbackId, rc === 0 ? JsbCode.kSuccess : JsbCode.kError, JSON.stringify({ code: rc }));
  }
  /** 同步读取设备信息 JSON */
  async GetDeviceInfo(ctx, callbackId) {
    const info = getDeviceInfo();
    ctx.emit(callbackId, JsbCode.kSuccess, info);
  }
  /** 同步读取服务状态 JSON */
  async GetServiceState(ctx, callbackId) {
    const state2 = getServiceState();
    ctx.emit(callbackId, JsbCode.kSuccess, state2);
  }
  /** 服务是否就绪 */
  async IsServiceReady(ctx, callbackId) {
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ ready: isServiceReady() }));
  }
  /**
   * 回传 HTTP 响应给 SDK（前端 / 调试台手动回传用）
   *
   * args[0] = responseJson 字符串
   */
  async ReportHttpResponse(ctx, callbackId, ...args) {
    const responseJson = typeof args[0] === "string" ? args[0] : "";
    if (!responseJson) {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "responseJson required");
      return;
    }
    logger$y.debug(`ReportHttpResponse cid=${callbackId}`);
    reportHttpResponse(responseJson);
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  /**
   * 注入 HTTP 回调桥接（SDK 的 HTTP 请求通过此通道由 TS 层 electron.net.fetch 执行）
   *
   * 前端调用此方法后，SDK 发起的 HTTP 请求将通过 `http_request` 伪事件推送到此 cid。
   * 前端收到后执行请求，再调 `ReportHttpResponse` 回传结果。
   */
  async EnableHttpBridge(ctx, callbackId) {
    logger$y.info(`EnableHttpBridge cid=${callbackId}`);
    let httpReg = this.eventListeners.get("http_request");
    if (!httpReg) {
      httpReg = new ListenerRegistry();
      this.eventListeners.set("http_request", httpReg);
    }
    httpReg.add(ctx, callbackId);
    setHttpHandler((requestJson) => {
      const reg = this.eventListeners.get("http_request");
      if (!reg) return;
      for (const e of reg.aliveEntries()) {
        e.ctx.emit(e.callbackId, JsbCode.kSuccess, requestJson);
      }
    });
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  /**
   * 注入下载回调桥接（SDK 的下载请求由 TS 层 / 前端 aria2c 执行）
   */
  async EnableDownloadBridge(ctx, callbackId) {
    logger$y.info(`EnableDownloadBridge cid=${callbackId}`);
    let dlReg = this.eventListeners.get("download_request");
    if (!dlReg) {
      dlReg = new ListenerRegistry();
      this.eventListeners.set("download_request", dlReg);
    }
    dlReg.add(ctx, callbackId);
    setDownloadHandler((downloadId, taskJson) => {
      const reg = this.eventListeners.get("download_request");
      if (!reg) return;
      const payload = JSON.stringify({ download_id: downloadId.toString(), task: JSON.parse(taskJson) });
      for (const e of reg.aliveEntries()) {
        e.ctx.emit(e.callbackId, JsbCode.kSuccess, payload);
      }
    });
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  /**
   * 回传下载进度
   *
   * args[0] = downloadId (string representation of bigint)
   * args[1] = progressJson
   */
  async ReportDownloadProgress(ctx, callbackId, ...args) {
    const downloadIdStr = typeof args[0] === "string" ? args[0] : "";
    const progressJson = typeof args[1] === "string" ? args[1] : "";
    if (!downloadIdStr || !progressJson) {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "downloadId and progressJson required");
      return;
    }
    reportDownloadProgress(BigInt(downloadIdStr), progressJson);
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  // ─── A3：下载管理 ────────────────────────────────────
  /** 开始下载 */
  async StartDownload(ctx, callbackId) {
    logger$y.info(`StartDownload cid=${callbackId}`);
    const rc = startDownload();
    ctx.emit(callbackId, rc === 0 ? JsbCode.kSuccess : JsbCode.kError, JSON.stringify({ code: rc }));
  }
  /** 暂停下载 */
  async PauseDownload(ctx, callbackId) {
    logger$y.info(`PauseDownload cid=${callbackId}`);
    const rc = pauseDownload();
    ctx.emit(callbackId, rc === 0 ? JsbCode.kSuccess : JsbCode.kError, JSON.stringify({ code: rc }));
  }
  /** 恢复下载 */
  async ResumeDownload(ctx, callbackId) {
    logger$y.info(`ResumeDownload cid=${callbackId}`);
    const rc = resumeDownload();
    ctx.emit(callbackId, rc === 0 ? JsbCode.kSuccess : JsbCode.kError, JSON.stringify({ code: rc }));
  }
  /** 取消下载 */
  async CancelDownload(ctx, callbackId) {
    logger$y.info(`CancelDownload cid=${callbackId}`);
    const rc = cancelDownload();
    ctx.emit(callbackId, rc === 0 ? JsbCode.kSuccess : JsbCode.kError, JSON.stringify({ code: rc }));
  }
  /** 静默下载 */
  async StartSilentDownload(ctx, callbackId) {
    logger$y.info(`StartSilentDownload cid=${callbackId}`);
    const rc = startSilentDownload();
    ctx.emit(callbackId, rc === 0 ? JsbCode.kSuccess : JsbCode.kError, JSON.stringify({ code: rc }));
  }
  // ─── A3：服务管理 ────────────────────────────────────
  /** 启动推理服务（自动使用当前版本信息，无需页面传参） */
  async StartService(ctx, callbackId) {
    logger$y.info(`StartService cid=${callbackId}`);
    const rc = startService();
    ctx.emit(callbackId, rc === 0 ? JsbCode.kSuccess : JsbCode.kError, JSON.stringify({ code: rc }));
  }
  /** 获取当前版本信息 */
  async GetCurrentVersion(ctx, callbackId) {
    const ver = getCurrentVersion();
    logger$y.info(`GetCurrentVersion cid=${callbackId} version=${ver || "(empty)"}`);
    ctx.emit(callbackId, JsbCode.kSuccess, ver || "{}");
  }
  /** 停止推理服务 */
  async StopService(ctx, callbackId) {
    logger$y.info(`StopService cid=${callbackId}`);
    const rc = stopService();
    ctx.emit(callbackId, rc === 0 ? JsbCode.kSuccess : JsbCode.kError, JSON.stringify({ code: rc }));
  }
  /** 激活新版本并启动服务 */
  async ActivateAndLaunch(ctx, callbackId) {
    logger$y.info(`ActivateAndLaunch cid=${callbackId}`);
    const rc = activateAndLaunch();
    ctx.emit(callbackId, rc === 0 ? JsbCode.kSuccess : JsbCode.kError, JSON.stringify({ code: rc }));
  }
  /** 激活新版本（不启动服务） */
  async ActivateNewVersion(ctx, callbackId) {
    logger$y.info(`ActivateNewVersion cid=${callbackId}`);
    const rc = activateNewVersion();
    ctx.emit(callbackId, rc === 0 ? JsbCode.kSuccess : JsbCode.kError, JSON.stringify({ code: rc }));
  }
  /** 清理旧版本 */
  async CleanupOldVersions(ctx, callbackId, ...args) {
    const keepCount = typeof args[0] === "number" ? args[0] : 1;
    logger$y.info(`CleanupOldVersions cid=${callbackId} keep=${keepCount}`);
    const rc = cleanupOldVersions(keepCount);
    ctx.emit(callbackId, rc === 0 ? JsbCode.kSuccess : JsbCode.kError, JSON.stringify({ code: rc }));
  }
  // ─── A3：版本管理 ────────────────────────────────────
  /** 读新版本信息 */
  async GetNewVersion(ctx, callbackId) {
    const version = getNewVersion();
    ctx.emit(callbackId, JsbCode.kSuccess, version || "{}");
  }
  /** 设置新版本信息 */
  async SetNewVersion(ctx, callbackId, ...args) {
    const versionJson = typeof args[0] === "string" ? args[0] : "";
    if (!versionJson) {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "versionJson required");
      return;
    }
    logger$y.info(`SetNewVersion cid=${callbackId}`);
    const rc = setNewVersion(versionJson);
    ctx.emit(callbackId, rc === 0 ? JsbCode.kSuccess : JsbCode.kError, JSON.stringify({ code: rc }));
  }
  // ─── 生命周期钩子 ───────────────────────────────────────
  onWebContentsDestroyed(webContentsId) {
    this.logListeners.removeByWebContents(webContentsId);
    for (const reg of this.eventListeners.values()) {
      reg.removeByWebContents(webContentsId);
    }
  }
  dispose() {
    for (const d of this.disposers) {
      try {
        d();
      } catch {
      }
    }
    this.disposers.length = 0;
    this.logListeners.clear();
    this.eventListeners.clear();
  }
  // ─── 内部 fanout ────────────────────────────────────────
  broadcastLog(entry) {
    for (const e of this.logListeners.aliveEntries()) {
      e.ctx.emit(e.callbackId, JsbCode.kSuccess, JSON.stringify(entry));
    }
  }
  broadcastEvent(eventName, payloadJson) {
    const reg = this.eventListeners.get(eventName);
    if (!reg) return;
    for (const e of reg.aliveEntries()) {
      e.ctx.emit(e.callbackId, JsbCode.kSuccess, payloadJson);
    }
  }
}
var OrchestratorPhase = /* @__PURE__ */ ((OrchestratorPhase2) => {
  OrchestratorPhase2["SdkNotReady"] = "sdk_not_ready";
  OrchestratorPhase2["NotInstalled"] = "not_installed";
  OrchestratorPhase2["Downloading"] = "downloading";
  OrchestratorPhase2["WaitingInstall"] = "waiting_install";
  OrchestratorPhase2["ServiceIdle"] = "service_idle";
  OrchestratorPhase2["ServiceStarting"] = "service_starting";
  OrchestratorPhase2["ServiceRunning"] = "service_running";
  OrchestratorPhase2["ServiceStopped"] = "service_stopped";
  OrchestratorPhase2["Failed"] = "failed";
  return OrchestratorPhase2;
})(OrchestratorPhase || {});
const LOCAL_LLM_ORCH_MOD_ID = "local_llm_orchestrator";
const LOCAL_LLM_ORCH_MOD_NAME = "Local LLM 编排";
const LOCAL_LLM_ORCH_REPORT_EVENTS = {
  /** 编排入口被调用 */
  ENSURE_CALLED: "local_llm_orchestrator__ensure_called",
  /** 服务已就绪（严重节点，实时上报） */
  SERVICE_RUNNING: "local_llm_orchestrator__service_running",
  /** 编排失败（严重错误，实时上报） */
  FAILED: "local_llm_orchestrator__failed",
  /** Agent 重启成功 */
  AGENT_RESTART_SUCCESS: "local_llm_orchestrator__agent_restart_success",
  /** Agent 重启失败（严重错误，实时上报） */
  AGENT_RESTART_FAILED: "local_llm_orchestrator__agent_restart_failed",
  /** 编排暂停（切换到非 Local 模式） */
  SUSPEND: "local_llm_orchestrator__suspend",
  /** download_failed 自动重试（即将延迟重试） */
  DOWNLOAD_FAIL_AUTO_RETRY: "local_llm_orchestrator__download_fail_auto_retry"
};
let logger$x = null;
function log() {
  if (!logger$x) logger$x = getLogger(LOCAL_LLM_ORCH_LOG_SCOPE);
  return logger$x;
}
function classifyInstall(statusNum, statusText) {
  if (Number.isFinite(statusNum)) {
    switch (statusNum) {
      case INSTALL_STATUS.NotInstalled:
      case INSTALL_STATUS.DownloadPaused:
        return OrchestratorPhase.NotInstalled;
      case INSTALL_STATUS.DownloadStarting:
      case INSTALL_STATUS.Downloading:
        return OrchestratorPhase.Downloading;
      case INSTALL_STATUS.DownloadCompleted:
      case INSTALL_STATUS.InstallStarting:
      case INSTALL_STATUS.Installing:
        return OrchestratorPhase.WaitingInstall;
      case INSTALL_STATUS.InstallCompleted:
        return OrchestratorPhase.ServiceIdle;
      case INSTALL_STATUS.DownloadFailed:
      case INSTALL_STATUS.InstallFailed:
        return OrchestratorPhase.Failed;
    }
  }
  switch (statusText) {
    case INSTALL_STATUS_TEXT.NotInstalled:
      return OrchestratorPhase.NotInstalled;
    case INSTALL_STATUS_TEXT.DownloadPaused:
      return OrchestratorPhase.NotInstalled;
    case INSTALL_STATUS_TEXT.DownloadStarting:
    case INSTALL_STATUS_TEXT.Downloading:
      return OrchestratorPhase.Downloading;
    case INSTALL_STATUS_TEXT.DownloadCompleted:
    case INSTALL_STATUS_TEXT.InstallStarting:
    case INSTALL_STATUS_TEXT.Installing:
      return OrchestratorPhase.WaitingInstall;
    case INSTALL_STATUS_TEXT.InstallCompleted:
      return OrchestratorPhase.ServiceIdle;
    case INSTALL_STATUS_TEXT.DownloadFailed:
    case INSTALL_STATUS_TEXT.InstallFailed:
      return OrchestratorPhase.Failed;
    default:
      return OrchestratorPhase.SdkNotReady;
  }
}
function deriveCurrentPhase(installRaw, serviceRaw) {
  if (!isLocalLlmReady()) {
    return {
      phase: OrchestratorPhase.SdkNotReady,
      servicePort: 0,
      installStatusText: "(sdk not initialized)",
      serviceStateText: "(sdk not initialized)"
    };
  }
  const installJson = installRaw ?? safeGetInstallState();
  const serviceJson = serviceRaw ?? safeGetServiceState();
  const installObj = parseObj(installJson);
  const serviceObj = parseObj(serviceJson);
  const installStatus = Number(installObj.status);
  const installText = String(installObj.status_text ?? "");
  const serviceStatus = Number(serviceObj.status);
  const servicePort = Number(serviceObj.service_port);
  const installPhase = classifyInstall(installStatus, installText);
  let phase = installPhase;
  let port = 0;
  let failureKind;
  if (installPhase === OrchestratorPhase.Failed) {
    failureKind = installStatus === INSTALL_STATUS.DownloadFailed ? "download_failed" : "install_failed";
  }
  if (installPhase === OrchestratorPhase.ServiceIdle) {
    if (serviceStatus === SERVICE_STATUS.Running && Number.isFinite(servicePort) && servicePort > 0 && servicePort <= 65535) {
      phase = OrchestratorPhase.ServiceRunning;
      port = servicePort;
    } else if (serviceStatus === SERVICE_STATUS.Error) {
      phase = OrchestratorPhase.Failed;
      failureKind = "service_error";
    } else if (serviceStatus === SERVICE_STATUS.Starting || serviceStatus === SERVICE_STATUS.Loading) {
      phase = OrchestratorPhase.ServiceStarting;
    } else if (serviceStatus === SERVICE_STATUS.Stopped) {
      phase = OrchestratorPhase.ServiceStopped;
    } else {
      phase = OrchestratorPhase.ServiceIdle;
    }
  }
  return {
    phase,
    servicePort: port,
    installStatusText: installText || `status=${installStatus}`,
    serviceStateText: `status=${serviceStatus} port=${servicePort}`,
    failureKind,
    downloadSpeed: Number(installObj.download_speed) || 0,
    downloadedBytes: Number(installObj.downloaded_bytes) || 0
  };
}
function parseObj(json) {
  try {
    const o = JSON.parse(json);
    if (o && typeof o === "object") return o;
  } catch {
  }
  return {};
}
function safeGetInstallState() {
  try {
    return getInstallState();
  } catch {
    return "{}";
  }
}
function safeGetServiceState() {
  try {
    return getServiceState();
  } catch {
    return "{}";
  }
}
function safeGetCurrentVersion() {
  try {
    return getCurrentVersion();
  } catch {
    return "";
  }
}
function toAgentMode(mode) {
  return mode === WorkMode.Local ? "local" : "cloud";
}
function isInstalledPhase(phase) {
  return phase === OrchestratorPhase.ServiceIdle || phase === OrchestratorPhase.ServiceStarting || phase === OrchestratorPhase.ServiceRunning || phase === OrchestratorPhase.ServiceStopped;
}
class LocalLlmOrchestrator {
  /** 长生命周期 LLM 事件订阅（注册一次） */
  eventDisposer = null;
  /** startDownload 瞬态失败重试计数 */
  startDownloadRetries = 0;
  /** startDownload 重试 timer（用于清理） */
  startDownloadTimer = null;
  /** startService 瞬态失败重试计数 */
  startServiceRetries = 0;
  /** startService 重试 timer（用于清理） */
  startServiceTimer = null;
  /** 静默下载延迟 timer（用于清理） */
  silentDownloadTimer = null;
  /** 标记静默下载是否已触发过（整个生命周期只允许一次） */
  silentDownloadFired = false;
  /**
   * 上一次 suspend() 中调用 stopService() 的时间戳（Date.now()）
   *
   * 用于 advance() 中 ServiceStopped 分支的竞态保护：
   * 如果距离上次 stopService 不足 SUSPEND_COOLDOWN_MS，延迟等待 SDK
   * 旧的 DisconnectAndKill 流程走完后再 startService。
   */
  lastSuspendStopServiceTs = 0;
  /** suspend 冷却延迟 timer（用于清理） */
  suspendCooldownTimer = null;
  /** 最终一致性校验 timer（用于清理） */
  consistencyCheckTimer = null;
  /** download_failed 退避重试计数（索引对应 DOWNLOAD_FAIL_RETRY_DELAYS_MS） */
  downloadFailRetries = 0;
  /** download_failed 退避重试 timer（用于取消） */
  downloadFailTimer = null;
  /**
   * 模型是否已安装完成
   *
   * 在 ensure() 首次派生状态时，若 phase 已经处于 ServiceIdle 及之后阶段则设为 true。
   * 一旦为 true，后续 install_status 事件（静默下载产生的下载/安装状态变更）将被忽略，
   * 避免静默更新扭转正在运行的服务状态。
   */
  llmInstalled = false;
  /** 注入：SettingsStore；测试可替换 */
  settings = new SettingsStore();
  /**
   * 入口：根据当前 install/service 状态推进 Local 模式所需链路
   *
   * 幂等：可重复调用；不会触发重复下载、重复 startService、重复 restartAgent。
   */
  ensure(reason) {
    const desired = this.settings.getWorkMode();
    if (desired !== WorkMode.Local) {
      log().debug(`ensure(${reason}): work_mode=${desired} 非 Local，跳过`);
      return;
    }
    if (reason === "set-work-mode" || reason === "manual-retry") {
      this.cancelDownloadFailRetry();
    }
    const elapsed = Date.now() - this.lastSuspendStopServiceTs;
    if (this.lastSuspendStopServiceTs > 0 && elapsed < SUSPEND_COOLDOWN_MS) {
      const waitMs = SUSPEND_COOLDOWN_MS - elapsed;
      log().info(`ensure(${reason}): 距上次 suspend 仅 ${elapsed}ms（< ${SUSPEND_COOLDOWN_MS}ms），延迟 ${waitMs}ms 等待 SDK disconnect 完成后 re-ensure`);
      if (!this.suspendCooldownTimer) {
        this.suspendCooldownTimer = setTimeout(() => {
          this.suspendCooldownTimer = null;
          this.ensure(reason);
        }, waitMs);
      }
      return;
    }
    this.ensureSubscribed();
    const decision = deriveCurrentPhase();
    log().info(`ensure(${reason}): phase=${decision.phase} install=[${decision.installStatusText}] service=[${decision.serviceStateText}]`);
    reportBeaconEvent(LOCAL_LLM_ORCH_REPORT_EVENTS.ENSURE_CALLED, {
      mod_id: LOCAL_LLM_ORCH_MOD_ID,
      mod_name: LOCAL_LLM_ORCH_MOD_NAME,
      reason,
      phase: String(decision.phase)
    });
    if (!this.llmInstalled && isInstalledPhase(decision.phase)) {
      this.llmInstalled = true;
      log().info(`ensure(${reason}): 模型已安装，设置 llmInstalled=true（静默下载不再扭转状态机）`);
    }
    this.advance(decision, reason);
  }
  /** 取消订阅（before-quit 调用） */
  dispose() {
    if (this.eventDisposer) {
      try {
        this.eventDisposer();
      } catch {
      }
      this.eventDisposer = null;
      log().info("orchestrator 事件订阅已取消");
    }
    this.clearTransientState();
    this.lastSuspendStopServiceTs = 0;
    this.silentDownloadFired = false;
    this.llmInstalled = false;
  }
  /**
   * 切到非 Local 模式时调用：根据当前 phase 暂停下载 / 停止服务
   *
   * 仅做"挂起"动作，不取消事件订阅；切回 Local 时由 ensure() 的派生逻辑
   * 自然走 startDownload / startService 续推。
   */
  suspend(reason) {
    if (!isLocalLlmReady()) {
      log().info(`suspend(${reason}): SDK 未就绪，跳过`);
      return;
    }
    const decision = deriveCurrentPhase();
    log().info(`suspend(${reason}): phase=${decision.phase} install=[${decision.installStatusText}] service=[${decision.serviceStateText}]`);
    this.clearTransientState();
    switch (decision.phase) {
      case OrchestratorPhase.Downloading: {
        const rc = pauseDownload();
        log().info(`suspend(${reason}): 下载中 → pauseDownload rc=${rc}`);
        reportBeaconEvent(LOCAL_LLM_ORCH_REPORT_EVENTS.SUSPEND, {
          mod_id: LOCAL_LLM_ORCH_MOD_ID,
          mod_name: LOCAL_LLM_ORCH_MOD_NAME,
          reason,
          action: "pause_download"
        });
        return;
      }
      case OrchestratorPhase.ServiceStarting:
      case OrchestratorPhase.ServiceRunning: {
        const rc = stopService();
        this.lastSuspendStopServiceTs = Date.now();
        log().info(`suspend(${reason}): 服务运行/启动中 → stopService rc=${rc}`);
        return;
      }
      default:
        log().info(`suspend(${reason}): phase=${decision.phase} 无需挂起动作`);
    }
  }
  // ─── 内部 ─────────────────────────────────────────────
  /** 清理瞬态状态：重试计数 + 所有 timer（保留事件订阅与 silentDownloadFired） */
  clearTransientState() {
    this.startDownloadRetries = 0;
    if (this.startDownloadTimer) {
      clearTimeout(this.startDownloadTimer);
      this.startDownloadTimer = null;
    }
    this.startServiceRetries = 0;
    if (this.startServiceTimer) {
      clearTimeout(this.startServiceTimer);
      this.startServiceTimer = null;
    }
    if (this.silentDownloadTimer) {
      clearTimeout(this.silentDownloadTimer);
      this.silentDownloadTimer = null;
    }
    if (this.suspendCooldownTimer) {
      clearTimeout(this.suspendCooldownTimer);
      this.suspendCooldownTimer = null;
    }
    if (this.consistencyCheckTimer) {
      clearTimeout(this.consistencyCheckTimer);
      this.consistencyCheckTimer = null;
    }
    this.downloadFailRetries = 0;
    if (this.downloadFailTimer) {
      clearTimeout(this.downloadFailTimer);
      this.downloadFailTimer = null;
    }
  }
  /**
   * 推进状态机：依据当前阶段执行下一步动作
   *
   * 各分支都是同步原语 + fire-and-forget 异步重启；事件路径再触发一次 advance。
   */
  advance(decision, reason) {
    switch (decision.phase) {
      case OrchestratorPhase.SdkNotReady:
        log().info(`advance(${reason}): SDK 未就绪，等待 SDK init 完成后由后续 ensure 重新触发`);
        return;
      case OrchestratorPhase.NotInstalled: {
        const rc = startDownload();
        if (rc !== 0) {
          if (this.startDownloadRetries < START_DOWNLOAD_MAX_RETRIES) {
            this.startDownloadRetries += 1;
            const msg = `advance(${reason}): startDownload 失败 rc=${rc}，${START_DOWNLOAD_RETRY_DELAY_MS}ms 后重试 (${this.startDownloadRetries}/${START_DOWNLOAD_MAX_RETRIES})`;
            log().warn(msg);
            this.startDownloadTimer = setTimeout(() => {
              this.startDownloadTimer = null;
              this.ensure("manual-retry");
            }, START_DOWNLOAD_RETRY_DELAY_MS);
          } else {
            const msg = `advance(${reason}): startDownload 失败 rc=${rc}，已达最大重试次数 ${START_DOWNLOAD_MAX_RETRIES}，放弃自动重试`;
            log().warn(msg);
          }
        } else {
          this.startDownloadRetries = 0;
          this.downloadFailRetries = 0;
          log().info(`advance(${reason}): 模型未安装或下载已暂停 → startDownload rc=${rc}`);
        }
        return;
      }
      case OrchestratorPhase.Downloading:
        if (this.downloadFailRetries > 0 && (decision.downloadSpeed > 0 || decision.downloadedBytes > 0)) {
          this.downloadFailRetries = 0;
          log().info(`advance(${reason}): 下载已恢复（speed=${decision.downloadSpeed} bytes=${decision.downloadedBytes}），重置 downloadFailRetries=0`);
        }
        log().info(`advance(${reason}): 下载进行中，等待 install_status 事件`);
        return;
      case OrchestratorPhase.WaitingInstall:
        log().info(`advance(${reason}): 安装进行中（download_completed/installing），等待 install_completed 事件`);
        return;
      case OrchestratorPhase.ServiceIdle: {
        this.scheduleSilentDownload(reason);
        if (reason !== "manual-retry") {
          this.startServiceRetries = 0;
        }
        const version = safeGetCurrentVersion();
        let rc;
        if (!version) {
          rc = activateAndLaunch();
          if (rc === 0) {
            log().info(`advance(${reason}): 模型已安装但版本未激活 → activateAndLaunch rc=${rc}（等 service_state 事件）`);
          }
        } else {
          rc = startService();
          if (rc === 0) {
            log().info(`advance(${reason}): 模型已安装、版本已激活、服务未启 → startService rc=${rc}（等 service_state 事件）`);
          }
        }
        if (rc !== 0) {
          if (this.startServiceRetries < START_SERVICE_MAX_RETRIES) {
            this.startServiceRetries += 1;
            const msg = `advance(${reason}): startService/activateAndLaunch 失败 rc=${rc}，${START_SERVICE_RETRY_DELAY_MS}ms 后重试 (${this.startServiceRetries}/${START_SERVICE_MAX_RETRIES})`;
            log().warn(msg);
            this.startServiceTimer = setTimeout(() => {
              this.startServiceTimer = null;
              this.ensure("manual-retry");
            }, START_SERVICE_RETRY_DELAY_MS);
          } else {
            const msg = `advance(${reason}): startService/activateAndLaunch 失败 rc=${rc}，已达最大重试次数 ${START_SERVICE_MAX_RETRIES}，放弃自动重试`;
            log().warn(msg);
            emitSyntheticServiceState(JSON.stringify({
              status: SERVICE_STATUS.Error,
              service_port: 0,
              service_ip: "",
              error_message: `startService 重试 ${START_SERVICE_MAX_RETRIES} 次后仍失败 (rc=${rc})`,
              error_code: rc,
              is_retry_failed: true
            }));
          }
        }
        return;
      }
      case OrchestratorPhase.ServiceStarting:
        log().info(`advance(${reason}): 服务启动中（Starting/Loading），等待 service_state 事件`);
        return;
      case OrchestratorPhase.ServiceStopped: {
        const elapsed = Date.now() - this.lastSuspendStopServiceTs;
        const inCooldown = this.lastSuspendStopServiceTs > 0 && elapsed < SUSPEND_COOLDOWN_MS;
        if (reason === "event-driven" && !inCooldown) {
          log().info(`advance(${reason}): 服务已停止（Stopped），SDK 内部处理中，等待 service_state 事件`);
          return;
        }
        if (inCooldown) {
          const waitMs = SUSPEND_COOLDOWN_MS - elapsed;
          log().info(`advance(${reason}): 服务已停止（Stopped）且距上次 suspend 仅 ${elapsed}ms（< ${SUSPEND_COOLDOWN_MS}ms），延迟 ${waitMs}ms 等待 SDK disconnect 完成后 re-ensure`);
          if (!this.suspendCooldownTimer) {
            const pendingReason = reason === "event-driven" ? "set-work-mode" : reason;
            this.suspendCooldownTimer = setTimeout(() => {
              this.suspendCooldownTimer = null;
              this.ensure(pendingReason);
            }, waitMs);
          }
          return;
        }
        log().info(`advance(${reason}): 服务已停止（Stopped）且为主动 ensure，视为 ServiceIdle 处理`);
        this.advance({ ...decision, phase: OrchestratorPhase.ServiceIdle }, reason);
        return;
      }
      case OrchestratorPhase.ServiceRunning:
        this.startServiceRetries = 0;
        reportBeaconRealtimeEvent(LOCAL_LLM_ORCH_REPORT_EVENTS.SERVICE_RUNNING, {
          mod_id: LOCAL_LLM_ORCH_MOD_ID,
          mod_name: LOCAL_LLM_ORCH_MOD_NAME,
          port: String(decision.servicePort),
          reason
        });
        this.tryRestartAgent(decision.servicePort, reason);
        this.scheduleSilentDownload(reason);
        return;
      case OrchestratorPhase.Failed: {
        if ((reason === "auto-retry-download-fail" || reason === "system-resume") && !this.llmInstalled && decision.failureKind === "download_failed") {
          if (reason === "system-resume") {
            this.cancelDownloadFailRetry();
          }
          const rc = startDownload();
          if (rc === 0) {
            this.startDownloadRetries = 0;
            log().info(`advance(${reason}): 自动重试 startDownload 成功 rc=${rc}`);
          } else {
            log().warn(`advance(${reason}): 自动重试 startDownload 失败 rc=${rc}，放弃`);
          }
          return;
        }
        if ((reason === "set-work-mode" || reason === "manual-retry") && !this.llmInstalled && decision.failureKind === "install_failed") {
          const rc = startDownload();
          if (rc === 0) {
            log().info(`advance(${reason}): install_failed → 用户主动触发，startDownload 成功 rc=${rc}`);
          } else {
            log().warn(`advance(${reason}): install_failed → 用户主动触发，startDownload 失败 rc=${rc}`);
          }
          return;
        }
        if (!this.llmInstalled && decision.failureKind === "download_failed" && this.downloadFailRetries < DOWNLOAD_FAIL_RETRY_DELAYS_MS.length && !this.downloadFailTimer) {
          const delayMs = DOWNLOAD_FAIL_RETRY_DELAYS_MS[this.downloadFailRetries];
          this.downloadFailRetries += 1;
          log().info(`advance(${reason}): download_failed → ${delayMs}ms 后自动重试 (${this.downloadFailRetries}/${DOWNLOAD_FAIL_RETRY_DELAYS_MS.length})`);
          reportBeaconEvent(LOCAL_LLM_ORCH_REPORT_EVENTS.DOWNLOAD_FAIL_AUTO_RETRY, {
            mod_id: LOCAL_LLM_ORCH_MOD_ID,
            mod_name: LOCAL_LLM_ORCH_MOD_NAME,
            attempt: String(this.downloadFailRetries),
            delay_ms: String(delayMs),
            reason
          });
          this.downloadFailTimer = setTimeout(() => {
            this.downloadFailTimer = null;
            this.ensure("auto-retry-download-fail");
          }, delayMs);
          return;
        }
        log().warn(`advance(${reason}): install/service 处于失败态，停止自动推进`);
        reportBeaconRealtimeEvent(LOCAL_LLM_ORCH_REPORT_EVENTS.FAILED, {
          mod_id: LOCAL_LLM_ORCH_MOD_ID,
          mod_name: LOCAL_LLM_ORCH_MOD_NAME,
          reason,
          phase: String(decision.phase),
          install_status_text: decision.installStatusText,
          service_state_text: decision.serviceStateText
        });
        return;
      }
      default:
        log().warn(`advance(${reason}): 未识别 phase=${String(decision.phase)}`);
    }
  }
  /** 注册 LLM 事件订阅；幂等 */
  ensureSubscribed() {
    if (this.eventDisposer) return;
    this.eventDisposer = onLlmEvent((eventName, payloadJson) => {
      const desired = this.settings.getWorkMode();
      if (desired !== WorkMode.Local) {
        log().debug(`event(${eventName}): work_mode=${desired} 非 Local，忽略`);
        return;
      }
      if (eventName === "install_status") {
        if (this.llmInstalled) {
          log().info(`event(install_status): llmInstalled=true，忽略静默下载事件 payload=${payloadJson.slice(0, 200)}`);
          return;
        }
        const decision = deriveCurrentPhase(payloadJson, void 0);
        log().info(`event(install_status): payload=${payloadJson.slice(0, 200)} → phase=${decision.phase}`);
        if (!this.llmInstalled && isInstalledPhase(decision.phase)) {
          this.llmInstalled = true;
          log().info("event(install_status): 首次安装完成，设置 llmInstalled=true");
        }
        this.advance(decision, "event-driven");
        return;
      }
      if (eventName === "service_state") {
        const decision = deriveCurrentPhase(void 0, payloadJson);
        log().info(`event(service_state): payload=${payloadJson.slice(0, 200)} → phase=${decision.phase}`);
        this.advance(decision, "event-driven");
        return;
      }
    });
    log().info("orchestrator 已订阅 install_status / service_state 事件");
  }
  /** 延迟触发静默下载（检查模型更新）；整个生命周期只允许触发一次 */
  scheduleSilentDownload(reason) {
    if (this.silentDownloadFired || this.silentDownloadTimer) {
      return;
    }
    this.silentDownloadFired = true;
    this.silentDownloadTimer = setTimeout(() => {
      this.silentDownloadTimer = null;
      const rc = startSilentDownload();
      log().info(`scheduleSilentDownload(${reason}): 延迟 ${SILENT_DOWNLOAD_DELAY_MS}ms 后触发静默下载 rc=${rc}`);
    }, SILENT_DOWNLOAD_DELAY_MS);
  }
  /** 取消 download_failed 自动重试（用户手动触发时调用，避免重入） */
  cancelDownloadFailRetry() {
    if (this.downloadFailTimer) {
      clearTimeout(this.downloadFailTimer);
      this.downloadFailTimer = null;
      log().info("cancelDownloadFailRetry: 取消自动重试 timer");
    }
    this.downloadFailRetries = 0;
  }
  /**
   * 拿到端口后将 restart 请求入队（统一走 restart-queue 的 last-write-wins 策略）
   *
   * 设计变更（方案 D）：
   *   - 不再直接调用 restartAgent，消除与 SetWorkMode handler 的双通道竞争
   *   - 去掉 lastRestartedPort 去重（restart-queue 天然 last-write-wins，同参数入队幂等）
   *   - 去掉 this.restarting 防并发（restart-queue 保证串行执行）
   *   - 入队后调度最终一致性校验，确保 Agent 最终 workMode 与用户设置匹配
   */
  tryRestartAgent(port, reason) {
    const effective = SettingsStore.computeEffectiveWorkMode(WorkMode.Local, true);
    this.settings.setEffectiveWorkMode(effective);
    const agentMode = toAgentMode(effective);
    log().info(`tryRestartAgent(${reason}): port=${port} effective=${effective} agentMode=${agentMode} → enqueueRestart`);
    enqueueRestart({ workMode: agentMode, localLlmPort: port });
    reportBeaconEvent(LOCAL_LLM_ORCH_REPORT_EVENTS.AGENT_RESTART_SUCCESS, {
      mod_id: LOCAL_LLM_ORCH_MOD_ID,
      mod_name: LOCAL_LLM_ORCH_MOD_NAME,
      port: String(port),
      reason
    });
    this.scheduleConsistencyCheck(agentMode, port, reason);
  }
  /**
   * 最终一致性校验 — 确保 Agent 当前 workMode 与用户期望严格匹配
   *
   * 在 restart 入队后延迟执行校验：
   *   1. 读取用户当前期望的 effectiveWorkMode
   *   2. 读取 Agent 实际运行的 workMode（getAgentStatus）
   *   3. 如果不匹配且重试未超限 → 重新 enqueueRestart 以期望模式为准
   *   4. 匹配 → 校验通过，结束
   *
   * 边界处理：
   *   - 用户在校验窗口内再次切模式：读到的 effectiveWorkMode 是最新值，
   *     restart-queue 的 last-write-wins 也保证最终态正确
   *   - Agent 未运行（state.current=null）：跳过校验（Agent 可能被外部 stop 了）
   */
  scheduleConsistencyCheck(expectedAgentMode, port, reason, attempt = 0) {
    if (this.consistencyCheckTimer) {
      clearTimeout(this.consistencyCheckTimer);
      this.consistencyCheckTimer = null;
    }
    log().info(`scheduleConsistencyCheck(${reason}): 延迟 ${CONSISTENCY_CHECK_DELAY_MS}ms 校验 expected=${expectedAgentMode} port=${port} attempt=${attempt}`);
    this.consistencyCheckTimer = setTimeout(() => {
      this.consistencyCheckTimer = null;
      const currentDesired = this.settings.getWorkMode();
      const currentEffective = this.settings.getEffectiveWorkMode();
      const currentExpectedAgentMode = toAgentMode(currentEffective);
      const agentStatus = getAgentStatus();
      const actualAgentMode = agentStatus.workMode;
      if (!actualAgentMode) {
        log().info(`consistencyCheck(${reason}): Agent 未运行，跳过校验`);
        return;
      }
      if (currentDesired !== WorkMode.Local) {
        log().info(`consistencyCheck(${reason}): 用户已切到 mode=${currentDesired}（非 Local），跳过校验`);
        return;
      }
      if (actualAgentMode === currentExpectedAgentMode) {
        log().info(`consistencyCheck(${reason}): 一致 actual=${actualAgentMode} expected=${currentExpectedAgentMode}`);
        return;
      }
      if (attempt >= CONSISTENCY_CHECK_MAX_RETRIES) {
        log().error(`consistencyCheck(${reason}): 不一致 actual=${actualAgentMode} expected=${currentExpectedAgentMode}，已达最大重试 ${CONSISTENCY_CHECK_MAX_RETRIES} 次，放弃`);
        reportBeaconRealtimeEvent(LOCAL_LLM_ORCH_REPORT_EVENTS.AGENT_RESTART_FAILED, {
          mod_id: LOCAL_LLM_ORCH_MOD_ID,
          mod_name: LOCAL_LLM_ORCH_MOD_NAME,
          error_msg: `consistency check failed after ${CONSISTENCY_CHECK_MAX_RETRIES} retries: actual=${actualAgentMode} expected=${currentExpectedAgentMode}`,
          port: String(port),
          reason
        });
        return;
      }
      log().warn(`consistencyCheck(${reason}): 不一致 actual=${actualAgentMode} expected=${currentExpectedAgentMode}，重新入队 (attempt=${attempt + 1}/${CONSISTENCY_CHECK_MAX_RETRIES})`);
      enqueueRestart({ workMode: currentExpectedAgentMode, localLlmPort: port });
      this.scheduleConsistencyCheck(currentExpectedAgentMode, port, reason, attempt + 1);
    }, CONSISTENCY_CHECK_DELAY_MS);
  }
}
let instance = null;
function getInstance() {
  if (!instance) instance = new LocalLlmOrchestrator();
  return instance;
}
function ensureLocalReady(reason) {
  getInstance().ensure(reason);
}
function suspendLocalLlm(reason) {
  getInstance().suspend(reason);
}
function disposeOrchestrator() {
  if (instance) {
    instance.dispose();
    instance = null;
  }
}
const logger$w = getLogger("jsb:MarvisAgent");
function toAgentWorkMode(mode) {
  switch (mode) {
    case WorkMode.Cloud:
      return "cloud";
    case WorkMode.Hybrid:
      return "cloud";
    case WorkMode.Local:
      return "local";
    default:
      return "cloud";
  }
}
function parseLlmServicePort() {
  try {
    const raw = getServiceState();
    logger$w.debug(`parseLlmServicePort: getServiceState raw=${raw}`);
    const state2 = JSON.parse(raw);
    const port = Number(state2.service_port);
    if (Number.isFinite(port) && port > 0 && port <= 65535) {
      return port;
    }
    logger$w.debug(`parseLlmServicePort: port=${port} 无效`);
  } catch (err) {
    logger$w.debug(`parseLlmServicePort: 异常 ${err.message}`);
  }
  return 0;
}
class MarvisAgentHandler extends BaseHandler {
  name = "MarvisAgent";
  /** Agent 状态监听注册中心 */
  statusListeners = new ListenerRegistry();
  /** onAgentStatus 订阅的取消句柄 */
  disposeAgentStatusSub = null;
  /** 设置持久化 store（work_mode 读写） */
  settingsStore;
  constructor() {
    super();
    this.settingsStore = new SettingsStore();
    this.disposeAgentStatusSub = onAgentStatus((ev) => this.handleAgentStatusEvent(ev));
  }
  /**
   * 获取当前 AI 工作模式 — 从 SettingsStore 读取持久化值
   *
   * 返回 `{ code: 0, mode_value: 0|1|2 }`
   */
  async GetWorkMode(ctx, callbackId) {
    const mode = this.settingsStore.getWorkMode();
    logger$w.debug(`GetWorkMode cid=${callbackId} -> ${mode}`);
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ code: 0, mode_value: mode }));
  }
  /**
   * 设置工作模式 — 完整流程（对齐 Windows `MarvisAgent::SetWorkMode`）
   *
   * 流程：
   *   1. 解析 + 校验前端传入的 mode 枚举值
   *   2. 持久化用户期望模式（desired work_mode）
   *   3. 计算实际生效模式（effective_work_mode），按本地模型就绪状态降级
   *   4. 持久化 effective_work_mode
   *   5. 将 effective_work_mode 映射为 Agent CLI 的 AgentWorkMode 字符串
   *   6. 获取本地 LLM 推理服务端口（非 cloud 模式下需要）
   *   7. 回复前端 ack
   *   8. **入队** restartAgent（fire-and-forget，last-write-wins 策略）
   *   9. 委托 `ensureLocalReady` / `suspendLocalLlm` 推进/挂起 Local 链路
   *
   * ⚠️ 步骤 8 不 await restartAgent — 重启耗时约 18s，如果 await 会导致
   * 快速连续切换时旧调用恢复后用过时参数执行步骤 9，覆盖新调用的结果。
   * 通过 restart-queue 的 last-write-wins 策略，只执行最终态的重启。
   *
   * 前端传入 mode 枚举值: 0=Cloud / 1=Hybrid / 2=Local
   */
  async SetWorkMode(ctx, callbackId, ...args) {
    const modeArg = args[0];
    let mode;
    if (typeof modeArg === "number") {
      mode = modeArg;
    } else if (typeof modeArg === "string") {
      mode = Number(modeArg);
    } else {
      logger$w.warn(`SetWorkMode: invalid arg type=${typeof modeArg}, fallback to Cloud`);
      mode = WorkMode.Cloud;
    }
    if (mode !== WorkMode.Cloud && mode !== WorkMode.Hybrid && mode !== WorkMode.Local) {
      logger$w.warn(`SetWorkMode: invalid mode=${mode}, fallback to Cloud`);
      mode = WorkMode.Cloud;
    }
    const desiredMode = mode;
    this.settingsStore.setWorkMode(desiredMode);
    logger$w.info(`SetWorkMode cid=${callbackId} desired=${desiredMode}`);
    const localLlmReady = isLocalLlmReady();
    const serviceReady = isServiceReady();
    const isLocalReady = localLlmReady && serviceReady;
    const effectiveMode = SettingsStore.computeEffectiveWorkMode(desiredMode, isLocalReady);
    this.settingsStore.setEffectiveWorkMode(effectiveMode);
    logger$w.info(`SetWorkMode effective=${effectiveMode} (isLocalLlmReady=${localLlmReady}, isServiceReady=${serviceReady}, isLocalReady=${isLocalReady})`);
    const agentWorkMode = toAgentWorkMode(effectiveMode);
    const needsLocalLlm = effectiveMode === WorkMode.Local;
    let localLlmPort;
    if (needsLocalLlm) {
      const port = parseLlmServicePort();
      if (port > 0) {
        localLlmPort = port;
        logger$w.info(`SetWorkMode localLlmPort=${localLlmPort}`);
      } else {
        logger$w.info("SetWorkMode: LLM service port 未就绪，Agent 将不带 --local_llm_port 启动");
      }
    }
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ code: 0, msg: "" }));
    enqueueRestart({ workMode: agentWorkMode, localLlmPort });
    logger$w.info(`SetWorkMode step6: enqueueRestart workMode=${agentWorkMode} localLlmPort=${localLlmPort ?? "(none)"}`);
    if (desiredMode === WorkMode.Local) {
      logger$w.info(`SetWorkMode step7: 委托 ensureLocalReady(set-work-mode) 推进本地链路 desiredMode=${desiredMode}`);
      ensureLocalReady("set-work-mode");
    } else {
      logger$w.info(`SetWorkMode step7: 委托 suspendLocalLlm(set-work-mode-suspend) 挂起本地链路 desiredMode=${desiredMode}`);
      suspendLocalLlm("set-work-mode-suspend");
    }
  }
  /**
   * [mock] 获取设备条件 — macOS 阶段放行为 Full(1)
   *
   * 对应前端 `DeviceCondition` 枚举：0=UnSupport / 1=Full / 2=Lite
   *
   * 背景：KB 进程在 Mac 已打通，需要让 SetupGuide 的 DeviceDetect 步骤把
   * 推荐模式命中 Hybrid（`calculateRecommendMode` 仅在 condition === Full
   * 时返 Hybrid，其他一律返 Cloud），避免首次启动时 work_mode 被 onSkip
   * 自动覆盖回 0。
   *
   * TODO：后续接入真实硬件探测（显存 / CPU / 内存）判定 Full/Lite/UnSupport。
   */
  async GetDeviceCondition(ctx, callbackId) {
    logger$w.debug(`[mock] GetDeviceCondition cid=${callbackId} -> Full(1)`);
    ctx.emit(
      callbackId,
      JsbCode.kSuccess,
      JSON.stringify({ device_condition: 1, check_result: [] })
    );
  }
  /**
   * 获取 AgentCore 当前监听端口
   *
   * 对齐 C++ `MarvisAgent::GetAgentPort`：未就绪时返回 `port: 0`，`code` 始终为 0。
   */
  async GetAgentPort(ctx, callbackId) {
    const port = getAgentPort();
    logger$w.debug(`GetAgentPort cid=${callbackId} -> ${port}`);
    ctx.emit(
      callbackId,
      JsbCode.kSuccess,
      JSON.stringify({ code: 0, port })
    );
  }
  /**
   * 获取 Agent 进程运行状态
   *
   * 对齐前端 `IAgentRunningStatus { code, is_running }`：
   *   - `code=0` 总是成功返回
   *   - `is_running` 基于 agent-core 内部进程状态（Running / Stopped）实时判断
   *
   * 前端 `StartChecker.AgentChecker.poll()` 每 tick 调用一次判断进程存活；
   * macOS 上 agent-core 由 Electron 主进程管理，返回权威值即可。
   */
  async GetAgentRunningStatus(ctx, callbackId) {
    const running2 = isAgentRunning();
    logger$w.debug(`GetAgentRunningStatus cid=${callbackId} -> is_running=${running2}`);
    ctx.emit(
      callbackId,
      JsbCode.kSuccess,
      JSON.stringify({ code: 0, is_running: running2 })
    );
  }
  /**
   * 重启 AgentCore
   *
   * 对齐 C++ `MarvisAgent::RestartAgent`：
   *   - `code=0`  success
   *   - `code=-1` failed
   *   - `code=-2` in_progress（已有重启在进行中）
   */
  async RestartAgent(ctx, callbackId) {
    logger$w.info(`RestartAgent cid=${callbackId}`);
    try {
      const result = await restartAgent();
      let code;
      let message;
      switch (result) {
        case "success":
          code = 0;
          message = "restart_success";
          break;
        case "in-progress":
          code = -2;
          message = "restart_in_progress";
          break;
        case "failed":
        default:
          code = -1;
          message = "restart_failed";
          break;
      }
      ctx.emit(
        callbackId,
        JsbCode.kSuccess,
        JSON.stringify({ code, message })
      );
    } catch (err) {
      logger$w.error(`RestartAgent 异常: ${err.message}`);
      ctx.emit(
        callbackId,
        JsbCode.kSuccess,
        JSON.stringify({ code: -1, message: "restart_failed" })
      );
    }
  }
  /**
   * 订阅 Agent 状态事件
   *
   * 与 C++ 版完全对齐：注册后**立即 ack 一次**（空 data），之后仅在 Agent 停止时
   * 通过原 `callbackId` 再次 emit 推送事件体 `{ status, reason, exit_code }`。
   */
  async AddAgentStatusListener(ctx, callbackId) {
    this.statusListeners.add(ctx, callbackId);
    logger$w.debug(`AddAgentStatusListener cid=${callbackId} wc=${ctx.webContentsId} size=${this.statusListeners.size()}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  /**
   * 移除 Agent 状态监听 — 按 webContents 粒度清理
   */
  async RemoveAgentStatusListener(ctx, callbackId) {
    this.statusListeners.removeByWebContents(ctx.webContentsId);
    logger$w.debug(`RemoveAgentStatusListener cid=${callbackId} wc=${ctx.webContentsId} size=${this.statusListeners.size()}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  /**
   * webContents 销毁时同步清理 listener（由 jsbridge dispatcher 调用）
   */
  onWebContentsDestroyed(webContentsId) {
    this.statusListeners.removeByWebContents(webContentsId);
  }
  /**
   * 模块销毁 — 取消 agent-core 订阅
   *
   * 注：LLM 事件订阅由 `local-llm-orchestrator` 模块统一管理，本 handler 不再持有。
   */
  dispose() {
    if (this.disposeAgentStatusSub) {
      try {
        this.disposeAgentStatusSub();
      } catch {
      }
      this.disposeAgentStatusSub = null;
    }
    this.statusListeners.clear();
  }
  // ─── 内部：agent-core 事件 → 前端推送 ────────────────────────
  handleAgentStatusEvent(ev) {
    if (ev.status === "started") {
      const entries22 = this.statusListeners.aliveEntries();
      if (entries22.length === 0) return;
      const payload2 = {
        status: "started",
        port: ev.port ?? 0
      };
      const data2 = JSON.stringify(payload2);
      logger$w.info(`推送 AgentStarted 给 ${entries22.length} 个监听者: port=${payload2.port}`);
      for (const entry of entries22) {
        try {
          entry.ctx.emit(entry.callbackId, JsbCode.kSuccess, data2);
        } catch (err) {
          logger$w.warn(`AgentStarted 推送失败 wc=${entry.webContentsId}: ${err.message}`);
        }
      }
      return;
    }
    if (ev.status !== "stopped") return;
    const entries2 = this.statusListeners.aliveEntries();
    if (entries2.length === 0) {
      logger$w.debug("AgentStatusEvent(stopped) — 无监听者，跳过推送");
      return;
    }
    const payload = {
      status: "stopped",
      reason: ev.reason ?? "shutdown",
      exit_code: ev.exitCode ?? 0
    };
    const data = JSON.stringify(payload);
    logger$w.info(`推送 AgentStopped 给 ${entries2.length} 个监听者: reason=${payload.reason} exit_code=${payload.exit_code}`);
    for (const entry of entries2) {
      try {
        entry.ctx.emit(entry.callbackId, JsbCode.kSuccess, data);
      } catch (err) {
        logger$w.warn(`AgentStatusEvent 推送失败 wc=${entry.webContentsId}: ${err.message}`);
      }
    }
  }
}
const APP_LAUNCHD_LABEL = "com.tencent.mac.marvis.app";
function getAppPlistFilename() {
  return `${APP_LAUNCHD_LABEL}.plist`;
}
function getAppPlistPath() {
  return join(PLIST_DIR, getAppPlistFilename());
}
const logger$v = getLogger("app-autolaunch-plist");
function generateAppPlistXml(options) {
  const { label, appBundlePath, args = [] } = options;
  const openArgs = ["/usr/bin/open", "-a", appBundlePath];
  if (args.length > 0) {
    openArgs.push("--args", ...args);
  }
  const programArgs = openArgs.map((arg) => `		<string>${escapeXml(arg)}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${escapeXml(label)}</string>

	<key>AssociatedBundleIdentifiers</key>
	<array>
		<string>com.tencent.mac.marvis</string>
	</array>

	<key>ProgramArguments</key>
	<array>
${programArgs}
	</array>

	<key>RunAtLoad</key>
	<true/>

	<key>LimitLoadToSessionType</key>
	<string>Aqua</string>
</dict>
</plist>
`;
}
async function writeAppPlist(options) {
  const plistPath = `${PLIST_DIR}/${options.label}.plist`;
  await mkdir(dirname(plistPath), { recursive: true });
  const xml = generateAppPlistXml(options);
  logger$v.info(`写入应用 plist: ${plistPath}`);
  await writeFile(plistPath, xml, "utf-8");
  return plistPath;
}
function escapeXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
const logger$u = getLogger("app-autolaunch");
async function fileExists(path2) {
  try {
    await access(path2);
    return true;
  } catch {
    return false;
  }
}
function getAppBundlePath() {
  if (app.isPackaged) {
    return resolve(dirname(process.execPath), "..", "..");
  }
  return process.execPath;
}
async function registerAppAutoLaunch() {
  const label = APP_LAUNCHD_LABEL;
  const plistPath = getAppPlistPath();
  logger$u.info(`注册应用开机自启: label=${label}`);
  if (await fileExists(plistPath)) {
    try {
      await bootout(label, plistPath);
    } catch {
    }
  }
  const bundlePath = getAppBundlePath();
  await writeAppPlist({
    label,
    appBundlePath: bundlePath,
    args: ["--hidden"]
  });
  logger$u.info(`应用开机自启已注册（plist 已写入，下次登录生效）: ${plistPath} bundle=${bundlePath}`);
}
async function unregisterAppAutoLaunch() {
  const label = APP_LAUNCHD_LABEL;
  const plistPath = getAppPlistPath();
  logger$u.info(`注销应用开机自启: label=${label}`);
  try {
    await bootout(label, plistPath);
  } catch {
  }
  if (await fileExists(plistPath)) {
    try {
      await unlink$1(plistPath);
      logger$u.info(`已删除应用 plist: ${plistPath}`);
    } catch (err) {
      logger$u.warn(`删除应用 plist 失败: ${err.message}`);
    }
  }
  logger$u.info("应用开机自启已注销");
}
async function isAppAutoLaunchRegistered() {
  return fileExists(getAppPlistPath());
}
async function migrateFromLoginItems(opts) {
  const { autoLaunchEnabled, app: electronApp } = opts;
  if (!autoLaunchEnabled) {
    logger$u.info("迁移检查: auto_launch=false，跳过迁移");
    return { migrated: false, action: "skipped-disabled" };
  }
  if (await isAppAutoLaunchRegistered()) {
    logger$u.info("迁移检查: plist 已存在，跳过迁移（保留 Login Items）");
    return { migrated: false, action: "skipped-has-plist" };
  }
  logger$u.info("执行迁移: Login Items → launchd plist");
  try {
    try {
      electronApp.setLoginItemSettings({ openAtLogin: false });
      logger$u.info("已移除 Login Items 配置");
    } catch (err) {
      logger$u.warn(`移除 Login Items 失败（不影响迁移）: ${err.message}`);
    }
    await registerAppAutoLaunch();
    logger$u.info("迁移完成: Login Items → launchd plist");
    return { migrated: true, action: "migrated" };
  } catch (err) {
    const errorMsg = err.message;
    logger$u.error(`迁移失败: ${errorMsg}`);
    return { migrated: false, action: "failed", error: errorMsg };
  }
}
const logger$t = getLogger("jsb:MarvisSettings");
const MOD_ALT = 1;
const MOD_CTRL = 2;
const MOD_SHIFT = 4;
const MOD_WIN = 8;
const VK_KEY_MAP = {
  186: ";",
  187: "=",
  188: ",",
  189: "-",
  190: ".",
  191: "/",
  192: "`",
  32: "Space",
  9: "Tab",
  13: "Return",
  27: "Escape",
  8: "Backspace",
  46: "Delete",
  38: "Up",
  40: "Down",
  37: "Left",
  39: "Right",
  // F1-F12
  112: "F1",
  113: "F2",
  114: "F3",
  115: "F4",
  116: "F5",
  117: "F6",
  118: "F7",
  119: "F8",
  120: "F9",
  121: "F10",
  122: "F11",
  123: "F12"
};
function toAccelerator(modifier, vk) {
  const parts = [];
  if (modifier & MOD_CTRL) parts.push("Control");
  if (modifier & MOD_SHIFT) parts.push("Shift");
  if (modifier & MOD_ALT) parts.push("Alt");
  if (modifier & MOD_WIN) parts.push("Command");
  const keyName = VK_KEY_MAP[vk] ?? String.fromCharCode(vk);
  parts.push(keyName);
  return parts.join("+");
}
class MarvisSettingsHandler extends BaseHandler {
  name = "MarvisSettings";
  deps;
  settingsStore;
  listeners = new ListenerRegistry();
  /** 已注册的全局快捷键加速器字符串集合（dispose 时批量注销） */
  registeredAccelerators = /* @__PURE__ */ new Set();
  /** plist 操作进行中标记，为 true 时 GetValues 跳过一致性校验避免竞态 */
  _autoLaunchPending = false;
  /** plist 操作串行化链，避免快速连续切换时并发交错 */
  _autoLaunchChain = Promise.resolve();
  constructor(deps2) {
    super();
    this.deps = deps2;
    this.settingsStore = new SettingsStore();
    if (this.settingsStore.isFirstLaunch()) {
      logger$t.info("首次启动，写入 Mac 默认设置");
      this._applyAutoLaunch(MAC_DEFAULT_SETTINGS.auto_launch);
    } else {
      this._autoLaunchPending = true;
      this._autoLaunchChain = this._autoLaunchChain.then(() => migrateFromLoginItems({
        autoLaunchEnabled: this.settingsStore.get("auto_launch"),
        app: this.deps.getApp()
      })).then((result) => {
        if (result.action === "migrated") {
          logger$t.info("开机自启迁移完成: Login Items → launchd plist");
        } else if (result.action === "failed") {
          logger$t.error(`开机自启迁移失败: ${result.error}`);
          this._notifyListeners();
        }
      }).catch((err) => {
        logger$t.error(`开机自启迁移异常: ${err.message}`);
      }).finally(() => {
        this._autoLaunchPending = false;
      });
    }
    this._registerAllHotKeys();
    logger$t.info(`SettingsStore 初始化完成，路径: ${this.settingsStore.getStorePath()}`);
  }
  // ─── 监听族 ──────────────────────────────────────────────
  /** 注册设置变更监听 */
  async AddSettingChangeListener(ctx, callbackId) {
    this.listeners.add(ctx, callbackId);
    logger$t.debug(`AddSettingChangeListener: wcId=${ctx.webContentsId} cid=${callbackId} size=${this.listeners.size()}`);
    const data = JSON.stringify(this.settingsStore.getAll());
    ctx.emit(callbackId, JsbCode.kSuccess, data);
  }
  /** 移除设置变更监听 */
  async RemoveSettingChangeListener(ctx, callbackId) {
    this.listeners.removeByWebContents(ctx.webContentsId);
    logger$t.debug(`RemoveSettingChangeListener: wcId=${ctx.webContentsId}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  // ─── 读写族 ──────────────────────────────────────────────
  /** 读取所有设置值 */
  async GetValues(ctx, callbackId) {
    const data = this.settingsStore.getAll();
    if (!this._autoLaunchPending) {
      const actualRegistered = await isAppAutoLaunchRegistered();
      if (data.auto_launch && !actualRegistered) {
        logger$t.warn("开机自启状态不一致: store=true 但 plist 不存在，修正为 false");
        this.settingsStore.update({ auto_launch: false });
        data.auto_launch = false;
      }
    }
    logger$t.debug(`GetValues: ${JSON.stringify(data)}`);
    ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(data));
  }
  /** 全量覆盖写入设置 */
  async SetValues(ctx, callbackId, ...args) {
    const jsonStr = args[0];
    if (typeof jsonStr !== "string") {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "SetValues: json string required");
      return;
    }
    try {
      const newData = JSON.parse(jsonStr);
      const fullData = { ...MAC_DEFAULT_SETTINGS, ...newData };
      const oldData = this.settingsStore.getAll();
      this.settingsStore.setAll(fullData);
      this._handleSideEffects(oldData, fullData);
      this._notifyListeners();
      logger$t.info("SetValues: 成功");
      ctx.emit(callbackId, JsbCode.kSuccess, "");
    } catch (err) {
      logger$t.error(`SetValues: 解析失败 — ${err.message}`);
      ctx.emit(callbackId, JsbCode.kParameterError, "", `SetValues parse error: ${err.message}`);
    }
  }
  /** 增量更新设置 */
  async UpdateValues(ctx, callbackId, ...args) {
    const jsonStr = args[0];
    if (typeof jsonStr !== "string") {
      ctx.emit(callbackId, JsbCode.kParameterError, "", "UpdateValues: json string required");
      return;
    }
    try {
      const partial = JSON.parse(jsonStr);
      const oldData = this.settingsStore.getAll();
      this.settingsStore.update(partial);
      const newData = this.settingsStore.getAll();
      this._handleSideEffects(oldData, newData);
      this._notifyListeners();
      logger$t.info(`UpdateValues: 更新字段 ${Object.keys(partial).join(", ")}`);
      ctx.emit(callbackId, JsbCode.kSuccess, "");
    } catch (err) {
      logger$t.error(`UpdateValues: 解析失败 — ${err.message}`);
      ctx.emit(callbackId, JsbCode.kParameterError, "", `UpdateValues parse error: ${err.message}`);
    }
  }
  /** 恢复默认设置 */
  async RestoreValues(ctx, callbackId) {
    const oldData = this.settingsStore.getAll();
    this.settingsStore.reset();
    const newData = this.settingsStore.getAll();
    this._handleSideEffects(oldData, newData);
    this._notifyListeners();
    logger$t.info("RestoreValues: 已恢复默认设置");
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  // ─── 辅助字段 ────────────────────────────────────────────
  /** 返回 Marvis 文件存储根目录（从持久化设置中读取） */
  async GetMarvisHomeDir(ctx, callbackId) {
    const dir = this.settingsStore.get("marvis_home_dir");
    if (!dir) {
      logger$t.warn("GetMarvisHomeDir: marvis_home_dir 未设置");
      ctx.emit(callbackId, JsbCode.kSuccess, "");
      return;
    }
    if (!existsSync$1(dir)) {
      try {
        mkdirSync$1(dir, { recursive: true });
        logger$t.info(`GetMarvisHomeDir: 已创建目录 ${dir}`);
      } catch (err) {
        logger$t.error(`GetMarvisHomeDir: 创建目录失败 — ${err.message}`);
      }
    }
    ctx.emit(callbackId, JsbCode.kSuccess, dir);
  }
  /** 标记首次启动完成 */
  async MarkFirstLaunchCompleted(ctx, callbackId) {
    this.settingsStore.markFirstLaunchCompleted();
    logger$t.info("MarkFirstLaunchCompleted: 已标记");
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  // ─── 热键族 ──────────────────────────────────────────────
  /**
   * 批量反注册指定快捷键
   *
   * 前端录入新快捷键前调用，避免已注册的快捷键拦截用户输入。
   */
  async UnSetHotKeys(ctx, callbackId, ...args) {
    const jsonStr = args[0];
    logger$t.debug(`UnSetHotKeys: args=${jsonStr}`);
    try {
      const hotKeyTypes = typeof jsonStr === "string" ? JSON.parse(jsonStr) : [];
      const settings = this.settingsStore.getAll();
      for (const hotKeyType of hotKeyTypes) {
        const item = settings.hot_key_settings.find((h) => h.hot_key === hotKeyType);
        if (item?.enable) {
          const accelerator = toAccelerator(item.modifier, item.vk);
          this._unregisterShortcut(accelerator);
        }
      }
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ success: true }));
    } catch (err) {
      logger$t.error(`UnSetHotKeys: 失败 — ${err.message}`);
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ success: false }));
    }
  }
  /**
   * 恢复快捷键注册
   *
   * 快捷键录入完成后调用，将之前反注册的快捷键重新注册。
   */
  async RestoreHotKeys(ctx, callbackId, ...args) {
    const jsonStr = args[0];
    logger$t.debug(`RestoreHotKeys: args=${jsonStr}`);
    try {
      const hotKeyTypes = typeof jsonStr === "string" ? JSON.parse(jsonStr) : [];
      const settings = this.settingsStore.getAll();
      for (const hotKeyType of hotKeyTypes) {
        const item = settings.hot_key_settings.find((h) => h.hot_key === hotKeyType);
        if (item?.enable) {
          const accelerator = toAccelerator(item.modifier, item.vk);
          this._registerShortcut(accelerator, item.hot_key);
        }
      }
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ success: true }));
    } catch (err) {
      logger$t.error(`RestoreHotKeys: 失败 — ${err.message}`);
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ success: false }));
    }
  }
  /**
   * 检测快捷键组合是否与系统/其他应用冲突
   *
   * 方案：使用 globalShortcut.register() 尝试注册，
   * 成功 → 无冲突（立即 unregister），失败 → 有冲突。
   */
  async CheckKeyConflict(ctx, callbackId, ...args) {
    const jsonStr = args[0];
    logger$t.debug(`CheckKeyConflict: args=${jsonStr}`);
    try {
      const params = typeof jsonStr === "string" ? JSON.parse(jsonStr) : null;
      if (!params) {
        ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ hasConflict: false }));
        return;
      }
      const accelerator = toAccelerator(params.modifiers, params.vk);
      const globalShortcut2 = this.deps.getGlobalShortcut();
      let hasConflict = false;
      try {
        const registered2 = globalShortcut2.register(accelerator, () => {
        });
        if (registered2) {
          globalShortcut2.unregister(accelerator);
          hasConflict = false;
        } else {
          hasConflict = true;
        }
      } catch {
        hasConflict = true;
      }
      logger$t.info(`CheckKeyConflict: ${accelerator} → hasConflict=${hasConflict}`);
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ hasConflict }));
    } catch (err) {
      logger$t.error(`CheckKeyConflict: 解析失败 — ${err.message}`);
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({ hasConflict: false }));
    }
  }
  // ─── BaseHandler 钩子 ──────────────────────────────────
  /** 窗口销毁时移除对应的 listener cid */
  onWebContentsDestroyed(webContentsId) {
    this.listeners.removeByWebContents(webContentsId);
  }
  /** 模块销毁：注销所有快捷键，清空 listener */
  dispose() {
    this._unregisterAllHotKeys();
    this.listeners.clear();
    logger$t.info("dispose: 已清理快捷键和监听");
  }
  // ─── 内部方法 ──────────────────────────────────────────
  /**
   * 处理设置变更的副作用
   *
   * 比较新旧值，按需执行：
   * - auto_launch 变更 → launchd plist 注册/注销
   * - hot_key_settings 变更 → 重新注册快捷键
   */
  _handleSideEffects(oldData, newData) {
    if (oldData.auto_launch !== newData.auto_launch) {
      this._applyAutoLaunch(newData.auto_launch);
    }
    if (JSON.stringify(oldData.hot_key_settings) !== JSON.stringify(newData.hot_key_settings)) {
      this._unregisterAllHotKeys();
      this._registerAllHotKeys();
    }
  }
  /**
   * 设置/取消开机自启动（通过 launchd plist）
   *
   * 开启时：生成 plist 文件（下次登录生效）
   * 关闭时：从 launchd 注销并删除 plist
   *
   * 注意：不主动移除系统 Login Items。Login Items 可能是用户自行在系统设置中添加的，
   * 不应擅自清理。Login Items 的移除仅在迁移场景（migrateFromLoginItems）中执行。
   *
   * 通过 _autoLaunchChain 串行化，避免快速连续切换时 plist 操作并发交错。
   */
  _applyAutoLaunch(enable) {
    this._autoLaunchPending = true;
    this._autoLaunchChain = this._autoLaunchChain.then(async () => {
      if (enable) {
        await registerAppAutoLaunch();
        logger$t.info("_applyAutoLaunch: 已通过 launchd plist 注册开机自启");
      } else {
        await unregisterAppAutoLaunch();
        logger$t.info("_applyAutoLaunch: 已注销开机自启（plist 已删除）");
      }
    }).catch((err) => logger$t.error(`_applyAutoLaunch: 失败 — ${err.message}`)).finally(() => {
      this._autoLaunchPending = false;
    });
  }
  /** 注册单个快捷键，返回是否注册成功 */
  _registerShortcut(accelerator, hotKey) {
    try {
      const globalShortcut2 = this.deps.getGlobalShortcut();
      const success = globalShortcut2.register(accelerator, () => {
        logger$t.debug(`快捷键触发: ${accelerator} (hotKey=${hotKey})`);
        this.deps.onHotKeyTriggered?.(hotKey);
      });
      if (success) {
        this.registeredAccelerators.add(accelerator);
        logger$t.info(`_registerShortcut: 已注册 ${accelerator}`);
        return true;
      }
      logger$t.warn(`_registerShortcut: 注册失败（已被占用）${accelerator}`);
      return false;
    } catch (err) {
      logger$t.error(`_registerShortcut: 异常 — ${err.message}`);
      return false;
    }
  }
  /** 注销单个快捷键 */
  _unregisterShortcut(accelerator) {
    try {
      const globalShortcut2 = this.deps.getGlobalShortcut();
      globalShortcut2.unregister(accelerator);
      this.registeredAccelerators.delete(accelerator);
      logger$t.debug(`_unregisterShortcut: 已注销 ${accelerator}`);
    } catch (err) {
      logger$t.error(`_unregisterShortcut: 异常 — ${err.message}`);
    }
  }
  /** 根据当前设置注册所有启用的快捷键 */
  _registerAllHotKeys() {
    const isFirstLaunch = this.settingsStore.isFirstLaunch();
    const settings = this.settingsStore.getAll();
    let hasConflict = false;
    const updatedHotKeys = settings.hot_key_settings.map((item) => ({ ...item }));
    for (const item of updatedHotKeys) {
      if (item.enable) {
        const accelerator = toAccelerator(item.modifier, item.vk);
        const success = this._registerShortcut(accelerator, item.hot_key);
        if (!success && isFirstLaunch) {
          logger$t.info(`首次启动: 快捷键 ${accelerator} 冲突，清空设置`);
          item.enable = false;
          item.modifier = 0;
          item.vk = 0;
          hasConflict = true;
        }
      }
    }
    if (hasConflict) {
      this.settingsStore.update({ hot_key_settings: updatedHotKeys });
    }
  }
  /** 注销所有已注册的快捷键 */
  _unregisterAllHotKeys() {
    const globalShortcut2 = this.deps.getGlobalShortcut();
    for (const accelerator of this.registeredAccelerators) {
      try {
        globalShortcut2.unregister(accelerator);
      } catch {
      }
    }
    this.registeredAccelerators.clear();
  }
  /**
   * 通知所有已注册的前端监听：设置已变更
   *
   * 将最新设置数据以 snake_case JSON 推送给所有存活的 listener。
   */
  _notifyListeners() {
    const alive = this.listeners.aliveEntries();
    if (alive.length === 0) return;
    const data = JSON.stringify(this.settingsStore.getAll());
    for (const entry of alive) {
      try {
        entry.ctx.emit(entry.callbackId, JsbCode.kSuccess, data, "");
      } catch (err) {
        logger$t.warn(`_notifyListeners: emit failed wcId=${entry.webContentsId}: ${err.message}`);
      }
    }
    logger$t.debug(`_notifyListeners: 推送给 ${alive.length} 个 listener`);
  }
}
const logger$s = getLogger("jsb:Preview");
class PreviewHandler extends BaseHandler {
  name = "Preview";
  /** [mock] 关闭预览；直接成功 */
  async ClosePreview(ctx, callbackId) {
    logger$s.debug(`[mock] ClosePreview cid=${callbackId}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
}
var UpdateState = /* @__PURE__ */ ((UpdateState2) => {
  UpdateState2["Idle"] = "idle";
  UpdateState2["Checking"] = "checking";
  UpdateState2["Available"] = "available";
  UpdateState2["Downloading"] = "downloading";
  UpdateState2["Downloaded"] = "downloaded";
  UpdateState2["Installing"] = "installing";
  UpdateState2["Prepared"] = "prepared";
  UpdateState2["Applying"] = "applying";
  UpdateState2["Switching"] = "switching";
  UpdateState2["Succeeded"] = "succeeded";
  UpdateState2["Failed"] = "failed";
  return UpdateState2;
})(UpdateState || {});
const LEGAL_TRANSITIONS = {
  [
    "idle"
    /* Idle */
  ]: [
    "checking"
    /* Checking */
  ],
  [
    "checking"
    /* Checking */
  ]: [
    "idle",
    "available"
    /* Available */
  ],
  [
    "available"
    /* Available */
  ]: [
    "downloading",
    "checking",
    "idle"
    /* Idle */
  ],
  [
    "downloading"
    /* Downloading */
  ]: [
    "downloaded",
    "failed",
    "idle"
    /* Idle */
  ],
  [
    "downloaded"
    /* Downloaded */
  ]: [
    "installing",
    "idle"
    /* Idle */
  ],
  [
    "installing"
    /* Installing */
  ]: [
    "prepared",
    "failed"
    /* Failed */
  ],
  [
    "prepared"
    /* Prepared */
  ]: [
    "applying",
    "idle"
    /* Idle */
  ],
  [
    "applying"
    /* Applying */
  ]: [
    "switching",
    "succeeded",
    "failed"
    /* Failed */
  ],
  /** Phase 3 新增：Switching 状态（重启后执行 symlink 切换） */
  [
    "switching"
    /* Switching */
  ]: [
    "succeeded",
    "failed"
    /* Failed */
  ],
  [
    "succeeded"
    /* Succeeded */
  ]: [
    "idle"
    /* Idle */
  ],
  [
    "failed"
    /* Failed */
  ]: [
    "idle",
    "checking",
    "downloading",
    "installing"
    /* Installing */
  ]
};
const logger$r = getLogger("jsb:MarvisUpdateManager");
class MarvisUpdateManagerHandler extends BaseHandler {
  name = "MarvisUpdateManager";
  buildStore;
  updaterDeps;
  checkListeners = new ListenerRegistry();
  progressListeners = new ListenerRegistry();
  /** 缓存最近一次检查更新结果，供新注册的 listener 立即获取 */
  _lastCheckResult = null;
  /** 缓存上次安装进度的 overallProgress，用于过滤回退的进度 */
  _lastInstallProgress = 0;
  /** 缓存上次安装进度的 stage，用于检测新一轮安装（重试）并重置过滤器 */
  _lastInstallStage = "";
  constructor(buildStore, updaterDeps) {
    super();
    this.buildStore = buildStore;
    const stubDeps = {
      checkNow: async () => null,
      onCheckResult: () => () => {
      },
      getLastCheckResult: () => null,
      getState: () => UpdateState.Idle,
      isBusy: () => false,
      startUpdate: async () => ({ code: -1, message: "not implemented" }),
      pauseUpdate: async () => {
      },
      resumeUpdate: async () => {
      },
      cancelUpdate: async () => {
      },
      onProgress: () => {
      },
      onInstallProgress: () => {
      },
      onSilentInstallProgress: () => {
      },
      restartApp: async () => {
      },
      getTargetVersion: () => ""
    };
    this.updaterDeps = updaterDeps ?? stubDeps;
    this.updaterDeps.onCheckResult((result) => {
      this._lastCheckResult = result;
      this._notifyCheckListeners(result);
    });
    this.updaterDeps.onProgress((progress) => {
      this._notifyProgressListeners(progress);
    });
    this.updaterDeps.onInstallProgress((progress) => {
      this._notifyInstallProgressListeners(progress);
    });
    this.updaterDeps.onSilentInstallProgress((progress) => {
      this._notifySilentInstallProgressListeners(progress);
    });
  }
  // ─── 更新检查 ──────────────────────────────────────────
  /**
   * 主动检查更新
   *
   * 通过 updater 模块的 checkNow() 发起检查。
   * 成功后缓存结果并通知所有 check listener。
   */
  async CheckUpdate(ctx, callbackId) {
    try {
      const result = await this.updaterDeps.checkNow(true);
      if (!result) {
        logger$r.warn("CheckUpdate: 检查无结果");
        ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({
          has_update: false,
          update_type: 0,
          silent_update: 0,
          target_version: "",
          changelog: "",
          total_size: 0,
          policy_id: 0,
          exp_id: "",
          exp_group: "",
          components: []
        }));
        return;
      }
      this._lastCheckResult = result;
      const data = JSON.stringify(result);
      ctx.emit(callbackId, JsbCode.kSuccess, data);
    } catch (err) {
      logger$r.error(`CheckUpdate: unexpected error — ${err.message}`);
      ctx.emit(callbackId, JsbCode.kError, "", err.message);
    }
  }
  // ─── 更新检查监听 ──────────────────────────────────────
  /**
   * 注册更新检查结果监听
   *
   * 注册后立即 ack（返回 kSuccess）。如果已有缓存结果，立即推送一次。
   */
  async AddUpdateCheckListener(ctx, callbackId) {
    this.checkListeners.add(ctx, callbackId);
    logger$r.debug(`AddUpdateCheckListener: wcId=${ctx.webContentsId} cid=${callbackId} size=${this.checkListeners.size()}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "");
    const lastResult = this._lastCheckResult ?? this.updaterDeps.getLastCheckResult();
    if (lastResult) {
      const data = JSON.stringify(lastResult);
      ctx.emit(callbackId, JsbCode.kSuccess, data);
    }
  }
  /** 移除更新检查结果监听 */
  async RemoveUpdateCheckListener(ctx, callbackId) {
    this.checkListeners.removeByWebContents(ctx.webContentsId);
    logger$r.debug(`RemoveUpdateCheckListener: wcId=${ctx.webContentsId}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  // ─── 更新进度监听（stub） ──────────────────────────────
  /** 注册更新进度监听 */
  async AddUpdateProgressListener(ctx, callbackId) {
    this.progressListeners.add(ctx, callbackId);
    logger$r.debug(`AddUpdateProgressListener: wcId=${ctx.webContentsId} cid=${callbackId} size=${this.progressListeners.size()}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  /** 移除更新进度监听 */
  async RemoveUpdateProgressListener(ctx, callbackId) {
    this.progressListeners.removeByWebContents(ctx.webContentsId);
    logger$r.debug(`RemoveUpdateProgressListener: wcId=${ctx.webContentsId}`);
    ctx.emit(callbackId, JsbCode.kSuccess, "");
  }
  // ─── 更新控制（stub） ──────────────────────────────────
  /** 开始更新 */
  async StartUpdate(ctx, callbackId) {
    try {
      const result = await this.updaterDeps.startUpdate();
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(result));
    } catch (err) {
      logger$r.error(`StartUpdate: ${err.message}`);
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify({
        code: 4,
        message: err.message
      }));
    }
  }
  /** 暂停更新 */
  async PauseUpdate(ctx, callbackId) {
    try {
      await this.updaterDeps.pauseUpdate();
      ctx.emit(callbackId, JsbCode.kSuccess, "");
    } catch (err) {
      logger$r.warn(`PauseUpdate: ${err.message}`);
      ctx.emit(callbackId, JsbCode.kError, "", err.message);
    }
  }
  /** 恢复更新 */
  async ResumeUpdate(ctx, callbackId) {
    try {
      await this.updaterDeps.resumeUpdate();
      ctx.emit(callbackId, JsbCode.kSuccess, "");
    } catch (err) {
      logger$r.warn(`ResumeUpdate: ${err.message}`);
      ctx.emit(callbackId, JsbCode.kError, "", err.message);
    }
  }
  /** 取消更新 */
  async CancelUpdate(ctx, callbackId) {
    try {
      await this.updaterDeps.cancelUpdate();
      ctx.emit(callbackId, JsbCode.kSuccess, "");
    } catch (err) {
      logger$r.warn(`CancelUpdate: ${err.message}`);
      ctx.emit(callbackId, JsbCode.kError, "", err.message);
    }
  }
  // ─── 版本查询 ──────────────────────────────────────────
  /**
   * 获取当前版本信息
   *
   * 主版本号从 BuildStore 读取，组件版本从 installed.json 读取（通过 resolveComponents）。
   */
  async GetCurrentVersion(ctx, callbackId) {
    try {
      const buildJson = loadBuildJson();
      const installedJson = loadInstalledJson();
      const resolved = resolveComponents(buildJson, installedJson);
      const result = {
        main_version: installedJson?.appVersion ?? this.buildStore.get("version"),
        components: resolved.map((comp) => ({
          type: comp.type,
          name: comp.name,
          version: comp.version
        }))
      };
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(result));
    } catch (err) {
      logger$r.error(`GetCurrentVersion: error — ${err.message}`);
      ctx.emit(callbackId, JsbCode.kError, "", err.message);
    }
  }
  // ─── BaseHandler 钩子 ──────────────────────────────────
  /** 窗口销毁时移除对应的 listener */
  onWebContentsDestroyed(webContentsId) {
    this.checkListeners.removeByWebContents(webContentsId);
    this.progressListeners.removeByWebContents(webContentsId);
  }
  /** 模块销毁：清空所有 listener */
  dispose() {
    this.checkListeners.clear();
    this.progressListeners.clear();
    this._lastCheckResult = null;
    logger$r.info("dispose: 已清理 listener");
  }
  // ─── 内部方法 ──────────────────────────────────────────
  /**
   * 通知所有已注册的 check listener：有新的检查结果
   */
  _notifyCheckListeners(result) {
    const alive = this.checkListeners.aliveEntries();
    if (alive.length === 0) return;
    const data = JSON.stringify(result);
    for (const entry of alive) {
      try {
        entry.ctx.emit(entry.callbackId, JsbCode.kSuccess, data);
      } catch (err) {
        logger$r.warn(`_notifyCheckListeners: emit failed wcId=${entry.webContentsId}: ${err.message}`);
      }
    }
    logger$r.debug(`_notifyCheckListeners: 推送给 ${alive.length} 个 listener`);
  }
  /**
   * 通知所有已注册的 progress listener：下载进度更新
   *
   * 将内部 DownloadProgress 转换为前端 IUpdateProgress 格式（snake_case + status）。
   * status 映射：
   *   progress=0        → 1 (StartDownload)
   *   0 < progress < 100 → 2 (Downloading)
   *   progress=100       → 3 (DownloadSuccess) / 9 (Installing) / 8 (ReadyToRestart)
   */
  _notifyProgressListeners(progress) {
    const alive = this.progressListeners.aliveEntries();
    if (alive.length === 0) return;
    let status;
    let statusText;
    let errorMessage = "";
    const errorCode = 0;
    if (progress.errorMessage) {
      status = 4;
      statusText = "download_failed";
      errorMessage = progress.errorMessage;
    } else if (progress.overallProgress >= 100) {
      const state2 = this.updaterDeps.getState();
      if (state2 === "prepared") {
        status = 8;
        statusText = "ready_to_restart";
      } else if (state2 === "downloaded" || state2 === "installing") {
        return;
      } else {
        status = 3;
        statusText = "download_success";
      }
    } else if (progress.overallProgress === 0) {
      status = 1;
      statusText = "start_download";
    } else {
      status = 2;
      statusText = "downloading";
    }
    const payload = {
      status,
      status_text: statusText,
      overall_progress: progress.overallProgress,
      total_size: progress.totalSize,
      downloaded_size: progress.downloadedSize,
      download_speed: progress.downloadSpeed,
      current_component: progress.currentComponent,
      error_code: errorCode,
      error_message: errorMessage
    };
    const data = JSON.stringify(payload);
    for (const entry of alive) {
      try {
        entry.ctx.emit(entry.callbackId, JsbCode.kSuccess, data);
      } catch (err) {
        logger$r.warn(`_notifyProgressListeners: emit failed wcId=${entry.webContentsId}: ${err.message}`);
      }
    }
    logger$r.debug(`_notifyProgressListeners: ${statusText} ${progress.overallProgress}% 推送给 ${alive.length} 个 listener`);
  }
  /**
   * 通知所有安装进度 listener
   *
   * 将内部 InstallProgress 转换为前端 IInstallProgress 格式。
   * status 映射：
   *   verifying   → installing（校验中）
   *   extracting  → installing（解压中）
   *   moving      → installing（移动中）
   *   done        → ready_to_restart（准备重启）
   *   error       → install_error
   *
   * 注意：前端 computeMergedProgress 使用 overallProgress 字段，
   * 这里将 progress 映射到 overallProgress 以保持一致。
   */
  _notifyInstallProgressListeners(progress) {
    const alive = this.progressListeners.aliveEntries();
    if (alive.length === 0) return;
    const statusMap = {
      // 使用 StartInstall(5) 而非自定义 9，前端 computeMergedProgress 识别 status=5 为安装阶段
      verifying: { status: 5, statusText: "start_install" },
      extracting: { status: 5, statusText: "start_install" },
      moving: { status: 5, statusText: "start_install" },
      done: { status: 8, statusText: "ready_to_restart" },
      // 使用 InstallFailed(7)，前端只处理 UpdateStatus.InstallFailed=7
      error: { status: 7, statusText: "install_failed" }
    };
    const mapped = statusMap[progress.stage] ?? { status: 5, statusText: "start_install" };
    let overallProgress;
    if (progress.stage === "done") {
      overallProgress = 100;
    } else if (progress.stage === "error") {
      overallProgress = this._lastInstallProgress;
    } else {
      overallProgress = progress.progress;
    }
    const isNewCycle = (this._lastInstallStage === "error" || this._lastInstallStage === "done") && (progress.stage === "verifying" || progress.stage === "extracting");
    if (isNewCycle) {
      logger$r.info(`_notifyInstallProgressListeners: 检测到新一轮安装，重置进度过滤器 (lastStage=${this._lastInstallStage})`);
      this._lastInstallProgress = 0;
    }
    if (overallProgress <= this._lastInstallProgress && progress.stage !== "done" && progress.stage !== "error") {
      logger$r.debug(`_notifyInstallProgressListeners: 跳过回退进度 ${overallProgress}% (上次=${this._lastInstallProgress}%)`);
      return;
    }
    this._lastInstallProgress = overallProgress;
    this._lastInstallStage = progress.stage;
    const mainVersion = this.updaterDeps.getTargetVersion();
    const payload = {
      status: mapped.status,
      status_text: mapped.statusText,
      stage: progress.stage,
      component: progress.component || "installing",
      overall_progress: overallProgress,
      total: progress.total,
      index: progress.index,
      // 使用 error_message（与下载进度通道一致），前端 camelizeKeys 后读 errorMessage
      error_message: progress.error ?? "",
      main_version: mainVersion
    };
    if (progress.stage === "done") {
      const installSuccessPayload = {
        status: 6,
        status_text: "install_success",
        stage: "done",
        component: progress.component || "installing",
        overall_progress: 100,
        total: progress.total,
        index: progress.index,
        error_message: "",
        main_version: mainVersion
      };
      this._emitInstallProgressPayload(installSuccessPayload);
      this._emitInstallProgressPayload(payload);
      return;
    }
    this._emitInstallProgressPayload(payload);
  }
  /** 发送安装进度 payload 给所有 listener */
  _emitInstallProgressPayload(payload) {
    const alive = this.progressListeners.aliveEntries();
    const data = JSON.stringify(payload);
    for (const entry of alive) {
      try {
        entry.ctx.emit(entry.callbackId, JsbCode.kSuccess, data);
      } catch (err) {
        logger$r.warn(`_notifyInstallProgressListeners: emit failed wcId=${entry.webContentsId}: ${err.message}`);
      }
    }
  }
  /**
   * 通知所有已注册的 progress listener：静默安装终点态（DocPreview-only 专用）
   *
   * 与 `_notifyInstallProgressListeners` 的区别：
   *   - 只在终点态（成功/失败）推送一次，不推中间进度；
   *   - 成功时仅推 `InstallSuccess(6)`，**不推** `ReadyToRestart(8)`（静默安装不重启）；
   *   - 不参与 `_lastInstallProgress` / `_lastInstallStage` 过滤器，避免干扰常规更新链路。
   *
   * Payload 字段与 `_notifyInstallProgressListeners` 对齐（前端 `IUpdateProgress` 格式），
   * 让前端 `useDocPreviewProgressListener` 无需区分来源即可消费。
   */
  _notifySilentInstallProgressListeners(progress) {
    const alive = this.progressListeners.aliveEntries();
    if (alive.length === 0) return;
    const isSuccess = progress.status === "install_success";
    const payload = {
      // 6 = InstallSuccess；7 = InstallFailed
      status: isSuccess ? 6 : 7,
      status_text: progress.status,
      stage: isSuccess ? "done" : "error",
      component: progress.component,
      // `current_component` 是前端 `IUpdateProgressData` 里的筛选键
      // （如 useDocPreviewProgressListener 通过 data.currentComponent 判断是否关心此条事件）。
      // 与下载通道 (`_notifyProgressListeners`) 保持一致。
      current_component: progress.component,
      overall_progress: isSuccess ? 100 : 0,
      total: 1,
      index: 1,
      error_message: progress.errorMessage ?? "",
      main_version: progress.version
    };
    const data = JSON.stringify(payload);
    for (const entry of alive) {
      try {
        entry.ctx.emit(entry.callbackId, JsbCode.kSuccess, data);
      } catch (err) {
        logger$r.warn(`_notifySilentInstallProgressListeners: emit failed wcId=${entry.webContentsId}: ${err.message}`);
      }
    }
    logger$r.info(`_notifySilentInstallProgressListeners: ${progress.component} ${progress.status} 推送给 ${alive.length} 个 listener`);
  }
}
const EXTERNAL_LOGIN_TYPE_MARVIS = 6;
const FEEDBACK_TMP_SIGN_URL = "https://yybadaccess.3g.qq.com/marvis/marvis_feedback_read/tmp-sign-url";
const FEEDBACK_TMP_SIGN_URL_TEST = "https://yybadaccess.sparta.html5.qq.com/marvis/marvis_feedback_read/tmp-sign-url";
const FEEDBACK_CORS_REQUEST_URL = "https://yybadaccess.3g.qq.com/marvis/marvis_feedback_write/feedback/supplement";
const FEEDBACK_CORS_REQUEST_URL_TEST = "https://yybadaccess.sparta.html5.qq.com/marvis/marvis_feedback_write/feedback/supplement";
const HTTP_TIMEOUT_MS = 3e4;
const UPLOAD_TIMEOUT_MS = 12e4;
const logger$q = getLogger("jsb:system-feedback");
class SystemFeedbackHandler extends BaseHandler {
  name = "systemFeedback";
  deps;
  constructor(deps2) {
    super();
    this.deps = deps2;
  }
  // ─── GetCommonReportParam ──────────────────────────────────
  /**
   * 获取反馈上报的通用参数
   *
   * 对齐 Windows `SystemFeedback::GetCommonReportParam`：
   * - beacon_param：灯塔公参（对齐 Windows androws_beacon_params 中的关键字段）
   * - androws_common_param：Mac 端无模拟器概念，不返回
   *
   * Mac 端在 Windows 80+ 公参基础上精简，只保留对反馈诊断有意义的字段：
   *   - 设备标识：qimei / guid
   *   - 登录态：login_openid / login_type
   *   - 系统信息：os_type / system_version / architecture / locale / region
   *   - 硬件信息：cpu_core_number / cpu_model / cpu_vendor / physical_memory /
   *              graphics_type / graphics_vendor / mem_usage_rate
   *   - 版本信息：main_version / client_type
   *
   * 前端会对返回的 data 做 JSON.parse，得到 ICommonReportParam
   */
  async GetCommonReportParam(ctx, callbackId) {
    try {
      const userInfo2 = this.deps.getUserInfo();
      const mainInfo = userInfo2.main;
      const guid = await getDeviceGuid();
      const hw = await getHardwareInfo();
      const beaconParam = {
        // ─── 设备标识 ───
        qimei: guid,
        guid,
        // ─── 登录态 ───
        login_openid: mainInfo?.openId ?? "",
        login_type: mainInfo?.loginType ?? "",
        // ─── 系统信息 ───
        os_type: "macos",
        system_version: hw.systemVersion,
        architecture: hw.architecture,
        locale: app.getLocale().replace("-", "_"),
        region: app.getLocale().split("-")[1] ?? "",
        // ─── 硬件信息 ───
        cpu_core_number: String(hw.cpuCoreNumber),
        cpu_model: hw.cpuModel,
        cpu_vendor: hw.cpuVendor,
        physical_memory: String(hw.physicalMemoryGb),
        graphics_type: hw.graphicsModel,
        graphics_vendor: hw.graphicsVendor,
        mem_usage_rate: getMemoryUsageRate(),
        // ─── 版本信息 ───
        main_version: loadInstalledJson()?.appVersion || app.getVersion(),
        client_type: "marvis"
      };
      const result = {
        beacon_param: beaconParam
        // Mac 端无 androws_common_param（无模拟器应用信息）
      };
      ctx.emit(callbackId, JsbCode.kSuccess, JSON.stringify(result));
    } catch (err) {
      logger$q.error(`GetCommonReportParam 失败: ${err.message}`);
      ctx.emit(callbackId, JsbCode.kError, "", err.message);
    }
  }
  // ─── UploadDiagnosis ───────────────────────────────────────
  /**
   * 上传诊断日志
   *
   * 对齐 Windows `SystemFeedback::UploadDiagnosis`：
   * - 生成 diagnosis_hash（毫秒时间戳字符串）
   * - 若 fid 非空：收集日志 → 通过 tmp-sign-url 上传 → 回报 fid + downloadUrl
   * - 返回 fid 非空则成功，空则失败
   *
   * Mac 端在 Electron 主进程内直接完成上传（Windows 通过 assistant 进程）
   */
  async UploadDiagnosis(ctx, callbackId, fid) {
    const diagnosisHash = String(Date.now());
    if (!fid) {
      ctx.emit(callbackId, JsbCode.kError, "", "fid is empty");
      return;
    }
    try {
      const taskId = `diagnosis-feedback-${diagnosisHash}`;
      const task = {
        task_id: taskId,
        has_log: 1,
        has_dump: 0,
        has_windows_event: 0
      };
      const files = await collectLogFiles(task);
      if (files.length === 0) {
        logger$q.warn("UploadDiagnosis: 无可收集的日志文件");
        ctx.emit(callbackId, JsbCode.kError, "", "No log files found");
        return;
      }
      const { archivePath, tempDir } = await packLogs(files, taskId);
      try {
        const downloadUrl = await uploadLogViaTmpSignUrl(archivePath);
        if (!downloadUrl) {
          logger$q.error("UploadDiagnosis: 上传诊断日志失败");
          ctx.emit(callbackId, JsbCode.kError, "", "Upload failed");
          return;
        }
        logger$q.info(`UploadDiagnosis: 上传成功, downloadUrl=${downloadUrl}`);
        await reportFeedbackUploadLogRequest(fid, downloadUrl);
        ctx.emit(callbackId, JsbCode.kSuccess, "");
      } finally {
        try {
          await rm(tempDir, { recursive: true, force: true });
        } catch {
        }
      }
    } catch (err) {
      const msg = err.message;
      logger$q.error(`UploadDiagnosis 失败: ${msg}`);
      ctx.emit(callbackId, JsbCode.kError, "", msg);
    }
  }
}
function getMemoryUsageRate() {
  const totalMem = os$1.totalmem();
  const freeMem = os$1.freemem();
  const usageRate = totalMem > 0 ? (totalMem - freeMem) / totalMem : 0;
  return usageRate.toFixed(2);
}
async function uploadLogViaTmpSignUrl(archivePath) {
  const fileMd5 = await computeFileMd5(archivePath);
  const fileName = `${fileMd5}.7z`;
  const queryParams = `module=client-feedback-attach&fileName=${fileName}&fileMd5=${fileMd5}`;
  const isDev = process.env.MARVIS_API_DEBUG_MODE === "1" || process.env.MARVIS_API_DEBUG_MODE === "true";
  const baseUrl = isDev ? FEEDBACK_TMP_SIGN_URL_TEST : FEEDBACK_TMP_SIGN_URL;
  const requestUrl = `${baseUrl}?${queryParams}`;
  const headers = buildSignatureHeaders(queryParams);
  const guid = await getDeviceGuid();
  headers["Ual-Access-Guid"] = guid;
  headers["Ual-Access-Requestid"] = `${guid}-${headers["Ual-Access-Timestamp"]}`;
  headers["X-Tone-RequestId"] = generateRandomString();
  const headersWithLogin = appendLoginHeaders(headers);
  const signResponse = await httpGet(requestUrl, headersWithLogin);
  if (!signResponse) {
    logger$q.error("uploadLogViaTmpSignUrl: 获取 tmp-sign-url 失败");
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(signResponse);
  } catch {
    logger$q.error(`uploadLogViaTmpSignUrl: tmp-sign-url 响应 JSON 解析失败: ${signResponse.slice(0, 200)}`);
    return null;
  }
  if (parsed.errcode !== 0 || !parsed.data) {
    logger$q.error(`uploadLogViaTmpSignUrl: tmp-sign-url errcode=${parsed.errcode}, msg=${parsed.msg}`);
    return null;
  }
  const { tmpSignUrl, downloadUrl, constraint } = parsed.data;
  const putSuccess = await httpPutFile(tmpSignUrl, archivePath, constraint);
  if (!putSuccess) {
    logger$q.error("uploadLogViaTmpSignUrl: PUT 文件失败");
    return null;
  }
  return downloadUrl;
}
async function reportFeedbackUploadLogRequest(fid, downloadUrl) {
  const userInfo2 = getUserInfo();
  if (!userInfo2.main?.accessToken) {
    logger$q.warn("reportFeedbackUploadLogRequest: 未登录，跳过回报");
    return;
  }
  const queryData = JSON.stringify({ fid });
  const queryString = `?data=${encodeURIComponent(queryData)}`;
  const isDev = process.env.MARVIS_API_DEBUG_MODE === "1" || process.env.MARVIS_API_DEBUG_MODE === "true";
  const baseUrl = isDev ? FEEDBACK_CORS_REQUEST_URL_TEST : FEEDBACK_CORS_REQUEST_URL;
  const requestUrl = baseUrl + queryString;
  const postData = JSON.stringify({ attach: [downloadUrl] });
  const headers = buildSignatureHeaders(postData);
  const guid = await getDeviceGuid();
  headers["Ual-Access-Guid"] = guid;
  headers["Ual-Access-Requestid"] = `${guid}-${headers["Ual-Access-Timestamp"]}`;
  headers["Ual-Access-Openid"] = userInfo2.main.openId;
  headers["Ual-Access-Login-Type"] = String(getExternalLoginTypeInt(userInfo2.main.loginType));
  headers["Ual-Access-Access-Token"] = userInfo2.main.accessToken;
  headers["X-Tone-RequestId"] = generateRandomString();
  headers.Source = "api";
  try {
    await httpPost(requestUrl, postData, headers);
    logger$q.info("reportFeedbackUploadLogRequest: 回报成功");
  } catch (err) {
    logger$q.warn(`reportFeedbackUploadLogRequest: 回报失败(非致命): ${err.message}`);
  }
}
function httpGet(url, customHeaders) {
  return new Promise((resolve2, _reject) => {
    const urlObj = new URL(url);
    const req = request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: `${urlObj.pathname}${urlObj.search}`,
        method: "GET",
        headers: customHeaders,
        timeout: HTTP_TIMEOUT_MS
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve2(data);
          } else {
            logger$q.error(`httpGet 失败: status=${res.statusCode} url=${url}`);
            resolve2(null);
          }
        });
      }
    );
    req.on("error", (err) => {
      logger$q.error(`httpGet error: ${err.message}`);
      resolve2(null);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve2(null);
    });
    req.end();
  });
}
function httpPutFile(url, filePath, constraint) {
  return new Promise((resolve2) => {
    const fileStat = statSync$1(filePath);
    const urlObj = new URL(url);
    const md5Base64 = computeFileMd5Base64(filePath);
    const headers = {
      "Content-Type": "application/octet-stream",
      "Content-Length": fileStat.size,
      "Content-MD5": md5Base64,
      referer: "https://api.dcl.qq.com"
    };
    if (constraint?.acl) {
      headers["x-cos-acl"] = constraint.acl;
    }
    if (constraint?.storageClass) {
      headers["x-cos-storage-class"] = constraint.storageClass;
    }
    if (constraint?.trafficLimit) {
      headers["x-cos-traffic-limit"] = constraint.trafficLimit;
    }
    const req = request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: `${urlObj.pathname}${urlObj.search}`,
        method: "PUT",
        headers,
        timeout: UPLOAD_TIMEOUT_MS
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve2(true);
          } else {
            logger$q.error(`httpPutFile 失败: status=${res.statusCode} body=${data.slice(0, 200)}`);
            resolve2(false);
          }
        });
      }
    );
    req.on("error", (err) => {
      logger$q.error(`httpPutFile error: ${err.message}`);
      resolve2(false);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve2(false);
    });
    const fileStream = createReadStream(filePath);
    fileStream.pipe(req);
  });
}
function httpPost(url, body, customHeaders) {
  return new Promise((resolve2, reject) => {
    const urlObj = new URL(url);
    const headers = { ...customHeaders };
    headers["Content-Length"] = Buffer.byteLength(body);
    const req = request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: `${urlObj.pathname}${urlObj.search}`,
        method: "POST",
        headers,
        timeout: HTTP_TIMEOUT_MS
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          resolve2({ statusCode: res.statusCode ?? 0, body: data });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("HTTP POST 超时"));
    });
    req.write(body);
    req.end();
  });
}
function computeFileMd5(filePath) {
  return new Promise((resolve2, reject) => {
    const hash = createHash("md5");
    const stream = createReadStream(filePath);
    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve2(hash.digest("hex")));
    stream.on("error", reject);
  });
}
function computeFileMd5Base64(filePath) {
  const fileBuffer = readFileSync$1(filePath);
  return createHash("md5").update(fileBuffer).digest("base64");
}
function generateRandomString() {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let randomStr = "";
  const bytes = randomBytes(22);
  for (let i = 0; i < 22; i++) {
    randomStr += chars[bytes[i] % chars.length];
  }
  const timestamp = Math.floor(Date.now() / 1e3);
  return `${randomStr}_${timestamp}`;
}
function getExternalLoginTypeInt(loginType) {
  switch (loginType) {
    case "QC":
    case "WX":
    case "WXAPP":
    case "Marvis":
      return EXTERNAL_LOGIN_TYPE_MARVIS;
    default:
      return 0;
  }
}
function getUserInfo() {
  return getUserInfo$1();
}
function appendLoginHeaders(headers) {
  const result = { ...headers };
  const userInfo2 = getUserInfo();
  if (userInfo2.main) {
    if (userInfo2.main.accessToken) {
      result["Ual-Access-Access-Token"] = userInfo2.main.accessToken;
    }
    if (userInfo2.main.openId) {
      result["Ual-Access-Openid"] = userInfo2.main.openId;
    }
    if (userInfo2.main.loginType) {
      result["Ual-Access-Login-Type"] = String(getExternalLoginTypeInt(userInfo2.main.loginType));
    }
  }
  return result;
}
class KVStorageStore {
  store;
  constructor() {
    this.store = new Store({
      name: "marvis-kv-storage",
      defaults: {
        tables: {}
      }
    });
  }
  // ─── 读取 ──────────────────────────────────────────────
  /**
   * 按表名 + key 查询单条记录
   *
   * 对齐 C++ `KVStorageTable::Query`：key 不存在返回 undefined。
   */
  query(tableName, key) {
    const tables = this.store.get("tables");
    const table = tables?.[tableName];
    if (!table) return void 0;
    return table[key];
  }
  // ─── 写入 ──────────────────────────────────────────────
  /**
   * 插入或更新一条记录
   *
   * 对齐 C++ `KVStorageTable::InsertOrUpdate`：
   * - `updateTime <= 0` → 使用 `Date.now()`
   * - key 不存在 → 新建 entry，`create_time` 设为当前时间戳
   * - key 已存在 → 仅更新 `json_data` 和 `update_time`（create_time 保持不变）
   *
   * @returns 是否写入成功；仅在底层 electron-store 抛异常时返回 false
   */
  insertOrUpdate(tableName, key, jsonData, updateTime = 0) {
    try {
      const effectiveUpdateTime = updateTime && updateTime > 0 ? updateTime : Date.now();
      const tables = { ...this.store.get("tables") };
      const table = { ...tables[tableName] ?? {} };
      const existed = table[key];
      if (existed) {
        table[key] = {
          ...existed,
          json_data: jsonData,
          update_time: effectiveUpdateTime
        };
      } else {
        table[key] = {
          json_data: jsonData,
          update_time: effectiveUpdateTime,
          create_time: Date.now()
        };
      }
      tables[tableName] = table;
      this.store.set("tables", tables);
      return true;
    } catch {
      return false;
    }
  }
  // ─── 调试 ──────────────────────────────────────────────
  /** 获取 store 文件路径（调试/日志用） */
  getStorePath() {
    return this.store.path;
  }
}
const logger$p = getLogger("jsb:KVStorage");
const DEFAULT_KV_TABLE_MAPPING = {
  home: "ai_starter_home",
  gallery: "ai_starter_gallery",
  common: "ai_starter_common"
};
class KVStorageHandler extends BaseHandler {
  constructor(store, tableNameMapping = DEFAULT_KV_TABLE_MAPPING) {
    super();
    this.store = store;
    this.tableNameMapping = tableNameMapping;
  }
  store;
  tableNameMapping;
  name = "KVStorage";
  /**
   * 读取数据
   *
   * @param tableType 前端表类型字符串（home / gallery / common）
   * @param key       业务 key
   *
   * 响应：
   *   - 成功 → code=kSuccess, data=JSON.stringify({ json_data, update_time, create_time })
   *   - 非法 tableType → code=kParameterError
   *   - key 不存在 → code=kKeyNotFound
   */
  async Read(ctx, callbackId, ...args) {
    const tableType = typeof args[0] === "string" ? args[0] : "";
    const key = typeof args[1] === "string" ? args[1] : "";
    logger$p.debug(`[Read] cid=${callbackId} tableType=${tableType} key=${key}`);
    const tableName = this._resolveTableName(tableType);
    if (!tableName) {
      logger$p.warn(`[Read] invalid table_type: ${tableType}`);
      ctx.emit(callbackId, JsbCode.kParameterError, "", "invalid table_type");
      return;
    }
    const result = this.store.query(tableName, key);
    if (!result) {
      logger$p.debug(`[Read] key not found: table=${tableName} key=${key}`);
      ctx.emit(callbackId, JsbCode.kKeyNotFound, "", "key not found");
      return;
    }
    const data = JSON.stringify({
      json_data: result.json_data,
      update_time: result.update_time,
      create_time: result.create_time
    });
    ctx.emit(callbackId, JsbCode.kSuccess, data, "");
  }
  /**
   * 写入数据
   *
   * @param tableType   前端表类型字符串
   * @param key         业务 key
   * @param jsonData    业务 JSON 字符串（由前端 stringify，原样存储）
   * @param updateTime  更新时间戳（毫秒），<=0 时由本端取当前时间（对齐 C++）
   *
   * 响应：
   *   - 成功 → code=kSuccess, data=JSON.stringify({ table_type, key, json_data, update_time })
   *   - 非法 tableType → code=kParameterError
   *   - 底层写入异常 → code=kWriteFailed
   */
  async Write(ctx, callbackId, ...args) {
    const tableType = typeof args[0] === "string" ? args[0] : "";
    const key = typeof args[1] === "string" ? args[1] : "";
    const jsonData = typeof args[2] === "string" ? args[2] : "";
    const updateTime = typeof args[3] === "number" ? args[3] : 0;
    logger$p.debug(`[Write] cid=${callbackId} tableType=${tableType} key=${key} updateTime=${updateTime}`);
    const tableName = this._resolveTableName(tableType);
    if (!tableName) {
      logger$p.warn(`[Write] invalid table_type: ${tableType}`);
      ctx.emit(callbackId, JsbCode.kParameterError, "", "invalid table_type");
      return;
    }
    const ok2 = this.store.insertOrUpdate(tableName, key, jsonData, updateTime);
    if (!ok2) {
      logger$p.warn(`[Write] write failed: table=${tableName} key=${key}`);
      ctx.emit(callbackId, JsbCode.kWriteFailed, "", "write failed");
      return;
    }
    const latest = this.store.query(tableName, key);
    const actualUpdateTime = latest?.update_time ?? updateTime;
    const data = JSON.stringify({
      table_type: tableType,
      key,
      json_data: jsonData,
      update_time: actualUpdateTime
    });
    ctx.emit(callbackId, JsbCode.kSuccess, data, "");
  }
  // ─── 内部辅助 ──────────────────────────────────────────
  _resolveTableName(tableType) {
    if (!tableType) return void 0;
    return this.tableNameMapping[tableType];
  }
}
const UPDATE_CHECK_API_PATH = "/v3/marvis_client_update_mac";
const UPDATE_HOST = "https://yybadaccess.3g.qq.com";
const UPDATE_REQUEST_TIMEOUT_MS = 1e4;
const UPDATE_RETRY_COUNT = 3;
const UPDATE_RETRY_INTERVAL_MS = 100;
const CLIENT_TYPE = 0;
const SCENE = 1;
const UPDATE_REPORT_API_PATH = "/v3/marvis_client_update_report_mac";
const REPORT_REQUEST_TIMEOUT_MS = 5e3;
const logger$o = getLogger("update-api");
function parseBackendUpdateType(raw) {
  switch (raw) {
    case 0:
      return 0;
    case 1e3:
      return 1;
    case 2e3:
      return 2;
    case 3e3:
      return 3;
    case 4e3:
      return 4;
    default:
      return 0;
  }
}
function sleep$1(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function postOnce(url, headers, body) {
  const controller = new AbortController();
  const timer2 = setTimeout(() => controller.abort(), UPDATE_REQUEST_TIMEOUT_MS);
  logger$o.info(`postOnce: request headers=${JSON.stringify(headers)}`);
  try {
    const res = await net.fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      bypassCustomProtocolHandlers: true
    });
    const rspHeaders = {};
    res.headers.forEach((value, key) => {
      rspHeaders[key] = value;
    });
    logger$o.info(`postOnce: response status=${res.status} headers=${JSON.stringify(rspHeaders)}`);
    const text = await res.text();
    logger$o.info(`postOnce: response body=${text.slice(0, 500)}`);
    return { ok: res.ok, status: res.status, body: text };
  } finally {
    clearTimeout(timer2);
  }
}
async function postWithRetry(url, body) {
  let lastErr = null;
  const guid = await getDeviceGuid();
  for (let i = 0; i < UPDATE_RETRY_COUNT; i++) {
    try {
      const headers = buildSignatureHeaders(body);
      headers["Ual-Access-Guid"] = guid;
      headers["Ual-Access-Requestid"] = `${guid}-${headers["Ual-Access-Timestamp"]}`;
      logger$o.info(`POST ${url} attempt=${i + 1}/${UPDATE_RETRY_COUNT}`);
      const resp = await postOnce(url, headers, body);
      logger$o.info(`POST ${url.slice(0, 80)} attempt=${i + 1}/${UPDATE_RETRY_COUNT} status=${resp.status}`);
      if (resp.ok) return resp;
      if (i < UPDATE_RETRY_COUNT - 1) await sleep$1(UPDATE_RETRY_INTERVAL_MS);
    } catch (err) {
      lastErr = err;
      logger$o.warn(`POST ${url.slice(0, 80)} attempt=${i + 1}/${UPDATE_RETRY_COUNT} exception: ${lastErr.message}`);
      if (i < UPDATE_RETRY_COUNT - 1) await sleep$1(UPDATE_RETRY_INTERVAL_MS);
    }
  }
  if (lastErr) logger$o.warn(`POST ${url.slice(0, 80)} all ${UPDATE_RETRY_COUNT} attempts failed`);
  return null;
}
async function buildCheckUpdateRequest(buildStore) {
  const version = buildStore.get("version");
  const channelIdStr = buildStore.get("channelId");
  const guid = await getDeviceGuid();
  const installedJson = loadInstalledJson();
  const resolved = resolveComponentsForCheckUpdate(installedJson);
  return {
    client_type: CLIENT_TYPE,
    version,
    supply_channel: parseInt(channelIdStr, 10) || 0,
    guid,
    scene: SCENE,
    is_force_update: false,
    env_info: {
      architecture: process.arch.toUpperCase()
    },
    components: resolved.map((comp) => ({
      name: comp.name,
      type: comp.type,
      version: comp.version
    }))
  };
}
function parseUpdateResponse(rspBody) {
  let parsed;
  try {
    parsed = JSON.parse(rspBody);
  } catch {
    logger$o.warn(`parseUpdateResponse: JSON parse failed, body=${rspBody.slice(0, 200)}`);
    return null;
  }
  const bizCode = parsed.code ?? -1;
  if (bizCode !== 0) {
    logger$o.warn(`parseUpdateResponse: biz error code=${bizCode} msg=${parsed.msg ?? ""}`);
    return null;
  }
  const { data } = parsed;
  if (!data) {
    logger$o.warn("parseUpdateResponse: response data is empty");
    return null;
  }
  const rawUpdateType = data.update_type ?? 0;
  const internalUpdateType = parseBackendUpdateType(rawUpdateType);
  const hasUpdate = internalUpdateType !== 0;
  const resultComponents = (data.components ?? []).map((comp) => ({
    type: comp.type ?? 0,
    name: comp.name ?? "",
    version: comp.version ?? "",
    md5: comp.md5 ?? "",
    sha256: "",
    size: comp.size ?? 0,
    url: comp.url ?? "",
    desc: comp.desc ?? "",
    is_diff: comp.is_diff ?? false
  }));
  const totalSize = data.total_size ?? resultComponents.reduce((sum, c) => sum + c.size, 0);
  return {
    has_update: hasUpdate,
    update_type: internalUpdateType,
    // 后端字段为 slient_update（typo）
    silent_update: data.slient_update ?? 0,
    target_version: data.version ?? "",
    changelog: data.update_desc ?? "",
    total_size: totalSize,
    policy_id: data.policy_id ?? 0,
    exp_id: data.exp_id ?? "",
    exp_group: data.exp_group ?? "",
    components: resultComponents
  };
}
async function checkUpdate(buildStore) {
  try {
    const reqBody = await buildCheckUpdateRequest(buildStore);
    const bodyStr = JSON.stringify(reqBody);
    const url = UPDATE_HOST + UPDATE_CHECK_API_PATH;
    logger$o.info(`checkUpdate: POST ${url} body=${bodyStr}`);
    const resp = await postWithRetry(url, bodyStr);
    if (!resp) {
      logger$o.warn("checkUpdate: network request failed (all retries exhausted)");
      return null;
    }
    if (!resp.ok) {
      logger$o.warn(`checkUpdate: http failed status=${resp.status}`);
      return null;
    }
    const result = parseUpdateResponse(resp.body);
    if (result) {
      logger$o.info(`checkUpdate: success has_update=${result.has_update} update_type=${result.update_type} target_version=${result.target_version}`);
    }
    return result;
  } catch (err) {
    logger$o.error(`checkUpdate: unexpected error — ${err.message}`);
    return null;
  }
}
var ReportStatus = /* @__PURE__ */ ((ReportStatus2) => {
  ReportStatus2[ReportStatus2["Success"] = 1] = "Success";
  ReportStatus2[ReportStatus2["Failed"] = 2] = "Failed";
  return ReportStatus2;
})(ReportStatus || {});
function toBackendUpdateType(internal) {
  switch (internal) {
    case 0:
      return 0;
    case 1:
      return 1e3;
    case 2:
      return 2e3;
    case 3:
      return 3e3;
    case 4:
      return 4e3;
    default:
      return 0;
  }
}
function buildReportUpdateInfo(checkResult) {
  return {
    policy_id: checkResult.policy_id,
    slient_update: checkResult.silent_update,
    update_type: toBackendUpdateType(checkResult.update_type),
    version: checkResult.target_version
  };
}
async function reportUpdateResult(status, duration, updateInfo) {
  try {
    const guid = await getDeviceGuid();
    const reqBody = {
      duration: Math.round(duration),
      guid,
      status,
      update_info: updateInfo
    };
    const bodyStr = JSON.stringify(reqBody);
    const url = UPDATE_HOST + UPDATE_REPORT_API_PATH;
    logger$o.info(`reportUpdateResult: POST ${url} body=${bodyStr}`);
    const headers = buildSignatureHeaders(bodyStr);
    headers["Ual-Access-Guid"] = guid;
    headers["Ual-Access-Requestid"] = `${guid}-${headers["Ual-Access-Timestamp"]}`;
    const controller = new AbortController();
    const timer2 = setTimeout(() => controller.abort(), REPORT_REQUEST_TIMEOUT_MS);
    try {
      const res = await net.fetch(url, {
        method: "POST",
        headers,
        body: bodyStr,
        signal: controller.signal,
        bypassCustomProtocolHandlers: true
      });
      const text = await res.text();
      if (res.ok) {
        logger$o.info(`reportUpdateResult: success status=${res.status} body=${text.slice(0, 200)}`);
      } else {
        logger$o.warn(`reportUpdateResult: http error status=${res.status} body=${text.slice(0, 200)}`);
      }
    } finally {
      clearTimeout(timer2);
    }
  } catch (err) {
    logger$o.warn(`reportUpdateResult: failed — ${err.message}`);
  }
}
const logger$n = getLogger("updater:state-machine");
class UpdateStateMachine {
  _state = UpdateState.Idle;
  _history = [];
  /** 当前状态 */
  get state() {
    return this._state;
  }
  /** 是否处于可操作状态（非 Idle/Available/Downloaded/Prepared/Failed 时拒绝新的 check/start） */
  get isBusy() {
    return this._state !== UpdateState.Idle && this._state !== UpdateState.Available && this._state !== UpdateState.Downloaded && this._state !== UpdateState.Prepared && this._state !== UpdateState.Failed;
  }
  /** 状态迁移历史 */
  get history() {
    return this._history;
  }
  /**
   * 尝试迁移状态
   *
   * @param to - 目标状态
   * @param reason - 迁移原因（日志/埋点）
   * @throws 非法迁移时抛错
   */
  transition(to, reason) {
    const from = this._state;
    const allowed = LEGAL_TRANSITIONS[from];
    if (!allowed?.includes(to)) {
      const msg = `非法状态迁移: ${from} → ${to} (reason=${reason})`;
      logger$n.error(msg);
      throw new Error(msg);
    }
    this._state = to;
    const transition = { from, to, reason };
    this._history.push(transition);
    logger$n.info(`状态迁移: ${from} → ${to} (reason=${reason})`);
  }
  /**
   * 安全尝试迁移（不抛错，返回是否成功）
   */
  tryTransition(to, reason) {
    try {
      this.transition(to, reason);
      return true;
    } catch {
      return false;
    }
  }
  /** 重置到 Idle（测试用） */
  reset() {
    this._state = UpdateState.Idle;
    this._history.length = 0;
  }
}
var ComponentTaskStatus = /* @__PURE__ */ ((ComponentTaskStatus2) => {
  ComponentTaskStatus2["Pending"] = "pending";
  ComponentTaskStatus2["Downloading"] = "downloading";
  ComponentTaskStatus2["Verifying"] = "verifying";
  ComponentTaskStatus2["Completed"] = "completed";
  ComponentTaskStatus2["Failed"] = "failed";
  ComponentTaskStatus2["Cancelled"] = "cancelled";
  return ComponentTaskStatus2;
})(ComponentTaskStatus || {});
function computeHashStream(filePath, algorithm) {
  return new Promise((resolve2, reject) => {
    const hash = createHash(algorithm);
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("end", () => {
      resolve2(hash.digest("hex").toLowerCase());
    });
    stream.on("error", (err) => {
      reject(err);
    });
  });
}
async function computeSha256Stream(filePath) {
  return computeHashStream(filePath, "sha256");
}
async function computeMd5Stream(filePath) {
  return computeHashStream(filePath, "md5");
}
const logger$m = getLogger("updater:downloader");
class ComponentDownloader {
  _currentBatch = null;
  _rpcClient = null;
  _pollTimer = null;
  _onProgressHandler = null;
  _onCompleteHandler = null;
  /** 设置进度回调 */
  onProgress(handler) {
    this._onProgressHandler = handler;
  }
  /** 设置完成回调 */
  onComplete(handler) {
    this._onCompleteHandler = handler;
  }
  /**
   * 开始批次下载
   *
   * @param batch - 下载批次信息
   * @param rpcClient - aria2 RPC 客户端
   * @param speedLimit - 单任务下载限速 (bytes/s)，0 或 undefined = 不限速
   */
  async startBatch(batch, rpcClient2, speedLimit) {
    this._rpcClient = rpcClient2;
    this._currentBatch = batch;
    if (existsSync(batch.batchDir)) {
      rmSync(batch.batchDir, { recursive: true, force: true });
    }
    mkdirSync(batch.batchDir, { recursive: true });
    logger$m.info(`startBatch: batchId=${batch.batchId} 任务数=${batch.tasks.length}`);
    try {
      for (const task of batch.tasks) {
        task.status = ComponentTaskStatus.Downloading;
        const options = {
          dir: batch.batchDir,
          out: task.archivePath.split("/").pop() || `${task.name}-${task.toVersion}.zip`,
          continue: true
        };
        if (speedLimit && speedLimit > 0) {
          options["max-download-limit"] = String(speedLimit);
        }
        const sha256Value = task.sha256?.toString().trim() || "";
        logger$m.info(`startBatch: ${task.name} sha256="${sha256Value}" (original type: ${typeof task.sha256})`);
        const SHA256_REGEX2 = /^[a-f0-9]{64}$/i;
        if (sha256Value !== "" && SHA256_REGEX2.test(sha256Value)) {
          options.checksum = `sha-256=${sha256Value.toLowerCase()}`;
          logger$m.info(`startBatch: ${task.name} 添加 checksum 校验: ${options.checksum}`);
        } else {
          if (sha256Value !== "") {
            logger$m.warn(`startBatch: ${task.name} sha256 格式不正确（期望 64 位十六进制字符串，实际是 ${sha256Value.length} 位），跳过 checksum 校验`);
          } else {
            logger$m.info(`startBatch: ${task.name} 跳过 checksum 校验（sha256 为空）`);
          }
        }
        logger$m.info(`startBatch: ${task.name} 调用 addUri，options=${JSON.stringify(options)}`);
        const gid = await rpcClient2.addUri([task.url], options);
        logger$m.info(`startBatch: ${task.name} addUri 成功，gid=${gid}`);
        task.gid = gid;
        logger$m.info(`startBatch: 入队 ${task.name} gid=${gid}`);
      }
      this._startPolling();
    } catch (err) {
      logger$m.error(`startBatch: 入队失败 — ${err.message}`);
      this._failBatch(err.message);
    }
  }
  /**
   * 暂停下载
   */
  async pause() {
    if (!this._rpcClient || !this._currentBatch) return;
    for (const task of this._currentBatch.tasks) {
      if (task.gid && task.status === ComponentTaskStatus.Downloading) {
        try {
          await this._rpcClient.forcePause(task.gid);
        } catch (err) {
          logger$m.warn(`pause: ${task.name} 暂停失败 — ${err.message}`);
        }
      }
    }
  }
  /**
   * 恢复下载
   */
  async resume() {
    if (!this._rpcClient || !this._currentBatch) return;
    for (const task of this._currentBatch.tasks) {
      if (task.gid && task.status === ComponentTaskStatus.Downloading) {
        try {
          await this._rpcClient.unpause(task.gid);
        } catch (err) {
          logger$m.warn(`resume: ${task.name} 恢复失败 — ${err.message}`);
        }
      }
    }
  }
  /**
   * 取消下载
   */
  async cancel() {
    if (!this._rpcClient || !this._currentBatch) return;
    this._stopPolling();
    for (const task of this._currentBatch.tasks) {
      if (task.gid) {
        try {
          await this._rpcClient.forceRemove(task.gid);
        } catch (err) {
          logger$m.warn(`cancel: ${task.name} 取消失败 — ${err.message}`);
        }
        task.status = ComponentTaskStatus.Cancelled;
      }
    }
    if (this._currentBatch && existsSync(this._currentBatch.batchDir)) {
      try {
        rmSync(this._currentBatch.batchDir, { recursive: true, force: true });
      } catch {
      }
    }
  }
  /** 启动进度轮询 */
  _startPolling() {
    if (this._pollTimer) return;
    this._pollTimer = setInterval(() => {
      void this._pollProgress();
    }, DOWNLOAD_POLL_INTERVAL_MS);
    if (this._pollTimer && typeof this._pollTimer === "object" && "unref" in this._pollTimer) {
      this._pollTimer.unref();
    }
  }
  /** 停止进度轮询 */
  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }
  /** 轮询下载进度 */
  async _pollProgress() {
    if (!this._currentBatch || !this._rpcClient) return;
    let allComplete = true;
    let totalDownloaded = 0;
    let totalSize = 0;
    let totalSpeed = 0;
    let currentComponent = "";
    let failCount2 = 0;
    for (const task of this._currentBatch.tasks) {
      if (!task.gid) continue;
      try {
        const status = await this._rpcClient.tellStatus(task.gid);
        const statusTotalLength = parseInt(status.totalLength, 10) || 0;
        if (status.status === "complete") {
          task.status = ComponentTaskStatus.Verifying;
          task.completedLength = statusTotalLength || task.size;
        } else if (status.status === "error" || status.status === "removed") {
          task.status = ComponentTaskStatus.Failed;
          task.errorCode = parseInt(status.errorCode || "0", 10);
          task.errorMessage = status.errorMessage || "下载失败";
          this._failBatch(task.errorMessage);
          return;
        } else {
          allComplete = false;
          task.completedLength = parseInt(status.completedLength, 10) || 0;
          task.downloadSpeed = parseInt(status.downloadSpeed, 10) || 0;
          if (task.downloadSpeed > 0) {
            currentComponent = task.name;
          }
        }
        totalDownloaded += task.completedLength;
        totalSize += statusTotalLength || task.size;
        totalSpeed += task.downloadSpeed;
      } catch (err) {
        logger$m.warn(`pollProgress: tellStatus 失败 gid=${task.gid}: ${err.message}`);
        failCount2 += 1;
        allComplete = false;
      }
    }
    if (failCount2 > 0 && failCount2 === this._currentBatch.tasks.filter((t) => t.gid).length) {
      logger$m.error("pollProgress: 所有 tellStatus 均失败，判定 aria2c 进程已退出");
      this._failBatch("下载服务异常退出，请重试");
      return;
    }
    const overallProgress = totalSize > 0 ? Math.round(totalDownloaded / totalSize * 100) : 0;
    const progress = {
      overallProgress,
      currentComponent: currentComponent || this._currentBatch.tasks[0]?.name || "",
      downloadedSize: totalDownloaded,
      totalSize,
      downloadSpeed: totalSpeed
    };
    logger$m.info(`pollProgress: ${progress.overallProgress}% downloaded=${progress.downloadedSize} total=${progress.totalSize} speed=${progress.downloadSpeed}`);
    this._onProgressHandler?.(progress);
    if (allComplete) {
      this._stopPolling();
      await this._verifyBatch();
    }
  }
  /** 二次完整性校验（优先 SHA256，fallback MD5） */
  async _verifyBatch() {
    if (!this._currentBatch) return;
    logger$m.info("verifyBatch: 开始二次完整性校验");
    const SHA256_REGEX2 = /^[a-f0-9]{64}$/i;
    const MD5_REGEX = /^[a-f0-9]{32}$/i;
    for (const task of this._currentBatch.tasks) {
      try {
        const sha256Value = (task.sha256 || "").trim();
        const md5Value = (task.md5 || "").trim();
        if (SHA256_REGEX2.test(sha256Value)) {
          const actual = await computeSha256Stream(task.archivePath);
          if (actual !== sha256Value.toLowerCase()) {
            logger$m.error(`verifyBatch: SHA256 不匹配 ${task.name}: expected=${sha256Value} actual=${actual}`);
            this._failBatch(`${task.name} SHA256 校验失败`);
            return;
          }
          logger$m.info(`verifyBatch: ${task.name} SHA256 校验通过`);
        } else if (MD5_REGEX.test(md5Value)) {
          const actual = await computeMd5Stream(task.archivePath);
          if (actual !== md5Value.toLowerCase()) {
            logger$m.error(`verifyBatch: MD5 不匹配 ${task.name}: expected=${md5Value} actual=${actual}`);
            this._failBatch(`${task.name} MD5 校验失败`);
            return;
          }
          logger$m.info(`verifyBatch: ${task.name} MD5 校验通过`);
        } else {
          logger$m.warn(`verifyBatch: ${task.name} 无有效 sha256/md5，跳过校验`);
        }
        task.status = ComponentTaskStatus.Completed;
      } catch (err) {
        logger$m.error(`verifyBatch: ${task.name} 校验异常 — ${err.message}`);
        this._failBatch(err.message);
        return;
      }
    }
    logger$m.info("verifyBatch: 全部校验通过");
    this._onCompleteHandler?.(true);
  }
  /** 整批失败 */
  _failBatch(error) {
    this._stopPolling();
    if (this._currentBatch) {
      try {
        if (existsSync(this._currentBatch.batchDir)) {
          rmSync(this._currentBatch.batchDir, { recursive: true, force: true });
        }
      } catch (err) {
        logger$m.warn(`failBatch: 清理目录失败 — ${err.message}`);
      }
    }
    this._onCompleteHandler?.(false, error);
  }
}
const PENDING_REPLACE_MARKER = "update.pending-replace";
const PENDING_SWITCH_MARKER = "update.pending-switch";
const PENDING_VERSION_MARKER = "update.pending-version";
const logger$l = getLogger("updater:async-fs");
async function asyncMkdirp(dirPath) {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (err) {
    throw enhanceFsError(err, `创建目录失败: ${dirPath}`);
  }
}
async function asyncRemoveDir(dirPath) {
  if (!await asyncExists(dirPath)) {
    return;
  }
  await execFileAsync("rm", ["-rf", dirPath]);
  logger$l.info(`rm -rf: ${dirPath}`);
}
async function asyncCopyDirRecursive(src, dest) {
  await execFileAsync("ditto", [src, dest]);
  logger$l.info(`ditto: ${src} → ${dest}`);
}
async function is7zArchive(archivePath) {
  try {
    const { open: openFn } = await import("fs/promises");
    const fdHandle = await openFn(archivePath, "r");
    const buf = Buffer.alloc(6);
    await fdHandle.read(buf, 0, 6, 0);
    await fdHandle.close();
    return buf[0] === 55 && buf[1] === 122 && buf[2] === 188 && buf[3] === 175 && buf[4] === 39 && buf[5] === 28;
  } catch {
    return false;
  }
}
async function asyncExtractArchive(archivePath, destDir, useDitto = false) {
  if (await is7zArchive(archivePath)) {
    logger$l.info("检测到 7z 格式，使用系统 7z 解压");
    await extract7z(archivePath, destDir);
  } else if (process.platform === "darwin" && useDitto) {
    logger$l.info("使用 ditto 解压（保留 macOS xattr）");
    await extractZipDitto(archivePath, destDir);
  } else {
    logger$l.info("使用 zip 格式解压");
    await extractZip(archivePath, destDir);
  }
  if (!useDitto) {
    await flattenSingleChildDir(destDir);
  }
  if (process.platform === "darwin") {
    await stripQuarantineRecursive(destDir);
  }
}
async function stripQuarantineRecursive(targetPath) {
  if (process.platform !== "darwin") return;
  try {
    await execFileAsync("xattr", ["-dr", "com.apple.quarantine", targetPath]);
    logger$l.info(`xattr -dr com.apple.quarantine: ${targetPath}`);
  } catch (err) {
    logger$l.warn(`清理 quarantine 失败（非致命，将继续）: ${targetPath}: ${err.message}`);
  }
}
async function extractZipDitto(archivePath, destDir) {
  await mkdir(destDir, { recursive: true });
  const args = ["-x", "-k", archivePath, destDir];
  await execFileAsync("ditto", args);
  logger$l.info(`ditto 解压完成: ${archivePath} → ${destDir}`);
}
async function extractZip(archivePath, destDir) {
  await mkdir(destDir, { recursive: true });
  const args = ["-o", "-q", archivePath, "-d", destDir];
  await execFileAsync("unzip", args);
  logger$l.info(`zip 解压完成: ${archivePath} → ${destDir}`);
}
async function extract7z(archivePath, destDir) {
  await mkdir(destDir, { recursive: true });
  const args = ["x", archivePath, `-o${destDir}`, "-y"];
  await execFileAsync("7z", args);
  logger$l.info(`7z 解压完成: ${archivePath} → ${destDir}`);
}
async function flattenSingleChildDir(destDir) {
  const tmpDir = `${destDir}_flatten_tmp`;
  try {
    await rm(tmpDir, { recursive: true, force: true });
  } catch {
  }
  let entries2;
  try {
    const dirents = await readdir(destDir, { withFileTypes: true });
    entries2 = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return;
  }
  if (entries2.length !== 1) return;
  const childName = entries2[0];
  const childDir = join(destDir, childName);
  logger$l.info(`检测到外层目录 ${childName}，提升内容到 ${destDir}`);
  await rename(childDir, tmpDir);
  try {
    const childEntries = await readdir(tmpDir);
    for (const name of childEntries) {
      await rename(join(tmpDir, name), join(destDir, name));
    }
  } finally {
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
    }
  }
}
function execFileAsync(command, args) {
  return new Promise((resolve2, reject) => {
    execFile(command, args, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`${command} 失败: ${error.message}
${stderr}`.trim()));
        return;
      }
      resolve2();
    });
  });
}
async function asyncComputeSha256(filePath, onProgress) {
  const { stat: stat2 } = await import("fs/promises");
  const fileSize = (await stat2(filePath)).size;
  return new Promise((resolve2, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath, { highWaterMark: 64 * 1024 });
    let bytesRead = 0;
    let lastReported = -1;
    stream.on("data", (chunk) => {
      hash.update(chunk);
      if (onProgress && fileSize > 0) {
        bytesRead += chunk.length;
        const percent = Math.min(Math.round(bytesRead / fileSize * 100), 100);
        if (percent - lastReported >= 5 || percent === 100) {
          lastReported = percent;
          onProgress(percent);
        }
      }
    });
    stream.on("end", () => resolve2(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}
async function asyncComputeMd5(filePath) {
  const stdout = await execFileOutput("md5", ["-q", filePath]);
  return stdout.trim().toLowerCase();
}
function execFileOutput(command, args) {
  return new Promise((resolve2, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${command} 失败: ${error.message}
${stderr}`.trim()));
        return;
      }
      resolve2(stdout);
    });
  });
}
async function asyncAtomicSymlink(linkPath, target) {
  const tmpLink = `${linkPath}.tmp`;
  try {
    await unlink$1(tmpLink);
  } catch {
  }
  try {
    await symlink(target, tmpLink);
    await rename(tmpLink, linkPath);
    logger$l.info(`原子切换 symlink: ${linkPath} → ${target}`);
  } catch (err) {
    try {
      await unlink$1(tmpLink);
    } catch {
    }
    throw enhanceFsError(err, `symlink 切换失败: ${linkPath} → ${target}`);
  }
}
async function asyncWriteJsonAtomic(filePath, data, pretty = true) {
  const tmpPath = `${filePath}.tmp`;
  const jsonStr = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  try {
    await writeFile(tmpPath, jsonStr, "utf-8");
    await rename(tmpPath, filePath);
  } catch (err) {
    try {
      await unlink$1(tmpPath);
    } catch {
    }
    throw enhanceFsError(err, `写入文件失败: ${filePath}`);
  }
}
async function asyncReadJson(filePath) {
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
async function asyncExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
function enhanceFsError(err, context) {
  const nodeErr = err;
  const code = nodeErr?.code || "";
  let hint = "";
  switch (code) {
    case "ENOSPC":
      hint = "磁盘空间不足，请释放磁盘空间后重试";
      break;
    case "EACCES":
    case "EPERM":
      hint = "权限不足，请检查文件/目录权限";
      break;
    case "ENOENT":
      hint = "文件或目录不存在";
      break;
    case "EBUSY":
      hint = "文件被占用，请关闭其他应用后重试";
      break;
    case "EIO":
      hint = "I/O 错误，请检查磁盘健康状态";
      break;
  }
  const message = hint ? `${context}: ${hint} (${code})` : `${context}: ${nodeErr?.message || String(err)}`;
  return new Error(message);
}
const logger$k = getLogger("updater:extractor");
const PREPARE_SHARE = 1;
const VERIFY_SHARE = 0.3;
function computeOverallProgress(index, total, withinComponent) {
  const componentStart = (index - 1) / total * PREPARE_SHARE;
  const componentRange = 1 / total * PREPARE_SHARE;
  return Math.round((componentStart + withinComponent * componentRange) * 100);
}
async function asyncPrepareAll(items, onProgress) {
  const stagingDir = join(getUpdateDir(), "staging");
  const total = items.length;
  await asyncMkdirp(stagingDir);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const index = i + 1;
    await asyncPrepareComponent(item, stagingDir, total, index, onProgress);
  }
  const progressPath = join(getUpdateDir(), "update.progress");
  await writeFile(progressPath, "prepared", "utf-8");
  onProgress?.({
    stage: "done",
    component: "",
    progress: Math.round(PREPARE_SHARE * 100),
    total,
    index: total
  });
  const batchDirs = new Set(items.map((item) => dirname(item.archivePath)).filter(Boolean));
  for (const dir of batchDirs) {
    try {
      await rm(dir, { recursive: true, force: true });
      logger$k.info(`Prepare: 已清理下载目录 ${dir}`);
    } catch (err) {
      logger$k.warn(`Prepare: 清理下载目录失败（非致命）: ${err.message}`);
    }
  }
  logger$k.info("Prepare 阶段完成");
}
async function asyncPrepareComponent(item, stagingDir, total, index, onProgress) {
  const destDir = item.isMainApp ? stagingDir : join(item.componentDir, "Versions", item.newVersion);
  logger$k.info(`Prepare: 解压 ${item.archivePath} → ${destDir}`);
  if (!await asyncExists(item.archivePath)) {
    throw new Error(`archive 文件不存在: ${item.archivePath}`);
  }
  onProgress?.({
    stage: "verifying",
    component: item.name,
    progress: computeOverallProgress(index, total, 0),
    total,
    index
  });
  if (item.sha256) {
    const actual = await asyncComputeSha256(item.archivePath, (percent) => {
      const withinComponent = percent / 100 * VERIFY_SHARE;
      onProgress?.({
        stage: "verifying",
        component: item.name,
        progress: computeOverallProgress(index, total, withinComponent),
        total,
        index
      });
    });
    if (actual !== item.sha256.toLowerCase()) {
      throw new Error(`SHA256 不匹配: expected=${item.sha256} actual=${actual} file=${item.archivePath}`);
    }
    logger$k.info(`SHA256 校验通过: ${item.name}`);
  } else if (item.md5) {
    const actual = await asyncComputeMd5(item.archivePath);
    if (actual !== item.md5.toLowerCase()) {
      throw new Error(`MD5 不匹配: expected=${item.md5} actual=${actual} file=${item.archivePath}`);
    }
    logger$k.info(`MD5 校验通过: ${item.name}`);
  } else {
    logger$k.info(`无 sha256/md5，跳过校验: ${item.name}`);
  }
  onProgress?.({
    stage: "extracting",
    component: item.name,
    progress: computeOverallProgress(index, total, VERIFY_SHARE),
    total,
    index
  });
  if (await asyncExists(destDir)) {
    await asyncRemoveDir(destDir);
  }
  const parentDir = dirname(destDir);
  await asyncMkdirp(parentDir);
  await asyncMkdirp(destDir);
  await asyncExtractArchive(item.archivePath, destDir, item.isMainApp);
  logger$k.info(`解压完成: ${item.name} → ${destDir}`);
  if (!item.isMainApp) {
    const codeSig = join(destDir, "_CodeSignature", "CodeResources");
    if (!await asyncExists(codeSig)) {
      logger$k.info(`Prepare: _CodeSignature/CodeResources 不存在（非致命，Phase A 兼容）: ${item.name}`);
    }
  }
  onProgress?.({
    stage: "extracting",
    component: item.name,
    progress: computeOverallProgress(index, total, 1),
    total,
    index
  });
  logger$k.info(`Prepare: ${item.name} 已就绪 → ${destDir}`);
}
const logger$j = getLogger("updater:backup");
const BACKUP_DIR_NAME = "backup";
function backupRoot() {
  return join(getUpdateDir(), BACKUP_DIR_NAME);
}
function backupAppPath(appPath) {
  const appName = basename(appPath);
  return join(backupRoot(), appName);
}
async function asyncBackupApp(appPath) {
  if (appPath.includes("node_modules") || appPath.includes("electron/dist")) {
    logger$j.info("Backup: 检测到开发态 app_path，跳过备份");
    return "";
  }
  if (!await asyncExists(appPath)) {
    throw new Error(`源 .app 不存在: ${appPath}`);
  }
  const backupDir = backupRoot();
  const dest = backupAppPath(appPath);
  if (await asyncExists(dest)) {
    logger$j.info(`Backup: 清理旧备份: ${dest}`);
    await asyncRemoveDir(dest);
  }
  await asyncMkdirp(backupDir);
  logger$j.info(`Backup: ${appPath} → ${dest}`);
  await asyncCopyDirRecursive(appPath, dest);
  logger$j.info("Backup: 备份完成");
  return dest;
}
const logger$i = getLogger("updater:applier");
class ComponentApplier {
  /** 安装进度回调 */
  _onInstallProgress = null;
  /** 注册安装进度回调 */
  onInstallProgress(handler) {
    this._onInstallProgress = handler;
  }
  /**
   * Prepare 阶段：主进程异步解压+SHA256校验
   *
   * Phase 3 重构：不再通过 daemon IPC 发送 update.prepare，
   * 改为主进程直接调用 asyncPrepareAll() 异步解压。
   *
   * 流程：
   * 1. 有主框架更新时：asyncBackupApp() 异步备份
   * 2. asyncPrepareAll() 异步解压所有组件
   * 3. 写 update.json
   * 4. 写 update.pending-switch 标记文件（记录待链接子组件列表）
   * 5. 有主框架更新时：写 update.pending-replace 标记文件
   */
  async prepareBatch(batch) {
    const config2 = this._buildConfig(batch);
    const updateDir = getUpdateDir();
    const hasMainAppUpdate = config2.updates.some((item) => item.isMainApp);
    const componentUpdates = config2.updates.filter((item) => !item.isMainApp);
    await asyncMkdirp(updateDir);
    if (hasMainAppUpdate) {
      this._emitProgress({
        stage: "backing_up",
        component: "Marvis",
        progress: 0,
        total: config2.updates.length,
        index: 0
      });
      await asyncBackupApp(config2.appPath);
      logger$i.info("prepare: .app 备份完成");
    }
    const onPrepareProgress = (p) => {
      this._emitProgress({
        stage: p.stage,
        component: p.component,
        progress: p.progress,
        total: p.total,
        index: p.index
      });
    };
    await asyncPrepareAll(config2.updates, onPrepareProgress);
    logger$i.info("prepare: 异步解压完成");
    await asyncWriteJsonAtomic(getUpdateJsonPath(), config2);
    logger$i.info("prepare: update.json 已写入");
    if (componentUpdates.length > 0) {
      const pendingSwitchPath = join(updateDir, PENDING_SWITCH_MARKER);
      await asyncWriteJsonAtomic(pendingSwitchPath, {
        components: componentUpdates.map((item) => ({
          name: item.name,
          componentDir: item.componentDir,
          componentType: item.componentType,
          oldVersion: item.oldVersion,
          newVersion: item.newVersion
        })),
        aggregatedVersion: batch.aggregatedVersion,
        policyId: batch.policyId,
        createdAt: Date.now()
      });
      logger$i.info(`prepare: ${PENDING_SWITCH_MARKER} 已写入 (${componentUpdates.length} 个子组件)`);
    }
    if (hasMainAppUpdate) {
      const pendingReplacePath = join(updateDir, PENDING_REPLACE_MARKER);
      const stagingDir = join(updateDir, "staging");
      const backupDir = join(updateDir, "backup", config2.appPath.split("/").pop() || "Marvis.app");
      const marker = {
        pid: process.pid,
        appPath: config2.appPath,
        stagingDir,
        backupDir,
        createdAt: Date.now()
      };
      await asyncWriteJsonAtomic(pendingReplacePath, marker);
      logger$i.info(`prepare: ${PENDING_REPLACE_MARKER} 已写入`);
    }
    {
      const pendingVersionPath = join(updateDir, PENDING_VERSION_MARKER);
      const versionMarker = {
        aggregatedVersion: batch.aggregatedVersion,
        policyId: batch.policyId,
        createdAt: Date.now()
      };
      await asyncWriteJsonAtomic(pendingVersionPath, versionMarker);
      logger$i.info(`prepare: ${PENDING_VERSION_MARKER} 已写入 (aggregatedVersion=${batch.aggregatedVersion})`);
    }
  }
  /**
   * 从 UpdateBatch 构造 UpdateConfigV1 并执行 apply
   *
   * @param batch - 下载完成的批次信息
   * @param hidden - 若为 true，重启后以静默模式启动（--hidden，不展示窗口）
   */
  async applyBatch(batch, hidden) {
    const config2 = this._buildConfig(batch);
    await this.apply(config2, hidden);
  }
  /**
   * 执行更新应用
   *
   * Phase 3 重构：
   * - 仅子组件更新：直接 app.quit()，重启后由 applyPendingSwitches 完成链接切换
   * - 有主框架更新：发送 update.replace 给 daemon，然后 app.quit()
   *
   * @param config - 更新配置（已包含所有必要信息）
   * @param hidden - 若为 true，重启后以静默模式启动（--hidden，不展示窗口）
   */
  async apply(config2, hidden) {
    const hasMainAppUpdate = config2.updates.some((item) => item.isMainApp);
    const extraArgs = hidden ? ["--hidden"] : void 0;
    if (hasMainAppUpdate) {
      const stagingDir = join(getUpdateDir(), "staging");
      const backupDir = join(getUpdateDir(), "backup", config2.appPath.split("/").pop() || "Marvis.app");
      const replaceParams = {
        parentPid: process.pid,
        appPath: config2.appPath,
        stagingDir,
        backupDir,
        restart: config2.restart,
        args: extraArgs
      };
      const sent = sendUpdateReplace(replaceParams);
      if (!sent) {
        throw new Error("update.replace 发送失败：daemon IPC 未连接");
      }
      logger$i.info(`apply: update.replace 已发送 parentPid=${process.pid} hidden=${!!hidden}`);
    } else {
      logger$i.info(`apply: 仅子组件更新，发送 update.restart hidden=${!!hidden}`);
      try {
        const restartParams = {
          parentPid: process.pid,
          appPath: config2.appPath,
          args: extraArgs
        };
        const sent = sendUpdateRestart(restartParams);
        if (!sent) {
          logger$i.warn("apply: update.restart 发送失败（daemon 可能未连接），用户需手动启动");
        }
      } catch (err) {
        logger$i.warn(`apply: 发送 update.restart 异常: ${err.message}`);
      }
    }
    app.quit();
  }
  /**
   * 从 UpdateBatch 构造 UpdateConfigV1
   */
  _buildConfig(batch) {
    const componentsDir = getComponentsDir();
    const updates = batch.tasks.map((task) => {
      const isMainApp = task.name === "Marvis";
      const componentDirName2 = task.name;
      const resolvedComponentDir = componentDirName2 ? join(componentsDir, componentDirName2) : "";
      return {
        name: task.name,
        isMainApp,
        oldVersion: task.fromVersion,
        newVersion: task.toVersion,
        archivePath: task.archivePath,
        sha256: task.sha256,
        md5: task.md5,
        componentDir: isMainApp ? "" : resolvedComponentDir,
        componentType: String(task.type)
      };
    });
    return {
      version: 1,
      phase: "B",
      parentPid: process.pid,
      appPath: this._getAppPath(),
      userDataDir: getUserDataDir$1(),
      componentsDir,
      restart: true,
      updates,
      createdAt: Date.now()
    };
  }
  /** 获取 .app 路径 */
  _getAppPath() {
    const envPath = process.env.MARVIS_APP_PATH;
    if (envPath) {
      return resolve(envPath);
    }
    try {
      const exePath = app.getPath("exe");
      const match = exePath.match(/^(.*\.app)\//);
      return match ? match[1] : "/Applications/Marvis.app";
    } catch {
      return "/Applications/Marvis.app";
    }
  }
  /** 推送安装进度 */
  _emitProgress(progress) {
    this._onInstallProgress?.(progress);
  }
}
var RejectionReason = /* @__PURE__ */ ((RejectionReason2) => {
  RejectionReason2["RejectedChecking"] = "rejected_checking";
  RejectionReason2["RejectedDownloading"] = "rejected_downloading";
  RejectionReason2["RejectedInstalling"] = "rejected_installing";
  RejectionReason2["RejectedReadyToRestart"] = "rejected_ready_to_restart";
  return RejectionReason2;
})(RejectionReason || {});
const logger$h = getLogger("updater:session");
class UpdateSessionGuard {
  _stateMachine;
  /** 当前占据闸门的入口来源 */
  _currentEntry = null;
  /** 当前静默策略码（仅 auto_silent_update 时有意义） */
  _currentSilentCode = SilentUpdateCode.NotSilent;
  /** 更新已完成等待重启（单向锁，进程生命周期内不可逆） */
  _readyToRestart = false;
  constructor(stateMachine2) {
    this._stateMachine = stateMachine2;
  }
  /**
   * 尝试占据更新会话
   *
   * @param entry 触发来源
   * @param silentCode 静默策略码（仅 auto_silent_update 需要）
   * @returns 裁决结果
   */
  tryBegin(entry, silentCode) {
    if (this._readyToRestart) {
      logger$h.info(`tryBegin: 拒绝 [${entry}] — 已完成更新等待重启`);
      return { accepted: false, reason: RejectionReason.RejectedReadyToRestart };
    }
    const { state: state2 } = this._stateMachine;
    if (this._stateMachine.isBusy) {
      if (this._currentEntry && this.canPreempt(entry)) {
        logger$h.info(`tryBegin: [${entry}] 抢占 [${this._currentEntry}]`);
        this._currentEntry = entry;
        this._currentSilentCode = silentCode ?? SilentUpdateCode.NotSilent;
        return { accepted: true };
      }
      const reason = this._mapStateToRejection(state2);
      logger$h.info(`tryBegin: 拒绝 [${entry}] — 状态=${state2} 原因=${reason}`);
      return { accepted: false, reason };
    }
    this._currentEntry = entry;
    this._currentSilentCode = silentCode ?? SilentUpdateCode.NotSilent;
    logger$h.info(`tryBegin: 接受 [${entry}] silentCode=${this._currentSilentCode}`);
    return { accepted: true };
  }
  /**
   * 判断 newEntry 是否可以抢占当前会话
   *
   * 规则（对齐 Windows）：
   *   - user_manual 可抢占 auto_silent_update 且 silentCode=1（普通静默）
   *   - 不可抢占 force_update / silentCode=2(强制静默) / silentCode=4(无条件强制)
   */
  canPreempt(newEntry) {
    if (newEntry !== "user_manual") return false;
    if (this._currentEntry !== "auto_silent_update") return false;
    return this._currentSilentCode === SilentUpdateCode.Silent;
  }
  /**
   * 让步释放闸门（供静默更新被抢占时调用）
   */
  yield() {
    logger$h.info(`yield: [${this._currentEntry}] 让步释放`);
    this._currentEntry = null;
    this._currentSilentCode = SilentUpdateCode.NotSilent;
  }
  /**
   * 标记更新已完成等待重启（单向置位，不可逆）
   */
  markReadyToRestart() {
    this._readyToRestart = true;
    logger$h.info("markReadyToRestart: 已标记，不再接受新的更新请求");
  }
  /** 是否已标记等待重启 */
  isReadyToRestart() {
    return this._readyToRestart;
  }
  /** 当前占据闸门的入口来源 */
  getCurrentEntry() {
    return this._currentEntry;
  }
  /** 当前静默策略码 */
  getCurrentSilentCode() {
    return this._currentSilentCode;
  }
  /** 释放闸门（流程结束时调用） */
  release() {
    this._currentEntry = null;
    this._currentSilentCode = SilentUpdateCode.NotSilent;
  }
  /** 将状态机状态映射为拒绝原因 */
  _mapStateToRejection(state2) {
    switch (state2) {
      case UpdateState.Checking:
        return RejectionReason.RejectedChecking;
      case UpdateState.Downloading:
        return RejectionReason.RejectedDownloading;
      case UpdateState.Installing:
      case UpdateState.Applying:
      case UpdateState.Switching:
        return RejectionReason.RejectedInstalling;
      default:
        return RejectionReason.RejectedDownloading;
    }
  }
}
const logger$g = getLogger("updater:idle-checker");
function getElectron() {
  return require2("electron");
}
class IdleChecker {
  _config;
  _timer = null;
  _isLockScreen = false;
  _prevCpuInfo = null;
  _lockScreenListenerBound = false;
  constructor(config2) {
    this._config = {
      cpuThreshold: config2?.cpuThreshold ?? IDLE_CPU_THRESHOLD,
      idleTimeThreshold: config2?.idleTimeThreshold ?? IDLE_INPUT_THRESHOLD_SEC,
      checkIntervalMs: config2?.checkIntervalMs ?? IDLE_CHECK_INTERVAL_MS
    };
  }
  /**
   * 启动闲时检测
   *
   * @param onIdle 当系统进入闲时状态时触发（仅触发一次，触发后自动停止检测）
   */
  start(onIdle) {
    if (this._timer) {
      logger$g.warn("start: 已在运行，跳过");
      return;
    }
    this._bindLockScreenEvents();
    this._prevCpuInfo = os__default.cpus();
    logger$g.info(`start: 启动闲时检测 (interval=${this._config.checkIntervalMs}ms, cpu≤${this._config.cpuThreshold}%, idle≥${this._config.idleTimeThreshold}s)`);
    this._timer = setInterval(() => {
      const state2 = this.checkOnce();
      if (state2.isIdle) {
        logger$g.info(`checkOnce: cpu=${state2.cpuUsage.toFixed(1)}% idle=${state2.idleSeconds}s fullscreen=${state2.isFullscreen} → isIdle=true，触发回调`);
        this.stop();
        onIdle();
      } else {
        logger$g.debug(`checkOnce: cpu=${state2.cpuUsage.toFixed(1)}%(≤${this._config.cpuThreshold}?${state2.cpuIdle}) idle=${state2.idleSeconds}s(≥${this._config.idleTimeThreshold}?${state2.inputIdle}) fullscreen=${state2.isFullscreen} lock=${state2.isLockScreen}`);
      }
    }, this._config.checkIntervalMs);
    if (this._timer && typeof this._timer === "object" && "unref" in this._timer) {
      this._timer.unref();
    }
  }
  /**
   * 停止闲时检测
   */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
      logger$g.info("stop: 已停止");
    }
  }
  /**
   * 单次闲时检测
   */
  checkOnce() {
    const cpuUsage = this._getCpuUsage();
    const idleSeconds = this._getSystemIdleTime();
    const isLockScreen = this._isLockScreen;
    const cpuIdle = cpuUsage <= this._config.cpuThreshold;
    const inputIdle = idleSeconds >= this._config.idleTimeThreshold;
    const isIdle = cpuIdle && inputIdle;
    return {
      cpuUsage,
      idleSeconds,
      isFullscreen: false,
      isScreensaver: false,
      isLockScreen,
      cpuIdle,
      fullscreenIdle: true,
      inputIdle,
      isIdle
    };
  }
  /** 是否正在运行 */
  get isRunning() {
    return !!this._timer;
  }
  /**
   * 获取 CPU 占用率（通过双次采样差值计算）
   *
   * 对齐 Windows `GetSystemTimes` 双次采样
   */
  _getCpuUsage() {
    const cpus = os__default.cpus();
    if (!this._prevCpuInfo || this._prevCpuInfo.length !== cpus.length) {
      this._prevCpuInfo = cpus;
      return 0;
    }
    let totalIdle = 0;
    let totalTick = 0;
    for (let i = 0; i < cpus.length; i++) {
      const prev = this._prevCpuInfo[i].times;
      const curr = cpus[i].times;
      const idle = curr.idle - prev.idle;
      const total = curr.user - prev.user + (curr.nice - prev.nice) + (curr.sys - prev.sys) + (curr.irq - prev.irq) + idle;
      totalIdle += idle;
      totalTick += total;
    }
    this._prevCpuInfo = cpus;
    if (totalTick === 0) return 0;
    return (totalTick - totalIdle) / totalTick * 100;
  }
  /**
   * 获取系统空闲时间（秒）
   *
   * 使用 Electron powerMonitor.getSystemIdleTime()
   * 底层调用 macOS CGEventSourceSecondsSinceLastEventType
   */
  _getSystemIdleTime() {
    try {
      const { powerMonitor: powerMonitor2 } = getElectron();
      return powerMonitor2.getSystemIdleTime();
    } catch {
      return 0;
    }
  }
  /**
   * 检测是否有全屏应用
   *
   * 简化实现：检查是否有可见的 BrowserWindow 处于全屏状态
   * 注意：这仅检测 Electron 窗口，不检测其他应用的全屏状态
   * 后续可通过 native addon 增强
   */
  _isFullscreen() {
    try {
      const { BrowserWindow: BrowserWindow2 } = getElectron();
      const windows = BrowserWindow2.getAllWindows();
      return windows.some((w) => w.isFullScreen());
    } catch {
      return false;
    }
  }
  /**
   * 绑定锁屏/解锁事件
   */
  _bindLockScreenEvents() {
    if (this._lockScreenListenerBound) return;
    try {
      const { powerMonitor: powerMonitor2 } = getElectron();
      powerMonitor2.on("lock-screen", () => {
        this._isLockScreen = true;
      });
      powerMonitor2.on("unlock-screen", () => {
        this._isLockScreen = false;
      });
      this._lockScreenListenerBound = true;
    } catch {
    }
  }
}
var SilentPolicyState = /* @__PURE__ */ ((SilentPolicyState2) => {
  SilentPolicyState2["Idle"] = "idle";
  SilentPolicyState2["WaitingIdle"] = "waiting_idle";
  SilentPolicyState2["RequestingToken"] = "requesting_token";
  SilentPolicyState2["Downloading"] = "downloading";
  SilentPolicyState2["Installing"] = "installing";
  SilentPolicyState2["Completed"] = "completed";
  SilentPolicyState2["Yielded"] = "yielded";
  SilentPolicyState2["Failed"] = "failed";
  return SilentPolicyState2;
})(SilentPolicyState || {});
const logger$f = getLogger("updater:silent-policy");
class SilentUpdatePolicy {
  _idleChecker;
  _tokenService;
  _sessionGuard;
  /** 由外部注入的下载+安装执行器 */
  _doDownloadInstall;
  /** 由外部注入的仅下载执行器 */
  _doDownloadOnly;
  /** 由外部注入的重启执行器 */
  _doRestart;
  _state = SilentPolicyState.Idle;
  _config = null;
  _checkResult = null;
  _completeHandlers = [];
  constructor(deps2) {
    this._idleChecker = deps2.idleChecker;
    this._tokenService = deps2.tokenService;
    this._sessionGuard = deps2.sessionGuard;
    this._doDownloadInstall = deps2.doDownloadInstall;
    this._doDownloadOnly = deps2.doDownloadOnly;
    this._doRestart = deps2.doRestart;
  }
  /**
   * 启动静默更新策略
   */
  start(checkResult, silentCode) {
    this._checkResult = checkResult;
    this._config = this._buildConfig(silentCode);
    logger$f.info(`start: silentCode=${silentCode} needsIdle=${this._config.needsIdleCheck} needsToken=${this._config.needsToken} needsInstall=${this._config.needsInstall}`);
    if (this._config.needsIdleCheck) {
      this._state = SilentPolicyState.WaitingIdle;
      this._idleChecker.start(() => this._onIdleDetected());
    } else {
      void this._beginDownloadFlow();
    }
  }
  /**
   * 让步给用户手动更新
   */
  yield() {
    logger$f.info("yield: 静默更新让步");
    this._idleChecker.stop();
    this._state = SilentPolicyState.Yielded;
  }
  /**
   * 取消静默更新（仅普通静默允许）
   */
  cancel() {
    if (this._config && !this._config.cancellable) {
      logger$f.warn("cancel: 当前策略不可取消");
      return;
    }
    this._idleChecker.stop();
    this._state = SilentPolicyState.Idle;
    this._sessionGuard.release();
    logger$f.info("cancel: 静默更新已取消");
  }
  /** 是否正在运行 */
  isRunning() {
    return this._state !== SilentPolicyState.Idle && this._state !== SilentPolicyState.Completed && this._state !== SilentPolicyState.Failed && this._state !== SilentPolicyState.Yielded;
  }
  /** 当前状态 */
  get state() {
    return this._state;
  }
  /** 注册完成回调 */
  onComplete(handler) {
    this._completeHandlers.push(handler);
  }
  // ── 内部流程 ──
  /** 闲时检测通过后回调 */
  _onIdleDetected() {
    logger$f.info("_onIdleDetected: 闲时条件满足，开始下载流程");
    void this._beginDownloadFlow();
  }
  /** 开始下载流程（占闸门→Token→限速→下载→安装→重启） */
  async _beginDownloadFlow() {
    try {
      const sessionResult = this._sessionGuard.tryBegin(
        "auto_silent_update",
        this._config.silentCode
      );
      if (!sessionResult.accepted) {
        logger$f.warn(`_beginDownloadFlow: 闸门拒绝 reason=${sessionResult.reason}`);
        this._notifyComplete(false, `session rejected: ${sessionResult.reason}`);
        return;
      }
      let speedLimit = SPEED_LIMIT_NONE;
      if (this._config.needsToken) {
        this._state = SilentPolicyState.RequestingToken;
        const token = await this._tokenService.requestToken(
          this._checkResult.policy_id,
          this._checkResult.target_version
        );
        speedLimit = this._tokenService.getSpeedLimit(token);
        logger$f.info(`_beginDownloadFlow: Token 获取成功 speedMode=${token.speedMode} limit=${speedLimit}`);
      } else {
        logger$f.info("_beginDownloadFlow: 不需要 Token，跳过限速");
      }
      this._state = SilentPolicyState.Downloading;
      if (this._config.needsInstall) {
        await this._doDownloadInstall(this._checkResult, true, speedLimit);
        this._state = SilentPolicyState.Installing;
        await this._handleRestart();
      } else {
        await this._doDownloadOnly(this._checkResult, speedLimit);
        logger$f.info("_beginDownloadFlow: 静默下载完成，等待下次启动安装");
      }
      this._notifyComplete(true);
    } catch (err) {
      logger$f.error(`_beginDownloadFlow: 失败 — ${err.message}`);
      this._notifyComplete(false, err.message);
    }
  }
  /** 重启判定 */
  async _handleRestart() {
    if (this._state !== SilentPolicyState.Installing) {
      logger$f.warn(`_handleRestart: 内部状态不正确 (state=${this._state})，跳过重启`);
      return;
    }
    const forceRestart = this._config.silentCode === SilentUpdateCode.UnconditionalForce;
    const isVisible = this._isWindowVisible();
    if (forceRestart) {
      logger$f.info(`_handleRestart: 无条件强制，自动重启 (visible=${isVisible})`);
      this._sessionGuard.markReadyToRestart();
      await this._doRestart(!isVisible);
      return;
    }
    if (isVisible) {
      logger$f.info("_handleRestart: 窗口可见，推送 ready_to_restart 等待用户");
      this._sessionGuard.markReadyToRestart();
    } else {
      logger$f.info("_handleRestart: 窗口不可见，静默自动重启");
      this._sessionGuard.markReadyToRestart();
      await this._doRestart(true);
    }
  }
  /** 检查是否有可见窗口 */
  _isWindowVisible() {
    try {
      const windows = BrowserWindow.getAllWindows();
      return windows.some((w) => w.isVisible() && !w.isMinimized());
    } catch {
      return true;
    }
  }
  /** 通知完成 */
  _notifyComplete(success, error) {
    this._state = success ? SilentPolicyState.Completed : SilentPolicyState.Failed;
    this._sessionGuard.release();
    for (const handler of this._completeHandlers) {
      try {
        handler(success, error);
      } catch (err) {
        logger$f.warn(`onComplete handler 异常: ${err.message}`);
      }
    }
  }
  /** 根据 silentCode 构建策略配置 */
  _buildConfig(silentCode) {
    switch (silentCode) {
      case SilentUpdateCode.Silent:
        return { silentCode, needsIdleCheck: true, needsToken: true, needsInstall: true, needsAutoRestart: false, cancellable: true };
      case SilentUpdateCode.ForceSilent:
        return { silentCode, needsIdleCheck: false, needsToken: true, needsInstall: true, needsAutoRestart: false, cancellable: false };
      case SilentUpdateCode.SilentDownload:
        return { silentCode, needsIdleCheck: false, needsToken: true, needsInstall: false, needsAutoRestart: false, cancellable: true };
      case SilentUpdateCode.UnconditionalForce:
        return { silentCode, needsIdleCheck: false, needsToken: false, needsInstall: true, needsAutoRestart: true, cancellable: false };
      default:
        return { silentCode, needsIdleCheck: false, needsToken: false, needsInstall: false, needsAutoRestart: false, cancellable: true };
    }
  }
}
const logger$e = getLogger("updater:token-service");
const TOKEN_API_PATH = "/v3/marvis_client_update_token_mac";
const FALLBACK_TOKEN = {
  speedMode: "slow",
  speedLimit: SPEED_LIMIT_SLOW
};
class DownloadTokenService {
  /**
   * 向后台请求下载 Token
   *
   * 对齐 Windows `MarvisUpdateApi::RequestDownloadToken`
   *
   * @param policyId 策略 ID（来自 CheckUpdate 结果）
   * @param targetVersion 目标版本号
   * @returns Token，失败时返回降级 Token（1MB/s）
   */
  async requestToken(policyId, targetVersion) {
    try {
      const guid = await getDeviceGuid();
      const body = JSON.stringify({
        guid,
        policy_id: policyId ?? 0,
        version: targetVersion ?? ""
      });
      const url = UPDATE_HOST + TOKEN_API_PATH;
      const headers = buildSignatureHeaders(body);
      headers["Ual-Access-Guid"] = guid;
      headers["Ual-Access-Requestid"] = `${guid}-${headers["Ual-Access-Timestamp"]}`;
      logger$e.info(`requestToken: POST ${url}`);
      const controller = new AbortController();
      const timer2 = setTimeout(() => controller.abort(), UPDATE_REQUEST_TIMEOUT_MS);
      try {
        const res = await net.fetch(url, {
          method: "POST",
          headers,
          body,
          signal: controller.signal,
          bypassCustomProtocolHandlers: true
        });
        const text = await res.text();
        logger$e.info(`requestToken: status=${res.status} body=${text.slice(0, 200)}`);
        if (!res.ok) {
          logger$e.warn(`requestToken: HTTP 失败 status=${res.status}，降级为限速模式`);
          return FALLBACK_TOKEN;
        }
        const parsed = JSON.parse(text);
        if (parsed.code !== 0) {
          logger$e.warn(`requestToken: 业务失败 code=${parsed.code} msg=${parsed.msg}，降级为限速模式`);
          return FALLBACK_TOKEN;
        }
        const hasToken = parsed.has_token ?? parsed.data?.has_token ?? false;
        if (hasToken) {
          logger$e.info("requestToken: 获得下载许可，不限速");
          return { speedMode: "normal", speedLimit: SPEED_LIMIT_NONE };
        }
        logger$e.info("requestToken: 未获得下载许可，限速 1MB/s");
        return { speedMode: "slow", speedLimit: SPEED_LIMIT_SLOW };
      } finally {
        clearTimeout(timer2);
      }
    } catch (err) {
      logger$e.warn(`requestToken: 失败，降级为 1MB/s — ${err.message}`);
      return FALLBACK_TOKEN;
    }
  }
  /**
   * 根据 Token 获取限速值
   */
  getSpeedLimit(token) {
    return token.speedLimit;
  }
}
getLogger("updater:reporter");
const logger$d = getLogger("updater:installed-json-writer");
async function asyncUpdateInstalledJson(items, options) {
  const installedJsonPath = getInstalledJsonPath();
  const existing = loadInstalledJson();
  const components = existing ? [...existing.components] : [];
  for (const item of items) {
    const existingComp = components.find((c) => c.name === item.name);
    if (existingComp) {
      logger$d.info(`Finalize: 更新组件 ${item.name} 版本: ${existingComp.version} → ${item.newVersion}`);
      existingComp.version = item.newVersion;
      existingComp.source = "update";
      if (!existingComp.componentType && item.componentType) {
        existingComp.componentType = item.componentType;
      }
    } else {
      logger$d.info(`Finalize: 新增组件 ${item.name} 版本: ${item.newVersion}`);
      components.push({
        name: item.name,
        componentType: item.componentType ?? "",
        version: item.newVersion,
        source: "update"
      });
    }
  }
  const appVersion = options?.aggregatedVersion ?? existing?.appVersion ?? "0.0.0";
  const newInstalled = {
    appVersion,
    components,
    updatedAt: Date.now(),
    lastPolicyId: options?.policyId ?? existing?.lastPolicyId
  };
  await asyncWriteJsonAtomic(installedJsonPath, newInstalled);
  logger$d.info("Finalize: installed.json 已更新");
}
async function asyncCleanupOldVersions(items) {
  for (const item of items) {
    if (!item.componentDir || item.isMainApp) {
      continue;
    }
    const versionsDir = join(item.componentDir, "Versions");
    if (!await asyncExists(versionsDir)) {
      continue;
    }
    let currentVersion2 = "";
    try {
      const currentLink = join(item.componentDir, "Current");
      const target = await readlink(currentLink);
      currentVersion2 = basename(target);
    } catch {
      logger$d.warn("Finalize: 无法读取 Current symlink，跳过旧版本清理");
      continue;
    }
    if (!currentVersion2) {
      logger$d.warn("Finalize: 无法读取 Current symlink，跳过旧版本清理");
      continue;
    }
    const versionDirs = [];
    const flattenTmpDirs = [];
    try {
      const entries2 = await readdir(versionsDir);
      for (const name of entries2) {
        if (name === "Current" || name.startsWith(".")) {
          continue;
        }
        if (name.endsWith("_flatten_tmp")) {
          flattenTmpDirs.push(name);
          continue;
        }
        const fullPath = join(versionsDir, name);
        try {
          const s = await stat(fullPath);
          if (s.isDirectory()) {
            versionDirs.push(name);
          }
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
    for (const tmpName of flattenTmpDirs) {
      try {
        await asyncRemoveDir(join(versionsDir, tmpName));
        logger$d.info(`Finalize: 已清理 flatten 残留 ${tmpName}`);
      } catch (err) {
        logger$d.warn(`Finalize: 清理 flatten 残留 ${tmpName} 失败: ${err.message}`);
      }
    }
    for (const ver of versionDirs) {
      if (ver === currentVersion2) {
        continue;
      }
      const oldDir = join(versionsDir, ver);
      try {
        await asyncRemoveDir(oldDir);
        logger$d.info(`Finalize: 已清理旧版本 ${ver}`);
      } catch (err) {
        logger$d.warn(`Finalize: 清理旧版本 ${ver} 失败: ${err.message}`);
      }
    }
  }
}
const logger$c = getLogger("updater:symlink-switcher");
async function asyncSwitchAllSymlinks(items, onProgress) {
  const componentItems = items.filter((item) => !item.isMainApp && item.componentDir);
  const total = componentItems.length;
  if (total === 0) {
    logger$c.info("symlink-switcher: 无子组件需要切换");
    return;
  }
  const switchedItems = [];
  for (let i = 0; i < componentItems.length; i++) {
    const item = componentItems[i];
    const index = i + 1;
    try {
      await asyncSwitchCurrentSymlink(item, total, index, onProgress);
      switchedItems.push(item);
    } catch (err) {
      logger$c.error(`symlink-switcher: ${item.name} 切换失败: ${err.message}`);
      if (switchedItems.length > 0) {
        logger$c.info(`symlink-switcher: 回切已成功切换的 ${switchedItems.length} 个组件`);
        for (const switchedItem of switchedItems) {
          try {
            await asyncRollbackSymlink(switchedItem);
          } catch (rollbackErr) {
            logger$c.error(`symlink-switcher: ${switchedItem.name} 回切失败: ${rollbackErr.message}`);
          }
        }
      }
      throw err;
    }
  }
  logger$c.info(`symlink-switcher: 全部 ${total} 个子组件 symlink 切换完成`);
}
async function asyncSwitchCurrentSymlink(item, total, index, onProgress) {
  if (!item.componentDir) {
    throw new Error(`子组件 ${item.name} 缺少 componentDir`);
  }
  const { componentDir } = item;
  const currentLink = join(componentDir, "Current");
  const target = `Versions/${item.newVersion}`;
  logger$c.info(`Replace: 切换 ${item.name} Current → ${target}`);
  const newVersionDir = join(componentDir, "Versions", item.newVersion);
  if (!await asyncExists(newVersionDir)) {
    throw new Error(`新版本目录不存在: ${newVersionDir}（Prepare 阶段可能未完成）`);
  }
  await asyncAtomicSymlink(currentLink, target);
  logger$c.info(`Replace: ${item.name} Current → ${target} 切换完成`);
}
async function asyncRollbackSymlink(item) {
  if (!item.componentDir) {
    logger$c.warn(`rollbackSymlink: 子组件 ${item.name} 缺少 componentDir，跳过回滚`);
    return;
  }
  const currentLink = join(item.componentDir, "Current");
  const oldTarget = `Versions/${item.oldVersion}`;
  const oldVersionDir = join(item.componentDir, "Versions", item.oldVersion);
  if (!await asyncExists(oldVersionDir)) {
    logger$c.warn(`rollbackSymlink: 旧版本目录不存在: ${oldVersionDir}，跳过回滚`);
    return;
  }
  await asyncAtomicSymlink(currentLink, oldTarget);
  logger$c.info(`Rollback: ${item.name} Current → ${oldTarget} 回切完成`);
}
const logger$b = getLogger("updater:doc-preview-silent");
const DOC_PREVIEW_NAME = "DocPreview";
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1e3;
const DOWNLOAD_RETRY_DELAYS_MS = [1e3, 4e3, 16e3];
const SHA256_REGEX = /^[a-f0-9]{64}$/i;
let inProgress = false;
function isDocPreviewOnlyUpdate(components) {
  if (!components?.length) return false;
  const hasDocPreview = components.some((c) => c.type === ComponentType.DOC_PREVIEW);
  if (!hasDocPreview) return false;
  const nonDocPreview = components.filter((c) => c.type !== ComponentType.DOC_PREVIEW);
  return nonDocPreview.length === 0;
}
function findDocPreviewComponent(components) {
  return components?.find((c) => c.type === ComponentType.DOC_PREVIEW) ?? null;
}
async function startSilentInstall(component) {
  if (inProgress) {
    logger$b.info("startSilentInstall: 已有静默任务进行中，跳过");
    return;
  }
  if (component.type !== ComponentType.DOC_PREVIEW) {
    logger$b.warn(`startSilentInstall: 非 DocPreview 组件 (type=${component.type})，拒绝`);
    return;
  }
  if (!component.url || !component.version) {
    logger$b.warn(`startSilentInstall: 组件信息不完整 url="${component.url}" version="${component.version}"`);
    return;
  }
  inProgress = true;
  const { version } = component;
  const downloadDir = join(getDownloadsDir(), "doc-preview-silent");
  const archiveFileName = `DocPreview-${version}.zip`;
  const archivePath = join(downloadDir, archiveFileName);
  const componentDir = join(getComponentsDir(), DOC_PREVIEW_NAME);
  let downloadSucceeded = false;
  logger$b.info(`startSilentInstall: 开始 DocPreview 静默安装 version=${version} size=${component.size} url=${component.url}`);
  try {
    await mkdir(downloadDir, { recursive: true });
    await downloadWithRetry(
      component.url,
      downloadDir,
      archiveFileName,
      component.sha256 ?? ""
    );
    downloadSucceeded = true;
    const item = {
      name: DOC_PREVIEW_NAME,
      isMainApp: false,
      oldVersion: "0.0.0",
      newVersion: version,
      archivePath,
      sha256: component.sha256 ?? "",
      md5: component.md5 ?? "",
      componentDir,
      componentType: String(ComponentType.DOC_PREVIEW)
    };
    await asyncPrepareComponent(
      item,
      downloadDir,
      // stagingDir（非 mainApp 场景不会用到）
      1,
      // total
      1,
      // index
      (p) => {
        logger$b.debug(`startSilentInstall: prepare ${p.stage} ${p.progress}%`);
      }
    );
    await asyncSwitchCurrentSymlink(item, 1, 1);
    logger$b.info(`startSilentInstall: Current → Versions/${version} symlink 已建立`);
    await asyncUpdateInstalledJson([item]);
    logger$b.info(`startSilentInstall: installed.json 已更新 DocPreview → ${version}`);
    notifyIfReady();
    notifySilentInstallProgress({
      component: DOC_PREVIEW_NAME,
      status: "install_success",
      version
    });
    logger$b.info(`startSilentInstall: DocPreview 静默安装完成 version=${version}`);
  } catch (err) {
    logger$b.error(`startSilentInstall: DocPreview 静默安装失败 — ${err.message}`);
    const versionDir = join(componentDir, "Versions", version);
    try {
      await rm(versionDir, { recursive: true, force: true });
    } catch {
    }
    notifySilentInstallProgress({
      component: DOC_PREVIEW_NAME,
      status: "install_failed",
      version,
      errorMessage: err.message
    });
  } finally {
    if (downloadSucceeded) {
      try {
        await rm(archivePath, { force: true });
      } catch {
      }
      try {
        await rm(`${archivePath}.aria2`, { force: true });
      } catch {
      }
    }
    inProgress = false;
  }
}
async function downloadWithRetry(url, targetDir, fileName, sha256) {
  const maxAttempts = DOWNLOAD_RETRY_DELAYS_MS.length + 1;
  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await downloadOnce(url, targetDir, fileName, sha256);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < DOWNLOAD_RETRY_DELAYS_MS.length) {
        const delay = DOWNLOAD_RETRY_DELAYS_MS[attempt];
        logger$b.warn(`downloadWithRetry: attempt=${attempt + 1}/${maxAttempts} failed: ${lastError.message}，${delay}ms 后重试`);
        await sleep(delay);
      }
    }
  }
  throw new Error(`下载失败（已重试 ${maxAttempts} 次）: ${lastError?.message}`);
}
async function downloadOnce(url, targetDir, fileName, sha256) {
  const rpcClient2 = await acquireAria2RpcClient();
  const opts = {
    dir: targetDir,
    out: fileName,
    continue: true
  };
  const sha256Trim = sha256.trim();
  if (SHA256_REGEX.test(sha256Trim)) {
    opts.checksum = `sha-256=${sha256Trim.toLowerCase()}`;
  }
  logger$b.info(`downloadOnce: aria2 addUri url=${url} dir=${targetDir} out=${fileName} checksum=${opts.checksum ?? "(none)"}`);
  const gid = await rpcClient2.addUri([url], opts);
  logger$b.info(`downloadOnce: gid=${gid} 入队成功，开始轮询`);
  try {
    await waitForGidComplete(rpcClient2, gid);
    logger$b.info(`downloadOnce: gid=${gid} 下载完成 → ${join(targetDir, fileName)}`);
  } catch (err) {
    try {
      await rpcClient2.forceRemove(gid);
    } catch {
    }
    throw err;
  }
}
async function waitForGidComplete(rpcClient2, gid) {
  const startedAt2 = Date.now();
  let lastLoggedPercent = -1;
  while (true) {
    if (Date.now() - startedAt2 > DOWNLOAD_TIMEOUT_MS) {
      throw new Error(`下载超时（${Math.round(DOWNLOAD_TIMEOUT_MS / 1e3)}s）`);
    }
    let status;
    try {
      status = await rpcClient2.tellStatus(gid);
    } catch (err) {
      throw new Error(`tellStatus 失败: ${err.message}`);
    }
    const completed = parseInt(status.completedLength, 10) || 0;
    const total = parseInt(status.totalLength, 10) || 0;
    const percent = total > 0 ? Math.floor(completed / total * 100) : 0;
    if (percent !== lastLoggedPercent && percent % 10 === 0) {
      logger$b.debug(`waitForGidComplete: gid=${gid} ${percent}% (${completed}/${total}) speed=${status.downloadSpeed}`);
      lastLoggedPercent = percent;
    }
    if (status.status === "complete") {
      return;
    }
    if (status.status === "error" || status.status === "removed") {
      throw new Error(`aria2 下载失败 status=${status.status} errorCode=${status.errorCode ?? ""} ${status.errorMessage ?? ""}`);
    }
    await sleep(DOWNLOAD_POLL_INTERVAL_MS);
  }
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
const logger$a = getLogger("updater");
const stateMachine = new UpdateStateMachine();
const sessionGuard = new UpdateSessionGuard(stateMachine);
const idleChecker = new IdleChecker();
const tokenService = new DownloadTokenService();
let activeSilentPolicy = null;
let autoCheckTimer = null;
let lastCheckResult = null;
const checkResultHandlers = [];
let buildStoreRef = null;
const aria2Manager = new Aria2Manager();
const downloader = new ComponentDownloader();
const applier = new ComponentApplier();
let currentBatch = null;
let downloadComplete = false;
const progressHandlers = [];
const installProgressHandlers = [];
let lastInstallProgress = null;
let updateStartTime = 0;
const silentInstallProgressHandlers = [];
function notifySilentInstallProgress(progress) {
  for (const handler of silentInstallProgressHandlers) {
    try {
      handler(progress);
    } catch (err) {
      logger$a.warn(`silent install progress handler 异常: ${err.message}`);
    }
  }
}
async function acquireAria2RpcClient() {
  return aria2Manager.startSession();
}
function startAutoCheck(buildStore, waitFor) {
  if (autoCheckTimer) {
    logger$a.warn("startAutoCheck: 已在运行，跳过");
    return;
  }
  buildStoreRef = buildStore;
  logger$a.info(`startAutoCheck: 启动（interval=${AUTO_CHECK_INTERVAL_MS}ms）— ${waitFor ? "等待前置条件后首检" : "立即首检"} + 定时轮询`);
  if (waitFor) {
    void waitFor.finally(() => {
      void doAutoCheck();
    });
  } else {
    void doAutoCheck();
  }
  autoCheckTimer = setInterval(() => {
    void doAutoCheck();
  }, AUTO_CHECK_INTERVAL_MS);
  if (autoCheckTimer && typeof autoCheckTimer === "object" && "unref" in autoCheckTimer) {
    autoCheckTimer.unref();
  }
}
function stopAutoCheck() {
  if (autoCheckTimer) {
    clearInterval(autoCheckTimer);
    autoCheckTimer = null;
  }
  logger$a.info("stopAutoCheck: 已停止");
}
function processCheckResult(original) {
  if (isDocPreviewReady()) {
    return original;
  }
  const components = original.components ?? [];
  const docPreviewComp = findDocPreviewComponent(components);
  if (!docPreviewComp) {
    return original;
  }
  const frontendComponents = components.filter((c) => c.type !== ComponentType.DOC_PREVIEW);
  const isOnlyDocPreview = isDocPreviewOnlyUpdate(components);
  if (isOnlyDocPreview) {
    logger$a.info(`processCheckResult: DocPreview-only 首装场景，触发静默安装 version=${docPreviewComp.version}`);
    void startSilentInstall(docPreviewComp);
    return {
      ...original,
      has_update: false,
      update_type: 0,
      components: [],
      total_size: 0,
      target_version: "",
      changelog: ""
    };
  }
  logger$a.info(`processCheckResult: DocPreview 与其他 ${frontendComponents.length} 个组件共同下发，走常规更新流程`);
  return original;
}
async function doAutoCheck() {
  if (!buildStoreRef) return;
  if (sessionGuard.isReadyToRestart()) {
    logger$a.info("doAutoCheck: ready_to_restart 已标记，跳过自动检查");
    return;
  }
  if (stateMachine.isBusy) {
    logger$a.info("doAutoCheck: 状态机忙碌，跳过本次检查");
    return;
  }
  try {
    stateMachine.tryTransition(UpdateState.Checking, "auto check");
    const rawResult = await checkUpdate(buildStoreRef);
    if (rawResult) {
      const result = processCheckResult(rawResult);
      lastCheckResult = result;
      if (result.has_update) {
        stateMachine.tryTransition(UpdateState.Available, "found update");
        routeUpdateStrategy(result);
      } else {
        stateMachine.tryTransition(UpdateState.Idle, "no update (maybe silent doc-preview)");
        notifyCheckResultHandlers(result);
      }
    } else {
      stateMachine.tryTransition(UpdateState.Idle, "no update");
      const noUpdateResult = {
        has_update: false,
        update_type: 0,
        silent_update: 0,
        target_version: "",
        changelog: "",
        total_size: 0,
        policy_id: 0,
        exp_id: "",
        exp_group: "",
        components: []
      };
      notifyCheckResultHandlers(noUpdateResult);
    }
  } catch (err) {
    stateMachine.tryTransition(UpdateState.Idle, "check error");
    logger$a.warn(`doAutoCheck: ${err.message}`);
  }
}
function routeUpdateStrategy(result) {
  const updateType = result.update_type;
  const silentCode = result.silent_update;
  if (updateType === UpdateTypeCode.ForcePopWindow) {
    logger$a.info(`routeUpdateStrategy: 强制弹窗 (update_type=${updateType})`);
    void startForceUpdate(result);
    return;
  }
  if (silentCode !== SilentUpdateCode.NotSilent) {
    logger$a.info(`routeUpdateStrategy: 静默策略 (silent_update=${silentCode})`);
    activeSilentPolicy = new SilentUpdatePolicy({
      idleChecker,
      tokenService,
      sessionGuard,
      doDownloadInstall: async (cr, _install, speedLimit) => {
        lastCheckResult = cr;
        const result2 = await doDownloadAndInstall(true, speedLimit);
        if (result2.code !== 0) {
          throw new Error(result2.message || "download/install failed");
        }
      },
      doDownloadOnly: async (cr, speedLimit) => {
        lastCheckResult = cr;
        await doDownloadAndInstall(true, speedLimit);
      },
      doRestart: async (hidden) => {
        await restartApp(hidden);
      }
    });
    activeSilentPolicy.onComplete((success, error) => {
      logger$a.info(`silentPolicy 完成: success=${success} error=${error ?? ""}`);
      activeSilentPolicy = null;
    });
    activeSilentPolicy.start(result, silentCode);
    notifyCheckResultHandlers(result);
    return;
  }
  logger$a.info(`routeUpdateStrategy: 用户手动 (update_type=${updateType}, silent_update=${silentCode})`);
  notifyCheckResultHandlers(result);
}
async function checkNow(manual) {
  if (!buildStoreRef) return null;
  if (sessionGuard.isReadyToRestart()) {
    logger$a.info("checkNow: ready_to_restart 已标记，拒绝检查");
    return null;
  }
  if (stateMachine.isBusy) {
    logger$a.info("checkNow: 状态机忙碌，拒绝检查");
    return null;
  }
  try {
    stateMachine.tryTransition(UpdateState.Checking, manual ? "manual check" : "auto check");
    const rawResult = await checkUpdate(buildStoreRef);
    if (rawResult) {
      const result = processCheckResult(rawResult);
      lastCheckResult = result;
      if (result.has_update) {
        stateMachine.tryTransition(UpdateState.Available, "found update");
        routeUpdateStrategy(result);
      } else {
        stateMachine.tryTransition(UpdateState.Idle, "no update (maybe silent doc-preview)");
      }
      return result;
    }
    stateMachine.tryTransition(UpdateState.Idle, "no update");
    return null;
  } catch (err) {
    stateMachine.tryTransition(UpdateState.Idle, "check error");
    logger$a.warn(`checkNow: ${err.message}`);
    return null;
  }
}
function onCheckResult(handler) {
  checkResultHandlers.push(handler);
  return () => {
    const idx = checkResultHandlers.indexOf(handler);
    if (idx >= 0) checkResultHandlers.splice(idx, 1);
  };
}
function notifyCheckResultHandlers(result) {
  for (const handler of checkResultHandlers) {
    try {
      handler(result);
    } catch (err) {
      logger$a.warn(`checkResult handler 异常: ${err.message}`);
    }
  }
}
function getUpdaterDeps() {
  return {
    checkNow,
    onCheckResult,
    getLastCheckResult: () => lastCheckResult,
    getState: () => stateMachine.state,
    isBusy: () => stateMachine.isBusy,
    startUpdate,
    pauseUpdate,
    resumeUpdate,
    cancelUpdate,
    onProgress: (handler) => {
      progressHandlers.push(handler);
      downloader.onProgress(handler);
    },
    onInstallProgress: (handler) => {
      installProgressHandlers.push(handler);
      const wrapped = (progress) => {
        lastInstallProgress = progress;
        handler(progress);
      };
      applier.onInstallProgress(wrapped);
    },
    onSilentInstallProgress: (handler) => {
      silentInstallProgressHandlers.push(handler);
    },
    restartApp,
    /** 获取目标版本号（用于 ready_to_restart 时展示） */
    getTargetVersion: () => lastCheckResult?.target_version ?? ""
  };
}
function buildUpdateBatch() {
  if (!lastCheckResult?.has_update) return null;
  const checkData = lastCheckResult;
  const components = checkData.components || [];
  if (!Array.isArray(components) || components.length === 0) return null;
  const localVersions = resolveComponents(loadBuildJson(), loadInstalledJson());
  const localVersionMap = new Map(localVersions.map((v) => [v.name, v.version]));
  const aggregatedVersion = checkData.target_version || checkData.version || "0.0.0";
  const batchId = `${aggregatedVersion}-${Date.now()}`;
  const batchDir = `${getDownloadsDir()}/${batchId}`;
  const tasks = components.map((comp) => {
    const name = comp.name ?? "unknown";
    return {
      name,
      type: comp.type,
      fromVersion: localVersionMap.get(name) || "0.0.0",
      toVersion: comp.version || "0.0.0",
      url: comp.url || "",
      sha256: (comp.sha256 || "").toLowerCase(),
      md5: (comp.md5 || "").toLowerCase(),
      size: comp.size || comp.size64 || 0,
      desc: comp.desc || "",
      archivePath: `${batchDir}/${name}-${comp.version || "0.0.0"}.zip`,
      status: ComponentTaskStatus.Pending,
      completedLength: 0,
      downloadSpeed: 0
    };
  });
  return {
    batchId,
    aggregatedVersion,
    policyId: checkData.policy_id || checkData.policyId,
    discoveredAt: Date.now(),
    batchDir,
    tasks
  };
}
async function startUpdate() {
  if (!lastCheckResult?.has_update) {
    return { code: 2, message: "NoUpdateAvailable" };
  }
  if (activeSilentPolicy?.isRunning() && sessionGuard.canPreempt("user_manual")) {
    logger$a.info("startUpdate: 用户抢占普通静默更新");
    activeSilentPolicy.yield();
    activeSilentPolicy = null;
    sessionGuard.yield();
  }
  const sessionResult = sessionGuard.tryBegin("user_manual");
  if (!sessionResult.accepted) {
    return { code: 3, message: sessionResult.reason ?? "SessionRejected" };
  }
  if (stateMachine.state !== UpdateState.Available && stateMachine.state !== UpdateState.Failed) {
    if (stateMachine.isBusy) {
      sessionGuard.release();
      return { code: 3, message: "AlreadyRunning" };
    }
    sessionGuard.release();
    return { code: 1, message: "InvalidState" };
  }
  return doDownloadAndInstall();
}
async function doDownloadAndInstall(waitForComplete = false, speedLimit) {
  try {
    updateStartTime = Date.now();
    if (stateMachine.state === UpdateState.Failed && downloadComplete && currentBatch) {
      logger$a.info(`doDownloadAndInstall: 检测到下载已完成，跳过下载直接重试安装 (batchId=${currentBatch.batchId})`);
      const preparePromise = startPrepare(currentBatch);
      if (waitForComplete) await preparePromise;
      return { code: 0, message: "ok" };
    }
    stateMachine.transition(UpdateState.Downloading, "start update");
    downloadComplete = false;
    const rpcClient2 = await aria2Manager.startSession();
    const batch = buildUpdateBatch();
    if (!batch) {
      stateMachine.tryTransition(UpdateState.Failed, "no batch info");
      return { code: 4, message: "Failed to build update batch" };
    }
    currentBatch = batch;
    logger$a.info(`doDownloadAndInstall: batchId=${batch.batchId} 任务数=${batch.tasks.length} waitForComplete=${waitForComplete}`);
    let resolveComplete = null;
    const completePromise = waitForComplete ? new Promise((resolve2) => {
      resolveComplete = resolve2;
    }) : null;
    downloader.onComplete((success, error) => {
      if (success) {
        downloadComplete = true;
        stateMachine.tryTransition(UpdateState.Downloaded, "download complete");
        notifyProgressHandlers({
          overallProgress: 100,
          currentComponent: "",
          downloadedSize: batch.tasks.reduce((s, t) => s + t.size, 0),
          totalSize: batch.tasks.reduce((s, t) => s + t.size, 0),
          downloadSpeed: 0
        });
        if (lastCheckResult) {
          const duration = (Date.now() - updateStartTime) / 1e3;
          void reportUpdateResult(ReportStatus.Success, duration, buildReportUpdateInfo(lastCheckResult));
        }
        const preparePromise = startPrepare(batch);
        if (resolveComplete) {
          void preparePromise.then(() => {
            resolveComplete({ code: 0, message: "ok" });
          });
        }
      } else {
        notifyProgressHandlers({
          overallProgress: 0,
          currentComponent: "",
          downloadedSize: 0,
          totalSize: 0,
          downloadSpeed: 0,
          errorMessage: "下载失败，请稍后重试"
        });
        stateMachine.tryTransition(UpdateState.Failed, `download failed: ${error}`);
        if (lastCheckResult) {
          const duration = (Date.now() - updateStartTime) / 1e3;
          void reportUpdateResult(ReportStatus.Failed, duration, buildReportUpdateInfo(lastCheckResult));
        }
        resolveComplete?.({ code: 4, message: `download failed: ${error}` });
      }
    });
    await downloader.startBatch(batch, rpcClient2, speedLimit);
    if (completePromise) {
      return completePromise;
    }
    return { code: 0, message: "ok" };
  } catch (err) {
    stateMachine.tryTransition(UpdateState.Failed, `start update error: ${err.message}`);
    return { code: 4, message: err.message };
  }
}
async function pauseUpdate() {
  if (sessionGuard.getCurrentEntry() === "force_update") {
    logger$a.warn("pauseUpdate: 强制更新不可暂停");
    return;
  }
  const silentCode = sessionGuard.getCurrentSilentCode();
  if (silentCode === SilentUpdateCode.ForceSilent || silentCode === SilentUpdateCode.UnconditionalForce) {
    logger$a.warn("pauseUpdate: 强制静默更新不可暂停");
    return;
  }
  await downloader.pause();
}
async function resumeUpdate() {
  await downloader.resume();
}
async function cancelUpdate() {
  if (sessionGuard.getCurrentEntry() === "force_update") {
    logger$a.warn("cancelUpdate: 强制更新不可取消");
    return;
  }
  const silentCode = sessionGuard.getCurrentSilentCode();
  if (silentCode === SilentUpdateCode.ForceSilent || silentCode === SilentUpdateCode.UnconditionalForce) {
    logger$a.warn("cancelUpdate: 强制静默更新不可取消");
    return;
  }
  await downloader.cancel();
  currentBatch = null;
  downloadComplete = false;
  sessionGuard.release();
  stateMachine.tryTransition(UpdateState.Idle, "cancel");
}
function notifyProgressHandlers(progress) {
  for (const handler of progressHandlers) {
    try {
      handler(progress);
    } catch (err) {
      logger$a.warn(`progress handler 异常: ${err.message}`);
    }
  }
}
async function startForceUpdate(checkResult) {
  const sessionResult = sessionGuard.tryBegin("force_update");
  if (!sessionResult.accepted) {
    logger$a.warn(`startForceUpdate: 闸门拒绝 reason=${sessionResult.reason}`);
    return;
  }
  notifyCheckResultHandlers(checkResult);
  logger$a.info('startForceUpdate: 已通知前端展示强制弹窗，等待用户点击"立即更新"');
  sessionGuard.release();
}
async function startPrepare(batch) {
  try {
    stateMachine.transition(UpdateState.Installing, "start prepare");
    await applier.prepareBatch(batch);
    stateMachine.tryTransition(UpdateState.Prepared, "prepare complete");
    sessionGuard.markReadyToRestart();
  } catch (err) {
    logger$a.error(`startPrepare: 安装准备失败: ${err.message}`);
    stateMachine.tryTransition(UpdateState.Failed, `prepare failed: ${err.message}`);
    const errorProgress = {
      stage: "error",
      component: lastInstallProgress?.component ?? "",
      progress: lastInstallProgress?.progress ?? 0,
      total: lastInstallProgress?.total ?? 0,
      index: lastInstallProgress?.index ?? 0,
      error: "安装失败，请稍后重试"
    };
    for (const handler of installProgressHandlers) {
      try {
        handler(errorProgress);
      } catch (handlerErr) {
        logger$a.warn(`install progress handler 异常: ${handlerErr.message}`);
      }
    }
  }
}
async function restartApp(hidden) {
  if (stateMachine.state !== UpdateState.Prepared) {
    logger$a.warn(`restartApp: 状态不正确 (state=${stateMachine.state})，期望 Prepared`);
    return;
  }
  if (!currentBatch) {
    logger$a.warn("restartApp: 无当前批次");
    return;
  }
  try {
    stateMachine.transition(UpdateState.Applying, "restart app");
    await applier.applyBatch(currentBatch, hidden);
  } catch (err) {
    logger$a.error(`restartApp: 应用更新失败: ${err.message}`);
    stateMachine.tryTransition(UpdateState.Failed, `apply failed: ${err.message}`);
  }
}
async function stopUpdater() {
  stopAutoCheck();
  await aria2Manager.stopSession();
  logger$a.info("updater 模块已停止");
}
const QC_REDIRECT_URI_PREFIXES = [
  "https://yybadaccess.3g.qq.com/marvis_client_login/marvis_oauth",
  "https://yybadaccess.3g.qq.com/marvis_client_login_test/marvis_oauth",
  "https://yybadaccess.sparta.html5.qq.com/marvis_client_login/marvis_oauth",
  "https://yybadaccess.sparta.html5.qq.com/marvis_client_login_test/marvis_oauth"
];
const QQ_LOGIN_WINDOW_WIDTH = 500;
const QQ_LOGIN_WINDOW_HEIGHT = 420;
const QQ_LOGIN_WINDOW_TIMEOUT_MS = 5 * 60 * 1e3;
const logger$9 = getLogger("qq-login-window");
const QQ_LOGIN_HIDE_CSS = `
  /* 顶部导航 */
  .login_header, .login-header, #login_header,
  .logo_area, .logo-area,
  /* 底部链接行（密码登录 / 注册账号 / 意见反馈） */
  .login_footer, .login-footer, #login_footer,
  .bottom_tips, .bottom-tips,
  .login_links, .login-links,
  .link_area, .link-area,
  .other_login, .other-login,
  /* 账号密码 Tab 切换栏 */
  .login_tab_area, .login-tab-area, .tab_area, .tab-area,
  /* 左侧装饰图 */
  .login_left, .login-left, .left_area, .left-area,
  /* 其他多余区域 */
  .login_tips, .login-tips,
  .agreement_area, .agreement-area {
    display: none !important;
  }
  /* 让快捷登录区域撑满窗口，去除多余内边距 */
  body, html {
    overflow: hidden !important;
  }
  .login_wrap, .login-wrap, #login_wrap,
  .qlogin_wrap, .qlogin-wrap {
    margin: 0 auto !important;
    padding: 0 !important;
  }
  /* 压缩快捷登录区域自身的底部内边距，减少留白 */
  .quick_login, .quick-login, .qlogin_content, .qlogin-content {
    padding-bottom: 0 !important;
    margin-bottom: 0 !important;
  }
`;
function openQQLoginWindow(authUrl, parentWindow) {
  return new Promise((resolve2, reject) => {
    const loginSession = session.fromPartition("persist:qq-login", { cache: true });
    let winX;
    let winY;
    if (parentWindow && !parentWindow.isDestroyed()) {
      const parentBounds = parentWindow.getBounds();
      const centerX = parentBounds.x + parentBounds.width / 2;
      const centerY = parentBounds.y + parentBounds.height / 2;
      let x = Math.round(centerX - QQ_LOGIN_WINDOW_WIDTH / 2);
      let y = Math.round(centerY - QQ_LOGIN_WINDOW_HEIGHT / 2);
      const display = screen.getDisplayMatching(parentBounds);
      const { x: sx, y: sy, width: sw, height: sh } = display.workArea;
      x = Math.max(sx, Math.min(x, sx + sw - QQ_LOGIN_WINDOW_WIDTH));
      y = Math.max(sy, Math.min(y, sy + sh - QQ_LOGIN_WINDOW_HEIGHT));
      winX = x;
      winY = y;
    }
    const win = new BrowserWindow({
      width: QQ_LOGIN_WINDOW_WIDTH,
      height: QQ_LOGIN_WINDOW_HEIGHT,
      ...winX !== void 0 && winY !== void 0 ? { x: winX, y: winY } : {},
      show: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      // 设置 parent 使登录窗口始终显示在主窗口上方
      ...parentWindow && !parentWindow.isDestroyed() ? { parent: parentWindow } : {},
      title: "QQ 登录",
      webPreferences: {
        session: loginSession,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });
    let settled = false;
    function settle(fn) {
      if (settled) return;
      settled = true;
      clearTimeout(timer2);
      win.webContents.removeAllListeners("will-redirect");
      win.webContents.removeAllListeners("will-navigate");
      win.removeAllListeners("closed");
      if (!win.isDestroyed()) win.close();
      fn();
    }
    const timer2 = setTimeout(() => {
      logger$9.warn("openQQLoginWindow: 超时，强制关闭登录窗口");
      settle(() => reject(new Error("timeout")));
    }, QQ_LOGIN_WINDOW_TIMEOUT_MS);
    function handleCallbackUrl(event, url) {
      const isCallback = QC_REDIRECT_URI_PREFIXES.some((prefix) => url.startsWith(prefix));
      if (!isCallback) return;
      logger$9.info(`openQQLoginWindow: 截获回调 URL ${url.slice(0, 80)}...`);
      event.preventDefault();
      let code;
      let state2;
      try {
        const parsed = new URL(url);
        code = parsed.searchParams.get("code") ?? "";
        state2 = parsed.searchParams.get("state") ?? "";
      } catch (err) {
        logger$9.warn(`openQQLoginWindow: 解析 redirect_uri 失败 — ${err.message}`);
        settle(() => reject(new Error("invalid redirect_uri")));
        return;
      }
      if (!code) {
        logger$9.warn("openQQLoginWindow: redirect_uri 中缺少 code");
        settle(() => reject(new Error("missing code in redirect_uri")));
        return;
      }
      logger$9.info(`openQQLoginWindow: 授权成功 code=${code.slice(0, 8)}...，代理请求 redirect_uri 写入 Cookie...`);
      net.fetch(url, {
        bypassCustomProtocolHandlers: true
      }).then(async () => {
        logger$9.info("openQQLoginWindow: redirect_uri 代理请求完成，Cookie 已写入 defaultSession");
        const userInfo2 = await readLoginCookiesFromDefaultSession();
        logger$9.info(`openQQLoginWindow: 读取登录 Cookie 完成 openId=${userInfo2.openId || "(empty)"} loginType=${userInfo2.loginType || "(empty)"}`);
        settle(() => resolve2({ code, state: state2, userInfo: userInfo2.openId ? userInfo2 : void 0 }));
      }).catch((err) => {
        logger$9.warn(`openQQLoginWindow: redirect_uri 代理请求失败 — ${err.message}，仍尝试继续登录流程`);
        settle(() => resolve2({ code, state: state2 }));
      });
    }
    win.webContents.on("will-redirect", (event, url) => {
      handleCallbackUrl(event, url);
    });
    win.webContents.on("will-navigate", (event, url) => {
      handleCallbackUrl(event, url);
    });
    win.on("closed", () => {
      logger$9.info("openQQLoginWindow: 用户关闭了登录窗口");
      settle(() => reject(new Error("user cancelled")));
    });
    win.once("ready-to-show", () => {
      void win.webContents.insertCSS(QQ_LOGIN_HIDE_CSS);
      win.show();
      if (!app.isPackaged) {
        win.webContents.openDevTools({ mode: "detach" });
      }
    });
    win.loadURL(authUrl).catch((err) => {
      logger$9.error(`openQQLoginWindow: 加载授权页失败 — ${err.message}`);
      settle(() => reject(new Error(`load failed: ${err.message}`)));
    });
    logger$9.info(`openQQLoginWindow: 已创建登录窗口，加载 ${authUrl.slice(0, 60)}...`);
  });
}
async function readLoginCookiesFromDefaultSession() {
  const cookies = await session.defaultSession.cookies.get({ domain: ".qq.com" });
  const get = (name) => cookies.find((c) => c.name === name)?.value ?? "";
  const expireTimeStr = get("access_token_expire_time");
  const expireTime = expireTimeStr ? Number(expireTimeStr) : void 0;
  return {
    loginType: get("logintype"),
    openId: get("openid"),
    accessToken: get("accesstoken"),
    refreshToken: get("refreshtoken"),
    nickName: get("nickname"),
    headImg: get("head_img_url"),
    expireTime: expireTime && expireTime > 0 ? expireTime : void 0
  };
}
let registry = null;
let logger$8 = null;
let installed = false;
const watchedWebContents = /* @__PURE__ */ new Set();
let invokeCountTotal = 0;
let invokeCountWindow = 0;
const methodCountWindow = /* @__PURE__ */ new Map();
let statsTimer = null;
function getModuleLogger$1() {
  if (!logger$8) {
    logger$8 = getLogger("jsbridge");
  }
  return logger$8;
}
function makeEmitContext(wc) {
  const webContentsId = wc.id;
  return {
    webContentsId,
    emit(callbackId, code, data = "", message = "") {
      if (wc.isDestroyed()) return;
      try {
        wc.send(JSB_CHANNEL_CONTENT_CHANGED, { callbackId, code, data, message });
      } catch (err) {
        getModuleLogger$1().debug(`emit ContentChanged failed cid=${callbackId}: ${err.message}`);
      }
    },
    isAlive() {
      return !wc.isDestroyed();
    }
  };
}
function watchWebContents(wc) {
  if (watchedWebContents.has(wc.id)) return;
  watchedWebContents.add(wc.id);
  wc.once("destroyed", () => {
    const wcId = wc.id;
    watchedWebContents.delete(wcId);
    if (registry) {
      registry.notifyWebContentsDestroyed(wcId);
    }
  });
}
function normalizePayload(raw) {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw;
  const { methodName } = obj;
  const { callbackId } = obj;
  const { args } = obj;
  if (typeof methodName !== "string" || methodName.length === 0) return null;
  if (typeof callbackId !== "string" || callbackId.length === 0) return null;
  let normalizedArgs = [];
  if (Array.isArray(args)) {
    normalizedArgs = args.map((x) => {
      const t = typeof x;
      if (t === "string" || t === "number" || t === "boolean") return x;
      if (x === null || x === void 0) return x;
      return void 0;
    });
  }
  return { methodName, callbackId, args: normalizedArgs };
}
function initJsBridge(buildStore) {
  const log2 = getModuleLogger$1();
  if (installed) {
    log2.warn("jsbridge 已初始化，跳过");
    return;
  }
  const marvisSettingsHandler = new MarvisSettingsHandler({
    getApp: () => app,
    getGlobalShortcut: () => globalShortcut,
    onHotKeyTriggered: (_hotKey) => {
      toggleMainWindow();
    }
  });
  registry = new JsbRegistry();
  registry.register(new AiStarterHandler({
    getGatewayPortInfo: () => getPort("gateway"),
    onPortChange: (handler) => onPortChange(handler),
    getMainWindow,
    // 委托给 MarvisSettingsHandler，对齐 Windows AiStarter.GetMarvisHomeDir
    getMarvisHomeDir: (ctx, callbackId) => marvisSettingsHandler.GetMarvisHomeDir(ctx, callbackId),
    // 注入 updater 模块的 restartApp
    restartApp: () => getUpdaterDeps().restartApp(),
    // 注入 app-info-collection 模块的查询和订阅 API
    listAppsRaw: () => listAppsRaw(),
    getAppsByPkgNamesRaw: (pkgNames) => getAppsByPkgNamesRaw(pkgNames),
    onInstallStateChange: (listener) => onInstallStateChange(listener)
  }));
  registry.register(new WindowHandler({ getMainWindow, registry }));
  registry.register(new FileHandler());
  registry.register(new CLoginManagerHandler({
    getUserInfo: getUserInfo$1,
    login,
    patchUserInfo,
    logout,
    onEvent,
    // 包一层 wrapper，把主窗口引用传入，使登录窗口居中到主窗口所在屏幕
    openQQLoginWindow: (authUrl) => openQQLoginWindow(authUrl, getMainWindow()),
    checkLoginTick: () => tick(),
    // 对齐 Windows `CLoginService::Login` 中的同步 FetchUserInfo 补拉昵称/头像
    // 本接口在 Mac 侧只负责"补齐 nickName/headImg"这两个字段，
    // 不回写 token/expireTime（token 由 checker / refreshToken 链路维护），
    // 因此这里只挑这两个字段透传，避免 BackendResult.patch 更宽松的类型
    // 与 `ClientUserInfoBase`（loginType 为字面量联合）产生不必要的类型冲突。
    fetchUserInfoFromServer: async (info) => {
      const res = await fetchUserInfo(info);
      if (res.code !== BackendCode.kSuccess || !res.patch) {
        return { success: res.code === BackendCode.kSuccess };
      }
      return {
        success: true,
        patch: {
          nickName: res.patch.nickName,
          headImg: res.patch.headImg
        }
      };
    },
    // 对齐 Windows `CLoginService::Logout` 中的 `CLoginBackend::MarvisLogout`：
    // 在清本地登录态之前通知服务端吊销 token；失败不阻塞本地登出
    logoutFromServer: async (info) => {
      const res = await marvisLogout(info);
      return { success: res.code === BackendCode.kSuccess };
    },
    // 仅 QQ 登录路径使用：Mac 侧 QQ OAuth 后端 Set-Cookie 不下发
    // `access_token_expire_time`，导致 cookie 读出的 userInfo 缺 `expireTime`。
    // 若直接把缺字段的 userInfo push 给网关，网关 `LoginInfo` 反序列化会把
    // 整条 login 事件丢弃，直到 login-checker 定时器兜底才能恢复（实测延迟 ~13s）。
    // 这里在 `OpenQCLoginWindow` handler 内同步调一次 marvis_check_login，
    // 用返回的 `expires_in` 补齐 expireTime，与微信登录"一登录即带 expireTime"对齐。
    checkLoginFromServer: async (info) => {
      const res = await fetchCheckLogin(info);
      if (res.code !== BackendCode.kSuccess || !res.patch) {
        return { success: res.code === BackendCode.kSuccess };
      }
      return {
        success: true,
        patch: {
          accessToken: res.patch.accessToken,
          refreshToken: res.patch.refreshToken,
          expireTime: res.patch.expireTime
        }
      };
    }
  }));
  registry.register(new BasicInfoHandler({ getUserInfo: getUserInfo$1 }));
  registry.register(new ApplicationHandler(buildStore));
  registry.register(new AiStarterSettingsHandler());
  registry.register(new DiskManagerHandler());
  registry.register(new KnowledgeBaseHandler());
  registry.register(new LocalLLMManagerHandler());
  registry.register(new LocalLLMManagerV2Handler());
  registry.register(new MarvisAgentHandler());
  registry.register(marvisSettingsHandler);
  registry.register(new PreviewHandler());
  registry.register(new MarvisUpdateManagerHandler(buildStore, getUpdaterDeps()));
  registry.register(new SystemFeedbackHandler({ getUserInfo: getUserInfo$1 }));
  registry.register(new KVStorageHandler(new KVStorageStore()));
  ipcMain.handle(JSB_CHANNEL_INVOKE, async (event, raw) => {
    const payload = normalizePayload(raw);
    if (!payload) {
      log2.warn("收到非法 invoke payload，已丢弃");
      return { ok: false, reason: "invalid_payload" };
    }
    const wc = event.sender;
    if (wc.isDestroyed()) {
      log2.debug(`webContents 已销毁，丢弃调用 ${payload.methodName}`);
      return { ok: false, reason: "webcontents_destroyed" };
    }
    invokeCountTotal += 1;
    invokeCountWindow += 1;
    methodCountWindow.set(
      payload.methodName,
      (methodCountWindow.get(payload.methodName) ?? 0) + 1
    );
    watchWebContents(wc);
    const ctx = makeEmitContext(wc);
    void dispatchInvoke(ctx, payload, { registry, logger: log2 });
    return { ok: true };
  });
  if (statsTimer) clearInterval(statsTimer);
  statsTimer = setInterval(() => {
    if (invokeCountWindow === 0) return;
    const top = Array.from(methodCountWindow.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}=${v}`).join(" ");
    log2.info(`[stats] invoke window=${invokeCountWindow} total=${invokeCountTotal} top5: ${top}`);
    trace(
      "jsb:stats",
      `window=${invokeCountWindow} total=${invokeCountTotal} top5=${top}`
    );
    invokeCountWindow = 0;
    methodCountWindow.clear();
  }, 3e4);
  statsTimer.unref?.();
  installed = true;
  log2.info(`jsbridge 已初始化，已注册 ${registry.snapshotApiList().length} 个模块`);
  trace("jsb:init", `modules=${registry.snapshotApiList().length}`);
}
function disposeJsBridge() {
  if (!installed) return;
  const log2 = getModuleLogger$1();
  ipcMain.removeHandler(JSB_CHANNEL_INVOKE);
  if (statsTimer) {
    clearInterval(statsTimer);
    statsTimer = null;
  }
  if (registry) {
    registry.disposeAll();
    registry = null;
  }
  watchedWebContents.clear();
  installed = false;
  log2.info("jsbridge 已卸载");
  trace("jsb:dispose", `totalInvokes=${invokeCountTotal}`);
}
const ENV_VAR_NAME = "MARVIS_LOGIN_ENV";
const DEFAULT_LOGIN_ENV = "prod";
const LOGIN_HOST = {
  prod: "https://yybadaccess.3g.qq.com",
  test: "https://yybadaccess.sparta.html5.qq.com"
};
const LOGIN_PATH_PREFIX = {
  prod: "marvis_client_login",
  test: "marvis_client_login_test"
};
const logger$7 = getLogger("login-env");
let cachedEnv = null;
function getLoginEnv() {
  if (cachedEnv !== null) return cachedEnv;
  const raw = (process.env[ENV_VAR_NAME] ?? "").trim().toLowerCase();
  if (raw === "") {
    cachedEnv = DEFAULT_LOGIN_ENV;
  } else if (raw === "prod" || raw === "test") {
    cachedEnv = raw;
  } else {
    logger$7.warn(`[login-env] 非法的 ${ENV_VAR_NAME}="${raw}"，回退到默认值 "${DEFAULT_LOGIN_ENV}"（允许值：prod|test）`);
    cachedEnv = DEFAULT_LOGIN_ENV;
  }
  return cachedEnv;
}
function getLoginHost() {
  return LOGIN_HOST[getLoginEnv()];
}
function getLoginPathPrefix() {
  return LOGIN_PATH_PREFIX[getLoginEnv()];
}
function logLoginEnv() {
  const env = getLoginEnv();
  const raw = process.env[ENV_VAR_NAME] ?? "";
  logger$7.info(`[login-env] resolved: env=${env} host=${getLoginHost()} pathPrefix=${getLoginPathPrefix()} (${ENV_VAR_NAME}="${raw}")`);
}
const PATCH_FLAG = "__marvisBuglyFetchPatched";
function hasBody(init) {
  if (!init) return false;
  return init.body !== void 0 && init.body !== null;
}
function wrapFetch(original) {
  return function patchedFetch(input, init) {
    if (hasBody(init) && init && init.duplex === void 0) {
      const next = { ...init, duplex: "half" };
      return original.call(this, input, next);
    }
    return original.call(this, input, init);
  };
}
function applyFetchDuplexPatch() {
  const flagHolder = globalThis;
  if (flagHolder[PATCH_FLAG]) {
    return;
  }
  try {
    const netAny = net;
    if (typeof netAny.fetch === "function") {
      const originalNetFetch = netAny.fetch.bind(net);
      netAny.fetch = wrapFetch(originalNetFetch);
    }
  } catch {
  }
  try {
    const originalFetch = flagHolder.fetch;
    if (typeof originalFetch === "function") {
      flagHolder.fetch = wrapFetch(originalFetch);
    }
  } catch {
  }
  flagHolder[PATCH_FLAG] = true;
}
applyFetchDuplexPatch();
const ENV_BUGLY_APP_ID = "MARVIS_BUGLY_APP_ID";
const ENV_BUGLY_APP_KEY = "MARVIS_BUGLY_APP_KEY";
const ENV_BUGLY_TYPE = "MARVIS_BUGLY_TYPE";
const ENV_BUGLY_ENABLED = "MARVIS_BUGLY_ENABLED";
const DEFAULT_BUGLY_TYPE = "oa";
const DEFAULT_PLUGIN_CONFIG = {
  /** 走伽利略上报 */
  processPerformance: false,
  /** 异常有伽利略上报 */
  error: false,
  crash: true,
  api: { apiDetail: true }
};
const BUGLY_LOGGER_SCOPE = "bugly";
const IPC_CHANNEL_CRASH_TEST_TRIGGER = "marvis:bugly:crash-test:trigger";
const BUGLY_CRASH_TYPES = ["native", "js-uncaught", "js-unhandled-rejection"];
const BUGLY_MOD_ID = "bugly";
const BUGLY_MOD_NAME = "崩溃上报";
const BUGLY_REPORT_EVENTS = {
  /** Bugly SDK 初始化成功 */
  INIT_SUCCESS: "bugly__init_success",
  /** Bugly SDK 初始化被跳过（非法环境/缺凭据） */
  INIT_SKIP: "bugly__init_skip",
  /** Bugly SDK 初始化失败（严重错误，实时上报） */
  INIT_FAILED: "bugly__init_failed",
  /** Bugly 用户信息更新 */
  USER_UPDATED: "bugly__user_updated",
  /** Bugly 用户信息更新失败 */
  USER_UPDATE_FAILED: "bugly__user_update_failed"
};
let buglyInstance = null;
let logger$6 = null;
function getModuleLogger() {
  if (!logger$6) {
    logger$6 = getLogger(BUGLY_LOGGER_SCOPE);
  }
  return logger$6;
}
function isExplicitlyDisabled() {
  const raw = (process.env[ENV_BUGLY_ENABLED] ?? "").trim().toLowerCase();
  return raw === "0" || raw === "false" || raw === "no";
}
function readCredentialsFromEnv() {
  const id = (process.env[ENV_BUGLY_APP_ID] ?? "").trim();
  const appKey = (process.env[ENV_BUGLY_APP_KEY] ?? "").trim();
  const envType = (process.env[ENV_BUGLY_TYPE] ?? "").trim();
  const buglyType = envType || DEFAULT_BUGLY_TYPE;
  if (!id || !appKey) {
    return null;
  }
  return { id, appKey, buglyType };
}
function initBugly(options) {
  const log2 = getModuleLogger();
  if (isExplicitlyDisabled()) {
    log2.info(`Bugly 上报已关闭 (${ENV_BUGLY_ENABLED}=false)`);
    reportBeaconEvent(BUGLY_REPORT_EVENTS.INIT_SKIP, {
      mod_id: BUGLY_MOD_ID,
      mod_name: BUGLY_MOD_NAME,
      reason: "explicitly_disabled"
    });
    return;
  }
  const credentials = options.credentials ?? readCredentialsFromEnv();
  if (!credentials) {
    log2.warn(`缺少 Bugly 凭证，跳过初始化（需设置 ${ENV_BUGLY_APP_ID} / ${ENV_BUGLY_APP_KEY}）`);
    reportBeaconEvent(BUGLY_REPORT_EVENTS.INIT_SKIP, {
      mod_id: BUGLY_MOD_ID,
      mod_name: BUGLY_MOD_NAME,
      reason: "missing_credentials"
    });
    return;
  }
  const crashFilePath = options.crashFilePath ?? safeGetCrashDumps();
  try {
    buglyInstance = new Aegis$1({
      id: credentials.id,
      appKey: credentials.appKey,
      buglyType: credentials.buglyType,
      aid: options.aid,
      appVersion: options.appVersion,
      env: options.env,
      minidumpBinDir: options.minidumpBinDir,
      crashFilePath,
      plugin: { ...DEFAULT_PLUGIN_CONFIG },
      // 接入日志系统：将 Bugly SDK 日志输出到项目 logger
      logHandler: (level, message) => {
        if (level === LoggerLevel.ERROR) {
          log2.error(`[Bugly SDK] ${message}`);
        } else if (level === LoggerLevel.INFO) {
          log2.info(`[Bugly SDK] ${message}`);
        } else if (level === LoggerLevel.DEBUG) {
          log2.debug(`[Bugly SDK] ${message}`);
        }
      }
    });
    log2.info(`Bugly 已初始化 id=${credentials.id} type=${credentials.buglyType} env=${options.env} version=${options.appVersion}${options.aid ? ` aid=${options.aid}` : ""}`);
    reportBeaconEvent(BUGLY_REPORT_EVENTS.INIT_SUCCESS, {
      mod_id: BUGLY_MOD_ID,
      mod_name: BUGLY_MOD_NAME,
      bugly_type: credentials.buglyType,
      env: String(options.env)
    });
  } catch (err) {
    log2.error(`Bugly 初始化失败（已吞错，不影响主流程）: ${err.message}`);
    reportBeaconRealtimeEvent(BUGLY_REPORT_EVENTS.INIT_FAILED, {
      mod_id: BUGLY_MOD_ID,
      mod_name: BUGLY_MOD_NAME,
      error: err.message
    });
    buglyInstance = null;
  }
}
function safeGetCrashDumps() {
  try {
    return app.getPath("crashDumps");
  } catch {
    return void 0;
  }
}
function setBuglyAid(aid) {
  const log2 = getModuleLogger();
  const inst = buglyInstance;
  if (!inst || typeof inst.setConfig !== "function") {
    return;
  }
  if (!aid) {
    return;
  }
  try {
    inst.setConfig({ aid });
    log2.info(`Bugly 设备 ID 已更新 aid=${aid}`);
  } catch (err) {
    log2.error(`Bugly setConfig(aid) 失败: ${err.message}`);
  }
}
let registered = false;
function registerCrashTestIpc() {
  const config2 = getConfig();
  if (!config2.debug.allow_trigger_crash) {
    return;
  }
  if (registered) {
    return;
  }
  const log2 = getLogger(BUGLY_LOGGER_SCOPE);
  ipcMain.handle(IPC_CHANNEL_CRASH_TEST_TRIGGER, (_event, rawType) => {
    const type = normalizeCrashType(rawType);
    if (!type) {
      log2.warn(`[crash-test] 收到无效类型: ${String(rawType)}`);
      return { ok: false };
    }
    log2.warn(`[crash-test] 即将触发崩溃/异常: type=${type}`);
    queueMicrotask(() => triggerCrash(type));
    return { ok: true };
  });
  registered = true;
  log2.info("Bugly crash-test IPC 已注册（debug.allow_trigger_crash=true）");
}
function triggerCrash(type) {
  switch (type) {
    case "native":
      process.crash();
      return;
    case "js-uncaught":
      setImmediate(() => {
        throw new Error("[bugly-test] intentional uncaught exception");
      });
      return;
    case "js-unhandled-rejection":
      void Promise.reject(new Error("[bugly-test] intentional unhandled rejection"));
      return;
    default: {
      const exhaustive = type;
      throw new Error(`unknown crash type: ${String(exhaustive)}`);
    }
  }
}
function normalizeCrashType(raw) {
  if (typeof raw !== "string") return null;
  const found = BUGLY_CRASH_TYPES.find((t) => t === raw);
  return found ?? null;
}
const BUILD_DEFAULTS = {
  channelId: "",
  version: "",
  buildTime: "",
  arch: "",
  webVersion: ""
};
class BuildStore {
  store;
  constructor() {
    this.store = new Store({
      name: "marvis-build",
      defaults: BUILD_DEFAULTS
    });
  }
  // ─── 初始化 ──────────────────────────────────────────────
  /**
   * 从 Resources/build.json 初始化 store（仅 store 为空时写入）
   *
   * 每次启动都调用此方法，但仅当 store 中 version 为空字符串（defaults 默认值）时，
   * 才会实际读取 Resources/build.json 并写入 store。
   *
   * 任何错误（文件缺失、JSON 解析失败、写入失败）都只记录日志，不会抛出异常。
   */
  initFromResource() {
    const logger2 = getLogger("build-store");
    try {
      if (this.isInitialized()) {
        logger2.info("build store 已有数据，跳过 resource 初始化");
        return;
      }
      const buildJsonPath = getResourcePath("build.json");
      logger2.info(`首次初始化，从 ${buildJsonPath} 读取 build 元信息`);
      const raw = readFileSync$1(buildJsonPath, "utf-8");
      const data = JSON.parse(raw);
      this.store.store = {
        channelId: data.channelId ?? "",
        version: data.version ?? "",
        buildTime: data.buildTime ?? "",
        arch: data.arch ?? "",
        webVersion: data.webVersion ?? ""
      };
      logger2.info(`build 元信息已持久化: version=${data.version} channelId=${data.channelId}`);
    } catch (err) {
      const logger22 = getLogger("build-store");
      logger22.error(`build 元信息初始化失败（降级使用默认值，不影响启动）: ${err.message}`);
    }
  }
  // ─── 状态检查 ────────────────────────────────────────────
  /**
   * 是否已初始化（store 中已有有效的 build 数据）
   */
  isInitialized() {
    return this.store.get("version") !== "";
  }
  // ─── 读取 ──────────────────────────────────────────────
  /** 获取所有构建元信息 */
  getAll() {
    return this.store.store;
  }
  /** 获取单个构建元信息字段 */
  get(key) {
    return this.store.get(key);
  }
  // ─── 写入 ──────────────────────────────────────────────
  /**
   * 增量更新构建元信息
   *
   * 仅更新传入的字段，未传入的字段保持不变。
   * 用于热更新后更新 webVersion 等场景。
   */
  update(partial) {
    for (const [key, value] of Object.entries(partial)) {
      if (value !== void 0) {
        this.store.set(key, value);
      }
    }
  }
  /** 获取 store 文件路径（调试/日志用） */
  getStorePath() {
    return this.store.path;
  }
}
const logger$5 = getLogger("updater:recovery");
function recoverFromCrash() {
  try {
    let cleaned = false;
    const lockPath = getUpdateLockPath();
    const progressPath = getUpdateProgressPath();
    const stagingDir = getStagingDir();
    const updateJsonPath = getUpdateJsonPath();
    const updateDir = getUpdateDir();
    const pendingSwitchPath = join(updateDir, PENDING_SWITCH_MARKER);
    const pendingReplacePath = join(updateDir, PENDING_REPLACE_MARKER);
    if (existsSync(pendingSwitchPath)) {
      logger$5.info(`recovery: 检测到 ${PENDING_SWITCH_MARKER}，symlink 切换将在启动后执行`);
    }
    if (existsSync(pendingReplacePath)) {
      logger$5.info(`recovery: 检测到 ${PENDING_REPLACE_MARKER}，等待 daemon 执行被动替换（不清理 staging）`);
    }
    if (existsSync(lockPath)) {
      unlinkSync(lockPath);
      logger$5.info("recovery: 清理残留 lock 文件");
      cleaned = true;
    }
    if (existsSync(progressPath)) {
      unlinkSync(progressPath);
      logger$5.info("recovery: 清理残留 progress 文件");
      cleaned = true;
    }
    let configForCleanup = null;
    if (existsSync(updateJsonPath)) {
      try {
        const content = readFileSync$1(updateJsonPath, "utf-8");
        configForCleanup = JSON.parse(content);
      } catch {
        logger$5.warn("recovery: 读取 update.json 失败，跳过 Versions 残留清理");
      }
      if (!existsSync(pendingSwitchPath)) {
        unlinkSync(updateJsonPath);
        logger$5.info("recovery: 清理残留 update.json");
        cleaned = true;
      }
    }
    if (existsSync(stagingDir) && !existsSync(pendingReplacePath)) {
      rmSync(stagingDir, { recursive: true, force: true });
      logger$5.info("recovery: 清理残留 staging 目录");
      cleaned = true;
    }
    if (!existsSync(pendingSwitchPath) && configForCleanup?.updates?.length) {
      for (const item of configForCleanup.updates) {
        const basePath = item.componentDir;
        if (basePath && item.newVersion) {
          const newVersionDir = `${basePath}/Versions/${item.newVersion}`;
          if (existsSync(newVersionDir)) {
            let isCurrent = false;
            try {
              const currentLink = readlinkSync(`${basePath}/Current`);
              isCurrent = currentLink === item.newVersion || currentLink === `Versions/${item.newVersion}`;
            } catch {
            }
            if (!isCurrent) {
              rmSync(newVersionDir, { recursive: true, force: true });
              logger$5.info(`recovery: 清理残留 Versions/${item.newVersion} (${item.name})`);
              cleaned = true;
            } else {
              logger$5.info(`recovery: 跳过 Versions/${item.newVersion} (${item.name})，Current 已指向该版本`);
            }
          }
        }
      }
    }
    const backupDir = join(updateDir, "backup");
    if (!existsSync(pendingReplacePath) && existsSync(backupDir)) {
      logger$5.info("recovery: 检测到残留备份目录（无 pending-replace），写入 needs-restore 标记");
      const needsRestorePath = join(updateDir, "needs-restore");
      try {
        writeFileSync(needsRestorePath, (/* @__PURE__ */ new Date()).toISOString(), "utf-8");
      } catch {
        logger$5.warn("recovery: 写入 needs-restore 标记失败");
      }
      cleaned = true;
    } else if (!existsSync(pendingReplacePath) && !existsSync(backupDir)) {
      const needsRestorePath = join(updateDir, "needs-restore");
      if (existsSync(needsRestorePath)) {
        try {
          unlinkSync(needsRestorePath);
          logger$5.info("recovery: 清理残留 needs-restore 标记（backup 已不存在）");
        } catch {
          logger$5.warn("recovery: 清理 needs-restore 标记失败");
        }
      }
    }
    cleaned = cleanupFlattenTmpResiduals() || cleaned;
    if (!cleaned) {
      logger$5.info("recovery: 无残留文件需清理");
    }
  } catch (err) {
    logger$5.warn(`recovery: 清理异常（非致命）: ${err.message}`);
  }
}
function cleanupFlattenTmpResiduals() {
  let cleaned = false;
  const componentsDir = getComponentsDir();
  if (!existsSync(componentsDir)) {
    return false;
  }
  try {
    const componentEntries = readdirSync$1(componentsDir, { withFileTypes: true });
    for (const componentEntry of componentEntries) {
      if (!componentEntry.isDirectory()) continue;
      const versionsDir = join(componentsDir, componentEntry.name, "Versions");
      if (!existsSync(versionsDir)) continue;
      try {
        const versionEntries = readdirSync$1(versionsDir, { withFileTypes: true });
        for (const versionEntry of versionEntries) {
          if (versionEntry.isDirectory() && versionEntry.name.endsWith("_flatten_tmp")) {
            const tmpPath = join(versionsDir, versionEntry.name);
            try {
              rmSync(tmpPath, { recursive: true, force: true });
              logger$5.info(`recovery: 清理 flatten 残留 ${componentEntry.name}/Versions/${versionEntry.name}`);
              cleaned = true;
            } catch {
              logger$5.warn(`recovery: 清理 flatten 残留 ${versionEntry.name} 失败`);
            }
          }
        }
      } catch {
      }
    }
  } catch {
  }
  return cleaned;
}
const logger$4 = getLogger("updater:pending");
function checkPendingUpdate() {
  try {
    const updateJsonPath = getUpdateJsonPath();
    if (!existsSync(updateJsonPath)) {
      return null;
    }
    const stat2 = statSync$1(updateJsonPath);
    const mtime = stat2.mtimeMs;
    const now = Date.now();
    const expired = now - mtime > PENDING_EXPIRE_DAYS * 24 * 60 * 60 * 1e3;
    if (expired) {
      logger$4.info("pending: update.json 已过期，清理");
      cleanupPending();
      return null;
    }
    let config2 = null;
    try {
      const raw = readFileSync$1(updateJsonPath, "utf-8");
      config2 = JSON.parse(raw);
    } catch (err) {
      logger$4.warn(`pending: 读取 update.json 失败，清理: ${err.message}`);
      cleanupPending();
      return null;
    }
    logger$4.info(`pending: 发现未过期 update.json (mtime=${new Date(mtime).toISOString()})`);
    return { config: config2, mtime, expired: false };
  } catch (err) {
    logger$4.warn(`pending: 检查异常: ${err.message}`);
    return null;
  }
}
function cleanupPending() {
  try {
    const updateJsonPath = getUpdateJsonPath();
    if (existsSync(updateJsonPath)) {
      unlinkSync(updateJsonPath);
      logger$4.info("pending: 已删除 update.json");
    }
  } catch (err) {
    logger$4.warn(`pending: 删除 update.json 失败: ${err.message}`);
  }
  try {
    const downloadsDir = getDownloadsDir();
    if (existsSync(downloadsDir)) {
      rmSync(downloadsDir, { recursive: true, force: true });
      logger$4.info("pending: 已清理 downloads 目录");
    }
  } catch (err) {
    logger$4.warn(`pending: 清理 downloads 目录失败: ${err.message}`);
  }
}
const logger$3 = getLogger("updater:version-sync");
function checkVersionSync() {
  try {
    const buildJson = loadBuildJson();
    const installedJson = loadInstalledJson();
    const componentsDir = getComponentsDir();
    let hasUpdatedComponent = false;
    let updatedVersion = "";
    for (const comp of buildJson.components) {
      const dirName = comp.name;
      const currentLink = join(componentsDir, dirName, "Current");
      let symlinkVersion = null;
      try {
        if (existsSync(currentLink)) {
          const target = readlinkSync(currentLink);
          symlinkVersion = basename(target);
        }
      } catch {
      }
      const installedComp = installedJson?.components?.find((c) => c.name === comp.name);
      const installedVersion = installedComp?.version || comp.version;
      if (symlinkVersion && symlinkVersion !== installedVersion) {
        hasUpdatedComponent = true;
        updatedVersion = symlinkVersion;
      }
    }
    if (hasUpdatedComponent) {
      logger$3.info(`versionSync: 检测到更新后首启，新版本 ${updatedVersion}`);
      return {
        isNewVersion: true,
        success: true,
        newVersion: updatedVersion
      };
    }
    return { isNewVersion: false, success: true };
  } catch (err) {
    logger$3.warn(`versionSync: 检查异常: ${err.message}`);
    return { isNewVersion: false, success: false, errorMessage: err.message };
  }
}
const logger$2 = getLogger("updater:cleanup");
const EXPIRE_DAYS = 3;
async function runCleanup() {
  await new Promise((r) => setTimeout(r, CLEANUP_DELAY_MS));
  try {
    logger$2.info("cleanup: 开始后台清理");
    cleanupExpiredDownloads();
    logger$2.info("cleanup: 后台清理完成");
  } catch (err) {
    logger$2.warn(`cleanup: 清理异常（非致命）: ${err.message}`);
  }
}
function cleanupExpiredDownloads() {
  try {
    const downloadsDir = getDownloadsDir();
    if (!existsSync(downloadsDir)) return;
    const now = Date.now();
    const expireMs = EXPIRE_DAYS * 24 * 60 * 60 * 1e3;
    const entries2 = readdirSync$1(downloadsDir, { withFileTypes: true });
    for (const entry of entries2) {
      if (!entry.isDirectory()) continue;
      const dirPath = join(downloadsDir, entry.name);
      try {
        const stat2 = statSync$1(dirPath);
        if (now - stat2.mtimeMs > expireMs) {
          rmSync(dirPath, { recursive: true, force: true });
          logger$2.info(`cleanup: 已清理过期下载目录 ${entry.name}`);
        }
      } catch (err) {
        logger$2.warn(`cleanup: 清理目录 ${entry.name} 失败: ${err.message}`);
      }
    }
  } catch (err) {
    logger$2.warn(`cleanup: 扫描 downloads 目录失败: ${err.message}`);
  }
}
const logger$1 = getLogger("updater:deferred-apply");
let initialized = false;
function initDeferredApply() {
  if (initialized) return;
  initialized = true;
  app.on("before-quit", () => {
    return;
  });
  logger$1.info("deferred-apply 已初始化");
}
const UPDATER_MOD_ID = "updater";
const UPDATER_MOD_NAME = "自动更新";
const UPDATER_REPORT_EVENTS = {
  /** 更新检查开始 */
  CHECK_START: "updater__check_start",
  /** 更新检查完成（含结果） */
  CHECK_RESULT: "updater__check_result",
  /** 更新检查失败（严重错误，实时上报） */
  CHECK_FAILED: "updater__check_failed",
  /** 组件下载开始 */
  DOWNLOAD_START: "updater__download_start",
  /** 组件下载完成 */
  DOWNLOAD_COMPLETE: "updater__download_complete",
  /** 组件下载失败（严重错误，实时上报） */
  DOWNLOAD_FAILED: "updater__download_failed",
  /** Bootstrap 组件切换成功 */
  BOOTSTRAP_SUCCESS: "updater__bootstrap_success",
  /** Bootstrap 组件切换失败（严重错误，实时上报） */
  BOOTSTRAP_FAILED: "updater__bootstrap_failed",
  /** 崩溃恢复执行 */
  RECOVERY_EXECUTED: "updater__recovery_executed",
  /** 崩溃恢复失败（严重错误，实时上报） */
  RECOVERY_FAILED: "updater__recovery_failed"
};
const logger = getLogger("updater:bootstrap");
async function discoverOrphanComponents(componentsDir, buildJsonComponentNames, existingExternalNames) {
  if (!existsSync(componentsDir)) {
    return [];
  }
  let entries2;
  try {
    entries2 = await readdir(componentsDir);
  } catch (err) {
    logger.warn(`bootstrap: 扫描 components/ 目录失败（忽略孤儿补偿）: ${err.message}`);
    return [];
  }
  const buildJsonSet = new Set(buildJsonComponentNames);
  const managedByName = new Map(MANAGED_COMPONENTS.map((m) => [m.name, m]));
  const orphans = [];
  for (const entry of entries2) {
    if (entry.startsWith(".")) continue;
    if (buildJsonSet.has(entry)) continue;
    if (existingExternalNames.has(entry)) continue;
    const managed = managedByName.get(entry);
    if (!managed) {
      logger.debug(`bootstrap: 跳过未知组件目录 ${entry}（不在 MANAGED_COMPONENTS 白名单）`);
      continue;
    }
    const componentDir = join(componentsDir, entry);
    const currentLink = join(componentDir, "Current");
    let version;
    try {
      const target = await readlink(currentLink);
      version = basename(target);
    } catch (err) {
      logger.debug(`bootstrap: ${entry}/Current 非 symlink 或读取失败，跳过: ${err.message}`);
      continue;
    }
    if (!version || version === "0.0.0") {
      logger.debug(`bootstrap: ${entry}/Current symlink 版本号无效 (${version})，跳过`);
      continue;
    }
    const versionDir = join(componentDir, "Versions", version);
    if (!existsSync(versionDir)) {
      logger.warn(`bootstrap: ${entry}/Current → ${version}，但 Versions/${version} 目录不存在，跳过（交给更新流程自愈）`);
      continue;
    }
    orphans.push({
      name: managed.name,
      componentType: String(managed.type),
      version,
      source: "update"
    });
  }
  return orphans;
}
function versionLessThan(a, b) {
  const parse2 = (s) => s.split(".").map((p) => parseInt(p, 10) || 0);
  const va = parse2(a);
  const vb = parse2(b);
  const maxLen = Math.max(va.length, vb.length);
  for (let i = 0; i < maxLen; i++) {
    const sa = va[i] ?? 0;
    const sb = vb[i] ?? 0;
    if (sa < sb) return true;
    if (sa > sb) return false;
  }
  return false;
}
function componentDirName(name) {
  return name;
}
async function bootstrapComponents() {
  try {
    await applyPendingSwitches();
    const count = await runBootstrap();
    if (count > 0) {
      logger.info(`bootstrap: 完成，${count} 个组件已初始化`);
      reportBeaconEvent(UPDATER_REPORT_EVENTS.BOOTSTRAP_SUCCESS, {
        mod_id: UPDATER_MOD_ID,
        mod_name: UPDATER_MOD_NAME,
        component_count: String(count)
      });
    } else {
      logger.info("bootstrap: 无组件需要初始化");
    }
  } catch (err) {
    logger.warn(`bootstrap: 失败（非致命）: ${err.message}`);
    reportBeaconRealtimeEvent(UPDATER_REPORT_EVENTS.BOOTSTRAP_FAILED, {
      mod_id: UPDATER_MOD_ID,
      mod_name: UPDATER_MOD_NAME,
      error_msg: err.message ?? ""
    });
  }
}
async function runBootstrap() {
  logger.info("bootstrap: 开始初始化");
  const buildJson = loadBuildJson();
  logger.info(`bootstrap: build.json version=${buildJson.version}, ${buildJson.components.length} 个组件`);
  const installedJson = loadInstalledJson();
  if (installedJson) {
    logger.info(`bootstrap: installed.json version=${installedJson.appVersion}, ${installedJson.components.length} 个组件`);
  } else {
    logger.info("bootstrap: installed.json 不存在（首次启动）");
  }
  const componentsDir = getComponentsDir();
  await asyncMkdirp(componentsDir);
  const hasComponentSeeds = existsSync(getResourcePath("component-seeds"));
  if (!hasComponentSeeds) {
    logger.info("bootstrap: 未检测到 component-seeds 目录，判定为主框架更新，跳过子组件初始化");
  }
  const newInstalledComponents = new Array(buildJson.components.length);
  const bootstrapFlags = await Promise.all(buildJson.components.map(async (comp, idx) => {
    const isMainApp = comp.name === "Marvis";
    if (isMainApp) {
      const installedComp = installedJson?.components?.find((c) => c.name === comp.name);
      const source = (() => {
        if (!hasComponentSeeds) return "update";
        return installedComp && installedComp.version !== comp.version ? "update" : "seed";
      })();
      logger.info(`bootstrap: ${comp.name} 是主框架，记录版本 ${comp.version}（source=${source}）`);
      newInstalledComponents[idx] = {
        name: comp.name,
        componentType: comp.componentType,
        version: comp.version,
        source
      };
      return false;
    }
    if (!hasComponentSeeds) {
      const old = installedJson?.components?.find((c) => c.name === comp.name);
      if (old) {
        logger.info(`bootstrap: ${comp.name} 主框架更新，保留已安装版本 ${old.version}`);
        newInstalledComponents[idx] = { ...old };
      } else {
        logger.info(`bootstrap: ${comp.name} 主框架更新，无已安装记录，跳过`);
      }
      return false;
    }
    const installedVersion = installedJson?.components?.find((c) => c.name === comp.name)?.version;
    const needsBootstrap = !installedVersion || installedVersion === "0.0.0" || versionLessThan(installedVersion, comp.version);
    if (needsBootstrap) {
      logger.info(`bootstrap: ${comp.name} 需要初始化 (${installedVersion ?? "未安装"} → ${comp.version})`);
      try {
        await bootstrapComponent(comp, componentsDir);
        newInstalledComponents[idx] = {
          name: comp.name,
          componentType: comp.componentType,
          version: comp.version,
          source: "seed"
        };
        return true;
      } catch (err) {
        logger.warn(`bootstrap: ${comp.name} 初始化失败（非致命）: ${err.message}`);
        const old = installedJson?.components?.find((c) => c.name === comp.name);
        if (old) {
          newInstalledComponents[idx] = { ...old };
        }
        return false;
      }
    } else {
      logger.info(`bootstrap: ${comp.name} 无需初始化（已安装 ${installedVersion} >= 种子 ${comp.version}）`);
      const old = installedJson?.components?.find((c) => c.name === comp.name);
      if (old) {
        newInstalledComponents[idx] = { ...old };
      }
      return false;
    }
  }));
  const bootstrappedCount = bootstrapFlags.filter(Boolean).length;
  let pendingVersionMarker = null;
  const pendingVersionPath = join(getUpdateDir(), PENDING_VERSION_MARKER);
  const pendingReplacePath = join(getUpdateDir(), PENDING_REPLACE_MARKER);
  if (await asyncExists(pendingVersionPath)) {
    if (await asyncExists(pendingReplacePath)) {
      logger.info(`bootstrap: pending-replace 标记存在，跳过 ${PENDING_VERSION_MARKER}（主框架尚未替换，不提前更新大版本号）`);
    } else {
      try {
        pendingVersionMarker = await asyncReadJson(pendingVersionPath);
        logger.info(`bootstrap: 检测到 ${PENDING_VERSION_MARKER} (aggregatedVersion=${pendingVersionMarker?.aggregatedVersion})`);
      } catch {
        logger.warn(`bootstrap: 读取 ${PENDING_VERSION_MARKER} 失败，忽略`);
      }
    }
  }
  const existingAppVersion = installedJson?.appVersion ?? "";
  const mainAppComponentChanged = (() => {
    const installedMarvis = installedJson?.components?.find((c) => c.name === "Marvis");
    const buildMarvis = buildJson.components.find((c) => c.name === "Marvis");
    return installedMarvis && buildMarvis && installedMarvis.version !== buildMarvis.version;
  })();
  const appVersion = pendingVersionMarker?.aggregatedVersion ?? (mainAppComponentChanged && hasComponentSeeds ? buildJson.version : existingAppVersion || (hasComponentSeeds ? buildJson.version : ""));
  const appVersionChanged = appVersion !== existingAppVersion;
  const existingExternal = (installedJson?.components ?? []).filter((c) => !buildJson.components.some((b) => b.name === c.name));
  const existingExternalNames = new Set(existingExternal.map((c) => c.name));
  const orphanComponents = await discoverOrphanComponents(
    componentsDir,
    buildJson.components.map((c) => c.name),
    existingExternalNames
  );
  const needsWrite = bootstrappedCount > 0 || !installedJson || appVersionChanged || mainAppComponentChanged || !!pendingVersionMarker || orphanComponents.length > 0;
  if (needsWrite) {
    const bootstrappedComponents = newInstalledComponents.filter((c) => c !== void 0);
    const mergedComponents = [...bootstrappedComponents, ...existingExternal, ...orphanComponents];
    if (existingExternal.length > 0) {
      const list = existingExternal.map((c) => `${c.name}@${c.version}`).join(", ");
      logger.info(`bootstrap: 保留 build.json 外已安装组件 ${existingExternal.length} 个: ${list}`);
    }
    if (orphanComponents.length > 0) {
      const list = orphanComponents.map((c) => `${c.name}@${c.version}`).join(", ");
      logger.info(`bootstrap: 孤儿组件补偿 ${orphanComponents.length} 个（磁盘有安装但 installed.json 缺失）: ${list}`);
    }
    const newInstalled = {
      appVersion,
      components: mergedComponents,
      updatedAt: Date.now(),
      lastPolicyId: pendingVersionMarker?.policyId ?? installedJson?.lastPolicyId
    };
    const installedJsonPath = getInstalledJsonPath();
    await asyncWriteJsonAtomic(installedJsonPath, newInstalled);
    logger.info(`bootstrap: installed.json 已更新 (appVersion=${appVersion}, ${mergedComponents.length} 个组件)`);
  } else {
    logger.info("bootstrap: 无组件需要初始化，跳过 installed.json 写入");
  }
  if (pendingVersionMarker) {
    try {
      await asyncRemoveDir(pendingVersionPath);
      logger.info(`bootstrap: ${PENDING_VERSION_MARKER} 已清理`);
    } catch {
      logger.warn(`bootstrap: 清理 ${PENDING_VERSION_MARKER} 失败`);
    }
  }
  return bootstrappedCount;
}
async function applyPendingSwitches() {
  const pendingSwitchPath = join(getUpdateDir(), PENDING_SWITCH_MARKER);
  if (!await asyncExists(pendingSwitchPath)) {
    return;
  }
  const pendingReplacePath = join(getUpdateDir(), PENDING_REPLACE_MARKER);
  if (await asyncExists(pendingReplacePath)) {
    logger.info("bootstrap: pending-replace 标记存在，主框架尚未替换完成，跳过 symlink 切换（避免版本不一致）");
    return;
  }
  logger.info("bootstrap: 检测到待处理的 pending symlink 切换");
  try {
    const marker = await asyncReadJson(pendingSwitchPath);
    if (!marker?.components?.length) {
      logger.warn("bootstrap: pending-switch 标记文件为空或格式错误，清理并跳过");
      await asyncRemoveDir(pendingSwitchPath);
      return;
    }
    const items = marker.components.map((comp) => ({
      name: comp.name,
      oldVersion: comp.oldVersion,
      newVersion: comp.newVersion,
      archivePath: "",
      sha256: "",
      isMainApp: false,
      componentDir: comp.componentDir,
      componentType: comp.componentType
    }));
    await asyncSwitchAllSymlinks(items);
    logger.info("bootstrap: pending symlink 切换完成");
    await asyncUpdateInstalledJson(items, {
      aggregatedVersion: marker.aggregatedVersion,
      policyId: marker.policyId
    });
    await asyncCleanupOldVersions(items);
    await asyncRemoveDir(pendingSwitchPath);
    logger.info("bootstrap: pending-switch 标记文件已清理");
    const updateJsonPath = getUpdateJsonPath();
    if (await asyncExists(updateJsonPath)) {
      await asyncRemoveDir(updateJsonPath);
      logger.info("bootstrap: update.json 已清理");
    }
  } catch (err) {
    logger.error(`bootstrap: pending symlink 切换失败: ${err.message}`);
    try {
      await asyncRemoveDir(pendingSwitchPath);
    } catch {
    }
  }
}
async function bootstrapComponent(comp, componentsDir) {
  if (!comp.seedZip) {
    logger.info(`bootstrap: ${comp.name} 无 seedZip，跳过解压`);
    return;
  }
  const seedPath = join(getResourcePath(), comp.seedZip);
  if (!existsSync(seedPath)) {
    throw new Error(`种子包不存在: ${seedPath}`);
  }
  const dirName = componentDirName(comp.name);
  const componentDir = join(componentsDir, dirName);
  const versionDir = join(componentDir, "Versions", comp.version);
  if (await asyncExists(versionDir)) {
    await asyncRemoveDir(versionDir);
  }
  await asyncMkdirp(versionDir);
  logger.info(`bootstrap: 解压 ${seedPath} → ${versionDir}`);
  await asyncExtractArchive(seedPath, versionDir);
  const currentLink = join(componentDir, "Current");
  const target = `Versions/${comp.version}`;
  await asyncAtomicSymlink(currentLink, target);
  logger.info(`bootstrap: ${comp.name} Current → ${target} 已创建`);
}
const MIN_MACOS_VERSION = "13.0.0";
const OS_UNSUPPORTED_PARAM = "os_unsupported";
function checkMacOsCompat() {
  if (process.platform !== "darwin") {
    return {
      supported: true,
      currentVersion: "",
      minVersion: MIN_MACOS_VERSION
    };
  }
  const rawVersion = process.getSystemVersion();
  const parsed = coerce(rawVersion);
  if (!parsed) {
    return {
      supported: true,
      currentVersion: rawVersion || "",
      minVersion: MIN_MACOS_VERSION
    };
  }
  const supported = !lt(parsed, MIN_MACOS_VERSION);
  return {
    supported,
    currentVersion: parsed.version,
    minVersion: MIN_MACOS_VERSION
  };
}
async function delayIfNeeded(ms, label) {
  if (ms <= 0) return;
  const logger2 = getLogger("main");
  logger2.info(`[startup-delay] ${label}: 延迟 ${ms}ms`);
  await new Promise((resolve2) => setTimeout(resolve2, ms));
}
bootstrapAppIdentity();
const gotLock = requestSingleInstanceLock();
if (!gotLock) {
  process.exit(0);
}
app.whenReady().then(async () => {
  reportLaunchPhase(EVENT_LAUNCH_APP_READY);
  if (process.platform === "darwin") {
    nativeTheme.themeSource = "light";
  }
  ApplicationHandler.setBootTime(Date.now());
  const config2 = loadConfig();
  reportLaunchPhase(EVENT_LAUNCH_LOAD_CONFIG);
  const delays = config2.startup_delays;
  setAppMetadata();
  initLogger(config2.log);
  const logger2 = getLogger("main");
  logger2.info("Marvis 应用启动中...");
  reportLaunchPhase(EVENT_LAUNCH_INIT_LOGGER);
  try {
    const homeDir = initHomeDir();
    logger2.info(`[main] home_dir 已就绪: ${homeDir}`);
  } catch (err) {
    logger2.error(`[main] initHomeDir 异常（非致命）: ${err.message}`);
  }
  try {
    recoverFromCrash();
  } catch (err) {
    logger2.warn(`updater recovery 异常（非致命）: ${err.message}`);
  }
  if (isLaunchedHidden()) {
    logger2.info("检测到 --hidden 参数，开机自启静默模式（窗口不显示，驻留托盘）");
  }
  trace("evt:ready", `pid=${process.pid} cwd=${process.cwd()} hidden=${isLaunchedHidden()}`);
  const buildStore = new BuildStore();
  buildStore.initFromResource();
  {
    const launchSettings = new SettingsStore();
    let launchType2 = "normal";
    if (launchSettings.isFirstLaunch()) {
      launchType2 = "first_install";
    } else {
      try {
        const syncResult = checkVersionSync();
        if (syncResult.isNewVersion) {
          launchType2 = "post_update";
        }
      } catch {
      }
    }
    setLaunchType(launchType2);
    logger2.info(`启动场景判定: launch_type=${launchType2}`);
  }
  logLoginEnv();
  const galileoToken = process.env.MARVIS_GALILEO_TOKEN;
  if (galileoToken) {
    const rawEnv = process.env.MARVIS_GALILEO_ENV;
    let galileoEnv;
    if (rawEnv === "production" || rawEnv === "development") {
      galileoEnv = rawEnv;
    } else {
      galileoEnv = app.isPackaged ? "production" : "development";
    }
    const rawMinLevel = process.env.MARVIS_GALILEO_MIN_LEVEL;
    const galileoMinLevel = rawMinLevel === "debug" || rawMinLevel === "info" || rawMinLevel === "warn" || rawMinLevel === "error" ? rawMinLevel : "info";
    const galileoChannelId = process.env.MARVIS_CHANNEL_ID || (() => {
      try {
        return loadBuildJson().channelId;
      } catch {
        return "";
      }
    })() || "";
    try {
      initGalileoReporter({
        token: galileoToken,
        env: galileoEnv,
        version: app.getVersion(),
        deviceId: "",
        // 先空，QimeiSDK 就绪后通过 setConfig 补设
        minLevel: galileoMinLevel,
        channelId: galileoChannelId
      });
      startConfigPolling(app.getPath("userData"));
      logger2.info(
        `[galileo] 初始化完成 — env=${galileoEnv} baseLevel=${galileoMinLevel} channel=${galileoChannelId || "(empty)"} configPoll=started(10min)`
      );
    } catch (err) {
      logger2.warn(`[galileo] 伽利略上报 SDK 初始化失败（非致命）: ${err.message}`);
    }
  } else {
    logger2.info("[galileo] MARVIS_GALILEO_TOKEN 未配置，跳过伽利略上报初始化");
  }
  try {
    initQimei(config2.qimei);
  } catch (err) {
    logger2.warn(`QimeiSDK 初始化失败（非致命）: ${err.message}`);
  }
  try {
    initBeacon();
    setBeaconCommonParams({
      biz_id: "main_process",
      call_type: "main"
    });
    reportBeaconEvent("app_launch", {});
    reportLaunchPhase(EVENT_LAUNCH_BEACON_INIT);
    const fromArg = (() => {
      const idx = process.argv.indexOf("--from");
      return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : "";
    })();
    reportBeaconEvent(EVENT_CLIENT_START, { source_from: fromArg });
  } catch (err) {
    logger2.warn(`BeaconSDK 初始化失败（非致命）: ${err.message}`);
  }
  logDeviceGuid().catch((err) => {
    logger2.warn(`logDeviceGuid 异常（非致命）: ${err.message}`);
  });
  app.on("web-contents-created", (_e, wc) => {
    const wcId = wc.id;
    const type = wc.getType();
    logger2.info(`[lifecycle] web-contents-created: wc=${wcId} type=${type}`);
    trace("evt:wc-created", `wc=${wcId} type=${type}`);
    wc.on("render-process-gone", (_evt, details) => {
      const info = `wc=${wcId} reason=${details.reason} exitCode=${details.exitCode}`;
      logger2.error(`[lifecycle] render-process-gone: ${info}`);
      traceFatal("evt:render-gone", info);
    });
    wc.on("unresponsive", () => {
      logger2.warn(`[lifecycle] wc unresponsive: wc=${wcId}`);
      trace("evt:wc-unresponsive", `wc=${wcId}`);
    });
    wc.on("responsive", () => {
      logger2.info(`[lifecycle] wc responsive: wc=${wcId}`);
      trace("evt:wc-responsive", `wc=${wcId}`);
    });
  });
  app.on("child-process-gone", (_e, details) => {
    const info = `type=${details.type} reason=${details.reason} exitCode=${details.exitCode} name=${details.name ?? ""}`;
    logger2.error(`[lifecycle] child-process-gone: ${info}`);
    traceFatal("evt:child-gone", info);
  });
  const mainWindow2 = createMainWindow();
  reportLaunchPhase(EVENT_LAUNCH_MAIN_WINDOW_CONSTRUCTOR);
  try {
    await bootstrap$1();
  } catch (err) {
    logger2.error("[offline-pack] bootstrap.uncaught", err);
  }
  registerDomainInterceptor(config2.domain_mapping);
  registerLocalGatewayCorsProxy();
  let initialAid;
  try {
    const { q36 } = getQimei();
    if (q36) {
      initialAid = q36;
      logger2.info(`[bugly] 初始化时同步获取到 qimei q36: ${q36}`);
    }
  } catch (err) {
    logger2.warn(`[bugly] 初始化时读取 qimei 失败（非致命）: ${err.message}`);
  }
  initBugly({
    appVersion: app.getVersion(),
    env: app.isPackaged ? "production" : "debug",
    aid: initialAid
  });
  registerCrashTestIpc();
  const webappUrl = (config2.dev_redirect?.webapp_url ?? "").trim();
  let launchURL;
  const settingsStore = new SettingsStore();
  const osCompat = checkMacOsCompat();
  if (webappUrl) {
    launchURL = webappUrl;
    logger2.warn(`[dev_redirect] 开发重定向已启用：loadURL=${webappUrl}（绕过 interceptor，请确认目标服务已启动）`);
  } else {
    const baseURL = `https://${DEFAULT_DOMAIN_MAIN}/`;
    const flags = [];
    if (!osCompat.supported) flags.push(`${OS_UNSUPPORTED_PARAM}=1`);
    if (settingsStore.isFirstLaunch()) flags.push("first_launch=1");
    try {
      if (willBootstrapUpgrade()) flags.push("bootstrap_upgraded=1");
    } catch (err) {
      logger2.warn(`willBootstrapUpgrade 预判异常（忽略）: ${err.message}`);
    }
    launchURL = flags.length > 0 ? `${baseURL}?${flags.join("&")}` : baseURL;
    if (flags.length > 0) {
      logger2.info(`[launch-url] 启动场景标记: ${flags.join(", ")}`);
    }
  }
  mainWindow2.loadURL(launchURL);
  reportLaunchPhase(EVENT_LAUNCH_LOAD_PAGE);
  mainWindow2.webContents.on("did-finish-load", () => {
    reportLaunchPhase(EVENT_LAUNCH_PAGE_LOADED);
    reportLaunchTotal();
  });
  startTotalReportTimer();
  registerIpcChannels();
  const loginLoadPromise = loadFromDisk();
  void loginLoadPromise.then(() => {
    start$2({
      getMainUserInfo: () => getUserInfo$1().main,
      patchUserInfo: (patch, eventName) => patchUserInfo("main", patch, eventName),
      logout: (reason) => logout(reason)
    });
    logger2.info("登录态后端校验定时器已启动");
    onEvent((ev) => {
      if (ev.eventName === "login" || ev.eventName === "updateUserInfo") {
        const openId = ev.userInfo.main?.openId ?? "";
        if (openId) {
          logger2.info(`[galileo] 登录事件 openId=${openId}（uid 保持为设备 guid 不变）`);
        }
      } else if (ev.eventName === "logout") {
        logger2.info("[galileo] 登出事件（uid 保持为设备 guid 不变）");
      }
    });
  }).catch((err) => {
    logger2.warn(`加载登录态失败（视为未登录）: ${err.message}`);
  });
  let galileoReadyTriggered = false;
  const applyGuidToGalileo = (guid) => {
    if (!guid) return;
    setGalileoUid(guid);
    if (!galileoReadyTriggered) {
      galileoReadyTriggered = true;
      readyGalileoReporter();
      logger2.info(`[galileo] uid 已绑定设备 guid=${guid}，触发缓冲日志补发`);
    }
    refreshGalileoConfig();
  };
  try {
    const { q36 } = getQimei();
    if (q36) {
      setBuglyAid(q36);
      applyGuidToGalileo(q36);
    }
  } catch {
  }
  try {
    onQimei36Changed((q36) => {
      setBuglyAid(q36);
      applyGuidToGalileo(q36);
    });
  } catch {
  }
  getDeviceGuid().then((guid) => applyGuidToGalileo(guid)).catch((err) => {
    logger2.warn(`[galileo] 获取设备 guid 失败（非致命）: ${err.message}`);
  });
  initJsBridge(buildStore);
  if (!osCompat.supported) {
    logger2.warn(`[os-compat] 系统版本不满足要求: current=${osCompat.currentVersion} min=${osCompat.minVersion}，跳过后续业务初始化`);
    trace("os-compat:unsupported", `current=${osCompat.currentVersion} min=${osCompat.minVersion}`);
    createTray();
    openDevToolsIfEnabled(config2.devtools);
    logger2.info("[os-compat] 最小化启动分支完成");
    return;
  }
  void (async () => {
    try {
      const llmRootDir = `${app.getPath("userData")}/llm-sdk`;
      await initLocalLlm({
        create: {
          workDir: llmRootDir,
          cacheDir: `${llmRootDir}/cache`,
          serviceBinPath: getResourcePath("bin", "llm_service"),
          logLevel: "debug",
          appVersion: app.getVersion()
        },
        subscribeEvents: Object.values(LLM_EVENT_NAMES),
        autoInitialize: true
      });
      logger2.info("[local-llm] SDK 已初始化（方案 E：异步 initialize 完成）");
    } catch (err) {
      logger2.warn(`[local-llm] SDK 初始化失败（非致命）: ${err.message}`);
    }
    try {
      ensureLocalReady("app-startup");
    } catch (err) {
      logger2.warn(`[local-llm-orch] 启动续推异常（非致命）: ${err.message}`);
    }
  })();
  markSubprocessSpawn("daemon");
  void startDaemon().then(() => markSubprocessReady("daemon", "ready")).catch((err) => markSubprocessReady("daemon", "error", err.message));
  const bootstrapPromise = (async () => {
    await delayIfNeeded(delays.bootstrap_ms, "bootstrapComponents");
    await bootstrapComponents().catch((err) => {
      logger2.warn(`bootstrap 异常（非致命）: ${err.message}`);
    });
  })();
  setGatewayClientVersion(app.getVersion());
  const sweepPromise = sweepPreviousSessionOrphans(["MarvisHost", "MarvisAgent", "MarvisKnowledgebase"]).catch((err) => {
    logger2.warn(`上次会话孤儿扫荡异常（忽略，继续启动）: ${err.message}`);
    return [];
  });
  void Promise.all([bootstrapPromise, sweepPromise]).then(async ([, killedPids]) => {
    if (killedPids.length > 0) {
      logger2.warn(`上次会话遗留子进程已清理：${killedPids.join(",")}`);
    }
    await delayIfNeeded(delays.gateway_ms, "startGateway");
    return startGateway();
  }).then(({ port, gatewayVersion }) => {
    logger2.info(`网关已就绪: port=${port} gateway_version=${gatewayVersion}`);
    try {
      startDocPreviewNotifier();
      notifyIfReady();
    } catch (err) {
      logger2.warn(`DocPreview notifier 启动/通知异常（非致命）: ${err.message}`);
    }
  }).catch((err) => {
    logger2.error(`网关启动失败: ${err.message}`);
  });
  const desiredWorkMode = settingsStore.getWorkMode();
  void Promise.all([bootstrapPromise, sweepPromise, loginLoadPromise.catch(() => void 0)]).then(async () => {
    await delayIfNeeded(delays.agent_ms, "startAgent");
    if (desiredWorkMode !== WorkMode.Local) {
      return startAgent();
    }
    let installStatus = -1;
    try {
      const installObj = JSON.parse(getInstallState());
      installStatus = Number(installObj.status);
    } catch {
    }
    const localReady = isLocalLlmReady() && isServiceReady();
    if (localReady) {
      settingsStore.setEffectiveWorkMode(WorkMode.Local);
      let port = 0;
      try {
        const svcState = JSON.parse(getServiceState());
        const p = Number(svcState.service_port);
        if (Number.isFinite(p) && p > 0 && p <= 65535) port = p;
      } catch {
      }
      logger2.info(`[cold-start] 路径2: 模型已就绪，以 local 模式启动 Agent (port=${port})`);
      return startAgent({ workMode: "local", localLlmPort: port > 0 ? port : void 0 });
    }
    if (installStatus === INSTALL_STATUS.InstallCompleted) {
      settingsStore.setEffectiveWorkMode(WorkMode.Local);
      logger2.info("[cold-start] 路径3: 模型已安装但服务未就绪，跳过 Agent 启动，等待 orchestrator 推进");
      return void 0;
    }
    settingsStore.setEffectiveWorkMode(WorkMode.Hybrid);
    logger2.info(`[cold-start] 路径4: 模型未安装（installStatus=${installStatus}），以 cloud 兼容模式先启动 Agent`);
    return startAgent({ workMode: "cloud" });
  }).then((result) => {
    if (!result) {
      markSubprocessReady("agent", "skipped", "waiting_for_orchestrator");
      return;
    }
    logger2.info(`AgentCore 已就绪: port=${result.port} user_id=${result.userId || "(default)"} workMode=${result.workMode}`);
  }).catch((err) => {
    logger2.error(`AgentCore 启动失败: ${err.message}`);
  });
  onRealGuidResolved((guid) => {
    try {
      refreshDaemonGuid(guid);
    } catch (err) {
      logger2.warn(`refreshDaemonGuid 异常: ${err.message}`);
    }
  });
  onTextMessage((content) => {
    handleTextMessage(content).catch((err) => {
      logger2.error(`日志收集处理失败: ${err.message}`);
    });
  });
  if (isKbEnabled()) {
    void Promise.all([bootstrapPromise, sweepPromise]).then(async () => {
      await delayIfNeeded(delays.knowledgebase_ms, "startKb");
      return startKb();
    }).then((result) => {
      logger2.info(`Knowledgebase 已就绪: port=${result.port}`);
    }).catch((err) => {
      logger2.warn(`Knowledgebase 启动失败（非致命，已关闭知识库特性）: ${err.message}`);
    });
  } else {
    logger2.info("Knowledgebase 已被显式关闭（MARVIS_KB_ENABLED=false），跳过");
    markSubprocessReady("kb", "skipped", "MARVIS_KB_ENABLED=false");
  }
  if (process.platform === "darwin") {
    startAppInfoCollection().catch((err) => {
      logger2.warn(`[app-info-collection] 启动失败（非致命）: ${err.message}`);
    });
  }
  void startBrowserAutomationServer().catch((err) => {
    logger2.error(`browser-automation 启动失败（非致命）: ${err.message}`);
  });
  void startCrawlServer().catch((err) => {
    logger2.error(`crawl 启动失败（非致命）: ${err.message}`);
  });
  createTray();
  try {
    const syncResult = checkVersionSync();
    if (syncResult.isNewVersion) {
      logger2.info(`[updater] 版本同步: 更新${syncResult.success ? "成功" : "失败"} ${syncResult.newVersion ?? ""}`);
    }
  } catch (err) {
    logger2.warn(`[updater] 版本同步异常（非致命）: ${err.message}`);
  }
  try {
    const pendingState = checkPendingUpdate();
    if (pendingState?.config) {
      logger2.info(`[updater] 发现 pending 更新 (expired=${pendingState.expired})`);
    }
  } catch (err) {
    logger2.warn(`[updater] pending 检查异常（非致命）: ${err.message}`);
  }
  initDeferredApply();
  startAutoCheck(buildStore, bootstrapPromise);
  void runCleanup().catch((err) => {
    logger2.warn(`[updater] 后台清理异常（非致命）: ${err.message}`);
  });
  openDevToolsIfEnabled(config2.devtools);
  powerMonitor.on("suspend", () => {
    logger2.info("[lifecycle] 系统挂起");
    onForegroundSuspend();
  });
  powerMonitor.on("resume", () => {
    logger2.info("[lifecycle] 系统恢复");
    onForegroundResume();
    setTimeout(() => {
      ensureLocalReady("system-resume");
    }, NETWORK_SETTLE_AFTER_RESUME_MS);
  });
  logger2.info("Marvis 应用启动完成");
});
app.on("activate", () => {
  showMainWindow();
});
app.on("will-quit", (event) => {
  const { defaultPrevented } = event;
  try {
    getLogger("main").info(`[lifecycle] will-quit (defaultPrevented=${defaultPrevented})`);
  } catch {
  }
  trace("evt:will-quit", `defaultPrevented=${defaultPrevented}`);
});
app.on("quit", (_e, exitCode) => {
  try {
    getLogger("main").info(`[lifecycle] quit: exitCode=${exitCode}`);
  } catch {
  }
  trace("evt:quit", `exitCode=${exitCode}`);
});
const CLEANUP_FORCE_EXIT_MS = 8e3;
const KB_STOP_TIMEOUT_MS = 1500;
const AGENT_STOP_TIMEOUT_MS = 3e3;
const GATEWAY_STOP_TIMEOUT_MS = 3e3;
let quitHandled = false;
app.on("before-quit", (event) => {
  if (quitHandled) return;
  quitHandled = true;
  event.preventDefault();
  const logger2 = getLogger("main");
  logger2.info(`应用退出前清理... (stack: ${new Error("before-quit-trace").stack})`);
  trace("evt:before-quit", "entering cleanup");
  try {
    app.dock?.hide();
  } catch (err) {
    logger2.warn(`app.dock.hide 异常: ${err.message}`);
  }
  try {
    destroyMainWindow();
  } catch (err) {
    logger2.warn(`destroyMainWindow 异常（视觉退出阶段）: ${err.message}`);
  }
  const forceExitTimer = setTimeout(() => {
    try {
      logger2.error(`[lifecycle] 清理超时 ${CLEANUP_FORCE_EXIT_MS}ms，强制退出`);
    } catch {
    }
    traceFatal("cleanup-timeout", `${CLEANUP_FORCE_EXIT_MS}ms`);
    try {
      bestEffortKillGateway("cleanup-timeout");
    } catch {
    }
    process.exit(0);
  }, CLEANUP_FORCE_EXIT_MS);
  forceExitTimer.unref();
  void (async () => {
    await Promise.allSettled([
      stopAgent(AGENT_STOP_TIMEOUT_MS, "shutdown").catch((err) => {
        logger2.warn(`stopAgent 异常: ${err.message}`);
      }),
      stopKb(KB_STOP_TIMEOUT_MS, "shutdown").catch((err) => {
        logger2.warn(`stopKb 异常: ${err.message}`);
      }),
      stopGateway(GATEWAY_STOP_TIMEOUT_MS).catch((err) => {
        logger2.warn(`stopGateway 异常: ${err.message}`);
      })
    ]);
    await Promise.allSettled([
      disconnectDaemon().catch((err) => {
        logger2.warn(`disconnectDaemon 异常: ${err.message}`);
      }),
      stopBrowserAutomationServer().catch((err) => {
        logger2.warn(`stopBrowserAutomationServer 异常: ${err.message}`);
      }),
      stopCrawlServer().catch((err) => {
        logger2.warn(`stopCrawlServer 异常: ${err.message}`);
      }),
      stopUpdater().catch((err) => {
        logger2.warn(`stopUpdater 异常: ${err.message}`);
      }),
      destroyGalileoReporter().catch((err) => {
        logger2.warn(`destroyGalileoReporter 异常: ${err.message}`);
      }),
      Promise.resolve().then(() => {
        try {
          stop$1();
        } catch (err) {
          logger2.warn(`loginChecker.stop 异常: ${err.message}`);
        }
      }),
      Promise.resolve().then(() => {
        try {
          stopAutoCheck();
        } catch (err) {
          logger2.warn(`stopAutoCheck 异常: ${err.message}`);
        }
      }),
      Promise.resolve().then(() => {
        try {
          stopDocPreviewNotifier();
        } catch (err) {
          logger2.warn(`stopDocPreviewNotifier 异常: ${err.message}`);
        }
      }),
      Promise.resolve().then(() => {
        try {
          unregisterIpcChannels();
        } catch (err) {
          logger2.warn(`unregisterIpcChannels 异常: ${err.message}`);
        }
      }),
      Promise.resolve().then(() => {
        try {
          disposeJsBridge();
        } catch (err) {
          logger2.warn(`disposeJsBridge 异常: ${err.message}`);
        }
      }),
      Promise.resolve().then(() => {
        try {
          disposeOrchestrator();
        } catch (err) {
          logger2.warn(`disposeOrchestrator 异常: ${err.message}`);
        }
      }),
      destroyLocalLlm().catch((err) => {
        logger2.warn(`destroyLocalLlm 异常: ${err.message}`);
      }),
      Promise.resolve().then(() => {
        try {
          stopAppInfoCollection();
        } catch (err) {
          logger2.warn(`stopAppInfoCollection 异常: ${err.message}`);
        }
      }),
      Promise.resolve().then(() => {
        try {
          shutdownBeacon();
        } catch (err) {
          logger2.warn(`shutdownBeacon 异常: ${err.message}`);
        }
      }),
      Promise.resolve().then(() => {
        try {
          disposeForegroundTracker();
        } catch (err) {
          logger2.warn(`disposeForegroundTracker 异常: ${err.message}`);
        }
      })
    ]);
    clearTimeout(forceExitTimer);
    logger2.info("清理完成，正式退出");
    app.exit(0);
  })();
});
app.on("window-all-closed", () => {
  try {
    getLogger("main").info("[lifecycle] window-all-closed (driven to tray)");
  } catch {
  }
  trace("evt:window-all-closed", "staying in tray");
});
let bestEffortCleanupDone = false;
function bestEffortKillGateway(reason) {
  if (bestEffortCleanupDone) return;
  bestEffortCleanupDone = true;
  try {
    const logger2 = getLogger("main");
    logger2.warn(`兜底清理触发 (${reason})，同步 pkill MarvisHost + MarvisAgent`);
    try {
      const killedPids = sweepPreviousSessionOrphansSync(["MarvisHost", "MarvisAgent", "MarvisKnowledgebase"]);
      if (killedPids.length > 0) {
        logger2.warn(`快照精准清理：killed=${killedPids.join(",")}`);
      }
    } catch {
    }
    let gatewayPath = null;
    try {
      gatewayPath = resolveExecutablePath$1().path;
    } catch {
    }
    if (gatewayPath) {
      spawnSync("pkill", ["-9", "-f", gatewayPath], { stdio: "ignore" });
    } else {
      spawnSync("pkill", ["-9", "MarvisHost"], { stdio: "ignore" });
    }
    spawnSync("pkill", ["-9", "MarvisAgent"], { stdio: "ignore" });
    spawnSync("pkill", ["-9", "MarvisKnowledgebase"], { stdio: "ignore" });
  } catch {
  }
}
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    traceFatal("signal", sig);
    try {
      getLogger("main").warn(`[signal] 收到 ${sig}，触发 app.quit() 走完整清理`);
    } catch {
    }
    try {
      app.quit();
    } catch {
    }
  });
}
process.on("uncaughtException", (err) => {
  const detail = err.stack ?? err.message;
  traceFatal("uncaughtException", detail);
  try {
    getLogger("main").error(`uncaughtException: ${detail}`);
  } catch {
  }
  bestEffortKillGateway("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  const detail = String(reason);
  traceFatal("unhandledRejection", detail);
  try {
    getLogger("main").error(`unhandledRejection: ${detail}`);
  } catch {
  }
});
process.on("exit", (code) => {
  try {
    trace("evt:process-exit", `code=${code}`);
  } catch {
  }
});
