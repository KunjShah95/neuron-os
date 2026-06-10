# Aegis Command Reference

> **Version:** 1.1.6 · **Binary:** `aegis` · **Package:** `neuron-aegis`

---

## Installation

```bash
# Global install (recommended)
npm install -g neuron-aegis

# First-time setup — runs automatically after install
aegis init           # wizard: API keys → doctor → ready

# Or step by step
aegis setup-keys     # configure API keys interactively
aegis doctor         # verify everything is working
aegis wakeup         # see all available commands
```

After install, `aegis` and `neuron-aegis` both work as command names.

---

## Navigation

| Section | Commands |
|---------|----------|
| [Getting Started](#getting-started) | `init`, `setup-keys`, `version`, `wakeup`, `doctor` |
| [AI & Chat](#ai--chat) | `chat`, `ask`, `plan`, `research`, `orchestrate`, `agent-run` |
| [Agent Management](#agent-management) | `agent`, `supervise`, `reflect`, `pool`, `agent-run` |
| [Multi-Agent](#multi-agent) | `mesh`, `debate`, `orchestrate` |
| [Memory](#memory) | `memory`, `agentmemory`, `knowledge` |
| [Consciousness Layer](#consciousness-layer) | `dream`, `evolve`, `soul`, `persona`, `social` |
| [Cost & Routing](#cost--routing) | `cost`, `router`, `estimate`, `pricing`, `benchmark`, `bench` |
| [Configuration](#configuration) | `config`, `setup`, `telemetry` |
| [API & Servers](#api--servers) | `serve`, `mcp`, `webhook` |
| [Adapters](#adapters) | `discord`, `slack`, `telegram`, `email`, `sms`, `voice`, `whatsapp` |
| [Production](#production) | `production`, `distributed`, `tls`, `audit` |
| [Evaluation & Training](#evaluation--training) | `eval`, `harness`, `train`, `benchmark`, `adversarial` |
| [Plugins & Marketplace](#plugins--marketplace) | `plugin`, `marketplace`, `skills`, `toolset` |
| [Projects & Sessions](#projects--sessions) | `project`, `session`, `workflow` |
| [System](#system) | `status`, `health`, `metrics`, `dashboard`, `cron`, `trigger` |
| [Utilities](#utilities) | `completion`, `openapi`, `tls`, `docscrawl`, `insights` |

---

## Getting Started

### `aegis init` · aliases: `quick-start`, `start`
First-run wizard. Checks if provider is configured, runs `setup-keys` if not, then runs `doctor`.
```bash
aegis init
```

### `aegis setup-keys`
Interactive wizard to configure API keys for any provider. Tests each key live before saving.
```bash
aegis setup-keys
```
Supported providers: Anthropic, OpenAI, DeepSeek, Gemini, Groq, Mistral, Azure OpenAI, Together AI, Ollama, OpenRouter, xAI, Cohere, Perplexity, NVIDIA NIM, custom endpoint.

Keys saved to `~/.aegis/agent.env` (or vault if encryption enabled).

### `aegis doctor`
Health check — verifies runtime, providers, directories, vault, sessions, Docker.
```bash
aegis doctor
aegis doctor --verbose    # detailed output per check
aegis doctor --fix        # auto-fix issues where possible
aegis doctor --json       # machine-readable JSON output
```

### `aegis version`
Print current version.
```bash
aegis version     # → 1.1.6
aegis --version   # same
```

### `aegis wakeup` · alias: `w`
Print banner + command list. Entry point after install.
```bash
aegis wakeup
aegis w
```

---

## AI & Chat

### `aegis chat` · alias: `c`
Interactive streaming chat with a typed agent. Full tool access by default.
```bash
aegis chat                            # default agent type
aegis chat -t build                   # full-access dev agent
aegis chat -t plan                    # read-only planning agent
aegis chat -t debug                   # debugging agent
aegis chat --provider anthropic       # force provider
aegis chat --model claude-opus-4-8    # force model
```

**Agent types:** `build`, `plan`, `main`, `read`, `write`, `test`, `validate`, `review`, `debug`, `document`, `refactor`, `deploy`, `monitor`, `explore`

**In-chat commands:**
| Command | Description |
|---------|-------------|
| `/help` | List in-chat commands |
| `/provider set <name>` | Switch provider mid-session |
| `/model set <name>` | Switch model mid-session |
| `/clear` | Clear conversation history |
| `/save` | Save session to disk |
| `/exit` | End session |

### `aegis ask <question>`
Single-shot codebase question. Read-only — no file writes.
```bash
aegis ask "Where is the authentication middleware?"
aegis ask "What does the dream engine do?" --session-db
aegis ask "List all API endpoints" --project myapp
```

### `aegis plan <goal>`
Generate a step-by-step implementation plan for a goal.
```bash
aegis plan "Add rate limiting to the API"
aegis plan "Migrate database to PostgreSQL" --project backend
```

### `aegis research <goal>` · alias: `rs`
Autonomous research loop — iteratively searches, reads, synthesizes.
```bash
aegis research "Best practices for distributed SQLite"
aegis research "How does LangGraph handle state?" -m 5   # max 5 iterations
aegis research "Compare vector DB options" --project ai-eval
```

### `aegis orchestrate <goal>` · alias: `orch`
Decompose a complex goal into parallel sub-tasks, execute with typed agents.
```bash
aegis orchestrate "Build a REST API with auth and tests"
aegis orchestrate "Refactor the payment module" --dry-run   # plan only
```

### `aegis agent-run <goal>` · alias: `ar`
Approval-based orchestrator — shows plan, waits for your go-ahead before each step.
```bash
aegis agent-run "Deploy the staging environment"
aegis agent-run "Update all dependencies" --provider openai
```

---

## Agent Management

### `aegis agent` · alias: `a`
Inspect and manage running agents.
```bash
aegis agent types                     # list agent types + tool access
aegis agent list                      # list all agents
aegis agent list --json               # JSON output
aegis agent spawn myagent             # spawn agent named "myagent"
aegis agent spawn myagent -t build    # spawn with type
aegis agent kill myagent              # kill agent
aegis agent logs myagent              # stream logs
aegis agent inspect myagent           # detailed state
aegis agent prewarm                   # manage pre-warmed agent pool
```

### `aegis supervise <goal>`
Spawn an agent, watch it, auto-restart on failure.
```bash
aegis supervise "Watch the build and fix failures"
aegis supervise "Monitor logs and alert on errors" --max-restarts 3
```

### `aegis reflect <session-id>`
Score a completed session — did the agent make progress? What's next?
```bash
aegis reflect sess_abc123
aegis reflect sess_abc123 --json
```

### `aegis pool`
Manage the agent execution pool (pre-warmed workers).
```bash
aegis pool status
aegis pool size 4     # set pool size
```

---

## Multi-Agent

### `aegis mesh`
Coordinate agent swarms with 5 topologies.
```bash
aegis mesh run sequential "Build, test, then deploy"
aegis mesh run fan-out "Analyze all files in parallel"
aegis mesh run debate "Should we use REST or GraphQL?"
aegis mesh run ensemble "Generate 3 solutions and pick best"
aegis mesh run supervisor "Complete the sprint backlog"

aegis mesh list                          # running meshes
aegis mesh cancel <runId>                # cancel a mesh
aegis mesh eval <runId> <script>         # score a completed run
```

**Topologies:**
| Topology | When to use |
|----------|------------|
| `sequential` | Ordered pipeline — output of each feeds next |
| `fan-out` | Parallel independent tasks, results merged |
| `debate` | Two agents argue a position, arbitrator decides |
| `ensemble` | Multiple solutions generated, best selected |
| `supervisor` | One agent delegates and reviews others |

### `aegis debate`
Structured disagreement and arbitration.
```bash
aegis debate run "REST vs GraphQL for our API"
aegis debate list
aegis debate record <id>    # view decision record
```

---

## Memory

### `aegis memory`
Long-term memory, vector search, knowledge graph.
```bash
aegis memory show                          # view MEMORY.md
aegis memory add "Always use TypeScript strict mode"
aegis memory search "authentication"
aegis memory search "database" --limit 10
aegis memory facts                         # extracted facts
aegis memory stats                         # store stats
aegis memory vector                        # vector index stats
aegis memory query "How does auth work?"   # search all stores
aegis memory status                        # all store health
aegis memory graph                         # knowledge graph stats
aegis memory policy                        # ACL management
```

### `aegis agentmemory` · alias: `am`
Hybrid BM25+Vector+Graph sidecar (95.2% R@5 on LongMemEval-S).
```bash
aegis agentmemory status
aegis agentmemory search "query"
aegis agentmemory start
aegis agentmemory stop
```

### `aegis knowledge`
Knowledge graph operations — entities and relationships extracted from sessions.
```bash
aegis knowledge search "authentication"
aegis knowledge stats
aegis knowledge export
```

---

## Consciousness Layer

> These commands power what makes Neuron OS unique: agents that dream, evolve, and develop personalities.

### `aegis dream`
6-phase idle-time dream cycle. Generates insights from experience.
```bash
aegis dream run                          # run a dream cycle now
aegis dream run --phases memory-replay,pattern-discovery
aegis dream list                         # recent dreams
aegis dream list --limit 20
aegis dream insights                     # generated insights
aegis dream insights --actionable        # only actionable ones
aegis dream share                        # cross-agent knowledge sharing
aegis dream share --agents build,plan    # filtered by agent type
aegis dream config                       # view config
aegis dream config --set minIdleMinutes=5
aegis dream stats                        # cycle statistics
```

**Dream phases:**
1. `memory-replay` — replays past experiences to find patterns
2. `pattern-discovery` — clusters recent experiences
3. `knowledge-compression` — consolidates related dreams
4. `counterfactual` — imagines alternative outcomes for failures
5. `shared-dream-consolidation` — cross-agent knowledge sharing
6. `mood-consolidation` — fleet emotional health tracking

> **v1.1.6:** Dream insights now inject into every agent session's system prompt. High-confidence insights (`confidence ≥ 0.8`, `sourceCount ≥ 3`) persist to `~/.aegis/config.json` and survive restarts.

### `aegis evolve`
Auto-code mutation from dream insights and failure patterns.
```bash
aegis evolve run                         # run evolution cycle
aegis evolve list                        # list mutations
aegis evolve list --status proposed
aegis evolve propose --file src/foo.ts --strategy add-error-handling
aegis evolve apply <mutation-id>         # apply + verify a mutation
aegis evolve rollback <mutation-id>      # rollback applied mutation
aegis evolve stats                       # mutation statistics
aegis evolve config                      # view/update config
aegis evolve config --set autoApplyLowRisk=false
```

**Mutation strategies:** `add-error-handling`, `remove-any-type`, `add-logging`, `optimize-performance`, `add-validation`, `refactor-complexity`, `add-tests`, `fix-todo`

### `aegis soul`
Agent soul cards — archetype, mood, emotional state.
```bash
aegis soul list                          # all agent souls
aegis soul list --json
aegis soul card <agentId>                # full soul card with ASCII art
aegis soul mood <agentId>                # current mood + streak
```

**Archetypes:** Architect, Craftsman, Sage, Scout, Guardian, Alchemist, Oracle, Weaver

**Mood states:** `elated` → `confident` → `content` → `anxious` → `frustrated` → `burned_out`

### `aegis persona`
Agent trait evolution — 8 personality dimensions that grow from experience.
```bash
aegis persona status                     # all persona profiles
aegis persona status --agent build
aegis persona evolve                     # run evolution cycle
aegis persona evolve --agent plan
aegis persona history                    # evolution history
aegis persona config                     # view/update config
```

**Tracked traits:** curiosity, tenacity, caution, creativity, precision, efficiency, collaboration, confidence

### `aegis social`
Multi-instance gossip protocol — peer discovery, reputation, knowledge sharing.
```bash
aegis social register                    # register on network
aegis social status                      # network status
aegis social peers                       # discovered instances
aegis social discover                    # force peer scan
aegis social message --to <peer> --content "Hello"
aegis social inbox                       # received messages
aegis social reputation --peer <id> --score 4
```

---

## Cost & Routing

### `aegis cost` · alias: `spend`
Track every dollar spent across agents, sessions, models.
```bash
aegis cost total                         # total spend vs budget
aegis cost models                        # breakdown by model
aegis cost sessions                      # breakdown by session
aegis cost history                       # daily cost history
aegis cost history --days 30
aegis cost budget                        # show current budget
aegis cost budget 10.00                  # set budget to $10
aegis cost dashboard                     # live cost TUI with trends
aegis cost report                        # full attribution report
aegis cost estimate                      # estimate before running
```

### `aegis router`
Auto-select cheapest provider/model for a task type.
```bash
aegis router route "review this TypeScript code"
aegis router route "build a REST API" --tier balanced
aegis router list                        # all models with pricing
aegis router list --tier cheap
aegis router suggest build               # budget suggestion for agent type
```

### `aegis estimate <goal>`
Pre-flight cost check before spawning an agent.
```bash
aegis estimate "Refactor the auth module"
aegis estimate "Write unit tests for all services" --warn 0.50 --block 2.00
```

### `aegis pricing`
View tool-level pricing registry.
```bash
aegis pricing list
aegis pricing model <name>               # pricing for a specific model
```

### `aegis benchmark`
Track quality regression over time.
```bash
aegis benchmark run
aegis benchmark run --task-path evals/my-task.json
aegis benchmark status                   # last run + drift
aegis benchmark baseline                 # current baseline scores
```

### `aegis bench`
Compare all 13 providers on quality/cost for a task.
```bash
aegis bench run "Summarize this document"
aegis bench list                         # available benchmarks
aegis bench history                      # historical results
```

---

## Configuration

### `aegis config` · alias: `cfg`
Manage credentials and settings stored in `~/.aegis/config.json`.
```bash
aegis config set OPENAI_API_KEY sk-...   # store credential
aegis config get OPENAI_API_KEY          # retrieve
aegis config delete OPENAI_API_KEY       # remove
aegis config list                        # list all keys
aegis config validate                    # validate against schema
```

### `aegis setup`
Full interactive workspace configuration wizard.
```bash
aegis setup                              # interactive wizard
```
Covers: workspace directory, provider, agent name, boot behavior.

### `aegis telemetry` · alias: `tel`
Opt-in anonymous usage metrics (no PII).
```bash
aegis telemetry status
aegis telemetry opt-in
aegis telemetry opt-out
```

---

## API & Servers

### `aegis serve`
Start the HTTP REST API + WebSocket server.
```bash
aegis serve                              # default port 8080
aegis serve --port 3000
aegis serve --auth                       # enable RBAC
aegis serve --auth-required              # require API key
aegis serve --key mysecret               # set API key
aegis serve --cron                       # also start cron engine
aegis serve --webhook-secret abc123      # enable webhook routes
aegis serve --session-db                 # enable session endpoints
```

**Key endpoints:**
| Route | Description |
|-------|-------------|
| `GET /api/v1/health` | Health check |
| `POST /api/v1/chat` | Chat with agent |
| `GET /api/v1/agents` | List agents |
| `POST /api/v1/agents` | Spawn agent |
| `GET /api/v1/sessions` | List sessions |
| `GET /api/v1/cost` | Cost summary |
| `WS :8081` | WebSocket gateway |

### `aegis mcp`
Model Context Protocol integration.
```bash
aegis mcp serve                          # expose Aegis as MCP server
aegis mcp serve --port 3001
aegis mcp connect                        # connect to external MCP servers
aegis mcp list                           # configured servers + tools
```

### `aegis webhook`
Multi-platform webhook receiver.
```bash
aegis webhook --port 9000
aegis webhook --secret mysecret --port 9000
```

---

## Adapters

Each adapter connects Aegis to a chat platform. All share the same agent backend.

### `aegis discord`
```bash
aegis discord --token BOT_TOKEN_HERE
# Or set DISCORD_BOT_TOKEN in env/vault
aegis discord
```

### `aegis slack`
```bash
aegis slack --token xoxb-...  --app-token xapp-...
```

### `aegis telegram` · alias: `tg`
```bash
aegis telegram --token 123456:ABC...
```

### `aegis email`
```bash
aegis email --smtp-host smtp.gmail.com --smtp-user me@gmail.com
```

### `aegis sms`
```bash
aegis sms --account-sid ACxxx --auth-token xxx
```

### `aegis voice`
```bash
aegis voice --account-sid ACxxx --auth-token xxx --twiml-port 3000
```

### `aegis whatsapp`
```bash
aegis whatsapp --account-sid ACxxx --auth-token xxx
```

### `aegis voice-local`
Interactive local voice mode (local STT/TTS, no Twilio).
```bash
aegis voice-local
```

---

## Production

### `aegis production`
Production hardening: RBAC, vault, SLO, distributed tracing.
```bash
# RBAC
aegis production rbac list-roles
aegis production rbac create-key --role developer --name "CI bot"
aegis production rbac revoke-key <key-id>

# Vault
aegis production vault status
aegis production vault unlock
aegis production vault lock
aegis production vault rotate

# SLO
aegis production slo status
aegis production slo set uptime 99.9

# Dashboard
aegis production dashboard

# Traces
aegis production trace list
aegis production trace get <traceId>

# Background agents
aegis production background list
aegis production background start <agentType>
```

### `aegis distributed`
Multi-host worker pool with bully leader election and AES-256-GCM encrypted transport.
```bash
aegis distributed start                   # start this node
aegis distributed start --port 7700 --host 0.0.0.0
aegis distributed status                  # cluster status
aegis distributed workers                 # list all workers
aegis distributed worker <id>             # worker details
aegis distributed task <type> <payload>   # dispatch to best worker
aegis distributed info                    # this node's info
```

### `aegis tls`
TLS certificate management.
```bash
aegis tls gen                             # generate self-signed cert
aegis tls gen --domain myapp.com
aegis tls check                           # verify existing cert
aegis tls env                             # show env vars to use cert
```

### `aegis audit`
Append-only audit trail for every agent action.
```bash
aegis audit list
aegis audit list --session <id>
aegis audit list --type tool_call
aegis audit export --format json
aegis audit stats
```

---

## Evaluation & Training

### `aegis eval`
Full evaluation pipeline with graders, golden datasets, CI gate.
```bash
aegis eval run                            # run eval suite
aegis eval run --suite my-suite.yaml
aegis eval run --provider anthropic
aegis eval report                         # export last run report
aegis eval ci                             # CI gate (exits non-zero on regression)
aegis eval ci --threshold 0.85
aegis eval baseline show                  # current baseline
aegis eval baseline set                   # set current run as baseline
aegis eval experiment list
aegis eval experiment create "Claude vs GPT-4o"
aegis eval review list                    # HITL review queue
aegis eval status                         # harness summary
aegis eval calibrate                      # judge calibration
```

### `aegis harness` · alias: `h`
Lightweight eval runner (simpler than `eval`).
```bash
aegis harness run
aegis harness run --filter "auth"
aegis harness report
aegis harness status
```

### `aegis train`
Training trajectory recording and export.
```bash
aegis train export                        # export all trajectories
aegis train export --format atropos
aegis train export --format jsonl --output ./training-data.jsonl
aegis train export --session <id>
```

### `aegis adversarial` · alias: `adv`
Red-team adversarial self-play — find regressions before they hit prod.
```bash
aegis adversarial run
aegis adversarial run --scenario prompt-injection
aegis adversarial list                    # available scenarios
```

---

## Plugins & Marketplace

### `aegis plugin` · alias: `plugins`
Ed25519-signed plugin lifecycle.
```bash
aegis plugin list                         # installed plugins
aegis plugin search "code review"
aegis plugin info my-plugin
aegis plugin install my-plugin
aegis plugin install my-plugin@1.2.0
aegis plugin remove my-plugin
aegis plugin publish ./my-plugin-dir      # publish to registry
```

Plugin structure requires `plugin.yaml` + `dist/index.js`.

### `aegis marketplace` · alias: `mp`
Agent config marketplace — community agent templates.
```bash
aegis marketplace search "code reviewer"
aegis marketplace info code-reviewer
aegis marketplace install code-reviewer
aegis marketplace list                    # installed agents
aegis marketplace rate code-reviewer 5   # 1-5 stars
aegis marketplace publish ./my-agent     # requires agent.yaml
aegis marketplace update                 # update all installed
```

### `aegis skills`
Browse and manage skills (local + marketplace).
```bash
aegis skills list
aegis skills search "testing"
aegis skills install skill-name
```

### `aegis toolset` · alias: `ts`
Compose and manage tool bundles.
```bash
aegis toolset list                        # all toolsets
aegis toolset show web                    # toolset details
aegis toolset new my-toolset              # create custom
aegis toolset add my-toolset web search   # add tools
```

**Built-in toolsets:** `web`, `search`, `vision`, `code-execution`, `delegation`, `file-ops`, `shell`, `research`, `full-stack`, `all`

---

## Projects & Sessions

### `aegis project` · alias: `proj`
Isolated workspaces — sessions, memory, dreams, evolutions, personas all scoped per project.
```bash
aegis project list                        # all projects
aegis project create myapp
aegis project switch myapp
aegis project current
aegis project delete myapp
```

All commands accept `--project <name>` to target a specific workspace.

### `aegis session`
Manage persisted agent sessions.
```bash
aegis session list
aegis session list --limit 20
aegis session show <id>
aegis session export <id>
aegis session delete <id>
aegis session prune --older-than 30d
```

### `aegis workflow`
Design and execute multi-agent workflows as directed graphs.
```bash
aegis workflow list
aegis workflow create my-workflow.yaml
aegis workflow run my-workflow.yaml
aegis workflow validate my-workflow.yaml
```

---

## System

### `aegis status` · alias: `st`
System overview — agents, memory, runtime state.
```bash
aegis status
aegis status --watch      # live-updating every 2s
aegis status --json
```

### `aegis health`
System health overview (lighter than `doctor`).
```bash
aegis health
aegis health --json
```

### `aegis metrics`
Snapshot of system metrics.
```bash
aegis metrics
aegis metrics --json
aegis metrics --watch
```

### `aegis dashboard` · alias: `dash`
Live agent monitoring TUI.
```bash
aegis dashboard
aegis dashboard --port 5173    # web dashboard
```

### `aegis cron`
Scheduled jobs and heartbeat.
```bash
aegis cron list
aegis cron add "0 */6 * * *" dream run     # dream every 6h
aegis cron delete <id>
aegis cron status
```

### `aegis trigger`
Event-driven triggers — cron, file_watch, webhook, condition, gateway_command.
```bash
aegis trigger list
aegis trigger create
aegis trigger delete <id>
aegis trigger fire <id>       # fire manually
```

---

## Utilities

### `aegis completion [shell]`
Shell tab completion.
```bash
aegis completion bash >> ~/.bashrc
aegis completion zsh >> ~/.zshrc
aegis completion fish > ~/.config/fish/completions/aegis.fish
```

### `aegis openapi`
Generate or serve OpenAPI 3.0 spec.
```bash
aegis openapi generate              # write openapi.json
aegis openapi serve                 # serve at /docs
```

### `aegis insights` · alias: `i`
Cross-database analytics — joins audit, billing, experience, telemetry.
```bash
aegis insights
aegis insights --days 7
aegis insights --json
```

### `aegis predict` · alias: `pred`
Predictive system — failure risk, cost forecasting.
```bash
aegis predict risk --agent build
aegis predict cost --goal "refactor auth module"
```

### `aegis improve`
Self-improving agents — skill extraction + failure clustering.
```bash
aegis improve run
aegis improve skills          # extracted skills
aegis improve failures        # clustered failures
aegis improve schedule        # scheduler status
```

### `aegis docscrawl`
Crawl documentation sites into structured local knowledge.
```bash
aegis docscrawl add https://docs.example.com
aegis docscrawl list
aegis docscrawl run <id>
aegis docscrawl search "authentication"
```

### `aegis experience` · alias: `exp`
Experience replay buffer — trajectories used for skill learning.
```bash
aegis experience list
aegis experience show <id>
aegis experience replay <id>
aegis experience stats
```

### `aegis reflect <session-id>`
Score an agent session — progress, quality, next steps.
```bash
aegis reflect sess_abc123
aegis reflect sess_abc123 --json
```

---

## Global Flags

These flags work on any command:

| Flag | Description |
|------|-------------|
| `--help`, `-h` | Show help for command |
| `--version`, `-V` | Show version |
| `--provider <name>` | Override AI provider |
| `--model <name>` | Override AI model |
| `--project <name>` | Use specific project workspace |
| `--session-db` | Persist session to SQLite |
| `--json` | JSON output (on supported commands) |

---

## Environment Variables

Set in `~/.aegis/agent.env` or system environment:

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `DEEPSEEK_API_KEY` | DeepSeek API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `GROQ_API_KEY` | Groq API key |
| `MISTRAL_API_KEY` | Mistral API key |
| `XAI_API_KEY` | xAI (Grok) API key |
| `COHERE_API_KEY` | Cohere API key |
| `PERPLEXITY_API_KEY` | Perplexity API key |
| `NVIDIA_API_KEY` | NVIDIA NIM API key |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key |
| `AEGIS_AI_API_KEY` | Universal fallback key |
| `AEGIS_PROJECT` | Default project workspace |
| `AEGIS_VERSION` | Force binary version on download |

---

## Common Workflows

### New user setup
```bash
npm install -g neuron-aegis
aegis init                # guided setup
aegis chat                # start chatting
```

### Check everything is working
```bash
aegis doctor --verbose
aegis status
```

### Run a coding task
```bash
aegis chat -t build                           # full dev agent
aegis plan "Add pagination to the users API"  # get a plan first
aegis ask "Where is the users controller?"    # read-only query
```

### Multi-agent task
```bash
aegis mesh run fan-out "Review all TypeScript files for type safety"
aegis orchestrate "Build, test, and document the auth module"
```

### Self-improvement cycle
```bash
aegis dream run                  # generate insights from experience
aegis evolve run                 # propose code mutations from insights
aegis evolve list --status proposed   # review before applying
aegis evolve apply <id>          # apply a specific mutation
```

### Monitor costs
```bash
aegis cost dashboard             # live TUI
aegis router route "my task"     # find cheapest provider first
```

### Production deployment
```bash
aegis serve --port 8080 --auth-required --key $MY_KEY
aegis production vault unlock
aegis distributed start
aegis production dashboard
```

---

## File Locations

| Path | Contents |
|------|----------|
| `~/.aegis/config.json` | Settings, provider, model, persisted insights |
| `~/.aegis/agent.env` | API keys |
| `~/.aegis/memory.db` | SQLite: sessions, memory, audit, experience |
| `~/.aegis/vault.db` | Encrypted credential vault |
| `~/.aegis/dreams.db` | Dream entries and insights |
| `~/.aegis/evolution.db` | Code mutations |
| `~/.aegis/plugins/` | Installed plugins |
| `~/.aegis/agents/` | Installed marketplace agents |
| `~/.aegis/projects/<name>/` | Per-project isolated state |
| `~/.aegis/bin/` | Cached prebuilt binaries |

---

## Getting Help

```bash
aegis --help                  # top-level help
aegis <command> --help        # command help
aegis doctor                  # diagnose issues
```

Issues: https://github.com/KunjShah95/neuron-os/issues
