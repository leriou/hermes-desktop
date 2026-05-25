import type { ChatBubbleMessage, ChatMessage } from "./types";

const SEGMENT_TITLE_RE = /^(.+?)\s+#(\d+)$/;
const PLACEHOLDER_TITLES = new Set(["new chat", "new conversation"]);

export interface TitleSegment {
  base: string;
  segment: number;
}

export interface DisplaySessionLike {
  id?: string;
  title?: string | null;
  preview?: string | null;
  model?: string | null;
  messageCount?: number | null;
}

export function parseTitleSegment(title?: string | null): TitleSegment | null {
  const text = (title || "").trim();
  const match = SEGMENT_TITLE_RE.exec(text);
  if (!match) return null;
  return { base: match[1].trim(), segment: Number.parseInt(match[2], 10) };
}

export function baseSessionTitle(title?: string | null): string {
  const text = parseTitleSegment(title)?.base || (title || "").trim();
  return PLACEHOLDER_TITLES.has(text.toLowerCase()) ? "" : text;
}

export function shortModelName(model?: string | null): string {
  if (!model) return "";
  let name = model;
  if (name.includes("/")) name = name.split("/").pop() || name;
  if (name.startsWith("models/")) name = name.slice(7);
  if (name.includes(":")) name = name.split(":")[0];
  return name;
}

export function sessionDisplayTitle(session: DisplaySessionLike): string {
  const title = baseSessionTitle(session.title);
  if (title) return title;
  const preview = (session.preview || "").trim();
  if (preview) return preview.slice(0, 80);
  return "-";
}

export function sessionDisplayPreview(session: DisplaySessionLike): string {
  const rawTitle = (session.title || "").trim();
  const parsed = parseTitleSegment(rawTitle);
  const preview = (session.preview || "").trim();
  if (parsed && preview) return `Part ${parsed.segment} · ${preview.slice(0, 80)}`;
  if (preview) return preview.slice(0, 80);
  const count = session.messageCount ?? 0;
  const model = shortModelName(session.model);
  const countText = count > 0 ? `${count} msg${count === 1 ? "" : "s"}` : "";
  return [countText, model].filter(Boolean).join(" · ") || "-";
}

function isBubble(msg: ChatMessage): msg is ChatBubbleMessage {
  const kind = (msg as { kind?: string }).kind;
  return !kind || kind === "user" || kind === "assistant";
}

function isContinuationUserLabel(content: string): boolean {
  return /^(?:message|消息)\s*#\d+\s*[:：-]?\s*$/i.test(content.trim());
}

export function mergeContinuationLabels(messages: ChatMessage[]): ChatMessage[] {
  const merged: ChatMessage[] = [];

  for (const msg of messages) {
    if (isBubble(msg) && msg.role === "user" && isContinuationUserLabel(msg.content)) {
      const prev = merged[merged.length - 1];
      if (prev && isBubble(prev) && prev.role === "user") {
        continue;
      }
    }
    merged.push(msg);
  }

  return merged;
}
