# Hermes Visual IA Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build phase 1 of the Hermes Caduceus visual and information architecture redesign while preserving existing functionality.

**Architecture:** Split implementation into UI shell work, backend health data support, Chat message-flow components, and Model Control IA. The PM/Codex agent does not implement product code; `claude-dev` and `gemini-dev` implement on feature branches, and PM reviews every handoff against the spec.

**Tech Stack:** Tauri 2, Rust backend commands, React 19, TypeScript, Vitest, CSS domain files.

---

## Branching And Ownership

All implementation must use new branches. Do not develop on `main` or `marvis-op`.

Recommended branches:

- `feat/visual-ia-shell-chat` for `claude-dev`.
- `feat/runtime-health-model-control` for `gemini-dev`.

PM review branch:

- `design/hermes-visual-ia-redesign` contains the approved spec and this plan.

## Validation Commands

Run after each meaningful task:

```bash
npm run typecheck
npm test -- --runInBand
```

If `--runInBand` is not supported by Vitest in this repo, run:

```bash
npm test
```

Before handoff:

```bash
npm run lint
npm run typecheck
npm test
```

## File Map

Likely frontend files:

- `src/renderer/src/screens/Layout/Layout.tsx`: navigation consolidation and view composition.
- `src/renderer/src/screens/Home/Home.tsx`: create Card Hub Home.
- `src/renderer/src/screens/Chat/Chat.tsx`: integrate immersive layout changes without deep rewrite.
- `src/renderer/src/screens/Chat/MessageList.tsx`: render new event/message components.
- `src/renderer/src/screens/Chat/MessageRow.tsx`: assistant/user message visual updates.
- `src/renderer/src/screens/Chat/ToolGroupRow.tsx`: Tool Run merged card styling and behavior.
- `src/renderer/src/screens/Chat/ApprovalModal.tsx`: keep existing behavior; expose inline card path if already supported by state.
- `src/renderer/src/screens/Chat/ChatInput.tsx`: large floating composer visuals.
- `src/renderer/src/screens/ModelControl/ModelControl.tsx`: new primary model configuration screen.
- `src/renderer/src/assets/domains/tokens.css`: new soft desktop/card tokens.
- `src/renderer/src/assets/domains/layout.css`: shell/navigation styling.
- `src/renderer/src/assets/domains/chat.css`: message flow, Tool Run, goal bar, events, composer.
- `src/renderer/src/assets/domains/models.css`: Model Control styling or shared model settings styles.
- `src/renderer/src/lib/hermes-tauri.ts`: type wrappers for any new/changed Tauri commands.
- `src/renderer/src/shared/i18n/locales/*/navigation.ts`: new nav labels.

Likely backend files:

- `src-tauri/src/commands/utils.rs` or closest existing command module: runtime health/log summary command if needed.
- `src-tauri/src/config_utils.rs`: helpers for model config grouping if needed.
- `src-tauri/src/lib.rs`: register new Tauri commands if needed.
- `packages/hermes-core`: update only if existing helpers cannot provide the required config/log data.

## Task 1: Runtime Health Contract

Owner: `gemini-dev`

**Purpose:** Provide or confirm frontend-accessible data for Card Hub: runtime, gateway, MCP warning server names, latest error summary, and 1h/24h error counts.

**Files:**

- Inspect: `src/renderer/src/lib/hermes-tauri.ts`
- Inspect: `src-tauri/src/lib.rs`
- Inspect: `src-tauri/src/commands/*`
- Modify only if needed: Tauri command files and `hermes-tauri.ts`
- Test: existing Rust/TS tests if command behavior changes

- [ ] Step 1: Confirm existing command coverage.

  Check whether existing `runtime_health`, `gateway_status`, `list_mcp_servers`, and `read_logs` can produce:

  ```ts
  type HomeHealthSummary = {
    runtimeStatus: "Ready" | "Starting" | "Reconnecting" | "Failed" | "Stopped";
    gatewayRunning: boolean;
    mcp: {
      total: number;
      warningServers: Array<{ name: string; summary?: string }>;
    };
    errors: {
      lastHour: number;
      lastDay: number;
      latestSummary?: string;
    };
  };
  ```

  Return finding to PM if no backend change is required.

- [ ] Step 2: If needed, add a single aggregate command.

  Prefer one command named `home_health_summary` returning the shape above. Count warnings from log lines in `errors.log`, `agent.log`, and `mcp-stderr.log` conservatively. Do not include raw log dumps.

