/**
 * Per-tool table column definitions for the grouped tool call view.
 * Each entry maps a tool name to a list of columns extracted from the
 * tool's JSON `args`. The table always appends a fixed "Status" and
 * "Detail" column.
 *
 * Tools not listed here get a generic fallback that auto-generates
 * columns from the top-level JSON keys.
 */

export interface ColumnDef {
  key: string;
  label: string;
  width?: string;
  render?: (val: unknown) => string;
}

function truncate(v: string, max = 80): string {
  const flat = v.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : flat.slice(0, max - 1) + "…";
}

const CONFIGS: Record<string, ColumnDef[]> = {
  task_tree: [
    { key: "task_id", label: "序号", width: "15%" },
    { key: "title", label: "标题", width: "40%" },
    { key: "priority", label: "重要性" },
    { key: "status", label: "状态" },
  ],
  terminal: [
    { key: "command", label: "命令", width: "60%", render: (v) => truncate(String(v)) },
    { key: "cwd", label: "目录", render: (v) => truncate(String(v), 40) },
  ],
  write_file: [
    { key: "path", label: "文件路径", width: "50%", render: (v) => truncate(String(v), 60) },
    { key: "content", label: "内容", render: (v) => truncate(String(v), 60) },
  ],
  read_file: [
    { key: "path", label: "文件路径", render: (v) => truncate(String(v), 80) },
  ],
  search_files: [
    { key: "query", label: "关键词", width: "40%", render: (v) => truncate(String(v), 60) },
    { key: "path", label: "路径", render: (v) => truncate(String(v), 40) },
  ],
  execute_code: [
    { key: "language", label: "语言", width: "15%" },
    { key: "code", label: "代码", render: (v) => truncate(String(v), 80) },
  ],
  web_search: [
    { key: "query", label: "查询", render: (v) => truncate(String(v), 80) },
  ],
  web_extract: [
    { key: "url", label: "URL", render: (v) => truncate(String(v), 80) },
  ],
  patch: [
    { key: "path", label: "文件路径", width: "50%", render: (v) => truncate(String(v), 60) },
  ],
  memory: [
    { key: "action", label: "操作", width: "20%" },
    { key: "content", label: "内容", render: (v) => truncate(String(v), 80) },
  ],
  delegate_task: [
    { key: "task", label: "任务", render: (v) => truncate(String(v), 80) },
  ],
  todo: [
    { key: "action", label: "操作", width: "20%" },
    { key: "content", label: "内容", render: (v) => truncate(String(v), 80) },
  ],
  skill_view: [
    { key: "name", label: "技能名", render: (v) => truncate(String(v), 60) },
  ],
  skill_manage: [
    { key: "action", label: "操作", width: "20%" },
    { key: "name", label: "技能名", render: (v) => truncate(String(v), 60) },
  ],
  fact_store: [
    { key: "action", label: "操作", width: "20%" },
    { key: "content", label: "内容", render: (v) => truncate(String(v), 80) },
  ],
  relay_mcp: [
    { key: "server", label: "服务", width: "30%" },
    { key: "tool", label: "工具", width: "30%" },
  ],
  process: [
    { key: "action", label: "操作", width: "20%" },
    { key: "name", label: "进程", render: (v) => truncate(String(v), 60) },
  ],
};

export function getColumnsForTool(toolName: string): ColumnDef[] | null {
  const n = toolName.toLowerCase();
  for (const [key, cols] of Object.entries(CONFIGS)) {
    if (n === key || n.includes(key)) return cols;
  }
  return null;
}

/** Auto-generate columns from the top-level keys of a JSON args object. */
export function fallbackColumns(argsJson: string): ColumnDef[] {
  try {
    const obj = JSON.parse(argsJson);
    if (typeof obj !== "object" || !obj) return [];
    return Object.keys(obj)
      .filter((k) => k !== "type")
      .slice(0, 4)
      .map((k) => ({
        key: k,
        label: k,
        render: (v: unknown) => truncate(String(v), 60),
      }));
  } catch {
    return [];
  }
}
