import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Tests for setToolsetEnabled / getToolsets / parseToolsetsOutput.
 *
 * setToolsetEnabled delegates to tuiGateway.toolConfigure (async).
 * parseToolsetsOutput is a pure function that parses CLI output.
 */

const { mockToolConfigure } = vi.hoisted(() => ({
  mockToolConfigure: vi.fn(),
}));

vi.mock("../src/main/tui-gateway", () => ({
  tuiGateway: { toolConfigure: mockToolConfigure },
}));

vi.mock("../src/main/installer", () => ({
  HERMES_HOME: "/tmp/hermes-test",
  HERMES_PYTHON: "/usr/bin/python3",
  HERMES_REPO: "/tmp/hermes-test",
  hermesCliArgs: (args: string[]) => args,
  getEnhancedPath: () => process.env.PATH || "",
}));

vi.mock("../src/main/process-options", () => ({
  HIDDEN_SUBPROCESS_OPTIONS: {},
}));

vi.mock("../src/main/utils", () => ({
  stripAnsi: (s: string) => s,
}));

import {
  setToolsetEnabled,
  getToolsets,
  parseToolsetsOutput,
} from "../src/main/tools";

// ---------------------------------------------------------------------------
// setToolsetEnabled
// ---------------------------------------------------------------------------

describe("setToolsetEnabled", () => {
  beforeEach(() => {
    mockToolConfigure.mockReset();
  });

  it("calls tuiGateway.toolConfigure with enable action", async () => {
    mockToolConfigure.mockResolvedValue({});
    const result = await setToolsetEnabled("web", true);
    expect(result.success).toBe(true);
    expect(mockToolConfigure).toHaveBeenCalledWith("web", true);
  });

  it("calls tuiGateway.toolConfigure with disable action", async () => {
    mockToolConfigure.mockResolvedValue({});
    const result = await setToolsetEnabled("terminal", false);
    expect(result.success).toBe(true);
    expect(mockToolConfigure).toHaveBeenCalledWith("terminal", false);
  });

  it("returns { success: false } when toolConfigure throws", async () => {
    mockToolConfigure.mockRejectedValue(new Error("gateway offline"));
    const result = await setToolsetEnabled("web", true);
    expect(result.success).toBe(false);
    expect(result.error).toContain("gateway offline");
  });

  it("returns fallback error message for non-Error throws", async () => {
    mockToolConfigure.mockRejectedValue("string error");
    const result = await setToolsetEnabled("web", true);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to toggle tool.");
  });
});

// ---------------------------------------------------------------------------
// getToolsets (error path — CLI not available in test env)
// ---------------------------------------------------------------------------

describe("getToolsets", () => {
  it("returns empty array when hermes CLI is not available", () => {
    const tools = getToolsets();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseToolsetsOutput — pure function, no mocking needed
// ---------------------------------------------------------------------------

describe("parseToolsetsOutput", () => {
  it("parses built-in toolsets with enabled/disabled status", () => {
    const output =
      "Built-in toolsets (cli):\n" +
      "✓ enabled  web  🔍 Web Search & Scraping\n" +
      "✗ disabled  terminal  💻 Terminal\n";

    const tools = parseToolsetsOutput(output);
    expect(tools).toHaveLength(2);
    expect(tools[0]).toMatchObject({ key: "web", enabled: true, source: "built-in" });
    expect(tools[1]).toMatchObject({ key: "terminal", enabled: false, source: "built-in" });
  });

  it("strips emoji from descriptions", () => {
    const tools = parseToolsetsOutput(
      "Built-in toolsets (cli):\n✓ enabled  web  🔍 Web Search & Scraping\n",
    );
    expect(tools[0]?.description).toBe("Web Search & Scraping");
  });

  it("parses plugin toolsets from separate section", () => {
    const output =
      "Built-in toolsets (cli):\n" +
      "✓ enabled  web  🔍 Web Search\n" +
      "Plugin toolsets (cli):\n" +
      "✓ enabled  my-plugin  My custom plugin\n";

    const tools = parseToolsetsOutput(output);
    const plugin = tools.find((t) => t.key === "my-plugin");
    expect(plugin).toMatchObject({ key: "my-plugin", source: "plugin", enabled: true });
  });

  it("parses MCP server entries", () => {
    const output =
      "MCP servers:\n" +
      "byterover  all tools enabled\n" +
      "other-server  disabled\n";

    const tools = parseToolsetsOutput(output);
    expect(tools).toHaveLength(2);
    expect(tools[0]).toMatchObject({ key: "byterover", enabled: true, source: "mcp" });
    expect(tools[1]).toMatchObject({ key: "other-server", enabled: false, source: "mcp" });
  });

  it("returns empty array for empty input", () => {
    expect(parseToolsetsOutput("")).toEqual([]);
  });

  it("ignores lines that don't match any pattern", () => {
    const output =
      "Some header\n" +
      "Random text\n" +
      "Built-in toolsets (cli):\n" +
      "✓ enabled  web  Web Search\n";
    const tools = parseToolsetsOutput(output);
    expect(tools).toHaveLength(1);
    expect(tools[0].key).toBe("web");
  });
});
