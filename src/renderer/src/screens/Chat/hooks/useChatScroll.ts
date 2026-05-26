import { useCallback, useEffect, useRef } from "react";
import type { ChatMessage } from "../types";
import { isNearScrollBottom } from "../scrollState";

const STREAM_SCROLL_INTERVAL_MS = 80;

export function useChatScroll(
  messages: ChatMessage[],
  isLoading: boolean,
): {
  containerRef: React.RefObject<HTMLDivElement | null>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const prevMessageCountRef = useRef(messages.length);
  const streamingRafRef = useRef<number>(0);
  const streamingTimerRef = useRef<number>(0);

  const scrollToBottom = useCallback(
    (force?: boolean, instant?: boolean) => {
      if (!force && userScrolledUpRef.current) return;
      const el = containerRef.current;
      if (!el) return;
      if (instant || isLoading) {
        el.scrollTop = el.scrollHeight;
      } else {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    },
    [isLoading],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    function handleScroll(): void {
      const el = container!;
      userScrolledUpRef.current = !isNearScrollBottom(el);
    }
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll on incoming messages; force-scroll when user sends a new one
  useEffect(() => {
    const prevCount = prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    const userJustSent =
      messages.length > prevCount &&
      messages[messages.length - 1]?.role === "user";
    if (userJustSent) {
      userScrolledUpRef.current = false;
      scrollToBottom(true);
    } else {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  // During streaming, sync scroll via rAF for smooth tracking
  useEffect(() => {
    if (!isLoading) {
      if (streamingRafRef.current) {
        cancelAnimationFrame(streamingRafRef.current);
        streamingRafRef.current = 0;
      }
      if (streamingTimerRef.current) {
        clearTimeout(streamingTimerRef.current);
        streamingTimerRef.current = 0;
      }
      return;
    }
    function tick(): void {
      const el = containerRef.current;
      if (el && !userScrolledUpRef.current) {
        el.scrollTop = el.scrollHeight;
      }
      streamingTimerRef.current = window.setTimeout(() => {
        streamingTimerRef.current = 0;
        streamingRafRef.current = requestAnimationFrame(tick);
      }, STREAM_SCROLL_INTERVAL_MS);
    }
    streamingRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (streamingRafRef.current) {
        cancelAnimationFrame(streamingRafRef.current);
        streamingRafRef.current = 0;
      }
      if (streamingTimerRef.current) {
        clearTimeout(streamingTimerRef.current);
        streamingTimerRef.current = 0;
      }
    };
  }, [isLoading]);

  return { containerRef, bottomRef };
}
