# agentmemory Sidecar Integration

**Date:** 2026-05-31
**Status:** Draft
**Project:** Neuron OS (Aegis) — v0.1.0

## Problem

Neuron OS's memory system is file-based (MEMORY.md, daily logs, auto memories) with simple TF-scoring search and character-level embedding vectors. This gives poor semantic recall — searching "database performance" won't find a session about "N+1 query fix." The system also lacks session replay, knowledge graphs, memory consolidation, and cross-session pattern detection.

## Solution

Add agentmemory ([@agentmemory/agentmemory](https://github.com/rohitg00/agentmemory)) as an **optional sidecar process**. When agentmemory's server is running alongside Neuron OS, all memory operations route through its hybrid BM25+Vector+Graph search engine (95.2% R@5 on LongMemEval-S). When it's not running, the existing file-based system works identically.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Neuron OS (Aegis)                          │
│                                                              │
│  AgentRuntime → MemorySystem                                 │
│                   ├── FileStorage ─── MEMORY.md, daily/       │
│                   │                   auto/, facts.json       │
│                   │                                          │
│                   └── AgentMemoryConnector (optional)         │
│                        │ HTTP fetch()                        │
│                        │ graceful degradation                │
│                        ▼                                     │
└────────────────────────┼─────────────────────────────────────┘
                         │
                         │ localhost:3111
                         │
┌────────────────────────┼─────────────────────────────────────┐
│           agentmemory server (sidecar)                        │
│                                                              │
│  REST API (:3111) → iii-engine (Rust, :49134)                │
│                        ├── BM25 search index                 │
│                        ├── Vector embeddings (local/API)     │
│                        ├── Knowledge graph                   │
│                        ├── 4-tier consolidation              │
│                        ├── Session capture + replay          │
│                        └── SQLite persistence                │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. Agent calls `MemorySystem.search("database performance")`
2. MemorySystem checks if AgentMemoryConnector is available
3. If available: POST to `agentmemory/smart-search` — hybrid BM25+Vector+Graph
4. Also runs local TF-scoring search against MEMORY.md/daily/auto
5. Fuses results via simple rank merge (agentmemory results ranked above local)
6. Falls back to local-only if agentmemory isn't running

## Components

### 1. AgentMemoryConnector — `src/memory/agentmemory.ts`

REST client to agentmemory server. No npm dependency — uses built-in `fetch()`.

```typescript
class AgentMemoryConnector {
  private baseUrl: string     // default http://localhost:3111
  private secret?: string     // optional AGENTMEMORY_SECRET
  private cachedHealth: Health | null
  private lastHealthCheck: number

  constructor(config?: AgentMemoryConfig)

  // Connection
  async isAvailable(): Promise<boolean>
  async getHealth(): Promise<Health | null>

  // Memory operations
  async search(query: string, opts?: SearchOpts): Promise<SearchResult[]>
  async remember(content: string, type?: string, concepts?: string[]): Promise<string>
  async observe(sessionId: string, content: string): Promise<void>

  // Context
  async getContext(sessionId: string): Promise<string>
  async startSession(): Promise<string>
  async endSession(sessionId: string): Promise<void>

  // Management
  async listSessions(): Promise<SessionSummary[]>
  async forget(ids: string[]): Promise<void>
  async getStats(): Promise<Stats>
}
```

All methods wrap calls in try/catch — network errors return null/empty, never throw.

Health check caching: check `GET /agentmemory/livez` every 30 seconds, cache result. Don't hammer the server.

### 2. MemorySystem changes — `src/memory/system.ts`

| Method | Change |
|--------|--------|
| `constructor()` | Accepts optional `AgentMemoryConnector` param |
| `search()` | Try agentmemory.smart-search → fuse with local results via rank merge. Local results still computed for offline fallback. |
| `buildContext()` | When agentmemory available, use `POST /agentmemory/context` for enriched context. Merge with local user profile/memory. |
| `appendToMemory()` | Also calls `agentmemory.remember()` to persist in both stores |
| `searchMemory()` (AgentRuntime) | Already delegates to MemorySystem.search() — transparent |

Search fusion strategy:
```
1. Call agentmemory smart-search → results A
2. Run local TF-scoring search → results B
3. Deduplicate: remove any result from B whose content has
   >70% Jaccard similarity with any result in A
4. Interleave: A sorted by agentmemory's relevance score,
   then B sorted by local TF score
5. Max 10 results returned
```

### 3. AgentMemory CLI — `src/cli/commands/agentmemory.ts`

```
aegis agentmemory status       # Health check + stats
aegis agentmemory search <q>   # Direct semantic search
aegis agentmemory connect      # Test connection
```

Registered in `src/cli/commands/index.ts`.

### 4. AgentMemory mode — `src/modes/agentmemory.ts`

New mode that shows agentmemory connection status, memory stats, recent sessions.

### 5. Configuration

Environment variables / aegis.config.json:

| Key | Default | Description |
|-----|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | agentmemory server URL |
| `AGENTMEMORY_SECRET` | `""` | Bearer token for auth |
| `AGENTMEMORY_ENABLED` | `true` | Set to false to disable |

## agentmemory Installation

Not bundled. User runs separately:

```bash
npx @agentmemory/agentmemory
# or
npm install -g @agentmemory/agentmemory
agentmemory
```

See https://github.com/rohitg00/agentmemory for prerequisites (iii-engine binary).

## Lifecycle Integration

AgentMemoryConnector integrates into the agent lifecycle automatically:

| Hook Point | Action |
|------------|--------|
| Agent spawn | `startSession()` — creates agentmemory session for this agent run |
| Agent task assigned | `observe()` — records the task goal as an observation |
| Agent tool call | `observe()` — records tool name + args (truncated to 2KB) |
| Agent tool result | `observe()` — records tool output summary (truncated) |
| Agent message | `remember()` — when agent produces a final answer or insight |
| Agent shutdown | `endSession()` — triggers consolidation |

Triggered from `AgentRuntime.executeTool()` and the hook system in `agent-worker.ts`,
but only when `AGENTMEMORY_ENABLED=true` and the server is reachable.

## Error Handling

All connector methods fail gracefully:
- Server not running → `isAvailable()` returns false
- Network timeout → search falls back to local only
- Auth failure → logged as warning, connectors return null
- Partial failure → results from whichever system succeeded

## Non-goals

- No forced dependency on iii-engine or agentmemory npm package
- No data migration from existing MEMORY.md to agentmemory
- No changes to AgentRuntime's public interface
- No removal of existing file-based memory

## Implementation Order

1. AgentMemoryConnector class (REST client)
2. MemorySystem integration (optional connector in constructor, search fusion)
3. AgentMemory CLI commands
4. AgentMemory mode
5. Tests for connector (with mock server)
6. Documentation updates

## Testing

- Unit tests with a mock HTTP server to verify client methods
- Integration test: start agentmemory, run search/remember/forget cycle
- Degradation test: verify local-only fallback when server is down
