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

  it("keeps the aggregated call table and opens readable details", () => {
    const { container } = render(<ToolGroupRow msg={toolGroup} />);

    expect(container.querySelector(".tool-group-table")).not.toBeNull();
    expect(screen.getByText("2次调用 · 1✓ 1…")).toBeInTheDocument();
    expect(screen.getByText("npm test")).toBeInTheDocument();
    expect(screen.getByText("npm run typecheck:web")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看第 1 次 shell 调用详情" }));

    expect(screen.getByRole("dialog", { name: "shell 调用详情" })).toBeInTheDocument();
    expect(screen.getByText("call-1")).toBeInTheDocument();
    expect(screen.getByText("succeeded")).toBeInTheDocument();
    expect(screen.getByText("Args")).toBeInTheDocument();
    expect(screen.getByText("Result")).toBeInTheDocument();
  });

  it("shows pending progress and a raw inspect section in tool details", () => {
    const pendingGroup: ToolGroupMessage = {
      ...toolGroup,
      calls: [
        {
          id: "call-progress",
          kind: "tool_call",
          role: "agent",
          callId: "call-progress",
          name: "shell",
          args: "{bad json",
          progress: "installing dependencies",
        },
      ],
    };

    render(<ToolGroupRow msg={pendingGroup} />);
    fireEvent.click(screen.getByRole("button", { name: "查看第 1 次 shell 调用详情" }));

    expect(screen.getByText("running")).toBeInTheDocument();
    expect(screen.getByText("Progress")).toBeInTheDocument();
    expect(screen.getByText("installing dependencies")).toBeInTheDocument();
    expect(screen.getByText("Raw")).toBeInTheDocument();
    expect(screen.getByText(/"callId": "call-progress"/)).toBeInTheDocument();
  });
});