- [ ] Step 3: Add frontend wrapper.

  In `src/renderer/src/lib/hermes-tauri.ts`, add:

  ```ts
  export interface HomeHealthSummary {
    runtimeStatus: "Ready" | "Starting" | "Reconnecting" | "Failed" | "Stopped";
    gatewayRunning: boolean;
    mcp: {
      total: number;
      warningServers: Array<{ name: string; summary?: string }>;
    };
    errors: {
      lastHour: number;
      lastDay: number;
      latestSummary?: string;
    };
  }

  export function homeHealthSummary(): Promise<HomeHealthSummary> {
    return invoke("home_health_summary");
  }
  ```

- [ ] Step 4: Verify.

  Run:

  ```bash
  npm run typecheck
  npm test
  ```

- [ ] Step 5: Commit.

  ```bash
  git add src-tauri src/renderer/src/lib/hermes-tauri.ts
  git commit -m "feat: expose home runtime health summary"
  ```

## Task 2: Navigation Consolidation

Owner: `claude-dev`

**Purpose:** Replace the 15 peer nav items with Home, Chat, Agents, Model Control, Extensions, System while preserving reachability.

**Files:**

- Modify: `src/renderer/src/screens/Layout/Layout.tsx`
- Modify: `src/renderer/src/shared/i18n/locales/*/navigation.ts`
- Modify: `src/renderer/src/assets/domains/layout.css`
- Test: add/update Layout tests only if existing test harness covers navigation

- [ ] Step 1: Map old views to new groups.

  Use this exact mapping:

  ```ts
  type PrimaryView =
    | "home"
    | "chat"
    | "agents"
    | "modelControl"
    | "extensions"
    | "system";

  const PRIMARY_NAV = [
    { view: "home", labelKey: "navigation.home" },
    { view: "chat", labelKey: "navigation.chat" },
    { view: "agents", labelKey: "navigation.agents" },
    { view: "modelControl", labelKey: "navigation.modelControl" },
    { view: "extensions", labelKey: "navigation.extensions" },
    { view: "system", labelKey: "navigation.system" },
  ] as const;
  ```

- [ ] Step 2: Keep old screens reachable inside grouped views.

  Implement grouped view content as tabs/cards where needed:

  - Agents: existing Agents plus Persona access.
  - Model Control: new screen from Task 6.
  - Extensions: Skills, Plugins, Tools.
  - System: Gateway, Schedules, ConfigEditor, Settings.

- [ ] Step 3: Add i18n keys.

  Add at minimum:

  ```ts
  modelControl: "Model Control",
  extensions: "Extensions",
  system: "System",
  ```

  For Chinese locales, use clear equivalents:

  ```ts
  modelControl: "模型控制",
  extensions: "扩展",
  system: "系统",
  ```

- [ ] Step 4: Style the new navigation.

  Use the soft desktop style from the spec: low-contrast active row, no saturated blue default, traffic-light breathing space preserved.

- [ ] Step 5: Verify old functionality remains reachable manually.

  Check routes/views for: Chat, Sessions/search access, Agents, Persona, Models, Providers, Routing, Skills, Plugins, Tools, Schedules, Gateway, Config, Settings.

- [ ] Step 6: Run verification and commit.

  ```bash
  npm run typecheck
  npm test
  git add src/renderer/src/screens/Layout src/renderer/src/shared/i18n src/renderer/src/assets/domains/layout.css
  git commit -m "feat: consolidate primary navigation"
  ```

## Task 3: Card Hub Home

Owner: `claude-dev`

**Purpose:** Build default Home as Card Hub runtime console.

**Files:**

- Create: `src/renderer/src/screens/Home/Home.tsx`
- Modify: `src/renderer/src/screens/Layout/Layout.tsx`
- Modify: `src/renderer/src/assets/domains/layout.css` or create/import `home.css`
- Modify: `src/renderer/src/main.tsx` if adding a new CSS domain import
- Use: `homeHealthSummary()` wrapper from Task 1 or compose from existing APIs

- [ ] Step 1: Create Home component with startup load, 30s polling, and manual refresh.

  Component state should include loading, error, and `HomeHealthSummary`.

- [ ] Step 2: Render top health strip.

  Required cards:

  - Runtime status.
  - Gateway status.
  - MCP total/warning count.
  - Errors 1h.
  - Errors 24h.

- [ ] Step 3: Render abnormal MCP server names.

  If `warningServers.length > 0`, show names and one-line summaries. Do not show raw logs.

- [ ] Step 4: Render dual main cards.

  Left: runtime health and warnings.

  Right: continue chat/new chat entry. Chat entry is visible but not visually dominant over health.

- [ ] Step 5: Verify Home is default first screen in main layout.

  Starting `Layout` should show Home unless an explicit active chat/session state already selects Chat.

