# Marvis-Like Card Texture Visual Optimization Plan

Date: 2026-05-27

This plan is for a broad visual refresh inspired by Marvis' calm card texture, especially the soft substrate below the macOS traffic lights and the low-contrast sidebar/menu treatment. It is not a clone. The goal is to bring Hermes closer to a quiet, fluid, premium desktop chat app while preserving Hermes' product identity and dense agent workflows.

## Visual Target

Marvis' useful qualities:

- The left rail sits on a soft off-white substrate that begins under the traffic lights and feels integrated with the macOS window.
- The menu surface is not a stack of heavy cards. It is a single low-contrast slab with subtle grouping, very soft edges, and light hover states.
- Text contrast is calm: black for primary labels, muted gray for secondary labels, very little saturated color.
- Active items use quiet tonal contrast instead of strong borders or bright blue fills.
- Chat content sits on a clean canvas. Message cards are large but low-shadow, with generous whitespace and rounded corners.
- The input composer is a wide floating rounded panel, lightly raised, not visually noisy.

Hermes should keep:

- Clear agent workflow affordances.
- Dense navigation for Chat/Sessions/Profiles/Models/etc.
- Readable tool output, code, tables, and long transcripts.
- Dark mode support, but this plan should first make light mode excellent.

## Ownership Boundary

Allowed files:

- `src/renderer/src/assets/main.css`
- `src/renderer/src/assets/base.css`
- `src/renderer/src/components/ThemeProvider.tsx`
- `src/renderer/src/screens/Chat/Chat.tsx`
- `src/renderer/src/screens/Chat/SessionSidebar.tsx`
- `src/renderer/src/screens/Chat/ChatHeader.tsx`
- `src/renderer/src/screens/Chat/ChatInput.tsx`
- `src/renderer/src/screens/Chat/MessageRow.tsx`
- `src/renderer/src/screens/Chat/HistoryRow.tsx`
- `src/renderer/src/screens/Chat/ToolGroupRow.tsx`
- Focused visual/component tests if existing tests depend on class names.

Forbidden files:

- `src-tauri/**`
- `useChatInbox.ts`, `tauriChatGatewayClient.ts`, `renderTranscript.ts`
- Voice behavior files
- Runtime/gateway files
- Package/dependency files unless a build error proves they are necessary.

## Design Tokens

Create a small visual token layer instead of scattering one-off colors.

Recommended light tokens:

- `--surface-window`: `#f6f5f2`
- `--surface-sidebar`: `rgba(247, 246, 243, 0.86)`
- `--surface-sidebar-solid`: `#f3f2ef`
- `--surface-canvas`: `#fbfaf8`
- `--surface-card`: `rgba(255, 255, 255, 0.82)`
- `--surface-card-solid`: `#ffffff`
- `--surface-hover`: `rgba(20, 20, 20, 0.045)`
- `--surface-active`: `rgba(20, 20, 20, 0.075)`
- `--hairline`: `rgba(20, 20, 20, 0.07)`
- `--hairline-strong`: `rgba(20, 20, 20, 0.11)`
- `--text-primary`: `#1f1f1d`
- `--text-secondary`: `#6f6d68`
- `--text-tertiary`: `#9b9891`
- `--accent-quiet`: `#2f6f68`
- `--accent-quiet-bg`: `rgba(47, 111, 104, 0.10)`
- `--shadow-soft`: `0 1px 2px rgba(20, 20, 20, 0.04), 0 14px 36px rgba(20, 20, 20, 0.06)`
- `--shadow-float`: `0 1px 2px rgba(20, 20, 20, 0.05), 0 18px 48px rgba(20, 20, 20, 0.10)`
- `--radius-soft`: `14px`
- `--radius-panel`: `22px`
- `--radius-composer`: `24px`

Dark mode should use the same token names with darker surfaces and lower contrast shadows. Do not create a separate styling system.

## Implementation Plan

1. Rebuild the window substrate.

Make the app background feel like a native desktop surface, not a web page.

- Use one quiet off-white window background.
- Let the sidebar start beneath the traffic lights with enough top padding.
- Avoid strong panel borders around the entire sidebar.
- Use `backdrop-filter` only if it is stable and subtle; keep a solid fallback.
- Keep the macOS drag region usable.

Acceptance:

- Traffic lights visually sit above a calm substrate.
- No hard seam between top-left chrome area and sidebar.
- Sidebar does not look like a separate heavy card.

2. Simplify primary navigation.

Convert left navigation items to low-contrast rows.

- Remove strong blue active states.
- Use muted active background plus a small quiet indicator if needed.
- Use icons at consistent size and opacity.
- Keep row height stable.
- Use section labels sparingly and make them low-contrast.

Acceptance:

- Active item is clear but not loud.
- Hover does not shift layout.
- The left rail looks calm at a glance.

