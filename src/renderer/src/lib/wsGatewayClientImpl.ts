import { getGatewayWsPort } from "./hermes-tauri";
import type { NormalizedTuiEvent } from "@renderer/screens/Chat/tuiEvents";
import type { WsGatewayClient } from "./wsGatewayClient";

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

let nextId = 1;

export function createWsGatewayClientImpl(): WsGatewayClient {
  let ws: WebSocket | null = null;
  let connected = false;
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  const listeners = new Set<(event: NormalizedTuiEvent) => void>();
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let wsUrl: string | null = null;

  function cleanup(): void {
    connected = false;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    for (const [, p] of pending) p.reject(new Error("Connection closed"));
    pending.clear();
  }

  function scheduleReconnect(): void {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      doConnect().catch(() => scheduleReconnect());
    }, 2000);
  }

  function handleMessage(raw: string): void {
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
    if (!url) return false;
    wsUrl = url;

    return new Promise<boolean>((resolve) => {
      try { ws = new WebSocket(url); } catch { resolve(false); return; }

      const onOpen = (): void => {
        connected = true;
        ws!.removeEventListener("open", onOpen);
        ws!.removeEventListener("error", onError);
        ws!.addEventListener("message", (e) => handleMessage(String(e.data)));
        ws!.addEventListener("close", () => { cleanup(); scheduleReconnect(); });
        resolve(true);
      };

      const onError = (): void => {
        ws!.removeEventListener("open", onOpen);
        ws!.removeEventListener("error", onError);
        cleanup();
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
        }, 15_000);
      });
    },

    onEvent(callback: (event: NormalizedTuiEvent) => void): () => void {
      listeners.add(callback);
      return () => { listeners.delete(callback); };
    },

    close(): void {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      listeners.clear();
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
