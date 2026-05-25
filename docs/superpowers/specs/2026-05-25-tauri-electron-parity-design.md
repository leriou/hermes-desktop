# Tauri-Electron Parity Design

## Goal
Make the Tauri version functionally identical to the Electron version: all menus, IPC commands, events, and data interfaces must match.

## Gap Analysis

### 1. Missing Rust Commands (5) — FIXED

| Command | Description |
|---------|-------------|
| `list_cron_history` | List cron job execution history (reads output directory) |
| `read_cron_output` | Read content of a specific cron output file |
| `tui_clarify_respond` | Respond to a clarification request from the agent |
| `tui_session_title` | Get session title via `session.title` RPC |
| `voice_tts` | Call `voice.tts` RPC via gateway (not stub) |

### 2. Missing JS Bridge Methods (5) — FIXED

All 5 missing methods added to `hermes-tauri.ts`.

### 3. Menu Gaps — FIXED

**View menu**: Added Reset Zoom (CmdOrCtrl+0), Zoom In (CmdOrCtrl+=), Zoom Out (CmdOrCtrl+-), separator, Fullscreen.

**Help menu**: "Hermes Agent on GitHub" + "Report an Issue" (opens in browser via shell plugin).

**Window menu**: Zoom toggle + Close Window on all platforms.

### 4. Event Name Typo — FIXED

`menusearchsessis` → `menusearchsessions` in both `lib.rs` and `hermes-tauri.ts`.

### 5. Streaming Event Emissions — FIXED

**install-progress**: `start_install` now spawns a child process with stdout streaming, parses stage markers matching Electron's 7-step model (Checking prerequisites → Setting up package manager → Setting up Python → Downloading Hermes Agent → Creating Python environment → Installing dependencies → Finishing setup).

**oauth-login-progress**: `oauth_login` streams stdout line-by-line as `oauthloginprogress` events.

**update/migrate progress**: `run_hermes_update` and `run_claw_migrate` emit `installprogress` events.

### 6. Right-click Context Menu — FIXED

Implemented entirely in frontend JS (`main.tsx`) for Tauri mode:
- Editable fields: Cut, Copy, Paste, Select All, separator, Copy entire chat (text/markdown)
- Non-editable: Copy, Select All (scoped to `.chat-bubble`), Copy entire chat (text/markdown)
- Uses native-looking CSS menu with theme variables
- Dispatches `hermes-copy-chat` CustomEvent, consumed by `Chat.tsx`

### 7. Zoom — FIXED

Uses `document.documentElement.style.zoom` (applies to entire page including html root), consistent across both Chromium and WebKit renderers.

## Files Modified

1. `src-tauri/src/commands.rs` — 5 new commands, streaming install/oauth/update
2. `src-tauri/src/lib.rs` — menu, event names, command registration, open_url helper
3. `src-tauri/src/cron_utils.rs` — list_cron_history, read_cron_output
4. `src/renderer/src/lib/hermes-tauri.ts` — 5 missing methods, event name fix
5. `src/renderer/src/main.tsx` — Tauri context menu handler
6. `src/renderer/src/screens/Chat/Chat.tsx` — listen for hermes-copy-chat CustomEvent

## Build Status
- `cargo build`: 0 errors, 18 warnings (pre-existing)
- TypeScript: 0 errors in modified files (pre-existing errors in index.d.ts unrelated)
