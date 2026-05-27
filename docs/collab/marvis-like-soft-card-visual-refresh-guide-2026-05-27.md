# Marvis-Like Soft Card Visual Refresh Guide

Date: 2026-05-27

This guide is for a focused visual refresh of Hermes Desktop inspired by Marvis. The goal is not to copy Marvis exactly. The goal is to learn its quiet card texture: low contrast, soft surfaces, weak borders, calm navigation, document-like reading, and a composer that feels like the primary floating control.

This workstream is visual only. Do not change chat event semantics, runtime stability, voice behavior, markdown parsing, gateway state, or scroll algorithms.

## Visual Target

Direction: Quiet Workspace / Soft Card Texture.

The app should feel like a long-running desktop workbench rather than a developer dashboard. The UI should become calmer, warmer, and less button-heavy while preserving Hermes' density and functional clarity.

Observed Marvis traits to learn:

- The left area under macOS traffic lights is a single soft substrate, not a heavy sidebar.
- Menu items are low contrast and list-like; active state is a pale surface, not a saturated outline.
- Main content uses a document reading feel with large calm surfaces.
- The bottom composer is the strongest card: rounded, softly elevated, and easy to find.
- Borders are weak; hierarchy comes from background tone, spacing, text weight, and small icons.
- Color is mostly warm white, mist gray, near-black text, and sparse accent.
- Hover/active motion is subtle opacity/background change, not translation, bounce, or large shadow.

## Scope

Phase 1 should cover only:

- App shell background and surface tokens
- Primary sidebar/navigation surface
- Session list item texture
- Chat header surface
- Chat message surfaces
- Tool/status rows
- Bottom composer
- Light theme first, with dark theme kept usable but not redesigned deeply

Allowed files:

- `src/renderer/src/assets/main.css`
- `src/renderer/src/assets/base.css`
- `src/renderer/src/components/ThemeProvider.tsx`
- `src/renderer/src/screens/Chat/Chat.tsx`, only for class hooks if CSS cannot target existing structure
- `src/renderer/src/screens/Chat/SessionSidebar.tsx`, only for class hooks
- `src/renderer/src/screens/Chat/ChatHeader.tsx`, only for class hooks
- `src/renderer/src/screens/Chat/ChatInput.tsx`, only for class hooks and visual-only button grouping
- `src/renderer/src/screens/Chat/MessageRow.tsx`, only for class hooks
- `src/renderer/src/screens/Chat/HistoryRow.tsx`, only for class hooks
- `src/renderer/src/screens/Chat/ToolGroupRow.tsx`, only for class hooks

Forbidden files:

- `src-tauri/**`
- `src/renderer/src/screens/Chat/hooks/**`
- `src/renderer/src/screens/Chat/tauriChatGatewayClient.ts`
- `src/renderer/src/screens/Chat/renderTranscript.ts`
- `src/renderer/src/screens/Chat/tuiEvents.ts`
- `src/renderer/src/components/AgentMarkdown.tsx`
- `src/renderer/src/components/StreamingMarkdown.tsx`
- Voice behavior, event handling, runtime health, and gateway code

If implementation needs behavior changes, stop and hand that finding to the relevant workstream.

## Design Principles

1. Use fewer, softer surfaces.

Avoid turning every element into a card. The sidebar is one soft substrate. The composer is one strong floating card. Messages and tool rows should be quiet reading surfaces with weak boundaries.

2. Reduce saturation.

Replace strong blue active states with pale blue-gray or neutral gray surfaces. Keep accent color for primary send/focus states only.

3. Replace borders with tonal contrast.

Use `rgba`/`color-mix` surfaces and very light separators. Borders should often be `transparent` or `rgba(15, 23, 42, 0.06)` in light mode.

4. Keep density, improve rhythm.

Do not make the app look like a marketing page. Keep menus compact and message content readable. Add outer breathing room, not oversized typography.

5. Motion should be quiet.

Allowed transitions: background, color, opacity, border-color, box-shadow. Avoid layout-moving hover transforms on sidebars, sessions, and messages.

## Token Direction

Add or refine semantic tokens rather than hardcoding styles throughout the file.

Suggested light theme values:

