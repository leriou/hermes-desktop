import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageList } from "./MessageList";
import { I18nProvider } from "../../components/I18nProvider";
import type { ChatMessage } from "./types";

function makeMessages(count: number): ChatMessage[] {
  const msgs: ChatMessage[] = [];
  for (let i = 0; i < count; i++) {
    msgs.push(
      { id: `u${i}`, kind: "user", role: "user", content: `User message ${i}` },
      { id: `a${i}`, kind: "assistant", role: "agent", content: `Agent reply ${i}` },
    );
  }
  return msgs;
}

function makeToolRows(count: number): ChatMessage[] {
  const msgs: ChatMessage[] = [
    { id: "u0", kind: "user", role: "user", content: "Do many things" },
    { id: "a0", kind: "assistant", role: "agent", content: "" },
  ];
  for (let i = 0; i < count; i++) {
    msgs.push({
      id: `tc${i}`,
      kind: "tool_call",
      role: "agent",
      callId: `call-${i}`,
      name: `tool_${i}`,
      args: `{ "arg": ${i} }`,
      result: `Result ${i}`,
      success: i % 5 !== 0,
      durationS: 0.1 + i * 0.01,
    });
  }
  return msgs;
}

function renderWithI18n(ui: React.JSX.Element) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

describe("MessageList perf smoke: long transcript", () => {
  it("renders 100 user+agent pairs without crashing", () => {
    const messages = makeMessages(100);
    const start = performance.now();
    const { container } = renderWithI18n(
      <MessageList messages={messages} toolProgress={null} isLoading={false} />,
    );
    const elapsed = performance.now() - start;
    const bubbles = container.querySelectorAll(".chat-message");
    expect(bubbles.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(2000);
  });

  it("renders 200 tool call rows without crashing", () => {
    const messages = makeToolRows(200);
    const start = performance.now();
    renderWithI18n(
      <MessageList messages={messages} toolProgress={null} isLoading={false} />,
    );
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });

  it("renders mixed long transcript (50 turns + 100 tools) without crashing", () => {
    const msgs = [
      ...makeMessages(50),
      ...makeToolRows(100),
    ];
    const start = performance.now();
    const { container } = renderWithI18n(
      <MessageList messages={msgs} toolProgress={null} isLoading={false} />,
    );
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(3000);
    expect(container.querySelectorAll(".chat-message").length).toBeGreaterThan(0);
  });
});
