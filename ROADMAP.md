# Aegis Roadmap

> *The operating system for autonomous AI agents.*

This is the single source of truth for where Aegis is going. The shape of the project has changed since the early "wrap LangChain" days — we now build a full agent OS, not a library. The roadmap below reflects that.

---

## 1. Vision

**Aegis is the missing layer between an LLM and a real, running system of work.**

We treat agents as first-class OS citizens — typed, observable, recoverable, auditable, cost-aware, and runnable from any surface (terminal, web app, chat platform, programmatic API). The user should be able to:

1. **Spawn a swarm of agents** in one command, each with a typed role and a budget.
2. **Watch them work** in real time — a TUI, a web app, a Slack channel, a webhook.
3. **Trust the safety story** — every tool call is gated by a per-agent-type policy, every action lands in an append-only audit log, and the whole thing runs locally by default.
4. **Pay only for the work that mattered** — per-task USD attribution, budget enforcement, and benchmarked cost-per-outcome.
5. **Self-improve** — failed runs are ratcheted into a regression-detected state, replayable for forensics, and fed back into the system prompt as known failure patterns.
6. **Ship it to production** — multi-host runtime, encrypted transport, RBAC, SLO-grade observability, and a hardened credential vault.

The long-term ambition: **a fully local-first, agent-aware OS that a single developer can run, audit, and extend** — without standing up Kubernetes, paying SaaS tax, or losing control of their data.

---

## 2. Guiding Principles

Every milestone in this roadmap is checked against these five principles. When two milestones conflict, the one that serves the principles better wins.

1. **Local-first, cloud-portable.** Aegis runs on a laptop with `bun run index.ts` and scales to a cluster with the same `agent.yaml` and the same `aegis` binary. There is no SaaS lock-in. There is no "we'll host your agents" tier. The cloud is optional infrastructure, not the product.
2. **Typed all the way down.** Strict TypeScript end-to-end. IPC messages, tool calls, agent events, cost records — everything has a schema. The system catches a wrong shape at the boundary, not at 3am in a log.
3. **Observable by default.** Every action lands in a queryable log. Every agent has a heartbeat. Every long-running task has a checkpoint. You should never have to guess what an agent is doing or why.
4. **Composable, not monolithic.** Agents, tools, skills, policies, adapters, and providers are all pluggable. The core is small. The surface area grows through community modules.
5. **Honest about costs.** Every LLM call is attributed. Every provider is benchmarked. The system tells you what a feature costs before you build it, and tells you what the system cost after it ran.

---

## 3. What Ships in v0.2.0 (Released — 2026-06-06)

The baseline release. Aegis at v0.2.0 is a **production-shaped local agent OS** that already has:

- 12 TUI modes, 14 agent types, 4 working surfaces (terminal / web app / chat platform / API)
- A typed, observable agent runtime with auto-recovery and a lifecycle hook system
- An 8-adapter multi-platform gateway (Discord, Slack, SMS, Voice, WhatsApp, Email, Webhook, Bot-Commands) behind one `gateway.ts` interface
- An HMAC-signed REST API with replay protection
- 6 AI providers, 30+ test suites, 65% line coverage, a clean CI/CD pipeline
- A redesigned marketing landing page and a public roadmap

---

## 4. The Eight Milestones (v0.7.0 → Future)

### ✅ v0.7.0 — Cost Attribution & Benchmarking — **SHIPPED**

**What we delivered:**

- `aegis cost {total,models,sessions,history,budget,report}` — real USD cost tracking
- `aegis benchmark {run,status,baseline}` — regression detection with CI-compatible JSON
- `aegis bench providers "<task>"` — benchmarks all 13 providers on quality + cost
- `aegis insights` — cross-DB analytics across audit, billing, experience, telemetry
- `aegis router route/list/suggest` — auto-selects cheapest provider per task type
- `aegis estimate` — pre-flight cost estimation with warn/block thresholds
- 13 providers tracked in pricing registry with real per-1k-token costs
- Model router wired into agent spawning

**Key files:** `src/economy/`, `src/cli/commands/cost.ts`, `src/cli/commands/bench.ts`, `src/cli/commands/insights.ts`, `src/cli/commands/router.ts`, `src/cli/commands/preflight.ts`

---

### ✅ v0.8.0 — Knowledge Graph & Long-Term Memory — **SHIPPED**

**What we delivered:**

