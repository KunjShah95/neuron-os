# Cost Attribution — Design Spec

**Date:** 2026-06-05
**Status:** Draft
**Sprint:** 17 (from `implementation_plan.md`)
**Scope:** v1 — capture + rollups + CLI reports

## Context

The 20-sprint "Beyond Hermes" implementation plan calls for a `Cost Attribution & Agent Benchmarking` feature: `$/task`, `$/agent`, `$/day` with benchmark scores identifying cost spikes. Today, the project has scaffolded `src/billing/tracker.ts` and `src/telemetry/cost.ts` as 40–96 line stubs that:

- Store usage at `data/billing/usage.db` with columns `prompt_tokens, completion_tokens, cost_usd, model, session_id, timestamp`.
- Hardcode Gemini pricing (`$0.0035/$0.0105` per 1k) and a `$50` default budget.
- `generateReport()` returns a **mock** breakdown with hardcoded 70/20/10 percentages.
- Have **no LLM call-site integration**, **no real rollups**, **no CLI subcommand**, **no test coverage**.

This spec replaces those stubs with a real implementation. The reconciliation with the untracked scaffolding is described in §6.

## 1. Goals

1. **First-class token data** — every LLM call records `prompt_tokens`, `completion_tokens`, `agent_type`, `provider`, `model`, `duration_ms`, `session_id`, `call_purpose`, `project` to a SQLite store.
2. **USD derived, not stored** — pricing lives in a `model_pricing` table. USD is computed at query time. No hardcoded prices in code.
3. **Rollup queries** — by time window (hour/day/week), agent type, session. Top-N expensive single calls.
4. **CLI surface** — `aegis cost {today, week, agent, session, top, budget}`.
5. **Zero new external dependencies** — uses the existing `bun:sqlite` driver and the Vercel AI SDK's existing `usage` field on results.

## 2. Non-Goals (v1)

- USD budget enforcement (block runs over budget). *Tracked for v2.*
- Anomaly detection / spike alerts. *Tracked for v2.*
- TUI dashboard panel. *Tracked for v2.*
- OTLP / OpenTelemetry export. *Tracked for v2.*
- Per-provider cost API integration (e.g., AWS Bedrock usage, Azure OpenAI usage endpoints).
- Multi-currency / FX.

## 3. Architecture

```
   ┌────────────────────┐
   │ LLM call sites     │
   │ (agent/engine.ts,  │
   │  modes/research,   │
   │  modes/plan, …)    │
   └─────────┬──────────┘
             │ import { trackedGenerateText } from "../ai/tracked"
             ▼
   ┌────────────────────┐
   │ src/ai/tracked.ts  │  ← single integration point
   │ trackedGenerateText│
   │ trackedChat        │
   └─────────┬──────────┘
             │ record({...})
             ▼
   ┌────────────────────┐
   │ src/telemetry/     │  ← storage + rollups
   │   cost-store.ts    │
   │   cost.ts (facade) │
   │                   │
   │  data/cost/        │
   │   usage.db         │
   └─────────┬──────────┘
             │ summarize(...)
             ▼
   ┌────────────────────┐
   │ src/cli/commands/  │  ← human interface
   │   cost.ts          │
   │                   │
   │ aegis cost {…}    │
   └────────────────────┘
```

## 4. Storage Schema

Single SQLite file at `data/cost/usage.db` (replaces the existing `data/billing/usage.db` location).

