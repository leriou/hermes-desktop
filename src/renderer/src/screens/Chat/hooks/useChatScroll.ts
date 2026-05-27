import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types";
import { isNearScrollBottom } from "../scrollState";

const SCROLL_TOP_THRESHOLD = 60;

export function useChatScroll(
  messages: ChatMessage[],
  isLoading: boolean,
  onLoadEarlier?: () => void,
  streamingText = "",
  streamingReasoning = "",
): {
  containerRef: React.RefObject<HTMLDivElement | null>;
  setContainerRef: (node: HTMLDivElement | null) => void;
  userScrolledUp: boolean;
  scrollToBottom: (force?: boolean, instant?: boolean) => void;
} {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const userScrolledUpRef = useRef(false);
  const prevMessageCountRef = useRef(messages.length);
  const loadEarlierTriggeredRef = useRef(false);
  
  const onLoadEarlierRef = useRef(onLoadEarlier);
  onLoadEarlierRef.current = onLoadEarlier;

  const scrollToBottom = useCallback(
    (force?: boolean, instant?: boolean) => {
      if (!force && userScrolledUpRef.current) return;
      const el = containerRef.current;
      if (!el) return;
      
      if (force) {
        userScrolledUpRef.current = false;
        setUserScrolledUp(false);
      }

      if (instant || isLoading || typeof el.scrollTo !== "function") {
        el.scrollTop = el.scrollHeight;
      } else {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    },
    [isLoading],
  );

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const isUp = !isNearScrollBottom(el);
    if (isUp !== userScrolledUpRef.current) {
      userScrolledUpRef.current = isUp;
      setUserScrolledUp(isUp);
    }

    if (
      onLoadEarlierRef.current &&
      el.scrollTop < SCROLL_TOP_THRESHOLD &&
      !loadEarlierTriggeredRef.current
    ) {
      loadEarlierTriggeredRef.current = true;
      onLoadEarlierRef.current();
    }
  }, []);

  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    if (containerRef.current) {
      containerRef.current.removeEventListener("scroll", handleScroll);
    }
    
    containerRef.current = node;

    if (node) {
      node.addEventListener("scroll", handleScroll, { passive: true });
      const isUp = !isNearScrollBottom(node);
      userScrolledUpRef.current = isUp;
      setUserScrolledUp(isUp);
    }
  }, [handleScroll]);

  useEffect(() => {
    loadEarlierTriggeredRef.current = false;
  }, [messages.length]);

  useEffect(() => {
    const prevCount = prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    const userJustSent =
      messages.length > prevCount &&
      messages[messages.length - 1]?.role === "user";
    if (userJustSent) {
      userScrolledUpRef.current = false;
      setUserScrolledUp(false);
      scrollToBottom(true);
    } else {
      scrollToBottom();
    }
  }, [messages, streamingText, streamingReasoning, scrollToBottom]);

  return { containerRef, setContainerRef, userScrolledUp, scrollToBottom };
}
