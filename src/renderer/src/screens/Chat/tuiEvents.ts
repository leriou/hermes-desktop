import type {
  ApprovalRequest,
  ClarifyRequest,
  SecretRequest,
  SudoRequest,
} from "./types";

export type TuiEventPayload = Record<string, unknown>;

export interface RawTuiEvent {
  type: string;
  payload?: unknown;
  sid?: unknown;
  session_id?: unknown;
}

export interface NormalizedTuiEvent {
  type: string;
  payload: TuiEventPayload;
  sessionId?: string;
}

function asRecord(value: unknown): TuiEventPayload {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as TuiEventPayload)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function stringField(
  payload: TuiEventPayload,
  key: string,
  fallback = "",
): string {
  return asString(payload[key]) || fallback;
}

export function numberField(
  payload: TuiEventPayload,
  key: string,
): number | undefined {
  return typeof payload[key] === "number" ? payload[key] : undefined;
}

export function recordField(
  payload: TuiEventPayload,
  key: string,
): TuiEventPayload {
  return asRecord(payload[key]);
}

export function optionalJsonText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function normalizeTuiEvent(event: RawTuiEvent): NormalizedTuiEvent {
  const sid = asString(event.sid) || asString(event.session_id);
  return {
    type: event.type,
    payload: asRecord(event.payload),
    ...(sid ? { sessionId: sid } : {}),
  };
}

export function textFromPayload(payload: TuiEventPayload): string {
  return asString(payload.text) || asString(payload.rendered);
}

export function normalizeApprovalRequest(
  payload: TuiEventPayload,
): ApprovalRequest {
  return {
    command: asString(payload.command),
    description: asString(payload.description),
    patternKey: asString(payload.pattern_key) || asString(payload.patternKey),
    patternKeys: asStringArray(payload.pattern_keys).length
      ? asStringArray(payload.pattern_keys)
      : asStringArray(payload.patternKeys),
  };
}

export function normalizeClarifyRequest(
  payload: TuiEventPayload,
): ClarifyRequest {
  return {
    requestId: asString(payload.request_id) || asString(payload.requestId),
    question: asString(payload.question),
    choices: asStringArray(payload.choices),
  };
}

export function normalizeSudoRequest(payload: TuiEventPayload): SudoRequest {
  return {
    requestId: asString(payload.request_id) || asString(payload.requestId),
  };
}

export function normalizeSecretRequest(
  payload: TuiEventPayload,
): SecretRequest {
  return {
    requestId: asString(payload.request_id) || asString(payload.requestId),
    envVar: asString(payload.env_var) || asString(payload.envVar),
    prompt: asString(payload.prompt),
  };
}
