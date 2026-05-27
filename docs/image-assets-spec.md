# Hermes Caduceus — 图像资源清单与生成规范

> 给图像生成 AI 用的参考文档。每项包含：文件名、尺寸、风格、内容描述、推荐提示词。

---

## 1. App Icon（应用图标）

### 1.1 主图标

| 项目 | 值 |
|------|-----|
| 文件名 | `icon.png` |
| 尺寸 | **512×512 px** |
| 格式 | PNG（透明背景） |
| 用途 | Tauri 应用图标、macOS Dock 图标 |

**内容描述：** Caduceus（双蛇杖）风格图标，象征 Hermes 的使者身份。深色底 + 金色蛇杖，简洁现代。

**推荐提示词：**
> A modern app icon, 512x512, caduceus symbol (two snakes wrapped around a winged staff) in gold on a dark navy/black gradient background, minimalist flat design, rounded corners, no text, clean vector style, transparent background not needed (solid bg is fine), high contrast, suitable for macOS icon

### 1.2 多尺寸派生

从主图标 `icon.png` 缩放生成，**不需要单独制作**：

| 文件名 | 尺寸 |
|--------|------|
| `32x32.png` | 32×32 |
| `128x128.png` | 128×128 |
| `128x128@2x.png` | 256×256 |
| `Square30x30Logo.png` | 30×30 |
| `Square44x44Logo.png` | 44×44 |
| `Square71x71Logo.png` | 71×71 |
| `Square89x89Logo.png` | 89×89 |
| `Square107x107Logo.png` | 107×107 |
| `Square142x142Logo.png` | 142×142 |
| `Square150x150Logo.png` | 150×150 |
| `Square284x284Logo.png` | 284×284 |
| `Square310x310Logo.png` | 310×310 |
| `StoreLogo.png` | 50×50 |
| `icon.icns` | macOS 图标集（由工具从 512px 生成） |
| `icon.ico` | Windows 图标（由工具从 512px 生成） |

目录：`src-tauri/icons/` 和 `build/`

---

## 2. Splash Screen（启动画面）

### 2.1 启动背景

| 项目 | 值 |
|------|-----|
| 文件名 | `hermesbg.webp` |
| 尺寸 | **1920×1080 px** |
| 格式 | WebP |
| 用途 | 应用启动时的全屏背景图 |

**推荐提示词：**
> A dark, atmospheric desktop wallpaper, 1920x1080, deep navy blue to black gradient, subtle abstract geometric patterns or neural network connections in very low opacity, minimalist, no text, no logos, moody tech aesthetic, suitable as a splash screen background for an AI assistant app

### 2.2 启动 Logo 文字

| 项目 | 值 |
|------|-----|
| 文件名 | `splashtext.png` / `splashtext-w.webp` |
| 尺寸 | **2392×213 px** |
| 格式 | PNG（透明背景）和 WebP |
| 用途 | 启动画面中央的产品名文字 |

