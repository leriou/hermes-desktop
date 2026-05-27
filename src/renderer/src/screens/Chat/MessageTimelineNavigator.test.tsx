import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MessageTimelineNavigator } from "./MessageTimelineNavigator";
import type { ChatMessage } from "./types";

describe("MessageTimelineNavigator", () => {
  beforeEach(() => {
    (globalThis as any).ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it("filters user messages and renders markers when scroll container is long enough", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "hello first message", timestamp: 1716739200000 },
      { id: "a1", role: "agent", content: "agent reply" },
      { id: "u2", role: "user", content: "user reply 2", timestamp: 1716739201000 },
    ];

    // Create a mocked scroll container with coordinates
    const container = document.createElement("div");
    Object.defineProperty(container, "scrollHeight", { value: 600, writable: true });
    Object.defineProperty(container, "clientHeight", { value: 200, writable: true });
    container.scrollTo = vi.fn();

    // Append fake elements to match selector
    const node1 = document.createElement("div");
    node1.className = "chat-message-user";
    Object.defineProperty(node1, "offsetTop", { value: 50 });
    Object.defineProperty(node1, "offsetHeight", { value: 40 });

    const node2 = document.createElement("div");
    node2.className = "chat-message-user";
    Object.defineProperty(node2, "offsetTop", { value: 300 });
    Object.defineProperty(node2, "offsetHeight", { value: 40 });

    container.appendChild(node1);
    container.appendChild(node2);

    const containerRef = { current: container };

    const { container: rendered } = render(
      <MessageTimelineNavigator messages={messages} containerRef={containerRef} />
    );

    // Expect timeline navigator track to exist
    const navigator = rendered.querySelector(".chat-timeline-navigator");
    expect(navigator).toBeTruthy();

    // Verify markers
    const markers = screen.getAllByRole("button");
    expect(markers).toHaveLength(2); // Two user messages should be filtered

    // Verify tooltip titles
    expect(markers[0].getAttribute("title")).toBe("hello first message");
    expect(markers[1].getAttribute("title")).toBe("user reply 2");
  });

  it("includes backward-compatible user bubble messages with kind user", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", kind: "user", content: "legacy user bubble", timestamp: 1716739200000 },
      { id: "a1", role: "agent", kind: "assistant", content: "agent reply" },
    ];

    const container = document.createElement("div");
    Object.defineProperty(container, "scrollHeight", { value: 600, writable: true });
    Object.defineProperty(container, "clientHeight", { value: 200, writable: true });

    const node1 = document.createElement("div");
    node1.className = "chat-message-user";
    Object.defineProperty(node1, "offsetTop", { value: 50 });
    Object.defineProperty(node1, "offsetHeight", { value: 40 });
    container.appendChild(node1);

    const containerRef = { current: container };

    render(<MessageTimelineNavigator messages={messages} containerRef={containerRef} />);

    expect(screen.getByRole("button", { name: /go to user message/i })).toHaveAttribute(
      "title",
      "legacy user bubble",
    );
  });

  it("does not render when the scroll container is short", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "hello first message", timestamp: 1716739200000 },
    ];

    const container = document.createElement("div");
    Object.defineProperty(container, "scrollHeight", { value: 220, writable: true });
    Object.defineProperty(container, "clientHeight", { value: 200, writable: true });

    const containerRef = { current: container };

    const { container: rendered } = render(
      <MessageTimelineNavigator messages={messages} containerRef={containerRef} />
    );

    const navigator = rendered.querySelector(".chat-timeline-navigator");
    expect(navigator).toBeNull();
  });
});
