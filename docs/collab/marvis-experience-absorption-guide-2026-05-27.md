# Marvis Experience Absorption Guide

This guide is for one engineer to absorb a small set of useful Marvis desktop-app lessons into Hermes Desktop.

The goal is not to copy Marvis. The goal is to make Hermes feel more complete, smoother to use, and easier to debug as a personal local agent app.

Current target branch: `marvis-op`

## Principles

- Keep Hermes small. Do not add Marvis-style multi-service complexity.
- Prefer visible user value over architecture ceremony.
- Prefer local, inspectable behavior over hidden automation.
- Keep permissions narrow. Do not add broad macOS entitlements or app capabilities unless Hermes truly uses them.
- Make each step independently testable and committable.
- If a change requires a large runtime redesign, document it as a follow-up instead of forcing it into this pass.

## What We Learned From Marvis

Observed from `/Applications/Marvis.app`:

- Marvis ships a rich file-icon asset set, about 131 extension icons.
- Marvis includes build/package metadata such as `build.json` and app bundle version fields.
- Marvis has explicit helper binaries for heavy or unstable work.
- Marvis declares user-facing permission descriptions in `Info.plist`.
- Marvis feels like a complete desktop product because file, status, runtime, and package details are visible and intentional.

What Hermes should absorb:

- Better file/attachment affordance.
- Better runtime and build self-description.
- More consistent long-task progress, timeout, and cancellation behavior.
- Clearer permission and security surface.
- A small smoke test path for real user workflows.

What Hermes should not absorb:

- Large app bundle size as a goal.
- Broad Electron-style runtime entitlements.
- Multiple always-on helper services.
- Marvis branding, exact layout, exact icons, or exact color treatment.

## Task 1: Build Info And Runtime Self-Description

### Goal

Make Hermes able to answer: "What build am I running, from which commit, with which runtime paths?"

### Files To Inspect

- `src-tauri/tauri.conf.json`
- `src-tauri/src/commands/tui.rs`
- `src-tauri/src/commands/data.rs`
- `src-tauri/src/lib.rs`
- `src/renderer/src/screens/Chat/GatewayHealthPanel.tsx`
- `src/renderer/src/lib/hermes-tauri.ts`
- `package.json`

### Required Behavior

Add a small build/runtime info path visible from the existing health panel.

The data should include:

- app version from package/Tauri config
- git commit if available at build time
- build time if available at build time
- current gateway status
- gateway executable or command path if known
- app data/log/config directory paths if already known by backend code

Do not include secrets, full environment dumps, API keys, bearer tokens, or raw config contents.

### Implementation Notes

Prefer a generated JSON file or compile-time env values. If build-time git metadata is unavailable, show `unknown` instead of failing.

Do not block app startup if build info cannot be loaded.

### Acceptance

- `GatewayHealthPanel` shows build/runtime details in a compact diagnostics section.
- Copy diagnostics includes the same fields with secrets redacted.
- Missing fields render as `unknown`, not blank UI or errors.

### Verification

Run:

```bash
rtk npm run typecheck
rtk npm run build
rtk cargo check --manifest-path src-tauri/Cargo.toml
```

Manual check:

- Open health panel.
- Confirm build/runtime fields are visible.
- Use copy diagnostics and verify no token/API key appears.

Commit:

```bash
rtk git add .
rtk git commit -m "feat(runtime): expose build info in health diagnostics"
```

## Task 2: File Type Icons For Attachments And Local File Tasks

### Goal

Make file-related UI easier to scan without adding heavy asset baggage.

### Files To Inspect

- `src/renderer/src/screens/Chat/ChatInput.tsx`
- `src/renderer/src/screens/Chat/attachmentUtils.ts`
- `src/renderer/src/shared/attachments.ts`
- `src/renderer/src/screens/Chat/ChatEmptyState.tsx`
- `src/renderer/src/assets/domains/chat.css`
- `src/renderer/src/assets/domains/ui-styles.css`

### Required Behavior

Add a lightweight extension-to-icon system for common file types.

Start with these groups:

- folders
- text/code: `txt`, `md`, `json`, `yaml`, `yml`, `js`, `ts`, `tsx`, `jsx`, `py`, `rs`, `go`, `sh`
- documents: `pdf`, `doc`, `docx`, `xls`, `xlsx`, `ppt`, `pptx`
- images: `png`, `jpg`, `jpeg`, `webp`, `gif`, `svg`
- archives: `zip`, `tar`, `gz`, `7z`
- audio/video: `mp3`, `wav`, `m4a`, `mp4`, `mov`
- fallback generic file

Use a compact local mapping and either lucide icons or a tiny local CSS treatment. Do not import a large icon pack or copy Marvis' asset set.

### Acceptance

- Staged attachments show a stable icon or badge by extension.
- File-oriented task suggestions in the empty state can show the same visual language if applicable.
- Unknown extensions have a graceful fallback.
- Long file names still truncate cleanly.

### Verification

Add or update tests around extension mapping:

```bash
rtk npm run test -- src/renderer/src/screens/Chat/attachmentUtils.test.ts
rtk npm run typecheck
rtk npm run build
```

Manual check:

- Drag or stage a `.md`, `.png`, `.pdf`, `.zip`, and unknown extension file.
- Confirm icons are stable and text does not overflow.

