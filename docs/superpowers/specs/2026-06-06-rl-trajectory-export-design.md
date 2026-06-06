# RL Trajectory Export & Evaluation — Design Spec

**Date:** 2026-06-06
**Status:** Draft
**Scope:** v1.x — Atropos-compatible trajectory export + benchmark CI

## Context

Aegis has rich runtime telemetry — every agent session is logged with tool calls, costs, latencies, and outcomes via the existing IPC and audit-log infrastructure (see `src/agent/agent-worker.ts` ReAct loop and the existing `data/cron-jobs.json` / `data/HEARTBEAT.md` patterns). What's missing is:

1. **Standardized trajectory export** — the format RL trainers (Atropos, the reference impl from Nous Research, used to train Hermes) expect
2. **A fixed benchmark suite** — so we can measure regressions on every PR, not just at release time
3. **Eval-driven development** — a CLI for running evals locally, with results that post back to PRs

The skills evolution spec (sibling) is the *upstream* source of trajectories; this spec is the *downstream* consumer and the benchmarking surface.

## 1. Goals

1. **TrajectoryRecorder** — wrap the agent loop, record every turn with full reasoning, tool calls, results, costs.
2. **Atropos-compatible exporter** — `aegis train export --format atropos --since 7d --output ./trajectories.jsonl`.
3. **Fixed benchmark suite** — 50 tasks (10 each in: coding, debugging, refactoring, web research, multi-agent coordination).
4. **EvalRunner** — replay a session against a different model and score the outcome via an LLM judge.
5. **Benchmark CI** — `.github/workflows/benchmark.yml` runs the suite on every PR, posts results as a comment, fails on >5% drop on any task.
6. **Append-only JSONL store** — `~/.aegis/trajectories/<session_id>.jsonl`, rotated monthly.

## 2. Non-Goals (v1)

- On-device training (we export; someone else trains; Atropos handles the loop)
- Multi-reward shaping (binary pass/fail for v1)
- Real-time eval during agent runs (only after-the-fact on PRs)
- Cross-PR regression tracking beyond the immediate run (use the BenchmarkReporter history file for now)
- Curriculum learning / automatic difficulty progression
- A web UI for browsing trajectories (CLI + JSONL is enough for v1)

## 3. Architecture

```
  ┌────────────────────────────────────────────────────────┐
  │  Agent loop (src/agent/agent-worker.ts)                │
  │    hooks: pre_message, post_message, pre_tool_call,    │
  │            post_tool_call, exit                        │
  └─────────────┬──────────────────────────────────────────┘
                │ emits TrajectoryEvent per hook fire
                ▼
  ┌────────────────────────────────────────────────────────┐
  │  src/training/recorder.ts                              │
  │    - subscribes to hook events                         │
  │    - writes to ~/.aegis/trajectories/<session>.jsonl   │
  │    - never blocks the agent loop (best-effort write)   │
  └─────────────┬──────────────────────────────────────────┘
                │ on demand / cron
                ▼
  ┌────────────────────────────────────────────────────────┐
  │  src/training/exporter.ts                              │
  │    - aegis train export --format atropos               │
  │    - bundles last N days into single .jsonl            │
  │    - emits Atropos-compatible schema                   │
  └────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────┐
  │  src/training/eval/                                    │
  │    - suite.ts    (50 fixed tasks)                      │
  │    - runner.ts   (replay + judge)                      │
  │    - judge.ts    (LLM judge + deterministic fallback)  │
  │    - reporter.ts (PR comment + history file)           │
  └────────────────────────────────────────────────────────┘
```

## 4. TrajectoryEvent Schema (Zod, internal)

```ts
const TrajectoryEvent = z.discriminatedUnion('type', [
  z.object({ type: 'session_start', ts: z.number(), session_id: z.string(), agent_type: z.string(), goal: z.string() }),
  z.object({ type: 'user_turn',     ts: z.number(), session_id: z.string(), content: z.string() }),
  z.object({ type: 'assistant_turn',ts: z.number(), session_id: z.string(), content: z.string(), reasoning: z.string().optional() }),
  z.object({ type: 'tool_call',     ts: z.number(), session_id: z.string(), tool: z.string(), args: z.unknown() }),
  z.object({ type: 'tool_result',   ts: z.number(), session_id: z.string(), tool: z.string(), result: z.unknown(), duration_ms: z.number() }),
  z.object({ type: 'cost_record',   ts: z.number(), session_id: z.string(), prompt_tokens: z.number(), completion_tokens: z.number(), cost_usd: z.number(), model: z.string() }),
  z.object({ type: 'session_end',   ts: z.number(), session_id: z.string(), outcome: z.enum(['success', 'failure', 'abandoned']), reason: z.string().optional() }),
])
```

