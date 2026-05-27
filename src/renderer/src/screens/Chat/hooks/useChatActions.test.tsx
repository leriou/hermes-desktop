import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatActions } from "./useChatActions";

vi.mock("@renderer/lib/hermes-tauri", () => ({
  startGateway: vi.fn().mockResolvedValue(undefined),
  tuiCreateSession: vi.fn().mockResolvedValue({ session_id: "sid-1" }),
  tuiSubmitPrompt: vi.fn().mockResolvedValue(undefined),
  tuiResumeSession: vi.fn().mockResolvedValue({ session_id: "sid-1" }),
  tuiSteer: vi.fn().mockResolvedValue({ result: { status: "queued" } }),
  tuiInterrupt: vi.fn().mockResolvedValue(undefined),
  tuiClarifyRespond: vi.fn().mockResolvedValue(undefined),
}));

describe("useChatActions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });
  function baseArgs(isLoading: boolean) {
    return {
      hermesSessionId: "sid-1",
      dbSessionId: "db-1",
      messages: [],
      isLoading,
      setIsLoading: vi.fn(),
      setMessages: vi.fn(),
      setHermesSessionId: vi.fn(),
      chatInputRef: { current: null },
      localCommands: {
        isLocal: vi.fn().mockReturnValue(false),
        executeLocal: vi.fn().mockResolvedValue(false),
      },
      contextFolder: null,
      pendingClarify: null,
      setPendingClarify: vi.fn(),
      activeTabId: "tab-1",
      updateTab: vi.fn(),
    };
  }

  it("drains explicit queued input as the next prompt after loading ends", async () => {
    const args = baseArgs(true);
    const { result, rerender } = renderHook(
      ({ loading }) => useChatActions({ ...args, isLoading: loading }),
      { initialProps: { loading: true } },
    );

    await result.current.handleSend("/queue follow up");
    const { tuiSubmitPrompt } = await import("@renderer/lib/hermes-tauri");
    expect(tuiSubmitPrompt).not.toHaveBeenCalled();

    rerender({ loading: false });

    await waitFor(() => {
      expect(tuiSubmitPrompt).toHaveBeenCalledWith("sid-1", "follow up");
    });
  });

  it("sends queued input after loading ends and preserves text", async () => {
    const args = baseArgs(true);
    const { result, rerender } = renderHook(
      ({ loading }) => useChatActions({ ...args, isLoading: loading }),
      { initialProps: { loading: true } },
    );

    await result.current.handleSend("/queue hello from queue");

    const { tuiSubmitPrompt } = await import("@renderer/lib/hermes-tauri");
    expect(tuiSubmitPrompt).not.toHaveBeenCalled();

    rerender({ loading: false });

    await waitFor(() => {
      expect(tuiSubmitPrompt).toHaveBeenCalledWith("sid-1", "hello from queue");
    });
  });

  it("steer uses current runtime session without creating a new turn", async () => {
    const args = baseArgs(true);
    const { result } = renderHook(
      ({ loading }) => useChatActions({ ...args, isLoading: loading }),
      { initialProps: { loading: true } },
    );

    await result.current.handleSend("focus on the error handling");

    const { tuiSteer } = await import("@renderer/lib/hermes-tauri");
    expect(tuiSteer).toHaveBeenCalledWith("sid-1", "focus on the error handling");
  });

  it("interrupt sends tuiInterrupt with current session id", async () => {
    const args = baseArgs(true);
    const { result } = renderHook(
      ({ loading }) => useChatActions({ ...args, isLoading: loading }),
      { initialProps: { loading: true } },
    );

    result.current.handleAbort();

    const { tuiInterrupt } = await import("@renderer/lib/hermes-tauri");
    expect(tuiInterrupt).toHaveBeenCalledWith("sid-1");
  });

  it("creates visible error system event on submit failure without losing input", async () => {
    const args = baseArgs(false);
    const { tuiSubmitPrompt } = await import("@renderer/lib/hermes-tauri");
    vi.mocked(tuiSubmitPrompt).mockRejectedValueOnce(new Error("gateway down"));

    const { result } = renderHook(
      ({ loading }) => useChatActions({ ...args, isLoading: loading }),
      { initialProps: { loading: false } },
    );

    await result.current.handleSend("hello");

    await waitFor(() => {
      expect(args.setMessages).toHaveBeenCalled();
      const calls = args.setMessages.mock.calls;
      const lastCallUpdater = calls[calls.length - 1][0] as (
        prev: unknown[],
      ) => unknown[];
      const result_messages = lastCallUpdater([]);
      expect(result_messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: "agent",
            content: expect.stringContaining("Error"),
          }),
        ]),
      );
    });
  });
});
