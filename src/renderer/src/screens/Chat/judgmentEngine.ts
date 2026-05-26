import type { ApprovalRequest } from "./types";

export type JudgmentDecision = "approve" | "deny" | "manual";
export type JudgmentRisk = "low" | "medium" | "high";
export type JudgmentKind = "approval";

export interface JudgmentSettings {
  enabled: boolean;
  model: string;
  confidenceThreshold: number;
  allowAutoDecision: boolean;
}

export interface JudgmentAdvice {
  kind: JudgmentKind;
  decision: JudgmentDecision;
  confidence: number;
  risk: JudgmentRisk;
  reason: string;
  suggestedAction: "auto_approve" | "auto_deny" | "ask_user";
}

export interface ApprovalJudgmentInput {
  request: ApprovalRequest;
  settings: JudgmentSettings;
}

export interface JudgmentEngine {
  judgeApproval(input: ApprovalJudgmentInput): Promise<JudgmentAdvice>;
}

export const DEFAULT_JUDGMENT_SETTINGS: JudgmentSettings = {
  enabled: false,
  model: "",
  confidenceThreshold: 0.85,
  allowAutoDecision: false,
};

export function normalizeJudgmentSettings(value: unknown): JudgmentSettings {
  const input = (value && typeof value === "object" ? value : {}) as Partial<JudgmentSettings>;
  const confidenceThreshold = Number.isFinite(input.confidenceThreshold)
    ? Math.max(0, Math.min(1, Number(input.confidenceThreshold)))
    : DEFAULT_JUDGMENT_SETTINGS.confidenceThreshold;

  return {
    enabled: input.enabled === true,
    model: typeof input.model === "string" ? input.model : DEFAULT_JUDGMENT_SETTINGS.model,
    confidenceThreshold,
    allowAutoDecision: input.allowAutoDecision === true,
  };
}

function disabledAdvice(reason = "Judgment engine is disabled."): JudgmentAdvice {
  return {
    kind: "approval",
    decision: "manual",
    confidence: 0,
    risk: "medium",
    reason,
    suggestedAction: "ask_user",
  };
}

function classifyApprovalRisk(request: ApprovalRequest): JudgmentAdvice {
  const text = `${request.command}\n${request.description}\n${request.patternKeys.join(" ")}`.toLowerCase();
  const destructive = /\brm\s+-rf\b|\bsudo\b|\bchmod\b|\bchown\b|\bdd\b|--force|destructive|delete|remove/.test(text);
  if (destructive) {
    return {
      kind: "approval",
      decision: "deny",
      confidence: 0.9,
      risk: "high",
      reason: "Command appears destructive or privilege-sensitive.",
      suggestedAction: "ask_user",
    };
  }

  const testLike = /\btest\b|typecheck|lint|vitest|tsc --noemit|cargo test|pytest/.test(text);
  if (testLike) {
    return {
      kind: "approval",
      decision: "approve",
      confidence: 0.88,
      risk: "low",
      reason: "Command looks like a local test or validation command.",
      suggestedAction: "ask_user",
    };
  }

  return {
    kind: "approval",
    decision: "manual",
    confidence: 0.55,
    risk: "medium",
    reason: "No strong local rule matched; ask the user.",
    suggestedAction: "ask_user",
  };
}

export function createRuleBasedJudgmentEngine(): JudgmentEngine {
  return {
    async judgeApproval({ request, settings }: ApprovalJudgmentInput): Promise<JudgmentAdvice> {
      const normalized = normalizeJudgmentSettings(settings);
      if (!normalized.enabled) return disabledAdvice();
      const advice = classifyApprovalRisk(request);
      if (advice.confidence < normalized.confidenceThreshold) {
        return {
          ...advice,
          decision: "manual",
          suggestedAction: "ask_user",
          reason: `${advice.reason} Confidence is below the configured threshold.`,
        };
      }
      if (!normalized.allowAutoDecision) {
        return {
          ...advice,
          suggestedAction: "ask_user",
        };
      }
      return {
        ...advice,
        suggestedAction: advice.decision === "approve" ? "auto_approve" : advice.decision === "deny" ? "auto_deny" : "ask_user",
      };
    },
  };
}
