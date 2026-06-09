# Neuron OS Roadmap

> *The operating system for autonomous AI agents.*

This is the single source of truth for where Neuron OS is going. The shape of the project has changed since the early "wrap LangChain" days — we now build a full agent OS, not a library. The roadmap below reflects that.

---

## 1. Vision

**Neuron OS is the missing layer between an LLM and a real, running system of work.**

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

1. **Local-first, cloud-portable.** Neuron OS runs on a laptop with `bun run index.ts` and scales to a cluster with the same `agent.yaml` and the same `aegis` binary. There is no SaaS lock-in. The cloud is optional infrastructure, not the product.
2. **Typed all the way down.** Strict TypeScript end-to-end. IPC messages, tool calls, agent events, cost records — everything has a schema. The system catches a wrong shape at the boundary, not at 3am in a log.
3. **Observable by default.** Every action lands in a queryable log. Every agent has a heartbeat. Every long-running task has a checkpoint. You should never have to guess what an agent is doing or why.
4. **Composable, not monolithic.** Agents, tools, skills, policies, adapters, and providers are all pluggable. The core is small. The surface area grows through community modules.
5. **Honest about costs.** Every LLM call is attributed. Every provider is benchmarked. The system tells you what a feature costs before you build it, and tells you what the system cost after it ran.

---

## 3. Shipped Milestones

### ✅ v0.7.0 — Cost Attribution & Benchmarking — **SHIPPED**

- `aegis cost {total,models,sessions,history,budget,report}` — real USD cost tracking
- `aegis benchmark {run,status,baseline}` — regression detection with CI-compatible JSON
- `aegis bench providers "<task>"` — benchmarks all 13 providers on quality + cost
- `aegis insights` — cross-DB analytics across audit, billing, experience, telemetry
- `aegis router route/list/suggest` — auto-selects cheapest provider per task type
- `aegis estimate` — pre-flight cost estimation with warn/block thresholds
- 13 providers tracked in pricing registry with real per-1k-token costs
- Model router wired into agent spawning

**Key files:** `src/economy/`, `src/cli/commands/cost.ts`

---

### ✅ v0.8.0 — Knowledge Graph & Long-Term Memory — **SHIPPED**

- SQLite-backed knowledge graph with entity extraction, relationship linking, confidence scoring
- Per-agent memory namespaces with TTL-based expiry and archival
- Cross-session knowledge synthesis across all 5 memory stores
- Auto-extraction from every completed agent session
- Unified Memory Query — single interface across FTS5, vector, sessions, experience, graph

**Key files:** `src/memory/`

---

### ✅ v0.9.0 — Distributed Runtime — **SHIPPED**

- Multi-host worker pool with TCP-based bully leader election
- AES-256-GCM encrypted transport with SHA-256 key derivation
- Capacity-aware placement (CPU, memory, GPU scoring)
- Remote management HTTP API (6 routes, HMAC-signed)
- Worker heartbeat monitoring with automatic timeout

**Key files:** `src/distributed/`

---

### ✅ v0.10.0 — Self-Improving Agents — **SHIPPED**

- Skill candidate extraction from successful experiences
- Failure clustering with severity scoring
- Adversarial self-play with 8 scenario templates
- Auto-skill packaging to `src/skills/auto-*.ts`
- Self-improvement scheduler (cron: skill extraction 6h, failure clustering 12h)

**Key files:** `src/improve/`

---

### ✅ v1.0.0 — Production-Ready — **SHIPPED**

- RBAC with admin/operator/developer/viewer roles, SHA-256 hashed API keys
- Encrypted credential vault — AES-256-GCM with scrypt-derived master key
- SLO tracking — rolling-window uptime, latency, error rate, burn rate
- Distributed tracing — SQLite-backed trace spans with parent-child relationships
- Production dashboard — aggregated SLOs, costs, failures, agent health
- Background agents — file-watching and scheduled via TriggerEngine

**Key files:** `src/auth/`, `src/vault/`, `src/observability/`

---

### ✅ v0.11.0 — Plugin Marketplace & WebSocket Gateway — **SHIPPED**

- Ed25519-signed plugins with semver dependency resolution, dependency management
- Full plugin CLI: `aegis plugin {publish,install,list,remove,search,info}`
- SQLite plugin registry with dependency graph and 5 hook points
- Bun-native WebSocket gateway (port 8081) with multi-user channels and token auth
- Multi-user SQLite session store with event-driven lifecycle for WebSocket forwarding

**Key files:** `src/plugin/`, `src/adapters/ws-gateway.ts`, `src/session/`

---

### ✅ v0.12.0 — Multi-Agent Teams at Scale — **SHIPPED**

- Mesh orchestrator with 5 topologies: sequential, fan-out, debate, ensemble, supervisor
- 7 typed agent roles: researcher, implementer, reviewer, tester, architect, debugger, coordinator
- Debate engine with structured disagreement resolution
- 3 arbitrator types: agent-based, human-in-the-loop, majority vote
- Signed decision records with optional cryptographic signatures

**Key files:** `src/mesh/`, `src/debate/`

---

### ✅ v0.13.0 — Consciousness Layer — **SHIPPED**

