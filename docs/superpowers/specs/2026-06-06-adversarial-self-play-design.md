# Adversarial Self-Play — Design Spec

**Date:** 2026-06-06
**Status:** Draft
**Scope:** v1.x — red-team agent type, finding ratchet, adversarial eval generator

## Context

Your ROADMAP names "adversarial self-play" as a v1.x bet. The pattern: red-team agents (different model, different SOUL) attack the main agent's outputs; failures are ratcheted into the regression suite. This is what closed the loop on RLHF — adversarial examples are the source of truth for "what the model gets wrong."

Hermes doesn't have it. CheetahClaws doesn't have it. ClawCode mentions "experience-based evolution" but doesn't formalize it. This is a real differentiator for Aegis.

This spec adds:
1. A red-team agent type with an "adversarial" SOUL
2. Auto-spawn on completion: when any agent emits a final answer, optionally spawn a red-team to attack it
3. Finding classification: `correctness`, `security`, `performance`, `completeness`, `style`
4. Ratchet: failures are written to the regression suite; the next time the same task runs, the new failure case is included
5. Cost-bounded: red-team pass is optional and budget-limited (default: 20% of main agent's cost)
6. Adversarial eval-task generator: for the benchmark suite, generate adversarial variants (mutate inputs, flip preconditions)

## 1. Goals

1. **Red-team agent type** — a new agent type with a default "adversarial" SOUL
2. **Auto-spawn on completion** — post-completion hook fires the red-team when `adversarial.enabled: true`
3. **Finding classification** — typed findings with severity + reproduction + suggested fix
4. **Ratchet** — findings auto-added to the regression suite (cross-link with the RL spec)
5. **Cost-bounded** — `cost_budget_ratio: 0.2` default; aborts and reports if exceeded
6. **Adversarial eval generator** — `aegis train adversarial generate --task <id> --count 5` — mutates task inputs to generate adversarial eval cases
7. **Dashboard widget** — surface high-severity findings immediately

## 2. Non-Goals (v1)

- Adversarial training of model weights (we generate adversarial *eval tasks*; Atropos/Ralph handles training)
- Real-time adversarial monitoring (this is post-hoc per task)
- Human-in-the-loop red-team (fully autonomous; humans review findings)
- Cross-organization red-team (single Aegis install only)
- Adversarial prompt extraction (focus on outputs, not on the model itself)

## 3. Architecture

```
  ┌────────────────────────────────────────────────────────┐
  │  Main agent completes task                             │
  │    emits { type: 'task_complete', result, run_url }   │
  └─────────────┬──────────────────────────────────────────┘
                │ if `adversarial.enabled: true`
                ▼
  ┌────────────────────────────────────────────────────────┐
  │  src/adversarial/                                      │
  │    - orchestrator.ts  (spawns red-team, collects)     │
  │    - red-team-agent.ts  (uses the new agent type)     │
  │    - findings-store.ts  (writes to ~/.aegis/adversarial/findings/)│
  │    - ratchet.ts  (converts findings to regression cases)│
  │    - generator.ts  (mutates task YAMLs)               │
  └────────────────────────────────────────────────────────┘
```

## 4. Schemas (Zod)

```ts
const Finding = z.object({
  id: z.string(),
  task_id: z.string(),
  session_id: z.string(),
  finding_type: z.enum(['correctness', 'security', 'performance', 'completeness', 'style']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string(),
  reproduction: z.string(),                    // minimal code/command
  reproduction_verified: z.boolean().default(false),
  suggested_fix: z.string().optional(),
  red_team_agent_id: z.string(),
  red_team_model: z.string(),
  ts: z.number(),
  ratcheted: z.boolean().default(false),
  ratchet_case_path: z.string().optional(),
})

const AdversarialConfig = z.object({
  enabled: z.boolean().default(false),
  red_team_agent_type: z.string().default('adversarial'),
  red_team_model: z.string().default('claude-opus-4-6'),  // intentionally different from main
  cost_budget_ratio: z.number().min(0).max(1).default(0.2),
  ratchet: z.boolean().default(true),
  classify_severity_threshold: z.enum(['low', 'medium', 'high']).default('medium'),
  notify_severity: z.enum(['medium', 'high', 'critical']).default('high'),
})
```

## 5. Adversarial Agent SOUL (default)

`skills/adversarial/SOUL.md`:

```markdown
# Adversarial Agent

You are a red-team AI. Your job is to find flaws in the work of other agents.

When given a task and a result, you MUST:
1. Try to break the result. Run it. Test edge cases. Look for off-by-one errors,
   race conditions, security holes, missing cases, unhandled errors, undefined behavior.
2. Classify each finding by type (correctness | security | performance | completeness | style)
   and severity (low | medium | high | critical).
3. Reproduce the issue with the minimum possible code/command. Verify the reproduction
   actually triggers the issue.
4. Suggest a fix if obvious. If not, just describe what's wrong.

You MUST NOT:
- Modify the original code.
- Open a PR.
- Continue the task as if you were the original agent.
- Pretend the work is fine. Find the flaws. That is your job.

Emit a JSON array of findings. Each finding has the schema described in your
system prompt. If you find nothing, emit `[]`.
```

## 6. Data Flow

1. Main agent completes task T with result R, emits `task_complete` event with the run URL
2. If `adversarial.enabled` (and budget allows): AdversarialOrchestrator spawns a red-team agent with input `{ task: T, result: R, original_trajectory_url }`
3. Red-team agent runs in an isolated worktree (reuses the existing `src/sandbox/docker.ts` patterns)
4. Red-team agent emits `Finding[]`
5. Orchestrator filters by `severity >= classify_severity_threshold`
6. For each surviving finding:
   - Log to `~/.aegis/adversarial/findings/<task_id>.jsonl`
   - If `ratchet: true`: invoke `ratchet.ts` to generate a regression case (a new `evals/regression/<task_id>-<finding_id>.yaml`); set `ratcheted: true` and `ratchet_case_path`
   - If `severity >= notify_severity`: post to configured gateway channel
7. Red-team agent exits

## 7. Ratchet Logic

```ts
async function ratchet(finding: Finding): Promise<string> {
  const caseYaml = `
id: regression-${finding.task_id}-${finding.id}
category: ${finding.finding_type}
description: "Adversarial finding from ${finding.task_id}"
input: |
  ${await findingToReproInput(finding.reproduction)}
expected_files: []
verification:
  - command: "${finding.reproduction}"
    expect_exit_code: 0
  - command: "${finding.reproduction}"
    expect_stderr_contains: "${finding.description.slice(0, 50)}"
timeout_ms: 60000
severity: ${finding.severity}
source: adversarial
finding_id: ${finding.id}
`
  const path = `evals/regression/${finding.task_id}-${finding.id}.yaml`
  await Bun.write(path, caseYaml)
  return path
}
```

The next time the task runs (manually or in CI), the eval runner picks up the new case. If the agent doesn't fix the issue, the eval fails.

## 8. Adversarial Eval Generator

```bash
aegis train adversarial generate --task <task_id> --count 5
```

Mutations applied to the task's `input:` field:

| Mutation | Example |
|---|---|
| `strip-precondition` | Remove a precondition (e.g., "assume n > 0" → test with n=0) |
| `flip-boolean` | Change a true → false in the input |
| `inject-malicious` | SQL injection, XSS, path traversal, etc. (security mutation) |
| `whitespace` | Tabs/spaces, BOM, zero-width chars |
| `concurrency` | Add "do this 100 times in parallel" |
| `overflow` | Huge inputs (10MB strings, n=2^31) |
| `unicode` | RTL markers, homoglyphs, confusables |
| `empty` | Empty string, empty array, null |

Generated variants are added as `evals/adversarial/<task_id>-<mutation>.yaml` and registered in the suite.

## 9. CLI

```bash
aegis adversarial enable                       # set enabled: true in config
aegis adversarial disable
aegis adversarial status                        # show recent findings
aegis adversarial findings [--since 7d] [--severity high]
aegis adversarial findings inspect <id>
aegis adversarial ratchet list                  # show all ratcheted cases
aegis adversarial ratchet revert <finding_id>   # manual revert
aegis train adversarial generate --task <id> --count 5
```

## 10. Error Handling

| Failure | Behavior |
|---|---|
| Red-team agent failure | Log; do not block main task |
| Finding reproduction fails (false positive) | Downgrade severity to `low`; mark `reproduction_verified: false` |
| Cost budget exceeded mid-attack | Emit partial findings with `incomplete: true` |
| Regression case generation fails | Keep finding in audit; surface to user |
| Ratchet case for a finding that was manually reverted | Skip on next run; re-check on each eval |
| Red-team emits malformed JSON | Re-prompt once; on second failure, mark `parse_error: true`, log |

## 11. Testing

**Unit:**
- Finding classification logic (type + severity from free-text description)
- Severity threshold filtering
- Ratchet logic (generates a valid eval YAML)
- Adversarial eval generator mutations (each mutation type produces a valid case)

**Integration:**
- Known-buggy code → adversarial agent finds the bug → finding ratcheted
- False positive (the reproduction doesn't trigger) → severity downgraded
- Budget exceeded mid-run → partial findings emitted
- Ratchet case for an old finding → next eval run picks it up

**E2E:**
- Real task with an intentional bug → adversarial agent catches it → regression case added → next run of the same task fails the regression suite (proving the ratchet works)
- `aegis train adversarial generate --task coding-001 --count 5` produces 5 valid eval cases
- Dashboard widget shows a `critical` finding within 1 minute of the main task completing

## 12. Phasing

| Phase | PR | What |
|---|---|---|
| 1 | `feat(adversarial): Finding schema + AdversarialConfig + orchestrator` | Foundation |
| 2 | `feat(adversarial): adversarial agent type + default SOUL` | Agent |
| 3 | `feat(adversarial): ratchet into regression suite` | Cross-link with RL spec |
| 4 | `feat(adversarial): gateway notifications for high+ findings` | UX |
| 5 | `feat(train): adversarial eval generator (8 mutation types)` | Suite expansion |
| 6 | `feat(adversarial): dashboard widget` | UX |
| 7 | `docs(adversarial): user guide + SOUL customization` | User-facing |

## 13. Open Questions (for plan review)

- For the red-team model, default to Opus (different from main, but expensive). Alternative: use a local model (cheaper, weaker attacker). User picks.
- Should the adversarial agent have access to the main agent's full trajectory, or just the final result? Full trajectory = more signal, more expensive.
- For `severity: critical`, do we block the main task from being marked `success`? Currently the answer is "no, but we notify" — should we change this?
- For the eval generator, do we run the adversarial variant through the eval runner to verify it's actually adversarial (catches vacuous mutations)? Default: yes (proposed).
