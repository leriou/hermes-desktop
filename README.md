# Hermes Caduceus



<br/>
<p align="center">
  <a href="https://github.com/fathah/hermes-caduceus/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License: MIT"></a>
  <a href="https://github.com/fathah/hermes-caduceus/releases/"><img src="https://img.shields.io/badge/macOS-Download-FF6600?style=for-the-badge" alt="Releases"></a>
</p>

> **Fork of [hermes-desktop](https://github.com/NousResearch/hermes-desktop)** — deeply customized and optimized for macOS. Rewritten from Electron to Tauri 2 + React 19 with a focus on native performance, architecture cleanliness, and macOS-specific optimizations.

## Languages

- English: `README.md`
- 简体中文: `README.zh-CN.md`

Hermes Caduceus is a native macOS desktop client for [Hermes Agent](https://github.com/NousResearch/hermes-agent) — a self-improving AI assistant with tool use, multi-platform messaging, and a closed learning loop.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   React 19 Frontend                  │
│        (Chat, Sessions, Models, Gateway, ...)        │
├─────────────────────────────────────────────────────┤
│                 Tauri IPC Bridge                      │
│              156 typed Rust commands                  │
├────────────┬────────────┬────────────┬──────────────┤
│   Config   │    Chat    │   System   │    Voice     │
│   Utils    │  Commands  │   Utils    │   Input      │
├────────────┴────────────┴────────────┴──────────────┤
│               TUI Gateway (JSON-RPC over stdio)       │
│     Auto-restart · Watchdog · Health diagnostics      │
├─────────────────────────────────────────────────────┤
│              Python TUI Gateway (subprocess)           │
│                 Hermes Agent Core                      │
└─────────────────────────────────────────────────────┘
```

The app runs Hermes Agent as a managed Python subprocess, communicating via JSON-RPC over stdin/stdout. The Rust backend translates these into typed Tauri commands for the React frontend — a three-layer isolation model where each layer communicates through well-defined protocols.

### Key Architectural Decisions

| Decision | Why |
|----------|-----|
| **Tauri 2 over Electron** | ~5x smaller download, native macOS feel, no Chromium bundled |
| **JSON-RPC over stdio** | No HTTP port needed, no CORS, no network surface — the gateway is only reachable from the Rust process |
| **Microtask streaming** | `Promise.resolve().then()` instead of `requestAnimationFrame` for sub-millisecond text flush, eliminating the 16ms rAF cadence bottleneck |
| **Capabilities-based security** | Minimal Tauri permissions (`core:default` + drag + zoom only), CSP headers, URL scheme validation, no arbitrary shell access from renderer |
| **Direct HTTP model discovery** | `reqwest` calls to provider `/models` endpoints — works without a running gateway |
| **Profile isolation** | Each profile gets its own `~/.hermes/profiles/<name>/` with independent config, env, and state DB |

### Why Tauri

| | Tauri 2 (this project) | Electron (upstream) |
|--|--|--|
| **Download size** | ~36 MB `.dmg` | ~200 MB+ `.dmg` |
| **Native binary** | ~10 MB | ~150 MB+ (bundles Chromium + Node.js) |
| **Rendering engine** | System WebKit (`WKWebView`) | Bundled Chromium |
| **Memory footprint** | ~60-80 MB RSS | ~300-500 MB RSS |
| **Startup time** | < 1s | 3-5s |
| **macOS integration** | Native: Metal, CoreML, CoreAudio, vibrancy | Chromium compatibility layer |
| **Auto-update** | Rust-native Tauri updater | electron-updater |
| **Security surface** | 6 curated plugins, capabilities-gated | Full Node.js + Chromium access |

Tauri uses the system's built-in WebKit on macOS — no Chromium bundled. This means the app inherits Apple's security patches through macOS updates, not through bundled browser upgrades. The Rust backend compiles to a single native binary (~10 MB) with zero runtime garbage collection pauses.

#### Plugin Surface

Only 6 Tauri plugins are loaded — each for a specific purpose:

| Plugin | Purpose |
|--------|---------|
| `tauri-plugin-log` | Structured logging |
| `tauri-plugin-dialog` | Native file/folder picker dialogs |
| `tauri-plugin-shell` | Launching Hermes installer scripts |
| `tauri-plugin-clipboard-manager` | Read/write system clipboard |
| `tauri-plugin-window-state` | Persist window size and position |
| `tauri-plugin-store` | Local key-value storage for preferences |

#### CoreML-Accelerated Voice

The `whisper-rs` dependency is compiled with the `coreml` feature flag, which routes whisper inference through Apple's CoreML framework on Apple Silicon. This gives a significant speedup over CPU-only whisper inference for on-device voice transcription.

---

## macOS Optimizations

### ProMotion 120Hz Rendering

On launch, the Rust backend sets two WebKit environment flags to unlock full ProMotion refresh rates:

```rust
std::env::set_var("WebKitForceMetal", "1");
std::env::set_var("WebKitCanvasAcceleratedDrawingEnabled", "1");
```

This forces WebKit to use Apple Metal for hardware-accelerated rendering, releasing the 120Hz capability on MacBook Pro displays. Combined with the microtask streaming engine, chat text appears character-by-character at the display's native refresh rate — no frame drops, no visible buffering.

### Native Window Chrome

- **Overlay title bar** with `hiddenTitle` — seamless toolbar integration, no double title bars
- **UnderPageBackground vibrancy** — translucent sidebar matching the macOS desktop tint
- **Metal GPU compositing** — GPU-accelerated canvas and CSS animations via `WKWebView`

### Local Voice Input

Voice-to-text runs entirely on-device with no cloud dependency:

- **whisper-rs** (Whisper base model) for local speech recognition
- **cpal + CoreAudio** — audio capture on the main thread (macOS requirement), play/pause from any thread
- **VAD silence detection** — auto-stops recording after 3s of silence (energy threshold 0.0004)
- One-click record → transcribe → paste into chat input

---

## Gateway Resilience

The TUI Gateway is managed as a supervised subprocess with automatic recovery:

- **Auto-restart** — up to 5 reconnect attempts with backoff on process exit
- **Watchdog timer** — 65s timeout for stale `Starting`/`Reconnecting` states
- **Health diagnostics** — `runtime_health` command returns status, restart count, pending requests, Python/repo/home path validation, and last 10 failure records
- **Failure persistence** — last 10 gateway failures written to `~/.hermes/logs/gateway_failures.json` for post-mortem
- **60s startup timeout** — generous window for MCP server discovery on slow connections

---

## Streaming Engine

The chat streaming pipeline is designed for zero-text-loss rendering across concurrent tabs:

```
Gateway SSE → Tauri Event → useChatInbox → pendingChunks → microtask flush → flushedTextRef → React state
```

- **Per-tab state isolation** — each chat tab has independent `pendingChunks`, `flushedText`, and `turnCompleted` refs
- **Microtask scheduling** — `Promise.resolve().then()` fires as soon as the JS context clears, not on the next animation frame
- **Dual-ref consistency** — `flushedTextRef` tracks committed text synchronously, avoiding stale reads from React's async state updates during `message.complete`

---

## Premium macOS Experience

Hermes Caduceus is not just a cross-platform port; it is built to feel like a first-class citizen on macOS:

- **120Hz ProMotion Support:** Forced Apple Metal API acceleration via WebKit for buttery-smooth 120fps scrolling and animations.
- **Native Vibrancy:** Real-time `UnderWindowBackground` effects that adapt to your wallpaper, providing the iconic macOS glassmorphism.
- **Apple Silicon Optimized:** Native ARM64 builds with Link-Time Optimization (LTO) for peak performance on M1/M2/M3 chips.
- **Safari 17 Modern Engine:** Leverages the latest WebKit features for reduced memory footprint and lightning-fast JS execution.
- **Title Bar Integration:** Transparent "Overlay" title bar with native traffic lights for a clean, modern aesthetic.

## Installation

1. **Download** the latest `.dmg` from [Releases](https://github.com/fathah/hermes-caduceus/releases/).
2. **Move to Applications** — open the `.dmg` and drag `Hermes Caduceus` to `/Applications`.
3. **First launch** — right-click → **Open** (required for self-signed apps), or run:
   ```bash
   xattr -cr "/Applications/Hermes Caduceus.app"
   ```

## GitHub Automation

- **Builds:** macOS (x64 + ARM64) `.dmg` builds on every tag push (`v*`).
- **CI:** Lint, typecheck, and unit tests on every Pull Request.

---

## Features

- **Guided first-run install** for Hermes Agent with dependency resolution
- **Local or remote backend** — run locally on `127.0.0.1:8765`, or connect to a remote Hermes API server via SSH tunnel
- **Multi-provider support** — OpenRouter, Anthropic, OpenAI, Google (Gemini), xAI (Grok), Nous Portal, Qwen, MiniMax, Hugging Face, Groq, and local OpenAI-compatible endpoints (LM Studio, Ollama, vLLM, llama.cpp)
- **Direct model discovery** — detect available models from provider `/models` endpoints without starting the gateway
- **Streaming chat UI** — SSE streaming with microtask flush, tool progress indicators, markdown rendering, syntax highlighting
- **Token usage tracking** — live prompt/completion token counts and cost display
- **34 slash commands** — `/new`, `/clear`, `/fast`, `/web`, `/image`, `/browse`, `/code`, `/file`, `/shell`, `/usage`, `/help`, `/tools`, `/skills`, `/model`, `/memory`, `/persona`, `/version`, `/compact`, `/compress`, `/undo`, `/retry`, `/debug`, `/status`, `/btw`, `/approve`, `/deny`, `/reset`, `/goal`, `/steer`, `/queue`, `/update`, `/kanban`, `/curator`, `/reload-skills`
- **Session management** — full-text search (SQLite FTS5), date-grouped history, segmented sessions with cross-segment loading
- **Profile switching** — isolated Hermes environments with separate config, env, and state
- **32 API key fields** across 5 tool categories — LLM, browser automation, voice, research, and more
- **Memory & Persona** — view/edit memory entries and SOUL.md personality
- **Routing & Fallback** — GUI for default model, provider, and fallback chain configuration
- **Scheduled tasks** — cron job builder with 16 delivery targets
- **16 messaging gateways** — Telegram, Discord, Slack, WhatsApp, Signal, Matrix, iMessage, DingTalk, Feishu, WeCom, WeChat, and more
- **Plugin management** — enable/disable plugins with status and source filtering
- **Voice input** — on-device speech recognition with VAD auto-stop
- **Backup, import & debug dump**
- **i18n** — 8 locales (EN, ES, ID, JA, PT-BR, PT-PT, ZH-CN, ZH-TW)

## Preview

<table>
<tr>
<td width="50%" align="center"><b>Home</b><br/><img width="100%" alt="Home" src="previews/homepage.png" /></td>
<td width="50%" align="center"><b>Chat</b><br/><img width="100%" alt="Chat" src="previews/latestchat.png" /></td>
</tr>
<tr>
<td width="50%" align="center"><b>Sessions</b><br/><img width="100%" alt="Sessions" src="previews/sessions.png" /></td>
<td width="50%" align="center"><b>Memory &amp; Persona</b><br/><img width="100%" alt="Memory" src="previews/memory.png" /></td>
</tr>
<tr>
<td width="50%" align="center"><b>Provider</b><br/><img width="100%" alt="Provider" src="previews/provider.png" /></td>
<td width="50%" align="center"><b>Skills</b><br/><img width="100%" alt="Skills" src="previews/skills.png" /></td>
</tr>
<tr>
<td width="50%" align="center"><b>Config</b><br/><img width="100%" alt="Config" src="previews/config.png" /></td>
<td width="50%" align="center"><b>Chat Detail</b><br/><img width="100%" alt="Chat Detail" src="previews/chat.png" /></td>
</tr>
</table>

---

## Development

### Prerequisites

- macOS 13+
- Node.js 22+ and Bun
- [Rust](https://rustup.rs/)

### Setup

```bash
bun install
bun run dev
```

### Checks & Tests

```bash
bun run lint
bun run typecheck
bun run test
```

### Build

```bash
bun run build:mac
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Native Shell | **Tauri 2** (Rust) — ~5,800 LOC |
| Frontend | **React 19** + **TypeScript 5** — ~38,000 LOC |
| Styling | **Tailwind CSS** 4 |
| Build | **Vite** 7 |
| i18n | **i18next** |
| Tests | **Vitest** + Rust tests |
| Voice | **whisper-rs** + **cpal** (CoreAudio) |

## Acknowledgements

- [Hermes Agent](https://github.com/NousResearch/hermes-agent) — the core AI agent this app manages
- [hermes-desktop](https://github.com/NousResearch/hermes-desktop) — the upstream Electron project this was forked from
