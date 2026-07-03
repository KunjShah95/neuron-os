# Neuron OS Architecture

> Detailed system architecture and component diagrams for Neuron OS.

## System Architecture Overview

```mermaid
graph TB
    subgraph "User Layer"
        CLI[CLI / index.ts] --> ML[Mode Launcher]
        WEB[Web Dashboard :5173]
        WS[WebSocket Gateway :8081]
        GW[Multi-Platform Gateway]
    end

    subgraph "Terminal Modes (36+)"
        ML --> CHAT[chat] & DASH[dashboard] & ST[status]
        ML --> MEM[memory] & AGT[agent] & CFG[config]
        ML --> CR[cron] & SK[skills] & SV[serve]
        ML --> CP[mcp] & COST[cost] & RTR[router]
        ML --> EST[estimate] & INS[insights] & BNCH[bench]
        ML --> IMP[improve] & PROD[production] & DIST[distributed]
        ML --> PLG[plugin] & DRM[dream] & EVO[evolve]
        ML --> PER[persona] & SOC[social] & EVAL[eval]
        ML --> MESH[mesh] & TR[train] & TS[toolset]
        ML --> PRJ[project] & VC[voice] & SL[soul]
    end

    subgraph "Agent Runtime"
        AM[AgentManager] --> RT[Runtime]
        RT --> TYPES[14 Agent Types]
        RT --> SOUL{Soul Engine}
        SOUL --> ARCH[8 Archetypes]
        SOUL --> MOOD[6 Mood States]
        AM --> HOOKS[Plugin Hooks: 5 Points]
        AM --> IPC[Typed IPC Protocol]
    end

    subgraph "Consciousness Layer"
        DREAM[Dream Engine] --> PHASES[Replay · Pattern · Compress<br/>Counterfactual · Share · Mood]
        EVOLVE[Evolution Engine] --> MUTATE[Refactor · Optimize · Bugfix<br/>Error-handling · Security · more]
        PERSONA[Persona System] --> TRAITS[Curiosity · Tenacity · Caution<br/>Creativity · Precision · more]
        SOCIAL[Social Network] --> GOSSIP[Peer Discovery · Gossip<br/>Reputation · Trust Levels]
    end

    subgraph "Memory & Knowledge"
        MS[Memory System]
        MS --> KG[(Knowledge Graph)]
        MS --> VEC[(Vector Memory)]
        MS --> FTS5[(FTS5 Recall)]
        MS --> SESS[(Session Store)]
        MS --> EXP[Experience Replay]
    end

    subgraph "Coordination"
        MESH_ENG[Mesh Orchestrator]
        DEBATE[Debate Engine]
        MESH_ENG --> TOPOS[5 Topologies]
        DEBATE --> ARB[3 Arbitrator Types]
    end

    subgraph "Evaluation & Training"
        HARNESS[Eval Harness]
        GRADER[Grader Suite · Golden Dataset]
        CI[CI Gate · Baselines]
        TRAIN[Trajectory Recorder]
    end

    subgraph "Infrastructure"
        PLUGIN[Plugin System]
        PLUGIN --> SIGN[Ed25519 Signed]
        PLUGIN --> REG[SQLite Registry]
        PLUGIN --> SEMVER[Semver Resolution]
        DIST_RT[Distributed Runtime]
        DIST_RT --> POOL[Multi-Host Pool]
        DIST_RT --> ENC[AES-256 Transport]
        API[HMAC-signed REST API]
        AUTH[RBAC · Vault · Audit]
        OBS[SLO · Tracing · Prod Dashboard]
        BILL[Cost Attribution]
        PROJ[Project Workspaces]
        TLS[Toolset System · 10 Bundles]
    end

    subgraph "AI Providers (13)"
        P_ANTH[Anthropic] & P_OAI[OpenAI] & P_DS[DeepSeek]
        P_GK[Groq] & P_GM[Gemini] & P_MS[Mistral]
        P_AZ[Azure] & P_TG[Together] & P_OR[OpenRouter]
        P_XAI[xAI] & P_CH[Cohere] & P_PP[Perplexity] & P_OL[Ollama]
    end

    subgraph "Platform Adapters (11)"
        A_DC[Discord] & A_SL[Slack] & A_TG[Telegram]
        A_SMS[SMS] & A_VC[Voice] & A_WA[WhatsApp]
        A_EM[Email] & A_WH[Webhook]
        A_MX[Matrix] & A_SG[Signal] & A_IR[IRC]
    end

    AM --> MS & PLUGIN & DIST_RT & AUTH & BILL
    DREAM --> MS & SOUL
    EVOLVE --> DREAM
    PERSONA --> DREAM
    SOCIAL --> EVOLVE
    MESH_ENG --> AM
    DEBATE --> MESH_ENG
    HARNESS --> MESH_ENG
    TRAIN --> AM
    API --> AUTH
    GW --> A_DC & A_SL & A_TG & A_SMS & A_VC & A_WA & A_EM & A_WH & A_MX & A_SG & A_IR
    WS --> WEB
    RTR[Model Router] --> P_ANTH & P_OAI & P_DS & P_GK & P_GM & P_MS & P_AZ & P_TG & P_OR & P_XAI & P_CH & P_PP & P_OL
```

