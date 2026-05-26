import { describe, expect, it } from "vitest";
import {
  baseSessionTitle,
  mergeContinuationLabels,
  parseTitleSegment,
  sessionDisplayPreview,
  sessionDisplayTitle,
} from "./sessionDisplay";
import type { ChatMessage } from "./types";

describe("session display helpers", () => {
  it("parses compress-generated title segments", () => {
    expect(parseTitleSegment("Research task #2")).toEqual({
      base: "Research task",
      segment: 2,
    });
    expect(baseSessionTitle("Research task #3")).toBe("Research task");
    expect(parseTitleSegment("Research task")).toBeNull();
  });

  it("falls back from title to preview to placeholder", () => {
    expect(
      sessionDisplayTitle({ title: "New Chat", preview: "first prompt" }),
    ).toBe("first prompt");
    expect(sessionDisplayTitle({ title: "", preview: "first prompt" })).toBe(
      "first prompt",
    );
    expect(sessionDisplayTitle({ title: null, preview: "" })).toBe("-");
  });

  it("uses segment metadata in previews without exposing it as the title", () => {
    expect(
      sessionDisplayTitle({
        title: "Plan migration #2",
        preview: "continue here",
      }),
    ).toBe("Plan migration");
    expect(
      sessionDisplayPreview({
        title: "Plan migration #2",
        preview: "continue here",
      }),
    ).toBe("Part 2 · continue here");
  });

  it("hides bare Message #N continuation labels in the transcript", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "Summarize this" },
      { id: "u2", role: "user", content: "Message #2" },
      { id: "a1", role: "agent", content: "continued" },
      { id: "u3", role: "user", content: "消息 #3：" },
    ];

    expect(mergeContinuationLabels(messages).map((m) => m.id)).toEqual([
      "u1",
      "a1",
      "u3",
    ]);
  });
});
