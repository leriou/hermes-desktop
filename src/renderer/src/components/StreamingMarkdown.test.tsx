import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StreamingMarkdown } from "./StreamingMarkdown";

describe("StreamingMarkdown", () => {
  it("renders a complete table block before the whole message finishes", () => {
    const { container } = render(
      <StreamingMarkdown>
        {
          "before\n\n| Name | Status |\n| --- | --- |\n| build | pass |\n\ncontinuing..."
        }
      </StreamingMarkdown>,
    );

    const table = container.querySelector("table.sm-table");
    expect(table).not.toBeNull();
    expect(table?.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(table?.textContent).toContain("build");
    expect(container.textContent).toContain("continuing...");
  });

  it("does not render an unfinished trailing table as a table", () => {
    const { container } = render(
      <StreamingMarkdown>
        {"| Name | Status |\n| --- | --- |\n| build |"}
      </StreamingMarkdown>,
    );

    expect(container.querySelector("table.sm-table")).toBeNull();
    expect(container.textContent).toContain("| build |");
  });

  it("renders a trailing table at EOF without requiring a blank line", () => {
    const { container } = render(
      <StreamingMarkdown>
        {"| Name | Status |\n| --- | --- |\n| build | pass |"}
      </StreamingMarkdown>,
    );

    const table = container.querySelector("table.sm-table");
    expect(table).not.toBeNull();
    expect(table?.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(table?.textContent).toContain("build");
  });
});
