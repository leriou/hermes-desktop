import { mergeContinuationLabels } from "./sessionDisplay";
import type {
  ChatBubbleMessage,
  ChatMessage,
  ReasoningMessage,
  ToolCallMessage,
  ToolGroupMessage,
  ToolResultMessage,
  TodoItem,
} from "./types";

export type RenderTranscriptItem =
  | ChatMessage
  | { kind: "live_reasoning"; id: string; role: "agent"; text: string }
  | { kind: "live_assistant"; id: string; role: "agent"; content: string }
  | { kind: "tool_progress"; id: string; role: "agent"; content: string };

interface BuildRenderableTranscriptArgs {
  messages: ChatMessage[];
  isLoading: boolean;
  toolProgress: string | null;
  streamingText?: string;
  streamingReasoning?: string;
  todos?: TodoItem[];
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

function mergeAgentTextsWithinTurns(messages: ChatMessage[]): ChatMessage[] {
  const turns: ChatMessage[][] = [];
  let currentTurn: ChatMessage[] = [];

  for (const msg of messages) {
    if (isBubble(msg) && msg.role === "user" && currentTurn.length > 0) {
      turns.push(currentTurn);
      currentTurn = [msg];
    } else {
      currentTurn.push(msg);
    }
  }
  if (currentTurn.length > 0) turns.push(currentTurn);

  return turns.flatMap((turn) => {
    const agentTexts: ChatBubbleMessage[] = [];
    for (const msg of turn) {
      if (isBubble(msg) && msg.role === "agent") {
        agentTexts.push(msg as ChatBubbleMessage);
      }
    }
    if (agentTexts.length <= 1) return turn;

    const merged: ChatBubbleMessage = {
      ...agentTexts[agentTexts.length - 1],
      content: agentTexts.map((t) => t.content).join("\n"),
    };

    const result: ChatMessage[] = [];
    for (const msg of turn) {
      if (isBubble(msg) && msg.role === "agent") continue;
      result.push(msg);
    }
    result.push(merged);
    return result;
  });
}

export function buildRenderableTranscript({
  messages,
  isLoading,
  toolProgress,
  streamingText = "",
  streamingReasoning = "",
  todos = [],
}: BuildRenderableTranscriptArgs): RenderTranscriptItem[] {
  // Drop reasoning messages — they break tool-call grouping.
  // Live thinking is shown via the streamingReasoning prop instead.
  const filtered = messages.filter((m) => kindOf(m) !== "reasoning");

  const processed = mergeAgentTextsWithinTurns(
    groupToolCalls(mergeContinuationLabels(filtered)).filter((m) => {
      if (!isBubble(m)) return true;
      return ((m.content as string) || "").trim().length > 0;
    }),
  );

  const items: RenderTranscriptItem[] = [...processed];

  // Streaming content (text, reasoning, todos) is rendered directly by
  // MessageList — not injected into the transcript — so that it stays in
  // the same DOM container and doesn't cause layout jumps on commit.

  let lastBubble: ChatMessage | undefined;
  for (let i = filtered.length - 1; i >= 0; i--) {
    if (isBubble(filtered[i])) {
      lastBubble = filtered[i];
      break;
    }
  }
  const lastMessageIsAgent = !!lastBubble && lastBubble.role === "agent";

  if (isLoading) {
    if (toolProgress && (lastMessageIsAgent || streamingText)) {
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

/**
 * Rewrite a transcript so tools and answers are separated within each turn.
 * Applied after message.complete (live) and when loading history (DB).
 */
export function rewriteTranscript(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= 2) return messages;

  const turns: ChatMessage[][] = [];
  let current: ChatMessage[] = [];

  for (const msg of messages) {
    if (isBubble(msg) && msg.role === "user" && current.length > 0) {
      turns.push(current);
      current = [msg];
    } else {
      current.push(msg);
    }
  }
  if (current.length > 0) turns.push(current);

  return turns.flatMap(rewriteTurn);
}

function rewriteTurn(turn: ChatMessage[]): ChatMessage[] {
  if (turn.length <= 2) return turn;

  const first = turn[0];
  const rest = turn.slice(1);

  const tools: ChatMessage[] = [];
  const reasoning: ChatMessage[] = [];
  const texts: ChatMessage[] = [];
  const system: ChatMessage[] = [];
  const other: ChatMessage[] = [];

  for (const msg of rest) {
    const k = kindOf(msg);
    if (k === "tool_call" || k === "tool_result" || k === "tool_group" || k === "subagent") {
      tools.push(msg);
    } else if (k === "reasoning") {
      reasoning.push(msg);
    } else if (isBubble(msg) && msg.role === "agent") {
      texts.push(msg);
    } else if (k === "system_status" || k === "system_event") {
      system.push(msg);
    } else {
      other.push(msg);
    }
  }

  if (tools.length === 0 && texts.length <= 1) return turn;

  const mergedTexts =
    texts.length > 1
      ? [
          {
            ...texts[texts.length - 1],
            content: texts.map((t) => (t as ChatBubbleMessage).content).join("\n"),
          },
        ]
      : texts;

  return [first, ...system, ...tools, ...reasoning, ...mergedTexts, ...other];
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
