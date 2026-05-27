# Multi-Agent Git Collaboration Protocol

为了支持多个 Agent（如 Stability Agent, UI Agent, State Agent）高效并行协作，本项目采用 **Git Worktree-based Isolation** 策略。

## 1. 核心原则：工作区隔离

当多个 Agent 同时运行时，**绝对禁止**在同一个目录（Working Directory）内切换分支。这会导致文件锁冲突、构建缓存污染以及上下文混乱。

### 推荐方案：Git Worktree
`git worktree` 允许你在不同的目录中同时检出同一个仓库的不同分支，共享底层的 `.git` 对象库。

**设置流程：**
```bash
# 假设你在项目根目录 hermes-caduceus
# 为 UI Agent 创建独立的工作空间
git worktree add ../hermes-ui-agent -b feat/ui-smoothness

# 为 Stability Agent 创建独立的工作空间
git worktree add ../hermes-stability-agent -b feat/runtime-stability
```

## 2. 分支命名规范

所有 Agent 检出的分支必须遵循以下格式：
`agent/<agent-id>/<task-slug>`

*   **agent-id**: 标识哪个 Agent 正在工作（如 `stability`, `ui`, `event`）。
*   **task-slug**: 简短的任务描述（如 `fix-mutex-deadlock`, `smooth-scroll`）。

**示例：**
*   `agent/stability/harden-tui-gateway`
*   `agent/ui/gateway-status-indicator`

## 3. 协作流程 (Orchestration)

1.  **任务分配 (Dispatching)**: 用户或“主控 Agent”阅读 `docs/collab/` 中的指南，确定任务范围。
2.  **环境准备 (Setup)**:
    *   创建一个新分支。
    *   (可选) 使用 `git worktree` 准备独立目录。
3.  **独立执行 (Execution)**: Agent 在其专属目录和分支中进行 Research -> Strategy -> Execution 循环。
4.  **原子提交 (Committing)**: Agent 完成任务并通过验证后，提交代码。
    *   提交信息应包含该 Agent 的标识。
5.  **同步与合并 (Integration)**:
    *   通过 Pull Request 或手动 `git merge` 合并回 `main`。
    *   主控目录执行 `git pull` 同步。

## 4. 冲突处理

*   **代码冲突**: 如果两个 Agent 修改了同一个文件，在合并回 `main` 时通过标准的 Git 冲突解决流程处理。
*   **资源冲突**: 多个 Agent 运行时，如果都尝试启动同一个本地服务（如同一个端口的 Tauri 开发服务器），需要为不同 Agent 配置不同的环境变量（如 `PORT=1421`）。

---

*Last Updated: 2026-05-27*
