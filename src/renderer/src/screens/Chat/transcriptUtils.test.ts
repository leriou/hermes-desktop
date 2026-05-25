import { describe, it, expect } from "vitest";
import { buildChatTranscript } from "./transcriptUtils";
import type { ChatMessage } from "./types";

function msg(role: "user" | "agent", content: string): ChatMessage {
  return { id: `${role}-${content}`, role, content };
}

describe("buildChatTranscript (issue #298)", () => {
  it("returns an empty string for no messages", () => {
    expect(buildChatTranscript([], "text")).toBe("");
    expect(buildChatTranscript([], "markdown")).toBe("");
  });

  it("formats plain text with You / Hermes speakers", () => {
    const out = buildChatTranscript(
      [msg("user", "hi"), msg("agent", "hello there")],
      "text",
    );
    expect(out).toBe("You: hi\n\nHermes: hello there");
  });

  it("formats markdown with bold speaker headers", () => {
    const out = buildChatTranscript(
      [msg("user", "hi"), msg("agent", "hello there")],
      "markdown",
    );
    expect(out).toBe("**You:**\n\nhi\n\n**Hermes:**\n\nhello there");
  });

  it("trims surrounding whitespace from message content", () => {
    expect(buildChatTranscript([msg("user", "  spaced  ")], "text")).toBe(
      "You: spaced",
    );
  });

  it("maps the agent role to Hermes and user to You", () => {
    expect(buildChatTranscript([msg("agent", "x")], "text")).toBe("Hermes: x");
    expect(buildChatTranscript([msg("user", "x")], "text")).toBe("You: x");
  });

  it("omits compress continuation labels and system status chips", () => {
    const out = buildChatTranscript(
      [
        msg("user", "first"),
        msg("user", "Message #2"),
        {
          id: "status",
          kind: "system_status",
          role: "agent",
          tone: "success",
          title: "Session compressed",
        },
        msg("agent", "continued"),
      ],
      "text",
    );
    expect(out).toBe("You: first\n\nHermes: continued");
  });
});
