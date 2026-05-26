import type { ApprovalRequest } from "./types";

export type ApprovalMode = "manual" | "countdown" | "auto_approve";
export type ApprovalDecision = "approve" | "deny";
export type ApprovalDecisionSource = "manual" | "timeout" | "auto" | "judgment";

export interface ApprovalPolicy {
  mode: ApprovalMode;
  timeoutSeconds: number;
  timeoutAction: ApprovalDecision;
  historyTtlMinutes: number;
}

export interface ApprovalHistoryEntry {
  id: string;
  command: string;
  description?: string;
  patternKey?: string;
  patternKeys: string[];
  decision: ApprovalDecision;
  source: ApprovalDecisionSource;
  decidedAt: number;
  judgmentReason?: string;
  judgmentConfidence?: number;
  judgmentRisk?: "low" | "medium" | "high";
}

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = {
  mode: "manual",
  timeoutSeconds: 30,
  timeoutAction: "deny",
  historyTtlMinutes: 15,
};

export const APPROVAL_POLICY_KEY = "hermes:approval-policy:v1";
export const APPROVAL_HISTORY_KEY = "hermes:approval-history:v1";

export function normalizeApprovalPolicy(value: unknown): ApprovalPolicy {
  const input = (value && typeof value === "object" ? value : {}) as Partial<ApprovalPolicy>;
  const mode = input.mode === "countdown" || input.mode === "auto_approve" ? input.mode : "manual";
  const timeoutAction = input.timeoutAction === "approve" ? "approve" : "deny";
  const timeoutSeconds = Number.isFinite(input.timeoutSeconds) && Number(input.timeoutSeconds) >= 5
    ? Math.min(600, Math.floor(Number(input.timeoutSeconds)))
    : DEFAULT_APPROVAL_POLICY.timeoutSeconds;
  const historyTtlMinutes = Number.isFinite(input.historyTtlMinutes) && Number(input.historyTtlMinutes) >= 1
    ? Math.min(240, Math.floor(Number(input.historyTtlMinutes)))
    : DEFAULT_APPROVAL_POLICY.historyTtlMinutes;

  return { mode, timeoutSeconds, timeoutAction, historyTtlMinutes };
}

export function getImmediateApprovalDecision(policy: ApprovalPolicy): { decision: ApprovalDecision; source: ApprovalDecisionSource } | null {
  if (policy.mode !== "auto_approve") return null;
  return { decision: "approve", source: "auto" };
}

export function createApprovalHistoryEntry(
  request: ApprovalRequest,
  decision: ApprovalDecision,
  source: ApprovalDecisionSource,
  decidedAt: number,
  judgment?: { reason: string; confidence: number; risk: "low" | "medium" | "high" },
): ApprovalHistoryEntry {
  return {
    id: `approval-${decidedAt}-${Math.random().toString(36).slice(2, 8)}`,
    command: request.command,
    description: request.description,
    patternKey: request.patternKey,
    patternKeys: request.patternKeys ?? [],
    decision,
    source,
    decidedAt,
    ...(judgment ? {
      judgmentReason: judgment.reason,
      judgmentConfidence: judgment.confidence,
      judgmentRisk: judgment.risk,
    } : {}),
  };
}

export function pruneApprovalHistory(
  entries: ApprovalHistoryEntry[],
  now: number,
  ttlMinutes: number,
): ApprovalHistoryEntry[] {
  const minTs = now - Math.max(1, ttlMinutes) * 60_000;
  return entries.filter((entry) => entry.decidedAt >= minTs).slice(-50);
}

export function loadApprovalPolicy(): ApprovalPolicy {
  try {
    const raw = localStorage.getItem(APPROVAL_POLICY_KEY);
    return normalizeApprovalPolicy(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_APPROVAL_POLICY;
  }
}

export function saveApprovalPolicy(policy: ApprovalPolicy): void {
  localStorage.setItem(APPROVAL_POLICY_KEY, JSON.stringify(normalizeApprovalPolicy(policy)));
}

export function loadApprovalHistory(now = Date.now(), ttlMinutes = DEFAULT_APPROVAL_POLICY.historyTtlMinutes): ApprovalHistoryEntry[] {
  try {
    const raw = localStorage.getItem(APPROVAL_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return pruneApprovalHistory(Array.isArray(parsed) ? parsed : [], now, ttlMinutes);
  } catch {
    return [];
  }
}

export function saveApprovalHistory(entries: ApprovalHistoryEntry[]): void {
  localStorage.setItem(APPROVAL_HISTORY_KEY, JSON.stringify(entries));
}
