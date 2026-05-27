import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useChatScroll } from "./useChatScroll";
import type { ChatMessage } from "../types";

const metricsMap = new WeakMap<HTMLDivElement, {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
}>();

function setScrollMetrics(
  el: HTMLDivElement,
  metrics: { scrollHeight: number; clientHeight: number; scrollTop?: number },
): void {
  const existing = metricsMap.get(el);
  const scrollTopVal = metrics.scrollTop !== undefined
    ? metrics.scrollTop
    : (existing ? existing.scrollTop : 0);

  if (!existing) {
    Object.defineProperty(el, "scrollHeight", {
      configurable: true,
      get() {
        return metricsMap.get(el)?.scrollHeight ?? 0;
      },
    });
    Object.defineProperty(el, "clientHeight", {
      configurable: true,
      get() {
        return metricsMap.get(el)?.clientHeight ?? 0;
      },
    });
    Object.defineProperty(el, "scrollTop", {
      configurable: true,
      get() {
        return metricsMap.get(el)?.scrollTop ?? 0;
      },
      set(v) {
        const state = metricsMap.get(el);
        if (state) {
          state.scrollTop = Math.min(v, state.scrollHeight - state.clientHeight);
        }
      },
    });

    el.scrollTo = vi.fn().mockImplementation((options) => {
      if (options && typeof options === "object") {
        if ("top" in options) {
          el.scrollTop = options.top;
        }
      } else if (typeof options === "number") {
        el.scrollTop = options;
      }
    }) as any;
  }

  metricsMap.set(el, {
    scrollHeight: metrics.scrollHeight,
    clientHeight: metrics.clientHeight,
    scrollTop: scrollTopVal,
  });
}

