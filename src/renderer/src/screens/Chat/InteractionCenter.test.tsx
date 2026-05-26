import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InteractionCenter } from "./InteractionCenter";

describe("InteractionCenter", () => {
  it("renders sudo and secret prompts in one chat interaction surface", () => {
    const onSudoRespond = vi.fn();
    const onSecretRespond = vi.fn();
    const { container } = render(
      <InteractionCenter
        pendingSudo={{ requestId: "sudo-1" }}
        pendingSecret={{ requestId: "secret-1", envVar: "OPENAI_API_KEY", prompt: "API key" }}
        onSudoRespond={onSudoRespond}
        onSecretRespond={onSecretRespond}
      />,
    );

    expect(container.querySelector(".chat-interaction-center")).not.toBeNull();
    expect(container.querySelectorAll(".chat-interaction-card")).toHaveLength(2);

    const sudoInput = container.querySelector(".chat-sudo-card input") as HTMLInputElement;
    fireEvent.change(sudoInput, { target: { value: "pw" } });
    fireEvent.click(container.querySelector(".chat-sudo-card button") as HTMLButtonElement);
    expect(onSudoRespond).toHaveBeenCalledWith("pw");

    const secretInput = container.querySelector(".chat-secret-card input") as HTMLInputElement;
    fireEvent.change(secretInput, { target: { value: "secret" } });
    fireEvent.click(container.querySelector(".chat-secret-card button") as HTMLButtonElement);
    expect(onSecretRespond).toHaveBeenCalledWith("secret");
  });

  it("renders nothing when no interaction is pending", () => {
    const { container } = render(
      <InteractionCenter
        pendingSudo={null}
        pendingSecret={null}
        onSudoRespond={vi.fn()}
        onSecretRespond={vi.fn()}
      />,
    );

    expect(container.querySelector(".chat-interaction-center")).toBeNull();
  });
});
