export interface DefaultModel {
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  tags?: string[];
}

const DEFAULT_MODELS: DefaultModel[] = [
  // ── Anthropic ──────────────────────────────────────────────────────
  {
    name: "Claude Opus 4",
    provider: "anthropic",
    model: "claude-opus-4-20250918",
    baseUrl: "",
    tags: ["flagship"],
  },
  {
    name: "Claude Sonnet 4",
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    baseUrl: "",
    tags: ["recommended"],
  },
  {
    name: "Claude Haiku 3.5",
    provider: "anthropic",
    model: "claude-3-5-haiku-20241022",
    baseUrl: "",
    tags: ["fast", "cheap"],
  },

  // ── OpenAI ─────────────────────────────────────────────────────────
  {
    name: "GPT-4.1",
    provider: "openai",
    model: "gpt-4.1",
    baseUrl: "",
    tags: ["recommended"],
  },
  {
    name: "GPT-4.1 Mini",
    provider: "openai",
    model: "gpt-4.1-mini",
    baseUrl: "",
    tags: ["fast"],
  },
  {
    name: "GPT-4.1 Nano",
    provider: "openai",
    model: "gpt-4.1-nano",
    baseUrl: "",
    tags: ["fast", "cheap"],
  },
  {
    name: "o3",
    provider: "openai",
    model: "o3",
    baseUrl: "",
    tags: ["reasoning"],
  },
  {
    name: "o4-mini",
    provider: "openai",
    model: "o4-mini",
    baseUrl: "",
    tags: ["reasoning", "fast"],
  },

  // ── Google ─────────────────────────────────────────────────────────
  {
    name: "Gemini 2.5 Pro",
    provider: "google",
    model: "gemini-2.5-pro",
    baseUrl: "",
    tags: ["recommended"],
  },
  {
    name: "Gemini 2.5 Flash",
    provider: "google",
    model: "gemini-2.5-flash",
    baseUrl: "",
    tags: ["fast"],
  },
  {
    name: "Gemini 2.0 Flash",
    provider: "google",
    model: "gemini-2.0-flash",
    baseUrl: "",
    tags: ["fast", "cheap"],
  },

  // ── xAI ────────────────────────────────────────────────────────────
  {
    name: "Grok 3",
    provider: "xai",
    model: "grok-3",
    baseUrl: "",
    tags: [],
  },
  {
    name: "Grok 3 Mini",
    provider: "xai",
    model: "grok-3-mini",
    baseUrl: "",
    tags: ["fast"],
  },

  // ── DeepSeek ───────────────────────────────────────────────────────
  {
    name: "DeepSeek R1",
    provider: "deepseek",
    model: "deepseek-reasoner",
    baseUrl: "",
    tags: ["reasoning", "cheap"],
  },
  {
    name: "DeepSeek V3",
    provider: "deepseek",
    model: "deepseek-chat",
    baseUrl: "",
    tags: ["recommended", "cheap"],
  },

  // ── Mistral ────────────────────────────────────────────────────────
  {
    name: "Mistral Large",
    provider: "mistral",
    model: "mistral-large-latest",
    baseUrl: "",
    tags: [],
  },
  {
    name: "Codestral",
    provider: "mistral",
    model: "codestral-latest",
    baseUrl: "",
    tags: ["code"],
  },

  // ── Qwen ───────────────────────────────────────────────────────────
  {
    name: "Qwen 3 235B",
    provider: "qwen",
    model: "qwen3-235b-a22b",
    baseUrl: "",
    tags: ["reasoning"],
  },

  // ── Z.ai / GLM ─────────────────────────────────────────────────────
  {
    name: "GLM-4.5",
    provider: "zai",
    model: "glm-4.5",
    baseUrl: "",
    tags: [],
  },

  // ── Groq ───────────────────────────────────────────────────────────
  {
    name: "Llama 4 Maverick",
    provider: "groq",
    model: "meta-llama/llama-4-maverick-17b-128e-instruct",
    baseUrl: "",
    tags: ["fast"],
  },

  // ── Together AI ────────────────────────────────────────────────────
  {
    name: "Llama 4 Behemoth",
    provider: "together",
    model: "meta-llama/Llama-4-Maverick-17B-128E-Instruct",
    baseUrl: "",
    tags: [],
  },

  // ── Perplexity ─────────────────────────────────────────────────────
  {
    name: "Sonar Pro",
    provider: "perplexity",
    model: "sonar-pro",
    baseUrl: "",
    tags: ["search"],
  },

  // ── OpenRouter (aggregator) ────────────────────────────────────────
  {
    name: "Claude Sonnet 4 (OpenRouter)",
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4-20250514",
    baseUrl: "",
    tags: ["recommended"],
  },
  {
    name: "GPT-4.1 (OpenRouter)",
    provider: "openrouter",
    model: "openai/gpt-4.1",
    baseUrl: "",
    tags: ["recommended"],
  },
  {
    name: "Gemini 2.5 Pro (OpenRouter)",
    provider: "openrouter",
    model: "google/gemini-2.5-pro",
    baseUrl: "",
    tags: ["recommended"],
  },
  {
    name: "DeepSeek V3 (OpenRouter)",
    provider: "openrouter",
    model: "deepseek/deepseek-chat-v3",
    baseUrl: "",
    tags: ["cheap"],
  },
];

export default DEFAULT_MODELS;