```sql
-- One row per LLM call
CREATE TABLE usage (
  id               TEXT PRIMARY KEY,
  ts               INTEGER NOT NULL,    -- unix ms
  session_id       TEXT,
  agent_type       TEXT,                -- canonical values: "build"|"plan"|"read"|"write"|"test"|"validate"|"review"|"debug"|"document"|"refactor"|"deploy"|"monitor"|"explore"|"main". Free-form string otherwise; matches `AgentTypeName` in `src/agent/agent-types.ts`.
  provider         TEXT NOT NULL,        -- "anthropic"|"openai"|"google"|...
  model            TEXT NOT NULL,        -- "claude-3-5-sonnet"|"gpt-4o"|...
  prompt_tokens    INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  duration_ms      INTEGER NOT NULL,
  call_purpose     TEXT,                 -- free text
  project          TEXT
);
CREATE INDEX idx_usage_ts       ON usage(ts);
CREATE INDEX idx_usage_agent_ts ON usage(agent_type, ts);
CREATE INDEX idx_usage_session  ON usage(session_id);
CREATE INDEX idx_usage_model    ON usage(model, ts);

-- Per-model pricing. NULL entries mean "pricing unknown; cannot compute USD".
CREATE TABLE model_pricing (
  model              TEXT PRIMARY KEY,
  provider           TEXT NOT NULL,
  prompt_per_1k      REAL,             -- USD per 1000 prompt tokens
  completion_per_1k  REAL,             -- USD per 1000 completion tokens
  updated_at         INTEGER NOT NULL
);

-- One row: global daily budget (in tokens, NOT USD).
-- Reason: tokens are the source of truth; USD depends on pricing we may not have.
CREATE TABLE budget (
  id                  TEXT PRIMARY KEY,    -- always 'global' in v1
  daily_token_limit   INTEGER NOT NULL
);
```

**USD is always derived:**
```
usd = (prompt_tokens / 1000)    * model_pricing.prompt_per_1k
    + (completion_tokens / 1000)* model_pricing.completion_per_1k
```
If either `prompt_per_1k` or `completion_per_1k` is `NULL`, the row's USD is `null` (not 0) and the rollup shows `?` to the user.

## 5. Module Structure

### 5.1 `src/telemetry/cost-store.ts` (new — moved from `src/billing/tracker.ts`)

Storage layer. Exports `CostStore` class with:

```ts
class CostStore {
  constructor(dbPath?: string)
  record(args: RecordArgs): void                 // inserts a usage row
  recordPricing(model: string, provider: string, promptPer1k: number | null, completionPer1k: number | null): void
  getPricing(model: string): ModelPricing | null
  getDailyBudget(): number                       // returns tokens/day, default 10_000_000
  setDailyBudget(tokens: number): void
  hasExceededBudget(): boolean                   // today's usage >= daily budget
}
```

Singleton export: `export const costStore = new CostStore()`.

### 5.2 `src/telemetry/cost.ts` (modified — facade)

Replaces today's mock `CostBenchmarking`. Exports **pure functions** that take a `CostStore` (or use the default) and return rollup objects. These are the only public API for the rest of the system.

```ts
export interface CallRecord { /* mirrors a usage row */ }
export interface RollupRow { ts: number; prompt_tokens: number; completion_tokens: number; usd: number | null; call_count: number }
export interface AgentRollupRow { agent_type: string; prompt_tokens: number; completion_tokens: number; usd: number | null; call_count: number }
export interface SessionRollupRow { session_id: string; prompt_tokens: number; completion_tokens: number; usd: number | null; call_count: number; started_at: number; ended_at: number }
export interface TopCall { id: string; ts: number; agent_type: string; model: string; prompt_tokens: number; completion_tokens: number; usd: number | null }

export function summarize(window: "hour"|"day"|"week", opts?: { since?: number; until?: number; agentType?: string }): RollupRow[]
export function summarizeByAgentType(opts?: { since?: number; until?: number }): AgentRollupRow[]
export function summarizeBySession(sessionId: string): SessionRollupRow | null
export function topExpensiveCalls(limit: number, opts?: { since?: number; until?: number }): TopCall[]
export function getBudgetStatus(): { tokensUsedToday: number; dailyTokenLimit: number; percentUsed: number }
export function formatUsd(usd: number | null): string    // "$0.0023" or "?" if null
export function formatTokens(n: number): string          // "1.2M" / "847k" / "234"
```

### 5.3 `src/ai/tracked.ts` (new)

Single integration point for LLM call-site instrumentation.

```ts
export interface CallContext {
  sessionId?: string
  agentType?: string                 // "build"|"test"|"review"|"ask"|"plan"|"research"|"mcp"|"ad-hoc"
  callPurpose?: string
  project?: string
}

export async function trackedGenerateText(
  opts: Parameters<typeof generateText>[0],
  ctx: CallContext = {},
): ReturnType<typeof generateText>

export async function trackedStreamText(
  opts: Parameters<typeof streamText>[0],
  ctx: CallContext = {},
): ReturnType<typeof streamText>

export async function trackedChat(
  // ... same shape
)
```

