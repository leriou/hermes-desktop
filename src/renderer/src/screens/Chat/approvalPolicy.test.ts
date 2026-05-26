import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPROVAL_POLICY,
  createApprovalHistoryEntry,
  getImmediateApprovalDecision,
  normalizeApprovalPolicy,
  pruneApprovalHistory,
} from "./approvalPolicy";

const request = {
  command: "python scripts/migrate.py --force",
  description: "Run migration",
  patternKey: "migration",
  patternKeys: ["migration", "python"],
};

describe("approvalPolicy", () => {
  it("normalizes invalid client config back to safe manual defaults", () => {
    expect(
      normalizeApprovalPolicy({
        mode: "auto_approve",
        timeoutSeconds: 0,
        historyTtlMinutes: -1,
      }),
    ).toEqual({
      ...DEFAULT_APPROVAL_POLICY,
      mode: "auto_approve",
    });
  });

  it("only auto approve mode creates an immediate client decision", () => {
    expect(getImmediateApprovalDecision(DEFAULT_APPROVAL_POLICY)).toBeNull();
    expect(
      getImmediateApprovalDecision({
        ...DEFAULT_APPROVAL_POLICY,
        mode: "countdown",
      }),
    ).toBeNull();
    expect(
      getImmediateApprovalDecision({
        ...DEFAULT_APPROVAL_POLICY,
        mode: "auto_approve",
      }),
    ).toEqual({
      decision: "approve",
      source: "auto",
    });
  });

  it("records and prunes local approval history by ttl", () => {
    const recent = createApprovalHistoryEntry(
      request,
      "approve",
      "manual",
      1_000_000,
    );
    const old = createApprovalHistoryEntry(
      request,
      "deny",
      "timeout",
      1_000_000 - 16 * 60_000,
    );

    expect(recent).toMatchObject({
      command: request.command,
      decision: "approve",
      source: "manual",
      patternKeys: ["migration", "python"],
    });
    expect(pruneApprovalHistory([old, recent], 1_000_000, 15)).toEqual([
      recent,
    ]);
  });
});
