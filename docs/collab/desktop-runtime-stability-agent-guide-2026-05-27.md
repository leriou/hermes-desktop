# Desktop Runtime Stability Agent Guide

Date: 2026-05-27

This is the third independent implementation guide. It owns the desktop runtime and background stability layer: Tauri command boundaries, gateway process lifecycle, health visibility, logs, timeouts, cleanup, and long-running task isolation. It must not change chat UI rendering or the renderer event-state machine.

## Goal

Make Hermes Desktop resilient as a personal desktop app. The app should recover from gateway crashes, expose enough health information to diagnose failures, avoid blocking the UI on long-running commands, and clean up background resources on stop or exit.

This is not an enterprise observability project. Do not add a monitoring platform, remote telemetry, broad security scaffolding, or Marvis-style multi-service complexity. Copy only the practical lesson: the UI should depend on small, well-defined runtime capabilities that are health-checked, restartable, and easy to inspect.

## Ownership Boundary

Allowed files:

- `src-tauri/src/tui_gateway.rs`
- `src-tauri/src/commands/tui.rs`
- `src-tauri/src/commands/system.rs`
- `src-tauri/src/commands/chat.rs`
- `src-tauri/src/commands/data.rs`
- `src-tauri/src/commands/mod.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/python.rs`
- `src-tauri/src/session_utils.rs`
- `src-tauri/src/config_utils.rs`
- `src-tauri/src/cron_utils.rs`
- `src/renderer/src/lib/hermes-tauri.ts`, only for typed command wrappers and runtime health calls.
- Focused Rust tests near changed Rust modules.

Forbidden files:

- `src/renderer/src/screens/Chat/MessageList.tsx`
- `src/renderer/src/screens/Chat/ChatInput.tsx`
- `src/renderer/src/screens/Chat/hooks/useChatScroll.ts`
- `src/renderer/src/screens/Chat/hooks/useChatInbox.ts`
- `src/renderer/src/screens/Chat/hooks/useChatActions.ts`
- `src/renderer/src/screens/Chat/tauriChatGatewayClient.ts`
- `src/renderer/src/screens/Chat/renderTranscript.ts`
- `src/renderer/src/components/AgentMarkdown.tsx`
- `src/renderer/src/components/StreamingMarkdown.tsx`
- `src/renderer/src/assets/main.css`
- Voice capture/transcription files unless the work is only adding generic runtime health wiring that does not change voice behavior.

If a runtime fix requires changing message semantics, hand it to the event-state workstream. If it requires changing layout or scroll behavior, hand it to the chat UI workstream.

## Current Shape

Relevant current facts:

- `AppState` stores `gateway: TokioMutex<Option<Arc<TuiGateway>>>`, `ssh_tunnel`, and `voice`.
- `TuiGateway` starts a Python `tui_gateway.entry` process, reads stdout/stderr, waits up to 10 seconds for `gateway.ready`, forwards JSON-RPC notifications as `tui-event`, and reconnects unexpected exits with exponential backoff.
- `TuiGateway` tracks `stop_tx`, `restart_count`, `max_restarts`, `is_stopping`, and `active_session_id`.
- `handle_exit` emits `gateway.connection_lost` and `gateway.reconnecting`, restarts, and attempts `session.resume` after reconnect.
- `call()` sends JSON-RPC over stdin and waits for a oneshot response, but the runtime contract around timeout, cancellation, pending request cleanup, and failure classification should be tightened.
- `commands/tui.rs` exposes thin session RPC wrappers.
- `commands/system.rs`, `commands/data.rs`, and helpers run several filesystem, install, doctor, model, config, and external command operations.
- Existing Rust-side tests are sparse, so this workstream should add focused pure-logic coverage instead of relying only on manual app runs.

## Implementation Plan

1. Add a runtime health snapshot.

Expose a small health command, for example `runtime_health` or a richer `gateway_status`, that returns structured state:

- gateway configured/running
- start phase: stopped, starting, ready, reconnecting, failed
- restart count and max restarts
- active runtime session id if known
- last error summary
- last ready timestamp if known
- pending JSON-RPC request count
- basic path facts: python path exists, Hermes repo path exists, Hermes home path

Keep it local and diagnostic. Do not add remote telemetry.

Acceptance:

- Renderer can call one typed wrapper in `hermes-tauri.ts`.
- Health command does not start the gateway as a side effect.
- Errors are returned as structured fields where practical, not only strings.

