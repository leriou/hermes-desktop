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

    expect(container.querySelectorAll(".chat-system-event")).toHaveLength(3);
    expect(container.querySelector(".chat-message-agent")).toBeNull();
    expect(
      container.querySelector(".chat-system-event-error")?.textContent,
    ).toContain("Provider error 429");
  });

  it("renders system events as a compact event rail with expandable detail", () => {
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

    expect(container.querySelector(".chat-system-event-rail")).not.toBeNull();
    const details = container.querySelector(
      "details.chat-system-event",
    ) as HTMLDetailsElement;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(container.textContent).toContain("Provider error 1305");
    expect(container.textContent).toContain("1305");
  });
});
