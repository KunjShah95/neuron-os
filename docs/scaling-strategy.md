# Scaling Strategy — Neuron OS / Aegis

## Why Scale?

The agent system is designed to be a **local-first autonomous AI platform**. As workloads grow from single-user interactive use to multi-agent, multi-repo, and CI/CD pipelines, scaling becomes necessary across two dimensions:

| Dimension | What it means | Bottleneck |
|-----------|--------------|------------|
| **Vertical (Depth)** | Smarter, longer-running agents | Context window, reasoning steps |
| **Horizontal (Breadth)** | More agents running in parallel | CPU, memory, API rate limits |

---

## 1. Vertical Scaling — Deeper Reasoning

### Current State
- Agents run synchronously with a max step limit (10–40 steps)
- Single `ToolLoopAgent` per session
- One AI model call at a time

### Scale Targets

| Level | Max Steps | Context | Use Case |
|-------|-----------|---------|----------|
| Quick | 10 | 8K tokens | Simple searches, status checks |
| Standard | 25 | 32K tokens | File modifications, single-file refactors |
| Deep | 50 | 128K tokens | Multi-file refactors, codebase research |
| Research | 100+ | 200K+ tokens | Auto-research loops, complex planning |

### Implementation Path

```typescript
// Vertical scaling via configurable depth
const agent = new ToolLoopAgent({
  model,
  stopWhen: stepCountIs(config.maxSteps ?? 25),
  maxTokens: config.contextWindow ?? 32000,
  tools,
})
```

**Key levers:**
- **Model selection**: Use cheaper/faster models (Groq, Gemini Flash) for quick tasks, expensive/deep models (Claude Opus, GPT-4o) for research
- **Step limits**: Increase `maxSteps` and `contextWindow` for complex tasks
- **Chunking**: Break large codebases into sub-problems with separate agent instances
- **Memory injection**: Feed relevant memory/facts into agent context for continuity

---

## 2. Horizontal Scaling — Parallel Execution

### Current State
- Each `/agent` or `/ask` command spawns one synchronous agent
- Telegram processes commands sequentially per chat (but multiple chats can run in parallel)
- No agent pooling or load balancing

### Scale Targets

| Level | Concurrent Agents | Infrastructure | Use Case |
|-------|------------------|---------------|----------|
| Single | 1–3 | Local machine | Personal use, interactive |
| Team | 5–20 | VPS / Docker | Small team, CI/CD |
| Enterprise | 50–200 | Kubernetes cluster | Multi-repo, batch processing |
| Research | 200+ | GPU cluster + queues | Large-scale experimentation |

### Architecture for Horizontal Scaling

```
                    ┌─────────────┐
                    │ API Gateway  │
                    │ (load bal.)  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Agent    │ │ Agent    │ │ Agent    │
        │ Pool 1   │ │ Pool 2   │ │ Pool 3   │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │            │            │
             ▼            ▼            ▼
        ┌──────────────────────────────────────┐
        │         Shared State Layer           │
        │  (Redis / SQLite / Postgres)         │
        └──────────────────────────────────────┘
```

### Implementation Steps

**Phase 1 — Agent Pool (Current)**
```typescript
// Already have: agentManager with list/spawn/kill
// Add: pool with concurrency limit
class AgentPool {
  private maxConcurrent: number
  private queue: Array<{ goal: string; resolve, reject }>
  
  async submit(goal: string): Promise<string> {
    if (this.running.size < this.maxConcurrent) {
      return this.spawn(goal)
    }
    return this.enqueue(goal)
  }
}
```

**Phase 2 — Shared State**
- Use SQLite (via `bun:sqlite`) for lightweight multi-process state
- Redis for higher-throughput scenarios
- Shared vault for credential access across processes

**Phase 3 — Message Queue**
- RabbitMQ / NATS for distributing agent workloads
- Workers pull from queues, execute, push results
- Webhook callbacks for async completion notifications

---

## 3. Use Cases by Scale

### Personal (Current Focus)
- **Single dev** using Telegram + CLI
- **Use cases**: Codebase exploration, file modifications, plan generation
- **Deployment**: `aegis telegram` on laptop + PM2/Docker for uptime

### Team (Next)
- **Multiple devs** via Telegram or HTTP API
- **Use cases**: Code review, automated refactoring, onboarding docs
- **Deployment**: VPS with Docker Compose
- **Key additions**:
  - Multi-user auth (already supported via `allowedUserIds`)
  - Shared vault for team credentials
  - Agent result streaming to shared channel

### CI/CD (Near-future)
- **Automated pipelines** triggered by GitHub webhooks
- **Use cases**: PR review, auto-fix lint errors, test generation
- **Deployment**: GitHub Actions runner + `aegis agent` mode
- **Key additions**:
  - Webhook receiver endpoint
  - Branch-aware execution (checkout → modify → PR)
  - Status reporting back to GitHub

### Research (Exploratory)
- **Massive parallel experimentation** (Karpathy-style)
- **Use cases**: Hyperparameter tuning, architecture search, A/B testing
- **Deployment**: Kubernetes with GPU nodes
- **Key additions**:
  - Distributed agent manager
  - Result aggregation and ranking
  - Checkpoint/restore for long-running experiments

---

## 4. Infrastructure Recommendations

| Scenario | Stack | Cost |
|----------|-------|------|
| Personal VPS | 2 vCPU, 4GB RAM, Docker, PM2 | ~$10/mo |
| Team | 4 vCPU, 8GB RAM, Docker Compose + SQLite | ~$30/mo |
| CI/CD | GitHub Actions + self-hosted runner | $0–20/mo |
| Enterprise | Kubernetes cluster (3+ nodes) | $100–500/mo |
| Research | K8s + GPU nodes + job queue | $500+/mo |

---

## 5. Next Steps

1. **Add AgentPool** — Concurrency-limited agent execution with queue
2. **Add shared SQLite state** — Multi-process session persistence
3. **Add HTTP webhook receiver** — GitHub/GitLab integration
4. **Add distributed mode** — Agent workers that can run on remote machines
5. **Benchmark** — Measure throughput at each scaling level
