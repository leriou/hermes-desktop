# Chat Event And Session State Stability Agent Guide

Date: 2026-05-27

This is the second independent implementation guide. It owns the chat event flow and session state contract between the Tauri gateway and the renderer. It must not redesign the chat UI, change CSS, or introduce background service architecture. The goal is to make the data entering the chat page reliable, ordered, idempotent, and recoverable.

## Goal

Make chat state trustworthy under real agent behavior: streaming deltas, final completions, reasoning, tool calls, approval/clarify/secret prompts, session resume, busy input, interrupts, and gateway reconnects.

The user-visible result should be boring in the best way: no duplicated assistant output, no lost final message, no stale streaming text after completion, no events landing in the wrong tab, no queued input sent to the wrong runtime session, and no confusing state after interrupt or reconnect.

## Ownership Boundary

Allowed files:

- `src/renderer/src/screens/Chat/hooks/useChatInbox.ts`
- `src/renderer/src/screens/Chat/hooks/useChatActions.ts`
- `src/renderer/src/screens/Chat/hooks/useSessionLifecycle.ts`
- `src/renderer/src/screens/Chat/tauriChatGatewayClient.ts`
- `src/renderer/src/screens/Chat/tuiEvents.ts`
- `src/renderer/src/screens/Chat/renderTranscript.ts`
- `src/renderer/src/screens/Chat/types.ts`
- `src/renderer/src/screens/Chat/busyInput.ts`
- `src/renderer/src/screens/Chat/sessionDisplay.ts`
- Focused tests for the files above.
- `src-tauri/src/tui_gateway.rs`, only for event forwarding metadata and reconnect/session event semantics.
- `src-tauri/src/commands/tui.rs`, only for thin session RPC wrappers.

Forbidden files:

- `src/renderer/src/screens/Chat/MessageList.tsx`
- `src/renderer/src/screens/Chat/MessageRow.tsx`
- `src/renderer/src/screens/Chat/HistoryRow.tsx`
- `src/renderer/src/screens/Chat/ChatInput.tsx`
- `src/renderer/src/components/AgentMarkdown.tsx`
- `src/renderer/src/components/StreamingMarkdown.tsx`
- `src/renderer/src/assets/main.css`
- Tauri process lifecycle, sidecar startup, logging infrastructure, voice input, model discovery, settings, and packaging files.

If an event-flow fix seems to require UI changes, document the missing UI hook and hand it to the chat UI workstream instead.

## Current Shape

Relevant current facts:

- `useChatInbox.ts` listens to `tui-event`, normalizes events, maps them to tabs, accumulates streaming chunks in refs, schedules flushes, commits streaming text, handles tool/reasoning/status events, and rewrites transcript messages.
- `message.complete` is treated as the authoritative final boundary, but code must still preserve unflushed delta chunks when the final payload is incomplete.
- `tauriChatGatewayClient.ts` starts the gateway, creates/resumes sessions, retries submit when a runtime session is invalid, and exposes command/approval/clarify/secret helpers.
- `useChatActions.ts` routes normal input, busy input, quick ask, queue, steer, interrupt, and local command execution.
- `renderTranscript.ts` groups tool calls, filters empty bubbles, merges continuation labels, and creates renderable transcript items.
- `src-tauri/src/tui_gateway.rs` forwards gateway events such as `message.complete`, `tool.start`, `tool.complete`, connection lost, and reconnecting.

The main risk is ambiguous ownership of truth: streaming refs, React state, final event payloads, runtime session ids, db session ids, and active tab routing can disagree.

## Implementation Plan

1. Define the event contract in code.

Create or tighten a small typed event contract around `NormalizedTuiEvent`. Each event handler should clearly answer:

- Which session/tab does this event belong to?
- Is it additive, replacing, terminal, or status-only?
- Is it safe to process after abort?
- What fields are authoritative if both streaming state and payload text exist?

Do not make a large framework. A small table, helper functions, or typed discriminated union is enough if it reduces ambiguity.

Acceptance:

- Unknown events are ignored or converted to safe system events without corrupting session state.
- Events without session id only target the active tab when that is explicitly safe.
- Runtime session id adoption is deliberate and tested.

2. Make streaming completion idempotent.

