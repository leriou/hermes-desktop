# Chat UI Smoothness Agent Guide

Date: 2026-05-27

This is one of three independent implementation guides. This guide is only for the renderer chat surface: message rendering, scroll behavior, streaming markdown, input ergonomics, and local visual polish. Do not change gateway protocol, Tauri commands, voice capture, session persistence, or background services in this workstream.

## Goal

Make the chat page feel calm under streaming load. The user should be able to read, scroll, select text, type, attach files, and interrupt or send follow-up input while the agent is producing output, without shaking, focus jumps, unnecessary re-layout, or visual noise.

The Marvis lesson to copy is not its enterprise service stack. The useful lesson is that the UI shell should stay thin, predictable, and protected from heavy work. In Hermes, this means the chat renderer should own only presentation and lightweight interaction state.

## Ownership Boundary

Allowed files:

- `src/renderer/src/screens/Chat/Chat.tsx`
- `src/renderer/src/screens/Chat/MessageList.tsx`
- `src/renderer/src/screens/Chat/MessageRow.tsx`
- `src/renderer/src/screens/Chat/HistoryRow.tsx`
- `src/renderer/src/screens/Chat/ChatInput.tsx`
- `src/renderer/src/screens/Chat/MessageTimelineNavigator.tsx`
- `src/renderer/src/screens/Chat/hooks/useChatScroll.ts`
- `src/renderer/src/screens/Chat/scrollState.ts`
- `src/renderer/src/components/AgentMarkdown.tsx`
- `src/renderer/src/components/StreamingMarkdown.tsx`
- `src/renderer/src/assets/main.css`
- Focused tests under `src/renderer/src/screens/Chat/**` and `src/renderer/src/components/**`.

Forbidden files:

- `src-tauri/**`
- `src/renderer/src/screens/Chat/tauriChatGatewayClient.ts`
- `src/renderer/src/screens/Chat/hooks/useChatInbox.ts`
- `src/renderer/src/screens/Chat/hooks/useSessionLifecycle.ts`
- Voice input files and i18n voice strings.

If the fix appears to require a forbidden file, stop and write the finding down for the event-flow workstream instead of widening scope.

## Current Shape

Relevant current facts:

- `MessageList.tsx` uses `react-virtuoso` and also renders live rows for streaming content, typing, tool progress, system events, and transcript rows.
- `useChatScroll.ts` still has manual auto-scroll logic with `requestAnimationFrame`, direct `scrollTop = scrollHeight`, and `scrollIntoView`.
- `MessageList.tsx` also passes `followOutput={(isAtBottom) => (isAtBottom ? "smooth" : false)}` to Virtuoso.
- `StreamingMarkdown.tsx` uses a lightweight renderer and `dangerouslySetInnerHTML` for streaming content.
- `AgentMarkdown.tsx` uses full `react-markdown`, GFM, Prism highlighting, copy buttons, and external link handling for completed content.
- `ChatInput.tsx` owns textarea autosize, slash menu, attachment chips, voice button display, quick ask, stop/send buttons, paste handling, and input history.

The key risk is competing layout controllers: Virtuoso, manual rAF auto-scroll, textarea autosize, streaming markdown growth, and live progress rows can all change height while the user is scrolling.

## Implementation Plan

1. Establish one scroll authority.

Prefer Virtuoso as the scroll owner inside `MessageList.tsx`. Keep `useChatScroll.ts` only as a small intent layer if still needed by `Chat.tsx`, but remove or gate any continuous rAF bottom-chasing while the user is actively scrolling. There should be no unconditional per-frame `scrollTop = scrollHeight` loop during streaming.

Acceptance:

- When the user scrolls away from bottom during streaming, the list remains stable.
- New tokens do not pull the viewport unless the user is already near bottom.
- Sending a user message intentionally returns to bottom.
- A visible "jump to latest" affordance is shown only when useful, not constantly.

2. Make streaming rows cheap and stable.

Keep streaming content in `StreamingMarkdown` until completion. Avoid running full `react-markdown` and Prism on every token. Memoize row components by stable message id and avoid passing freshly allocated props where possible. Keep live tool/progress rows visually compact and stable in height.

Acceptance:

- Streaming long markdown does not freeze typing or scrolling.
- Completed messages can upgrade to `AgentMarkdown`.
- Tables can still render once a complete table block exists.
- Partial code fences do not trigger expensive syntax highlighting.

3. Reduce layout shifts.

Audit CSS for chat bubbles, tool rows, status rows, code blocks, attachments, and input area. Add stable min/max dimensions where dynamic content currently changes layout abruptly. Avoid nested card-like surfaces and oversized decorative elements in the chat stream.

Acceptance:

- Tool calls, system events, and typing indicators do not resize surrounding content every token.
- Code blocks and tables scroll internally when needed.
- The input composer growth is capped and does not push the timeline unpredictably.

4. Improve input ergonomics without protocol changes.

Keep `ChatInput.tsx` focused on local interaction. Preserve IME handling, slash menu navigation, attachments, quick ask, stop/send behavior, and voice button state. Improve focus restoration only if it does not steal focus from text selection or manual scrolling.

Acceptance:

- Enter sends, Shift+Enter inserts newline, and IME composition is safe.
- During streaming, users can type without focus jumps.
- Attachment chips and slash menu do not cause message list jumps.

5. Add targeted regression tests.

Add or update tests near the changed code. Prefer behavior tests over snapshots.

Required coverage:

- `useChatScroll.test.tsx`: user scrolls up during streaming and is not forced to bottom.
- `MessageList.test.tsx`: streaming content uses lightweight rendering and completed content uses the completed renderer path.
- `StreamingMarkdown.test.tsx`: partial tables/code remain stable; complete tables still render.
- `Chat.integration.test.tsx` or focused component test: typing during active output does not trigger unintended submit or focus loss.

## Verification

Run at minimum:

```bash
npm run test -- src/renderer/src/screens/Chat src/renderer/src/components/StreamingMarkdown.test.tsx src/renderer/src/components/AgentMarkdown.test.tsx
npm run typecheck
```

If the change touches CSS heavily, also run:

```bash
npm run build
```

Manual check:

- Start the app.
- Produce a long streaming response with markdown, a code fence, a table, and tool/status rows.
- While streaming, scroll upward, select text, type in the composer, open the slash menu, and attach/remove a file.
- Confirm no shaking, no forced bottom jump, no input focus theft, and no broken markdown after completion.

## Non-Goals

- Do not change gateway event semantics.
- Do not change `message.delta` or `message.complete` handling.
- Do not change voice capture/transcription.
- Do not add a new design system.
- Do not replace `react-virtuoso` unless a measured blocker proves it is the root cause.
- Do not add Marvis-style background services in this workstream.

## Handoff Notes For Other Agents

This workstream should be safe to run in parallel with:

- Event-flow stability work, as long as that agent avoids the renderer files listed above.
- Runtime/background stability work, as long as that agent stays under `src-tauri/**` and service management files.

Potential conflict points:

- `useChatInbox.ts` can change message timing and content shape. Treat it as external input here.
- `tauriChatGatewayClient.ts` can change runtime session behavior. Do not edit it here.
- Voice work can touch `ChatInput.tsx`; coordinate before changing the voice button UI.

The desired endpoint is a chat page that feels responsive under load, not a visually redesigned chat page.