Internal format. The exporter converts this to Atropos format on output.

## 5. Atropos-Compatible Output Schema

Atropos expects:

```json
{
  "env": "aegis-agent-os",
  "session_id": "...",
  "model": "claude-sonnet-4-6",
  "prompt": [{"role": "user", "content": "..."}],
  "completion": [{"role": "assistant", "content": "...", "tool_calls": [...]}],
  "reward": 1.0,
  "info": {
    "tool_calls": [{"name": "web_search", "args": {...}, "result_summary": "..."}],
    "costs": {"prompt_tokens": 1234, "completion_tokens": 567, "cost_usd": 0.0123},
    "latency_ms": 4500,
    "session_id": "...",
    "agent_type": "build"
  }
}
```

The exporter is a streaming transformer: read internal JSONL → group by session_id → emit one Atropos record per session.

## 6. Benchmark Suite

50 tasks across 5 categories, 10 each. Each task is a self-contained YAML file in `evals/tasks/<category>/<task-name>.yaml`:

```yaml
id: coding-001
category: coding
description: "Implement a function that returns the n-th Fibonacci number using memoization"
input: |
  Write a TypeScript function `fib(n: number): number` that uses memoization
  and handles n=0 correctly. Save to /tmp/fib.ts.
expected_files:
  - /tmp/fib.ts
verification:
  - command: "bun run /tmp/fib.ts"
    expect_exit_code: 0
  - command: "bun -e 'import(\"./tmp/fib.ts\").then(m => { if (m.fib(10) !== 55) throw new Error(\"wrong\") })'"
    expect_exit_code: 0
timeout_ms: 120000
judge_prompt: |
  Score 1.0 if the file is correct and uses memoization, 0.0 otherwise.
  Output ONLY the score.
```

Categories:
- **coding** — write/implement a function or module
- **debugging** — given a buggy file, find and fix the bug
- **refactoring** — restructure existing code without changing behavior
- **web research** — answer a question that requires current information
- **multi-agent coordination** — spawn subagents and combine their output

## 7. EvalRunner

```ts
type EvalConfig = {
  suite: string                          // path to evals/
  model: string                          // model under test
  judge_model: string                    // LLM judge
  baseline?: string                      // path to previous run for regression detection
  output: string                         // path for results
}

async function run(config: EvalConfig): Promise<EvalReport> {
  const tasks = await loadSuite(config.suite)
  const results: EvalResult[] = []
  for (const task of tasks) {
    const result = await runTask(task, config)
    results.push(result)
  }
  const baseline = config.baseline ? await loadBaseline(config.baseline) : null
  const regressions = baseline ? detectRegressions(results, baseline, { threshold: 0.05 }) : []
  return { tasks, results, regressions, summary: summarize(results) }
}
```

Each `runTask`:
1. Spin up a fresh agent worker in a sandboxed working dir
2. Send the task's `input` as the user goal
3. Wait for the agent to declare done OR `timeout_ms` elapsed
4. Run the task's `verification` commands
5. If all pass → score 1.0 from verification; if any fail → ask the LLM judge to score
6. Capture full TrajectoryEvent log for the run

## 8. LLM Judge

```ts
async function judge(task: EvalTask, transcript: TrajectoryEvent[], output: string): Promise<number> {
  const response = await llm.complete({
    model: config.judge_model,
    system: 'You are an evaluation judge. Output ONLY a number between 0.0 and 1.0.',
    prompt: `Task: ${task.description}\n\nExpected: ${task.judge_prompt}\n\nAgent output:\n${output}\n\nTranscript summary:\n${summarizeTranscript(transcript)}`,
    maxTokens: 10,
  })
  const score = parseFloat(response.text.trim())
  return isFinite(score) && score >= 0 && score <= 1 ? score : 0
}
```

**Fallback chain** (if the judge model fails):
1. Retry once with the same model
2. Fall back to a different judge model (configured in `~/.aegis/eval.yaml` as `judge_model_fallback`)
3. Fall back to deterministic scoring: `1.0` if all verification commands pass, `0.0` otherwise
4. Mark as `eval_error` if all fail (does NOT count as regression)

