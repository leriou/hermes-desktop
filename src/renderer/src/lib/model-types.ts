// ── Business Categories ───────────────────────────
export type BusinessCategory =
  | "general"
  | "coding"
  | "analysis"
  | "creative"
  | "reasoning"
  | "fast-mode"
  | "vision"
  | "voice";

export const ALL_CATEGORIES: BusinessCategory[] = [
  "general",
  "coding",
  "analysis",
  "creative",
  "reasoning",
  "fast-mode",
  "vision",
  "voice",
];

// Category display metadata
export const CATEGORY_META: Record<
  BusinessCategory,
  {
    labelKey: string;
    icon: string;
    color: string;
  }
> = {
  general: {
    labelKey: "models.categories.general",
    icon: "✦",
    color: "#6B7280",
  },
  coding: {
    labelKey: "models.categories.coding",
    icon: "</>",
    color: "#3B82F6",
  },
  analysis: {
    labelKey: "models.categories.analysis",
    icon: "📊",
    color: "#8B5CF6",
  },
  creative: {
    labelKey: "models.categories.creative",
    icon: "🎨",
    color: "#EC4899",
  },
  reasoning: {
    labelKey: "models.categories.reasoning",
    icon: "🧠",
    color: "#F59E0B",
  },
  "fast-mode": {
    labelKey: "models.categories.fastMode",
    icon: "⚡",
    color: "#10B981",
  },
  vision: {
    labelKey: "models.categories.vision",
    icon: "👁",
    color: "#EF4444",
  },
  voice: {
    labelKey: "models.categories.voice",
    icon: "🎙",
    color: "#F97316",
  },
};

// ── Client Store Types ─────────────────────────
export interface ClientProvider {
  id: string; // UUID, generated on creation
  name: string; // "OpenRouter", "My Local LLM"
  baseUrl: string; // "https://openrouter.ai/api/v1"
  providerKey: string; // maps to config.yaml providers.{key}: "openrouter", "newapi"
  apiKeyEnvVar: string; // "OPENROUTER_API_KEY" — env var name
  createdAt: number; // Unix ms timestamp
  updatedAt: number;
}

export interface ClientModel {
  id: string; // UUID
  providerId: string; // FK → ClientProvider.id
  modelId: string; // "gpt-5.5", "claude-sonnet-4-6"
  alias: string; // display alias, or "" for modelId
  categories: BusinessCategory[];
  contextLength: number; // 0 = not set
  discovered: boolean; // true = auto-discovered, false = manually added
  createdAt: number;
  updatedAt: number;
}

export interface ModelConfigStore {
  version: 1;
  defaultModel: string; // modelId string
  providers: Record<string, ClientProvider>; // keyed by id
  models: Record<string, ClientModel>; // keyed by id
}

// ── IPC Command Payloads ──────────────────────
export interface RegisterProviderInput {
  name: string;
  baseUrl: string;
  providerKey: string; // the config.yaml provider key
  apiKeyEnvVar: string;
  apiKey: string; // value to save to .env (empty = skip)
}

export interface SaveModelInput {
  providerId: string;
  modelId: string;
  alias?: string;
  categories?: BusinessCategory[];
  contextLength?: number;
  discovered?: boolean;
}

export interface DeleteModelInput {
  modelId: string; // ClientModel.id
  providerId: string;
}

// Extended list_models return type (for frontend consumption)
export interface ModelListEntry {
  id: string; // ClientModel.id
  providerId: string;
  providerName: string; // from ClientProvider.name
  providerKey: string;
  modelId: string;
  alias: string;
  baseUrl: string;
  categories: BusinessCategory[];
  contextLength: number;
  discovered: boolean;
  aliases: string[]; // from config.yaml model_aliases
  createdAt: number;
  updatedAt: number;
}

// Routing config payload
export interface RoutingConfig {
  defaultModel?: string;
  defaultProvider?: string;
  defaultBaseUrl?: string;
  fallbacks?: Array<{ model: string; provider: string }>;
}

// ── Constants ──────────────────────────────────

/** Map provider keys to their well-known env var names */
export const PROVIDER_ENV_KEY_MAP: Record<string, string> = {
  openrouter: "OPENROUTER_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  "openai-codex": "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
  xai: "XAI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  groq: "GROQ_API_KEY",
  together: "TOGETHER_API_KEY",
  fireworks: "FIREWORKS_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  huggingface: "HF_TOKEN",
  nvidia: "NVIDIA_API_KEY",
  zai: "GLM_API_KEY",
  minimax: "MINIMAX_API_KEY",
  nouus: "NOUS_API_KEY",
};

/**
 * Infer the env var name for a given provider key or custom base URL.
 * Returns a best-guess env var name.
 */
export function inferEnvVar(
  providerKey: string,
  baseUrl?: string,
): string {
  if (PROVIDER_ENV_KEY_MAP[providerKey]) {
    return PROVIDER_ENV_KEY_MAP[providerKey];
  }
  if (baseUrl) {
    return resolveCustomEnvKey(baseUrl);
  }
  return `${providerKey.toUpperCase()}_API_KEY`;
}

/**
 * Resolve env var name from a custom base URL (mirrors Models.tsx logic).
 */
export function resolveCustomEnvKey(url: string): string {
  if (!url) return "CUSTOM_API_KEY";
  if (/openrouter\.ai/i.test(url)) return "OPENROUTER_API_KEY";
  if (/anthropic\.com/i.test(url)) return "ANTHROPIC_API_KEY";
  if (/openai\.com/i.test(url)) return "OPENAI_API_KEY";
  if (/huggingface\.co/i.test(url)) return "HF_TOKEN";
  if (/api\.groq\.com/i.test(url)) return "GROQ_API_KEY";
  if (/api\.deepseek\.com/i.test(url)) return "DEEPSEEK_API_KEY";
  if (/api\.together\.xyz/i.test(url)) return "TOGETHER_API_KEY";
  if (/api\.fireworks\.ai/i.test(url)) return "FIREWORKS_API_KEY";
  if (/api\.cerebras\.ai/i.test(url)) return "CEREBRAS_API_KEY";
  if (/api\.mistral\.ai/i.test(url)) return "MISTRAL_API_KEY";
  if (/api\.perplexity\.ai/i.test(url)) return "PERPLEXITY_API_KEY";
  return "CUSTOM_API_KEY";
}