Each wrapper:
1. Captures `start = Date.now()` and resolves `provider` / `model` from `opts.model`.
2. Delegates to the underlying Vercel AI SDK function.
3. Reads `result.usage.{promptTokens, completionTokens}` (Vercel AI SDK field names).
4. Calls `costStore.record({...})`.
5. Returns the original result unchanged.

Provider detection: read `process.env.AEGIS_AI_PROVIDER` (already the convention in `multi-agent.ts:51`). Model: `String(opts.model.modelId ?? opts.model)`.

### 5.4 `src/cli/commands/cost.ts` (new)

```ts
export const costCommand = new Command("cost")
  .description("Inspect LLM token usage and cost attribution")
  .addCommand(costTodayCmd)         // totals today
  .addCommand(costWeekCmd)          // totals last 7 days, by day
  .addCommand(costAgentCmd)         // per agent type over last 7 days
  .addCommand(costSessionCmd)       // per-session breakdown
  .addCommand(costTopCmd)           // top N most expensive single calls
  .addCommand(costBudgetCmd)        // show budget status
  .addCommand(costSetBudgetCmd)     // set daily token budget
  .addCommand(costSetPricingCmd)    // set model pricing
```

Registered in `src/cli/commands/index.ts`.

Output formats: aligned tables for terminals, `--json` flag on every subcommand for machine-readable output.

Example output of `aegis cost today`:
```
Agent Type    | Calls | Prompt Tok | Compl Tok |   USD
--------------|-------|------------|-----------|--------
build         |    42 |    248,113 |    18,902 | $0.91
review        |    18 |     92,401 |     8,114 | $0.34
plan          |     3 |     14,802 |     2,401 | $0.05
--------------|-------|------------|-----------|--------
TOTAL         |    63 |    355,316 |    29,417 | $1.30

Budget: 8,500,000 / 10,000,000 tokens today (85% remaining)
```

### 5.5 `src/telemetry/cost.test.ts` (new)

Tests:
- `record()` persists a row and returns it.
- `summarize("day")` groups by day in the project's local timezone.
- `summarize("hour")` handles day-boundary correctly.
- `summarizeByAgentType()` returns one row per agent_type with summed tokens.
- `summarizeBySession()` returns a single rollup for the given session.
- `topExpensiveCalls(5)` returns 5 rows sorted by `prompt_tokens + completion_tokens` desc.
- USD is `null` when pricing is missing; non-null when pricing is set.
- `getDailyBudget()` returns 10_000_000 by default; `setDailyBudget` persists.
- `EXPLAIN QUERY PLAN` on each rollup query uses the indexes defined in §4.

## 5.6 `src/ai/tracked.test.ts` (new)

Tests (use a mocked `generateText` from the Vercel AI SDK to avoid real LLM calls):
- `trackedGenerateText` records one usage row with the right token counts.
- `trackedGenerateText` does not throw when `result.usage` is missing; records 0/0.
- `trackedGenerateText` returns the original result unchanged.
- `ctx.agentType` and `ctx.callPurpose` are persisted.
- `trackedStreamText` records once on stream completion, not per chunk.

## 6. Reconciliation with Existing Scaffolding

The plan's target file is `src/telemetry/cost.ts`. Today's scaffolding has both `src/billing/tracker.ts` (storage) and `src/telemetry/cost.ts` (mock facade). Decision:

| Existing | New state |
|---|---|
| `src/billing/tracker.ts` | **Moved → `src/telemetry/cost-store.ts`**, renamed `BillingTracker` → `CostStore`. `src/billing/` directory deleted. |
| `src/billing/usage.db` | **Migrated → `data/cost/usage.db`**. No data migration: existing rows are mock/empty; drop the file. |
| `src/telemetry/cost.ts` (`CostBenchmarking`) | **Replaced** with the new rollup facade in §5.2. The `CostBenchmarking` class is deleted. |
| Hardcoded Gemini prices | **Removed.** `model_pricing` table is empty by default; users set prices via `aegis cost set-pricing`. |
| `$50` USD budget | **Replaced** with `10,000,000` token/day default. Users set via `aegis cost set-budget`. |
| `generateReport()` mock | **Deleted.** Real SQL rollups in §5.2. |