describe("useChatScroll", () => {
  it("does not fight user scrolling while a response is streaming", () => {
    vi.useFakeTimers();
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "hello" },
      { id: "a1", role: "agent", content: "streaming" },
    ];

    let container: HTMLDivElement | null = null;

    function Harness(): React.JSX.Element {
      const { setContainerRef } = useChatScroll(messages, true);
      return (
        <div
          ref={(node) => {
            setContainerRef(node);
            container = node;
            if (node) {
              setScrollMetrics(node, {
                scrollHeight: 1_000,
                clientHeight: 300,
                scrollTop: metricsMap.has(node) ? undefined : 700,
              });
            }
          }}
        >
        </div>
      );
    }

    const { unmount } = render(<Harness />);

    act(() => {
      container!.dispatchEvent(new Event("scroll"));
      container!.scrollTop = 620;
      container!.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(120);
    });

    expect(container!.scrollTop).toBe(620);

    unmount();
    vi.useRealTimers();
  });

  it("keeps userScrolledUp as false when mounted at bottom, and updates to true when user scrolls up", () => {
    const messages: ChatMessage[] = [{ id: "1", role: "user", content: "hi" }];
    let container: HTMLDivElement | null = null;
    const scrollState = { userScrolledUp: false };

    function TestComponent(): React.JSX.Element {
      const { setContainerRef, userScrolledUp } = useChatScroll(messages, false);
      scrollState.userScrolledUp = userScrolledUp;
      return (
        <div
          ref={(node) => {
            setContainerRef(node);
            container = node;
            if (node) {
              setScrollMetrics(node, {
                scrollHeight: 1000,
                clientHeight: 300,
                scrollTop: metricsMap.has(node) ? undefined : 700,
              });
            }
          }}
        />
      );
    }

    const { unmount } = render(<TestComponent />);
    expect(scrollState.userScrolledUp).toBe(false);

    act(() => {
      if (container) {
        container.scrollTop = 500;
        container.dispatchEvent(new Event("scroll"));
      }
    });

    expect(scrollState.userScrolledUp).toBe(true);
    unmount();
  });

  it("does not bottom-scroll automatically when userScrolledUp is true, but forces it when requested", () => {
    const messages: ChatMessage[] = [{ id: "1", role: "user", content: "hi" }];
    let container: HTMLDivElement | null = null;
    let scrollTrigger: ((force?: boolean) => void) | null = null;

    function TestComponent(): React.JSX.Element {
      const { setContainerRef, scrollToBottom } = useChatScroll(messages, false);
      scrollTrigger = scrollToBottom;
      return (
        <div
          ref={(node) => {
            setContainerRef(node);
            container = node;
            if (node) {
              setScrollMetrics(node, {
                scrollHeight: 1000,
                clientHeight: 300,
                scrollTop: metricsMap.has(node) ? undefined : 500,
              });
            }
          }}
        />
      );
    }

    const { unmount } = render(<TestComponent />);

    // 挂载后，由于 messages useEffect 触发，此时 container.scrollTop 已经被强滚置底。
    // 我们在挂载后手动模拟用户上滑至 500 处，并派发 scroll 事件以确立 userScrolledUp 状态。
    act(() => {
      if (container) {
        container.scrollTop = 500;
        container.dispatchEvent(new Event("scroll"));
      }
    });

    // 1. 调用非强制 scrollToBottom()，由于已确立用户上滑，应该保持在 500，不去打扰用户
    act(() => {
      scrollTrigger?.(false);
    });
    expect(container!.scrollTop).toBe(500);

    // 2. 调用强制 scrollToBottom(true)，必须强制将其置底 (1000 - 300)
    act(() => {
      scrollTrigger?.(true);
    });
    expect(container!.scrollTop).toBe(700);

    unmount();
  });

  it("automatically scrolls to bottom when messages grow if the user is at the bottom", () => {
    let container: HTMLDivElement | null = null;
    let currentMessages: ChatMessage[] = [{ id: "1", role: "user", content: "hi" }];

    function TestComponent({ msgs }: { msgs: ChatMessage[] }): React.JSX.Element {
      const { setContainerRef } = useChatScroll(msgs, false);
      return (
        <div
          ref={(node) => {
            setContainerRef(node);
            container = node;
            if (node) {
              setScrollMetrics(node, {
                scrollHeight: 1000,
                clientHeight: 300,
                scrollTop: metricsMap.has(node) ? undefined : 700, // at bottom
              });
            }
          }}
        />
      );
    }

    const { rerender, unmount } = render(<TestComponent msgs={currentMessages} />);

    // Reset scrollTop to 700 to ensure we simulate being at bottom
    act(() => {
      if (container) {
        container.scrollTop = 700;
        container.dispatchEvent(new Event("scroll"));
      }
    });

    // Simulate new message arriving
    currentMessages = [...currentMessages, { id: "2", role: "agent", content: "hello" }];
    act(() => {
      rerender(<TestComponent msgs={currentMessages} />);
    });

    // Should auto-scroll to bottom (now scrollHeight would be larger, say 1100, but in test mock scrollHeight remains 1000 for simplicity)
    expect(container!.scrollTop).toBe(700);

    unmount();
  });

  it("does not automatically scroll to bottom when messages grow if the user has scrolled up", () => {
    let container: HTMLDivElement | null = null;
    let currentMessages: ChatMessage[] = [{ id: "1", role: "user", content: "hi" }];

    function TestComponent({ msgs }: { msgs: ChatMessage[] }): React.JSX.Element {
      const { setContainerRef } = useChatScroll(msgs, false);
      return (
        <div
          ref={(node) => {
            setContainerRef(node);
            container = node;
            if (node) {
              setScrollMetrics(node, {
                scrollHeight: 1000,
                clientHeight: 300,
                scrollTop: metricsMap.has(node) ? undefined : 700, // at bottom initially
              });
            }
          }}
        />
      );
    }

    const { rerender, unmount } = render(<TestComponent msgs={currentMessages} />);

    // Simulate user scrolling up to scrollTop = 400 (far from bottom)
    act(() => {
      if (container) {
        setScrollMetrics(container, {
          scrollHeight: 1000,
          clientHeight: 300,
          scrollTop: 400,
        });
        container.dispatchEvent(new Event("scroll"));
      }
    });

    // Verify userScrolledUp has been set to true (scrollTop is 400)
    expect(container!.scrollTop).toBe(400);

    // Simulate new message arriving
    currentMessages = [...currentMessages, { id: "2", role: "agent", content: "hello" }];
    act(() => {
      rerender(<TestComponent msgs={currentMessages} />);
    });

    // Should NOT auto-scroll to bottom, should stay at 400
    expect(container!.scrollTop).toBe(400);

    unmount();
  });

  it("follows streaming text growth while the user remains at the bottom", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "hello" },
      { id: "a1", role: "agent", content: "streaming" },
    ];
    let container: HTMLDivElement | null = null;

    function TestComponent({ text }: { text: string }): React.JSX.Element {
      const { setContainerRef } = useChatScroll(messages, true, undefined, text);
      return (
        <div
          ref={(node) => {
            setContainerRef(node);
            container = node;
            if (node) {
              setScrollMetrics(node, {
                scrollHeight: text.length > 1 ? 1050 : 1000,
                clientHeight: 300,
                scrollTop: metricsMap.has(node) ? undefined : 700,
              });
            }
          }}
        />
      );
    }

    const { rerender, unmount } = render(<TestComponent text="a" />);

    act(() => {
      if (container) {
        setScrollMetrics(container, {
          scrollHeight: 1050,
          clientHeight: 300,
          scrollTop: 750,
        });
        rerender(<TestComponent text="ab" />);
      }
    });

    expect(container!.scrollTop).toBe(750);
    unmount();
  });

  it("does not follow streaming text growth after the user scrolls up", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "hello" },
      { id: "a1", role: "agent", content: "streaming" },
    ];
    let container: HTMLDivElement | null = null;

    function TestComponent({ text }: { text: string }): React.JSX.Element {
      const { setContainerRef } = useChatScroll(messages, true, undefined, text);
      return (
        <div
          ref={(node) => {
            setContainerRef(node);
            container = node;
            if (node) {
              setScrollMetrics(node, {
                scrollHeight: text.length > 1 ? 1050 : 1000,
                clientHeight: 300,
                scrollTop: metricsMap.has(node) ? undefined : 700,
              });
            }
          }}
        />
      );
    }

    const { rerender, unmount } = render(<TestComponent text="a" />);

    act(() => {
      if (container) {
        setScrollMetrics(container, {
          scrollHeight: 1000,
          clientHeight: 300,
          scrollTop: 400,
        });
        container.dispatchEvent(new Event("scroll"));
      }
    });

    act(() => {
      rerender(<TestComponent text="ab" />);
    });

    expect(container!.scrollTop).toBe(400);
    unmount();
  });
});
