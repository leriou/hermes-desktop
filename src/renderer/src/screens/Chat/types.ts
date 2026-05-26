export type {
  Attachment,
  AttachmentKind,
} from "@shared/attachments";

import type { Attachment } from "@shared/attachments";

/**
 * Visible chat bubble (user or assistant). Used for live streaming and as
 * one of the variants of the broader `ChatMessage` history union.
 */
export interface ChatBubbleMessage {
  id: string;
  sessionId?: string;
  kind?: "user" | "assistant"; // optional for backward compat; absent ⇒ user/assistant by role
  role: "user" | "agent";
  content: string;
  attachments?: Attachment[];
  model?: string;
  timestamp?: number;
}

/**
 * Sub-row attached to an assistant turn, surfaced as a collapsible widget
 * in the chat transcript. Created by the main-process session loader from
 * the agent's state DB (`reasoning*` / `tool_calls` / `role='tool'` rows)
 * — none of these have a live-streaming counterpart in the desktop yet.
 */
export interface ReasoningMessage {
  id: string;
  kind: "reasoning";
  role: "agent";
  text: string;
}

export interface ToolCallMessage {
  id: string;
  sessionId?: string;
  kind: "tool_call";
  role: "agent";
  callId: string;
  name: string;
  args: string;
  /** Filled by tool.complete — merges result into the same row */
  result?: string;
  success?: boolean;
  fallbackWarning?: string;
  /** Updated by tool.progress events */
  progress?: string;
  /** Filled by tool.complete — seconds */
  durationS?: number;
  /** Filled by tool.complete — unified diff for file edits */
  inlineDiff?: string;
}

export interface ToolResultMessage {
  id: string;
  sessionId?: string;
  kind: "tool_result";
  role: "agent";
  callId: string;
  name: string;
  content: string;
  attachments?: Attachment[];
}

export interface ToolGroupMessage {
  kind: "tool_group";
  id: string;
  role: "agent";
  toolName: string;
  calls: ToolCallMessage[];
}

export interface SystemStatusMessage {
  id: string;
  kind: "system_status";
  role: "agent";
  tone: "info" | "success" | "warning" | "error";
  title: string;
  content?: string;
  timestamp?: number;
}

export interface SystemEventMessage {
  id: string;
  kind: "system_event";
  role: "system";
  event: "model_switch" | "context_compress" | "provider_error" | "gateway_error" | "status";
  tone: "info" | "success" | "warning" | "error";
  title: string;
  content?: string;
  code?: string;
  timestamp?: number;
}

export interface SubagentMessage {
  id: string;
  kind: "subagent";
  role: "agent";
  agentId: string;
  goal: string;
  status: "running" | "completed" | "failed";
  text?: string;
  durationS?: number;
  progressHint?: string;
}

export type ChatMessage =
  | ChatBubbleMessage
  | ReasoningMessage
  | ToolCallMessage
  | ToolResultMessage
  | ToolGroupMessage
  | SystemStatusMessage
  | SystemEventMessage
  | SubagentMessage;

export interface ModelGroup {
  provider: string;
  providerLabel: string;
  models: {
    provider: string;
    model: string;
    label: string;
    baseUrl: string;
  }[];
}

export interface ApprovalRequest {
  command: string;
  description: string;
  patternKey: string;
  patternKeys: string[];
}

export interface ClarifyRequest {
  requestId: string;
  question: string;
  choices?: string[];
}

export interface SudoRequest {
  requestId: string;
}

export interface SecretRequest {
  requestId: string;
  envVar: string;
  prompt: string;
}

export interface UsageState {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
  calls?: number;
  cacheRead?: number;
  cacheWrite?: number;
  reasoning?: number;
  contextUsed?: number;
  contextMax?: number;
  contextPercent?: number;
}
