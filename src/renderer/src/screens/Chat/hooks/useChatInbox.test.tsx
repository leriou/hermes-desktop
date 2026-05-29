import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatInbox } from "./useChatInbox";
import type { SessionState } from "./useSessionManager";
import {
  onTuiEvent,
  tuiSessionActiveList,
  tuiSessionStatus,
} from "@renderer/lib/hermes-tauri";

describe("useChatInbox", () => {
  let eventHandler:
    | ((params: { type: string; payload: any; sid?: string }) => void)
    | null;

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
      relatedSessionIds: [],
      pendingApproval: null,
      pendingClarify: null,
      pendingSudo: null,
      pendingSecret: null,
      pendingModelSwitch: null,
      pendingModelSwitchMessageId: null,
      todos: [],
      unreadCount: 0,
      title: "",
      model: "",
      updatedAt: Date.now(),
    };
  }

  beforeEach(() => {
    vi.useRealTimers();
    eventHandler = null;
    vi.mocked(onTuiEvent).mockImplementation((handler) => {
      eventHandler = handler;
      return () => {};
    });
    vi.mocked(tuiSessionActiveList).mockReset();
    vi.mocked(tuiSessionStatus).mockReset();
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

    eventHandler?.({ type: "message.start", sid: "sid-1", payload: {} });

    await waitFor(() => {
      expect(updateTab).toHaveBeenCalledWith("tab-1", {
        isLoading: true,
        toolProgress: null,
        streamingReasoning: "",
        todos: [],
      });
    });
  });

  it("routes completion events by db session key when the live session id changed", async () => {
    const updateTab = vi.fn((tabId: string, patch: Partial<SessionState>) => {
      const current = sessions.get(tabId);
      if (current) sessions.set(tabId, { ...current, ...patch });
    });
    const updateTabMessages = vi.fn();
    const sessions = new Map<string, SessionState>([
      [
        "tab-1",
        {
          ...sessionState(),
          hermesSessionId: "old-live-sid",
          dbSessionId: "session-key-1",
          toolProgress: "analyzing tool output…",
        },
      ],
    ]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: (sid) =>
          sid === "session-key-1" ? "tab-1" : null,
        updateTab,
        updateTabMessages,
      }),
    );

    eventHandler?.({
      type: "message.complete",
      sid: "session-key-1",
      payload: { text: "done" },
    });

    await waitFor(() => {
      expect(updateTab).toHaveBeenCalledWith(
        "tab-1",
        expect.objectContaining({
          hermesSessionId: "session-key-1",
          isLoading: false,
          toolProgress: null,
        }),
      );
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

    eventHandler?.({
      type: "error",
      sid: "sid-1",
      payload: { message: "HTTP 429: rate limit exceeded" },
    });
    eventHandler?.({
      type: "status.update",
      sid: "sid-1",
      payload: { kind: "compressing", text: "compressing context" },
    });
    eventHandler?.({
      type: "status.update",
      sid: "sid-1",
      payload: { kind: "compressing", text: "🗜️ Context too large (~24,192 tokens) — compressing (1/3)..." },
    });
    eventHandler?.({
      type: "status.update",
      sid: "sid-1",
      payload: { kind: "compressing", text: "🗜️ Context compacted: ~24,192 -> ~4,200 tokens" },
    });

    await waitFor(() => {
      const firstUpdater = updateTabMessages.mock.calls[0][1] as (
        prev: unknown[],
      ) => unknown[];
      const secondUpdater = updateTabMessages.mock.calls[1][1] as (
        prev: unknown[],
      ) => unknown[];
      const thirdUpdater = updateTabMessages.mock.calls[2][1] as (
        prev: unknown[],
      ) => unknown[];
      const fourthUpdater = updateTabMessages.mock.calls[3][1] as (
        prev: unknown[],
      ) => unknown[];
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
        title: "Compacting session",
      });
      expect(thirdUpdater([])[0]).toMatchObject({
        kind: "system_event",
        role: "system",
        event: "context_compress",
        title: "Compacting session (~24,192 tok)",
      });
      expect(fourthUpdater([])[0]).toMatchObject({
        kind: "system_event",
        role: "system",
        event: "context_compress",
        title: "Session compressed (24,192 ➜ 4,200 tok)",
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

    eventHandler?.({ type: "message.complete", sid: "sid-1", payload: {} });

    await waitFor(() => {
      const updater = updateTabMessages.mock.calls[0][1] as (
        prev: unknown[],
      ) => unknown[];
      expect(
        updater([
          { id: "user-1", role: "user", content: "first" },
          { id: "agent-1", role: "agent", content: "Previous answer" },
          { id: "user-2", role: "user", content: "second" },
        ]),
      ).toMatchObject([
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

    eventHandler?.({ type: "message.complete", sid: "sid-1", payload: {} });

    await waitFor(() => {
      const updater = updateTabMessages.mock.calls[0][1] as (
        prev: unknown[],
      ) => unknown[];
      expect(
        updater([
          {
            id: "tool-result",
            kind: "tool_result",
            role: "agent",
            content: "tool output",
          },
          {
            id: "status",
            kind: "system_status",
            role: "agent",
            content: "queued",
          },
        ]),
      ).toMatchObject([
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

    eventHandler?.({
      type: "error",
      sid: "sid-1",
      payload: { message: "boom" },
    });

    const updater = updateTabMessages.mock.calls[0][1] as (
      prev: unknown[],
    ) => unknown[];
    expect(
      updater([
        {
          id: "tool-result",
          kind: "tool_result",
          role: "agent",
          content: "tool output",
        },
      ]),
    ).toMatchObject([
      { id: "tool-result", kind: "tool_result", content: "tool output" },
      { role: "agent", content: "streaming answer" },
    ]);
  });

  it("keeps gateway tool context when verbose args are omitted", async () => {
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

    eventHandler?.({
      type: "tool.start",
      sid: "sid-1",
      payload: {
        tool_id: "tool-1",
        name: "shell",
        context: "npm run typecheck",
      },
    });

    await waitFor(() => {
      const updater = updateTabMessages.mock.calls[0][1] as (
        prev: unknown[],
      ) => unknown[];
      expect(updater([])).toMatchObject([
        {
          kind: "tool_call",
          callId: "tool-1",
          name: "shell",
          args: "",
          context: "npm run typecheck",
        },
      ]);
    });
  });

  it("does not append duplicate bubbles on duplicate message.complete events", async () => {
    const updateTabMessages = vi.fn();
    const updateTab = vi.fn((_, patch) => {
      const current = sessions.get("tab-1");
      if (current) sessions.set("tab-1", { ...current, ...patch });
    });
    const sessions = new Map<string, SessionState>([
      ["tab-1", { ...sessionState(), streamingText: "Hello" }],
    ]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => "tab-1",
        updateTab,
        updateTabMessages,
      }),
    );

    // First complete
    eventHandler?.({ type: "message.complete", sid: "sid-1", payload: {} });
    await waitFor(() => expect(updateTabMessages).toHaveBeenCalledTimes(1));

    // Duplicate complete
    eventHandler?.({ type: "message.complete", sid: "sid-1", payload: {} });

    // Should not have been called again
    expect(updateTabMessages).toHaveBeenCalledTimes(1);
  });

  it("uses fallback accumulated text when complete payload has no text", async () => {
    const updateTabMessages = vi.fn();
    const sessions = new Map<string, SessionState>([
      ["tab-1", { ...sessionState(), streamingText: "Accumulated text" }],
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

    eventHandler?.({
      type: "message.complete",
      sid: "sid-1",
      payload: {},
    });

    await waitFor(() => {
      const updater = updateTabMessages.mock.calls[0][1] as (
        prev: unknown[],
      ) => unknown[];
      expect(updater([])).toMatchObject([
        { role: "agent", content: "Accumulated text" },
      ]);
    });
  });

  it("prefers complete payload text over accumulated streaming text", async () => {
    const updateTabMessages = vi.fn();
    const sessions = new Map<string, SessionState>([
      ["tab-1", { ...sessionState(), streamingText: "streaming fallback" }],
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

    eventHandler?.({
      type: "message.complete",
      sid: "sid-1",
      payload: { text: "authoritative final text" },
    });

    await waitFor(() => {
      const updater = updateTabMessages.mock.calls[0][1] as (
        prev: unknown[],
      ) => unknown[];
      expect(updater([])).toMatchObject([
        { role: "agent", content: "authoritative final text" },
      ]);
    });
  });

  it("preserves usage and model metadata after completion", async () => {
    const updateTabMessages = vi.fn();
    const updateTab = vi.fn((_, patch) => {
      const current = sessions.get("tab-1");
      if (current) sessions.set("tab-1", { ...current, ...patch });
    });
    const sessions = new Map<string, SessionState>([
      ["tab-1", { ...sessionState(), streamingText: "result" }],
    ]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => "tab-1",
        updateTab,
        updateTabMessages,
      }),
    );

    eventHandler?.({
      type: "message.complete",
      sid: "sid-1",
      payload: {
        usage: {
          input: 100,
          output: 50,
          total: 150,
          model: "claude-sonnet-4-6",
        },
      },
    });

    await waitFor(() => {
      expect(updateTab).toHaveBeenCalledWith(
        "tab-1",
        expect.objectContaining({
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          model: "claude-sonnet-4-6",
        }),
      );
    });
  });

  it("ignores events with a session id that matches no existing tab", () => {
    const updateTab = vi.fn();
    const updateTabMessages = vi.fn();
    const sessions = new Map<string, SessionState>([["tab-1", sessionState()]]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => null,
        updateTab,
        updateTabMessages,
      }),
    );

    eventHandler?.({ type: "message.delta", sid: "unknown-sid", payload: { text: "orphan" } });

    expect(updateTab).not.toHaveBeenCalled();
    expect(updateTabMessages).not.toHaveBeenCalled();
  });

  it("drops additive events that have no session id", () => {
    const updateTab = vi.fn();
    const updateTabMessages = vi.fn();
    const sessions = new Map<string, SessionState>([["tab-1", sessionState()]]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => null,
        updateTab,
        updateTabMessages,
      }),
    );

    // message.delta with no sid — additive, should be dropped
    eventHandler?.({ type: "message.delta", payload: { text: "orphan delta" } });

    expect(updateTab).not.toHaveBeenCalled();
    expect(updateTabMessages).not.toHaveBeenCalled();
  });

  it("routes events with matching session id to the correct tab even if it is not active", () => {
    const updateTab = vi.fn((_, patch) => {
      const current = sessions.get("tab-2");
      if (current) sessions.set("tab-2", { ...current, ...patch });
    });
    const sessions = new Map<string, SessionState>([
      ["tab-1", sessionState()],
      ["tab-2", sessionState()],
    ]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: (sid) => (sid === "sid-2" ? "tab-2" : null),
        updateTab,
        updateTabMessages: vi.fn(),
      }),
    );

    eventHandler?.({ type: "message.start", sid: "sid-2", payload: {} });

    expect(updateTab).toHaveBeenCalledWith("tab-2", expect.objectContaining({ isLoading: true }));
  });

  it("adopts runtime session id on message.start only once per tab", () => {
    const updateTab = vi.fn();
    const freshState: SessionState = {
      ...sessionState(),
      hermesSessionId: "",
      dbSessionId: "",
    };
    const sessions = new Map<string, SessionState>([["tab-1", freshState]]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => null,
        updateTab,
        updateTabMessages: vi.fn(),
      }),
    );

    // First message.start — should bind to active tab since tab has no session id yet
    eventHandler?.({ type: "message.start", sid: "sid-new", payload: {} });
    expect(updateTab).toHaveBeenCalledWith("tab-1", expect.objectContaining({ hermesSessionId: "sid-new" }));
  });

  it("clears streaming refs on terminal error events", async () => {
    const updateTabMessages = vi.fn();
    const updateTab = vi.fn((_, patch) => {
      const current = sessions.get("tab-1");
      if (current) sessions.set("tab-1", { ...current, ...patch });
    });
    const sessions = new Map<string, SessionState>([
      ["tab-1", { ...sessionState(), streamingText: "partial" }],
    ]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => "tab-1",
        updateTab,
        updateTabMessages,
      }),
    );

    eventHandler?.({ type: "error", sid: "sid-1", payload: { message: "timeout" } });

    await waitFor(() => {
      expect(updateTab).toHaveBeenCalledWith(
        "tab-1",
        expect.objectContaining({
          isLoading: false,
          toolProgress: null,
        }),
      );
    });
  });

  it("clears pending interaction state on error", async () => {
    const updateTabMessages = vi.fn();
    const updateTab = vi.fn((_, patch) => {
      const current = sessions.get("tab-1");
      if (current) sessions.set("tab-1", { ...current, ...patch });
    });
    const sessions = new Map<string, SessionState>([
      [
        "tab-1",
        {
          ...sessionState(),
          pendingApproval: {
            command: "rm -rf /",
            description: "dangerous",
            patternKey: "danger",
            patternKeys: ["danger"],
          },
          pendingClarify: { requestId: "c1", question: "which?", choices: [] },
        },
      ],
    ]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => "tab-1",
        updateTab,
        updateTabMessages,
      }),
    );

    eventHandler?.({ type: "error", sid: "sid-1", payload: { message: "fail" } });

    await waitFor(() => {
      expect(updateTab).toHaveBeenCalledWith(
        "tab-1",
        expect.objectContaining({
          pendingApproval: null,
          pendingClarify: null,
        }),
      );
    });
  });

  it("allows retry after error resets turn guard", async () => {
    const updateTabMessages = vi.fn();
    const updateTab = vi.fn((_, patch) => {
      const current = sessions.get("tab-1");
      if (current) sessions.set("tab-1", { ...current, ...patch });
    });
    const sessions = new Map<string, SessionState>([
      ["tab-1", { ...sessionState(), streamingText: "partial" }],
    ]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => "tab-1",
        updateTab,
        updateTabMessages,
      }),
    );

    // First complete — normal
    eventHandler?.({ type: "message.complete", sid: "sid-1", payload: {} });
    await waitFor(() => expect(updateTabMessages).toHaveBeenCalledTimes(1));

    // Error arrives — should reset turn guard
    eventHandler?.({ type: "error", sid: "sid-1", payload: { message: "fail" } });
    await waitFor(() =>
      expect(updateTab).toHaveBeenCalledWith(
        "tab-1",
        expect.objectContaining({ isLoading: false }),
      ),
    );

    // New start + complete should work (turn guard was reset by error)
    eventHandler?.({ type: "message.start", sid: "sid-1", payload: {} });
    eventHandler?.({
      type: "message.complete",
      sid: "sid-1",
      payload: { text: "retry answer" },
    });

    await waitFor(() => expect(updateTabMessages).toHaveBeenCalledTimes(3));
  });

  it("drops late additive events after abort", () => {
    const updateTab = vi.fn();
    const updateTabMessages = vi.fn();
    const sessions = new Map<string, SessionState>([
      ["tab-1", { ...sessionState(), abortRequested: true }],
    ]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => "tab-1",
        updateTab,
        updateTabMessages,
      }),
    );

    // Late streaming event after abort — should be dropped
    eventHandler?.({ type: "message.delta", sid: "sid-1", payload: { text: "late" } });
    eventHandler?.({ type: "tool.start", sid: "sid-1", payload: { tool_id: "t1", name: "Read" } });

    expect(updateTab).not.toHaveBeenCalled();
    expect(updateTabMessages).not.toHaveBeenCalled();
  });

  it("resets abort on message.complete and clears pending state", async () => {
    const updateTab = vi.fn((_, patch) => {
      const current = sessions.get("tab-1");
      if (current) sessions.set("tab-1", { ...current, ...patch });
    });
    const sessions = new Map<string, SessionState>([
      ["tab-1", { ...sessionState(), abortRequested: true }],
    ]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => "tab-1",
        updateTab,
        updateTabMessages: vi.fn(),
      }),
    );

    eventHandler?.({ type: "message.complete", sid: "sid-1", payload: {} });

    await waitFor(() => {
      expect(updateTab).toHaveBeenCalledWith(
        "tab-1",
        expect.objectContaining({ abortRequested: false, isLoading: false }),
      );
    });
  });

  it("clears all pending interaction state on error", async () => {
    const updateTab = vi.fn((_, patch) => {
      const current = sessions.get("tab-1");
      if (current) sessions.set("tab-1", { ...current, ...patch });
    });
    const sessions = new Map<string, SessionState>([
      [
        "tab-1",
        {
          ...sessionState(),
          pendingApproval: { command: "rm", description: "delete", patternKey: "", patternKeys: [] },
          pendingClarify: { requestId: "c1", question: "Which?", choices: [] },
          pendingSudo: { requestId: "s1" },
          pendingSecret: { requestId: "sk1", envVar: "KEY", prompt: "" },
        },
      ],
    ]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => "tab-1",
        updateTab,
        updateTabMessages: vi.fn(),
      }),
    );

    eventHandler?.({ type: "error", sid: "sid-1", payload: { message: "boom" } });

    await waitFor(() => {
      expect(updateTab).toHaveBeenCalledWith(
        "tab-1",
        expect.objectContaining({
          pendingApproval: null,
          pendingClarify: null,
          pendingSudo: null,
          pendingSecret: null,
        }),
      );
    });
  });

  it("coalesces live assistant deltas within the same microtask", async () => {
    const updateTab = vi.fn((tabId: string, patch: Partial<SessionState>) => {
      const current = sessions.get(tabId);
      if (current) sessions.set(tabId, { ...current, ...patch });
    });
    const sessions = new Map<string, SessionState>([["tab-1", sessionState()]]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => "tab-1",
        updateTab,
        updateTabMessages: vi.fn(),
      }),
    );

    // Two deltas in the same synchronous tick — should be coalesced
    eventHandler?.({
      type: "message.delta",
      sid: "sid-1",
      payload: { text: "Hel" },
    });
    eventHandler?.({
      type: "message.delta",
      sid: "sid-1",
      payload: { text: "lo" },
    });

    // Before microtask fires, no streamingText update yet
    expect(
      updateTab.mock.calls.some(([, patch]) => "streamingText" in patch),
    ).toBe(false);

    // Let microtask drain
    await act(async () => {
      await Promise.resolve();
    });

    // After microtask fires, coalesced text should be flushed in one call
    expect(updateTab).toHaveBeenCalledWith(
      "tab-1",
      expect.objectContaining({
        streamingText: "Hello",
      }),
    );
  });

  it("unblocks input when active session probe reports the turn is no longer running", async () => {
    vi.useFakeTimers();
    vi.mocked(tuiSessionActiveList).mockResolvedValue({
      result: { sessions: [{ session_key: "sid-1", status: "idle" }] },
    });
    const updateTab = vi.fn((tabId: string, patch: Partial<SessionState>) => {
      const current = sessions.get(tabId);
      if (current) sessions.set(tabId, { ...current, ...patch });
    });
    const sessions = new Map<string, SessionState>([
      [
        "tab-1",
        {
          ...sessionState(),
          isLoading: true,
          toolProgress: null,
          streamingText: "Final text",
        },
      ],
    ]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => "tab-1",
        updateTab,
        updateTabMessages: vi.fn(),
      }),
    );

    eventHandler?.({
      type: "tool.complete",
      sid: "sid-1",
      payload: { tool_id: "tool-1", result_text: "done" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(tuiSessionActiveList).toHaveBeenCalledWith("sid-1");
    expect(updateTab).toHaveBeenCalledWith(
      "tab-1",
      expect.objectContaining({
        isLoading: false,
        toolProgress: null,
        streamingText: "",
        streamingReasoning: "",
      }),
    );
  });

  it("keeps waiting when active session probe reports a running turn without status text", async () => {
    vi.useFakeTimers();
    vi.mocked(tuiSessionActiveList).mockResolvedValue({
      sessions: [{ id: "sid-1", running: true }],
    });
    const updateTab = vi.fn((tabId: string, patch: Partial<SessionState>) => {
      const current = sessions.get(tabId);
      if (current) sessions.set(tabId, { ...current, ...patch });
    });
    const sessions = new Map<string, SessionState>([
      ["tab-1", { ...sessionState(), isLoading: true }],
    ]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => "tab-1",
        updateTab,
        updateTabMessages: vi.fn(),
      }),
    );

    eventHandler?.({
      type: "tool.complete",
      sid: "sid-1",
      payload: { tool_id: "tool-1", result_text: "done" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(updateTab).not.toHaveBeenCalledWith(
      "tab-1",
      expect.objectContaining({
        isLoading: false,
      }),
    );
  });

  it("unblocks input when active-list is inconclusive but session.status reports idle", async () => {
    vi.useFakeTimers();
    vi.mocked(tuiSessionActiveList).mockResolvedValue({ sessions: [] });
    vi.mocked(tuiSessionStatus).mockResolvedValue({
      output: "Hermes TUI Status\n\nAgent Running: No",
    });
    const updateTab = vi.fn((tabId: string, patch: Partial<SessionState>) => {
      const current = sessions.get(tabId);
      if (current) sessions.set(tabId, { ...current, ...patch });
    });
    const sessions = new Map<string, SessionState>([
      [
        "tab-1",
        {
          ...sessionState(),
          isLoading: true,
          toolProgress: "analyzing tool output…",
        },
      ],
    ]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => "tab-1",
        updateTab,
        updateTabMessages: vi.fn(),
      }),
    );

    eventHandler?.({
      type: "tool.complete",
      sid: "sid-1",
      payload: { tool_id: "tool-1", result_text: "done" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(tuiSessionStatus).toHaveBeenCalledWith("sid-1");
    expect(updateTab).toHaveBeenCalledWith(
      "tab-1",
      expect.objectContaining({
        isLoading: false,
        toolProgress: null,
      }),
    );
  });

  it("keeps waiting when active-list is inconclusive but session.status reports running", async () => {
    vi.useFakeTimers();
    vi.mocked(tuiSessionActiveList).mockResolvedValue({ sessions: [] });
    vi.mocked(tuiSessionStatus).mockResolvedValue({
      output: "Hermes TUI Status\n\nAgent Running: Yes",
    });
    const updateTab = vi.fn((tabId: string, patch: Partial<SessionState>) => {
      const current = sessions.get(tabId);
      if (current) sessions.set(tabId, { ...current, ...patch });
    });
    const sessions = new Map<string, SessionState>([
      [
        "tab-1",
        {
          ...sessionState(),
          isLoading: true,
          toolProgress: "analyzing tool output…",
        },
      ],
    ]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => "tab-1",
        updateTab,
        updateTabMessages: vi.fn(),
      }),
    );

    eventHandler?.({
      type: "tool.complete",
      sid: "sid-1",
      payload: { tool_id: "tool-1", result_text: "done" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(tuiSessionStatus).toHaveBeenCalledWith("sid-1");
    expect(updateTab).not.toHaveBeenCalledWith(
      "tab-1",
      expect.objectContaining({
        isLoading: false,
      }),
    );
  });

  it("auto-stops a loading turn after 15 seconds without any agent events", async () => {
    vi.useFakeTimers();
    const updateTab = vi.fn((tabId: string, patch: Partial<SessionState>) => {
      const current = sessions.get(tabId);
      if (current) sessions.set(tabId, { ...current, ...patch });
    });
    const sessions = new Map<string, SessionState>([
      [
        "tab-1",
        {
          ...sessionState(),
          isLoading: true,
          toolProgress: "analyzing tool output…",
        },
      ],
    ]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => "tab-1",
        updateTab,
        updateTabMessages: vi.fn(),
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(updateTab).toHaveBeenCalledWith(
      "tab-1",
      expect.objectContaining({
        isLoading: false,
        toolProgress: null,
      }),
    );
  });

  it("refreshes the silent auto-stop timer when agent events keep arriving", async () => {
    vi.useFakeTimers();
    vi.mocked(tuiSessionActiveList).mockResolvedValue({
      sessions: [{ id: "sid-1", status: "working" }],
    });
    const updateTab = vi.fn((tabId: string, patch: Partial<SessionState>) => {
      const current = sessions.get(tabId);
      if (current) sessions.set(tabId, { ...current, ...patch });
    });
    const sessions = new Map<string, SessionState>([
      [
        "tab-1",
        {
          ...sessionState(),
          isLoading: true,
          toolProgress: "analyzing tool output…",
        },
      ],
    ]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => "tab-1",
        updateTab,
        updateTabMessages: vi.fn(),
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    eventHandler?.({
      type: "status.update",
      sid: "sid-1",
      payload: { kind: "process", text: "still working" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });

    expect(updateTab).not.toHaveBeenCalledWith(
      "tab-1",
      expect.objectContaining({
        isLoading: false,
      }),
    );
  });

  it("hard-stops analyzing tool output after 15 seconds even if status probes continue", async () => {
    vi.useFakeTimers();
    vi.mocked(tuiSessionActiveList).mockResolvedValue({
      sessions: [{ id: "sid-1", status: "working" }],
    });
    const updateTab = vi.fn((tabId: string, patch: Partial<SessionState>) => {
      const current = sessions.get(tabId);
      if (current) sessions.set(tabId, { ...current, ...patch });
    });
    const sessions = new Map<string, SessionState>([
      [
        "tab-1",
        {
          ...sessionState(),
          isLoading: true,
          toolProgress: "running tool",
        },
      ],
    ]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => "tab-1",
        updateTab,
        updateTabMessages: vi.fn(),
      }),
    );

    eventHandler?.({
      type: "tool.complete",
      sid: "sid-1",
      payload: { tool_id: "tool-1", result_text: "done" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(updateTab).toHaveBeenCalledWith(
      "tab-1",
      expect.objectContaining({
        isLoading: false,
        toolProgress: null,
      }),
    );
  });

  it("hard-stops an existing analyzing state even when no new gateway event arrives", async () => {
    vi.useFakeTimers();
    const updateTab = vi.fn((tabId: string, patch: Partial<SessionState>) => {
      const current = sessions.get(tabId);
      if (current) sessions.set(tabId, { ...current, ...patch });
    });
    const sessions = new Map<string, SessionState>([
      [
        "tab-1",
        {
          ...sessionState(),
          isLoading: false,
          toolProgress: "analyzing tool output…",
          pendingApproval: { command: "rm", description: "delete", patternKey: "", patternKeys: [] },
          pendingClarify: { requestId: "c1", question: "Which?", choices: [] },
          pendingSudo: { requestId: "s1" },
          pendingSecret: { requestId: "sk1", envVar: "KEY", prompt: "" },
        },
      ],
    ]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => "tab-1",
        updateTab,
        updateTabMessages: vi.fn(),
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(updateTab).toHaveBeenCalledWith(
      "tab-1",
      expect.objectContaining({
        isLoading: false,
        toolProgress: null,
        pendingApproval: null,
        pendingClarify: null,
        pendingSudo: null,
        pendingSecret: null,
      }),
    );
  });

  it("commits visible streaming text when hard-stopping without message.complete", async () => {
    vi.useFakeTimers();
    vi.mocked(tuiSessionActiveList).mockResolvedValue({
      sessions: [{ id: "sid-1", status: "working" }],
    });
    const updateTabMessages = vi.fn();
    const updateTab = vi.fn((tabId: string, patch: Partial<SessionState>) => {
      const current = sessions.get(tabId);
      if (current) sessions.set(tabId, { ...current, ...patch });
    });
    const sessions = new Map<string, SessionState>([
      [
        "tab-1",
        {
          ...sessionState(),
          isLoading: true,
          toolProgress: "analyzing tool output…",
          streamingText: "partial final answer",
          streamingReasoning: "partial reasoning",
        },
      ],
    ]);

    renderHook(() =>
      useChatInbox({
        sessions,
        activeTabId: "tab-1",
        chatVisible: true,
        findTabBySessionId: () => "tab-1",
        updateTab,
        updateTabMessages,
      }),
    );

    eventHandler?.({
      type: "tool.complete",
      sid: "sid-1",
      payload: { tool_id: "tool-1", result_text: "done" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    const finalizerCall = updateTabMessages.mock.calls.find(([, updater]) => {
      const next = updater([]);
      return next.some(
        (msg: any) => msg.role === "agent" && msg.content === "partial final answer",
      );
    });
    expect(finalizerCall).toBeTruthy();
  });
});