- [ ] Step 6: Run verification and commit.

  ```bash
  npm run typecheck
  npm test
  git add src/renderer/src/screens/Home src/renderer/src/screens/Layout src/renderer/src/assets src/renderer/src/main.tsx
  git commit -m "feat: add card hub home"
  ```

## Task 4: Immersive Chat Layout

Owner: `claude-dev`

**Purpose:** Make Chat immersive: hidden session drawer by default, no persistent right panel, large floating composer.

**Files:**

- Modify: `src/renderer/src/screens/Chat/Chat.tsx`
- Modify: `src/renderer/src/screens/Chat/SessionSidebar.tsx`
- Modify: `src/renderer/src/screens/Chat/ChatInput.tsx`
- Modify: `src/renderer/src/assets/domains/chat.css`

- [ ] Step 1: Hide session sidebar by default.

  Add or reuse state in Chat/Layout so session list opens as a drawer from a toolbar action. Do not delete session functionality.

- [ ] Step 2: Remove persistent right panel assumptions.

  Runtime/events should not occupy permanent layout width. Keep current functionality reachable through event rail or existing panels.

- [ ] Step 3: Style stream center column.

  Message content width should be bounded for readability. Use stable spacing and avoid large gaps.

- [ ] Step 4: Style ChatInput as large floating composer.

  Composer should support multiline input, attachments, slash commands, status, and send button. Height must be bounded; long input scrolls inside.

- [ ] Step 5: Verify.

  Test manual workflows:

  - New chat.
  - Switch session via drawer.
  - Send message.
  - Attach file.
  - Slash command menu.
  - Abort/running state.

- [ ] Step 6: Run verification and commit.

  ```bash
  npm run typecheck
  npm test
  git add src/renderer/src/screens/Chat src/renderer/src/assets/domains/chat.css
  git commit -m "feat: make chat layout immersive"
  ```

## Task 5: Tool Run And Inline Decision Cards

Owner: `claude-dev`

**Purpose:** Implement Balanced Tool Run visuals and inline approval/clarification cards.

**Files:**

- Modify: `src/renderer/src/screens/Chat/ToolGroupRow.tsx`
- Modify: `src/renderer/src/screens/Chat/MessageRow.tsx`
- Modify: `src/renderer/src/screens/Chat/ApprovalModal.tsx` or add `InlineApprovalCard.tsx` if cleaner
- Modify: `src/renderer/src/screens/Chat/InteractionCenter.tsx`
- Modify: `src/renderer/src/assets/domains/chat.css`
- Test: update `ToolGroupRow.test.tsx`, `ApprovalModal.test.tsx`, relevant message tests

- [ ] Step 1: Preserve grouping behavior.

  Do not regress current behavior: single tool call may be a transient footprint; continuous similar tool calls merge into a table.

- [ ] Step 2: Render Balanced table columns.

  Minimum columns:

  - Tool name.
  - Key parameter summary.
  - Status.
  - Duration.

- [ ] Step 3: Elevate failures.

  Failed rows should show error summary and visual warning style. Full output remains folded.

- [ ] Step 4: Inline approval card.

  Approval requests should render in the message stream under the active assistant turn. Keep existing modal fallback if needed, but the primary phase 1 path should be inline.

- [ ] Step 5: Inline clarification card.

  Clarification questions should render as blocking inline cards with choices or free-text affordance, reusing existing `tui_clarify_respond`.

- [ ] Step 6: Run focused tests.

  ```bash
  npm test -- src/renderer/src/screens/Chat/ToolGroupRow.test.tsx
  npm test -- src/renderer/src/screens/Chat/ApprovalModal.test.tsx
  npm run typecheck
  ```

- [ ] Step 7: Commit.

  ```bash
  git add src/renderer/src/screens/Chat src/renderer/src/assets/domains/chat.css
  git commit -m "feat: add balanced tool run cards"
  ```

## Task 6: Chat Events And Goal Bar

Owner: `claude-dev`

**Purpose:** Add visual treatment for `/goal`, model switch, `/steer`, and system error events.

**Files:**

- Inspect: `src/renderer/src/screens/Chat/systemEvents.ts`
- Inspect: `src/renderer/src/screens/Chat/tuiEvents.ts`
- Modify: `src/renderer/src/screens/Chat/MessageList.tsx`
- Modify: `src/renderer/src/screens/Chat/MessageRow.tsx`
- Create if needed: `src/renderer/src/screens/Chat/GoalBar.tsx`
- Create if needed: `src/renderer/src/screens/Chat/ChatEventRow.tsx`
- Modify: `src/renderer/src/assets/domains/chat.css`
- Test: existing system/tui event tests or add small render tests

- [ ] Step 1: Identify event representations.

  Confirm how goal, model switch, steer, and system errors arrive in chat transcript. If some events are not present yet, add visual support for the current closest representation and document gaps.

