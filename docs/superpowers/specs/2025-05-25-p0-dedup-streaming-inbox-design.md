# P0: message.complete 去重 + 流式 Markdown 增强 + Sidebar Live Badge

## 背景

Chat 页面的 `message.complete` 事件处理存在内容重复风险：streaming 阶段累积的文本被 append 到 message content，而 `payload.text`（gateway 权威最终文本）从未被使用。同时流式阶段使用纯文本渲染，缺少基本 markdown 格式。Sidebar 已有 unread badge 基础设施，但缺少 streaming 动画和 preview 实时更新。

## 修改范围

### 1. message.complete 去重（P0）

**文件**: `useChatInbox.ts`, `useChatIPC.ts`

在 `message.complete` handler 中：

- 丢弃未 flush 的 `pendingChunks`（清空 timer 和 buffer）
- 用 `payload.text` 整体替换最后一条 agent message 的 content
- 如果 `payload.text` 为空/缺失，回退到当前 streaming 累积文本
- 移除 `commitStreaming` 调用，改为 replace 语义

### 2. 流式 Markdown 增强（P0）

**新文件**: `src/renderer/src/components/StreamingMarkdown.tsx`

廉价正则 markdown 渲染器，处理：

- 围栏代码块（`...`）
- 粗体（`**text**`）
- 斜体（`*text*`）
- 行内 code（`` `code` ``）
- 换行（`\n` → `<br>`）

用 `dangerouslySetInnerHTML` 输出，避免 react-markdown 的 AST 解析成本。

**文件**: `MessageList.tsx`

- 将流式阶段的纯文本 `<div>` 替换为 `<StreamingMarkdown>`
- 传入 `streamingText` 作为 children

### 3. Sidebar Live Badge

**文件**: `SessionSidebar.tsx` / 对应 CSS

- `status === "streaming"` 时 StatusDot 添加 CSS 脉冲动画
- 样式: `@keyframes pulse` + green dot

**文件**: `useSessionManager.ts` — `getSidebarEntries()`

- preview 文本从 `tab.streamingText ?? lastMessage.content` 取值，确保流式阶段 preview 实时更新

**文件**: `Layout.tsx`

- 验证 tab switch 时 `unreadCount = 0` 清除逻辑（已有，确认生效）

## 不做的事

- 不做 `thinking.delta` / `reasoning.delta`（P1）
- 不做 interrupt 模式（P1）
- 不做 `tool.progress` 消息流展示（P1）
- 不做 segment 分段架构（P3）
- 不重构 `useChatIPC.ts`（主力是 `useChatInbox.ts`，但保持两处同步）

## 验证方式

- `npm run typecheck:web` 通过
- `npm test` 现有测试通过
- 手动验证：发送长消息，确认无重复内容
- 手动验证：流式阶段可见基本 markdown 格式
- 手动验证：切换 tab 后 sidebar badge 显示/消失正确