Commit:

```bash
rtk git add .
rtk git commit -m "feat(files): add lightweight file type affordances"
```

## Task 3: Long Task Progress, Timeout, And Cancellation Consistency

### Goal

Make Hermes feel stable when a local operation takes time or fails.

### Files To Inspect

- `src-tauri/src/commands/config.rs`
- `src-tauri/src/voice_input.rs`
- `src-tauri/src/tui_gateway.rs`
- `src/renderer/src/screens/Chat/GatewayHealthPanel.tsx`
- `src/renderer/src/screens/Chat/MessageList.tsx`
- `src/renderer/src/screens/Chat/systemEvents.ts`
- `src/renderer/src/lib/hermes-tauri.ts`

### Required Behavior

Audit long-running operations and make their behavior consistent:

- start state is visible
- progress or pending state is visible when available
- timeout has a clear message
- cancellation or restart path is clear where supported
- failure message is short by default with expandable details where possible

Do not add a new service. Do not rework gateway protocol unless a small field is enough.

### Candidate Operations

- remote connection test
- voice model download
- gateway restart
- copy diagnostics
- attachment/file staging if it can block

### Acceptance

- No long operation can silently hang without a visible pending/failure state.
- Timeout values are explicit in backend code.
- User-facing failure text avoids raw stack dumps unless expanded.
- Existing health panel remains the place to inspect runtime failures.

### Verification

Run focused tests if touched, plus:

```bash
rtk npm run typecheck
rtk npm run build
rtk cargo check --manifest-path src-tauri/Cargo.toml
rtk cargo test --manifest-path src-tauri/Cargo.toml
```

Manual check:

- Trigger gateway restart from health panel.
- Trigger remote connection test with a bad URL.
- Trigger diagnostics copy.
- Confirm visible state and recovery path.

Commit:

```bash
rtk git add .
rtk git commit -m "fix(runtime): standardize long task feedback"
```

## Task 4: Permission And Security Surface Review

### Goal

Keep Hermes' app capabilities understandable and narrow.

### Files To Inspect

- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/*.json`
- `src-tauri/src/commands/system.rs`
- `src-tauri/src/commands/config.rs`
- `src-tauri/tests/security_validation.rs`

### Required Behavior

Review whether Hermes declares or implies permissions that are too broad or unclear.

Keep:

- local network access only where required
- microphone access only if voice input needs it
- external URL opening restricted to expected schemes
- CSP narrow enough for the current app

Do not add camera, Bluetooth, broad local network discovery, or arbitrary executable permissions.

### Acceptance

- Security validation tests cover URL scheme allow/deny behavior.
- Any added macOS permission string is user-readable and specific.
- CSP remains compatible with current renderer assets.
- No secrets are exposed by diagnostics.

### Verification

```bash
rtk cargo test --manifest-path src-tauri/Cargo.toml --test security_validation
rtk cargo check --manifest-path src-tauri/Cargo.toml
rtk npm run build
```

Manual check:

- Inspect generated app permissions if a bundle is built.
- Confirm external link opening still works for `https://`.
- Confirm `file:`, `javascript:`, and `data:` are rejected.

Commit:

```bash
rtk git add .
rtk git commit -m "fix(security): clarify desktop permission boundaries"
```

## Task 5: Real User Smoke Path

### Goal

Create a small repeatable smoke checklist for the flows that matter most.

### Files To Inspect

- `docs/collab/`
- existing Vitest tests under `src/renderer/src/screens/Chat/`
- existing Tauri tests under `src-tauri/tests/`

### Required Behavior

Add a short smoke checklist document or test script covering:

- app starts
- chat accepts input
- streaming output keeps scroll behavior correct
- dragging/staging files displays type affordance
- health panel opens and diagnostics copy works
- bad remote URL fails safely
- build fonts/assets load without obvious missing UI

If automated browser/app smoke is too large for this pass, write the manual checklist with exact steps and expected results.

### Acceptance

- A future engineer can run the smoke path without reading this guide.
- The checklist includes expected pass/fail signals.
- Known warnings are listed separately from failures.

### Verification

Run:

```bash
rtk npm run typecheck
rtk npm run build
rtk npm run test -- src/renderer/src/screens/Chat/MessageList.test.tsx src/renderer/src/screens/Chat/hooks/useChatScroll.test.tsx src/renderer/src/screens/Chat/MessageList.perf.test.tsx
rtk cargo test --manifest-path src-tauri/Cargo.toml --test security_validation
```

Commit:

```bash
rtk git add .
rtk git commit -m "docs: add desktop smoke checklist"
```

## Recommended Order

1. Task 1: Build info and runtime self-description.
2. Task 2: File type icons.
3. Task 3: Long task consistency.
4. Task 4: Permission and security review.
5. Task 5: Smoke checklist.

Task 1 and Task 2 give the most immediate product-quality lift. Task 3 and Task 4 reduce confusing failures. Task 5 makes the improvement repeatable.

## Final Report Required

At the end, report:

- branch and latest commit
- exact files changed
- commands run and pass/fail result
- manual smoke results
- known warnings
- risks deferred

Do not claim visual or runtime parity with Marvis. The expected result is a smaller, cleaner Hermes that has absorbed the useful desktop-product lessons.
