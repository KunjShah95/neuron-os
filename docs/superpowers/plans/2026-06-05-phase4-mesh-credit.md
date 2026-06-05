# Phase 4 — Mesh Credit Assignment (deferred)

**Status:** Out of scope for v0.4.1. Stub for v0.5.x.

## What this solves

Phase 1–3 closes the **single-agent** loop: an agent runs a task, an
evaluator measures it, a ratchet reverts regressions, and the scalar
reward is recorded in the experience store so future runs can retrieve
similar past experience.

Phase 4 closes the **mesh** loop: when multiple agents contribute to
a composite task, how do we assign credit for the success / failure
of the whole task back to each contributing agent's run, prompt, and
tool choice?

## Why it's hard

1. **Heterogeneous contributions** — One agent plans, another edits,
   a third validates. The reward signal is on the composite outcome,
   not the individual contribution.
2. **Latency** — Some contributions only matter in hindsight (the
   planner's framing shaped the editor's search space).
3. **Tool + skill choice** — A "good" plan that picks the wrong tool
   should get partial credit, not zero.
4. **Sparse rewards** — Most composite tasks don't have ground truth
   scores per sub-step.

## Candidate approaches

| Approach | Pros | Cons |
|----------|------|------|
| **Counterfactual replay** — re-run with one sub-step swapped, measure delta | Clean causal signal | Expensive; agent runtimes non-deterministic |
| **Attribution by structural role** — planner: 0.3, editor: 0.5, validator: 0.2 (fixed weights) | Cheap, simple | Wrong on tasks where weights vary |
| **Learned credit function** — train a small model on `(contributions, outcome)` pairs | Adapts to the workload | Needs labeled data; chicken/egg with the eval system |
| **Cooperative game theory** — Shapley values over the contribution set | Theoretically clean | `O(2^n)` in the number of contributors |

## Suggested v0.5.x plan

1. Add a `MeshRun` log that records every `AgentEngine.completeSession`
   call along with its `parentMeshRunId` and `role` (planner / editor /
   validator / custom).
2. Use **structural role attribution** as the v0.5.0 baseline; each role
   has a default weight, configurable per mesh in `mesh.yaml`.
3. Run `aegis bench` for a week; collect `(meshId, perAgentRewards,
   finalScore)` triples.
4. Once we have ≥500 triples, train a tiny credit function (gradient
   boosting on features: role, tool_set_size, prompt_tokens, eval
   criteria count) and A/B against the structural baseline.
5. Promote the learned function to the default once it beats the
   baseline on a held-out month of bench runs.

## Open questions

- Do we want credit at the **prompt level** (which phrasing won) or
  the **strategy level** (which tool/skill choice won)? v0.5 will
  probably be the latter.
- Should a single agent get **multiple experience records** per
  composite run, one per role it played? Yes — but we need to track
  which record was used by which mesh so retrieval is honest.
- How do we surface credit info to the agent at inference time without
  leaking internals across projects? Project-scoped retrieval, same
  as today.

## Trigger conditions for activating Phase 4

- ≥3 distinct roles in regular use (planner / editor / validator is
  the minimum).
- ≥10 mesh runs per day in the experience store (otherwise the
  trained function will be starved for data).
- The bench suite includes at least one composite multi-agent task
  with a ground-truth score we can split against.
