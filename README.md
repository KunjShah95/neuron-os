# Neuron OS

*The Operating System for Autonomous AI Agents*

[![Version](https://img.shields.io/badge/version-1.1.9-blue)](https://www.npmjs.com/package/neuron-aegis)
[![npm](https://img.shields.io/npm/v/neuron-aegis)](https://www.npmjs.com/package/neuron-aegis)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.3.14-black)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)](https://www.typescriptlang.org)
[![GitHub](https://img.shields.io/badge/GitHub-KunjShah95%2Fneuron--os-181717?logo=github)](https://github.com/KunjShah95/neuron-os)

> **Neuron OS** is a local-first, TypeScript-native operating system for autonomous AI agents. Spawn typed agents, watch them work in real-time across terminal, web, chat, and API surfaces, and trust every action through built-in audit logging, per-agent tool policies, cost attribution, and an encrypted credential vault.

---

## Install

```bash
npm install -g neuron-aegis
```

Requires [Bun](https://bun.sh) >= 1.3.14. If Bun is not installed, the CLI will print the one-line install command.

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1|iex"
```

**Other install methods:**

```bash
# NPX (no global install)
npx neuron-aegis

# From source
git clone https://github.com/KunjShah95/neuron-os.git
cd neuron-os && bun install
bun run index.ts

# Docker
docker run -d --name aegis -p 8080:8080 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  ghcr.io/kunjshah95/neuron-os:latest

# curl installer (Linux/macOS — prebuilt binary)
curl -fsSL https://raw.githubusercontent.com/KunjShah95/neuron-os/main/install.sh | bash

# Windows PowerShell installer
irm https://raw.githubusercontent.com/KunjShah95/neuron-os/main/install.ps1 | iex
```

---

## Quick Start

```bash
aegis setup-keys     # configure your AI provider API key
aegis doctor         # verify installation
aegis wakeup         # interactive mode picker
```

Or jump straight in:

```bash
aegis chat                          # streaming AI chat TUI
aegis ask "explain this codebase"   # one-shot query
aegis agent spawn build             # spawn a build agent
aegis orchestrate "add dark mode"   # multi-agent goal execution
```

---

## CLI Commands

Run `aegis <command> --help` for detailed usage on any command.

### First Run

| Command | Description |
|---------|-------------|
| `aegis wakeup` | Interactive mode picker (36 TUI modes) |
| `aegis init` | First-run quick-start wizard |
| `aegis setup` | Guided workspace configuration |
| `aegis setup-keys` | Interactive API key configuration (13 providers) |
| `aegis doctor` | System health diagnostics — checks providers, DB, adapters |
| `aegis status` | System overview — agents, memory, runtime |
| `aegis health` | Deep health check |
| `aegis version` | Show version |

### AI & Chat

| Command | Description |
|---------|-------------|
| `aegis chat` | Streaming AI chat TUI (multi-provider, sessions, history) |
| `aegis ask <question>` | One-shot codebase question, read-only |
| `aegis plan <goal>` | Generate a step-by-step implementation plan |
| `aegis research <goal>` | Autonomous research loop with ratchet safety |
| `aegis orchestrate <goal>` | Decompose and execute a goal across multiple parallel agents |
| `aegis supervise <goal>` | Spawn an agent and auto-restart on failure |

### Agent Management

| Command | Description |
|---------|-------------|
| `aegis agent spawn <type>` | Spawn a typed agent |
| `aegis agent kill <id>` | Kill an agent |
| `aegis agent list` | List running agents |
| `aegis agent logs <id>` | Stream agent logs |
| `aegis agent inspect <id>` | Detailed agent state |
| `aegis agent prewarm` | Manage pre-warmed agent pool |
| `aegis agent-run <goal>` | Approval-based agent orchestrator |
| `aegis pool` | Worker pool management |
| `aegis reflect <session-id>` | Score progress and suggest next steps for a session |

### Memory & Knowledge

| Command | Description |
|---------|-------------|
| `aegis memory stats` | Memory store statistics |
| `aegis memory search <query>` | Semantic search across all stores |
| `aegis memory synthesize <topic>` | Cross-store knowledge synthesis |
| `aegis memory prune` | Remove stale memories |
| `aegis memory export` | Export memory to JSON |
| `aegis agentmemory` | Hybrid BM25+Vector+Graph sidecar (95.2% R@5) |
| `aegis session list` | List saved sessions |
| `aegis session resume <id>` | Resume a previous session |
| `aegis session export <id>` | Export session transcript |
| `aegis session prune` | Delete old sessions |
| `aegis knowledge` | Knowledge graph management |
| `aegis insights` | Cross-DB analytics joining audit, billing, experience, telemetry |
| `aegis experience` | Experience replay buffer — agent trajectory tracking |

### Consciousness & Self-Improvement

| Command | Description |
|---------|-------------|
| `aegis dream run` | Trigger 6-phase dream cycle (replay → pattern → compress → counterfactual → social → mood) |
| `aegis dream insights` | Show generated insights from last dream cycle |
| `aegis evolve run` | Propose and apply code mutations verified by tests |
| `aegis evolve list` | List pending mutations |
| `aegis persona show` | Agent 8-trait personality profile |
| `aegis persona evolve` | Evolve traits from recent experience |
| `aegis soul card` | Archetype soul card with mood state |
| `aegis soul mood` | Current mood and behavioral heuristics |
| `aegis social status` | Peer discovery and gossip network status |
| `aegis social share` | Share insights/mutations with peers |
| `aegis improve skill` | Skill extraction from successful experiences |
| `aegis improve failure` | Failure clustering and analysis |
| `aegis improve adversarial` | Adversarial self-play red-teaming |
| `aegis improve monitor` | Watch improvement progress live |
| `aegis reflect <session-id>` | Score a session and generate next-step suggestions |
| `aegis predict` | Failure risk forecast and cost trend analysis |
| `aegis train record` | Record agent trajectory for fine-tuning export |
| `aegis train export` | Export trajectories (atropos/jsonl format) |

### Evaluation & Quality

| Command | Description |
|---------|-------------|
| `aegis eval run <suite>` | Run eval harness suite |
| `aegis eval ci` | CI gate — exit 1 if below baseline |
| `aegis eval baseline` | Set new quality baseline |
| `aegis eval experiment` | Manage eval experiments |
| `aegis harness run` | Run harness test suites |
| `aegis harness report` | Generate harness report |
| `aegis benchmark run` | Agent quality regression detection |
| `aegis benchmark baseline` | Update quality baseline |
| `aegis bench run <task>` | Benchmark all providers on a task |
| `aegis bench list` | List benchmark history |
| `aegis adversarial run` | Adversarial self-play red-team scenarios |
| `aegis ci` | Full CI: tests + typecheck + lint + docs check |

### Cost & Economy

| Command | Description |
|---------|-------------|
| `aegis cost total` | Total spend to date |
| `aegis cost models` | Spend breakdown by model |
| `aegis cost sessions` | Spend breakdown by session |
| `aegis cost budget` | Set or show budget |
| `aegis cost report` | Full cost report |
| `aegis router route <task>` | Auto-select cheapest viable provider for a task |
| `aegis router list` | Provider routing scores |
| `aegis estimate <goal>` | Pre-flight cost estimate before spawning |
| `aegis pricing` | Current provider pricing table |
| `aegis metrics` | Runtime metrics snapshot |

### Multi-Agent Coordination

| Command | Description |
|---------|-------------|
| `aegis mesh run <spec>` | Run a multi-agent mesh (5 topologies: sequential, fan-out, debate, ensemble, supervisor) |
| `aegis mesh status` | Mesh run status |
| `aegis debate start` | Structured agent debate with 3 arbitrator types |
| `aegis workflow run <file>` | Execute a workflow YAML pipeline |
| `aegis workflow build` | TUI workflow builder — compose pipelines as directed graphs |

### Platform Adapters

| Command | Description |
|---------|-------------|
| `aegis discord` | Start Discord bot adapter |
| `aegis slack` | Start Slack bot adapter |
| `aegis telegram` | Start Telegram bot adapter |
| `aegis email` | Start email (SMTP/Nodemailer) adapter |
| `aegis sms` | Start SMS adapter (Twilio) |
| `aegis whatsapp` | Start WhatsApp adapter (Twilio) |
| `aegis voice` | Voice call adapter (Twilio TTS) |
| `aegis voice-local` | Local voice mode (STT/TTS) |
| `aegis webhook` | Start generic webhook receiver (GitHub, Twilio, generic) |

### Infrastructure & APIs

| Command | Description |
|---------|-------------|
| `aegis serve` | Start HTTP REST API + WebSocket server (port 8080) |
| `aegis mcp serve` | Start MCP server — exposes `spawn_agent`, `list_agents`, `send_message`, `get_agent_output` to any MCP client |
| `aegis mcp connect` | Connect to external MCP servers configured in `aegis.config.json` |
| `aegis mcp list` | List configured MCP servers and registered tools |
| `aegis distributed start` | Start a distributed worker |
| `aegis distributed status` | Worker pool status |
| `aegis production dashboard` | Production SLO + cost + health dashboard |
| `aegis tls setup` | Configure TLS for API server |
| `aegis cron list` | List scheduled jobs |
| `aegis cron add <schedule> <cmd>` | Add a cron job |
| `aegis trigger list` | List triggers (cron, file_watch, webhook, condition) |
| `aegis trigger add` | Add a trigger |
| `aegis openapi` | Generate OpenAPI 3.0 spec from routes |

### Developer Tools

| Command | Description |
|---------|-------------|
| `aegis config set <key> <value>` | Set a configuration value |
| `aegis config get <key>` | Get a configuration value |
| `aegis config list` | List all config |
| `aegis skills list` | Browse installed skills |
| `aegis skills install <name>` | Install a skill from marketplace |
| `aegis skills list-staged` | List auto-extracted skill candidates awaiting approval |
| `aegis skills approve <id>` | Approve a staged skill — writes it to `src/skills/` |
| `aegis profile list` | List all agent identity profiles |
| `aegis profile create` | Create a new agent profile (`--type`, `--name`, `--model`) |
| `aegis profile get <id>` | Print a profile as JSON |
| `aegis profile delete <id>` | Delete a profile |
| `aegis profile set-default <id>` | Set the default profile for an agent type |
| `aegis toolset list` | List composable tool bundles |
| `aegis toolset new <name>` | Create a custom toolset |
| `aegis plugin install <name>` | Install a signed plugin |
| `aegis plugin publish` | Publish a plugin to the marketplace |
| `aegis plugin list` | List installed plugins |
| `aegis plugin remove <name>` | Remove a plugin |
| `aegis marketplace search <query>` | Search the agent marketplace |
| `aegis sandbox` | Sandbox status and controls |
| `aegis computer` | Computer use tool interface |
| `aegis audit log` | View append-only audit log |
| `aegis audit query` | Query audit log by agent, time range, event type |
| `aegis providers list` | List all 13 AI providers with config status |
| `aegis providers test <name>` | Test provider connectivity |
| `aegis docscrawl` | Crawl and index documentation sites |
| `aegis project list` | List project workspaces |
| `aegis project switch <name>` | Switch active project |
| `aegis project new <name>` | Create an isolated project workspace |
| `aegis telemetry status` | Telemetry pipeline status (opt-in, no PII) |
| `aegis completion bash` | Generate bash shell completion script |
| `aegis completion zsh` | Generate zsh shell completion script |

---

## Agent Types (14)

| Type | Access | Tools | Use case |
|------|--------|-------|----------|
| `build` | primary | all | Full-access development |
| `plan` | primary | read-only | Architecture and planning |
| `main` | primary | read, web, bash | Default general-purpose |
| `read` | subagent | read-only | Fast codebase exploration |
| `write` | subagent | write, edit, read | File creation and editing |
| `test` | subagent | bash (restricted), read | Test execution |
| `validate` | subagent | read, bash (lint) | Typecheck and lint |
| `review` | subagent | read-only | Code review |
| `debug` | subagent | all | Systematic debugging |
| `document` | subagent | read, write | Documentation |
| `refactor` | subagent | read, write, edit | Code restructuring |
| `deploy` | subagent | bash (deploy), read | Deployment and CI/CD |
| `monitor` | subagent | bash, read | File watching and health |
| `explore` | subagent | read-only | Lightweight search |

---

## AI Providers (13)

All providers routed through a unified `Provider` interface. The model router auto-selects cheapest viable provider per task type.

| Provider | Key env var | Notes |
|----------|-------------|-------|
| Anthropic | `ANTHROPIC_API_KEY` | Default; Claude Sonnet 4.x |
| OpenAI | `OPENAI_API_KEY` | GPT-4o, o3-mini |
| DeepSeek | `DEEPSEEK_API_KEY` | Low-cost reasoning |
| Groq | `GROQ_API_KEY` | Free tier; fast Llama 3.3 70B |
| Gemini | `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini 2.0 Flash |
| Mistral | `MISTRAL_API_KEY` | mistral-large |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` | Enterprise Azure endpoint |
| Together AI | `TOGETHERAI_API_KEY` | Open-source models |
| OpenRouter | `OPENROUTER_API_KEY` | 200+ models; free `:free` tier |
| xAI | `XAI_API_KEY` | Grok |
| Cohere | `COHERE_API_KEY` | Command R |
| Perplexity | `PERPLEXITY_API_KEY` | Search-augmented |
| Ollama | `OLLAMA_URL` | Local inference, no key needed |

Switch at runtime in chat TUI: `/provider set openai`, `/provider set anthropic model=claude-sonnet-4-20250514`

---

## Platform Adapters (11)

One multi-platform gateway. All adapters share the same agent runtime.

Discord · Slack · Telegram · SMS (Twilio) · Voice (Twilio) · WhatsApp (Twilio) · Email (SMTP) · Webhook (GitHub, generic) · Matrix · Signal · IRC

---

## Architecture

### Module Map

| Module | Path | What it does |
|--------|------|-------------|
| CLI | `src/cli/` | 80+ command registration, banner, theme |
| Modes | `src/modes/` | 36 TUI mode screens |
| Agent | `src/agent/` | Lifecycle, IPC, hooks, pool, soul, engine |
| Profile | `src/profile/` | Per-type identity profiles stored in `~/.aegis/profiles/` |
| Soul | `src/agent/soul.ts` | 8 archetypes, 6 moods, behavioral heuristics |
| Chat TUI | `src/chat/` | Streaming chat UI, sessions, provider switching |
| Dashboard TUI | `src/tui/` | Live dashboard rendering |
| Web Dashboard | `dashboard/` | Vite + React 19 frontend (Costs, SLOs, Audit, Agents) |
| Website | `website/` | Marketing site (Vite + React 19 + Framer Motion) |
| Tools | `src/tools/` | Tool registry + `brave_search` / `gateway_fetch` gateway |
| Toolsets | `src/toolsets/` | 10 composable bundles with dependency resolution |
| Skills | `src/skills/` | Skill registry, staging store, marketplace client |
| Memory | `src/memory/` | Session store, knowledge graph, vector, namespaces, synthesis |
| Experience | `src/experience/` | Replay buffer, retrieval, skill curation |
| Dream | `src/dream/` | 6-phase idle dream cycle + insight injector |
| Evolve | `src/evolve/` | Auto-code mutation with typecheck+test verification |
| Persona | `src/persona/` | 8-trait personality evolution |
| Social | `src/social/` | Gossip protocol, peer discovery, reputation |
| Improve | `src/improve/` | Skill extraction, failure clustering, adversarial self-play, skill staging |
| Economy | `src/economy/` | Cost routing, pricing registry, budget guard, pre-flight |
| Mesh | `src/mesh/` | 5 orchestration topologies, 7 agent roles |
| Debate | `src/debate/` | Structured disagreement resolution, 3 arbitrator types |
| Harness | `src/harness/` | Eval suite, graders, golden dataset, CI gate, experiments |
| Training | `src/training/` | Trajectory recorder and export |
| Plugin | `src/plugin/` | Ed25519-signed plugins, semver resolution, 5 hook points |
| Distributed | `src/distributed/` | Multi-host pool, bully election, AES-256 transport |
| Adapters | `src/adapters/` | 11-platform gateway |
| API | `src/api/` | HMAC-signed REST server |
| Auth | `src/auth/` | RBAC, API key auth, middleware |
| Vault | `src/vault/` | AES-256-GCM credential vault, scrypt key derivation |
| Audit | `src/audit/` | Append-only audit log, secrets scrubbing |
| Billing | `src/billing/` | Per-call cost tracking, budget enforcement |
| Observability | `src/observability/` | SLO tracking, distributed tracing, production dashboard |
| Sandbox | `src/sandbox/` | Policy engine, Docker isolation |
| MCP | `src/mcp/` | MCP client + server (agent tools exposed via JSON-RPC) |
| Workflow | `src/workflow/` | YAML pipeline executor |
| Marketplace | `src/marketplace/` | Agent config registry with Ed25519 signing |
| Project | `src/project/` | Isolated per-project workspaces |
| Session | `src/session/` | Multi-user session store with WebSocket forwarding |

### System Flow

```
User (CLI / Web / Chat Platform)
        │
        ▼
   AgentManager  ──── IPC (JSON-lines over stdin/stdout) ────►  Worker Process
        │                                                              │
        ├── Soul Engine (archetype + mood → system prompt)            │
        ├── Profile Store (~/.aegis/profiles/)                        │
        ├── Memory System (KG + vector + FTS5 + sessions)             │
        ├── Economy (cost routing + budget guard)                     │
        ├── Audit Store (append-only, secrets scrubbed)               │
        ├── Plugin Hooks (5 lifecycle points)                         │
        └── Dream Engine (idle-time insight injection)                │
                                                                       │
                                                     ReAct loop (Vercel AI SDK)
                                                     Tool calls gated by PolicyEngine
                                                     Context compaction at token threshold
```

---

## Security

| Control | Implementation |
|---------|---------------|
| Per-agent tool permissions | `ToolPermission[]` per agent type; `read`, `write`, `bash`, `grep`, `glob`, `web_search`, `brave_search`, `gateway_fetch`, `read_skill` |
| Pattern-restricted bash | `test`, `validate`, `deploy` types only run approved command patterns |
| Secrets scrubbing | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `sk-*`, `Bearer *`, `*_KEY=`, `*_SECRET=` patterns redacted from all 4 audit log fields before SQLite write |
| HMAC-signed REST API | All endpoints require signed requests with replay-protection window |
| RBAC | Admin / operator / developer / viewer roles; SHA-256 hashed API keys |
| Encrypted vault | AES-256-GCM with scrypt-derived master key, per-entry random IVs, key rotation |
| Signed plugins | Ed25519 signature + SHA-256 checksum verified at install |
| Distributed transport | AES-256-GCM between workers with SHA-256 derived shared key |
| Docker sandboxing | High-risk agent types run with `--cap-drop ALL` and read-only rootfs |
| Policy engine | Regex-based rule evaluation on file paths and shell commands; `strictMode` denies by default |
| Local by default | No telemetry unless opted in; all data stays on the machine |

---

## Environment Variables

### AI Providers

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) |
| `OPENAI_API_KEY` | OpenAI (GPT-4o, o3) |
| `DEEPSEEK_API_KEY` | DeepSeek |
| `GROQ_API_KEY` | Groq (free Llama tier) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini |
| `MISTRAL_API_KEY` | Mistral |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI |
| `TOGETHERAI_API_KEY` | Together AI |
| `OPENROUTER_API_KEY` | OpenRouter |
| `XAI_API_KEY` | xAI / Grok |
| `COHERE_API_KEY` | Cohere |
| `PERPLEXITY_API_KEY` | Perplexity |
| `OLLAMA_URL` | Ollama base URL (default: `http://localhost:11434`) |
| `AEGIS_AI_API_KEY` | Universal fallback if no provider-specific key found |

### Runtime

| Variable | Default | Description |
|----------|---------|-------------|
| `AEGIS_DEFAULT_PROVIDER` | `anthropic` | Default provider name |
| `AEGIS_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `AEGIS_MODEL_ROUTER` | `auto` | Set to `disabled` to bypass routing |
| `AEGIS_PREFLIGHT` | `enabled` | Set to `disabled` to skip cost pre-flight checks |
| `AEGIS_MAX_TURNS` | `50` | Hard ceiling on ReAct loop turns per agent run |
| `AEGIS_NO_DOTENV` | — | Set to `1` in CI to skip `.env` loading |
| `AEGIS_DISTRIBUTED` | — | Set to enable multi-host worker pool |
| `AEGIS_CLUSTER_SECRET` | — | Shared secret for distributed AES-256 transport |

### Integrations

| Variable | Description |
|----------|-------------|
| `BRAVE_SEARCH_API_KEY` | Enables `brave_search` tool via Brave Search API |
| `AGENTMEMORY_URL` | agentmemory sidecar URL (default: `http://localhost:3111`) |
| `AGENTMEMORY_SECRET` | Bearer token for agentmemory auth |
| `AGENTMEMORY_ENABLED` | Set to `false` to disable sidecar |
| `AEGIS_API_KEY` | API key required for REST server auth |
| `AEGIS_VAULT_KEY` | Master key for AES-256-GCM credential vault |
| `AEGIS_SANDBOX` | Set to `docker` for container-isolated agent execution |

Copy `.env.example` to `.env` and fill in at least one provider key. The postinstall script does this automatically on `npm install`.

---

## Development

```bash
# Typecheck
bun run typecheck

# Run tests
bun test src/dream/engine.test.ts      # single file
bun run test                           # full suite

# CI (typecheck + lint + docs check + tests)
bun run ci

# Lint / format
bun run lint
bun run format

# Generate docs
bun run docs:generate     # writes shared/commands.json from CLI source
bun run docs:check        # verifies docs are current (runs in CI)

# Benchmarks
bun run bench
bun run bench:update      # run and update baseline

# OpenAPI spec
bun run openapi

# Build prebuilt binaries
bun run build:binary                   # Windows x64
bun run build:binary:linux             # Linux x64
bun run build:binary:mac               # macOS x64
bun run build:binary:mac-arm64         # macOS ARM64

# Web frontends
cd dashboard && bun install && bun run dev    # :5173
cd website  && bun install && bun run dev    # :5173

# Docker
bun run docker:build
bun run docker:up
bun run docker:up:dev
```

### Adding Things

| Thing | How |
|-------|-----|
| New CLI command | Create `src/cli/commands/<name>.ts`, export `register<Name>(program)`, import in `src/cli/commands/index.ts` |
| New agent type | Add to `AGENT_TYPES` in `src/agent/agent-types.ts` |
| New TUI mode | Create in `src/modes/`, implement `Mode` interface, register in `src/modes/index.ts` |
| New tool | Implement and register in `src/tools/registry.ts` |
| New adapter | Implement gateway interface in `src/adapters/` |
| New dashboard page | Add route in `dashboard/src/routes/`, wire in `App.tsx` and `Sidebar.tsx` |

### Test Patterns

```typescript
// SQLite stores — pass dbPath for temp isolation
new ExperienceStore({ dbPath: "/tmp/test.db" })

// Mutations
makeMutation()  // creates test mutation with default values

// Dream/Evolution engines — pass partial config via constructor
new DreamEngine({ dbPath: "/tmp/dream.db" })
```

---

## Docker (Production)

```yaml
# docker-compose.prod.yml
services:
  aegis:
    image: ghcr.io/kunjshah95/neuron-os:latest
    ports: ["8080:8080"]
    volumes: [aegis-data:/home/aegis/.aegis]
    environment:
      - AEGIS_API_KEY=${AEGIS_API_KEY}
      - AEGIS_VAULT_KEY=${AEGIS_VAULT_KEY}
      - AEGIS_AUTH_REQUIRED=true
      - AEGIS_SANDBOX=docker
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "bun", "-e", "fetch('http://localhost:8080/api/v1/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3

volumes:
  aegis-data:
```

```bash
echo "AEGIS_API_KEY=$(openssl rand -hex 32)"   > .env
echo "AEGIS_VAULT_KEY=$(openssl rand -hex 32)" >> .env
echo "ANTHROPIC_API_KEY=sk-ant-..."            >> .env
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

---

## Roadmap

### ✅ Shipped

| Version | Theme | Key Deliverables |
|---------|-------|-----------------|
| v0.7.0 | Cost Attribution | `aegis cost`, `aegis bench providers`, 13-provider pricing registry, model router |
| v0.8.0 | Long-Term Memory | SQLite knowledge graph, vector memory, per-agent namespaces, unified query |
| v0.9.0 | Distributed Runtime | Multi-host pool, bully leader election, AES-256-GCM transport |
| v0.10.0 | Self-Improving Agents | Skill extraction, failure clustering, adversarial self-play, 6h/12h cron |
| v0.11.0 | Plugin Marketplace | Ed25519-signed plugins, semver resolution, WebSocket gateway |
| v0.12.0 | Multi-Agent Teams | 5 mesh topologies, 7 agent roles, debate engine, signed decisions |
| v0.13.0 | Consciousness Layer | Soul engine, dream engine, evolution engine, persona system, social network |
| v0.14.0 | Eval & Training | Eval harness, golden dataset pipeline, trajectory recorder, CI gate |
| v1.0.0 | Production-Ready | RBAC, encrypted vault, SLO tracking, distributed tracing, production dashboard |
| v1.1.x | Platform Stability | CLI freeze fix, 3-tier SIGINT, clean shutdown, shared keepAlive utility |
| v1.1.5 | Provider Diversity | NVIDIA NIM, Groq free tier, OpenRouter free tier, default fallback chain |
| v1.1.6 | Dream→Agent Loop | InsightInjector 4-layer system prompt, persistent insight promotion, `aegis version` |
| v1.1.7 | Operational Hardening | Secrets scrubbing in audit log, busy-aware heartbeat, `"hung"` status, skill staging gate |
| v1.1.8 | MCP Ecosystem | MCP server agent tools (`spawn_agent`, `list_agents`, `send_message`, `get_agent_output`), Tool Gateway (`brave_search`, `gateway_fetch`) |
| v1.1.9 | Agent Profile Builder | Per-type identity profiles at `~/.aegis/profiles/`, `aegis profile` CLI |

### 🔮 Upcoming

| Version | Theme | Key Deliverables |
|---------|-------|-----------------|
| v0.15.0 | Tool-Level Economy | Per-tool pricing, budgeted agents, spot routing, cost spike alerts |
| Q1 2027 | Orchestration at Scale | Declarative swarm specs (YAML), convergence detection, debate tree pruning |
| Q2 2027 | Self-Improving Runtime | Failure prioritization, adversarial regression auto-feed, Dashboard v2 |
| v1.2.0 | Performance & Scale | Connection pooling, SSE streaming, 50+ concurrent agents, incremental memory indexing |
| v1.3.0 | Enterprise Integration | SSO/SAML/OIDC, webhook events, OpenTelemetry audit export, RBAC as code |
| v1.4.0 | Plugin Ecosystem | Plugin sandboxing, plugin test framework, marketplace revenue (Stripe) |
| v2.0.0 | Distributed Production OS | Multi-region runtime, hot standby, ML-based cost optimizer, SOC 2 compliance |

Full details in [ROADMAP.md](ROADMAP.md).

---

## Contributing

1. Open a [Discussion](https://github.com/KunjShah95/neuron-os/discussions) for cross-module features
2. Open an [Issue](https://github.com/KunjShah95/neuron-os/issues) labeled `roadmap` for focused proposals
3. Pick up a spec from [`docs/superpowers/specs/`](docs/superpowers/specs/) and ship it

See [docs/](docs/) for architecture guides, security whitepaper, and module documentation.

---

## License

MIT — [KunjShah95](https://github.com/KunjShah95)

---

<p align="center">
  <a href="https://github.com/KunjShah95/neuron-os">GitHub</a> ·
  <a href="https://www.npmjs.com/package/neuron-aegis">npm</a> ·
  <a href="https://github.com/KunjShah95/neuron-os/discussions">Discussions</a> ·
  <a href="https://github.com/KunjShah95/neuron-os/issues">Issues</a>
</p>