```css
--surface-canvas: #f6f5f2;
--surface-sidebar: rgba(244, 243, 240, 0.86);
--surface-panel: rgba(255, 255, 255, 0.72);
--surface-card: rgba(255, 255, 255, 0.82);
--surface-card-strong: rgba(255, 255, 255, 0.94);
--surface-hover: rgba(15, 23, 42, 0.045);
--surface-active: rgba(70, 92, 120, 0.10);
--border-soft: rgba(15, 23, 42, 0.065);
--border-softer: rgba(15, 23, 42, 0.04);
--text-primary: #202124;
--text-secondary: #5f6368;
--text-muted: #8a8f98;
--accent: #5d7da8;
--accent-subtle: rgba(93, 125, 168, 0.12);
--shadow-card-soft: 0 8px 24px rgba(24, 27, 31, 0.08), 0 1px 2px rgba(24, 27, 31, 0.05);
--shadow-float-soft: 0 18px 48px rgba(24, 27, 31, 0.12), 0 2px 8px rgba(24, 27, 31, 0.06);
--radius-soft: 14px;
--radius-panel: 18px;
--radius-composer: 22px;
```

Do not use a one-note blue/purple palette. Accent must be sparse.

## Implementation Plan

1. App shell and sidebar substrate

Make the app background a warm off-white canvas. Make the left navigation/session area feel like one soft substrate under the macOS traffic lights. Remove heavy outlines, strong gradients, and strong active blue.

Acceptance:

- Sidebar reads as one calm surface.
- Traffic-light area does not feel cramped or visually broken.
- Active nav/session item is recognizable without saturated color.
- Hover does not move the layout.

2. Navigation and session list texture

Make nav items and session items list-like. Use small icon/text contrast, pale active backgrounds, and short previews. Avoid large shadows on every item.

Acceptance:

- The active session is visible but not loud.
- Long session titles truncate cleanly.
- Streaming/error status remains visible with small icon/dot.
- The session list stays scannable at high density.

3. Chat content reading surface

Move chat content toward a document/workbench feel. Agent responses should be readable without heavy cards. User messages can remain slightly distinct, but should avoid saturated bubbles.

Acceptance:

- Long markdown, tables, lists, and tool rows feel like part of one document.
- Code blocks and tables keep contrast and accessibility.
- Copy/read controls remain discoverable but visually quiet.
- No text overlaps or clipped controls.

4. Tool/status rows

Reduce visual noise in tool calls, command rows, system events, and status messages. Prefer compact rails, pale surfaces, and small status icons.

Acceptance:

- Success/error/warning states remain distinguishable.
- Tool details do not look heavier than assistant content.
- Dense tool output stays readable.

5. Composer as the primary floating card

Make the bottom input area the strongest card surface. It should be soft, stable, and visually central without covering content.

Acceptance:

- Composer has a soft white elevated surface.
- Attach, voice, stop, quick ask, and send controls align cleanly.
- Focus state is subtle but clear.
- The composer does not jump in size unexpectedly.

6. Dark theme compatibility

Do not fully redesign dark mode in this phase, but ensure new tokens have dark equivalents and no unreadable contrast.

Acceptance:

- Dark mode has no white text on pale surfaces or black text on dark surfaces.
- Borders and shadows are adjusted for dark surfaces.
- Composer and sidebar remain visually separated.

## Verification

Run:

```bash
npm run typecheck
npm run build
```

If only CSS changes are made and build is slow, at minimum run `npm run typecheck` and a local visual check.

Manual visual check:

- Open Chat in light mode.
- Compare against Marvis reference: sidebar substrate, active item, content surface, composer.
- Test a long conversation with markdown, tables, code blocks, tool calls, status rows, attachments, and active streaming.
- Resize window narrow and wide.
- Check dark mode for readable contrast.
- Confirm no hover transforms cause layout shift.
- Confirm no text overlaps buttons or clips in session list/composer.

Suggested screenshot checklist:

- Full chat window, light mode
- Sidebar close-up under macOS traffic lights
- Active session list close-up
- Long assistant response with table/code/tool rows
- Composer focused and unfocused
- Dark mode smoke screenshot

## Non-Goals

- Do not change chat streaming behavior.
- Do not change scroll logic.
- Do not change event/state handling.
- Do not change voice behavior.
- Do not add new dependencies.
- Do not redesign settings/model/provider/plugin pages in Phase 1.
- Do not copy Marvis branding, exact colors, icons, or layout.

## Handoff Notes

This is independent from:

- `chat-ui-smoothness-agent-guide-2026-05-27.md`
- `chat-event-state-stability-agent-guide-2026-05-27.md`
- `desktop-runtime-stability-agent-guide-2026-05-27.md`

Potential conflict:

- `main.css` may already contain changes from the chat smoothness work. Preserve functional scroll/composer fixes. This guide should only refine visual texture.
- `ChatInput.tsx` may contain voice UI work from another branch. Do not modify voice behavior; only style existing controls.

The desired endpoint is a quieter, warmer, more premium desktop chat workspace.