3. Redesign session list texture.

Sessions should feel like a soft list, not many bordered cards.

- Default session rows should have transparent or near-transparent background.
- Active session uses `--surface-active` and maybe a thin quiet outline.
- Remove heavy shadows from session items.
- Keep title, preview, time, unread/status aligned and compact.
- Avoid saturated blue borders unless the state is truly urgent.

Acceptance:

- A long session list is scannable.
- Active row is clear without visual aggression.
- Streaming/error states are visible but restrained.

4. Tune chat canvas and message cards.

Make the transcript breathe while staying practical for long agent output.

- Use `--surface-canvas` for the main chat background.
- User messages can remain lightly tinted but should avoid saturated color.
- Agent output cards should use white or translucent white with soft radius and minimal border.
- Tool/system rows should use compact low-contrast panels.
- Tables and code blocks should have internal surfaces, not heavy nested cards.

Acceptance:

- Long answers look like readable documents.
- Tool output is visually distinct but not noisy.
- Code/table content remains highly readable.

5. Make the composer a premium floating panel.

The input area should become the strongest Marvis-like reference.

- Wide rounded composer with soft shadow.
- Low border contrast.
- Attachment/voice/send buttons use familiar icons, muted default state, clear hover state.
- Placeholder should be soft but readable.
- Bottom model/status row should feel secondary.

Acceptance:

- Composer feels clickable and calm.
- Buttons do not crowd the text field.
- Focus state is visible without strong blue glow.

6. Normalize elevation.

Define only three elevation levels:

- Level 0: window/canvas, no shadow.
- Level 1: sidebar active row, tool rows, message cards, tiny shadow or hairline.
- Level 2: composer, popovers, modals, meaningful floating controls.

Do not add deep shadows to nav rows, session rows, normal message bubbles, or section containers.

7. Reduce saturated color use.

Hermes currently uses stronger active blues in places. Replace most normal active states with neutral or quiet green-gray tones.

Keep saturated colors only for:

- Destructive/error states.
- Required approval or security prompts.
- Progress states where color conveys useful state.

8. Smooth motion without layout movement.

Use motion for opacity/background only. Avoid transform movement on list rows because it can feel slippery and can disturb dense navigation.

Allowed:

- background-color fade
- opacity fade
- subtle shadow fade

Avoid:

- hover translate on sidebar/session rows
- scale on dense list items
- bouncy easing for work UI

## Specific Current Hermes Adjustments

Target these existing classes first:

- `.app`, `.app-content`
- `.sidebar`, `.sidebar-nav-item`, `.sidebar-brand`, `.sidebar-collapse-btn`
- `.session-sidebar`, `.session-sidebar-header`, `.session-sidebar-list`, `.session-sidebar-section-label`
- `.session-item`, `.session-item.active`, `.session-item.streaming`, `.session-item.error`
- `.chat-messages`, `.chat-message`, `.chat-bubble`, `.chat-bubble-user`, `.chat-bubble-agent`
- `.chat-history-*`, `.tool-*`, `.chat-system-*`
- `.chat-input-area`, `.chat-input-wrapper`, `.chat-input`, `.chat-bottom-bar`
- `.chat-scroll-to-bottom-btn`, `.chat-timeline-navigator`

Do not start by restyling every screen. First make Chat excellent, then apply shared token changes carefully to other screens.

## Verification

Run:

```bash
npm run typecheck
npm run test -- src/renderer/src/screens/Chat src/renderer/src/components
npm run build
```

Manual visual QA:

- Compare Hermes and Marvis side by side in light mode.
- Check 1200x800, 1440x900, and a narrow width around 900px.
- Confirm the traffic-light/sidebar substrate feels integrated.
- Confirm active nav and active session are visible but quiet.
- Confirm long chat output with headings, tables, code, tool rows, and system events remains readable.
- Confirm composer focus, hover, disabled send, attachments, and voice button states.
- Confirm no text overlaps or row height jitter.
- Check dark mode after light mode is stable.

Screenshot deliverables:

- Full app at default size.
- Sidebar close-up under traffic lights.
- Active session list close-up.
- Long assistant answer with table and code.
- Composer focused and unfocused.
- Dark mode full app.

## Non-Goals

- Do not copy Marvis branding, icons, or exact layout.
- Do not change backend, gateway, event flow, voice behavior, or scrolling logic.
- Do not add decorative gradients, orbs, or marketing-style hero surfaces.
- Do not make the UI less dense just to look prettier.
- Do not introduce a new component library.

## Handoff Notes

This should be a dedicated visual polish branch. It can follow the UI smoothness work, but it should not be mixed with runtime or event-state fixes.

The desired endpoint is a calmer, softer Hermes desktop interface with Marvis-like material quality: quiet left substrate, restrained active states, document-like chat output, and a premium composer.