## Module Breakdown

| Module | Path | Responsibility |
|--------|------|----------------|
| CLI | `src/cli/` | Command registration, banner, theme, palette |
| Modes | `src/modes/` | Mode framework + 36 TUI mode screens |
| Agent | `src/agent/` | Agent lifecycle, process management, IPC, hooks, soul |
| Soul | `src/agent/soul.ts` | 8 archetypes, 6 moods, behavioral heuristics |
| Dashboard TUI | `src/tui/` | Dashboard rendering, state management, commands |
| Chat TUI | `src/chat/` | Chat UI, streaming, provider integration, sessions |
| Web Dashboard | `dashboard/` | Vite + React 19 frontend with 12 route pages |
| Wizard | `src/wizard/` | Interactive setup flows |
| Tools | `src/tools/` | Tool registry and 8 built-in tool implementations |
| Toolsets | `src/toolsets/` | Composable tool bundles with dependency resolution |
| Skills | `src/skills/` | Skill loading, registry, and remote API client |
| Memory | `src/memory/` | Session persistence, knowledge graph, vector, namespaces, synthesis |
| Experience | `src/experience/` | Experience replay buffer, retrieval, skill curation |
| Dream | `src/dream/` | 6-phase idle-time dream cycle with insight generation |
| Evolve | `src/evolve/` | Auto-code mutation, typecheck+tests verification |
| Persona | `src/persona/` | 8-trait agent personality evolution from experience |
| Social | `src/social/` | Multi-instance gossip protocol, peer discovery, reputation |
| Economy | `src/economy/` | Cost routing, pricing registry, budget guard, pre-flight |
| Improve | `src/improve/` | Skill extraction, failure clustering, adversarial self-play |
| Plugin | `src/plugin/` | Ed25519-signed plugins, SQLite registry, hooks, resolver |
| Mesh | `src/mesh/` | Multi-agent orchestration: 5 topologies, 7 agent roles |
| Debate | `src/debate/` | Disagreement detection, 3 arbitrator types, signed decisions |
| Harness | `src/harness/` | Eval suite: graders, golden dataset, CI gate, experiments, HITL |
| Training | `src/training/` | Trajectory recording and export for every agent session |
| Distributed | `src/distributed/` | Worker pool, encrypted transport, capacity placement, management |
| Adapters | `src/adapters/` | 11-platform gateway (Discord, Slack, Telegram, Matrix, Signal, IRC, etc.) |
| API | `src/api/` | HTTP REST API server with HMAC + RBAC authentication |
| AI | `src/ai/` | Provider manager (13 providers), factory, model references |
| Auth | `src/auth/` | RBAC role management, API key auth, HTTP middleware |
| Vault | `src/vault/` | AES-256-GCM credential vault, env loader, provider bridge |
| Project | `src/project/` | Isolated workspaces with per-project config and state |
| Voice | `src/voice/` | Voice system configuration and provider integration |
| Observability | `src/observability/` | SLO tracking, distributed tracing, production dashboard |
| Triggers | `src/triggers/` | Cron, file_watch, webhook, condition, background agents |
| Audit | `src/audit/` | Append-only audit logging for all agent actions |
| Billing | `src/billing/` | Per-LLM-call cost tracking, budget enforcement |

## Data Flow Architecture

### Agent Lifecycle

```mermaid
sequenceDiagram
    participant User
    participant CLI
    participant AM as AgentManager
    participant Runtime
    participant Tools
    participant Memory
    participant Audit

    User->>CLI: spawn agent
    CLI->>AM: createAgent(type, goal)
    AM->>Runtime: spawn process
    Runtime->>Runtime: inject soul/mood
    Runtime->>Audit: log spawn event
    
    loop Agent Execution
        Runtime->>Tools: request tool execution
        Tools-->>Runtime: tool result
        Runtime->>Memory: store experience
        Runtime->>Audit: log action
        Runtime->>User: stream progress
    end

    Runtime->>AM: agent complete
    AM->>Memory: extract insights
    AM->>Audit: log completion
    AM-->>User: return result
```

### Memory System Flow

```mermaid
graph LR
    subgraph "Session Data"
        S1[Session Store] --> US[Unified Query]
    end
    
    subgraph "Semantic Search"
        VM[Vector Memory] --> US
        FTS[FTS5 Recall] --> US
    end
    
    subgraph "Knowledge"
        KG[Knowledge Graph] --> US
        EXP[Experience] --> US
    end
    
    US --> SYN[Synthesis]
    SYN --> OUT[Consolidated Result]
    
    DREAM[Dream Engine] --> KG
    DREAM --> VM
    EVOLVE[Evolution] --> SYN
```

### Cost Attribution Flow

```mermaid
sequenceDiagram
    participant Agent
    participant Router
    participant Provider
    participant Billing
    participant Budget

    Agent->>Router: request model
    Router->>Billing: get cost estimate
    Billing-->>Router: return estimate
    Router->>Budget: check budget
    Budget-->>Router: approved/denied
    Router->>Provider: select cheapest
    Provider-->>Agent: response
    Provider->>Billing: record tokens
    Billing->>Billing: calculate USD
    Billing->>Budget: deduct from budget
```

