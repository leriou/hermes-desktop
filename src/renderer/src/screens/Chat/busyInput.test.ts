import { describe, expect, it } from "vitest";
import { describeBusyInput } from "./busyInput";

describe("describeBusyInput", () => {
  it("steers normal text into the running turn by default", () => {
    expect(describeBusyInput("add tests", "steer")).toEqual({
      kind: "steer",
      text: "add tests",
      displayText: "add tests",
    });
  });

  it("queues explicit /queue text without sending the slash command to Hermes", () => {
    expect(describeBusyInput("/queue run after this", "steer")).toEqual({
      kind: "queue",
      text: "run after this",
      displayText: "run after this",
    });
  });

  it("interrupts when configured for interrupt mode", () => {
    expect(describeBusyInput("replace the current turn", "interrupt")).toEqual({
      kind: "interrupt",
      text: "replace the current turn",
      displayText: "replace the current turn",
    });
  });

  it("handles /q shorthand for queue", () => {
    const action = describeBusyInput("/q some text", "steer");
    expect(action.kind).toBe("queue");
    expect(action.text).toBe("some text");
  });

  it("handles /queue with no text", () => {
    const action = describeBusyInput("/queue", "steer");
    expect(action.kind).toBe("queue");
    expect(action.text).toBe("");
  });

  it("defaults to steer mode for non-queue input", () => {
    const action = describeBusyInput("some input", "steer");
    expect(action.kind).toBe("steer");
    expect(action.text).toBe("some input");
  });

  it("defaults to interrupt mode when configured", () => {
    const action = describeBusyInput("stop now", "interrupt");
    expect(action.kind).toBe("interrupt");
    expect(action.text).toBe("stop now");
  });
});
