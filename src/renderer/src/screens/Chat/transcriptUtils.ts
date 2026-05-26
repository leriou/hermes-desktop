import type { ChatMessage } from "./types";
import { mergeContinuationLabels } from "./sessionDisplay";

export type TranscriptFormat = "text" | "markdown";

/**
 * Serialise a conversation into a clipboard-ready transcript (issue #298).
 *
 * - `text`     → plain `You: …` / `Hermes: …` blocks.
 * - `markdown` → `**You:**` / `**Hermes:**` headed blocks.
 *
 * Blocks are separated by a blank line. Exported for unit testing.
 */
export function buildChatTranscript(
  messages: ChatMessage[],
  format: TranscriptFormat,
): string {
  return mergeContinuationLabels(messages)
    .filter((m) => "content" in m && typeof m.content === "string")
    .filter((m) => (m as { kind?: string }).kind !== "system_status")
    .filter((m) => (m as { kind?: string }).kind !== "system_event")
    .map((m) => {
      const msg = m as { role: "user" | "agent"; content: string };
      const speaker = msg.role === "user" ? "You" : "Hermes";
      const content = msg.content.trim();
      return format === "markdown"
        ? `**${speaker}:**\n\n${content}`
        : `${speaker}: ${content}`;
    })
    .join("\n\n");
}