- SQLite-backed knowledge graph with entity extraction, relationship linking, confidence scoring
- Per-agent memory namespaces with TTL-based expiry and archival
- Cross-session knowledge synthesis across all 5 memory stores
- Auto-extraction from every completed agent session
- Unified Memory Query — single interface across FTS5, vector, sessions, experience, graph
- `aegis memory graph`, `aegis memory ns`, `aegis memory synthesize`

**Key files:** `src/memory/graph.ts`, `src/memory/namespace.ts`, `src/memory/synthesize.ts`, `src/memory/unified-query.ts`, `src/memory/graph-integration.ts`, `src/cli/commands/knowledge.ts`

---

### ✅ v0.9.0 — Distributed Runtime — **SHIPPED**

**What we delivered:**

- Multi-host worker pool with TCP-based bully leader election
- AES-256-GCM encrypted transport with SHA-256 key derivation
- Capacity-aware placement (CPU, memory, GPU scoring)
- Remote management HTTP API (6 routes, HMAC-signed)
- Worker heartbeat monitoring with automatic timeout
- `aegis distributed {start,status,workers,task,info}`
- Distributed spawn integration in AgentManager

**Key files:** `src/distributed/`, `src/cli/commands/distributed.ts`

---

### ✅ v0.10.0 — Self-Improving Agents — **SHIPPED**

**What we delivered:**

- Skill candidate extraction from successful experiences
- Failure clustering with severity scoring
- Adversarial self-play with 8 scenario templates
- Auto-skill packaging to `src/skills/auto-*.ts`
- Self-improvement scheduler (cron: skill extraction 6h, failure clustering 12h)
- `aegis improve skill`, `aegis improve failure`, `aegis improve adversarial`, `aegis improve scheduler`
- Wired into agent lifecycle exit handler

**Key files:** `src/improve/`, `src/cli/commands/improve.ts`

---

### ✅ v1.0.0 — Production-Ready — **SHIPPED**

**What we delivered:**

- RBAC with admin/operator/developer/viewer roles, SHA-256 hashed API keys, 17 route-permission mappings
- Encrypted credential vault — AES-256-GCM with scrypt-derived master key, per-entry IVs
- Vault-to-provider bridge — auto-syncs vault API keys to provider resolution at unlock
- SLO tracking — rolling-window uptime, latency, error rate, burn rate
- Distributed tracing — SQLite-backed trace spans with parent-child relationships
- Production dashboard — aggregated SLOs, costs, failures, agent health
- Background agents — file-watching and scheduled via TriggerEngine
- `aegis production {rbac,vault,slo,dashboard,trace,background}`
- `aegis serve --auth` — RBAC-protected HTTP server
- Trace spans for spawn, IPC, exit events; SLO recording on agent completion

**Key files:** `src/auth/`, `src/vault/`, `src/observability/`, `src/triggers/background.ts`, `src/cli/commands/production.ts`

---

### 🛠️ v0.10.x — Platform Stability & Resilience — **ACTIVE**

**What it delivers:** The CLI won't freeze. Shutdowns are always clean. SIGTERM is never ignored.

| Deliverable | Description |
|-------------|-------------|
| **CLI freeze fix** | Stdin readline symbol leak after `@clack/prompts` teardown — stripped via `resetStdinAfterClack()` in `wakeup.ts` |
| **SIGINT passthrough for children** | 1st Ctrl+C sends SIGINT to child process, 2nd sends SIGTERM, 3rd force-kills — `wakeup.ts:110-125` |
| **Adapter shutdown safety** | `.catch(() => process.exit(1))` on all 7 adapter `.stop()` chains + fire-and-forget fix in webhook adapter |
| **SIGTERM everywhere** | Added SIGTERM handlers to chat, serve, openapi, agent, telegram, discord, slack, sms, whatsapp, voice, email, distributed, webhook |
| **AEGIS_SPAWNED exit race** | `setTimeout(() => process.exit(0), 100)` in `index.ts` prevents child processes from swallowing signals |

**Key files:** `src/cli/wakeup.ts`, `index.ts`, `src/cli/commands/*.ts`

**Remaining issues:**

- `status.ts --watch` mode has no SIGINT/SIGTERM handler — terminal state corrupted on unclean exit
- `mcp.ts` discards `stop()` handle — MCP server never stopped cleanly

---

### 🔮 v0.11.0 — Plugin Marketplace & WebSocket Gateway

**What it unlocks:** Extend without forks. Collaborate in real-time.

