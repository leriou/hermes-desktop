import type { NormalizedTuiEvent } from "@renderer/screens/Chat/tuiEvents";

export interface WsGatewayClient {
  connect(port: number): Promise<boolean>;
  call(method: string, params: Record<string, unknown>): Promise<any>;
  onEvent(callback: (event: NormalizedTuiEvent) => void): () => void;
  close(): void;
  isConnected(): boolean;
  getMode(): "ws" | "stdio";
}

