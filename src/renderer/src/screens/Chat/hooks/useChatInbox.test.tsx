import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatInbox } from "./useChatInbox";
import type { SessionState } from "./useSessionManager";

describe("useChatInbox", () => {
  let eventHandler: ((event: { type: string; payload?: unknown; session_id?: string }) => void) | null;

  function sessionState(): SessionState {
    return {
      messages: [],
      isLoading: true,
      usage: null,
      streamingText: "",
      streamingReasoning: "",
      toolProgress: null,
      hermesSessionId: "sid-1",
      dbSessionId: "db-1",
      pendingApproval: null,
      pendingClarify: null,
      pendingSudo: null,
      pendingSecret: null,
      pendingModelSwitch: null,
      unreadCount: 0,
      title: "",
      model: "",
      updatedAt: Date.now(),
    };
  }

  beforeEach(() => {
    eventHandler = null;
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        onTuiEvent: vi.fn((handler) => {
          eventHandler = handler;
          return () => {};
        }),
      },
    });
  });

  it("routes session_id gateway events to the matching session tab", async () => {
    const updateTab = vi.fn();
    const sessions = new Map<string, SessionState>([
      [
        "tab-1",
        {
          ...sessionState(),
        },
      ],
    ]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: (sid) => (sid === "sid-1" ? "tab-1" : null),
        updateTab,
        updateTabMessages: vi.fn(),
      }),
    );

    eventHandler?.({ type: "message.start", session_id: "sid-1", payload: {} });

    await waitFor(() => {
      expect(updateTab).toHaveBeenCalledWith("tab-1", {
        isLoading: true,
        toolProgress: null,
        streamingReasoning: "",
      });
    });
  });

  it("renders gateway provider errors and compression status as system events", async () => {
    const updateTabMessages = vi.fn();
    const sessions = new Map<string, SessionState>([["tab-1", sessionState()]]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => "tab-1",
        updateTab: vi.fn(),
        updateTabMessages,
      }),
    );

    eventHandler?.({ type: "error", session_id: "sid-1", payload: { message: "HTTP 429: rate limit exceeded" } });
    eventHandler?.({ type: "status.update", session_id: "sid-1", payload: { kind: "compressing", text: "compressing context" } });

    await waitFor(() => {
      const firstUpdater = updateTabMessages.mock.calls[0][1] as (prev: unknown[]) => unknown[];
      const secondUpdater = updateTabMessages.mock.calls[1][1] as (prev: unknown[]) => unknown[];
      expect(firstUpdater([])[0]).toMatchObject({
        kind: "system_event",
        role: "system",
        event: "provider_error",
        title: "Provider error 429",
      });
      expect(secondUpdater([])[0]).toMatchObject({
        kind: "system_event",
        role: "system",
        event: "context_compress",
        title: "Compressing session",
      });
    });
  });
});
