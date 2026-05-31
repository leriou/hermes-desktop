import type { TauriChatGatewayClient } from "@renderer/screens/Chat/tauriChatGatewayClient";
import type { NormalizedTuiEvent, RawTuiEvent } from "@renderer/screens/Chat/tuiEvents";
import { normalizeTuiEvent } from "@renderer/screens/Chat/tuiEvents";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WsGatewayClient {
  connect(port: number): Promise<boolean>;
  call(method: string, params: Record<string, unknown>): Promise<any>;
  onEvent(callback: (event: NormalizedTuiEvent) => void): () => void;
  close(): void;
  isConnected(): boolean;
  getMode(): "ws" | "stdio";
}

type Mode = "ws" | "stdio";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params: Record<string, unknown>;
  id: number;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWsGatewayClient(
  stdioFallback: TauriChatGatewayClient,
): WsGatewayClient {
  let ws: WebSocket | null = null;
  let mode: Mode = "stdio";
  let callIdCounter = 0;
  const pendingCalls = new Map<number, PendingCall>();
  const eventListeners = new Set<(event: NormalizedTuiEvent) => void>();
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let reconnectPort = 0;
  let intentionalClose = false;
  let lastKnownHost = "127.0.0.1";

  // Default timeout for JSON-RPC calls
  const CALL_TIMEOUT_MS = 60_000;
  const MAX_BACKOFF_MS = 30_000;
  const BASE_BACKOFF_MS = 1_000;

  // ------------------------------------------------------------------
  // Connection management
  // ------------------------------------------------------------------

  function buildUrl(port: number): string {
    return `ws://${lastKnownHost}:${port}/api/ws`;
  }

  function getPortFromUrl(): number {
    return reconnectPort;
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect(port: number): void {
    if (intentionalClose) return;
    clearReconnectTimer();

    const attempt = reconnectAttempt;
    const delay = Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
    reconnectAttempt = attempt + 1;

    console.log(
      `[wsGatewayClient] Reconnecting in ${delay}ms (attempt ${attempt + 1})`,
    );

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void performConnect(port);
    }, delay);
  }

  async function performConnect(port: number): Promise<boolean> {
    if (ws && ws.readyState === WebSocket.OPEN) {
      return true;
    }

    reconnectPort = port;

    return new Promise<boolean>((resolve) => {
      try {
        const url = buildUrl(port);
        console.log(`[wsGatewayClient] Connecting to ${url}`);

        const socket = new WebSocket(url);
        let resolved = false;

        socket.onopen = () => {
          console.log("[wsGatewayClient] WebSocket connected");
          ws = socket;
          mode = "ws";
          reconnectAttempt = 0;
          intentionalClose = false;

          if (!resolved) {
            resolved = true;
            resolve(true);
          }
        };

        socket.onmessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data as string);
            handleMessage(data);
          } catch (err) {
            console.error("[wsGatewayClient] Failed to parse WS message:", err);
          }
        };

        socket.onclose = (event: CloseEvent) => {
          console.log(
            `[wsGatewayClient] WebSocket closed: code=${event.code} reason=${event.reason}`,
          );
          ws = null;
          mode = "stdio";

          // Reject all pending calls
          rejectPendingCalls(
            new Error(`WebSocket closed: ${event.reason || "connection lost"}`),
          );

          if (!resolved) {
            resolved = true;
            resolve(false);
          }

          if (!intentionalClose) {
            scheduleReconnect(port);
          }
        };

        socket.onerror = () => {
          console.error("[wsGatewayClient] WebSocket error");
          if (!resolved) {
            resolved = true;
            resolve(false);
          }
          // onclose will fire after onerror, handling reconnection there
        };
      } catch (err) {
        console.error("[wsGatewayClient] Failed to create WebSocket:", err);
        mode = "stdio";
        resolve(false);
      }
    });
  }

  async function connect(port: number): Promise<boolean> {
    intentionalClose = false;
    reconnectPort = port;
    return performConnect(port);
  }

  function isConnected(): boolean {
    return mode === "ws" && ws !== null && ws.readyState === WebSocket.OPEN;
  }

  function getMode(): "ws" | "stdio" {
    return mode;
  }

  function close(): void {
    intentionalClose = true;
    clearReconnectTimer();

    if (ws) {
      ws.close(1000, "client closing");
      ws = null;
    }

    mode = "stdio";
    reconnectAttempt = 0;
  }

  // ------------------------------------------------------------------
  // Message handling
  // ------------------------------------------------------------------

  function handleMessage(data: unknown): void {
    if (!data || typeof data !== "object") return;

    const msg = data as Record<string, unknown>;

    // Check for JSON-RPC response (has id, not a notification)
    if (msg.jsonrpc === "2.0" && typeof msg.id === "number" && ("result" in msg || "error" in msg)) {
      const resp = msg as unknown as JsonRpcResponse;
      const pending = pendingCalls.get(resp.id);
      if (pending) {
        clearTimeout(pending.timer);
        pendingCalls.delete(resp.id);

        if ("error" in resp && resp.error) {
          pending.reject(
            new Error(
              `JSON-RPC error ${resp.error.code}: ${resp.error.message}`,
            ),
          );
        } else {
          pending.resolve(resp.result);
        }
      }
      return;
    }

    // Check for JSON-RPC notification (has method but no id)
    if (msg.jsonrpc === "2.0" && typeof msg.method === "string" && msg.id === undefined) {
      handleNotification(msg);
      return;
    }

    // Legacy event format: { type: "message.delta", payload: {...}, sid: "..." }
    if (typeof (msg as any).type === "string") {
      const rawEvent: RawTuiEvent = {
        type: (msg as any).type,
        payload: (msg as any).payload,
        sid: (msg as any).sid,
      };
      const normalized = normalizeTuiEvent(rawEvent);
      emitEvent(normalized);
      return;
    }
  }

  function handleNotification(msg: Record<string, unknown>): void {
    const method = msg.method as string;
    const params = (msg.params ?? {}) as Record<string, unknown>;

    // Gateway sends tui-event notifications
    if (method === "tui-event") {
      const type = params.type as string;
      const payload = (params.payload ?? {}) as Record<string, unknown>;
      const sid = params.sid as string | undefined;

      const rawEvent: RawTuiEvent = {
        type: type || "unknown",
        payload,
        sid,
      };

      const normalized = normalizeTuiEvent(rawEvent);
      emitEvent(normalized);
      return;
    }

    // Other notifications can be handled here if needed
    console.log("[wsGatewayClient] Unhandled notification:", method, params);
  }

  function emitEvent(event: NormalizedTuiEvent): void {
    for (const listener of eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[wsGatewayClient] Event listener error:", err);
      }
    }
  }

  function rejectPendingCalls(error: Error): void {
    for (const [id, pending] of pendingCalls) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    pendingCalls.clear();
  }

  // ------------------------------------------------------------------
  // JSON-RPC call
  // ------------------------------------------------------------------

  function call(
    method: string,
    params: Record<string, unknown>,
  ): Promise<any> {
    // If WS is connected, send via WebSocket
    if (isConnected() && ws) {
      return callViaWs(method, params);
    }

    // Fallback to stdio via Tauri
    return callViaStdio(method, params);
  }

  function callViaWs(
    method: string,
    params: Record<string, unknown>,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        // Fallback mid-call if WS went down
        callViaStdio(method, params).then(resolve).catch(reject);
        return;
      }

      const id = ++callIdCounter;
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        method,
        params,
        id,
      };

      const timer = setTimeout(() => {
        pendingCalls.delete(id);
        reject(new Error(`JSON-RPC call "${method}" timed out`));
      }, CALL_TIMEOUT_MS);

      pendingCalls.set(id, { resolve, reject, timer });

      try {
        ws.send(JSON.stringify(request));
      } catch (err) {
        clearTimeout(timer);
        pendingCalls.delete(id);
        // Fallback to stdio on send failure
        callViaStdio(method, params).then(resolve).catch(reject);
      }
    });
  }

  // Map JSON-RPC methods to TauriChatGatewayClient methods
  async function callViaStdio(
    method: string,
    params: Record<string, unknown>,
  ): Promise<any> {
    const sid = params.sessionId as string | undefined;
    const text = params.text as string | undefined;

    switch (method) {
      case "tui_submit_prompt":
        if (sid && typeof text === "string") {
          await stdioFallback.submitPrompt(sid, text);
          return { status: "ok" };
        }
        throw new Error("submitPrompt requires sessionId and text");

      case "tui_steer":
        if (sid && typeof text === "string") {
          return stdioFallback.steer(sid, text);
        }
        throw new Error("steer requires sessionId and text");

      case "tui_interrupt":
        if (sid) {
          await stdioFallback.interrupt(sid);
          return { status: "ok" };
        }
        throw new Error("interrupt requires sessionId");

      case "tui_compress":
        if (sid) {
          return stdioFallback.compress(sid, params.focusTopic as string);
        }
        throw new Error("compress requires sessionId");

      case "tui_set_model":
        if (sid && params.model) {
          return stdioFallback.setModel(sid, params.model as string);
        }
        throw new Error("setModel requires sessionId and model");

      case "tui_command_dispatch":
        if (sid && params.name) {
          return stdioFallback.dispatchCommand(
            sid,
            params.name as string,
            params.arg as string,
          );
        }
        throw new Error("dispatchCommand requires sessionId and name");

      case "tui_session_title":
        if (sid) {
          return stdioFallback.sessionTitle(sid);
        }
        throw new Error("sessionTitle requires sessionId");

      case "tui_undo":
        if (sid) {
          await stdioFallback.undo(sid);
          return { status: "ok" };
        }
        throw new Error("undo requires sessionId");

      case "tui_session_history":
        if (sid) {
          return stdioFallback.sessionHistory(sid);
        }
        throw new Error("sessionHistory requires sessionId");

      case "tui_session_branch":
        if (sid) {
          return stdioFallback.branch(sid, params.name as string);
        }
        throw new Error("branch requires sessionId");

      case "tui_clarify_respond":
        if (sid && params.answer) {
          await stdioFallback.respondClarify(
            sid,
            params.answer as string,
            params.requestId as string | undefined,
          );
          return { status: "ok" };
        }
        throw new Error("clarifyRespond requires sessionId and answer");

      case "tui_approval_respond":
        if (sid && params.decision) {
          await stdioFallback.respondApproval(
            sid,
            params.decision as any,
            (params.all as boolean) ?? false,
          );
          return { status: "ok" };
        }
        throw new Error("approvalRespond requires sessionId and decision");

      case "tui_sudo_respond":
        if (sid && params.password) {
          await stdioFallback.respondSudo(
            sid,
            params.password as string,
            params.requestId as string | undefined,
          );
          return { status: "ok" };
        }
        throw new Error("sudoRespond requires sessionId and password");

      case "tui_secret_respond":
        if (sid && params.value) {
          await stdioFallback.respondSecret(
            sid,
            params.value as string,
            params.requestId as string | undefined,
          );
          return { status: "ok" };
        }
        throw new Error("secretRespond requires sessionId and value");

      default:
        throw new Error(
          `Unknown JSON-RPC method "${method}" - no stdio mapping`,
        );
    }
  }

  // ------------------------------------------------------------------
  // Event subscription
  // ------------------------------------------------------------------

  function onEvent(
    callback: (event: NormalizedTuiEvent) => void,
  ): () => void {
    eventListeners.add(callback);
    return () => {
      eventListeners.delete(callback);
    };
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  return {
    connect,
    call,
    onEvent,
    close,
    isConnected,
    getMode,
  };
}
