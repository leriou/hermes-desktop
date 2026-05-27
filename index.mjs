import { contextBridge, ipcRenderer } from "electron";
import Aegis, { LoggerLevel } from "@tencent/bugly-electron-renderer-monitor";
const ENV_APP_ID = "MARVIS_BUGLY_APP_ID";
const ENV_APP_KEY = "MARVIS_BUGLY_APP_KEY";
const ENV_TYPE = "MARVIS_BUGLY_TYPE";
const ENV_ENABLED = "MARVIS_BUGLY_ENABLED";
const RENDERER_PLUGIN = {
  spa: true,
  error: true,
  assetSpeed: true,
  pagePerformance: true,
  webVitals: true,
  session: true
};
function isDisabled() {
  const raw = (process.env[ENV_ENABLED] ?? "").trim().toLowerCase();
  return raw === "0" || raw === "false" || raw === "no";
}
function initRendererBugly() {
  if (isDisabled()) {
    return null;
  }
  const id = (process.env[ENV_APP_ID] ?? "").trim();
  const appKey = (process.env[ENV_APP_KEY] ?? "").trim();
  const envType = (process.env[ENV_TYPE] ?? "").trim();
  const buglyType = envType || "oa";
  if (!id || !appKey) {
    console.warn("[bugly-renderer] 缺少凭证，跳过初始化");
    return null;
  }
  try {
    return new Aegis({
      id,
      appKey,
      buglyType,
      plugin: { ...RENDERER_PLUGIN },
      // 接入日志系统：将 Bugly SDK 日志输出到控制台（渲染进程无 electron-log）
      logHandler: (level, message) => {
        if (level === LoggerLevel.ERROR) {
          console.error(`[Bugly SDK] ${message}`);
        } else if (level === LoggerLevel.INFO) {
          console.warn(`[Bugly SDK] ${message}`);
        } else if (level === LoggerLevel.DEBUG) {
          console.debug(`[Bugly SDK] ${message}`);
        }
      }
    });
  } catch (err) {
    console.warn("[bugly-renderer] 初始化失败", err.message);
    return null;
  }
}
const rendererInstance = initRendererBugly();
try {
  contextBridge.exposeInMainWorld("__buglyRenderer", {
    isReady: () => rendererInstance !== null
  });
} catch {
}
const CHANNEL = {
  GET_SERVICE_PORTS: "marvis:service-ports:get",
  SERVICE_PORT_CHANGED: "marvis:service-ports:changed",
  PROCESS_EVENT: "marvis:process:event",
  WAIT_FOR_GATEWAY: "marvis:gateway:wait-ready",
  /** Bugly 崩溃测试通道（仅开发模式下主进程注册） */
  BUGLY_CRASH_TEST: "marvis:bugly:crash-test:trigger",
  /** renderer → main (send): 前端页面就绪通知 */
  RENDERER_READY: "marvis:renderer:ready",
  /** renderer → main (send): 首帧内容就绪（#root 有真实 DOM 子节点） */
  FIRST_PAINT_READY: "marvis:first-paint-ready",
  /** main → renderer (send): 菜单动作指令 */
  MENU_ACTION: "marvis:menu:action",
  // ---- JSBridge ----
  JSB_INVOKE: "jsb:invoke",
  JSB_CONTENT_CHANGED: "jsb:content-changed"
};
const jsbCallbacks = /* @__PURE__ */ new Set();
ipcRenderer.on(
  CHANNEL.JSB_CONTENT_CHANGED,
  (_event, payload) => {
    for (const cb of jsbCallbacks) {
      try {
        cb(payload.callbackId, payload.code, payload.data, payload.message);
      } catch (err) {
        console.error("[CallBridge] listener threw", err);
      }
    }
  }
);
contextBridge.exposeInMainWorld("marvis", {
  /** Electron 运行时版本号 */
  getVersion: () => process.versions.electron,
  /**
   * 查询当前全部已登记的服务端口
   */
  getServicePorts: () => ipcRenderer.invoke(CHANNEL.GET_SERVICE_PORTS),
  /**
   * 等待网关就绪，一次性拿到网关连接所需的全部信息
   */
  waitForGateway: (timeoutMs) => ipcRenderer.invoke(CHANNEL.WAIT_FOR_GATEWAY, timeoutMs),
  /**
   * 订阅端口变更事件
   */
  onServicePortChanged: (callback) => {
    const listener = (_event, info) => callback(info);
    ipcRenderer.on(CHANNEL.SERVICE_PORT_CHANGED, listener);
    return () => ipcRenderer.removeListener(CHANNEL.SERVICE_PORT_CHANGED, listener);
  },
  /**
   * 订阅子进程生命周期事件
   */
  onProcessEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(CHANNEL.PROCESS_EVENT, listener);
    return () => ipcRenderer.removeListener(CHANNEL.PROCESS_EVENT, listener);
  },
  /**
   * 【dev-only】触发主进程崩溃 / JS 异常，用于验证 Bugly 上报
   *
   * - `native`：`process.crash()` → 主进程 minidump
   * - `js-uncaught`：`setImmediate(() => throw)` → JS 未捕获异常
   * - `js-unhandled-rejection`：未处理的 Promise rejection
   *
   * 生产包下主进程不注册该通道，调用会直接 reject。
   * 渲染侧自身的异常不走这里，直接 `throw new Error(...)` 即可被 Bugly renderer SDK 捕获。
   */
  triggerCrash: (type) => ipcRenderer.invoke(CHANNEL.BUGLY_CRASH_TEST, type),
  /**
   * 通知主进程：前端页面已就绪（新手引导 / 冷启检查完成，进入正常主页面）
   *
   * 主进程收到后会启用依赖就绪状态的菜单项（检查更新、偏好设置、快捷键、新建对话等）。
   */
  notifyReady: () => {
    ipcRenderer.send(CHANNEL.RENDERER_READY);
  },
  /**
   * 订阅主进程菜单动作（菜单栏 / Dock / 托盘触发）
   *
   * @param callback - 接收菜单动作标识
   * @returns 取消订阅函数
   */
  onMenuAction: (callback) => {
    const listener = (_event, action) => {
      callback(action);
    };
    ipcRenderer.on(CHANNEL.MENU_ACTION, listener);
    return () => {
      ipcRenderer.removeListener(CHANNEL.MENU_ACTION, listener);
    };
  }
});
(function injectFirstPaintDetector() {
  let notified = false;
  let rootObs = null;
  let pollTimer = null;
  let firstContentTime = null;
  let confirmTimer = null;
  const MIN_DELAY_MS = 400;
  function cleanup() {
    rootObs?.disconnect();
    rootObs = null;
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (confirmTimer !== null) {
      clearTimeout(confirmTimer);
      confirmTimer = null;
    }
  }
  function confirmAndNotify() {
    if (notified) return;
    const root = document.getElementById("root");
    if (!root || !hasVisibleContent(root)) {
      firstContentTime = null;
      return;
    }
    notified = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        cleanup();
        ipcRenderer.send(CHANNEL.FIRST_PAINT_READY);
      });
    });
  }
  function hasVisibleContent(el) {
    if (el.offsetWidth > 0 && el.offsetHeight > 0) return true;
    for (const child of Array.from(el.children)) {
      if (hasVisibleContent(child)) return true;
    }
    return false;
  }
  function checkAndNotify() {
    if (notified) return;
    const root = document.getElementById("root");
    if (root && hasVisibleContent(root)) {
      if (firstContentTime === null) {
        firstContentTime = performance.now();
        const elapsed = 0;
        const delay = Math.max(0, MIN_DELAY_MS - elapsed);
        confirmTimer = setTimeout(confirmAndNotify, delay);
      }
    } else {
      if (confirmTimer !== null) {
        clearTimeout(confirmTimer);
        confirmTimer = null;
      }
      firstContentTime = null;
    }
  }
  function startObserving() {
    const rootEl = document.getElementById("root");
    if (!rootEl) {
      pollTimer = setInterval(checkAndNotify, 50);
      return;
    }
    rootObs = new MutationObserver(checkAndNotify);
    rootObs.observe(rootEl, { childList: true, subtree: true });
    checkAndNotify();
  }
  checkAndNotify();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      startObserving();
    });
  } else {
    startObserving();
  }
})();
contextBridge.exposeInMainWorld("CallBridge", {
  /**
   * 调用主进程方法（fire-and-forget）
   */
  invokeMethod: (methodName, callbackId, ...args) => {
    ipcRenderer.invoke(CHANNEL.JSB_INVOKE, { methodName, callbackId, args }).catch((err) => {
      console.error("[CallBridge] invoke failed", methodName, err);
    });
  },
  /**
   * 注册 ContentChanged 总线 listener
   */
  addEventListener: (eventName, callback) => {
    if (eventName !== "ContentChanged") {
      console.warn(`[CallBridge] unsupported eventName: ${eventName}`);
      return;
    }
    if (typeof callback !== "function") return;
    jsbCallbacks.add(callback);
  }
});
