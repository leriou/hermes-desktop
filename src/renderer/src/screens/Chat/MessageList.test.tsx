import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageList } from "./MessageList";

const baseProps = {
  messages: [],
  toolProgress: null,
};

describe("MessageList pending request bars", () => {
  it("does not render sudo or secret prompts in the transcript", () => {
    const { container } = render(<MessageList {...baseProps} isLoading />);

    expect(container.querySelector(".chat-sudo-bar")).toBeNull();
    expect(container.querySelector(".chat-secret-bar")).toBeNull();
  });
});

describe("MessageList system events", () => {
  it("renders model switch, compression, and provider errors outside agent bubbles", () => {
    const { container } = render(
      <MessageList
        {...baseProps}
        isLoading={false}
        messages={[
          {
            id: "model",
            kind: "system_event",
            role: "system",
            event: "model_switch",
            tone: "success",
            title: "Model switched",
            content: "gpt-4o-mini",
          },
          {
            id: "compress",
            kind: "system_event",
            role: "system",
            event: "context_compress",
            tone: "success",
            title: "Session compressed",
            content: "12k -> 4k tokens",
          },
          {
            id: "error",
            kind: "system_event",
            role: "system",
            event: "provider_error",
            tone: "error",
            title: "Provider error 429",
            content: "Rate limit exceeded",
          },
        ]}
      />,
    );

    expect(container.querySelectorAll(".chat-event-row")).toHaveLength(3);
    expect(container.querySelector(".chat-message-agent")).toBeNull();
    expect(container.textContent).toContain("Provider error 429");
  });

  it("renders system events with icon, title, content, and code badge", () => {
    const { container } = render(
      <MessageList
        {...baseProps}
        isLoading={false}
        messages={[
          {
            id: "error",
            kind: "system_event",
            role: "system",
            event: "provider_error",
            tone: "error",
            title: "Provider error 1305",
            content: "Model overloaded",
            code: "1305",
          },
        ]}
      />,
    );

    const row = container.querySelector(".chat-event-row");
    expect(row).not.toBeNull();
    expect(row!.querySelector(".chat-event-icon")).not.toBeNull();
    expect(row!.querySelector(".chat-event-title")?.textContent).toBe("Provider error 1305");
    expect(row!.querySelector(".chat-event-content")?.textContent).toBe("Model overloaded");
    expect(row!.querySelector(".chat-event-code")?.textContent).toBe("1305");
  });
});
