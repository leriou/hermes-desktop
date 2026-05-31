import { memo, useMemo } from "react";
import { AgentMarkdown } from "./AgentMarkdown";

/**
 * Incremental streaming markdown renderer.
 *
 * Instead of rebuilding the entire HTML on every text delta, we find the last
 * stable paragraph boundary (double newline) and render only the stable portion
 * through react-markdown (via AgentMarkdown). The trailing incomplete paragraph
 * is appended as raw text with a "streaming-tail" class.
 *
 * This prevents the full AST parse and React reconciliation overhead for every
 * streaming chunk, keeping the UI responsive during long streaming responses.
 */

function findStableBoundary(text: string): number {
  // Find the last double-newline boundary
  const idx = text.lastIndexOf("\n\n");
  // If no boundary found, or it's at the very start, the whole text is tail
  return idx > 0 ? idx : 0;
}

interface StreamingMarkdownProps {
  children: string;
}

const StreamingMarkdown = memo(function StreamingMarkdown({
  children,
}: StreamingMarkdownProps): React.JSX.Element {
  const { stableText, streamingTail } = useMemo(() => {
    if (!children) return { stableText: "", streamingTail: "" };

    const boundary = findStableBoundary(children);
    const stableText = boundary > 0 ? children.slice(0, boundary) : "";
    // The tail starts after the double newline
    const streamingTail =
      boundary > 0 ? children.slice(boundary + "\n\n".length) : children;

    return { stableText, streamingTail };
  }, [children]);

  // Edge case: completely empty
  if (!children) {
    return <div className="markdown-body sm-streaming" />;
  }

  // Edge case: no stable text — render everything as raw streaming tail
  if (!stableText) {
    return (
      <div className="markdown-body sm-streaming">
        <span className="streaming-tail">{children}</span>
      </div>
    );
  }

  // Edge case: no streaming tail — render only the stable part
  if (!streamingTail) {
    return (
      <div className="markdown-body sm-streaming">
        <AgentMarkdown>{stableText}</AgentMarkdown>
      </div>
    );
  }

  // Normal case: stable text + streaming tail
  return (
    <div className="markdown-body sm-streaming">
      <AgentMarkdown>{stableText}</AgentMarkdown>
      <span className="streaming-tail">{streamingTail}</span>
    </div>
  );
});

export { StreamingMarkdown };
export default StreamingMarkdown;
