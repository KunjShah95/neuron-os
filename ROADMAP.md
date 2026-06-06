# Aegis (Neuron OS) Roadmap

This roadmap outlines planned features, milestones, and priorities for the Aegis project. It is intended as a living document — items may be re-prioritized based on user feedback and maintainers' capacity.

## Vision (long-term)

Build a local-first, extensible platform for running autonomous AI agents with a robust developer experience (TUI, programmatic APIs, and CI/CD integration) for safe experimentation, reproducible workflows, and production-grade automation.

## Near-term (0–3 months)

- Stabilize core agent lifecycle (spawn, heartbeat, graceful shutdown, auto-recovery)
- Harden TUI dashboard and chat rendering (accessibility, window-resize behavior)
- Add comprehensive unit and integration tests for AgentManager and IPC
- Provide official `CONTRIBUTING.md` and basic CI pipelines (typecheck, lint, tests)
- Improve provider abstraction for Anthropic/OpenAI/Ollama (pluggable providers)

## Mid-term (3–9 months)

- Plugins & skill marketplace (pluggable tools and community skills)
- Persistent session store and UI for replaying agent traces
- Remote management API (HTTP) with authentication for headless deployments
- First-class packaging/publishing for worker images and prebuilt bundles
- UI improvements: pane resizing, filterable activity logs, agent tagging

## Long-term (9+ months)

- Multi-host orchestration (run agents across multiple machines/VMs)
- Built-in policy engine and sandboxing for untrusted code execution
- Managed discovery & scheduling with capacity-aware placement
- Integrations: GitHub, Slack, Jira, and cloud builders (Azure, GCP, AWS)

## Milestones

### v0.2.0 — Provider Expansion & Commands (Current)

**New Providers Added:**
- Gemini (Google) — OpenAI-compatible endpoint via `generativelanguage.googleapis.com`
- Groq — Ultra-fast inference with Llama, Mixtral, Gemma models
- OpenRouter — Multi-model gateway with unified billing

**New Telegram Commands:**
- `/search <query>` — Multi-source search (codebase + memory + web), no AI key needed
- `/models` — List available AI providers and models
- `/memory <query>` — Quick memory/fact recall
- `/config` — View current configuration summary
- `/cron list` — List scheduled cron jobs
- `/logs <name>` — View recent agent logs
- `/agents` — List running agents with status
- `/skill` — List installed skills
- `/chat <msg>` — One-off AI chat without active session
- `/docs <topic>` — Pull documentation from the docs/ directory
- `/history` — View recent command history

**Chaicodeclaw-build Feature Port (Completed):**
- Full plan system: structured JSON schema generation → step selection → staged execution
- Firecrawl web tools: `web_search`, `web_crawl`, `fetch_url`
- Telegram plan sessions: interactive step selection via inline keyboards
- Approval session management with diff viewing (proper unified diffs via `diff` library)
- CLI interactive launcher: figlet banner + mode selection (ask/agent/plan/research)
- Terminal markdown rendering via `marked` + `marked-terminal`
- AgentToolExecutor: full read/write/search/analyze/skill toolset

**Auto-Research Agent (Karpathy-style):**
- `src/modes/research.ts` — Autonomous ratchet loop with hypothesis → implement → test → revert cycle
- Safe git operations: stashes user WIP before starting, targeted file reverts on degradation
- Configurable iterations, test commands, success criteria

**Interactive CLI (`aegis wakeup`):**
- Mode selection with figlet "Neuron OS" banner
- Ask / Agent / Plan / Research / Exit modes
- Proper ESM imports throughout

**Setup Wizard:**
- `aegis setup-keys` now supports: Anthropic, OpenAI, DeepSeek, Gemini, Groq, OpenRouter, Ollama, Custom

### v0.3.0 — Scaling & Multi-Agent
- AgentPool with concurrency limits and task queuing
- Multi-agent orchestration (decompose → parallel execute → review)
- `aegis pool` CLI commands (submit/status/cancel/stats)
- `aegis orchestrate` CLI command
- Webhook receiver for GitHub/GitLab auto PR review
- `aegis webhook` CLI command
- `/research` Telegram command — Karpathy-style autonomous research
- Session persistence — SQLite-backed agent session store
- Comprehensive scaling architecture
- See `docs/scaling-strategy.md` for full plan

### v0.4.0 — Self-Improving System (Current)
- **Experience Replay Buffer** — SQLite-backed trajectory store recording every agent run (goal → actions → outcome)
- **Failure Clustering** — Automatic grouping of agent failures → prioritized improvement suggestions
- **Skill Candidate Extraction** — Detects repetitive successful patterns and proposes reusable skills
- **Audit Trail** — Append-only log capturing every agent thought, tool call, and file mutation for full interpretability
- **Session Replay** — Step-by-step debugger: `aegis audit replay <sessionId>` shows the agent's reasoning process
- **Policy Engine** — Declarative guardrails: 6 built-in policies (no node_modules, no dangerous shell, no sensitive files)
- **Agent Mesh** — Multi-agent coordination: sequential, fan-out, debate, ensemble, and supervisor topologies
- **Task Evaluator** — Automated quality measurement via test runs, lint checks, typechecks, and custom scripts
- **CLI Commands:** `aegis experience`, `aegis audit`, `aegis mesh` with subcommands

