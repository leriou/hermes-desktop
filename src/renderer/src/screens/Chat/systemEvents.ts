import type { SystemEventMessage } from "./types";

type SystemEventKind = SystemEventMessage["event"];
type SystemEventTone = SystemEventMessage["tone"];

const DEFAULT_TONE: Record<SystemEventKind, SystemEventTone> = {
  model_switch: "success",
  context_compress: "success",
  provider_error: "error",
  gateway_error: "error",
  status: "info",
  goal: "info",
  steer: "info",
};

export function createSystemEvent(
  event: SystemEventKind,
  title: string,
  content?: string,
  options: { tone?: SystemEventTone; code?: string; id?: string } = {},
): SystemEventMessage {
  return {
    id: options.id ?? `system-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: "system_event",
    role: "system",
    event,
    tone: options.tone ?? DEFAULT_TONE[event],
    title,
    ...(content ? { content } : {}),
    ...(options.code ? { code: options.code } : {}),
    timestamp: Date.now(),
  };
}

export function systemEventFromError(error: unknown): SystemEventMessage {
  const message =
    error instanceof Error ? error.message : String(error || "Unknown error");
  const codeMatch = message.match(/\b(?:429|1305)\b/);
  if (codeMatch) {
    const code = codeMatch[0];
    return createSystemEvent(
      "provider_error",
      `Provider error ${code}`,
      message,
      { code },
    );
  }
  return createSystemEvent("gateway_error", "Gateway error", message);
}
