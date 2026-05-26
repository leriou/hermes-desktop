import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageList } from "./MessageList";

const baseProps = {
  messages: [],
  toolProgress: null,
  onSudoRespond: vi.fn(),
  onSecretRespond: vi.fn(),
};

describe("MessageList pending request bars", () => {
  it("shows secret requests while a turn is loading", () => {
    const onSecretRespond = vi.fn();
    const { container } = render(
      <MessageList
        {...baseProps}
        isLoading
        pendingSecret={{ requestId: "s1", envVar: "OPENAI_API_KEY", prompt: "API key" }}
        onSecretRespond={onSecretRespond}
      />,
    );

    const input = container.querySelector(".chat-secret-bar input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "secret" } });
    fireEvent.click(container.querySelector(".chat-secret-bar button") as HTMLButtonElement);

    expect(onSecretRespond).toHaveBeenCalledWith("secret");
  });

  it("shows sudo requests while a turn is loading", () => {
    const onSudoRespond = vi.fn();
    const { container } = render(
      <MessageList
        {...baseProps}
        isLoading
        pendingSudo={{ requestId: "sudo-1" }}
        onSudoRespond={onSudoRespond}
      />,
    );

    const input = container.querySelector(".chat-sudo-bar input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "pw" } });
    fireEvent.click(container.querySelector(".chat-sudo-bar button") as HTMLButtonElement);

    expect(onSudoRespond).toHaveBeenCalledWith("pw");
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
    expect(container.querySelector(".chat-system-event-error")?.textContent).toContain("Provider error 429");
  });
});
