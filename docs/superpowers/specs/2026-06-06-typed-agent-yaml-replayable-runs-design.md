# Typed `agent.yaml` + Replayable Runs — Design Spec

**Date:** 2026-06-06
**Status:** Draft
**Scope:** v0.7.x — typed `agent.yaml` schema, deterministic replay, eval-task format

## Context

Aegis has 14 agent types (per `AGENTS.md`) but no formal spec language. Every run is somewhat ad-hoc — you `aegis agent spawn foo --type build` and hope for the best. There is no way to say "this exact run, with these exact inputs, these exact tool permissions, and these exact LLM parameters, can be replayed bit-identical."

Hermes uses `agent.yaml`-style config for repeatable agent definitions. Cline has `cline.yaml`. CheetahClaws has `agent.yaml`. The pattern is well-established. What's missing in all of them is **typed schemas + replay determinism** as first-class concerns.

This spec:
1. Defines a typed `agent.yaml` schema (Zod) that captures everything needed to reproduce a run
2. Adds `aegis replay <session_id>` that re-runs a session from its recorded spec
3. Closes the loop with the RL spec — every eval task IS a typed `agent.yaml`

## 1. Goals

1. **Typed spec** — Zod-validated `agent.yaml` capturing: agent type, model, system prompt template, tool permissions, skills, context files, memory, hooks, env, budget, triggers.
2. **One source of truth** — `agent.yaml` is what `aegis agent spawn` reads; replaces the current implicit config.
3. **Reproducible runs** — `aegis replay <session_id>` reruns a session bit-identical except for LLM non-determinism.
4. **Eval integration** — the benchmark suite from the RL spec is a directory of `agent.yaml` files; a single schema serves both.
5. **Schema versioning** — `apiVersion: aegis/v1` field; old specs can be loaded with deprecation warnings.
6. **DRY via imports** — `from:` field references other specs (like K8s pod templates) for repeated configs.

## 2. Non-Goals (v1)

- Visual builder for `agent.yaml` (text-only is fine; tracked as Tier 3)
- Cross-machine replay (replay runs on the same machine, in the same working dir)
- Bit-identical LLM output (impossible without `temperature: 0` + provider cache; we set temp to 0 by default for replays)
- Time-traveling: replaying a session from 30 days ago does NOT use the memory that was generated in between
- Live spec editing (use the dashboard hot-reload, not direct YAML edit)

## 3. Architecture

```
  ┌────────────────────────────────────────────────────────┐
  │  agent.yaml (Zod-validated at load time)                │
  │    apiVersion: aegis/v1                                │
  │    kind: Agent                                         │
  │    metadata: { name, labels, annotations }             │
  │    spec: { type, model, system_prompt, tools, ... }     │
  └─────────────┬──────────────────────────────────────────┘
                │ loaded by
                ▼
  ┌────────────────────────────────────────────────────────┐
  │  src/agent/spec/                                       │
  │    - schema.ts         (Zod)                           │
  │    - loader.ts         (file → validated spec)         │
  │    - hasher.ts         (canonical YAML → SHA-256)      │
  │    - runner.ts         (spec + input → session_id)     │
  │    - recorder.ts       (session_id → spec used)        │
  │    - replayer.ts       (session_id + input → rerun)    │
  └────────────────────────────────────────────────────────┘
```

## 4. AgentSpec Schema (Zod)

```ts
const AgentSpec = z.object({
  apiVersion: z.literal('aegis/v1'),
  kind: z.literal('Agent'),
  from: z.string().optional(),                  // path to parent spec; merged + overridden
  metadata: z.object({
    name: z.string().regex(/^[a-z0-9-]+$/),
    labels: z.record(z.string()).default({}),
    annotations: z.record(z.string()).default({}),
  }),
  spec: z.object({
    type: z.enum(['build','plan','read','write','test','validate','review','debug','document','refactor','deploy','monitor','explore','main']),
    model: z.object({
      provider: z.string(),
      name: z.string(),
      temperature: z.number().min(0).max(2).default(0),
      max_tokens: z.number().optional(),
      top_p: z.number().min(0).max(1).optional(),
    }),
    system_prompt: z.object({
      template: z.string().optional(),          // inline
      file: z.string().optional(),              // path to .md
      append_skills: z.boolean().default(true),
      append_user_model: z.boolean().default(true),
    }),
    tools: z.object({
      allow: z.array(z.string()).default([]),
      deny: z.array(z.string()).default([]),
      toolset: z.string().optional(),           // from spec 1
    }),
    context_files: z.array(z.string()).default([]),  // globs
    skills: z.array(z.string()).default([]),
    memory: z.object({
      namespace: z.string().default('default'),
      ttl_days: z.number().optional(),
      recall_top_k: z.number().default(3),
    }).default({}),
    hooks: z.array(z.object({
      event: z.enum(['spawn','kill','message','error','exit']),
      phase: z.enum(['pre','post']),
      command: z.string(),
    })).default([]),
    env: z.record(z.string()).default({}),
    budget: z.object({
      usd: z.number().positive().optional(),
      tokens: z.number().positive().optional(),
    }).optional(),
    triggers: z.array(z.discriminatedUnion('type', [
      z.object({ type: z.literal('manual') }),
      z.object({ type: z.literal('cron'), schedule: z.string() }),
      z.object({ type: z.literal('fs'), watch: z.array(z.string()) }),
      z.object({ type: z.literal('webhook'), path: z.string(), auth: z.enum(['hmac','none']).default('hmac') }),
    ])).default([{ type: 'manual' }]),
  }),
})
```

