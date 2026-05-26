import { mergeContinuationLabels } from "./sessionDisplay";
import type {
  ChatBubbleMessage,
  ChatMessage,
  ReasoningMessage,
  ToolCallMessage,
  ToolGroupMessage,
  ToolResultMessage,
} from "./types";

export type RenderTranscriptItem =
  | ChatMessage
  | { kind: "live_reasoning"; id: string; role: "agent"; text: string }
  | { kind: "live_assistant"; id: string; role: "agent"; content: string }
  | { kind: "typing"; id: string; role: "agent"; toolProgress: string | null }
  | { kind: "tool_progress"; id: string; role: "agent"; content: string };

interface BuildRenderableTranscriptArgs {
  messages: ChatMessage[];
  isLoading: boolean;
  toolProgress: string | null;
  streamingText?: string;
  streamingReasoning?: string;
}

function kindOf(m: ChatMessage): string | undefined {
  return (m as { kind?: string }).kind;
}

export function isBubble(m: ChatMessage): m is ChatBubbleMessage {
  const k = kindOf(m);
  return !k || k === "user" || k === "assistant";
}

export function groupToolCalls(messages: ChatMessage[]): ChatMessage[] {
  const merged: ChatMessage[] = [];
  const callMap = new Map<string, ToolCallMessage>();

  for (const msg of messages) {
    if (kindOf(msg) === "tool_call") {
      const tc = { ...msg } as ToolCallMessage;
      callMap.set(tc.callId, tc);
      merged.push(tc);
    } else if (kindOf(msg) === "tool_result") {
      const tr = msg as ToolResultMessage;
      const tc = callMap.get(tr.callId);
      if (tc) {
        tc.result = tr.content;
        tc.success = true;
      }
    } else {
      merged.push(msg);
    }
  }

  const result: ChatMessage[] = [];
  let i = 0;
  while (i < merged.length) {
    if (kindOf(merged[i]) !== "tool_call") {
      result.push(merged[i]);
      i++;
      continue;
    }

    const first = merged[i] as ToolCallMessage;
    const name = first.name;
    const calls: ToolCallMessage[] = [first];
    i++;

    while (i < merged.length) {
      const next = merged[i];
      if (kindOf(next) !== "tool_call") break;
      if ((next as ToolCallMessage).name !== name) break;
      calls.push(next as ToolCallMessage);
      i++;
    }

    result.push({
      kind: "tool_group",
      id: `group-${calls.map((c) => c.id).join("-")}`,
      role: "agent",
      toolName: name,
      calls,
    } satisfies ToolGroupMessage);
  }

  return result;
}

export function buildRenderableTranscript({
  messages,
  isLoading,
  toolProgress,
  streamingText = "",
  streamingReasoning = "",
}: BuildRenderableTranscriptArgs): RenderTranscriptItem[] {
  const processed = groupToolCalls(mergeContinuationLabels(messages)).filter(
    (m) => {
      if (!isBubble(m)) return true;
      return ((m.content as string) || "").trim().length > 0;
    },
  );

  const items: RenderTranscriptItem[] = [...processed];

  if (isLoading && streamingReasoning) {
    items.push({
      id: "live-reasoning",
      kind: "live_reasoning",
      role: "agent",
      text: streamingReasoning,
    });
  }

  if (isLoading && streamingText) {
    items.push({
      id: "live-assistant",
      kind: "live_assistant",
      role: "agent",
      content: streamingText,
    });
  }

  let lastBubble: ChatMessage | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isBubble(messages[i])) {
      lastBubble = messages[i];
      break;
    }
  }
  const lastMessageIsAgent = !!lastBubble && lastBubble.role === "agent";

  if (isLoading) {
    if (!lastMessageIsAgent && !streamingText) {
      if (!streamingReasoning || toolProgress) {
        items.push({
          id: "typing",
          kind: "typing",
          role: "agent",
          toolProgress,
        });
      }
    } else if (toolProgress && (lastMessageIsAgent || streamingText)) {
      items.push({
        id: "tool-progress",
        kind: "tool_progress",
        role: "agent",
        content: toolProgress,
      });
    }
  }

  return items;
}

export function isReasoningItem(
  item: RenderTranscriptItem,
): item is
  | ReasoningMessage
  | Extract<RenderTranscriptItem, { kind: "live_reasoning" }> {
  return (
    (item as { kind?: string }).kind === "reasoning" ||
    (item as { kind?: string }).kind === "live_reasoning"
  );
}