### v0.4.1 — Self-Improving Runtime (closes the loop)
- **RatchetRuntime kernel** — Shared `src/agent/ratchet.ts` primitive for stash / measure / revert. `src/modes/research.ts` is a thin wrapper; `AgentEngine.completeSession()` reverts on regression when `--ratchet` is set.
- **Scalar rewards** — `ExperienceRecord.reward` is always `Evaluator.overallScore` (0.0–1.0) when criteria are present; never binary.
- **Experience retrieval at inference** — Top-5 similar past experiences (boosted by outcome + reward) are injected into the system prompt before the first model call, with a "Known failure patterns" hint section for failed/reverted runs.
- **`aegis bench` north-star eval suite** — Function-based discovery (`discoverBenchTasks` / `getBenchTask`), append-only `history.json` (last 100 runs), and `runBenchTask` / `runBenchSuite` runners. 20 starter dogfood tasks under `.aegis/bench/` covering typecheck, tests, CLI help, refactor verification, JSDoc, lint, and integration wiring.
- **CLI flags** — `aegis agent-run --ratchet`, `--eval typecheck,tests-pass,...`, `--test-cmd`. `aegis bench list|run|history|baseline`.
- **Shared embedding utilities** — `src/memory/embedding.ts` (hash + cosine) is the single source; `src/memory/vector.ts` imports from it.
- **Test surface** — `test-embedding`, `test-ratchet`, `test-retrieval`, `test-bench` registered in `scripts/run-tests.ts`.

### v0.5.0 — Plugin system
- Plugins API, simple registry, and sample plugins (lint, format, deploy)
- Skill marketplace integration for community-contributed plugins
- Plugin sandbox with restricted permissions

### v0.6.0 — Multi-platform gateway (in progress)
- `src/adapters/` ships 8 adapters: Discord, Slack, SMS (Twilio), Voice (Twilio), WhatsApp, Email (Nodemailer), Webhook, Bot-Commands — all behind a single `gateway.ts` interface
- HMAC-signed REST API (`src/api/hmac.ts`) for inbound webhooks
- New AI providers: Mistral, Azure OpenAI, Together AI
- Adapter-level test surface (gateway, sms, whatsapp, hmac)
- Marketing landing page (`website/`) — public-facing Vite + React 19 site

### v0.7.0 — Cost attribution & agent benchmarking
- Real implementation of the `2026-06-05-cost-attribution-design.md` spec: SQLite token store, derived USD pricing, rollup queries, `aegis cost {today, week, agent, session, top, budget}` CLI
- Replaces stubbed `src/billing/tracker.ts` and `src/telemetry/cost.ts`
- Benchmark scores in agent run history (cost spike detection)

### v0.8.0 — Knowledge graph & long-term memory
- `src/memory/agentmemory.ts` deeper integration: BM25 + Vector + Graph + Temporal scoring
- Cross-session knowledge synthesis
- Per-agent memory namespaces with TTL and archival

### v0.9.0 — Distributed runtime
- Multi-host worker pool with leader election (Raft or simple)
- Encrypted worker transport (Noise protocol or libsodium)
- Remote management API (HTTP + WebSocket) with HMAC + RBAC

### v1.0.0 — Production-ready
- Remote API, RBAC, audit logging, hardened runtimes
- Plugin marketplace with version resolution
- Background agents with file watching and event-driven triggers
- End-to-end observability (traces, metrics, logs)
- SLA-grade uptime, SLO dashboards, incident playbooks
- Public-facing marketing site, comprehensive docs site, community Discord

## Future Vision (beyond v1.0.0)

Aegis is building toward a **fully local-first, agent-aware operating system**:

- **Self-improving runtime** — agents that measure their own regressions (ratchet), replay failed sessions, and propose skill candidates
- **Tool-level economy** — agents bid for compute, pay for tool calls, and track cost per task across providers
- **Cross-agent teams** — orchestrators that decompose a goal into typed sub-tasks, run them in parallel, and reconcile results
- **Plugin marketplace** — community-contributed agent types, tools, and policies, versioned and signed
- **Open governance** — RFCs in `docs/superpowers/specs/`, public design discussions, and consensus-driven spec evolution

## How to contribute to the roadmap

- Open issues labeled `roadmap` with feature proposals and user scenarios.
- For larger efforts, open a GitHub Discussion in the **RFCs** category (https://github.com/KunjShah95/neuron-os/discussions) and propose a design.
- Browse the **`docs/superpowers/specs/`** directory for in-flight design specs you can pick up.
