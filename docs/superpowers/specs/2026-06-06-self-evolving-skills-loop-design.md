# Self-Evolving Skills Loop — Design Spec

**Date:** 2026-06-06
**Status:** Draft
**Scope:** v1.x — close the Karpathy-delta loop, agentskills.io compatibility, Hub publishing

## Context

Aegis already has a skills system (`skills/` directory, `SKILL.md` files, `aegis skills` CLI, skills.sh API client). What's missing is the **closed learning loop** that Hermes Agent and the SKILLS.md/agentskills.io wave (Matt Pocock's skills, anthropics/skills, Addy Osmani's agent-skills — all crossing 100k+ stars) treat as the killer feature:

- The agent **creates** skills from successful tool-call patterns it discovers
- The agent **self-improves** skills in place when a failure shows them to be incomplete
- The agent **retires** skills whose regression suite starts failing
- Skills are **publishable** to the agentskills.io Hub with quality provenance

The Aegis ROADMAP already mentions "skill candidate extraction" and "auto-skill packaging" as v1.x bets. This spec makes that concrete.

## 1. Goals

1. **Skill candidate extraction** — a distillation cron job (default daily, 3am local) clusters recent successful tool-call sequences and emits `SkillCandidate` records.
2. **Quality gating** — every candidate must pass (a) an LLM-as-judge prompt AND (b) a regression suite of replay cases; pass threshold is judge=yes AND ≥8/10 replays succeed.
3. **Self-improvement during use** — when a skill invocation fails, the agent emits a `post_mortem` block; when it succeeds 3+ times with new evidence, the agent proposes a `patch` candidate.
4. **Retirement** — skills that fail the regression suite for 7 consecutive days move to `~/.aegis/skills/.archive/` and are kept 90 days for forensics.
5. **Hub publishing** — `aegis skills publish <name> --to agentskills-io` with provenance (author, version, evidence, quality score).
6. **`agentskills.io` compatibility** — Aegis skills follow the standard `SKILL.md` frontmatter (`name`, `description`, optional `metadata.hermes.tags`, `version`, `author`); installable from any agentskills.io Hub source.

## 2. Non-Goals (v1)

- Adversarial self-play (red-team agents) — v2, per ROADMAP
- Automatic cross-user skill sharing (publishing is opt-in; no implicit sharing)
- Skill marketplace payments (Hub free tier only; commercial licensing tracked separately)
- Auto-merge of skill patches from multiple sources (manual review required)
- Skill auto-loading into prompt context (existing progressive-disclosure behavior stays; tracked for UX improvements)

## 3. Architecture

```
  ┌────────────────────────────────────────────────────────┐
  │  Agent sessions (src/agent/agent-worker.ts)          │
  │  Hooks fire on: skill_invocation_success / failure     │
  └─────────────┬──────────────────────────────────────────┘
                │ append EpisodeRecord to session log
                ▼
  ┌────────────────────────────────────────────────────────┐
  │  src/skills/evolution/distiller.ts                     │
  │    - cron job (3am default)                            │
  │    - clusters similar tool-call sequences (n-gram +   │
  │      embedding cosine ≥ 0.85 over 3+ occurrences)     │
  │    - emits SkillCandidate → quality gate               │
  └─────────────┬──────────────────────────────────────────┘
                │
                ▼
  ┌────────────────────────────────────────────────────────┐
  │  src/skills/evolution/quality-gate.ts                  │
  │    - LLM-as-judge: "Is this a reusable workflow?"     │
  │    - Regression: replay 10 representative cases       │
  │    - pass = judge=yes AND ≥8/10 replays               │
  │    - on pass: write to ~/.aegis/skills/<name>/SKILL.md│
  │    - on fail: log rejection with diff to manifest     │
  └─────────────┬──────────────────────────────────────────┘
                │ approved candidate
                ▼
  ┌────────────────────────────────────────────────────────┐
  │  ~/.aegis/skills/                                      │
  │    <skill-name>/                                       │
  │      SKILL.md                                          │
  │      references/  (optional)                           │
  │      templates/   (optional)                           │
  │      scripts/     (optional)                           │
  │  .evolution_manifest.json  (provenance log)           │
  │  .archive/                (retired, 90d retention)    │
  └────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────┐
  │  src/skills/evolution/hub-client.ts                    │
  │    - browse / search / install from agentskills.io    │
  │    - publish <name> with provenance                    │
  │    - extends existing skills.sh API client            │
  └────────────────────────────────────────────────────────┘
```

