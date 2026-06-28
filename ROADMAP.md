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
