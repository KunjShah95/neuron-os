# Neuron OS — Roadmap

> **The Operating System for Autonomous AI Agents.**
> Local-first. TypeScript-native. Observable by default.

We're building the missing layer between an LLM and a real, running system of work — a runtime where agents are typed, observable, cost-aware, and auditable, running from a laptop to a cluster without changing a line of config.

This roadmap is for **collaborators**. It tells you what's already solid, what we're actively building, and exactly where you can plug in — whether you write TypeScript, build CLIs, care about AI safety, or just want to fix a bug.

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────┐
│                    Surfaces                             │
│   Terminal (TUI)  ·  Web Dashboard  ·  Chat Adapters   │
│          Slack / Discord / Telegram / Matrix            │
└───────────────────────┬─────────────────────────────────┘
                        │ aegis CLI / HTTP / WebSocket
┌───────────────────────▼─────────────────────────────────┐
│                   Agent Runtime                         │
│  Spawn  ·  Mesh Orchestration  ·  Tool Policy Gate      │
│  Cost Attribution  ·  Audit Log  ·  Credential Vault    │
└──────┬─────────────────────────────────────┬────────────┘
       │                                     │
┌──────▼────────┐                   ┌────────▼────────────┐
│    Memory     │                   │     AI Providers    │
│  SQLite KV    │                   │  Anthropic · OpenAI │
│  Vector FTS5  │                   │  Mistral · Azure    │
│  Knowledge    │                   │  NVIDIA NIM · Groq  │
│  Graph        │                   │  OpenRouter + more  │
└───────────────┘                   └─────────────────────┘
```

**Core stack:** TypeScript + Bun · SQLite · Commander · Clack · Zod

---

## What's Already Shipped

The foundation is solid. These modules are tested and in production:

| Module | What it does |
|--------|-------------|
| **Agent Engine** | Spawn typed agents with budgets, policies, and tool access |
| **Multi-Agent Mesh** | Sequential, fan-out, debate, ensemble, supervisor topologies |
| **Memory System** | KV + vector FTS5 + knowledge graph + cross-session synthesis |
| **Economy Layer** | Per-task USD attribution, budget enforcement, cost routing |
| **Distributed Runtime** | Multi-host worker pool, AES-256-GCM transport, leader election |
| **Observability** | SLOs, distributed tracing, audit log, production dashboard |
| **Self-Improvement** | Skill extraction, failure clustering, adversarial self-play |
| **Plugin Marketplace** | Ed25519-signed plugins, semver deps, 5 hook points |
| **Eval & Training** | Grader suite, golden datasets, trajectory capture, CI gate |
| **Soul / Persona** | 8 archetypes, mood system, dream engine, social gossip |
| **Security** | RBAC, encrypted vault, secrets scrubbing, TLS, pre-commit hook |
| **Chat Adapters** | Slack, Discord, Telegram, Matrix, IRC, WebSocket gateway |

Version: **v1.1.9** — [CHANGELOG](./CHANGELOG.md) · [npm](https://www.npmjs.com/package/neuron-aegis)

---

## Active Milestones

These are shipping now. PRs welcome — each milestone has open issues labeled with the milestone tag.

---

### v1.2.0 — Operational Hardening
**Goal:** Multi-agent runs are debuggable, secrets stay secret, sandbox enforces at runtime.

| Task | Area | Good for |
|------|------|----------|
| IPC backpressure — buffer worker stdout, pause on high-watermark | `src/agent/manager.ts` | Systems / Node.js |
| Crash-safe session flush — WAL checkpoint on heartbeat, not just shutdown | `src/memory/` | SQLite / durability |
| Busy vs hung heartbeat — only kill on `hung`, not `busy` | `src/agent/agent-worker.ts` | TypeScript |
| Runtime sandbox enforcement — `--allow-read`/`--allow-write` per agent type | `src/sandbox/policy.ts` | Security |
| Secrets scrubbing in audit log — strip `*_KEY`/`*_SECRET` before JSONL write | `src/audit/store.ts` | Security / TypeScript |
| Shared-file locking — SQLite advisory locks to prevent concurrent agent corruption | `src/memory/` | Database |
| Skill review gate — staging namespace + `aegis skills approve <id>` before injection | `src/improve/` | TypeScript / AI safety |

**Label:** [`milestone:v1.2.0`](https://github.com/KunjShah95/neuron-os/issues?q=label%3Amilestone%3Av1.2.0)

---

### v1.3.0 — MCP Ecosystem
**Goal:** Aegis both consumes and exposes MCP — any MCP client can spawn agents, any MCP server becomes a tool.

| Task | Area | Good for |
|------|------|----------|
| MCP Client Mode — consume external MCP servers as agent tools | `src/mcp/` | TypeScript / protocol |
| MCP Server Mode — expose `spawn_agent`, `list_agents`, `get_output` as MCP tools | `src/mcp/` | TypeScript / protocol |
| OAuth 2.1 PKCE flow for outbound MCP auth | `src/mcp/auth.ts` | Auth / security |
| Built-in Tool Gateway — web search, browser, image gen behind permission flags | `src/tools/gateway.ts` | TypeScript |
| Claude Desktop integration test | `tests/` | QA / integration |

**Label:** [`milestone:v1.3.0`](https://github.com/KunjShah95/neuron-os/issues?q=label%3Amilestone%3Av1.3.0)

---

### v1.4.0 — Agent Profile Builder
**Goal:** Each agent type gets a persistent, editable identity that drives behavior across restarts.

| Task | Area | Good for |
|------|------|----------|
| `AgentProfile` schema — identity, model, skills, MCP servers, budget defaults | `src/profile/types.ts` | TypeScript / Zod |
| Profile storage in `~/.aegis/profiles/<type>.json` | `src/profile/store.ts` | TypeScript |
| `aegis profile create\|edit\|list\|set-default` CLI | `src/cli/commands/profile.ts` | CLI / UX |
| Profile picker in `aegis agent spawn` TUI | `src/cli/` | TUI / Clack |
| Profile hot-reload — agents pick up edits on next turn | `src/agent/engine.ts` | TypeScript |
| Dashboard profile editor page | `dashboard/` | React / TypeScript |

**Label:** [`milestone:v1.4.0`](https://github.com/KunjShah95/neuron-os/issues?q=label%3Amilestone%3Av1.4.0)

---

## Upcoming Milestones

Planned but not yet active. If one of these excites you, open an issue to claim it.

---

### v1.5.0 — Streaming & Performance
**Goal:** 50+ concurrent agents per host, sub-second responses, incremental memory indexing.

- SSE-based streaming for chat and API endpoints
- SQLite connection pooling across modules
- Incremental vector index updates (no full rebuilds per session)
- Agent spawn time under 2 seconds under load
- Dashboard client-side caching with stale-while-revalidate

---

### v1.6.0 — Enterprise Integration
**Goal:** Drop into existing enterprise stacks without custom glue code.

- SSO / SAML / OIDC for dashboard and API
- Outbound webhooks for agent lifecycle events (spawn, complete, fail)
- Audit log export via OpenTelemetry → Splunk / Datadog / ELK
- RBAC policies as versioned YAML files
- Config-as-code: full system state exportable/importable

---

### v1.7.0 — Plugin Ecosystem Maturity
**Goal:** Community plugins work reliably across versions.

- Full semver dependency resolution with conflict detection
- `aegis plugin test` — run plugin test suites in isolation
- Plugin sandboxing with permission scoping
- Marketplace usage analytics — downloads, ratings, weekly actives

---

### v2.0.0 — Distributed Production OS
**Goal:** Multi-region, multi-tenant, HA — for teams running agents in production.

- Multi-region agent runtime with latency-aware routing
- Hot-standby worker failover
- ML-based provider selection from historical cost/quality data
- SOC 2 Type II compliance tooling
- Mobile companion app for agent monitoring and human-in-the-loop approvals

---

## Where to Contribute

Pick the area that matches your skills:

### TypeScript / Core Runtime
Start in `src/agent/`, `src/mesh/`, `src/memory/`. The codebase uses strict TypeScript — `noUncheckedIndexedAccess`, `noUnusedLocals`, Zod schemas at every boundary. If you like typed systems, there's a lot of surface to work with.

### CLI / TUI / UX
Start in `src/cli/commands/`. Commands use Commander + Clack prompts. Improvements to output formatting, error messages, interactive flows, and help text are always welcome — no deep AI knowledge required.

### AI / Prompt Engineering
Start in `src/agent/engine.ts`, `src/dream/`, `src/improve/`. The 4-layer system prompt (dream learnings → experience → base → tools) and the skill extraction pipeline are areas where AI practitioners can have direct impact.

### Security
Start in `src/sandbox/`, `src/audit/`, `src/vault/`. We have a policy engine, a credential vault, and an audit log — but runtime enforcement gaps are documented in v1.2.0 above. Security-minded contributors are particularly needed here.

### Frontend / Dashboard
Start in `dashboard/src/`. React + Recharts + Tailwind. The dashboard has SLO cards, cost charts, audit log viewer, and failure clusters — and needs profile editing, agent detail views, and real-time streaming updates.

### DevOps / Infrastructure
Start in `.github/workflows/` and `scripts/`. CI covers typecheck, lint, backend tests, coverage, smoke tests (mac/linux/windows), E2E, security scans, and benchmark regression. Improvements to pipeline speed, Docker image size, and release automation are welcome.

### Testing
Every module needs more tests. `src/**/*.test.ts` files use Bun's native test runner. Adding coverage for edge cases, failure paths, and cross-module interactions is always a high-value contribution.

---

## Good First Issues

New here? These are well-scoped, documented, and don't require deep system knowledge:

- **Improve error messages** in `aegis agent spawn` when required env vars are missing
- **Add `--json` flag** to `aegis cost total` for scripting-friendly output
- **Write tests** for `src/skills/registry.ts` — `loadAll()`, `findRelevantSkills()`, `injectSkill()`
- **Improve `aegis --help` output** — group commands by category (agents, memory, cost, etc.)
- **Add `aegis profile` command skeleton** — just the CLI structure with `create|list|edit` subcommands
- **Fix any open `good first issue` label** → [browse them here](https://github.com/KunjShah95/neuron-os/issues?q=label%3A%22good+first+issue%22)

---

## Feature Proposals

Ranked by impact × feasibility against the current codebase. Every proposal names
the existing modules it builds on, so the work is wiring rather than reinvention.

### Already shipped in this cycle

| Feature | Where | What it does |
|---------|-------|--------------|
| Real agent memory | `src/memory/tool-bridge.ts`, `src/tools/memory-{read,write,search}.ts` | `memory_read` / `memory_write` / `memory_search` were stubs that persisted nothing. They now write to the episodic + vector stores, search across all stores via the unified query, and enforce the namespace ACL that previously had no runtime caller. Cross-namespace access is denied unless a grant exists, and every allow/deny is audited. |
| `aegis spec` | `src/cli/commands/spec.ts`, `src/agent/spec/` | The declarative agent subsystem (schema, import-aware loader, canonical hasher, runner, replayer) was fully built and had zero callers. It now has a CLI: `validate` / `run` / `replay` / `list`. `runSpec` honours budget, memory namespace, tools allow/deny/toolset, context files, skills and env, and records the run to the audit log. |
| Model router reaches the agent | `src/agent/agent-worker.ts` | `AEGIS_ROUTED_PROVIDER` / `AEGIS_ROUTED_MODEL` were written by the manager but read by nobody, so the router never actually selected a provider for spawned agents. Resolution is now `explicit > routed > default > auto-detect`, and a routed pair is only accepted when the model is valid for the provider it names. |
| LLM cost attribution | `src/agent/engine.ts`, `src/billing/tracker.ts` | The agent engine called the AI SDK directly, so LLM token usage was never written to the `usage` table — `aegis cost` could only ever reflect tool spend. Token usage from both the streaming and non-streaming paths is now recorded per session. |
| Audit log integrity | `src/audit/store.ts` | Rows are now hash-chained and the chain is verifiable (`verifyIntegrity()`); `LIMIT`/`OFFSET` are bound rather than interpolated; UPDATE/DELETE triggers make the log genuinely append-only. |

### Tier 1 — Ship next

**1. One policy engine at the tool gate.** Aegis advertises "pattern-restricted bash" and a
policy engine that denies by default. There are two `PolicyEngine` classes — `src/sandbox/policy.ts`
(base deny rules, enforced only in `src/agent/agent-tools.ts`) and `src/audit/policy.ts` (richer
rules, surfaced by `aegis audit policy` but enforced nowhere). The path agents actually take,
`src/tools/registry.ts` → `read`/`write`/`edit`/`bash`, checks only the tool-name allowlist.
*Scope:* promote one engine, call it from `src/tools/registry.ts`, YAML policies under
`~/.aegis/policies/`, `aegis policy apply|test|why`, every decision audited. Ship warn-only
first. *Effort* M. *Risk* highest here — a bad default rule bricks every agent.

**2. Cost envelopes that actually bind.** A `BudgetGuard` is created per agent and updated
from `spend-report`, but only *tool* cost reaches it, and `"abort"` is only logged. Now that
LLM usage is recorded, the budget can be enforced for real: `src/economy/budget-guard.ts`
consumes model + tool cost, `src/agent/manager/ipc.ts` acts on `"abort"`, and `aegis cost agents`
adds a per-agent breakdown. *Effort* M. *Risk* a hard stop mid-run can leave half-applied
edits — route it through the staging/approval path, never a raw kill.

**3. Auditable subprocess agents.** `src/agent/agent-worker.ts` builds its engine without
`audit` or `experience` and never calls `completeSession()`, so for the primary agent path
`aegis audit log`, `aegis experience` and `aegis insights` are effectively empty. *Scope:*
enable both flags, call `completeSession()`, emit one audit event and one child trace span
per tool call, make `aegis audit replay <id>` work for spawned agents. *Effort* M. *Risk* the
worker and the manager write the same SQLite files — WAL plus batched inserts.

**4. Human-in-the-loop approval as a service.** Approval is a blocking `@clack/prompts` call
inside the agent's own process, so a headless `aegis serve` or cron-triggered agent cannot ask
at all. *Scope:* a persistent approval broker in SQLite, `src/agent/approval.ts` submitting to
it when no TTY is attached, `POST /api/v1/approvals` plus a WS channel, approval from Slack with
a signed deep link, auto-approve for read-only tools. *Effort* L. *Risk* every write then waits
on a human — set an expiry and fail closed.

**5. A2UI as an interactive contract.** `src/tools/a2ui-tool.ts` implements a full agent→UI
widget protocol with a TUI panel, a dashboard playground and WS events — but `a2ui_emit` is in no
agent type's tool list, and the `action_button` click is never routed back to the agent that
emitted it. *Scope:* grant the tool, add an `a2ui:action` IPC payload, `aegis a2ui list|show|action`,
keyboard-selectable buttons. *Effort* M. *Risk* widget flooding — rate-limit per agent/scope.

### Tier 2 — Worth building

**6. Mesh and workflow execution that honours its config.** `src/mesh/orchestrator.ts`
`executeAgent()` ignores `agent.model`, `provider`, `timeout`, `dependsOn` and the fan-out
`strategy` (the parameter is literally named `_strategy`), so every node runs the same
in-process agent; `src/workflow/executor.ts` drops `node.tools`, `node.sandbox`,
`node.budget_usd` and never evaluates `edges[].condition`. Make `src/workflow/validator.ts`
reject unenforced keys so authors are not misled. *Effort* L.

**7. Session replay and rollback.** `src/audit/replay.ts` can reconstruct a session but not
re-execute it, and `src/sandbox/checkpoint.ts` `CheckpointManager` is fully orphaned. *Scope:*
`aegis session replay <id>` re-executes the recorded tool sequence in a sandbox and diffs the
result; wire `CheckpointManager` into session start/end. *Effort* M. *Risk* replayed tool calls
have side effects — dry-run by default.

**8. Golden trajectories — eval regressions over real agent runs.** `src/harness/` evaluates
static task cases; nothing evaluates the runtime. `src/training/recorder.ts` already records full
trajectories. *Scope:* promote a trajectory to a golden artifact, replay it against the live
runtime, compare the tool sequence with a tolerance, emit a `BaselineComparison` the CI gate
already understands. *Effort* M–L. *Risk* live re-execution is non-deterministic — replay the
decision layer against a mocked tool layer.

**9. Cross-project memory federation under explicit grants.** Project isolation
(`src/project/context.ts`) and the grant lifecycle (`src/memory/policy/grant-manager.ts`) both
exist but are not connected. *Scope:* `src/memory/unified-query.ts` accepts a `Principal` and
filters each namespace through `canRead`; `aegis memory-policy share|revoke|audit`. *Effort* M.
*Risk* one incorrect grant leaks a team's memories — default-deny, short TTLs, mandatory audit.

**10. A single surface for tool policy decisions.** `aegis audit decisions` showing every
allow/deny with the matched rule, the agent and an arguments hash — turns policy from a black box
into an explainable system. *Effort* S.

### Tier 3 — Speculative

**11. A local model fleet with local-first routing and real embeddings.** Local inference is a
thin shim (`src/ai/providers.ts` registers `ollama` as an OpenAI-compatible endpoint with no model
lifecycle) and memory embeddings are **hash-based, 128-dim** (`src/memory/embedding.ts`) — not
semantic. *Scope:* `src/ai/local-fleet.ts` (enumerate, warm, evict, health-check), a `localFirst`
preference in `src/economy/model-router.ts`, pluggable embedding backends. *Effort* L.

**12. Durable, resumable workflow runs.** `src/workflow/executor.ts` holds the DAG in memory; a
crash loses everything. *Scope:* `src/workflow/persistence.ts`, `aegis workflow resume <runId>`,
node-level idempotency keys. *Effort* L. *Risk* resuming can double-apply side effects.

**13. Typed agent contracts and artifact-based handoff.** `MeshAgent` has only `goal: string`,
yet `src/harness/multi-agent-collector.ts` measures "context loss" for a mechanism that does not
exist. *Scope:* Zod `inputSchema`/`outputSchema` on `MeshAgent`, validated output with a repair
turn, typed artifacts under `~/.aegis/artifacts/<runId>/`. *Effort* L.

**14. Team-scoped runtime.** `ROADMAP.md` says "No multi-tenant by default" for the community
edition, but `BUSINESS.md` sells Enterprise on named seats and audit exports. *Scope:* `src/tenant/`
binding vault namespace, memory namespaces, RBAC scope, cost bucket and audit partition to a
tenant id. *Effort* L+. *Risk* isolation bugs are the highest-severity class possible here.

### Structural gaps found while reading the code

1. **Two divergent policy engines, neither enforcing the live tool path.**
   `src/sandbox/policy.ts` vs `src/audit/policy.ts` — see proposal 1.
2. **The model router's decision never reached the agent.** `AEGIS_ROUTED_*` was written but
   never read. *Fixed.*
3. **LLM token cost was never recorded.** The agent engine bypassed `src/ai/provider.ts`, so the
   `usage` table stayed empty. *Fixed.*
4. **Budgets were declared but never enforced.** `BudgetGuard` only saw tool cost, and `"abort"`
   was logged, not acted on. See proposal 2.
5. **A complete declarative agent subsystem with no entry point.** `src/agent/spec/` had zero
   callers. *Fixed.*
6. **Spawned agents were invisible to audit, experience and the knowledge graph.** See proposal 3.
7. **The agent memory tools were placeholders and the memory ACL had no runtime caller.** *Fixed.*
8. **Two ready-to-use subsystems are fully orphaned.** `src/sandbox/checkpoint.ts`
   `CheckpointManager` (proposal 7) and the `a2ui_emit` tool, which no agent type grants
   (proposal 5).
9. **The audit log had no integrity chain.** *Fixed.*
10. **`minimatch` was not declared in `package.json`** — it only resolved transitively through
    `glob@13`. *Fixed.*

---

## How to Get Started

```bash
git clone https://github.com/KunjShah95/neuron-os.git
cd neuron-os
bun install
bun run typecheck   # must pass
bun run lint        # must pass
bun test            # run the full suite
```

Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) for PR conventions, code style, and the review process.

Join the conversation in [GitHub Discussions](https://github.com/KunjShah95/neuron-os/discussions) — use the **RFC** category for feature proposals and the **Q&A** category for questions.

**Every PR is reviewed within 48 hours.** We will not leave you hanging.

---

## What We Are Not Building

- **No SaaS host.** Neuron OS runs on your hardware. We do not host agents for you.
- **No fine-tuning.** We consume models; we do not train them.
- **No framework lock-in.** LangChain, LlamaIndex, etc. are not dependencies. We build primitives.
- **No multi-tenant by default.** Single-user, single-host is the default mode.

---

*Roadmap is updated with each release. Last updated: v1.1.9 · June 2026.*