## Security Architecture

```mermaid
graph TB
    subgraph "Authentication"
        RBAC[RBAC Middleware]
        APIKEY[SHA-256 API Keys]
        HMAC[HMAC Request Signing]
    end
    
    subgraph "Authorization"
        PERMS[Permission Checks]
        TOOLS[Tool Permissions]
        PATTERNS[Command Patterns]
    end
    
    subgraph "Encryption"
        VAULT[AES-256-GCM Vault]
        MASTER[scrypt Master Key]
        DIST[AES-256 Transport]
    end
    
    subgraph "Audit"
        AUDIT[Append-Only Log]
        TRACE[Distributed Tracing]
        SLO[SLO Monitoring]
    end
    
    RBAC --> PERMS
    APIKEY --> RBAC
    HMAC --> RBAC
    PERMS --> TOOLS
    PERMS --> PATTERNS
    VAULT --> MASTER
    DIST --> MASTER
    AUDIT --> TRACE
    TRACE --> SLO
```

## Plugin Architecture

```mermaid
graph TB
    subgraph "Plugin Lifecycle"
        PUBLISH[Ed25519 Sign]
        INSTALL[Verify Signature]
        RESOLVE[Semver Resolution]
        REGISTER[SQLite Registry]
        HOOK[Execute Hook]
    end
    
    subgraph "Hook Points"
        SPAWN[agent:spawn]
        TOOL[tool:call]
        MSG[message:send]
        IPC[ipc:message]
        SHUTDOWN[agent:shutdown]
    end
    
    PUBLISH --> INSTALL
    INSTALL --> RESOLVE
    RESOLVE --> REGISTER
    REGISTER --> HOOK
    HOOK --> SPAWN & TOOL & MSG & IPC & SHUTDOWN
```

## Deployment Architecture

### Single-Node Deployment

```mermaid
graph TB
    USER[User] --> CLI[aegis CLI]
    CLI --> PROC[Agent Processes]
    CLI --> API[REST API :8080]
    CLI --> WS[WebSocket :8081]
    
    PROC --> SQLITE[(SQLite DBs)]
    API --> SQLITE
    WS --> SQLITE
    
    SQLITE --> AUDIT[Audit Log]
    SQLITE --> SESS[Sessions]
    SQLITE --> MEM[Memory]
    SQLITE --> BILL[Billing]
```

### Multi-Node Deployment

```mermaid
graph TB
    LB[Load Balancer]
    
    subgraph "Cluster"
        LDR[Leader Node]
        W1[Worker 1]
        W2[Worker 2]
        W3[Worker 3]
    end
    
    subgraph "Shared State"
        SQLITE[(Shared SQLite)]
        VAULT[Credential Vault]
    end
    
    LB --> LDR
    LB --> W1 & W2 & W3
    
    LDR --> SQLITE
    W1 --> SQLITE
    W2 --> SQLITE
    W3 --> SQLITE
    
    LDR -.->|AES-256 | W1
    LDR -.->|AES-256 | W2
    LDR -.->|AES-256 | W3
```

## Consciousness Layer Architecture

### Dream Engine Cycle

```mermaid
graph LR
    MR[Memory Replay] --> PD[Pattern Discovery]
    PD --> KC[Knowledge Compression]
    KC --> CE[Counterfactual Exploration]
    CE --> SD[Shared Dreaming]
    SD --> MC[Mood Consolidation]
    MC --> MR
    
    PD --> INS[Insights]
    KC --> INS
    CE --> INS
    
    INS --> EVOLVE[Evolution Engine]
    INS --> PERSONA[Persona System]
```

### Soul Engine

```mermaid
graph TB
    subgraph "Archetypes (8)"
        ARCH1[Architect]
        ARCH2[Craftsman]
        ARCH3[Sage]
        ARCH4[Scout]
        ARCH5[Guardian]
        ARCH6[Alchemist]
        ARCH7[Oracle]
        ARCH8[Weaver]
    end
    
    subgraph "Mood States (6)"
        M1[Elated]
        M2[Confident]
        M3[Content]
        M4[Anxious]
        M5[Frustrated]
        M6[Burned Out]
    end
    
    subgraph "Behavioral Heuristics"
        VERB[Verbosity]
        TONE[Tone]
        FORM[Formality]
        EMOJI[Emoji Usage]
    end
    
    ARCH1 & ARCH2 & ARCH3 & ARCH4 & ARCH5 & ARCH6 & ARCH7 & ARCH8 --> M1 & M2 & M3 & M4 & M5 & M6
    M1 & M2 & M3 & M4 & M5 & M6 --> VERB & TONE & FORM & EMOJI
    VERB & TONE & FORM & EMOJI --> PROMPT[System Prompt Injection]
```

---

## See Also

- [README.md](README.md) — Quick start and system overview
- [ROADMAP.md](ROADMAP.md) — Strategic roadmap
- [docs/](docs/) — Complete documentation