Harden the `message.delta` -> flush -> `message.complete` path. Completion should be safe if:

- A complete event arrives immediately after a delta before the scheduled flush.
- A duplicate complete event arrives.
- A complete event lacks text but deltas exist.
- A complete event has authoritative text that differs from accumulated fallback text.
- Reasoning and content finish in different payload fields.

Acceptance:

- Assistant content is appended exactly once per completed turn.
- Streaming refs are cleared after terminal events.
- Duplicate terminal events do not append duplicate bubbles.
- Usage/model metadata survives completion when present.

3. Stabilize tab and session routing.

Audit `tabForEvent`, `findTabBySessionId`, `hermesSessionId`, `runtimeSessionId`, `dbSessionId`, and resume paths. Avoid silently binding unrelated events to the active tab when the event has a session id that belongs elsewhere or no longer exists.

Acceptance:

- Events for existing sessions land in the correct tab.
- New runtime session ids are attached to the intended tab only once.
- Reconnect/resume does not cause future deltas to land in a stale tab.
- Closed or missing tabs do not receive hidden state mutations.

4. Make busy input behavior explicit.

Keep the existing user-facing modes: queue, steer, interrupt, quick ask, and local slash commands. Clarify their state transitions in tests.

Acceptance:

- `/queue` text is sent after current loading ends and preserves attachments.
- Steer uses the current runtime session and does not create a new chat turn.
- Interrupt stops accepting late streaming/tool events for the aborted turn.
- Quick ask does not mutate unrelated queued input.
- Error paths create visible system events without losing the user input.

5. Normalize interaction requests.

Approval, clarify, sudo, and secret request handling should be consistent:

- Normalize payloads in `tuiEvents.ts`.
- Store one pending request per type when appropriate.
- Include request id and session id.
- Clear pending state on response, terminal error, or session change.

Acceptance:

- Request payload parsing is covered by tests.
- Responses go to the correct runtime session.
- Stale request prompts do not remain after interrupt or session switch.

6. Keep transcript rewriting pure.

`renderTranscript.ts` should stay deterministic and side-effect free. If event handling needs metadata, add it to message objects before calling rewrite functions rather than adding hidden behavior in rendering.

Acceptance:

- `buildRenderableTranscript` remains pure.
- Tool grouping and continuation labels are stable for history and live messages.
- Tests cover out-of-order tool completion and empty bubble filtering.

## Verification

Run at minimum:

```bash
npm run test -- src/renderer/src/screens/Chat/hooks/useChatInbox.test.tsx src/renderer/src/screens/Chat/tauriChatGatewayClient.test.ts src/renderer/src/screens/Chat/tuiEvents.test.ts src/renderer/src/screens/Chat/renderTranscript.test.ts src/renderer/src/screens/Chat/busyInput.test.ts src/renderer/src/screens/Chat/hooks/useChatActions.test.tsx
npm run typecheck
```

If `src-tauri` files are changed, also run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Manual check:

- Start a long streaming turn, then trigger tool calls and reasoning.
- Send busy input in steer mode.
- Queue one message while loading, let the current turn finish, and confirm it sends once.
- Interrupt during streaming and confirm late deltas/tool events do not append stale content.
- Resume or recreate a session after an invalid runtime session and confirm the next submit lands in the intended chat.

## Non-Goals

- Do not change visual layout, markdown rendering, scroll behavior, or input component UI.
- Do not change voice recording or transcription.
- Do not introduce service supervision, health checks, or sidecar architecture.
- Do not redesign the gateway protocol.
- Do not replace the existing hook structure unless a smaller helper extraction cannot make the state contract clear.

## Handoff Notes For Other Agents

This workstream can run in parallel with the chat UI smoothness work if it avoids UI files. It can also run before the runtime/background stability work.

Potential conflict points:

- `useChatActions.ts` touches user input routing but should not change `ChatInput.tsx`.
- `useChatInbox.ts` changes message timing and shape; UI work should treat its output as an external contract.
- `src-tauri/src/tui_gateway.rs` may also be touched by the runtime workstream. This guide only permits event metadata and forwarding semantics, not process lifecycle changes.

The desired endpoint is a reliable chat state machine, not a new architecture.
