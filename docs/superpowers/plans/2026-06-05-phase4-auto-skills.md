# Phase 4 — Auto-Skill Promotion from Experience (deferred)

**Status:** Out of scope for v0.4.1. Stub for v0.5.x.

## What this solves

Today, when a run is graded `reward ≥ 0.9` and its approach is
distinctive, the experience record sits in the store and gets
retrieved by future similar runs. But the **recipe** — "first call
`foo`, then check `bar`, then write to `baz`" — is locked in the
free-form `summary` field.

Phase 4 auto-promotes high-reward recipes into **new skills** so
they're callable by name, not just retrievable as context.

## Why it's hard

1. **Recipe extraction** — the run trace is tool calls, not
   declarative steps. Extracting a clean recipe requires either
   the LLM to summarize the trace, or a templated step format.
2. **Generalization vs. overfitting** — a recipe that only worked
   because of one project's quirks shouldn't become a global skill.
3. **Naming + collision** — auto-generated names will collide
   with human skills and with each other.
4. **Trust** — promoting a bad skill is worse than not promoting
   one. We need a confidence threshold and a sandbox test.
5. **Versioning** — skills evolve; a promoted skill from a
   6-month-old recipe may be stale.

## Candidate approaches

| Approach | Pros | Cons |
|----------|------|------|
| **LLM-summarize trace → skill markdown** | Easy, flexible | Hallucinates steps; brittle |
| **Mine execution patterns** — `(tool_call_sequence → high_reward)` rules | Deterministic | Misses semantic intent |
| **Human-in-the-loop** — draft, then `aegis skills review` queues them | Safe | Slow; defeats the point |
| **Promote on consensus** — same recipe wins ≥N times before promotion | Safe, emergent | Needs many runs |

## Suggested v0.5.x plan

1. Add a `Recipe` type: `{ steps: ToolStep[], preconditions, postconditions,
   source: [experienceIds], confidence: 0..1 }`.
2. After every `Evaluator.overallScore ≥ 0.9`, run a background
   "recipe miner" that:
   - extracts the tool call sequence from the session log
   - groups by `goal_similarity ≥ 0.7` (use `cosineSimilarity` on
     the existing `embedding.ts`)
   - if a cluster has ≥3 distinct experience records with the same
     tool sequence prefix (length ≥ 3), emit a `RecipeDraft`.
3. `RecipeDraft` lives in `.aegis/skills/drafts/<hash>.md` and is
   exposed via `aegis skills drafts` for human review.
4. Promotion requires: a human `aegis skills promote <draft>`
   command, AND a successful bench-task run that uses the skill.
5. Once promoted, the skill is versioned in `.aegis/skills/` and
   becomes retrievable for all projects.

## Open questions

- Should promotion be **per-project** or **global**? Probably
  per-project by default, with explicit `aegis skills promote --global`.
- How do we handle **skill deprecation** when a recipe stops
  working? A simple metric: "if `aegis bench <task>` regresses
  for 3 consecutive runs and the recipe was used, deprecate."
- Should we **expose recipes as candidate skills in the prompt**,
  or only use them when explicitly retrieved? The latter is
  safer; the former is more discoverable.

## Trigger conditions for activating Phase 4

- ≥100 experience records with `reward ≥ 0.9` in the store
  (otherwise the cluster signals are too sparse).
- ≥3 of those records are not already covered by an existing
  skill (i.e., the "novel recipe" rate is high enough to
  justify the engineering).
- The bench suite can run a promoted-skill-vs-no-skill A/B
  automatically (otherwise we can't validate promotions).
