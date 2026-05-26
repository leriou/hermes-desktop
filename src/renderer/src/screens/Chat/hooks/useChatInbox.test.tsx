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

  it("keeps live reasoning attached to the current assistant turn", async () => {
    const updateTabMessages = vi.fn();
    const sessions = new Map<string, SessionState>([
      [
        "tab-1",
        {
          ...sessionState(),
          streamingText: "Current answer",
          streamingReasoning: "Current thinking",
        },
      ],
    ]);

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

    eventHandler?.({ type: "message.complete", session_id: "sid-1", payload: {} });

    await waitFor(() => {
      const updater = updateTabMessages.mock.calls[0][1] as (prev: unknown[]) => unknown[];
      expect(updater([
        { id: "user-1", role: "user", content: "first" },
        { id: "agent-1", role: "agent", content: "Previous answer" },
        { id: "user-2", role: "user", content: "second" },
      ])).toMatchObject([
        { id: "user-1" },
        { id: "agent-1", content: "Previous answer" },
        { id: "user-2" },
        { kind: "reasoning", text: "Current thinking" },
        { role: "agent", content: "Current answer" },
      ]);
    });
  });

  it("does not replace tool or system rows when finalizing live assistant text", async () => {
    const updateTabMessages = vi.fn();
    const sessions = new Map<string, SessionState>([
      [
        "tab-1",
        {
          ...sessionState(),
          streamingText: "Final assistant answer",
        },
      ],
    ]);

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

    eventHandler?.({ type: "message.complete", session_id: "sid-1", payload: {} });

    await waitFor(() => {
      const updater = updateTabMessages.mock.calls[0][1] as (prev: unknown[]) => unknown[];
      expect(updater([
        { id: "tool-result", kind: "tool_result", role: "agent", content: "tool output" },
        { id: "status", kind: "system_status", role: "agent", content: "queued" },
      ])).toMatchObject([
        { id: "tool-result", kind: "tool_result", content: "tool output" },
        { id: "status", kind: "system_status", content: "queued" },
        { role: "agent", content: "Final assistant answer" },
      ]);
    });
  });

  it("does not append committed live text into tool or system rows", () => {
    const updateTabMessages = vi.fn();
    const sessions = new Map<string, SessionState>([
      ["tab-1", { ...sessionState(), streamingText: "streaming answer" }],
    ]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => "tab-1",
        updateTab: vi.fn((_, patch) => {
          const current = sessions.get("tab-1");
          if (current) sessions.set("tab-1", { ...current, ...patch });
        }),
        updateTabMessages,
      }),
    );

    eventHandler?.({ type: "error", session_id: "sid-1", payload: { message: "boom" } });

    const updater = updateTabMessages.mock.calls[0][1] as (prev: unknown[]) => unknown[];
    expect(updater([
      { id: "tool-result", kind: "tool_result", role: "agent", content: "tool output" },
    ])).toMatchObject([
      { id: "tool-result", kind: "tool_result", content: "tool output" },
      { role: "agent", content: "streaming answer" },
    ]);
  });
});