- [ ] Step 2: Implement `GoalBar`.

  Props:

  ```ts
  interface GoalBarProps {
    summary: string;
    progressLabel?: string;
  }
  ```

  Render compact pinned bar at top of chat content when active goal exists.

- [ ] Step 3: Implement event rows.

  Event variants:

  - `goal`
  - `model`
  - `steer`
  - `error`

  Use higher visual priority for `error`.

- [ ] Step 4: Wire into MessageList.

  `/goal set` appears in timeline and active goal also appears in `GoalBar`.

- [ ] Step 5: Verify manually.

  Use available commands or mocked transcript states to inspect:

  - goal visible while scrolling.
  - model switch row.
  - steer row.
  - system error row.

- [ ] Step 6: Run verification and commit.

  ```bash
  npm run typecheck
  npm test
  git add src/renderer/src/screens/Chat src/renderer/src/assets/domains/chat.css
  git commit -m "feat: add chat goal and event rows"
  ```

## Task 7: Model Control IA

Owner: `claude-dev` frontend with `gemini-dev` support if backend config helpers are needed.

**Purpose:** Replace separate Models/Providers/Routing primary entry with Model Control.

**Files:**

- Create: `src/renderer/src/screens/ModelControl/ModelControl.tsx`
- Reuse/inspect: `src/renderer/src/screens/Models/Models.tsx`
- Reuse/inspect: `src/renderer/src/screens/Providers/Providers.tsx`
- Reuse/inspect: `src/renderer/src/screens/Routing/Routing.tsx`
- Modify: `src/renderer/src/screens/Layout/Layout.tsx`
- Modify: `src/renderer/src/assets/domains/models.css`
- Modify: `src/renderer/src/lib/hermes-tauri.ts` only if new helpers are needed

- [ ] Step 1: Implement Model Control tabs.

  Tabs:

  - Runtime Model.
  - Providers.
  - Fallback.
  - Credentials.
  - Advanced YAML.

- [ ] Step 2: Runtime Model tab.

  Show and edit:

  - `model.provider`
  - `model.default`
  - `model.base_url`
  - `model.max_tokens`

- [ ] Step 3: Providers tab.

  Show built-in and custom providers. Preserve existing model discovery/import behavior if currently available.

- [ ] Step 4: Fallback tab.

  Show ordered `fallback_providers`. Preserve existing routing configuration behavior.

- [ ] Step 5: Credentials tab.

  Preserve credential pool and non-model API key management from the old Providers screen.

- [ ] Step 6: Advanced YAML tab.

  Link or embed existing ConfigEditor behavior for relevant config.

- [ ] Step 7: Verify functionality is not lost.

  Manual checklist:

  - Add/remove model.
  - Configure API key.
  - Configure custom endpoint.
  - Change default model.
  - Change fallback.
  - Access credential pool.
  - Access advanced YAML.

- [ ] Step 8: Run verification and commit.

  ```bash
  npm run typecheck
  npm test
  git add src/renderer/src/screens/ModelControl src/renderer/src/screens/Layout src/renderer/src/assets/domains/models.css src/renderer/src/lib/hermes-tauri.ts
  git commit -m "feat: add model control settings"
  ```

## Task 8: Final Visual Pass And Review Package

Owner: implementing agents create package; PM reviews.

**Purpose:** Ensure the phase 1 UI reads as one coherent product and meets the spec.

- [ ] Step 1: Run all checks.

  ```bash
  npm run lint
  npm run typecheck
  npm test
  npm run build
  ```

- [ ] Step 2: Capture screenshots.

  Capture at minimum:

  - Home Card Hub normal state.
  - Home Card Hub warning state.
  - Chat normal stream.
  - Chat with Tool Run.
  - Chat with goal bar and events.
  - Model Control.

- [ ] Step 3: Create review summary.

  Include:

  - Branch name.
  - Commits.
  - Changed files.
  - Test results.
  - Known gaps.
  - Screenshots or paths.

- [ ] Step 4: PM review.

  PM checks against:

  - `docs/superpowers/specs/2026-05-28-hermes-visual-ia-redesign.md`
  - This implementation plan
  - User constraints: no work on `main`/`marvis-op`, PM reviews only, functions preserved

## Scope Review

Covered:

- Navigation consolidation.
- Card Hub Home.
- MCP and error health.
- Immersive Chat.
- Tool Run cards.
- Inline approval/clarification.
- Goal bar and event rows.
- Model Control IA.

Deferred:

- Full settings redesign.
- Parchment/mythic theme.
- Complex user-facing tool detail switcher.
- Persistent right-side pending queue.