**推荐提示词：**
> Product name text logo "HERMES CADUCEUS" on transparent background, 2392x213 pixels, wide horizontal layout, elegant modern sans-serif font, gold (#FFD700) gradient text with subtle glow, clean and premium look, no extra decorations, text only

---

## 3. Sidebar Logo

### 3.1 侧边栏横版 Logo

| 项目 | 值 |
|------|-----|
| 文件名 | `hermes.png` |
| 尺寸 | **1145×196 px** |
| 格式 | PNG（透明背景） |
| 用途 | 侧边栏顶部展开状态的 Logo |

### 3.2 侧边栏图标 Logo

| 项目 | 值 |
|------|-----|
| 文件名 | `hermes-icon.png` |
| 尺寸 | **512×512 px** |
| 格式 | PNG（透明背景） |
| 用途 | 侧边栏折叠状态的图标 |

**推荐提示词（hermes.png）：**
> Horizontal logo "HERMES" with a small caduceus icon on the left, on transparent background, 1145x196 pixels, modern clean sans-serif font, gold accent color, minimalist tech brand style, high contrast

**推荐提示词（hermes-icon.png）：**
> Square logo icon, 512x512, stylized caduceus symbol in gold on transparent background, simple geometric flat design, recognizable at small sizes, suitable for sidebar icon, no text

---

## 4. README Banner

| 项目 | 值 |
|------|-----|
| 文件名 | 上传到 GitHub Issue Attachments，README 中通过 URL 引用 |
| 尺寸 | **宽度 100%，建议 1920×480 px** |
| 格式 | PNG |
| 用途 | README.md 顶部的项目横幅 |

**推荐提示词：**
> A wide banner image for a GitHub README, 1920x480 pixels, dark navy background with subtle geometric patterns, centered text "HERMES CADUCEUS" in large elegant gold sans-serif font, tagline below "AI Agent Desktop — Forked & Optimized for macOS" in smaller white text, clean tech aesthetic, professional open-source project banner, subtle caduceus watermark or icon

---

## 5. README Preview Screenshots

共 6 张（README 只展示 3 行 × 2 列），均从 macOS 截图。

| 文件名 | 页面 | 尺寸参考 |
|--------|------|----------|
| `previews/chat.png` | 聊天界面 | ~2200×1600 px |
| `previews/profiles.png` | 档案管理 | ~2200×1600 px |
| `previews/models.png` | 模型管理 | ~2200×1600 px |
| `previews/providers.png` | 提供商配置 | ~2200×1600 px |
| `previews/tools.png` | 工具集 | ~2200×1600 px |
| `previews/skills.png` | 技能管理 | ~2200×1600 px |

**要求：** macOS 窗口截图，使用深色主题，窗口无边框或圆角效果。建议实际运行 app 后截取真实界面，AI 生成很难达到真实效果。如果需要 AI 生成 mockup：

> macOS dark mode desktop app screenshot mockup, clean modern UI, sidebar navigation on left with icons, main content area on right showing [chat interface / model list / provider settings / etc.], dark color scheme with gold accents, realistic macOS window chrome, 2200x1600 pixels

---

## 6. Social Preview（可选）

| 项目 | 值 |
|------|-----|
| 文件名 | `.github/social-preview.png` |
| 尺寸 | **1280×640 px** |
| 格式 | PNG |
| 用途 | GitHub 仓库的 social card（分享链接时的预览图） |

**推荐提示词：**
> GitHub social preview image, 1280x640, dark navy gradient background, centered caduceus icon in gold, "Hermes Caduceus" text in white modern font below, "AI Agent Desktop for macOS" tagline in smaller gray text, clean minimalist design, no clutter

---

## 7. Provider/Platform Logos（SVG 矢量图标）

36 个品牌 Logo，全部为 SVG 格式，monochrome（单色，通常白色或适配深色背景）。这些是第三方品牌图标，**建议从 Simple Icons（simpleicons.org）或官方品牌资源直接下载**，不需要 AI 生成。

| 文件名 | 品牌 |
|--------|------|
| `openrouter.svg` | OpenRouter |
| `claude-color.svg` | Anthropic Claude |
| `openai.svg` | OpenAI |
| `gemini-color.svg` | Google Gemini |
| `grok.svg` | xAI Grok |
| `nousresearch.svg` | Nous Research |
| `groq.svg` | Groq |
| `huggingface.svg` | Hugging Face |
| `deepseek-color.svg` | DeepSeek |
| `mistral-color.svg` | Mistral |
| `cerebras-color.svg` | Cerebras |
| `fireworks-color.svg` | Fireworks |
| `together-color.svg` | Together AI |
| `nvidia-color.svg` | NVIDIA |
| `perplexity-color.svg` | Perplexity |
| `meta-color.svg` | Meta |
| `minimax-color.svg` | MiniMax |
| `moonshot.svg` | Moonshot |
| `zai.svg` | ZAI |
| `opencode.svg` | OpenCode |
| `telegram.svg` | Telegram |
| `discord.svg` | Discord |
| `slack.svg` | Slack |
| `whatsapp-icon.svg` | WhatsApp |
| `signal.svg` | Signal |
| `matrix-dark.svg` | Matrix |
| `mattermost-dark.svg` | Mattermost |
| `email.svg` | Email |
| `sms.svg` | SMS |
| `imessage.svg` | iMessage |
| `dingtalk.svg` | 钉钉 |
| `lark.svg` | 飞书/Lark |
| `wecom.svg` | 企业微信 |
| `wechat.svg` | 微信 |
| `webhook.svg` | Webhook |
| `home-assist.svg` | Home Assistant |

目录：`src/renderer/src/assets/logos/`

---

## 生成优先级

1. **P0 — 必须手做/截图：** `previews/*.png`（6 张界面截图）—— 实际运行 app 截取
2. **P0 — AI 生成：** App Icon (`icon.png` 512×512) → 生成后用 `tauri icon` 命令自动派生全部尺寸
3. **P1 — AI 生成：** README Banner、Social Preview
4. **P1 — AI 生成：** Splash Screen 背景 + 文字 Logo
5. **P2 — 可选：** Sidebar Logo (`hermes.png`, `hermes-icon.png`)
6. **P2 — 下载：** 36 个品牌 SVG Logo → 从 Simple Icons 获取

## 派生命令

生成主 icon.png 后，用 Tauri CLI 自动生成全部尺寸：

```bash
npm run tauri icon path/to/icon.png
```

这会自动生成 `src-tauri/icons/` 下所有尺寸的 PNG + `.icns` + `.ico`。
