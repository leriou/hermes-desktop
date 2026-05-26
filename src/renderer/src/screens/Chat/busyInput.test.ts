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
});
