import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToolGroupRow } from "./ToolGroupRow";
import type { ToolGroupMessage } from "./types";

const toolGroup: ToolGroupMessage = {
  id: "group-1",
  kind: "tool_group",
  role: "agent",
  toolName: "shell",
  calls: [
    {
      id: "call-1",
      kind: "tool_call",
      role: "agent",
      callId: "call-1",
      name: "shell",
      args: JSON.stringify({ cmd: "npm test" }),
      result: JSON.stringify({ ok: true }),
      success: true,
      durationS: 1.2,
    },
    {
      id: "call-2",
      kind: "tool_call",
      role: "agent",
      callId: "call-2",
      name: "shell",
      args: JSON.stringify({ cmd: "npm run typecheck:web" }),
      success: undefined,
    },
  ],
};

describe("ToolGroupRow", () => {
  beforeEach(() => {
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        copyToClipboard: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders multiple tool calls as an aggregated table in a details block", () => {
    const { container } = render(<ToolGroupRow msg={toolGroup} />);

    expect(container.querySelector(".chat-history--tool-group")).not.toBeNull();
    expect(screen.getByText("2次调用 · 1✓ 1…")).toBeInTheDocument();

    // 确认渲染了内部的 table
    expect(container.querySelector(".tool-group-table")).not.toBeNull();
    expect(screen.getByText("npm test")).toBeInTheDocument();
    expect(screen.getByText("npm run typecheck:web")).toBeInTheDocument();

    // 点击详情按钮
    const detailButtons = screen.getAllByRole("button", { name: /查看第 \d+ 次 shell 调用详情/ });
    expect(detailButtons).toHaveLength(2);

    fireEvent.click(detailButtons[0]);

    expect(
      screen.getByRole("dialog", { name: "shell 调用详情" }),
    ).toBeInTheDocument();
    expect(screen.getByText("call-1")).toBeInTheDocument();
    expect(screen.getByText("succeeded")).toBeInTheDocument();
  });

  it("renders a single tool call directly as a compact footprint and opens modal", () => {
    const singleGroup: ToolGroupMessage = {
      id: "group-single",
      kind: "tool_group",
      role: "agent",
      toolName: "shell",
      calls: [
        {
          id: "call-single",
          kind: "tool_call",
          role: "agent",
          callId: "call-single",
          name: "shell",
          args: JSON.stringify({ cmd: "npm run build" }),
          result: undefined,
          progress: "bundling assets",
        },
      ],
    };

    const { container } = render(<ToolGroupRow msg={singleGroup} />);

    expect(container.querySelector(".chat-tool-single-footprint")).not.toBeNull();
    expect(screen.getByText(/Run command/)).toBeInTheDocument();
    expect(screen.getByText("npm run build")).toBeInTheDocument();
    expect(screen.getByText(/bundling assets/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "查看第 1 次 shell 调用详情" }),
    );

    expect(screen.getByRole("dialog", { name: "shell 调用详情" })).toBeInTheDocument();
    expect(screen.getByText("running")).toBeInTheDocument();
    expect(screen.getByText("Progress")).toBeInTheDocument();
    expect(screen.getByText("bundling assets")).toBeInTheDocument();
    expect(screen.getByText("Raw")).toBeInTheDocument();
  });

  it("uses gateway context as the visible fallback when verbose args are omitted", () => {
    const singleGroup: ToolGroupMessage = {
      id: "group-context",
      kind: "tool_group",
      role: "agent",
      toolName: "shell",
      calls: [
        {
          id: "call-context",
          kind: "tool_call",
          role: "agent",
          callId: "call-context",
          name: "shell",
          args: "",
          context: "npm run typecheck",
          result: "{}",
          success: true,
        },
      ],
    };

    render(<ToolGroupRow msg={singleGroup} />);

    expect(screen.getByText("npm run typecheck")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "查看第 1 次 shell 调用详情" }),
    );

    expect(screen.getByText("Args")).toBeInTheDocument();
    expect(screen.getAllByText("npm run typecheck").length).toBeGreaterThan(1);
  });
});