## 5. Spec Hashing

```ts
function hashSpec(spec: AgentSpec): string {
  // Canonical YAML: sort keys, strip defaults, normalize whitespace
  const canonical = canonicalizeYaml(spec)
  return sha256(canonical).hex()
}
```

The hash is what makes replay deterministic — two runs with the same `spec_hash` will execute the same code path, even if the YAML file changed.

## 6. Data Flow

1. User writes `agent.yaml` in a project dir (or `~/.aegis/agents/<name>/agent.yaml`).
2. `aegis agent spawn` (or `aegis agent run`) finds the spec, validates against the Zod schema, resolves any `from:` imports, hashes the spec → `spec_hash`.
3. Spec + spec_hash + run input → `AgentRunner` produces a `session_id` deterministically derived from `hash(spec_hash + input)`.
4. `TrajectoryRecorder` (from the RL spec) writes events including `{ type: 'spec_load', spec, spec_hash, runner_version }` at `session_start`.
5. To replay: `aegis replay <session_id> [--input <new_goal>]` loads the recorded spec, runs with the same `spec_hash`, temperature=0, same env, same working dir.

## 7. CLI Surface

```bash
aegis agent validate <path>                  # Zod-validate without running
aegis agent run <path> --input "..."         # run from a spec
aegis agent spawn <name>                     # spawn from ~/.aegis/agents/<name>/agent.yaml
aegis agent list-specs                       # list all specs in the registry
aegis replay <session_id>                    # replay with original input
aegis replay <session_id> --input "..."      # replay with new input
aegis replay --dry-run <session_id>          # show what would be replayed
```

## 8. Error Handling

| Failure | Behavior |
|---|---|
| Schema validation failure | Print field-level errors; exit non-zero |
| `from:` import not found | Error with the missing path |
| `from:` import cycle | Detect; error with cycle path |
| Spec hash mismatch (user modified file between runs) | Warning + require `--force` to proceed |
| Replay with different Aegis version | Warn; show version diff |
| Replay when spec file is missing | Reconstruct spec from `spec_load` event in the trajectory |
| Tool permission denied at runtime | Existing error path (per AGENTS.md) |
| Budget exceeded mid-run | Existing budget_enforcer hook |

## 9. Testing

**Unit:**
- Schema validation (valid + invalid examples for every field)
- Spec hashing determinism (same spec → same hash)
- `from:` import resolution and merge order
- Canonical YAML normalization (whitespace, key order, defaults)

**Integration:**
- Spawn from spec → session_id deterministically derived from `spec_hash + input`
- Replay produces equivalent trajectory (within LLM non-determinism)
- Eval suite (from RL spec) is a directory of `agent.yaml` files; runner loads and runs them
- Spec hash mismatch triggers warning + `--force` flow

**E2E:**
- Hand-write a spec, run it, replay it, assert the second run replays the first
- `from:` chain (A imports B imports C) resolves correctly
- A CI run with a `agent.yaml` at the repo root runs without flags

## 10. Phasing

| Phase | PR | What |
|---|---|---|
| 1 | `feat(agent): AgentSpec Zod schema + loader + hasher` | Foundation |
| 2 | `feat(agent): AgentRunner consumes spec` | Spawn path |
| 3 | `feat(agent): TrajectoryRecorder stores spec_hash` | Cross-link with RL spec |
| 4 | `feat(agent): aegis replay command` | Replay path |
| 5 | `feat(eval): migrate existing evals to agent.yaml format` | Cross-link with RL spec |
| 6 | `docs(agent): agent.yaml guide + examples` | User-facing |

## 11. Open Questions (for plan review)

- For replay, should we pin the LLM provider snapshot (e.g., the exact Claude model version) or just the model family? Pinning = more reproducible; family = survives model deprecations.
- Should spec hashing include the LLM model version, or only the parts that humans control? Including = more sensitive to provider changes; excluding = may mask regressions.
- For `from:` imports, do we support glob imports (all specs in a directory) or only single-file imports?