- Soul Engine — 8 archetypes (Architect, Craftsman, Sage, etc.), 6 mood states (elated → burned_out)
- Dream Engine — 6-phase idle-time cycle: memory replay, pattern discovery, knowledge compression, counterfactual exploration, shared dreaming, mood consolidation
- Evolution Engine — 8 mutation strategies with auto-apply and test-backed rollback
- Persona System — 8 tracked traits evolving from experience and dream insights
- Social Network — gossip protocol with file-beacon peer discovery, reputation scoring, trust levels

**Key files:** `src/agent/soul.ts`, `src/dream/`, `src/evolve/`, `src/persona/`, `src/social/`

---

### ✅ v0.14.0 — Eval & Training Pipeline — **SHIPPED**

- Eval harness with grader suite, golden dataset pipeline (silver→gold→audit→archived), CI gate
- Multi-agent eval with 6 coordination patterns, per-agent metrics
- Experiment management and HITL review workflow
- Flaky test detection and budget controller
- Training recorder — full trajectory capture (JSONL) for every agent session
- Export formats: atropos, jsonl

**Key files:** `src/harness/`, `src/training/`

---

## 4. Active & Future Milestones

### ✅ v0.10.x — Platform Stability & Resilience — **SHIPPED**

**What it delivered:** The CLI won't freeze. Shutdowns are always clean. SIGTERM is never ignored.

| Deliverable | Description |
|-------------|-------------|
| **CLI freeze fix** | Stdin readline symbol leak after `@clack/prompts` teardown — extracted to `src/cli/stdin.ts` |
| **SIGINT passthrough** | 3-tier Ctrl+C handling: SIGINT → SIGTERM → force-kill |
| **Adapter shutdown safety** | `.catch(() => process.exit(1))` on all adapter `.stop()` chains |
| **SIGTERM everywhere** | Handlers on chat, serve, mcp, agent, all adapters, distributed |
| **Shared keepAlive() utility** | Centralized shutdown handling in `src/cli/keepAlive.ts` with `registerShutdownHandlers()` |
| **Command history on Ctrl+C** | `process.on("exit")` handler ensures history is written even on early exits |
| **MCP server cleanup** | Captures `stop()` handle and stops MCP HTTP server cleanly on shutdown |

**Key files:** `src/cli/keepAlive.ts`, `src/cli/stdin.ts`, `src/cli/history.ts`, `index.ts`, `src/cli/commands/*.ts`

---

### 🔮 v0.15.0 — Tool-Level Economy

**What it unlocks:** Every action has a price. Every dollar has a benchmark. Agents self-throttle.

| Deliverable | Description |
|-------------|-------------|
| **Per-Tool Pricing Registry** | Every tool has compute/API/I/O cost + latency profile |
| **Budgeted Agents** | `budget_usd` on task definition; agent self-manages spend |
| **Spot Routing** | Cross-provider cost router picks cheapest provider at runtime |
| **Public Benchmarks** | `quality / USD` leaderboard per provider per task class |
| **Cost Spike Alerts** | Automated Slack/Discord alerts on budget breach |

---

### 🔮 Q1 2027 — Multi-Agent Orchestration at Platform Scale

**What it unlocks:** Swarms form and dissolve around tasks. Convergence is detected. Debate is pruned.

| Deliverable | Description |
|-------------|-------------|
| **Declarative Swarm Specs** | YAML defines agent composition, budget, success criteria |
| **Convergence Detection** | Swarm auto-terminates when consensus or diminishing returns detected |
| **Debate Tree Pruning** | Active learning to prune low-value debate branches |

---

### 🔮 Q2 2027 — Self-Improving Runtime (Karpathy-Delta Closure)

**What it unlocks:** The system closes the loop — extract, validate, publish, repeat — without human intervention.

| Deliverable | Description |
|-------------|-------------|
| **Failure Prioritization** | Grouped failures ranked by frequency, blast radius, and user impact |
| **Adversarial Regression Auto-Feed** | Red-team findings auto-incorporated into system prompts as known failure patterns |
| **Dashboard v2** | Knowledge graph visualization + dream engine insights in web app |

---

## 5. What We Are *Not* Building

Equally important. The roadmap is shaped as much by what we say no to as what we say yes to.

- **No SaaS host.** Neuron OS runs on your hardware. We do not host agents for you.
- **No fine-tuning platform.** Use a dedicated service for that. Neuron OS consumes models; it does not train them.
- **No chat UI zoo.** One web app, one TUI, one mobile-friendly view via the chat platform adapters. The UI is a tool, not a product.
- **No multi-tenant by default.** Single-user, single-host is the default.
- **No "AI features" sprinkled on a product.** Neuron OS is an agent OS. It's not a CRM with AI inside.

---

## 6. Contributing to the Roadmap

Three ways to influence what ships next.

1. **Open a Discussion** in the [RFCs category](https://github.com/KunjShah95/neuron-os/discussions/categories) for a feature that touches more than one module.
2. **Open an issue** labeled `roadmap` for a focused, single-module proposal. Include a use case, a user persona, and a rough sketch of the API.
3. **Pick up a spec** from [`docs/superpowers/specs/`](docs/superpowers/specs/) and ship it. Open specs are fair game; closed specs are waiting on a decision.

The roadmap is **a living document**. Items move between milestones based on user signal, maintainer capacity, and incoming RFCs. If something is missing, file it. If something is wrong, fix it. If something is unblocked, ship it.

Welcome to the OS.
