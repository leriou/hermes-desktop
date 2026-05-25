import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: () => {},
  }),
}));

vi.mock("./ChatEmptyState", () => ({
  ChatEmptyState: ({ onSelectSuggestion }: { onSelectSuggestion: (text: string) => void }) => (
    <button onClick={() => onSelectSuggestion("suggested")}>empty</button>
  ),
}));

vi.mock("../../assets/icon.png", () => ({ default: "icon.png" }));
vi.mock("../../assets/hermes.png", () => ({ default: "hermes.png" }));
vi.mock("../../assets/hermes-icon.png", () => ({ default: "hermes-icon.png" }));

import Chat from "./Chat";

function installHermesAPI() {
  const api = {
    isRemoteMode: vi.fn().mockResolvedValue(false),
    startGateway: vi.fn().mockResolvedValue(undefined),
    tuiCreateSession: vi.fn().mockResolvedValue({ session_id: "rt-1" }),
    tuiSetGoal: vi.fn().mockResolvedValue({}),
    tuiSetModel: vi.fn().mockResolvedValue({}),
    tuiSteer: vi.fn().mockResolvedValue({ result: { status: "queued", text: "nudge" } }),
    tuiCompress: vi.fn().mockResolvedValue({
      result: {
        messages: [{ role: "assistant", text: "compressed" }],
        info: { model: "gpt-4o-mini", title: "Chat title" },
        usage: { input: 1, output: 2, total: 3 },
      },
    }),
    tuiCommandDispatch: vi.fn().mockImplementation((_sid: string, name: string, arg?: string) => {
      if (name === "goal") {
        return Promise.resolve({
          result: {
            type: "send",
            notice: "goal notice",
            message: arg || "",
          },
        });
      }
      if (name === "steer") {
        return Promise.resolve({
          result: {
            type: "send",
            message: arg || "",
          },
        });
      }
      return Promise.resolve({ result: {} });
    }),
    tuiSubmitPrompt: vi.fn().mockResolvedValue(undefined),
    tuiSessionTitle: vi.fn().mockResolvedValue({ title: "Chat title", session_key: "db-1" }),
    tuiClarifyRespond: vi.fn().mockResolvedValue(undefined),
    tuiResumeSession: vi.fn().mockResolvedValue({ session_id: "rt-1" }),
    getModelConfig: vi.fn().mockResolvedValue({ model: "gpt-4o-mini", provider: "openai", baseUrl: "" }),
    listModels: vi.fn().mockResolvedValue([]),
    getModelAliases: vi.fn().mockResolvedValue([
      {
        name: "Fast Alias",
        model: "gpt-4o-mini",
        provider: "openai",
        baseUrl: "",
      },
    ]),
    setModelConfig: vi.fn().mockResolvedValue(true),
    getConfig: vi.fn().mockResolvedValue(""),
    setConfig: vi.fn().mockResolvedValue(true),
    onTuiEvent: vi.fn().mockImplementation(() => () => {}),
    onContextMenuCopyChat: vi.fn().mockImplementation(() => () => {}),
    onContextMenuSelectBubble: vi.fn().mockImplementation(() => () => {}),
    copyToClipboard: vi.fn().mockResolvedValue(undefined),
    selectFolder: vi.fn().mockResolvedValue(null),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    clearStagedAttachments: vi.fn().mockResolvedValue(undefined),
    abortChat: vi.fn(),
    voiceTts: vi.fn().mockResolvedValue(undefined),
  };

  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: api,
  });

  return api;
}

describe("Chat command wiring", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
        clear: vi.fn(),
        removeItem: vi.fn(),
      },
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("routes goal, toolbar model/compress/steer, and bottom-left alias picker to the expected APIs", async () => {
    const api = installHermesAPI();
    const setMessages = vi.fn();
    const onSessionStateChange = vi.fn();

    const view = render(
      <Chat
        messages={[
          { id: "m1", role: "user", content: "hello" },
          { id: "m2", role: "agent", content: "world" },
        ]}
        setMessages={setMessages as any}
        sessionId="rt-1"
        dbSessionId="db-1"
        sessionTitle="New Chat"
        onSessionStateChange={onSessionStateChange}
      />,
    );

    await waitFor(() => {
      expect(api.getModelAliases).toHaveBeenCalled();
    });

    const toolbarButtons = Array.from(view.container.querySelectorAll(".tui-btn")) as HTMLButtonElement[];

    await act(async () => {
      fireEvent.click(toolbarButtons.find((b) => b.textContent?.includes("Goal"))!);
    });
    const goalInput = view.container.querySelector(".tui-popover-input") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(goalInput, { target: { value: "finish task" } });
      fireEvent.keyDown(goalInput, { key: "Enter" });
    });
    await waitFor(() => {
      expect(api.tuiCommandDispatch).toHaveBeenCalledWith("rt-1", "goal", "finish task");
      expect(api.tuiSubmitPrompt).toHaveBeenCalledWith("rt-1", "finish task");
    });

    await act(async () => {
      fireEvent.click(toolbarButtons.find((b) => b.textContent?.includes("Model"))!);
    });
    const modelInput = view.container.querySelector(".tui-popover-input") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(modelInput, { target: { value: "gpt-4o" } });
      fireEvent.keyDown(modelInput, { key: "Enter" });
    });
    await waitFor(() => {
      expect(api.tuiSetModel).toHaveBeenCalledWith("rt-1", "gpt-4o");
    });

    await act(async () => {
      fireEvent.click(toolbarButtons.find((b) => b.textContent?.includes("Compress"))!);
    });
    const yesBtn = Array.from(view.container.querySelectorAll(".tui-popover-btn")).find(
      (el) => (el as HTMLButtonElement).textContent === "Yes",
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(yesBtn);
    });
    await waitFor(() => {
      expect(api.tuiCompress).toHaveBeenCalledWith("rt-1", undefined);
      expect(api.tuiSessionTitle).toHaveBeenCalledWith("rt-1");
    });

    const steerBtn = toolbarButtons.find((b) => b.textContent?.includes("Steer"))!;
    expect(steerBtn.disabled).toBe(true);

    view.rerender(
      <Chat
        messages={[
          { id: "m1", role: "user", content: "hello" },
          { id: "m2", role: "agent", content: "world" },
        ]}
        setMessages={setMessages as any}
        sessionId="rt-1"
        dbSessionId="db-1"
        sessionTitle="New Chat"
        onSessionStateChange={onSessionStateChange}
      />,
    );

    const textarea = view.container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "/steer nudge" } });
      fireEvent.keyDown(textarea, { key: "Enter" });
    });
    await waitFor(() => {
      expect(api.tuiCommandDispatch).toHaveBeenCalledWith("rt-1", "steer", "nudge");
      expect(api.tuiSubmitPrompt).toHaveBeenCalledWith("rt-1", "nudge");
    });

    const modelTrigger = view.container.querySelector(".chat-model-trigger") as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(modelTrigger);
    });
    const aliasBtn = Array.from(view.container.querySelectorAll(".chat-model-option")).find(
      (el) => (el as HTMLButtonElement).textContent?.includes("Fast Alias"),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(aliasBtn);
    });
    await waitFor(() => {
      expect(api.setModelConfig).toHaveBeenCalledWith("openai", "gpt-4o-mini", "", undefined);
      expect(api.tuiSetModel).toHaveBeenCalledWith("rt-1", "Fast Alias");
    });
  });
});
