# Tool-Level Economy + Cost Router — Design Spec

**Date:** 2026-06-06
**Status:** Draft
**Scope:** v1.x — per-tool pricing registry, cost router, public quality/USD leaderboard

## Context

Your ROADMAP names "tool-level economy" as a v1.x bet: agents bid for compute, pay for tool calls, track cost per task across providers. Today, Aegis has cost attribution per LLM call (from the cost-attribution spec), but no per-tool pricing, no cross-provider routing, and no public quality/USD leaderboard.

This spec adds:
1. Per-tool pricing registry (compute, API, I/O)
2. Cross-provider cost router that picks the cheapest viable path at runtime
3. Public cost/quality leaderboard (`aegis.bench/leaderboard`) — community runs the eval suite, posts `quality/USD` per provider
4. Budget-aware agents — `budget_usd: 0.05` on a task makes the agent self-throttle
5. Dry-run cost estimation — see the cost before paying

## 1. Goals

1. **Tool pricing registry** — every tool has `{ compute_usd, api_usd, io_usd, latency_p50_ms, latency_p99_ms }` in `~/.aegis/tool_pricing.yaml`
2. **Cost router** — `aegis run --task X --budget 0.05` finds the cheapest viable provider/model combination
3. **Budget enforcement** — agent self-throttles: skips optional tool calls when budget is tight; aborts when the planned next step exceeds the remaining budget
4. **Public leaderboard** — `aegis.bench/leaderboard` aggregates community-run eval results
5. **Quality/USD scoring** — `leaderboard show --category coding --provider anthropic` shows `quality: 0.92, cost: 0.08 USD/task, ratio: 11.5`
6. **Per-task USD prediction** — `aegis run --task X --dry-run` shows `estimated_cost: { cheap, balanced, premium }`

## 2. Non-Goals (v1)

- On-chain payments (real money, not crypto)
- Multi-currency / FX
- SaaS cost-optimization for the user (this is agent-level, not user-billing)
- Forecasting (we measure actual; forecasting is a different ML problem)
- Auto-tuning tool prices (prices are user/maintainer-curated; auto-tuning is a v2 research bet)
- Spot pricing / dynamic provider rates (prices are static; refresh monthly via `aegis pricing refresh`)

## 3. Architecture

```
  ┌────────────────────────────────────────────────────────┐
  │  ~/.aegis/tool_pricing.yaml                            │
  │    tools:                                             │
  │      web_search:                                      │
  │        api_usd: 0.001                                 │
  │        latency_p50_ms: 800                            │
  │      execute_code:                                    │
  │        compute_usd_per_second: 0.00001                │
  │      vision_analyze:                                  │
  │        api_usd: 0.002                                 │
  │    models:                                            │
  │      claude-sonnet-4-6:                              │
  │        prompt_usd_per_1k: 0.003                       │
  │        completion_usd_per_1k: 0.015                   │
  │        quality_tier: balanced                         │
  └─────────────┬──────────────────────────────────────────┘
                │
                ▼
  ┌────────────────────────────────────────────────────────┐
  │  src/economy/                                          │
  │    - pricing-registry.ts   (load + cache + refresh)   │
  │    - cost-router.ts        (cheapest viable path)     │
  │    - budget-guard.ts       (in-loop query + enforce)  │
  │    - predictor.ts          (dry-run estimation)       │
  │    - leaderboard-client.ts (POST run results)         │
  └────────────────────────────────────────────────────────┘
```

## 4. Schemas (Zod)

```ts
const ToolPricing = z.object({
  tools: z.record(z.string(), z.object({
    api_usd: z.number().nonnegative().optional(),
    compute_usd_per_second: z.number().nonnegative().optional(),
    io_usd_per_mb: z.number().nonnegative().optional(),
    latency_p50_ms: z.number().nonnegative().optional(),
    latency_p99_ms: z.number().nonnegative().optional(),
    provider_specific: z.record(z.string(), z.object({
      api_usd: z.number().optional(),
    })).optional(),
  })),
  models: z.record(z.string(), z.object({
    prompt_usd_per_1k: z.number().nonnegative(),
    completion_usd_per_1k: z.number().nonnegative(),
    context_window: z.number().int().positive(),
    quality_tier: z.enum(['cheap', 'balanced', 'premium']),
    benchmark_score: z.number().min(0).max(1).optional(),  // from leaderboard
  })),
})

const CostEstimate = z.object({
  cheap: z.number(),
  balanced: z.number(),
  premium: z.number(),
  selected: z.enum(['cheap', 'balanced', 'premium']),
  selected_model: z.string(),
  reasoning: z.string(),
})

const BudgetStatus = z.object({
  budget_usd: z.number(),
  spent_usd: z.number(),
  remaining_usd: z.number(),
  estimated_remaining_cost_usd: z.number(),
  over_budget: z.boolean(),
  recommendation: z.enum(['continue', 'skip_optional', 'abort']),
})
```

## 5. Cost Router Logic

```ts
async function route(task: Task, budget: number, minQuality = 0.7): Promise<Route> {
  const candidates = Object.entries(pricing.models)
    .filter(([name, m]) => m.benchmark_score === undefined || m.benchmark_score >= minQuality)
    .map(([name, m]) => ({
      name,
      estimatedCost: estimateCost(task, m),
      meetsQuality: (m.benchmark_score ?? 0.8) >= minQuality,
    }))
    .filter(c => c.meetsQuality && c.estimatedCost <= budget)
    .sort((a, b) => a.estimatedCost - b.estimatedCost)
  if (candidates.length === 0) {
    throw new NoViableProviderError(`No provider meets quality ≥${minQuality} within budget $${budget}`)
  }
  return candidates[0]
}
```

