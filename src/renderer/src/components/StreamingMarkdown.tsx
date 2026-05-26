import { memo, useMemo } from "react";

/**
 * Cheap regex-based markdown renderer for the streaming phase.
 * Avoids react-markdown's AST parse cost. Handles:
 * - fenced code blocks (``` ... ```)
 * - completed GFM table blocks
 * - bold (**text**)
 * - italic (*text*)
 * - inline code (`code`)
 * - line breaks
 */
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.split("|").length >= 4;
}

function isSeparatorRow(line: string): boolean {
  if (!isTableRow(line)) return false;
  return line
    .trim()
    .slice(1, -1)
    .split("|")
    .every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function splitCells(line: string): string[] {
  return line.trim().slice(1, -1).split("|").map((cell) => cell.trim());
}

function renderCompletedTables(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (!isTableRow(lines[i]) || !isSeparatorRow(lines[i + 1] ?? "")) {
      out.push(lines[i]);
      i += 1;
      continue;
    }

    const start = i;
    const header = splitCells(lines[i]);
    i += 2;
    const rows: string[][] = [];
    while (i < lines.length && isTableRow(lines[i])) {
      rows.push(splitCells(lines[i]));
      i += 1;
    }

    const isClosed = i < lines.length && lines[i].trim() === "";
    if (!isClosed || rows.length === 0) {
      out.push(...lines.slice(start, i));
      continue;
    }

    out.push(
      `<div class="sm-table-wrap"><table class="sm-table"><thead><tr>${header
        .map((cell) => `<th>${cell}</th>`)
        .join("")}</tr></thead><tbody>${rows
        .map((row) => `<tr>${header.map((_, idx) => `<td>${row[idx] ?? ""}</td>`).join("")}</tr>`)
        .join("")}</tbody></table></div>`,
    );
    out.push(lines[i]);
    i += 1;
  }

  return out.join("\n");
}

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
  text = renderCompletedTables(text);

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
