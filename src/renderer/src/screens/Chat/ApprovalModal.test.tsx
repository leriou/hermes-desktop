import { fireEvent, render, act } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { ApprovalModal } from "./ApprovalModal";
import { DEFAULT_APPROVAL_POLICY } from "./approvalPolicy";

const request = {
  command:
    "python scripts/migrate.py --force --project /Users/xmli/code/hermes-desktop",
  description: "Run a local migration",
  patternKey: "python",
  patternKeys: ["python", "migration"],
};

describe("ApprovalModal", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the full command in a modal and sends one manual decision", () => {
    const onDecision = vi.fn();
    const { container } = render(
      <ApprovalModal
        request={request}
        policy={DEFAULT_APPROVAL_POLICY}
        submitting={false}
        onDecision={onDecision}
        onPolicyChange={vi.fn()}
      />,
    );

    expect(container.querySelector(".chat-approval-modal")).not.toBeNull();
    expect(
      container.querySelector(".chat-approval-command-full")?.textContent,
    ).toContain("--project");

    fireEvent.click(
      container.querySelector(".btn-primary") as HTMLButtonElement,
    );
    expect(onDecision).toHaveBeenCalledWith("approve", "manual");
  });

  it("auto decides when countdown expires", () => {
    vi.useFakeTimers();
    const onDecision = vi.fn();
    render(
      <ApprovalModal
        request={request}
        policy={{
          ...DEFAULT_APPROVAL_POLICY,
          mode: "countdown",
          timeoutSeconds: 2,
          timeoutAction: "deny",
        }}
        submitting={false}
        onDecision={onDecision}
        onPolicyChange={vi.fn()}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onDecision).toHaveBeenCalledWith("deny", "timeout");
  });

  it("surfaces local judgment advice without auto-deciding", () => {
    const { container } = render(
      <ApprovalModal
        request={request}
        policy={DEFAULT_APPROVAL_POLICY}
        submitting={false}
        judgmentAdvice={{
          kind: "approval",
          decision: "deny",
          confidence: 0.9,
          risk: "high",
          reason: "Command appears destructive or privilege-sensitive.",
          suggestedAction: "ask_user",
        }}
        onDecision={vi.fn()}
        onPolicyChange={vi.fn()}
      />,
    );

    expect(
      container.querySelector(".chat-approval-judgment")?.textContent,
    ).toContain("Judgment");
    expect(
      container.querySelector(".chat-approval-judgment")?.textContent,
    ).toContain("high");
    expect(
      container.querySelector(".chat-approval-judgment")?.textContent,
    ).toContain("90%");
  });
});