Files deleted as part of this work:
- `src/billing/` (whole directory)
- `src/billing/tracker.ts`
- The old `src/telemetry/cost.ts` (replaced, not deleted; renamed content).

## 7. Call-Site Migrations

The wrapper is the *only* public LLM-call API going forward. Existing call sites that import `generateText`/`streamText` directly from `"ai"` are migrated to import from `"../ai/tracked"`. The wrapper re-exports the same types so call sites don't need to change their `opts` shape.

**Migration scope (v1 — required):**

| File | Function | Current | After |
|---|---|---|---|
| `src/agent/engine.ts` | `chat()` and `streamChat()` (the AgentEngine core loop) | `generateText` / `streamText` | `trackedGenerateText` / `trackedStreamText` with `ctx.agentType` from the engine's session name and `ctx.sessionId` from the engine's sessionId |
| `src/modes/research.ts` | `runResearchLoop` iteration | `generateText` | `trackedGenerateText` with `agentType: "main"` (research is invoked from the `main` agent) |
| `src/modes/plan/planner.ts` | `generatePlan` | `generateText` | `trackedGenerateText` with `agentType: "plan"` |
| `src/agent/multi-agent.ts` | `decomposeGoal` | `generateText` | `trackedGenerateText` with `agentType: "build"` |
| `src/experience/retrieval.ts` | (inference-time experience summary) | `generateText` | `trackedGenerateText` with `agentType: "main", callPurpose: "experience-summary"` |

Out of v1 scope: `src/agent/test-*.ts`, `src/modes/agentmemory.ts`, `src/modes/skills.ts`, `src/agent/agent-tools.ts` — call sites are test/demo code and don't represent production spend. New code must use the wrapper.

## 8. Default Pricing

`model_pricing` is empty by default. We do **not** ship a default price list because prices change and outdated numbers cause real budget miscalculations. Users set prices via:

```
aegis cost set-pricing <model> --provider <p> --prompt <usd> --completion <usd>
```

The first time the user runs `aegis cost today`, the CLI prints a hint: `No pricing configured for 5 models. Run 'aegis cost set-pricing <model> --provider <p> --prompt <usd> --completion <usd>' to enable USD display.`

## 9. Migration Plan (Implementation Order)

1. Create `src/telemetry/cost-store.ts` (CostStore + schema + new `usage` and `model_pricing` tables).
2. Delete `src/billing/`.
3. Replace `src/telemetry/cost.ts` with the new facade.
4. Add `src/ai/tracked.ts` (wrapper).
5. Migrate the 5 call sites in §7.
6. Add `src/cli/commands/cost.ts` and register in `src/cli/commands/index.ts`.
7. Add `src/telemetry/cost.test.ts` and `src/telemetry/cost-store.test.ts`.
8. Update `package.json` `test` script if needed.
9. Run `bun run typecheck` and `bun run test`.

## 10. Risks and Open Questions

- **Risk: Vercel AI SDK's `usage` field shape varies by version.** The code reads `result.usage.promptTokens` and `result.usage.completionTokens`. We pin the SDK to a known version in `package.json`. If the shape changes, `costStore.record` should log a warning and record `0` for unknown fields rather than throw.
- **Risk: clock skew across hosts.** `ts` is captured at the call site (Bun process clock), not from provider headers. v1 acceptable.
- **Open question: streamText usage reporting.** Vercel AI SDK's `streamText` reports final usage on the stream end. The wrapper awaits `result.usage` and records then. Acceptable.
- **Open question: provider detection from model objects.** Different providers expose `model.modelId` differently. The wrapper falls back to `String(opts.model)` and logs unknown providers at `info` level. No throw.

## 11. Out of Scope (Future Work)

- **v2 — Budget enforcement:** `costStore.hasExceededBudget()` is wired in v1 but no consumer aborts runs. v2 adds a `cost-budget.ts` policy and `aegis cost set-budget` semantics.
- **v2 — Anomaly detection:** z-score vs. rolling 7-day baseline; `aegis cost spikes`.
- **v2 — TUI panel:** `aegis dashboard` shows a live cost card.
- **v2 — Per-provider cost API:** AWS Bedrock / Azure OpenAI usage endpoints.
- **v2 — ShareGPT export of `usage` rows for fine-tuning** (this overlaps with Sprint 20, which we will defer).
