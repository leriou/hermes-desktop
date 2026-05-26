import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatActions } from "./useChatActions";

describe("useChatActions", () => {
  beforeEach(() => {
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        startGateway: vi.fn().mockResolvedValue(undefined),
        tuiCreateSession: vi.fn().mockResolvedValue({ session_id: "sid-1" }),
        tuiSubmitPrompt: vi.fn().mockResolvedValue(undefined),
        tuiResumeSession: vi.fn().mockResolvedValue({ session_id: "sid-1" }),
        tuiSteer: vi.fn().mockResolvedValue({ result: { status: "queued" } }),
        tuiInterrupt: vi.fn().mockResolvedValue(undefined),
        tuiClarifyRespond: vi.fn().mockResolvedValue(undefined),
      },
    });
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
    };
  }

  it("drains explicit queued input as the next prompt after loading ends", async () => {
    const args = baseArgs(true);
    const { result, rerender } = renderHook(
      ({ loading }) => useChatActions({ ...args, isLoading: loading }),
      { initialProps: { loading: true } },
    );

    await result.current.handleSend("/queue follow up");
    expect(window.hermesAPI.tuiSubmitPrompt).not.toHaveBeenCalled();

    rerender({ loading: false });

    await waitFor(() => {
      expect(window.hermesAPI.tuiSubmitPrompt).toHaveBeenCalledWith("sid-1", "follow up");
    });
  });
});
