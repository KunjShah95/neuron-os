# Mode Wiring & System Stabilization

**Date:** 2026-06-04
**Status:** Design

---

## Problem

The mode system has dead code (standalone `launcher.ts` TUI), the wakeup picker uses a hardcoded command list that duplicates mode registry data, agentmemory mode is registered but missing from the picker, the API server uses a custom hand-rolled validation DSL instead of Zod, and there's no `aegis config validate` CLI command.

## Scope

Four interconnected changes:

1. **Mode system cleanup** — remove dead `launcher.ts`, unify the command catalog with the mode registry
2. **Wakeup picker auto-discovery** — derive command list from `listModes()` + extras, auto-generate help text
3. **API server Zod validation** — replace custom `validateBody()` with per-endpoint Zod schemas
4. **Config validate command** — add `aegis config validate` subcommand

## Design

### 1. Mode System Cleanup

**Delete** `src/modes/launcher.ts` — `runModeLauncher()` is exported but never imported by any module. The wakeup clack-picker is the active entry point.

### 2. Wakeup Picker Auto-Discovery

In `src/cli/wakeup.ts`:

- Derive the main command list from `listModes()` (from the mode registry)
- Define a small `nonModeCommands` list for commands that aren't TUI modes (ask, plan, agent-run, telegram)
- Combine them: `const COMMANDS = [...modeCommands, ...nonModeCommands]`
- Generate help text from the same combined list

This means agentmemory (and any future mode) appears in the picker automatically. No manual sync.

### 3. API Server Zod Validation

In `src/api/server.ts`:

- Remove the `ValidationRule` type and `validateBody()` function
- Define per-endpoint Zod schemas at the top of the file or inline
- Replace `validateBody(body, [...rules])` calls with `schema.parse(body)`
- Keep existing rate limiting, CORS, security headers, and WebSocket code unchanged

Schemas needed:
- `SpawnAgentSchema` — name (required, alphanumeric), type (optional), script (optional)
- `TaskGoalSchema` — goal (required, 1-4000 chars)
- `MemoryContentSchema` — content (required, 1-50000 chars)
- `MemoryQuerySchema` — query (required, 1-1000 chars)

### 4. Config Validate Command

In `src/cli/commands/config.ts`:

- Add a `validate` subcommand
- Load config from disk, run `AppConfigSchema.safeParse()` on it
- If valid: print success message
- If invalid: print each issue with path and message

## Files Changed

| File | Change |
|------|--------|
| `src/modes/launcher.ts` | **Delete** — dead code |
| `src/modes/index.ts` | Remove `runModeLauncher` export |
| `src/cli/wakeup.ts` | Auto-discover from registry + generate help text |
| `src/api/server.ts` | Replace `validateBody()` with Zod schemas |
| `src/cli/commands/config.ts` | Add `validate` subcommand |
| `docs/superpowers/specs/2026-06-04-mode-wiring-and-stabilization-design.md` | This document |

## Trade-offs

- **Deleting launcher.ts**: If a raw TTY mode selector is wanted later, rebuild it from the registry. The registry is the single source of truth — any new launcher reads from it.
- **Zod in API**: Adds a dependency that's already present (used in `src/config.ts`). Removes the maintenance burden of a parallel validation DSL.
- **Auto-discovered picker**: Non-mode commands (ask, plan, agent-run, telegram) still need manual listing in the extras array. These are stable and rarely change.
