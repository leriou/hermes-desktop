import { describe, expect, it } from "vitest";
import { buildRenderableTranscript } from "./renderTranscript";
import type { ChatMessage } from "./types";

describe("buildRenderableTranscript", () => {
  it("processes historical messages by merging continuation labels, grouping tool calls, and filtering empty bubbles", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "Hello" },
      { id: "u2", role: "user", content: "Message #2" }, // continuation label to be filtered/merged
      { id: "a1", role: "agent", content: "" }, // empty bubble to be filtered
      {
        id: "tc1",
        kind: "tool_call",
        role: "agent",
        callId: "call-1",
        name: "read_file",
        args: "{}",
      },
      {
        id: "tr1",
        kind: "tool_result",
        role: "agent",
        callId: "call-1",
        name: "read_file",
        content: "file content",
      },
      {
        id: "tc2",
        kind: "tool_call",
        role: "agent",
        callId: "call-2",
        name: "read_file",
        args: "{}",
      },
      {
        id: "tr2",
        kind: "tool_result",
        role: "agent",
        callId: "call-2",
        name: "read_file",
        content: "file content 2",
      },
      { id: "a2", role: "agent", content: "Finished" },
    ];

    const result = buildRenderableTranscript({
      messages,
      isLoading: false,
      toolProgress: null,
    });

    // 预期：
    // 1. "u2" (continuation) 被合并/移除
    // 2. "a1" (空 bubble) 被过滤
    // 3. "tc1" & "tr1", "tc2" & "tr2" 被合并且由于 name 相同被 group 进 "tool_group"
    // 4. "a2" 被保留
    expect(result.map((m) => m.id)).toEqual(["u1", "group-tc1-tc2", "a2"]);

    const group = result[1] as any;
    expect(group.kind).toBe("tool_group");
    expect(group.calls).toHaveLength(2);
    expect(group.calls[0].result).toBe("file content");
    expect(group.calls[1].result).toBe("file content 2");
  });

  it("appends live_reasoning when streaming reasoning text during loading", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "Hello" },
    ];

    const result = buildRenderableTranscript({
      messages,
      isLoading: true,
      toolProgress: null,
      streamingReasoning: "Thinking about the question...",
    });

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("u1");
    expect(result[1]).toEqual({
      id: "live-reasoning",
      kind: "live_reasoning",
      role: "agent",
      text: "Thinking about the question...",
    });
    expect(result[2]).toEqual({
      id: "typing",
      kind: "typing",
      role: "agent",
      toolProgress: null,
    });
  });

  it("appends live_assistant when streaming assistant text during loading", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "Hello" },
    ];

    const result = buildRenderableTranscript({
      messages,
      isLoading: true,
      toolProgress: null,
      streamingText: "Hello there",
    });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("u1");
    expect(result[1]).toEqual({
      id: "live-assistant",
      kind: "live_assistant",
      role: "agent",
      content: "Hello there",
    });
  });

  it("appends both live_reasoning and live_assistant in order when both are streaming", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "Hello" },
    ];

    const result = buildRenderableTranscript({
      messages,
      isLoading: true,
      toolProgress: null,
      streamingReasoning: "Hmm...",
      streamingText: "Hello there",
    });

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("u1");
    expect(result[1]).toMatchObject({
      id: "live-reasoning",
      kind: "live_reasoning",
      text: "Hmm...",
    });
    expect(result[2]).toMatchObject({
      id: "live-assistant",
      kind: "live_assistant",
      content: "Hello there",
    });
  });

  it("renders typing indicator when isLoading and lastMessageIsAgent is false and no streaming text", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "Hello" },
    ];

    const result = buildRenderableTranscript({
      messages,
      isLoading: true,
      toolProgress: "Searching files...",
    });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("u1");
    expect(result[1]).toEqual({
      id: "typing",
      kind: "typing",
      role: "agent",
      toolProgress: "Searching files...",
    });
  });

  it("renders inline tool progress when isLoading and lastMessageIsAgent is true", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "Hello" },
      { id: "a1", role: "agent", content: "I am working" },
    ];

    const result = buildRenderableTranscript({
      messages,
      isLoading: true,
      toolProgress: "Writing test cases...",
    });

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("u1");
    expect(result[1].id).toBe("a1");
    expect(result[2]).toEqual({
      id: "tool-progress",
      kind: "tool_progress",
      role: "agent",
      content: "Writing test cases...",
    });
  });

  it("renders inline tool progress when isLoading and streamingText is present, even if lastMessageIsAgent is false", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "Hello" },
    ];

    const result = buildRenderableTranscript({
      messages,
      isLoading: true,
      toolProgress: "Computing...",
      streamingText: "Result: ",
    });

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("u1");
    expect(result[1]).toMatchObject({
      kind: "live_assistant",
      content: "Result: ",
    });
    expect(result[2]).toEqual({
      id: "tool-progress",
      kind: "tool_progress",
      role: "agent",
      content: "Computing...",
    });
  });
});
