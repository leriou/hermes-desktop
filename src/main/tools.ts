import { execFileSync } from "child_process";
import { homedir } from "os";
import {
  HERMES_HOME,
  HERMES_PYTHON,
  HERMES_REPO,
  hermesCliArgs,
  getEnhancedPath,
} from "./installer";
import { HIDDEN_SUBPROCESS_OPTIONS } from "./process-options";
import { stripAnsi } from "./utils";
import { tuiGateway } from "./tui-gateway";

export interface ToolsetInfo {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  source: string;
}

export interface ToolsetToggleResult {
  success: boolean;
  error?: string;
}

const CLI_ENV = {
  ...process.env,
  PATH: getEnhancedPath(),
  HOME: homedir(),
  HERMES_HOME,
  COLUMNS: "300",
};

// ═══════════════════════════════════════════════════════════════════════
// IMPORTANT: 工具列表必须通过 `hermes tools list` CLI 命令输出解析，
// 不允许改回配置文件解析（parseToolsetsFromRust 等）。
// 一共 3 类：built-in（内置工具）、plugin（用户自建工具）、mcp（MCP 服务）。
// 开关工具也必须通过 hermes tools.configure 命令执行，
// 不允许直接写配置文件。
// 任何人不许再改这个实现方式。
// ═══════════════════════════════════════════════════════════════════════

export function parseToolsetsOutput(text: string): ToolsetInfo[] {
  if (!text) return [];

  const tools: ToolsetInfo[] = [];
  let source = "built-in";

  for (const line of text.split("\n")) {
    const trimmed = line.trim();

    if (trimmed.endsWith(":") && !trimmed.startsWith("✓") && !trimmed.startsWith("✗")) {
      const lower = trimmed.toLowerCase();
      if (lower.includes("plugin")) source = "plugin";
      else if (lower.includes("mcp")) source = "mcp";
      else source = "built-in";
      continue;
    }

    const match = trimmed.match(/^[✓✗]\s+(enabled|disabled)\s+(\S+)\s+(.*)/);
    if (match) {
      const enabled = match[1] === "enabled";
      const key = match[2];
      const desc = match[3]
        .replace(/[\p{Emoji}\p{Emoji_Modifier_Base}\p{Emoji_Component}\u{200D}\u{FE0F}\u{200B}]+/gu, "")
        .replace(/^\s+/, "")
        .replace(/\s+/g, " ")
        .trim();
      tools.push({ key, label: key, description: desc, enabled, source });
      continue;
    }

    const mcpMatch = trimmed.match(/^(\S+)\s+(all tools enabled|enabled|disabled|\S+)/);
    if (source === "mcp" && mcpMatch) {
      const key = mcpMatch[1];
      const status = mcpMatch[2];
      tools.push({
        key,
        label: key,
        description: status,
        enabled: status.includes("enabled"),
        source: "mcp",
      });
    }
  }

  return tools;
}

export function getToolsets(_profile?: string): ToolsetInfo[] {
  try {
    const output = execFileSync(
      HERMES_PYTHON,
      hermesCliArgs(["tools", "list"]),
      {
        cwd: HERMES_REPO,
        env: CLI_ENV,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 15000,
        ...HIDDEN_SUBPROCESS_OPTIONS,
      },
    );

    return parseToolsetsOutput(stripAnsi(output.toString()));
  } catch (err) {
    console.error("Failed to get toolsets:", err);
    return [];
  }
}

// 开关工具：必须通过 hermes tools.configure 执行，不许直接写配置文件
export async function setToolsetEnabled(
  key: string,
  enabled: boolean,
  _profile?: string,
): Promise<ToolsetToggleResult> {
  try {
    await tuiGateway.toolConfigure(key, enabled);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message || "Failed to toggle tool.",
    };
  }
}
