import { memo, useMemo } from "react";

/**
 * Cheap regex-based markdown renderer for the streaming phase.
 * Avoids react-markdown's AST parse cost. Handles:
 * - fenced code blocks (``` ... ```)
 * - bold (**text**)
 * - italic (*text*)
 * - inline code (`code`)
 * - line breaks
 */
function renderLightweightMd(raw: string): string {
  // Escape HTML to prevent XSS (we trust gateway output but be safe)
  let text = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Fenced code blocks
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    return `<div class="sm-code-block"><div class="sm-code-header"><span>${lang || "code"}</span></div><pre><code>${code}</code></pre></div>`;
  });
  // Incomplete trailing code block (streaming in progress)
  text = text.replace(/```(\w*)\n([\s\S]*)$/g, (_match, lang, code) => {
    return `<div class="sm-code-block sm-code-streaming"><div class="sm-code-header"><span>${lang || "code"}</span></div><pre><code>${code}</code></pre></div>`;
  });

  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic (single *, not preceded/followed by *)
  text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
  // Inline code
  text = text.replace(/`([^`]+)`/g, "<code class=\"sm-inline-code\">$1</code>");
  // Line breaks
  text = text.replace(/\n/g, "<br>");

  return text;
}

const StreamingMarkdown = memo(function StreamingMarkdown({
  children,
}: {
  children: string;
}): React.JSX.Element {
  const html = useMemo(() => renderLightweightMd(children), [children]);
  return (
    <div
      className="markdown-body sm-streaming"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

export { StreamingMarkdown };
export default StreamingMarkdown;