## 9. BenchmarkReporter

Posts results to a GitHub PR via the workflow's `GITHUB_TOKEN`. Comment format:

```markdown
## Aegis Benchmark Results

**Suite:** v0.7.0-rc1 (50 tasks)
**Model under test:** claude-sonnet-4-6
**Judge:** claude-opus-4-6

| Category | Pass Rate | Δ vs baseline | Regressions |
|---|---|---|---|
| coding | 0.90 (9/10) | +0.00 | — |
| debugging | 0.80 (8/10) | -0.10 ⚠️ | debug-003 |
| refactoring | 0.70 (7/10) | +0.05 | — |
| web research | 0.90 (9/10) | +0.00 | — |
| multi-agent | 0.60 (6/10) | -0.10 ⚠️ | ma-005, ma-008 |
| **Total** | **0.78 (39/50)** | **-0.04** | **3** |

> ⚠️ 3 regressions exceed the 5% threshold. CI check failed.

<details>
<summary>Per-task details</summary>
...
</details>
```

History is appended to `.github/benchmark-history.jsonl` (committed by the workflow) so trends can be tracked.

## 10. CLI Surface

```bash
aegis train status                        # show recorder state, last export, disk usage
aegis train export --format atropos --since 7d --output ./trajectories.jsonl
aegis train export --format jsonl --session <id>  # single session in internal format
aegis train eval --suite ./evals --model <model> --judge <model> --output ./results.json
aegis train eval --suite ./evals --baseline ./previous-results.json --regression-threshold 0.05
aegis train suite list                    # list all tasks in the bundled suite
aegis train suite show <task-id>          # show task details
aegis train rotate                        # manually rotate the trajectories store
```

## 11. Error Handling

| Failure | Behavior |
|---|---|
| TrajectoryRecorder write failure (disk full) | Log to audit; continue session (do not block user); emit a "trajectory gap" marker in the JSONL |
| Exporter failure (corrupt input) | Skip corrupt lines; emit warning per line; produce best-effort output |
| EvalRunner timeout per task | Mark as `eval_error`; do NOT count as regression |
| Judge LLM failure (all fallbacks) | Mark as `eval_error`; do NOT count as regression |
| PR comment failure (workflow error) | Upload results as a workflow artifact; do not fail the workflow |
| Concurrent exporters | Mutex on `.export.lock`; second exporter waits or exits |

## 12. Testing

**Unit:**
- TrajectoryRecorder: subscribe to hooks, write JSONL, handle disk-full mock
- Exporter: round-trip (internal → Atropos → parse → assert equal)
- EvalRunner: load suite, run single task, score, detect regressions
- Judge: parse score, fallback chain
- Reporter: render Markdown comment

**Integration:**
- Feed a real session, export to Atropos, re-parse, assert fields match
- Benchmark CI runs end-to-end against a fixture (1 task in a fixture suite)
- Regression detection: feed two runs with a 10% drop, assert 1 regression flagged

**E2E:**
- PR triggers workflow → results comment posted (real GitHub API via test repo)
- `aegis train eval` on a local session produces a usable results.json

## 13. Phasing

| Phase | PR | What |
|---|---|---|
| 1 | `feat(training): TrajectoryRecorder + ~/.aegis/trajectories/` | Foundation |
| 2 | `feat(training): Atropos exporter` | External interop |
| 3 | `feat(training): 50-task benchmark suite` | Eval surface |
| 4 | `feat(training): EvalRunner + LLM judge + fallback chain` | Run evals |
| 5 | `feat(training): BenchmarkReporter + GitHub PR comments` | CI integration |
| 6 | `ci: .github/workflows/benchmark.yml` | CI workflow |
| 7 | `docs(training): user guide + Atropos integration` | User-facing |

## 14. Open Questions (for plan review)

- Where do the 50 benchmark tasks come from in the first place? Hand-curate (10 per category) vs. harvest from real sessions + anonymize. Hand-curate is safer for reproducibility.
- Should the baseline be the last successful `main` run, or a pinned version (e.g., v0.7.0)? Pinned is more reproducible; `main` is more current.
- For the judge model, fixed (e.g., always `claude-opus-4-6`) or per-PR (configurable via PR label)? Fixed is simpler; per-PR is more flexible.
- Should the suite live in the main repo (`evals/`) or a separate `aegis-evals` repo? Main repo is simpler; separate repo allows for larger suites without bloating the main one.