2. Harden gateway lifecycle state.

Make gateway lifecycle transitions explicit in `TuiGateway`. The code should distinguish intentional stop, startup timeout, unexpected exit, reconnecting, reconnect failed, and max restarts reached.

Acceptance:

- `start_gateway` is idempotent when the gateway is already running.
- `stop_gateway` clears stop state and does not trigger reconnect.
- Startup timeout cleans up the child and pending ready listener.
- Max restart failure emits one clear terminal state.
- Reconnect success resets restart count and resumes the active session only when an active session exists.

3. Add JSON-RPC timeout and pending cleanup.

Wrap `TuiGateway::call()` in a bounded timeout. On timeout or closed stdin/stdout, remove the pending request and return a classified error.

Acceptance:

- A hung gateway call cannot wait forever.
- Pending request count returns to zero after timeout.
- Errors distinguish timeout, process-not-running, channel-closed, and gateway-error response.
- No request id reuse bugs are introduced.

4. Normalize logs for local diagnosis.

Replace scattered opaque `eprintln!` patterns with a small local logging helper or consistent prefix format. Keep logs local. Include enough context:

- component: gateway, command, python-path, data-command
- action: start, ready, stop, reconnect, rpc-call, rpc-timeout
- session id when safe and relevant
- concise error message

Acceptance:

- Existing useful messages remain visible.
- Repeated reconnect logs are not spammy.
- No secrets, tokens, prompt text, file contents, or passwords are logged.

5. Keep long-running commands off the UI path.

Audit Tauri commands that run external processes or heavy filesystem work. Ensure they are async, bounded, and emit progress when they can run long. Do not change renderer UI; expose only command-side state or events.

Acceptance:

- Doctor/update/install/data/model commands do not block the Tauri main thread.
- External command stdout/stderr is capped or summarized before being returned.
- Commands with user-visible duration have progress or status events.

6. Add shutdown cleanup.

Ensure app exit and explicit stop clean up gateway process state, pending request channels, and temporary runtime resources that this workstream owns.

Acceptance:

- `stop_gateway` terminates the child and prevents auto-restart.
- Pending RPC callers receive a deterministic error on stop.
- Repeated start/stop does not leak tasks or leave stale health state.

7. Add focused tests.

Do not try to spawn the real Python gateway in every unit test. Extract small pure helpers where needed.

Required coverage:

- lifecycle transition helper: starting -> ready, starting -> timeout, ready -> reconnecting, reconnecting -> ready, reconnecting -> failed
- restart backoff/max restart decision
- pending RPC cleanup on timeout/closed channel
- health snapshot formatting/classification
- path facts for missing python/repo/home can be tested without mutating user state

## Verification

Run at minimum:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
npm run typecheck
```

If wrappers in `hermes-tauri.ts` change, run focused renderer tests that import those wrappers if available. If no wrapper tests exist, add a small one only when the project test setup already supports it.

Manual check:

- Start the app and call the gateway start path.
- Confirm health reports `starting` then `ready`.
- Kill or crash the gateway child manually, then confirm reconnecting state appears and either recovers or reports max restart failure clearly.
- Stop the gateway intentionally and confirm it does not reconnect.
- Run a doctor/update-like long command and confirm the app remains responsive.
- Quit the app and confirm no owned gateway child remains.

## Non-Goals

- Do not redesign chat message/event semantics.
- Do not change chat rendering, scroll behavior, markdown, or input UX.
- Do not change voice feature behavior.
- Do not add remote telemetry or crash reporting.
- Do not add a broad plugin/service architecture.
- Do not rewrite the gateway protocol.
- Do not change packaging or signing unless a runtime health check needs read-only metadata.

## Handoff Notes For Other Agents

This workstream can run in parallel with chat UI work and event-state work if it respects the forbidden files above.

Potential conflict points:

- `src-tauri/src/tui_gateway.rs` is shared with the event-state guide. This guide owns lifecycle, health, RPC timeout, logs, and cleanup. The event-state guide owns event metadata and session semantics.
- `src/renderer/src/lib/hermes-tauri.ts` is a bridge file. Keep changes limited to typed wrappers for runtime health or gateway lifecycle commands.
- `commands/tui.rs` should remain thin. Do not move chat state-machine logic into Tauri commands.

The desired endpoint is a runtime that is easy to trust and diagnose, not a larger architecture.
