# Scaling Architecture — Plan

> **Priority: P2-P3.** Build stabilization and plugin system first, then scale.
> **Status: Historical planning document — items marked ✅ are implemented.**

---

## Horizontal Scaling (Multi-Machine)

### Current Limitation
All components run in a single OS process/thread. `AgentManager` stores state in memory. IPC is local-only via `Bun.spawn` stdin/stdout.

### Target Architecture

```
                     ┌──────────────────┐
                     │   Load Balancer   │
                     │  (nginx / Envoy)  │
                     └──────┬───────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
        ┌─────▼─────┐ ┌────▼────┐ ┌─────▼─────┐
        │  Node 1   │ │ Node 2  │ │  Node 3   │
        │ aegis api │ │ aegis   │ │ aegis     │
        │ server    │ │ workers │ │ workers   │
        └─────┬─────┘ └────┬────┘ └─────┬─────┘
              │            │            │
              └────────────┼────────────┘
                           │
              ┌────────────▼────────────┐
              │     State Layer         │
              │  (Redis / etcd / NATS)  │
              │                         │
              │  • Agent registry       │
              │  • Task queue           │
              │  • Session store        │
              │  • Vector store         │
              └─────────────────────────┘
```

### Implementation Phases

#### Phase 1: State Externalization (P2)
1. Make `AgentManager.register()` Redis-backed
2. Add TTL-based agent heartbeats via Redis
3. Store sessions in Redis instead of filesystem
4. Add optional Redis vector store backend

```typescript
interface AgentRegistry {
  register(instance: AgentInstance): Promise<void>
  unregister(id: string): Promise<void>
  get(id: string): Promise<AgentInstance | null>
  list(filter?: AgentFilter): Promise<AgentInstance[]>
}
```

- Local implementation exists (current in-memory)
- Remote implementation uses Redis
- Configurable via `AEGIS_AGENT_REGISTRY=redis://...`

#### Phase 2: Remote Workers (P2)
1. Replace `Bun.spawn` with NATS/RabbitMQ transport for agent IPC
2. Worker nodes run agent-worker.ts connected to message broker
3. Task queue with priority, retry, and dead-letter

```typescript
interface AgentWorkerTransport {
  connect(): Promise<void>
  sendTask(agentId: string, task: Task): Promise<void>
  onResult(callback: (result: TaskResult) => void): void
  disconnect(): Promise<void>
}
```

#### Phase 3: Kubernetes Operator (P3)
1. Custom resource definitions for `Agent`, `AgentPool`, `AgentTask`
2. Controller manages pod lifecycle based on agent definitions
3. Sidecar container handles IPC bridge (NATS → local stdin/stdout)

---

## Vertical Scaling (Single-Node Throughput)

### Current Bottlenecks & Fixes

| Component | Bottleneck | Fix |
|-----------|-----------|-----|
| **Task execution** | Sequential tool calls | Parallel tool execution with dependency graph |
| **Vector search** | O(n) linear scan over JSON | SQLite + FTS5 extraction + vector extension |
| **Memory system** | Reads all files per query | In-memory LRU cache with TTL invalidation |
| **Agent IPC** | Per-agent `Bun.spawn` overhead | Worker pool with configurable max concurrent |
| **File operations** | Sync I/O (`readFileSync`) | Async I/O everywhere with stream support |
| **Web dashboard** | Polls API every N seconds | ✅ WebSocket push for real-time updates (implemented in `src/api/server.ts`) |

### Worker Pool Architecture

```
┌─────────────────────────────┐
│       AgentManager          │
│  ┌───────────────────────┐  │
│  │    Worker Pool        │  │
│  │  ┌─────┐ ┌─────┐     │  │
│  │  │ w1  │ │ w2  │ ... │  │
│  │  └─────┘ └─────┘     │  │
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │    Task Queue         │  │
│  │  ┌───┐ ┌───┐ ┌───┐   │  │
│  │  │t1 │ │t2 │ │t3 │   │  │
│  │  └───┘ └───┘ └───┘   │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

### Cache Strategy

| Cache | Key | TTL | Invalidation |
|-------|-----|-----|-------------|
| MEMORY.md content | `memory:content` | 30s | On append |
| User profile | `memory:user` | 60s | On update |
| Agent type defs | `agents:types` | 300s | On skill install |
| Config | `config:loaded` | 300s | On config change |
| Vector index | `vectors:index` | 60s | On vector add/remove |
| Facts | `memory:facts` | 30s | On fact store |

---

## Multi-Region / HA

- Agent state replication: Redis Sentinel or Redis Cluster
- Cross-region failover: Active-passive with DNS routing
- Vector store: Pinecone / Weaviate / Qdrant with multi-region
- Session affinity: Sticky sessions via load balancer + Redis session store
