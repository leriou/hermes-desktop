import { describe, expect, it } from "vitest";
import {
  normalizeApprovalRequest,
  normalizeClarifyRequest,
  normalizeSecretRequest,
  normalizeTuiEvent,
  textFromPayload,
} from "./tuiEvents";

describe("TUI gateway event helpers", () => {
  it("normalizes session ids from both gateway envelopes", () => {
    expect(normalizeTuiEvent({ type: "message.delta", sid: "sid-a" })).toMatchObject({
      type: "message.delta",
      sessionId: "sid-a",
    });
    expect(normalizeTuiEvent({ type: "message.delta", session_id: "sid-b" })).toMatchObject({
      type: "message.delta",
      sessionId: "sid-b",
    });
  });

  it("extracts streaming and final text without leaking non-string payloads into chat", () => {
    expect(textFromPayload({ text: "hello" })).toBe("hello");
    expect(textFromPayload({ rendered: "fallback" })).toBe("fallback");
    expect(textFromPayload({ text: { nested: true }, rendered: 42 })).toBe("");
  });

  it("normalizes approval and clarify requests from snake_case gateway fields", () => {
    expect(
      normalizeApprovalRequest({
        command: "rm tmp",
        description: "delete temp",
        pattern_key: "danger",
        pattern_keys: ["danger", "write"],
      }),
    ).toEqual({
      command: "rm tmp",
      description: "delete temp",
      patternKey: "danger",
      patternKeys: ["danger", "write"],
    });

    expect(
      normalizeClarifyRequest({
        request_id: "c1",
        question: "Which file?",
        choices: ["a", "b"],
      }),
    ).toEqual({
      requestId: "c1",
      question: "Which file?",
      choices: ["a", "b"],
    });
  });

  it("normalizes secret request prompts and drops non-string choices", () => {
    expect(
      normalizeSecretRequest({
        request_id: "s1",
        env_var: "OPENAI_API_KEY",
        prompt: "API key",
      }),
    ).toEqual({
      requestId: "s1",
      envVar: "OPENAI_API_KEY",
      prompt: "API key",
    });

    expect(normalizeClarifyRequest({ choices: ["yes", 1, "no"] }).choices).toEqual(["yes", "no"]);
  });
});
