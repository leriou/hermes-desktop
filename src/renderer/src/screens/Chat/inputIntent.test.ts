import { describe, expect, it } from "vitest";
import { describeInputIntent } from "./inputIntent";

describe("describeInputIntent", () => {
  it("routes clarify answers before slash or busy handling", () => {
    expect(describeInputIntent({ text: "/model gpt-4o", isLoading: true, hasClarify: true })).toEqual({
      kind: "clarify",
      text: "/model gpt-4o",
    });
  });

  it("treats slash commands as gateway commands when idle", () => {
    expect(describeInputIntent({ text: "/compress", isLoading: false, hasClarify: false })).toEqual({
      kind: "gateway_command",
      text: "/compress",
      command: "/compress",
      canRunWhileBusy: false,
    });
  });

  it("allows steer slash command while a turn is running", () => {
    expect(describeInputIntent({ text: "/steer focus on tests", isLoading: true, hasClarify: false })).toEqual({
      kind: "gateway_command",
      text: "/steer focus on tests",
      command: "/steer",
      canRunWhileBusy: true,
    });
  });

  it("maps busy normal input to steer and explicit queue to queue", () => {
    expect(describeInputIntent({ text: "add tests", isLoading: true, hasClarify: false })).toMatchObject({
      kind: "busy",
      action: { kind: "steer", text: "add tests" },
    });
    expect(describeInputIntent({ text: "/queue next task", isLoading: true, hasClarify: false })).toMatchObject({
      kind: "busy",
      action: { kind: "queue", text: "next task" },
    });
  });

  it("returns prompt for idle normal input", () => {
    expect(describeInputIntent({ text: "hello", isLoading: false, hasClarify: false })).toEqual({
      kind: "prompt",
      text: "hello",
    });
  });
});
