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
  ChatEmptyState: ({
    onSelectSuggestion,
  }: {
    onSelectSuggestion: (text: string) => void;
  }) => <button onClick={() => onSelectSuggestion("suggested")}>empty</button>,
}));

vi.mock("../../assets/icon.png", () => ({ default: "icon.png" }));
vi.mock("../../assets/hermes.png", () => ({ default: "hermes.png" }));
vi.mock("../../assets/hermes-icon.png", () => ({ default: "hermes-icon.png" }));

import * as hermesTauri from "@renderer/lib/hermes-tauri";
import Chat from "./Chat";

function installHermesAPI() {
  const api = {
    isRemoteMode: vi.fn().mockResolvedValue(false),
    startGateway: vi.fn().mockResolvedValue(undefined),
    tuiCreateSession: vi.fn().mockResolvedValue({ session_id: "rt-1" }),
    tuiSetGoal: vi.fn().mockResolvedValue({}),
    tuiSetModel: vi.fn().mockResolvedValue({}),
    tuiSteer: vi
      .fn()
      .mockResolvedValue({ result: { status: "queued", text: "nudge" } }),
    tuiCompress: vi.fn().mockResolvedValue({
      result: {
        messages: [{ role: "assistant", text: "compressed" }],
        info: { model: "gpt-4o-mini", title: "Chat title" },
        usage: { input: 1, output: 2, total: 3 },
      },
    }),
    tuiUndo: vi.fn().mockResolvedValue({}),
    tuiSessionHistory: vi.fn().mockResolvedValue({
      result: {
        messages: [
          { role: "user", text: "after undo" },
          { role: "assistant", text: "restored" },
        ],
      },
    }),
    tuiSessionBranch: vi
      .fn()
      .mockResolvedValue({ result: { session_id: "branch-1" } }),
    tuiCommandDispatch: vi
      .fn()
      .mockImplementation((_sid: string, name: string, arg?: string) => {
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
    tuiSessionTitle: vi
      .fn()
      .mockResolvedValue({ title: "Chat title", session_key: "db-1" }),
    tuiClarifyRespond: vi.fn().mockResolvedValue(undefined),
    tuiApprovalRespond: vi.fn().mockResolvedValue(undefined),
    tuiResumeSession: vi.fn().mockResolvedValue({ session_id: "rt-1" }),
    getModelConfig: vi
      .fn()
      .mockResolvedValue({
        model: "gpt-4o-mini",
        provider: "openai",
        baseUrl: "",
      }),
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

  for (const [key, val] of Object.entries(api)) {
    if (key in hermesTauri && typeof (hermesTauri as any)[key] === "function") {
      vi.mocked((hermesTauri as any)[key]).mockImplementation(val as any);
    }
  }

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

  it("clears approval prompt immediately, records history, and sends one response", async () => {
    const api = installHermesAPI();
    const onSessionStateChange = vi.fn();

    const view = render(
      <Chat
        messages={[{ id: "m1", role: "agent", content: "Need approval" }]}
        setMessages={vi.fn() as any}
        sessionId="rt-1"
        pendingApproval={{
          command: "python scripts/migrate.py --force",
          description: "Run migration",
          patternKey: "migration",
          patternKeys: ["migration"],
        }}
        onSessionStateChange={onSessionStateChange}
      />,
    );

    expect(view.container.querySelector(".chat-approval-inline-card")).not.toBeNull();

    const approveButton = view.container.querySelector(
      ".chat-approval-approve",
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(approveButton);
      fireEvent.click(approveButton);
    });

    expect(onSessionStateChange).toHaveBeenCalledWith({
      pendingApproval: null,
    });
    await waitFor(() => {
      expect(api.tuiApprovalRespond).toHaveBeenCalledTimes(1);
      expect(api.tuiApprovalRespond).toHaveBeenCalledWith(
        "rt-1",
        "approve",
        false,
      );
    });

    view.rerender(
      <Chat
        messages={[{ id: "m1", role: "agent", content: "Need approval" }]}
        setMessages={vi.fn() as any}
        sessionId="rt-1"
        pendingApproval={null}
        onSessionStateChange={onSessionStateChange}
      />,
    );
    expect(view.container.querySelector(".chat-approval-modal")).toBeNull();
    expect(
      view.container.querySelector(".chat-approval-history")?.textContent,
    ).toContain("Approved");
  });

  it("auto approves pending approval when client auto mode is enabled", async () => {
    const api = installHermesAPI();
    window.localStorage.getItem = vi.fn((key: string) => {
      if (key === "hermes:approval-policy:v1") {
        return JSON.stringify({
          mode: "auto_approve",
          timeoutSeconds: 30,
          timeoutAction: "deny",
          historyTtlMinutes: 15,
        });
      }
      return null;
    });
    const onSessionStateChange = vi.fn();

    render(
      <Chat
        messages={[{ id: "m1", role: "agent", content: "Need approval" }]}
        setMessages={vi.fn() as any}
        sessionId="rt-1"
        pendingApproval={{
          command: "cargo test",
          description: "Run tests",
          patternKey: "cargo",
          patternKeys: ["cargo"],
        }}
        onSessionStateChange={onSessionStateChange}
      />,
    );

    await waitFor(() => {
      expect(api.tuiApprovalRespond).toHaveBeenCalledWith(
        "rt-1",
        "approve",
        false,
      );
    });
    expect(onSessionStateChange).toHaveBeenCalledWith({
      pendingApproval: null,
    });
  });

  it("routes goal, model, compress, steer commands to the expected APIs", async () => {
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

    const textarea = view.container.querySelector(
      "textarea",
    ) as HTMLTextAreaElement;

    // Test /goal command
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "/goal finish task" } });
      fireEvent.keyDown(textarea, { key: "Enter" });
    });
    await waitFor(() => {
      expect(api.tuiCommandDispatch).toHaveBeenCalledWith(
        "rt-1",
        "goal",
        "finish task",
      );
      expect(api.tuiSubmitPrompt).toHaveBeenCalledWith("rt-1", "finish task");
    });

    // Test /model command
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "/model gpt-4o" } });
      fireEvent.keyDown(textarea, { key: "Enter" });
    });
    await waitFor(() => {
      expect(api.tuiSetModel).toHaveBeenCalledWith("rt-1", "gpt-4o");
    });

    // Test /compress command
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "/compress " } });
      fireEvent.keyDown(textarea, { key: "Enter" });
    });
    await waitFor(() => {
      expect(api.tuiCompress).toHaveBeenCalledWith("rt-1", undefined);
    });

    // Test /steer command
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "/steer nudge" } });
      fireEvent.keyDown(textarea, { key: "Enter" });
    });
    await waitFor(() => {
      expect(api.tuiCommandDispatch).toHaveBeenCalledWith(
        "rt-1",
        "steer",
        "nudge",
      );
    });
  });
});
