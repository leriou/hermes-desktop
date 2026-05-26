import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentMarkdown } from "./AgentMarkdown";
import { I18nProvider } from "./I18nProvider";

describe("AgentMarkdown", () => {
  it("uses the same stable table shell as streaming markdown", () => {
    const { container } = render(
      <AgentMarkdown>
        {"| Name | Status |\n| --- | --- |\n| build | pass |"}
      </AgentMarkdown>,
    );

    expect(container.querySelector(".sm-table-wrap")).not.toBeNull();
    expect(container.querySelector("table.sm-table")).not.toBeNull();
    expect(container.textContent).toContain("build");
  });

  it("shows a plain code placeholder before deferred highlighting", () => {
    const { container } = render(
      <I18nProvider>
        <AgentMarkdown>
          {"```ts\nconst value = 1;\n```"}
        </AgentMarkdown>
      </I18nProvider>,
    );

    expect(container.querySelector(".chat-code-block")).not.toBeNull();
    expect(container.querySelector(".chat-code-placeholder")?.textContent).toContain("const value = 1;");
  });
});
