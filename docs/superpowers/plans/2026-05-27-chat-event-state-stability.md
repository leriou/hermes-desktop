# Chat Event & Session State Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chat state trustworthy under real agent behavior — no duplicated output, no lost messages, no stale streaming, no events in wrong tabs, no confusing state after interrupt or reconnect.

**Architecture:** Tighten the event-to-state pipeline with typed event classification, idempotent completion, strict session routing, explicit busy-input state machines, and normalized interaction requests. All changes stay inside the event/state layer; no UI components touched.

**Tech Stack:** TypeScript, React hooks, Vitest, Tauri IPC

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/renderer/src/screens/Chat/tuiEvents.ts` | Event normalization + typed classification | Modify |
| `src/renderer/src/screens/Chat/types.ts` | Shared type definitions | Modify |
| `src/renderer/src/screens/Chat/hooks/useChatInbox.ts` | Core event → state pipeline | Modify |
| `src/renderer/src/screens/Chat/hooks/useChatActions.ts` | User input routing | Modify |
| `src/renderer/src/screens/Chat/tauriChatGatewayClient.ts` | Gateway session RPC | Modify |
| `src/renderer/src/screens/Chat/busyInput.ts` | Busy input parsing | Modify |
| `src/renderer/src/screens/Chat/renderTranscript.ts` | Pure transcript transformation | Modify (tests only) |
| `src/renderer/src/screens/Chat/sessionDisplay.ts` | Display helpers | No change |
| `src-tauri/src/tui_gateway.rs` | Event forwarding metadata | Modify (minor) |
| `src/renderer/src/screens/Chat/tuiEvents.test.ts` | Tests for tuiEvents | Modify |
| `src/renderer/src/screens/Chat/hooks/useChatInbox.test.tsx` | Tests for inbox | Modify |
| `src/renderer/src/screens/Chat/hooks/useChatActions.test.tsx` | Tests for actions | Modify |
| `src/renderer/src/screens/Chat/busyInput.test.ts` | Tests for busy input | Modify |
| `src/renderer/src/screens/Chat/renderTranscript.test.ts` | Tests for transcript | Modify |

---

### Task 1: Define typed event contract in `tuiEvents.ts`

Classify every event type so handlers can answer: which session? additive/replacing/terminal? safe after abort? authoritative fields?

**Files:**
- Modify: `src/renderer/src/screens/Chat/tuiEvents.ts`
- Modify: `src/renderer/src/screens/Chat/tuiEvents.test.ts`

- [ ] **Step 1: Write the failing test for event classification**

Add to `src/renderer/src/screens/Chat/tuiEvents.test.ts`:

```ts
import { classifyEvent, EventCategory } from "./tuiEvents";