## 4. Schemas (Zod)

```ts
const EpisodeRecord = z.object({
  session_id: z.string(),
  tool_call_id: z.string(),
  tool_sequence: z.array(z.string()),       // e.g. ["web_search", "web_extract", "write_file"]
  outcome: z.enum(['success', 'failure']),
  cost_usd: z.number(),
  latency_ms: z.number(),
  context_summary: z.string(),              // short user goal that triggered it
  ts: z.number(),
})

const SkillCandidate = z.object({
  id: z.string(),                           // uuid
  name: z.string().regex(/^[a-z0-9-]+$/),
  content: z.string(),                      // full SKILL.md
  evidence: z.array(EpisodeRecord),         // ≥3
  judge_verdict: z.enum(['pass', 'fail', 'skipped']).optional(),
  regression_results: z.array(z.boolean()).optional(),  // 10 entries
  status: z.enum(['pending', 'approved', 'rejected', 'retired']),
  created_at: z.number(),
  decided_at: z.number().optional(),
  rejection_reason: z.string().optional(),
})
```

## 5. Distiller Logic (pseudocode)

```ts
async function distill(since: number): Promise<SkillCandidate[]> {
  const episodes = await loadEpisodesSince(since)
  const clusters = clusterBySequence(episodes, { minSize: 3, minCosine: 0.85 })
  const candidates: SkillCandidate[] = []
  for (const cluster of clusters) {
    if (cluster.failureRate > 0.2) continue           // skip if mostly failing
    const skill = await synthesizeSkill(cluster)      // LLM call
    candidates.push({ id: uuid(), name: skill.name, content: skill.content, evidence: cluster.episodes, status: 'pending' })
  }
  return candidates
}
```

`clusterBySequence` is a 2-step cluster: first by exact `tool_sequence` (so "web_search → write_file" is one bucket), then by embedding cosine over `context_summary` within each bucket. Buckets with 3+ episodes and mean cosine ≥ 0.85 become a cluster.

## 6. Quality Gate

```ts
async function gate(c: SkillCandidate): Promise<Decision> {
  const judge = await llmJudge({
    prompt: judgePrompt(c),
    fallback: 'pass-on-regression-only',  // if judge times out, use regression only
    timeout_ms: 10_000,
  })
  const regression = await runRegression(c, { cases: 10, passThreshold: 0.8 })
  const passed = judge.verdict === 'pass' && regression.passRate >= 0.8
  return {
    passed,
    judge, regression,
    action: passed ? 'approve' : 'reject',
    diff: passed ? null : diffCandidate(c),
  }
}
```

