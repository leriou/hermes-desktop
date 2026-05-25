import { useRef, useState, useEffect, useCallback } from "react";

/**
 * Keeps a streaming text buffer that can be written to synchronously
 * (no React re-render) and read via a synced state for rendering.
 *
 * Writer: sets `ref.current` directly (fast, no render).
 * Reader: polls via rAF and updates state only when the value changed,
 * so React re-renders at most once per animation frame.
 */
export function useStreamingText() {
  const ref = useRef("");
  const [text, setText] = useState("");
  const lastTextRef = useRef("");
  const rafRef = useRef(0);

  const tick = useCallback(() => {
    const next = ref.current;
    if (next !== lastTextRef.current) {
      setText(next);
      lastTextRef.current = next;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // Start polling
  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [tick]);

  return { ref, text };
}