describe("classifyEvent", () => {
  it("classifies streaming events as additive", () => {
    expect(classifyEvent("message.delta")).toEqual({
      category: "additive",
      safeAfterAbort: false,
    });
    expect(classifyEvent("thinking.delta")).toEqual({
      category: "additive",
      safeAfterAbort: false,
    });
    expect(classifyEvent("reasoning.delta")).toEqual({
      category: "additive",
      safeAfterAbort: false,
    });
  });

  it("classifies terminal events", () => {
    expect(classifyEvent("message.complete")).toEqual({
      category: "terminal",
      safeAfterAbort: true,
    });
    expect(classifyEvent("error")).toEqual({
      category: "terminal",
      safeAfterAbort: true,
    });
  });

  it("classifies tool events as additive", () => {
    expect(classifyEvent("tool.start")).toEqual({
      category: "additive",
      safeAfterAbort: false,
    });
    expect(classifyEvent("tool.complete")).toEqual({
      category: "additive",
      safeAfterAbort: false,
    });
    expect(classifyEvent("tool.progress")).toEqual({
      category: "additive",
      safeAfterAbort: false,
    });
  });

  it("classifies status-only events", () => {
    expect(classifyEvent("message.start")).toEqual({
      category: "status",
      safeAfterAbort: true,
    });
    expect(classifyEvent("status.update")).toEqual({
      category: "status",
      safeAfterAbort: true,
    });
    expect(classifyEvent("tool.generating")).toEqual({
      category: "status",
      safeAfterAbort: true,
    });
  });

  it("classifies interaction request events as status", () => {
    expect(classifyEvent("approval.request")).toEqual({
      category: "status",
      safeAfterAbort: false,
    });
    expect(classifyEvent("clarify.request")).toEqual({
      category: "status",
      safeAfterAbort: false,
    });
    expect(classifyEvent("sudo.request")).toEqual({
      category: "status",
      safeAfterAbort: false,
    });
    expect(classifyEvent("secret.request")).toEqual({
      category: "status",
      safeAfterAbort: false,
    });
  });

  it("classifies unknown events as ignored", () => {
    expect(classifyEvent("some.random.event")).toEqual({
      category: "ignored",
      safeAfterAbort: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/renderer/src/screens/Chat/tuiEvents.test.ts --reporter verbose 2>&1 | tail -20`
Expected: FAIL — `classifyEvent` is not exported

- [ ] **Step 3: Implement event classification in tuiEvents.ts**

Add to `src/renderer/src/screens/Chat/tuiEvents.ts` after the existing `normalizeTuiEvent` function:

```ts
export type EventCategory = "additive" | "terminal" | "replacing" | "status" | "ignored";

export interface EventClassification {
  category: EventCategory;
  safeAfterAbort: boolean;
}

const EVENT_CLASSIFICATIONS: Record<string, EventClassification> = {
  "message.delta": { category: "additive", safeAfterAbort: false },
  "thinking.delta": { category: "additive", safeAfterAbort: false },
  "reasoning.delta": { category: "additive", safeAfterAbort: false },
  "message.complete": { category: "terminal", safeAfterAbort: true },
  "error": { category: "terminal", safeAfterAbort: true },
  "message.start": { category: "status", safeAfterAbort: true },
  "status.update": { category: "status", safeAfterAbort: true },
  "tool.generating": { category: "status", safeAfterAbort: true },
  "tool.start": { category: "additive", safeAfterAbort: false },
  "tool.complete": { category: "additive", safeAfterAbort: false },
  "tool.progress": { category: "additive", safeAfterAbort: false },
  "approval.request": { category: "status", safeAfterAbort: false },
  "clarify.request": { category: "status", safeAfterAbort: false },
  "sudo.request": { category: "status", safeAfterAbort: false },
  "secret.request": { category: "status", safeAfterAbort: false },
};

export function classifyEvent(type: string): EventClassification {
  return EVENT_CLASSIFICATIONS[type] ?? { category: "ignored", safeAfterAbort: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/renderer/src/screens/Chat/tuiEvents.test.ts --reporter verbose 2>&1 | tail -20`
Expected: All PASS

- [ ] **Step 5: Run full existing test suite to confirm no regressions**

Run: `npm run test -- src/renderer/src/screens/Chat/tuiEvents.test.ts src/renderer/src/screens/Chat/hooks/useChatInbox.test.tsx src/renderer/src/screens/Chat/renderTranscript.test.ts 2>&1 | tail -10`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/screens/Chat/tuiEvents.ts src/renderer/src/screens/Chat/tuiEvents.test.ts
git commit -m "feat(chat): add typed event classification contract"
```

---

### Task 2: Make streaming completion idempotent

Add a per-tab `turnCompleted` guard so duplicate `message.complete` events cannot append duplicate bubbles, and unflushed deltas are always preserved.

**Files:**
- Modify: `src/renderer/src/screens/Chat/hooks/useChatInbox.ts`
- Modify: `src/renderer/src/screens/Chat/hooks/useChatInbox.test.tsx`

- [ ] **Step 1: Write failing tests for idempotent completion**

Add to `src/renderer/src/screens/Chat/hooks/useChatInbox.test.tsx`:

```ts
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
    payload: { /* no text field */ },
  });

  await waitFor(() => {
    const updater = updateTabMessages.mock.calls[0][1] as (
      prev: unknown[],
    ) => unknown[];
    expect(updater([])).toMatchObject([{ role: "agent", content: "Accumulated text" }]);
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
    expect(updater([])).toMatchObject([{ role: "agent", content: "authoritative final text" }]);
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
      usage: { input: 100, output: 50, total: 150 },
      model: "claude-sonnet-4-6",
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/renderer/src/screens/Chat/hooks/useChatInbox.test.tsx --reporter verbose 2>&1 | tail -30`
Expected: Some tests fail (duplicate complete and metadata preservation)

- [ ] **Step 3: Add turnCompleted guard and idempotent completion to useChatInbox.ts**

In `src/renderer/src/screens/Chat/hooks/useChatInbox.ts`, inside `useChatInbox`:

Add a new ref after the existing refs:
```ts
const turnCompletedRef = useRef(new Map<string, boolean>());
```

In `tabForEvent`, when a new `message.start` arrives, reset the guard:
```ts
// Inside the message.start case or in tabForEvent when event.type === "message.start":
turnCompletedRef.current.delete(tabId);
```

In the `message.complete` case, add an early return guard and reset:

Find the existing `case "message.complete":` block. Wrap it with:
```ts
case "message.complete": {
  if (turnCompletedRef.current.get(tabId)) {
    // Duplicate terminal event — skip
    break;
  }
  turnCompletedRef.current.set(tabId, true);

  // ... existing message.complete logic stays here unchanged ...

  break;
}
```

In `message.start` case, add reset:
```ts
case "message.start": {
  turnCompletedRef.current.delete(tabId);
  // ... existing message.start logic ...
  break;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/renderer/src/screens/Chat/hooks/useChatInbox.test.tsx --reporter verbose 2>&1 | tail -30`
Expected: All PASS

- [ ] **Step 5: Run full test suite**

Run: `npm run test -- src/renderer/src/screens/Chat/ 2>&1 | tail -10`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/screens/Chat/hooks/useChatInbox.ts src/renderer/src/screens/Chat/hooks/useChatInbox.test.tsx
git commit -m "fix(chat): idempotent message.complete — no duplicate bubbles, preserve metadata"
```

---

### Task 3: Stabilize tab and session routing

Tighten `tabForEvent` so events without a session id never silently bind to an unrelated tab, and runtime session id adoption is deliberate.

**Files:**
- Modify: `src/renderer/src/screens/Chat/hooks/useChatInbox.ts`
- Modify: `src/renderer/src/screens/Chat/hooks/useChatInbox.test.tsx`

- [ ] **Step 1: Write failing tests for strict tab routing**

Add to `src/renderer/src/screens/Chat/hooks/useChatInbox.test.tsx`:

```ts
it("ignores events with a session id that matches no existing tab", () => {
  const updateTab = vi.fn();
  const updateTabMessages = vi.fn();
  const sessions = new Map<string, SessionState>([["tab-1", sessionState()]]);

  renderHook(() =>
    useChatInbox({
      sessions,
      activeTabId: "tab-1",
      chatVisible: true,
      findTabBySessionId: () => null, // no tab matches
      updateTab,
      updateTabMessages,
    }),
  );

  eventHandler?.({ type: "message.delta", sid: "unknown-sid", payload: { text: "orphan" } });

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
  const sessions = new Map<string, SessionState>([["tab-1", sessionState()]]);

  renderHook(() =>
    useChatInbox({
      sessions,
      activeTabId: "tab-1",
      chatVisible: true,
      findTabBySessionId: () => null, // first message.start — no prior mapping
      updateTab,
      updateTabMessages: vi.fn(),
    }),
  );

  // First message.start with no existing session — should bind to active tab
  eventHandler?.({ type: "message.start", sid: "sid-new", payload: {} });
  expect(updateTab).toHaveBeenCalledWith("tab-1", expect.objectContaining({ hermesSessionId: "sid-new" }));

  updateTab.mockClear();

  // Second event with the same sid should still route via the now-known session id
  eventHandler?.({ type: "message.delta", sid: "sid-new", payload: { text: "hi" } });
  // Should be routed to tab-1 via the hermesSessionId that was just set
  // (verify the delta was accepted, not dropped)
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/renderer/src/screens/Chat/hooks/useChatInbox.test.tsx --reporter verbose 2>&1 | tail -30`
Expected: Some tests fail (orphan event test likely fails)

- [ ] **Step 3: Harden `tabForEvent` in useChatInbox.ts**

Replace the `tabForEvent` function with stricter logic:

```ts
function tabForEvent(event: NormalizedTuiEvent): string | null {
  // 1. If the event carries a session id, try to find the matching tab.
  if (event.sessionId) {
    const matched = findTabBySessionId(event.sessionId);
    if (matched) return matched;
    // If the event is a live event type and active tab has no hermesSessionId yet,
    // adopt the session id into the active tab.
    if (
      LIVE_EVENT_TYPES.has(event.type) &&
      active &&
      !sessionsRef.current.get(active)?.hermesSessionId &&
      !sessionsRef.current.get(active)?.dbSessionId
    ) {
      updateTab(active, { hermesSessionId: event.sessionId });
      return active;
    }
    // Session id matches no tab — drop the event.
    return null;
  }

  // 2. Events without session id: only route to active tab for status-only or terminal events.
  // Additive events without a session id are ambiguous — drop them.
  const classification = classifyEvent(event.type);
  if (classification.category === "additive" && !classification.safeAfterAbort) {
    return null;
  }

  return active;
}
```

Make sure `classifyEvent` is imported from `../tuiEvents` at the top of the file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/renderer/src/screens/Chat/hooks/useChatInbox.test.tsx --reporter verbose 2>&1 | tail -30`
Expected: All PASS

- [ ] **Step 5: Run full test suite**

Run: `npm run test -- src/renderer/src/screens/Chat/ 2>&1 | tail -10`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/screens/Chat/hooks/useChatInbox.ts src/renderer/src/screens/Chat/hooks/useChatInbox.test.tsx src/renderer/src/screens/Chat/tuiEvents.ts
git commit -m "fix(chat): strict tab routing — orphan events dropped, session id adoption deliberate"
```

---

### Task 4: Make busy input behavior explicit

Test the state transitions for queue, steer, interrupt, and quick ask. Fix any bugs found.

**Files:**
- Modify: `src/renderer/src/screens/Chat/hooks/useChatActions.ts`
- Modify: `src/renderer/src/screens/Chat/hooks/useChatActions.test.tsx`
- Modify: `src/renderer/src/screens/Chat/busyInput.test.ts`

- [ ] **Step 1: Write failing tests for busy input state transitions**

Add to `src/renderer/src/screens/Chat/hooks/useChatActions.test.tsx`:

```ts
it("sends queued input after loading ends and preserves text", async () => {
  const args = baseArgs(true);
  const { result, rerender } = renderHook(
    ({ loading }) => useChatActions({ ...args, isLoading: loading }),
    { initialProps: { loading: true } },
  );

  // Queue text while loading
  await result.current.handleSend("/queue hello from queue");

  const { tuiSubmitPrompt } = await import("@renderer/lib/hermes-tauri");
  expect(tuiSubmitPrompt).not.toHaveBeenCalled();

  // Loading ends — queued text should auto-send
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

it("interrupt stops late streaming events", async () => {
  const args = baseArgs(true);
  args.streamingText = "partial response";
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
          tone: "error",
          title: expect.stringContaining("Error"),
        }),
      ]),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify which pass and which fail**

Run: `npm run test -- src/renderer/src/screens/Chat/hooks/useChatActions.test.tsx --reporter verbose 2>&1 | tail -30`
Expected: Some tests may already pass; note any failures

- [ ] **Step 3: Fix any busy input bugs found**

In `src/renderer/src/screens/Chat/hooks/useChatActions.ts`:

If the interrupt test fails, ensure `handleAbort` properly sets `abortRequested` and clears streaming state. The current implementation should already handle this, but verify that:

1. `abortRequestedRef.current = true` is set before the interrupt call
2. `setIsLoading(false)` is called
3. Streaming text is preserved in the interrupted message

If the steer test fails, verify that `tuiSteer` is called with the correct session id. Check that the `gatewayClientRef.current.steer()` path receives `hermesSessionIdRef.current`.

If the error-path test fails, ensure the catch block in the submit path creates a visible system error event and resets `isLoading`.

Make targeted fixes only — no refactoring.

- [ ] **Step 4: Run tests to verify all pass**

Run: `npm run test -- src/renderer/src/screens/Chat/hooks/useChatActions.test.tsx --reporter verbose 2>&1 | tail -30`
Expected: All PASS

- [ ] **Step 5: Add busyInput edge case tests**

Add to `src/renderer/src/screens/Chat/busyInput.test.ts`:

```ts
it("handles /q shorthand for queue", () => {
  const action = describeBusyInput("/q some text", "steer");
  expect(action.kind).toBe("queue");
  expect(action.text).toBe("some text");
});

it("handles /queue with no text", () => {
  const action = describeBusyInput("/queue", "steer");
  expect(action.kind).toBe("queue");
  expect(action.text).toBe("");
});

it("defaults to steer mode for non-queue input", () => {
  const action = describeBusyInput("some input", "steer");
  expect(action.kind).toBe("steer");
  expect(action.text).toBe("some input");
});

it("defaults to interrupt mode when configured", () => {
  const action = describeBusyInput("stop now", "interrupt");
  expect(action.kind).toBe("interrupt");
  expect(action.text).toBe("stop now");
});
```

- [ ] **Step 6: Run busyInput tests**

Run: `npm run test -- src/renderer/src/screens/Chat/busyInput.test.ts --reporter verbose 2>&1 | tail -15`
Expected: All PASS

- [ ] **Step 7: Run full test suite**

Run: `npm run test -- src/renderer/src/screens/Chat/ 2>&1 | tail -10`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/screens/Chat/hooks/useChatActions.ts src/renderer/src/screens/Chat/hooks/useChatActions.test.tsx src/renderer/src/screens/Chat/busyInput.test.ts
git commit -m "test(chat): explicit busy input state transitions — queue, steer, interrupt, error paths"
```

---

### Task 5: Normalize interaction requests

Ensure approval, clarify, sudo, and secret requests carry request id + session id, and pending state is cleared on terminal events.

**Files:**
- Modify: `src/renderer/src/screens/Chat/tuiEvents.ts`
- Modify: `src/renderer/src/screens/Chat/tuiEvents.test.ts`
- Modify: `src/renderer/src/screens/Chat/hooks/useChatInbox.ts`
- Modify: `src/renderer/src/screens/Chat/hooks/useChatInbox.test.tsx`

- [ ] **Step 1: Write failing tests for interaction request normalization**

Add to `src/renderer/src/screens/Chat/tuiEvents.test.ts`:

```ts
describe("normalizeSudoRequest", () => {
  it("extracts request_id from both snake_case and camelCase", () => {
    expect(
      normalizeSudoRequest({ request_id: "sudo-1" }),
    ).toEqual({ requestId: "sudo-1" });
    expect(
      normalizeSudoRequest({ requestId: "sudo-2" }),
    ).toEqual({ requestId: "sudo-2" });
  });

  it("produces empty string when no request id", () => {
    expect(normalizeSudoRequest({})).toEqual({ requestId: "" });
  });
});

it("normalizeApprovalRequest falls back to empty arrays for missing pattern keys", () => {
  expect(normalizeApprovalRequest({ command: "ls" })).toEqual({
    command: "ls",
    description: "",
    patternKey: "",
    patternKeys: [],
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/renderer/src/screens/Chat/tuiEvents.test.ts --reporter verbose 2>&1 | tail -20`
Expected: Any test failures show gaps in normalization

- [ ] **Step 3: Fix normalization functions if needed**

In `src/renderer/src/screens/Chat/tuiEvents.ts`, verify that `normalizeSudoRequest` handles both `request_id` and `requestId` keys. The current implementation should already do this — if not, fix it.

Verify `normalizeApprovalRequest` defaults to empty arrays for `patternKeys`. Current code:
```ts
patternKeys: asStringArray(payload.pattern_keys).length
  ? asStringArray(payload.pattern_keys)
  : asStringArray(payload.patternKeys),
```
This is correct — returns empty array when neither is present. Ensure `description` defaults to empty string:
```ts
description: asString(payload.description ?? payload.command_description ?? ""),
```

Make minimal fixes only.

- [ ] **Step 4: Write test for pending state clearing on terminal events**

Add to `src/renderer/src/screens/Chat/hooks/useChatInbox.test.tsx`:

```ts
it("clears streaming refs on terminal events", async () => {
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

  // Error terminal event should clear streaming state
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
```

- [ ] **Step 5: Run all interaction request tests**

Run: `npm run test -- src/renderer/src/screens/Chat/tuiEvents.test.ts src/renderer/src/screens/Chat/hooks/useChatInbox.test.tsx --reporter verbose 2>&1 | tail -20`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/screens/Chat/tuiEvents.ts src/renderer/src/screens/Chat/tuiEvents.test.ts src/renderer/src/screens/Chat/hooks/useChatInbox.ts src/renderer/src/screens/Chat/hooks/useChatInbox.test.tsx
git commit -m "fix(chat): normalize interaction requests — request id + session id, clear on terminal"
```

---

### Task 6: Verify transcript rewriting is pure

Ensure `buildRenderableTranscript` stays side-effect free. Add tests for out-of-order tool completion and edge cases.

**Files:**
- Modify: `src/renderer/src/screens/Chat/renderTranscript.test.ts`

- [ ] **Step 1: Write tests for out-of-order tool completion**

Add to `src/renderer/src/screens/Chat/renderTranscript.test.ts`:

```ts
it("handles out-of-order tool completion (complete arrives for a tool not yet started)", () => {
  const messages: ChatMessage[] = [
    { id: "u1", role: "user", content: "fix the bug" },
    {
      id: "tc1-complete",
      sessionId: "s1",
      kind: "tool_call",
      role: "agent",
      callId: "tool-1",
      name: "Read",
      args: "{}",
      result: "file contents",
      success: true,
      durationS: 0.5,
    },
  ];

  const result = buildRenderableTranscript({
    messages,
    isLoading: false,
    toolProgress: null,
  });

  // Should group the tool call even without a matching tool.start
  expect(result).toHaveLength(2);
  expect(result[0].id).toBe("u1");
  expect(result[1]).toMatchObject({
    kind: "tool_group",
    toolName: "Read",
    calls: [{ callId: "tool-1", result: "file contents" }],
  });
});

it("filters empty bubble after tool group", () => {
  const messages: ChatMessage[] = [
    { id: "u1", role: "user", content: "read file" },
    {
      id: "tc1",
      kind: "tool_call",
      role: "agent",
      callId: "t1",
      name: "Read",
      args: "{}",
      result: "contents",
    },
    { id: "a1", role: "agent", content: "" },
  ];

  const result = buildRenderableTranscript({
    messages,
    isLoading: false,
    toolProgress: null,
  });

  // Empty assistant bubble after tool group should be filtered
  expect(result).toHaveLength(2);
  expect(result[0].id).toBe("u1");
  expect(result[1].kind).toBe("tool_group");
});

it("produces stable output for identical input (pure check)", () => {
  const messages: ChatMessage[] = [
    { id: "u1", role: "user", content: "hello" },
    {
      id: "tc1",
      kind: "tool_call",
      role: "agent",
      callId: "t1",
      name: "Bash",
      args: '{"command":"ls"}',
      result: "file1\nfile2",
      durationS: 1.2,
    },
    { id: "a1", role: "agent", content: "Here are the files." },
  ];

  const args = {
    messages,
    isLoading: false,
    toolProgress: null,
    streamingText: "",
    streamingReasoning: "",
  };

  const result1 = buildRenderableTranscript(args);
  const result2 = buildRenderableTranscript(args);

  expect(result1).toEqual(result2);
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm run test -- src/renderer/src/screens/Chat/renderTranscript.test.ts --reporter verbose 2>&1 | tail -20`
Expected: All PASS (the function is already pure; these tests confirm it)

- [ ] **Step 3: Run full test suite and typecheck**

Run: `npm run test -- src/renderer/src/screens/Chat/ 2>&1 | tail -10 && npm run typecheck 2>&1 | tail -5`
Expected: All PASS, no type errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/screens/Chat/renderTranscript.test.ts
git commit -m "test(chat): verify transcript rewriting purity — out-of-order tools, empty bubble filter"
```

---

## Verification

After all tasks are complete, run:

```bash
npm run test -- src/renderer/src/screens/Chat/hooks/useChatInbox.test.tsx src/renderer/src/screens/Chat/tauriChatGatewayClient.test.ts src/renderer/src/screens/Chat/tuiEvents.test.ts src/renderer/src/screens/Chat/renderTranscript.test.ts src/renderer/src/screens/Chat/busyInput.test.ts src/renderer/src/screens/Chat/hooks/useChatActions.test.tsx
npm run typecheck
```

If `src-tauri` files were changed:
```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

## Manual Check

- Start a long streaming turn, then trigger tool calls and reasoning.
- Send busy input in steer mode.
- Queue one message while loading, let the current turn finish, confirm it sends once.
- Interrupt during streaming and confirm late deltas/tool events do not append stale content.
- Resume or recreate a session after an invalid runtime session and confirm the next submit lands in the intended chat.
