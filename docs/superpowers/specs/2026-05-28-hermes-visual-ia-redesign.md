# Hermes Caduceus Visual And IA Redesign

Date: 2026-05-28
Status: Draft approved for planning
Branch: `design/hermes-visual-ia-redesign`

## Purpose

Hermes Caduceus is the desktop front desk for `hermes-agent`. The redesign should absorb Marvis's low-noise card texture without copying its layout. Hermes is more complex than Marvis: its core experience is streaming chat with frequent tool calls, approvals, clarification questions, model changes, steering events, goals, MCP failures, and runtime errors.

The first phase optimizes the product around that reality:

- Default first screen is a Card Hub status console.
- Chat is an immersive message workbench.
- Tool calls are grouped as low-noise evidence, not separate noisy messages.
- `/goal` stays visible for the whole session.
- Model/provider/routing configuration is reorganized around Hermes `config.yaml`.

## Visual Direction

Use a soft desktop style:

- Warm off-white window canvas.
- Very low-contrast panel separation.
- Minimal saturated accent color.
- Subtle hairlines and restrained shadows.
- Cards use small radii, not bubbly decorative shapes.
- Text density stays practical for agent work.

Do not copy Marvis's sparse layout or office/task templates. Hermes should feel like an operator console with a quiet surface, not a consumer assistant clone.

## Navigation

Phase 1 replaces the current 15 peer navigation items with six primary entries:

1. **Home**: Card Hub status console.
2. **Chat**: immersive chat workbench.
3. **Agents**: profiles, persona, and agent runtime identity.
4. **Model Control**: runtime model, providers, fallback routing, credential pools, non-model API keys.
5. **Extensions**: skills, plugins, tools. Mostly display, filtering, and toggles.
6. **System**: gateway, schedules, logs, diagnostics, config, app settings.

Functionality must not be removed. The change is entry-point consolidation.

## Home: Card Hub

Home is the default first screen. It is a runtime status console, not a chat empty state.

Required content:

- Top health strip with runtime, gateway, MCP, and error counts.
- Low-frequency auto refresh, startup load, and manual refresh.
- Error counts for both 1h and 24h windows.
- MCP summary with abnormal server names when warnings exist.
- Recent error summary only when an error exists.
- Continue Chat / New Chat entry, but not as the dominant page.
- Runtime health, active model, gateway status, and recent sessions.

MCP display rule:

- Normal state: low-noise summary only.
- Warning state: show count and server names, plus one-line latest summary.
- Logs remain behind a detail action.

## Chat Workbench

Chat is the most important experience. It should be immersive.

Phase 1 chat layout:

- Session list hidden by default as a drawer.
- Runtime/events panel hidden by default.
- A narrow event rail may appear during tool activity, approvals, errors, or MCP warnings.
- Bottom input is a large floating composer with bounded height and internal scrolling.
- The composer supports attachments, slash commands, model/approval state, and running status.

Do not make the right panel or session sidebar persistent by default. The message stream gets priority.

## Message Flow

Message types:

- User message.
- Assistant streaming message.
- Tool Run evidence card.
- Approval card.
- Clarification card.
- Model switch event.
- `/steer` event.
- System error event.
- `/goal` event and persistent goal bar.

Streaming behavior:

- Assistant text streams inside one stable message container.
- Avoid layout jumps while text grows.
- Tool and approval cards attach to the relevant assistant turn.

## Tool Run Cards

Default tool display is **Balanced**.

Rules:

- Single tool calls use a lightweight transient footprint.
- Multiple continuous tool calls in one assistant turn merge into one Tool Run card.
- Repeated/similar tool calls render as a table.
- Show tool name, status, elapsed time, and key parameters.
- Extract user-meaningful parameters such as path, command, query, MCP server, status, or model.
- Full stdout/stderr, long JSON, long tables, and diffs are folded.
- Failed rows are visually elevated inside the table.

Verbose is for debugging only. Phase 1 does not need a complex user-facing detail-level switcher.

## Approvals And Clarifications

Phase 1 uses inline blocking cards.

- Approval requests appear under the active assistant turn.
- Clarification questions appear under the active assistant turn.
- These cards block the current run until answered.
- No right-side pending queue in Phase 1.

The right event rail can indicate pending work but should not become the main interaction surface.

## Session Goal

`/goal` is a first-class session element.

Design:

- When a goal exists, pin a compact goal bar at the top of the chat content area.
- The goal bar remains visible while scrolling.
- It shows goal title/summary and progress state if available.
- `/goal set` also appears as a lightweight event in the message timeline.

The bar should be visible enough to orient the session, but not tall enough to steal the chat.

## Events

Model switch event:

- Inline event row in the timeline.
- Shows previous model, new model, and key runtime detail such as max tokens or provider.
- May expose Undo if supported.

`/steer` event:

- Inline event row.
- Shows concise applied instruction summary.
- Detail opens on demand.

System error event:

- Inline event row with higher visual priority.
- Shows one-line summary and log action.
- Does not dump logs into chat by default.

## Model Control

Current Models, Providers, and Routing pages overlap and should be reorganized around Hermes `config.yaml`.

Model Control sections:

1. **Runtime Model**
   - `model.provider`
   - `model.default`
   - `model.base_url`
   - `model.max_tokens`

2. **Providers**
   - Built-in providers.
   - `providers.*` custom endpoints.
   - Per-provider model metadata such as context length.

3. **Fallback**
   - `fallback_providers` ordered fallback list.

4. **Credentials**
   - Credential pools.
   - `credential_pool_strategies`.
   - Non-model API keys that currently live near provider settings.

5. **Advanced YAML**
   - Direct `config.yaml` editing remains available for advanced users.

This should become a primary navigation item: **Model Control**.

## Extensions And System

These areas are lower priority for phase 1 visual design.

Extensions:

- Skills, plugins, and tools are mostly display/filter/toggle workflows.
- Keep them clean and consistent, but do not spend phase 1 effort on heavy redesign.

System:

- Gateway, schedules, logs, diagnostics, config, and app settings can be grouped.
- Settings pages will receive a separate future design pass.

## Implementation Phasing

Phase 1 scope:

1. New branch only. Do not develop on `main` or `marvis-op`.
2. Navigation consolidation.
3. Card Hub Home with runtime/MCP/error health.
4. Immersive Chat layout.
5. Tool Run merged card visuals.
6. Inline approval and clarification cards.
7. `/goal`, model switch, `/steer`, and system error event styles.
8. Model Control information architecture.

Defer:

- Full settings redesign.
- Complex configurable tool detail modes.
- Persistent right-side pending queue.
- Deep Chat.tsx decomposition beyond what implementation requires.
- Parchment/mythic theme implementation.

## Validation

Visual checks:

- Chat remains readable during long streaming output.
- Tool-heavy turns do not flood the timeline.
- Failed tools are visible without dumping logs.
- Goal bar remains visible but not dominant.
- Card Hub surfaces MCP and error health without becoming a log viewer.
- Model Control clearly replaces Models/Providers/Routing without hiding functions.

Technical checks:

- Existing features remain reachable.
- Existing Tauri APIs are reused where possible: `runtime_health`, `gateway_status`, `list_mcp_servers`, `read_logs`, `copy_diagnostics`, TUI approval/clarify commands.
- Work starts from a new feature branch.
