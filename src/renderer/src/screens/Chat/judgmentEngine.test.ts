import { describe, expect, it } from "vitest";
import {
  createRuleBasedJudgmentEngine,
  DEFAULT_JUDGMENT_SETTINGS,
  normalizeJudgmentSettings,
} from "./judgmentEngine";

const approvalRequest = {
  command: "npm test -- src/renderer/src/screens/Chat",
  description: "Run focused chat tests",
  patternKey: "npm-test",
  patternKeys: ["npm", "test"],
};

describe("judgmentEngine", () => {
  it("normalizes judgment settings to a disabled safe default", () => {
    expect(
      normalizeJudgmentSettings({
        enabled: true,
        confidenceThreshold: 2,
        model: "fast",
      }),
    ).toEqual({
      ...DEFAULT_JUDGMENT_SETTINGS,
      enabled: true,
      model: "fast",
      confidenceThreshold: 1,
    });
  });

  it("returns structured approval advice without making the final decision", async () => {
    const engine = createRuleBasedJudgmentEngine();

    const advice = await engine.judgeApproval({
      request: approvalRequest,
      settings: { ...DEFAULT_JUDGMENT_SETTINGS, enabled: true },
    });

    expect(advice).toMatchObject({
      kind: "approval",
      decision: "approve",
      risk: "low",
    });
    expect(advice.confidence).toBeGreaterThanOrEqual(0.8);
    expect(advice.reason).toContain("test");
  });

  it("stays conservative for destructive approval requests", async () => {
    const engine = createRuleBasedJudgmentEngine();

    const advice = await engine.judgeApproval({
      request: {
        ...approvalRequest,
        command: "rm -rf /tmp/hermes-data",
        patternKeys: ["rm", "destructive"],
      },
      settings: { ...DEFAULT_JUDGMENT_SETTINGS, enabled: true },
    });

    expect(advice).toMatchObject({
      decision: "deny",
      risk: "high",
    });
  });
});
