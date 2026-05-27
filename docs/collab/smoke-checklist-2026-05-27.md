# Hermes Desktop — Smoke Checklist

Run after any merge to `main` or before release.

## Automated (CI-safe)

```bash
npm run typecheck
npm run build
npm run test
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --test security_validation
```

Expected: all pass, 0 failures.

Known warnings (non-blocking):
- `tauri_plugin_shell::Shell::<R>::open` deprecation warning in `system.rs`
- 2–3 unused-import warnings from Rust `#[warn(unused)]`

## Manual Smoke (requires running app)

### 1. App Starts

- [ ] `npm run tauri dev` launches without crash
- [ ] Main window renders with Hermes branding
- [ ] Gateway status indicator shows (Starting → Ready within ~10s)

### 2. Chat Accepts Input

- [ ] Type a message, press Enter
- [ ] Streaming output appears with working scroll
- [ ] Empty state workbench loads when no session active

### 3. Streaming Scroll Behavior

- [ ] Auto-scroll follows new streaming text
- [ ] Scrolling up pauses auto-follow
- [ ] Scrolling to bottom resumes follow

### 4. File Attachments

- [ ] Click paperclip → file picker opens
- [ ] Stage a `.md` file → shows code icon (blue)
- [ ] Stage a `.png` file → shows image thumbnail
- [ ] Stage a `.pdf` file → shows document icon (red)
- [ ] Stage a `.zip` file → shows archive icon (yellow)
- [ ] Stage an unknown extension → shows generic file icon
- [ ] Long filename truncates cleanly without overflow

### 5. Health Panel

- [ ] Open health/gateway diagnostics panel
- [ ] Build info section shows: Version, Commit hash, App Data path
- [ ] "Restart Gateway" button shows spinner while restarting
- [ ] After restart, status returns to Ready
- [ ] "Diagnostics" button copies text to clipboard (no API keys/tokens in output)

### 6. Remote Connection Safety

- [ ] Settings → Remote URL → enter `ftp://evil.com` → error message
- [ ] Enter empty string → error message
- [ ] Enter valid `https://` URL → connection test runs with timeout

### 7. Assets and Fonts

- [ ] No missing font fallbacks (no serif in UI)
- [ ] Icons render (lucide icon set loads)
- [ ] No console errors about missing CSS/image assets

## Known Gaps (not blockers)

- No virtual list for very long conversations (>500 messages)
- Gateway pre-warm timeout is 10s; slow machines may see Failed → auto-reconnect
- Voice model download requires internet on first use (no offline fallback)