Quality threshold: each task in the benchmark suite has a `min_quality: 0.7` field; the router only considers providers whose `benchmark_score` is above that threshold for the task's category.

## 6. Budget Guard (in-loop)

The agent, mid-run, can query the budget guard:

```ts
const status = await budgetGuard.status()
return {
  budget_usd: 0.05,
  spent_usd: 0.032,
  remaining_usd: 0.018,
  estimated_remaining_cost_usd: 0.025,
  over_budget: false,
  recommendation: 'skip_optional',  // or 'continue' or 'abort'
}
```

The agent uses this to decide:
- `continue` — keep executing the planned next steps
- `skip_optional` — drop optional verification, doc generation, etc.
- `abort` — stop, emit a partial result with `budget_exceeded: true`

The guard is queried via a new `aegis_budget` pseudo-tool that the agent can call any time.

## 7. Public Leaderboard

`aegis.bench/leaderboard` is a static site generated from community-submitted eval results. Submission is opt-in (`--public` flag).

**Submission payload:**
```json
{
  "run_id": "uuid",
  "aegis_version": "0.7.0",
  "model": "claude-sonnet-4-6",
  "provider": "anthropic",
  "suite_version": "v1",
  "category_scores": {
    "coding": 0.90,
    "debugging": 0.80,
    "refactoring": 0.70,
    "web_research": 0.90,
    "multi_agent": 0.60
  },
  "total_cost_usd": 4.20,
  "total_tasks": 50,
  "submitted_at": 1749200000,
  "submitter_github": "kunjshah95",
  "git_hash": "abc123"
}
```

**Per-category `quality/USD` score:**
```
ratio = category_score / (total_cost_usd / 50)
```

**Submission flow:**
1. `aegis bench submit --run-id <id> --public` collects the run's data from the local store
2. Scrubs secrets via the existing audit-log scrubber
3. POSTs to `aegis.bench/leaderboard/api/submissions` (HMAC-authenticated with a per-user key from `aegis.bench/login`)
4. Leaderboard site re-generates on submission (or nightly)

**Static site generator:** a separate tool (`aegis.bench/cli`) reads `submissions.jsonl`, computes per-provider-per-category scores, generates a static site (Astro or similar).

## 8. CLI

```bash
aegis pricing list                              # show all tool + model pricing
aegis pricing set <tool> <field> <value>        # update
aegis pricing refresh                           # fetch latest from providers (where APIs exist)
aegis run --task X --budget 0.05 --dry-run      # show cost estimate
aegis run --task X --budget 0.05                # actually run with cost router
aegis run --task X --quality-min 0.85           # require higher quality
aegis bench submit --run-id <id> --public
aegis bench leaderboard [--category coding] [--provider anthropic]
aegis bench login                                # auth with aegis.bench
```

## 9. Error Handling

| Failure | Behavior |
|---|---|
| No provider meets quality threshold | Abort with clear error showing the threshold + the candidates |
| Pricing data stale (>30 days) | Warn; suggest `aegis pricing refresh` |
| Budget exceeded mid-run | Emit partial result; mark `budget_exceeded: true` |
| Leaderboard submission failure (network) | Retry with backoff; queue locally; submit on next `aegis bench submit` |
| Public submission contains secrets | Scrub with the existing audit-log scrubber; reject if scrubbing fails |
| Quality data missing for a provider | Fall back to model family default; warn |
| Cost estimate wildly wrong (actual > 3× estimate) | Surface in the run report; do not auto-adjust |

## 10. Testing

**Unit:**
- Pricing registry load + cache + refresh
- Cost router selection (3 candidates, varying quality + cost)
- Budget guard (50%, 80%, 100% spend → correct recommendations)
- Predictor (dry-run estimate within ±30% of actual on a fixture)

**Integration:**
- Simulated task with 3 candidate providers → router picks the cheapest that meets quality
- Budget guard at threshold transitions
- Leaderboard submission end-to-end (mock server)

**E2E:**
- `aegis run --dry-run` shows realistic cost estimate (within ±30% of actual on a real task)
- `--budget 0.01` aborts a task that would cost $0.05, with clear `budget_exceeded` reporting
- `aegis bench submit` posts to a mock leaderboard; payload is correctly shaped

## 11. Phasing

| Phase | PR | What |
|---|---|---|
| 1 | `feat(economy): ToolPricing schema + registry + bundled defaults` | Foundation |
| 2 | `feat(economy): cost router + dry-run predictor` | Routing |
| 3 | `feat(economy): budget guard + in-loop query (aegis_budget tool)` | Self-throttling |
| 4 | `feat(economy): leaderboard client + submission` | External interop |
| 5 | `ci: aegis.bench/leaderboard static site generator` | Public surface |
| 6 | `docs(economy): user guide + cost-tuning playbook` | User-facing |

## 12. Open Questions (for plan review)

- For quality thresholds, do we default to leaderboard-based (only consider providers with published scores) or self-declared (let users set their own threshold per task class)? Default: leaderboard-based with a fallback to self-declared.
- For the public leaderboard, do we accept anonymous submissions or require a GitHub-linked identity? Default: GitHub-linked (raises trust).
- Should `budget_usd: 0` be allowed (run for free, abort on first paid tool call)? Useful for "I just want to see what would happen" workflows. Default: yes (proposed).
- For cost router, do we always pick the cheapest, or expose a `--quality-vs-cost` flag for "give me the best quality for this budget"? Default: cheapest that meets quality.
