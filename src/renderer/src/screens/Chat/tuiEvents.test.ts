import { describe, expect, it } from "vitest";
import {
  classifyEvent,
  normalizeApprovalRequest,
  normalizeClarifyRequest,
  normalizeSecretRequest,
  normalizeTuiEvent,
  textFromPayload,
} from "./tuiEvents";

describe("TUI gateway event helpers", () => {
  it("normalizes session ids from both gateway envelopes", () => {
    expect(
      normalizeTuiEvent({ type: "message.delta", sid: "sid-a" }),
    ).toMatchObject({
      type: "message.delta",
      sessionId: "sid-a",
    });
    expect(
      normalizeTuiEvent({ type: "message.delta", session_id: "sid-b" }),
    ).toMatchObject({
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

    expect(
      normalizeClarifyRequest({ choices: ["yes", 1, "no"] }).choices,
    ).toEqual(["yes", "no"]);
  });
});

describe("classifyEvent", () => {
  it("classifies streaming events as additive", () => {
    expect(classifyEvent("message.delta")).toEqual({
      category: "additive",
      safeAfterAbort: false,
    });
    expect(classifyEvent("thinking.delta")).toEqual({
      category: "additive",
      safeAfterAbort: false,
    });
    expect(classifyEvent("reasoning.delta")).toEqual({
      category: "additive",
      safeAfterAbort: false,
    });
  });

  it("classifies terminal events", () => {
    expect(classifyEvent("message.complete")).toEqual({
      category: "terminal",
      safeAfterAbort: true,
    });
    expect(classifyEvent("error")).toEqual({
      category: "terminal",
      safeAfterAbort: true,
    });
  });

  it("classifies tool events as additive", () => {
    expect(classifyEvent("tool.start")).toEqual({
      category: "additive",
      safeAfterAbort: false,
    });
    expect(classifyEvent("tool.complete")).toEqual({
      category: "additive",
      safeAfterAbort: false,
    });
    expect(classifyEvent("tool.progress")).toEqual({
      category: "additive",
      safeAfterAbort: false,
    });
  });

  it("classifies status-only events", () => {
    expect(classifyEvent("message.start")).toEqual({
      category: "status",
      safeAfterAbort: true,
    });
    expect(classifyEvent("status.update")).toEqual({
      category: "status",
      safeAfterAbort: true,
    });
    expect(classifyEvent("tool.generating")).toEqual({
      category: "status",
      safeAfterAbort: true,
    });
  });

  it("classifies interaction request events as status", () => {
    expect(classifyEvent("approval.request")).toEqual({
      category: "status",
      safeAfterAbort: false,
    });
    expect(classifyEvent("clarify.request")).toEqual({
      category: "status",
      safeAfterAbort: false,
    });
    expect(classifyEvent("sudo.request")).toEqual({
      category: "status",
      safeAfterAbort: false,
    });
    expect(classifyEvent("secret.request")).toEqual({
      category: "status",
      safeAfterAbort: false,
    });
  });

  it("classifies unknown events as ignored", () => {
    expect(classifyEvent("some.random.event")).toEqual({
      category: "ignored",
      safeAfterAbort: true,
    });
  });
});
