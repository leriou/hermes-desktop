import { act, render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MessageList } from "./MessageList";
import { I18nProvider } from "../../components/I18nProvider";

export const mockScrollToIndex = vi.fn();

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

vi.mock("react-virtuoso", async () => {
  const React = await import("react");
  return {
    Virtuoso: React.forwardRef<any, any>(function MockVirtuoso(
      { scrollerRef, itemContent, data, atBottomStateChange },
      ref,
    ) {
      const containerRef = React.useRef<HTMLDivElement>(null);
      const atBottomStateChangeRef = React.useRef(atBottomStateChange);

      React.useEffect(() => {
        atBottomStateChangeRef.current = atBottomStateChange;
      }, [atBottomStateChange]);
      
      React.useImperativeHandle(ref, () => ({
        scrollToIndex: mockScrollToIndex.mockImplementation((options) => {
          const el = containerRef.current;
          if (el) {
            if (options && typeof options === "object" && "index" in options) {
              if (typeof el.scrollTo === "function") {
                el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
              } else {
                el.scrollTop = el.scrollHeight;
              }
            }
          }
        })
      }));

      React.useEffect(() => {
        if (containerRef.current && scrollerRef) {
          scrollerRef(containerRef.current);
        }
      }, [scrollerRef]);

      const handleScroll = React.useCallback(() => {
        const el = containerRef.current;
        if (!el || !atBottomStateChangeRef.current) return;
        const metrics = metricsMap.get(el);
        if (metrics) {
          const atBottom = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= 60;
          atBottomStateChangeRef.current(atBottom);
        }
      }, []);

      React.useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        el.addEventListener("scroll", handleScroll);
        if (atBottomStateChangeRef.current) {
          atBottomStateChangeRef.current(true);
        }
        return () => el.removeEventListener("scroll", handleScroll);
      }, [handleScroll]);

      return (
        <div
          ref={containerRef}
          style={{ height: "100%", overflowY: "auto" }}
          data-testid="mock-virtuoso"
        >
          {data.map((item, i) => (
            <div key={i}>{itemContent(i, item)}</div>
          ))}
        </div>
      );
    })
  };
});

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

describe("MessageList streaming scroll following", () => {
  beforeEach(() => {
    mockScrollToIndex.mockClear();
  });

  it("follows output when streamingText increases if the user is at the bottom", () => {
    let rerenderFn: any;
    act(() => {
      const { rerender } = render(
        <I18nProvider>
          <MessageList
            {...baseProps}
            isLoading={true}
            streamingText="a"
            scrollerRef={(node) => {
              if (node instanceof HTMLDivElement) {
                setScrollMetrics(node, {
                  scrollHeight: 1000,
                  clientHeight: 300,
                  scrollTop: 700, // at bottom
                });
              }
            }}
          />
        </I18nProvider>
      );
      rerenderFn = rerender;
    });

    // Initial render might trigger scrollToIndex when loading starts
    mockScrollToIndex.mockClear();

    // Simulates streaming update
    act(() => {
      rerenderFn(
        <I18nProvider>
          <MessageList
            {...baseProps}
            isLoading={true}
            streamingText="ab"
            scrollerRef={(node) => {
              if (node instanceof HTMLDivElement) {
                setScrollMetrics(node, {
                  scrollHeight: 1050, // grows
                  clientHeight: 300,
                  scrollTop: 750, // remains at bottom
                });
              }
            }}
          />
        </I18nProvider>
      );
    });

    expect(mockScrollToIndex).toHaveBeenCalled();
  });

  it("does not follow output when streamingText increases if the user has scrolled up", async () => {
    let containerElement: HTMLDivElement | null = null;
    let rerenderFn: any;
    act(() => {
      const { rerender } = render(
        <I18nProvider>
          <MessageList
            {...baseProps}
            isLoading={true}
            streamingText="a"
            scrollerRef={(node) => {
              containerElement = node as HTMLDivElement | null;
              if (node instanceof HTMLDivElement) {
                setScrollMetrics(node, {
                  scrollHeight: 1000,
                  clientHeight: 300,
                  scrollTop: 700, // at bottom
                });
              }
            }}
          />
        </I18nProvider>
      );
      rerenderFn = rerender;
    });

    // Initial render might trigger scrollToIndex when loading starts
    mockScrollToIndex.mockClear();

    // Simulates user scrolling up
    act(() => {
      if (containerElement) {
        setScrollMetrics(containerElement, {
          scrollHeight: 1000,
          clientHeight: 300,
          scrollTop: 400, // scrolled up, far from bottom
        });
        containerElement.dispatchEvent(new Event("scroll"));
      }
    });

    mockScrollToIndex.mockClear();

    // Simulates streaming update
    act(() => {
      rerenderFn(
        <I18nProvider>
          <MessageList
            {...baseProps}
            isLoading={true}
            streamingText="ab"
            scrollerRef={(node) => {
              containerElement = node as HTMLDivElement | null;
              if (node instanceof HTMLDivElement) {
                setScrollMetrics(node, {
                  scrollHeight: 1050, // grows
                  clientHeight: 300,
                  scrollTop: 400, // still scrolled up
                });
              }
            }}
          />
        </I18nProvider>
      );
    });

    expect(mockScrollToIndex).not.toHaveBeenCalled();
  });
});
