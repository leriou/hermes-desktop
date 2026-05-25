import { execFileSync } from "child_process";
import { HERMES_PYTHON, hermesCliArgs } from "./installer";

export interface PluginInfo {
  name: string;
  description: string;
  enabled: boolean;
  version: string;
  source: string;
}

export function getPlugins(_profile?: string): PluginInfo[] {
  try {
    const output = execFileSync(HERMES_PYTHON, hermesCliArgs(["plugins", "list"]), {
      env: { ...process.env, COLUMNS: "300" },
      timeout: 15000,
      encoding: "utf-8",
    });
    return parsePluginsTable(output);
  } catch (err) {
    console.error("Failed to get plugins:", err);
    return [];
  }
}

function parsePluginsTable(output: string): PluginInfo[] {
  const plugins: PluginInfo[] = [];
  const lines = output.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trimStart().startsWith("│")) { i++; continue; }
    if (line.includes("┃") || line.includes("┼") || line.includes("└")) { i++; continue; }

    const cells = line.split("│");
    if (cells.length < 6) { i++; continue; }
    const name = cells[1].trim();
    const status = cells[2].trim();
    const version = cells[3].trim();
    const description = cells[4].trim();
    const source = cells[5].trim();

    if (!name) { i++; continue; }

    let fullDesc = description;
    i++;
    while (i < lines.length) {
      const cont = lines[i];
      if (!cont.trimStart().startsWith("│") || cont.includes("┃") || cont.includes("┼") || cont.includes("└")) break;
      const contCells = cont.split("│");
      if (contCells.length >= 5 && !contCells[1].trim()) {
        const contDesc = contCells[4].trim();
        if (contDesc) fullDesc += " " + contDesc;
      } else {
        break;
      }
      i++;
    }

    plugins.push({
      name,
      enabled: status === "enabled",
      version,
      description: fullDesc,
      source,
    });
  }

  return plugins;
}

export interface PluginToggleResult {
  success: boolean;
  error?: string;
}

function togglePlugin(name: string, enabled: boolean): PluginToggleResult {
  try {
    const action = enabled ? "enable" : "disable";
    execFileSync(HERMES_PYTHON, hermesCliArgs(["plugins", action, name]), {
      timeout: 15000,
      encoding: "utf-8",
    });
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message || `Failed to ${enabled ? "enable" : "disable"} plugin.`,
    };
  }
}

export function enablePlugin(name: string, _profile?: string): PluginToggleResult {
  return togglePlugin(name, true);
}

export function disablePlugin(name: string, _profile?: string): PluginToggleResult {
  return togglePlugin(name, false);
}
