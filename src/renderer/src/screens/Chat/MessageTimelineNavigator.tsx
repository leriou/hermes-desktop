import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import type { ChatMessage } from "./types";

interface MessageTimelineNavigatorProps {
  messages: ChatMessage[];
  containerRef: React.RefObject<HTMLDivElement | null>;
}

interface UserMessagePosition {
  id: string;
  percent: number; // 0 to 1
  offsetTop: number;
  timeText: string;
  summaryText: string;
}

export function MessageTimelineNavigator({
  messages,
  containerRef,
}: MessageTimelineNavigatorProps): React.JSX.Element | null {
  const [positions, setPositions] = useState<UserMessagePosition[]>([]);
  const [isHovered, setIsHovered] = useState(false);
  const [mouseY, setMouseY] = useState<number | null>(null);
  const [showNavigator, setShowNavigator] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const isScrollingRef = useRef(false);
  const scrollLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter only visible user bubbles that have content.
  const userMessages = useMemo(() => {
    return messages.filter(
      (m) =>
        m.role === "user" &&
        (!("kind" in m) || !m.kind || m.kind === "user") &&
        ((m as any).content || "").trim().length > 0
    );
  }, [messages]);

  // Recalculate node positions in scroll container
  const measurePositions = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    // Show only when content is long enough (scrollHeight > 1.5 * clientHeight)
    if (scrollHeight <= clientHeight * 1.5 || userMessages.length === 0) {
      setShowNavigator(false);
      return;
    }

    setShowNavigator(true);

    const userDomNodes = container.querySelectorAll(".chat-message-user");
    const newPositions: UserMessagePosition[] = [];

    // Map DOM elements to our filtered user messages
    userMessages.forEach((msg, idx) => {
      const node = userDomNodes[idx] as HTMLElement;
      if (node) {
        const nodeMid = node.offsetTop + node.offsetHeight / 2;
        const percent = Math.min(1, Math.max(0, nodeMid / scrollHeight));
        
        let timeText = "";
        if ("timestamp" in msg && msg.timestamp) {
          timeText = new Date(msg.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
        }

        const rawContent = (msg as any).content || "";
        const summaryText =
          rawContent.length > 25 ? rawContent.slice(0, 22) + "…" : rawContent;

        newPositions.push({
          id: msg.id,
          percent,
          offsetTop: node.offsetTop,
          timeText,
          summaryText,
        });
      }
    });

    setPositions(newPositions);
  }, [userMessages, containerRef]);

  // Handle Resize and Message changes
  useEffect(() => {
    measurePositions();

    const container = containerRef.current;
    if (!container) return;

    let observer: ResizeObserver | null = null;
    if (typeof window !== "undefined" && "ResizeObserver" in window) {
      observer = new ResizeObserver(() => {
        measurePositions();
      });
      observer.observe(container);
    }

    return () => {
      if (observer) {
        observer.disconnect();
      }
    };
  }, [measurePositions, containerRef, messages.length]);

  // Listen to scrolling to prevent dynamic fisheye calculations during page scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      isScrollingRef.current = true;
      setIsScrolling(true);
      if (scrollLockTimerRef.current) clearTimeout(scrollLockTimerRef.current);
      
      scrollLockTimerRef.current = setTimeout(() => {
        isScrollingRef.current = false;
        setIsScrolling(false);
      }, 150);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (scrollLockTimerRef.current) clearTimeout(scrollLockTimerRef.current);
    };
  }, [containerRef]);

  // Hover delay to prevent accidental activations
  const handleMouseEnter = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setIsHovered(true);
    }, 150);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setIsHovered(false);
    setMouseY(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isHovered || !trackRef.current || isScrollingRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    setMouseY(relativeY);
  };

  const handleMarkerClick = (offsetTop: number) => {
    const container = containerRef.current;
    if (!container) return;
    // Scroll so that the message is positioned near the top-middle of view
    const targetScroll = Math.max(0, offsetTop - 40);
    container.scrollTo({
      top: targetScroll,
      behavior: "smooth",
    });
  };

  if (!showNavigator || positions.length === 0) return null;

  // Layout sizes
  const collapsedHeight = 160;
  const expandedHeight = Math.min(600, (containerRef.current?.clientHeight || 500) * 0.8);
  const activeHeight = isHovered ? expandedHeight : collapsedHeight;

  // Fisheye constants
  const sigma = 32;
  const amp = 24;

  const markers = positions.map((pos) => {
    const baseY = pos.percent * activeHeight;
    let offsetY = 0;
    let scale = 1.0;
    let isClose = false;

    if (isHovered && mouseY !== null && !isScrolling) {
      const d = baseY - mouseY;
      // High-precision physical simulation: Gaussian pushing and scale magnification
      offsetY = amp * (d / sigma) * Math.exp(-(d * d) / (2 * sigma * sigma));
      scale = 1 + 1.2 * Math.exp(-(d * d) / (2 * 20 * 20));
      isClose = Math.abs(d) < 28;
    }

    return {
      ...pos,
      baseY,
      y: baseY + offsetY,
      scale,
      isClose,
    };
  });

  return (
    <div
      className={`chat-timeline-navigator ${isHovered ? "chat-timeline-navigator--expanded" : ""} ${isScrolling ? "chat-timeline-navigator--scrolling" : ""}`}
      style={{ height: `${activeHeight}px` }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      ref={trackRef}
    >
      <div className="chat-timeline-line-rail" />
      {markers.map((marker, idx) => {
        // Show all nodes if hovered, otherwise only show first and last nodes
        const isBoundary = idx === 0 || idx === markers.length - 1;
        const visible = isHovered || isBoundary;

        return (
          <button
            key={marker.id}
            className={`chat-timeline-marker ${isBoundary ? "chat-timeline-marker--boundary" : ""} ${marker.isClose ? "chat-timeline-marker--close" : ""}`}
            style={{
              transform: `translateY(${marker.y}px) scale(${marker.scale})`,
              opacity: visible ? 1 : 0.25,
            }}
            onClick={() => handleMarkerClick(marker.offsetTop)}
            title={marker.summaryText}
            aria-label={`Go to user message at ${marker.timeText}`}
          >
            <span className="chat-timeline-marker-dot" />
            {isHovered && (
              <span className={`chat-timeline-tooltip ${marker.isClose ? "chat-timeline-tooltip--visible" : ""}`}>
                <span className="chat-timeline-tooltip-time">{marker.timeText}</span>
                <span className="chat-timeline-tooltip-text">{marker.summaryText}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
