// ── Business Categories ───────────────────────────
// Maps directly to config.yaml model roles in hermes-agent.
// single = only one model can hold this role (clicking replaces)
// multi  = multiple models can share this role (e.g. fallback chain)
export type BusinessCategory =
  | "primary"
  | "fallback"
  | "compression"
  | "vision"
  | "web_extract"
  | "delegation"
  | "approval"
  | "mcp"
  | "title_generation"
  | "skills_hub"
  | "curator"
  | "triage_specifier"
  | "kanban_decomposer";

export type CategoryCardinality = "single" | "multi";

export const CATEGORY_CARDINALITY: Record<BusinessCategory, CategoryCardinality> = {
  primary: "single",
  fallback: "multi",
  compression: "single",
  vision: "single",
  web_extract: "single",
  delegation: "single",
  approval: "single",
  mcp: "single",
  title_generation: "single",
  skills_hub: "single",
  curator: "single",
  triage_specifier: "single",
  kanban_decomposer: "single",
};

export const ALL_CATEGORIES: BusinessCategory[] = [
  "primary",
  "fallback",
  "compression",
  "vision",
  "web_extract",
  "delegation",
  "approval",
  "mcp",
  "title_generation",
  "skills_hub",
  "curator",
  "triage_specifier",
  "kanban_decomposer",
];

// Category display metadata
export const CATEGORY_META: Record<
  BusinessCategory,
  {
    label: string;
    icon: string;
    color: string;
  }
> = {
  primary: {
    label: "Primary",
    icon: "⭐",
    color: "#F59E0B",
  },
  fallback: {
    label: "Fallback",
    icon: "🔄",
    color: "#6B7280",
  },
  compression: {
    label: "Compression",
    icon: "📦",
    color: "#8B5CF6",
  },
  vision: {
    label: "Vision",
    icon: "👁",
    color: "#EF4444",
  },
  web_extract: {
    label: "Web Extract",
    icon: "🌐",
    color: "#3B82F6",
  },
  delegation: {
    label: "Delegation",
    icon: "🤝",
    color: "#10B981",
  },
  approval: {
    label: "Approval",
    icon: "✅",
    color: "#F97316",
  },
  mcp: {
    label: "MCP",
    icon: "🔌",
    color: "#06B6D4",
  },
  title_generation: {
    label: "Title Gen",
    icon: "📝",
    color: "#A855F7",
  },
  skills_hub: {
    label: "Skills Hub",
    icon: "🛠",
    color: "#84CC16",
  },
  curator: {
    label: "Curator",
    icon: "📚",
    color: "#EC4899",
  },
  triage_specifier: {
    label: "Triage",
    icon: "📋",
    color: "#14B8A6",
  },
  kanban_decomposer: {
    label: "Kanban",
    icon: "🗂",
    color: "#D946EF",
  },
};

// ── Client Store Types ─────────────────────────
export interface ClientProvider {
  id: string; // UUID, generated on creation
  name: string; // "OpenRouter", "My Local LLM"
  baseUrl: string; // "https://openrouter.ai/api/v1"
  providerKey: string; // maps to config.yaml providers.{key}: "openrouter", "newapi"
  apiKeyEnvVar: string; // env var name for API key: "OPENROUTER_API_KEY"
  createdAt: number;
  updatedAt: number;
}

export interface ClientModel {
  id: string;
  providerId: string;
  modelId: string;
  alias: string;
  categories: BusinessCategory[];
  contextLength: number;
  discovered: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RegisterProviderInput {
  name: string;
  providerKey: string;
  baseUrl: string;
  apiKeyEnvVar: string;
  apiKey: string;
}

export interface SaveModelInput {
  providerId: string;
  modelId: string;
  alias?: string;
  categories?: BusinessCategory[];
  contextLength?: number;
  discovered?: boolean;
}

export interface ModelConfigStore {
  version: number;
  defaultModel: string;
  providers: Record<string, ClientProvider>;
  models: Record<string, ClientModel>;
}

export function inferEnvVar(providerKey: string, baseUrl: string): string {
  const known: Record<string, string> = {
    openrouter: "OPENROUTER_API_KEY",
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GOOGLE_API_KEY",
    gemini: "GOOGLE_API_KEY",
    xai: "XAI_API_KEY",
    groq: "GROQ_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    together: "TOGETHER_API_KEY",
    fireworks: "FIREWORKS_API_KEY",
    cerebras: "CEREBRAS_API_KEY",
    mistral: "MISTRAL_API_KEY",
    perplexity: "PERPLEXITY_API_KEY",
    huggingface: "HUGGINGFACE_API_KEY",
    nvidia: "NVIDIA_API_KEY",
    zai: "GLM_API_KEY",
    glm: "GLM_API_KEY",
    qwen: "DASHSCOPE_API_KEY",
    minimax: "MINIMAX_API_KEY",
    kimi: "MOONSHOT_API_KEY",
    kimi_cn: "MOONSHOT_API_KEY",
    kimi_coding: "MOONSHOT_API_KEY",
    nous: "NOUS_API_KEY",
  };
  const key = providerKey.toLowerCase().replace(/[-_]/g, "_");
  if (known[key]) return known[key];
  const upper = providerKey.toUpperCase().replace(/[-\s]/g, "_");
  return `${upper}_API_KEY`;
}
