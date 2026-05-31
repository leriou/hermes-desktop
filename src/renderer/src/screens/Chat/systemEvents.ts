import type { SystemEventKind, SystemEventMessage, SystemStatusMessage } from "./types";

type Tone = SystemEventMessage["tone"];

const EVENT_TONE_DEFAULTS: Record<SystemEventKind, Tone> = {
  model_switch: "success",
  context_compress: "success",
  provider_error: "error",
  gateway_error: "error",
  gateway_timeout: "error",
  protocol_error: "error",
  agent_error: "error",
  stuck_timeout: "warning",
  review: "info",
  background: "success",
  browser: "info",
  voice: "info",
  subagent_spawn: "info",
  status: "info",
  goal: "info",
  steer: "info",
};

const EVENT_TITLES: Partial<Record<SystemEventKind, string>> = {
  agent_error: "Agent error",
  gateway_error: "Gateway error",
  gateway_timeout: "Gateway timeout",
  protocol_error: "Protocol error",
  stuck_timeout: "Response timed out",
  review: "Review summary",
  background: "Background task completed",
  browser: "Browser",
  voice: "Voice",
  subagent_spawn: "Subagent",
};

function uid(): string {
  return `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── SystemEventMessage factory ───────────────────────────────────────

export function createSystemEvent(
  event: SystemEventKind,
  title: string,
  content?: string,
  options: { tone?: Tone; code?: string; id?: string } = {},
): SystemEventMessage {
  return {
    id: options.id ?? uid(),
    kind: "system_event",
    role: "system",
    event,
    tone: options.tone ?? EVENT_TONE_DEFAULTS[event],
    title,
    ...(content ? { content } : {}),
    ...(options.code ? { code: options.code } : {}),
    timestamp: Date.now(),
  };
}

// ── SystemStatusMessage factory ──────────────────────────────────────

export function createStatusMessage(
  tone: Tone,
  title: string,
  content?: string,
): SystemStatusMessage {
  return {
    id: uid(),
    kind: "system_status",
    role: "agent",
    tone,
    title,
    ...(content ? { content } : {}),
    timestamp: Date.now(),
  };
}

// ── Typed event constructors ─────────────────────────────────────────

export function notify(event: SystemEventKind, content: string, options?: { tone?: Tone; code?: string }): SystemEventMessage {
  return createSystemEvent(event, EVENT_TITLES[event] ?? event, content, options);
}

export function notifyError(message: string, options?: { code?: string; details?: string }): SystemEventMessage[] {
  const messages: SystemEventMessage[] = [
    createSystemEvent("agent_error", "Agent error", message, options),
  ];
  if (options?.details) {
    messages.push(createStatusMessage("error", "Details", options.details.slice(0, 2000)));
  }
  return messages;
}

export function systemEventFromError(error: unknown): SystemEventMessage {
  const message =
    error instanceof Error ? error.message : String(error || "Unknown error");
  const codeMatch = message.match(/\b(?:429|1305)\b/);
  if (codeMatch) {
    const code = codeMatch[0];
    return createSystemEvent("provider_error", `Provider error ${code}`, message, { code });
  }
  return createSystemEvent("gateway_error", "Gateway error", message);
}

export function notifyGatewayError(type: string, payload: Record<string, unknown>, sessionId?: string): SystemEventMessage {
  const message =
    (payload.message as string) || (payload.preview as string) || (payload.stderr_tail as string)
    || (type.includes("timeout") ? "Gateway failed to start" : "Gateway communication error");
  const eventType = type.includes("timeout") ? "gateway_timeout" as const : "gateway_error" as const;
  return createSystemEvent(eventType, EVENT_TITLES[eventType]!, message, { id: `gw-${uid()}` });
}

export function notifyStuckTimeout(durationS: number): SystemEventMessage {
  const hint = durationS > 0 ? ` after ${durationS}s` : "";
  return createSystemEvent(
    "stuck_timeout",
    "Response timed out",
    `The agent did not finish responding${hint}. This may be a network issue or the agent encountered an error. Your partial response has been saved. You can send a new message to continue.`,
  );
}