| Deliverable | Description |
|-------------|-------------|
| **Signed Plugin Registry** | Plugin version resolution, dependency management, signature verification |
| **Plugin CLI** | `aegis plugin {publish,install,list,remove}` with integrity checks |
| **WebSocket Gateway** | Real-time multi-user dashboards with per-user agent state streaming |
| **Multi-User Sessions** | Shared agent workspaces with live activity streaming |

---

### 🔮 v0.12.0 — Multi-Agent Teams at Scale

**What it unlocks:** Teams form and dissolve around tasks. Coordinators are elected by capability. Disagreements are arbitrated.

| Deliverable | Description |
|-------------|-------------|
| **Typed Multi-Agent Trees** | Agents declare typed inputs, outputs, and preconditions |
| **Coordinator Election** | Dynamic lead agent selection by capability matching |
| **Debate Topology** | Third-agent arbitration for agent disagreement resolution |
| **Cross-Team Memory** | Team A's learnings queryable by Team B with access policies |

---

### 🔮 v0.13.0 — Tool-Level Economy

**What it unlocks:** Every action has a price. Every dollar has a benchmark. Agents self-throttle.

| Deliverable | Description |
|-------------|-------------|
| **Per-Tool Pricing Registry** | Every tool has compute/API/I/O cost + latency profile |
| **Budgeted Agents** | `budget_usd` on task definition; agent self-manages spend |
| **Spot Routing** | Cross-provider cost router picks cheapest provider at runtime |
| **Public Benchmarks** | `quality / USD` leaderboard per provider per task class |
| **Cost Spike Alerts** | Automated Slack/Discord alerts on budget breach |

---

## 5. Beyond v0.13.0 — The Long Game

Once the near-term milestones are shipped, Aegis becomes a *platform*, not a product. Three big bets take over.

### A. Self-improving runtime (Karpathy-delta closure)

The ratchet primitive, experience replay, benchmark suite, and self-improvement scheduler are already scaffolding. v1.x turns them into a fully closed feedback loop.

- **Failure prioritization** — grouped failures ranked by frequency, blast radius, and user impact
- **Dashboard v2** — knowledge graph visualization with interactive entity exploration
- **Adversarial regression auto-feed** — red-team findings auto-incorporated into system prompts as known failure patterns

### B. Tool-level economy

Agents bid for compute. Agents pay for tool calls. The system surfaces the cheapest viable path at runtime, not at design time.

- **Dynamic provider switching mid-task** — if one provider degrades, seamlessly switch mid-stream
- **Cost-per-outcome optimization** — system selects provider+model to minimize `cost / successful outcome`
- **Cross-session cost rollup** — project-level billing summaries with per-contributor attribution

### C. Multi-agent orchestration at platform scale

Today, orchestration is a single orchestrator driving a fan-out. Tomorrow, swarms form and dissolve around tasks.

- **Declarative swarm specs** — YAML defines agent composition, budget, and success criteria
- **Convergence detection** — swarm auto-terminates when consensus is reached or diminishing returns detected
- **Debate tree pruning** — active learning to prune low-value debate branches

---

## 6. What We Are *Not* Building

Equally important. The roadmap is shaped as much by what we say no to as what we say yes to.

- **No SaaS host.** Aegis runs on your hardware. We do not host agents for you.
- **No fine-tuning platform.** Use a dedicated service for that. Aegis consumes models; it does not train them.
- **No chat UI zoo.** One web app, one TUI, one mobile-friendly view via the chat platform adapters. The UI is a tool, not a product.
- **No multi-tenant by default.** Single-user, single-host is the default. Multi-tenant arrives in v0.9.0, and even then it's a configuration, not a default.
- **No "AI features" sprinkled on a product.** Aegis is an agent OS. It's not a CRM with AI inside.

---

## 7. Contributing to the Roadmap

Three ways to influence what ships next.

1. **Open a Discussion** in the [RFCs category](https://github.com/KunjShah95/neuron-os/discussions/categories) for a feature that touches more than one module.
2. **Open an issue** labeled `roadmap` for a focused, single-module proposal. Include a use case, a user persona, and a rough sketch of the API.
3. **Pick up a spec** from [`docs/superpowers/specs/`](docs/superpowers/specs/) and ship it. Open specs are fair game; closed specs are waiting on a decision.

The roadmap is **a living document**. Items move between milestones based on user signal, maintainer capacity, and incoming RFCs. If something is missing, file it. If something is wrong, fix it. If something is unblocked, ship it.

Welcome to the OS.