Regression cases are pulled from the `evidence` episodes themselves (replay the original tool calls against the candidate's SKILL.md instructions). For each replay, an LLM judge scores: "Did the agent, given only this skill, produce an equivalent result?"

## 7. Self-Improvement (in-loop)

When an agent loads a skill (`skill_view` tool) and the outcome of using that skill is observed:

- **Failure** → emit `post_mortem` block to `~/.aegis/skills/<name>/.post_mortems/<date>.md`; if 3+ post-mortems accumulate on the same skill, the agent generates a `patch` candidate via `skill_manage` (uses `old_string`/`new_string` patch mode, not full replacement).
- **Success ×3 with new evidence** → if the new evidence shows a tool-call pattern not already in the skill, propose a `patch` candidate expanding the skill.
- **Patch candidates** go through the same Quality Gate (judge + regression).

The user can disable self-improvement per-agent-type via `AEGIS_SKILL_SELF_IMPROVE=0` env var (default on for `build`, off for `read`/`plan`).

## 8. Retirement

```ts
async function retireUnderperformers(): Promise<void> {
  const skills = await listApprovedSkills()
  for (const skill of skills) {
    const recent = await loadRecentRegressions(skill, { days: 7 })
    if (recent.length < 5) continue                    // need enough signal
    if (recent.every(r => !r.passed)) {
      await moveToArchive(skill, { reason: '7d-failure-streak' })
    }
  }
}
```

Archived skills kept 90 days, then deleted. Manifest entry persists for forensics.

## 9. Hub Client

Extends the existing `src/skills/hub.ts` (which already talks to skills.sh) to also support `agentskills.io` as a first-class source. Sources:

| Source | Example | Behavior |
|---|---|---|
| `skills.sh` | `vercel-labs/json-render/json-render-react` | Existing; unchanged |
| `agentskills-io` | `org/skill-name` | New; same install flow + provenance fetch |
| `github` | `owner/repo/path` | Existing; unchanged |
| `well-known` | `https://example.com/.well-known/skills/index.json` | Existing |

`aegis skills publish <name> --to agentskills-io`:
1. Validates SKILL.md frontmatter (name, description required; version, author recommended)
2. Bundles references/templates/scripts into a single tarball
3. POSTs to agentskills.io with `provenance: { evolution_manifest, quality_score, evidence_count, judge_verdict }`
4. Returns the published URL + a SKILLS.md badge for embedding

## 10. CLI Surface

```bash
aegis skills evolution status               # show distiller queue, last run, candidates pending
aegis skills evolution run                  # manual trigger (e.g. for testing)
aegis skills evolution inspect <candidate>  # show judge + regression results
aegis skills evolution approve <id>         # manually approve a pending candidate
aegis skills evolution reject <id> --reason "..."
aegis skills retire <name> [--force]        # manual retirement
aegis skills publish <name> --to agentskills-io
aegis skills install <source>:<id>          # unified installer (works for all sources)
```

## 11. Error Handling

| Failure | Behavior |
|---|---|
| LLM judge timeout | Fall back to regression-only gate (judge verdict = `skipped`) |
| Regression suite failure (5+ of 10) | Reject candidate; write diff to manifest |
| Skill load error (corrupted SKILL.md) | Skip the skill; emit dashboard warning; do NOT crash agent |
| Hub publish failure (network) | Retry with exponential backoff (1s, 2s, 4s, 8s, max 60s); surface in `aegis skills status` |
| Concurrent distiller runs | Mutex on `.evolution.lock` file; second run exits cleanly |
| Self-improvement patch failure | Revert via `skill_manage` undo; log the failure |

## 12. Testing

**Unit:**
- `clusterBySequence` — bucket size, cosine threshold, failure-rate filter
- Quality gate decision tree — judge+regression combinations
- Self-improvement threshold (3 failures, 3 successes)
- Retirement logic (7-day streak, archive move)
- Hub client mock — install, browse, search, publish, source normalization

**Integration:**
- Feed 5 fake session traces with a recurring pattern (web search → extract → write) → assert SkillCandidate emitted and gated
- Bad skill (LLM judge says no) → rejected, manifest updated
- 7 days of fake regression failures → skill moves to archive
- Publish to mock Hub → assert provenance payload

**E2E:**
- Human task "summarize the top 3 issues on my repo and write a markdown report" — done 3 times. On the 4th similar task, the new skill is auto-loaded.
- `aegis skills evolution status` shows the candidate history and the current quality score.

## 13. Phasing

| Phase | PR | What |
|---|---|---|
| 1 | `feat(skills): EpisodeRecord + distiller cron job` | Detection, no approval yet |
| 2 | `feat(skills): QualityGate (LLM judge + regression)` | Approval loop |
| 3 | `feat(skills): Self-improvement (post_mortem + patch candidates)` | In-loop |
| 4 | `feat(skills): Retirement + archive` | Hygiene |
| 5 | `feat(skills): agentskills.io Hub client + publish` | Publishing |
| 6 | `feat(skills): dashboard widget for evolution status` | UX |
| 7 | `docs(skills): evolution guide` | User-facing |

## 14. Open Questions (for plan review)

- Self-improvement default per agent type: do we want `build` and `refactor` agents to auto-patch their own skills, or always require a `patch candidate → review → apply` human-in-the-loop step?
- For Hub publishing, do we sign skills with a per-user key (Ed25519) for provenance, or rely on the Hub's audit log?
- What is the minimum evidence count for a candidate? 3 (proposed) is low; 5 is safer.
