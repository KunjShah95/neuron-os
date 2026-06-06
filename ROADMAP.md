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

The current release. Aegis at v0.2.0 is a **production-shaped local agent OS** that already has:

- 12 TUI modes, 14 agent types, 4 working surfaces (terminal / web app / chat platform / API)
- A typed, observable agent runtime with auto-recovery and a lifecycle hook system
- An 8-adapter multi-platform gateway (Discord, Slack, SMS, Voice, WhatsApp, Email, Webhook, Bot-Commands) behind one `gateway.ts` interface
- An HMAC-signed REST API with replay protection
- 6 AI providers, 30+ test suites, 65% line coverage, a clean CI/CD pipeline
- A redesigned marketing landing page and a public roadmap

---

## 4. The Seven Milestones to v1.0.0

### v0.3.0 — Stabilization & Hardening (Q3 2026)

**What it unlocks:** The foundation is solid. CI is green, tests are comprehensive, Docker builds are reliable, and Windows support is first-class.

- Full CI/CD test matrix (Linux, macOS, Windows)
- 80% line coverage across `src/`
- Complete API documentation with TypeDoc
- Docker multi-arch builds (AMD64, ARM64)
- Error boundary coverage on all TUI modes
- Config validation with JSON Schema (`aegis doctor` validates everything)
- Windows Terminal support polish

**Done when:** a new contributor can clone the repo, run `bun install`, and have a green test suite in under 5 minutes on any supported OS.

---

### v0.6.0 — Multi-platform gateway ✅ (Q2 2026 — SHIPPED)

**What it unlocked:** Every team can plug Aegis into the chat platform they already use. The agent becomes reachable where the user is, not where the developer happened to ship the CLI.

- 8 first-class adapters shipped (Discord, Slack, SMS, Voice, WhatsApp, Email, Webhook, Bot-Commands)
- HMAC-signed REST API with replay-protection window
- Per-adapter test coverage (sign / verify / replay / tampering)
- `aegis gateway start` to run a multi-adapter daemon
- Marketing website with docs, changelog, FAQ
- Web dashboard with 12 routes

**Status:** Shipped in v0.2.0.

---

### v0.7.0 — Cost attribution & agent benchmarking

**What it unlocks:** Operators can answer "what did this agent cost me last week?" with a single command. The system enforces per-agent and per-task budgets. Spikes get flagged automatically.

- Real implementation of [`docs/superpowers/specs/2026-06-05-cost-attribution-design.md`](docs/superpowers/specs/2026-06-05-cost-attribution-design.md)
- SQLite token store, derived USD pricing, rollup queries
- `aegis cost {today, week, agent, session, top, budget}` CLI
- Replaces the stubbed `src/billing/tracker.ts` and `src/telemetry/cost.ts`
- Cost-spike detection in the dashboard

**Done when:** `aegis cost week` shows a real per-agent breakdown sourced from actual LLM usage, and the dashboard flags any day that exceeds the configured budget.

---

### v0.8.0 — Knowledge graph & long-term memory

**What it unlocks:** Agents remember what they've learned across sessions, teams, and projects. Knowledge is structured, queryable, and survives process restarts. No more "I forgot the schema I worked on three weeks ago."

- BM25 + Vector + Graph + Temporal scoring in `src/memory/`
- Per-agent memory namespaces with TTL and archival
- Cross-session knowledge synthesis (`aegis memory synthesize <topic>`)
- Knowledge graph visualization in the web app

**Done when:** an agent can answer a question about a project it last touched 30 days ago by name, citing the specific session and tool call it learned the fact from.

---

### v0.9.0 — Distributed runtime

**What it unlocks:** Aegis stops being a single-machine product. Workers can run on any host that trusts the leader, with encrypted transport. A team can scale from 1 to 100 workers without changing the agent spec.

- Multi-host worker pool with leader election (Raft or simple)
- Encrypted worker transport (Noise protocol or libsodium)
- Remote management API (HTTP + WebSocket) with HMAC + RBAC
- Capacity-aware placement — workers self-report CPU, memory, GPU
- Worker health monitoring with automatic respawn

**Done when:** an `agent.yaml` can declare `replicas: 10` and the system will distribute 10 workers across 3 hosts, keep them healthy, and fail over if a host dies.

---

### v1.0.0 — Production-ready

**What it unlocks:** A team can run Aegis as their primary agent platform, hand it to a customer, and sleep at night. This is the version we put on the homepage.

- RBAC, audit logging, hardened runtimes
- SLO dashboards, incident playbooks, on-call docs
- Encrypted-at-rest credential vault with key rotation
- Plugin marketplace with version resolution and signature verification
- Background agents with file watching and event-driven triggers
- SLA-grade uptime, public status page
- End-to-end observability: traces, metrics, logs, in one queryable store

**Done when:** a 50-engineer team can adopt Aegis as their primary agent platform without our involvement, and the 99th percentile of "why did this agent do that?" is answerable in under 5 minutes.

---

## 5. Beyond v1.0.0 — The Long Game

Once v1.0.0 is shipped, Aegis becomes a *platform*, not a product. Three big bets take over.

### A. Self-improving runtime (Karpathy-delta closure)

The ratchet primitive, experience replay, and benchmark suite are already scaffolding. v1.x turns them into a closed loop.

- **Skill candidate extraction** — detect repetitive successful patterns, propose reusable skills, gate by quality
- **Failure clustering** — group similar failures, prioritize improvement suggestions
- **Auto-skill packaging** — a passing skill candidate becomes a published package automatically
- **Adversarial self-play** — agents red-team other agents and feed the regressions back in

### B. Tool-level economy

Agents bid for compute. Agents pay for tool calls. Agents track cost per task across providers. The system surfaces the cheapest viable path at runtime, not at design time.

- **Per-tool pricing registry** — every tool has a cost (compute, API, I/O) and a latency profile
- **Budgeted agents** — `budget_usd: 0.05` on a task definition; the agent self-throttles
- **Cross-provider cost router** — same task, three providers, picked by current spot price and benchmarked quality
- **Cost benchmarks** — public leaderboard of `quality / USD` per provider per task class

### C. Multi-agent teams at scale

Today, orchestration is a single orchestrator driving a fan-out. Tomorrow, teams form and dissolve around tasks.

- **Typed multi-agent tree** — agents declare inputs, outputs, and preconditions
- **Coordinator election** — the right agent leads the right task, by capability
- **Disagreement resolution** — when two agents disagree, a third arbitrates (debate topology)
- **Cross-team memory** — Team A's learnings are queryable by Team B with explicit access policy

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
