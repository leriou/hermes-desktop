import { getGatewayWsPort } from "./hermes-tauri";
import type { NormalizedTuiEvent } from "@renderer/screens/Chat/tuiEvents";
import type { WsConnectionState, WsGatewayClient } from "./wsGatewayClient";

interface JsonRpcResponse {
  jsonrpc: string;
  result?: unknown;
  error?: { code: number; message: string };
  id?: number;
}

interface JsonRpcNotification {
  jsonrpc: string;
  method: string;
  params: {
    type: string;
    sid?: string;
    session_id?: string;
    payload: Record<string, unknown>;
  };
}

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;
const MAX_MISSED_HEARTBEATS = 3;
const BASE_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;
const RPC_TIMEOUT_MS = 30_000;

let nextId = 1;

export function createWsGatewayClientImpl(): WsGatewayClient {
  let ws: WebSocket | null = null;
  let connected = false;
  let closed = false;
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  const listeners = new Set<(event: NormalizedTuiEvent) => void>();
  const connectionListeners = new Set<(state: WsConnectionState) => void>();
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let wsUrl: string | null = null;
  let reconnectAttempt = 0;

  // Heartbeat state
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  let missedHeartbeats = 0;

  function emitConnectionState(state: WsConnectionState): void {
    for (const cb of connectionListeners) {
      try { cb(state); } catch { /* skip */ }
    }
  }

  function cleanup(): void {
    connected = false;
    stopHeartbeat();
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    for (const [, p] of pending) p.reject(new Error("Connection closed"));
    pending.clear();
  }

  function startHeartbeat(): void {
    stopHeartbeat();
    missedHeartbeats = 0;
    heartbeatInterval = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      missedHeartbeats++;
      if (missedHeartbeats > MAX_MISSED_HEARTBEATS) {
        // Connection is dead — force close to trigger reconnect
        ws.close();
        return;
      }
      // Send ping as a JSON-RPC notification (no id = no response expected)
      // We rely on the WS pong/frame-level response
      try {
        ws.send(JSON.stringify({ jsonrpc: "2.0", method: "ping" }));
      } catch {
        // send failed — connection is dead
      }
      // Reset missed count when we receive any message (handled in handleMessage)
    }, HEARTBEAT_INTERVAL_MS);
  }

  function stopHeartbeat(): void {
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
    if (heartbeatTimeout) { clearTimeout(heartbeatTimeout); heartbeatTimeout = null; }
    missedHeartbeats = 0;
  }

  function getReconnectDelay(): number {
    const delay = Math.min(BASE_RECONNECT_MS * Math.pow(2, reconnectAttempt), MAX_RECONNECT_MS);
    // Add jitter ±25%
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    return Math.max(500, delay + jitter);
  }

  function scheduleReconnect(): void {
    if (closed || reconnectTimer) return;
    reconnectAttempt++;
    const delay = getReconnectDelay();
    emitConnectionState("reconnecting");
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      doConnect().then((ok) => {
        if (!ok && !closed) scheduleReconnect();
      }).catch(() => {
        if (!closed) scheduleReconnect();
      });
    }, delay);
  }

  function handleMessage(raw: string): void {
    // Any inbound message resets heartbeat counter
    missedHeartbeats = 0;

    let parsed: JsonRpcResponse | JsonRpcNotification;
    try { parsed = JSON.parse(raw); } catch { return; }

    if ("id" in parsed && parsed.id != null) {
      const resp = parsed as JsonRpcResponse;
      const entry = pending.get(resp.id);
      if (entry) {
        pending.delete(resp.id);
        if (resp.error) entry.reject(new Error(resp.error.message));
        else entry.resolve(resp.result);
      }
      return;
    }

    // Notification → normalized event
    const notif = parsed as JsonRpcNotification;
    if (notif.method !== "event" && !(notif.params as any).type) return;

    const params = notif.params;
    const sessionId = params.sid || params.session_id || undefined;
    const event: NormalizedTuiEvent = {
      type: params.type || (notif as any).method,
      sessionId,
      payload: params.payload ?? {},
    };

    for (const cb of listeners) {
      try { cb(event); } catch { /* listener error — skip */ }
    }
  }

  async function doConnect(): Promise<boolean> {
    const url = await getGatewayWsPort();
    if (!url) {
      emitConnectionState("unavailable");
      return false;
    }
    wsUrl = url;

    return new Promise<boolean>((resolve) => {
      try { ws = new WebSocket(url); } catch { resolve(false); return; }

      const onOpen = (): void => {
        connected = true;
        reconnectAttempt = 0;
        ws!.removeEventListener("open", onOpen);
        ws!.removeEventListener("error", onError);
        ws!.addEventListener("message", (e) => handleMessage(String(e.data)));
        ws!.addEventListener("close", () => {
          cleanup();
          emitConnectionState("disconnected");
          scheduleReconnect();
        });
        startHeartbeat();
        emitConnectionState("connected");
        resolve(true);
      };

      const onError = (): void => {
        ws!.removeEventListener("open", onOpen);
        ws!.removeEventListener("error", onError);
        cleanup();
        emitConnectionState("disconnected");
        resolve(false);
      };

      ws!.addEventListener("open", onOpen);
      ws!.addEventListener("error", onError);

      setTimeout(() => { if (!connected) { onError(); } }, 5000);
    });
  }

  return {
    async connect(): Promise<boolean> {
      if (connected && ws?.readyState === WebSocket.OPEN) return true;
      closed = false;
      return doConnect();
    },

    call(method: string, params: Record<string, unknown>): Promise<any> {
      return new Promise((resolve, reject) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          reject(new Error("WS not connected"));
          return;
        }
        const id = nextId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ jsonrpc: "2.0", method, params, id }));
        setTimeout(() => {
          if (pending.delete(id)) reject(new Error("RPC timeout"));
        }, RPC_TIMEOUT_MS);
      });
    },

    onEvent(callback: (event: NormalizedTuiEvent) => void): () => void {
      listeners.add(callback);
      return () => { listeners.delete(callback); };
    },

    onConnectionChange(callback: (state: WsConnectionState) => void): () => void {
      connectionListeners.add(callback);
      return () => { connectionListeners.delete(callback); };
    },

    close(): void {
      closed = true;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      stopHeartbeat();
      listeners.clear();
      connectionListeners.clear();
      cleanup();
      ws?.close();
      ws = null;
    },

    isConnected(): boolean {
      return connected && ws?.readyState === WebSocket.OPEN;
    },

    getMode(): "ws" | "stdio" {
      return connected ? "ws" : "stdio";
    },
  };
}
