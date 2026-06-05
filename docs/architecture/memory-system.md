---
title: Memory System Architecture
description: Aegis memory system — file-based storage, vector search, fact extraction, session management, and AgentMemory sidecar integration
---

# Memory System Architecture

> **Last updated:** May 2026  
> **Module:** `src/memory/`  
> **Key exports:** `MemorySystem`, `VectorMemory`, `AgentMemoryConnector`, session store functions, `memorySystem`

## Overview

The memory system provides persistent storage across four dimensions: **user profile**, **long-term memory**, **daily logs**, and **auto memories**. It also includes a built-in **vector memory** for similarity search and an optional **AgentMemory sidecar** connector for hybrid search.

```
                    ┌──────────────────────────────┐
                    │         MemorySystem          │
                    ├──────────────────────────────┤
                    │  ┌────────────────────────┐  │
                    │  │     user.md            │  │
                    │  │  (user profile)         │  │
                    │  ├────────────────────────┤  │
                    │  │     MEMORY.md          │  │
                    │  │  (long-term memory)     │  │
                    │  ├────────────────────────┤  │
                    │  │  .aegis/memory/daily/   │  │
                    │  │  (daily logs)           │  │
                    │  ├────────────────────────┤  │
                    │  │  .aegis/memory/auto/    │  │
                    │  │  (auto memories)        │  │
                    │  ├────────────────────────┤  │
                    │  │  facts.json             │  │
                    │  │  (extracted facts)      │  │
                    │  ├────────────────────────┤  │
                    │  │  .aegis/memory/vectors/ │  │
                    │  │  (vector storage)        │  │
                    │  └────────────────────────┘  │
                    └──────────────────────────────┘
```

## File Layout

All memory files live under `.aegis/memory/` in the project root:

```
.aegis/memory/
├── daily/           # Daily logs (YYYY-MM-DD.md)
├── auto/            # Auto memories (timestamp[-tag].md)
├── vectors/         # Vector storage (index.json)
├── facts.json       # Extracted facts (JSON array)
```

Additional persistent files at the project root:
- `user.md` — User profile
- `MEMORY.md` — Long-term memory
- `data/sessions/` — Chat session store (`{id}.json`)

## Core Class: `MemorySystem` (`src/memory/system.ts`)

### Initialization

```typescript
import { MemorySystem } from "../memory"

const ms = new MemorySystem(process.cwd(), agentMemoryConnector)
await ms.initialize()
// Creates directories + default files if missing
```

### User Profile (`user.md`)

Structured markdown file with sections: `## About You`, `## Never Do`, `## Preferences`.

```typescript
// Load profile
const profile = await ms.loadUserProfile()

// Add content to the end
await ms.appendToUserProfile("## Notes\n\nI prefer clean code.")

// Update specific sections
await ms.updateUserProfile({
  preferences: ["Short reviews", "TypeScript only"],
  neverDo: ["Delete files without asking"],
  name: "Alice",
})
```

### Long-Term Memory (`MEMORY.md`)

```typescript
// Append a timestamped entry
await ms.appendToMemory("Decided to use SQLite for local storage.")

// Load all memory
const memory = await ms.loadMemory()
```

### Daily Logs

Per-day files under `.aegis/memory/daily/{YYYY-MM-DD}.md`:

```typescript
// Append to today's log
await ms.appendToDailyLog("Reviewed PR #42")

// Load a specific day
const yesterday = new Date(Date.now() - 86400000)
const log = await ms.loadDailyLog(yesterday)
```

### Auto Memories

Short tagged entries stored as individual `.md` files:

```typescript
await ms.saveAutoMemory("User prefers dark mode", "preference")

// Load recent auto memories
const recent = await ms.loadAutoMemories(10) // last 10
```

### Fact Extraction

Regex-based fact extraction from conversation text:

```typescript
const facts = await ms.extractAndStoreFacts("I prefer TypeScript over JavaScript")
// Returns: [{ fact: "prefer TypeScript over JavaScript", category: "preference", confidence: 0.8 }]
```

**Fact categories and confidence levels:**

| Category | Pattern | Confidence |
|----------|---------|------------|
| `identity` | `I am ...`, `my name is ...` | 0.9 |
| `preference` | `I prefer ...`, `I like ...` | 0.8 |
| `preference` (negative) | `never ...`, `don't ...` | 0.5 |
| `project` | `the project is ...`, `we are working on ...` | 0.7 |
| `workflow` | `always ...`, `please ...`, `remember to ...` | 0.6 |
| `decision` | `we decided ...`, `agreed to ...` | 0.8 |
| `relationship` | `reports to ...`, `works with ...` | 0.7 |

Facts are deduplicated by lowercase content and sorted by confidence:

```typescript
const allFacts = await ms.getAllFacts()
const projectFacts = await ms.getFactsByCategory("project")
```

### Search

Hybrid search fusing AgentMemory results with local keyword scoring:

```typescript
const results = await ms.search("TypeScript configuration", 10)
// Returns: MemoryEntry[] with content, timestamp, source, category
```

**Search algorithm:**
1. **AgentMemory** — queries the AgentMemory sidecar REST API if available
2. **Local scoring** — TF-weighted relevance across MEMORY.md, user.md, daily logs (14 days, recency-weighted), auto memories (50 most recent), and extracted facts
3. **Fusion** — AgentMemory results ordered first, then deduplicated local results

Context building for system prompts:

```typescript
const context = await ms.buildContext({
  agentId: "agent-1",
  agentType: "build",
  cwd: process.cwd(),
})
// Returns: Markdown with User Profile, Long-term Memory, Today's Log, Yesterday's Log,
// Recent Auto Memories, and High-Confidence Facts
```

## VectorMemory (`src/memory/vector.ts`)

Built-in vector storage with no external dependencies. Uses a **character-level embedding** approach (128-dimension hash-based vectors):

```typescript
import { vectorMemory } from "../memory"

await vectorMemory.initialize()

// Add entries
const id = await vectorMemory.add("TypeScript is strongly typed", "docs", "language")
await vectorMemory.add("Python is dynamically typed", "docs", "language")

// Search by similarity
const results = await vectorMemory.search("typed language", 5, 0.1)

// Search by category
const langEntries = await vectorMemory.searchByCategory("language", 10)

// Statistics
const stats = await vectorMemory.getStats()
// { total: 2, byCategory: { language: 2 } }

// Remove or clear
await vectorMemory.remove(id)
await vectorMemory.clear()
```

**Embedding details:**
- Text → lowercase, remove non-alphanumeric
- Each word contributes to a 128-dim vector via hash-to-index mapping
- Vectors are L2-normalized
- Search uses cosine similarity

## Session Store (`src/memory/sessionStore.ts`)

Persistent chat session storage under `data/sessions/`:

```typescript
import { saveSession, loadSession, listSessions, deleteSession, renameSession, exportSession }
from "../memory/sessionStore"

// Save a session
await saveSession({
  id: "chat-2026-05-31-1",
  createdAt: new Date().toISOString(),
  messages: [{ role: "user", content: "Hello", timestamp: "..." , status: "complete" }],
  providerConfig: { provider: "anthropic", model: "claude-sonnet-4" },
  environment: { AI_PROVIDER: "anthropic" },
  agentTraces: [{ agentId: "agent-1", event: "agent:log", data: {}, timestamp: "..." }],
})

// Load a session
const session = await loadSession("chat-2026-05-31-1")

// List all session IDs
const ids = await listSessions()

// Manage sessions
await deleteSession("chat-2026-05-31-1")
await renameSession("old-id", "new-id")
await exportSession("chat-2026-05-31-1", "./exports/session-backup.json")
```

## AgentMemory Connector (`src/memory/agentmemory.ts`)

Optional REST connector to an [AgentMemory](https://github.com/aegis/agentmemory) sidecar service:

```typescript
import { AgentMemoryConnector } from "../memory"

const am = new AgentMemoryConnector({
  url: "http://localhost:3111",
  secret: "your-secret",
  enabled: true,
})

// Check availability (cached for 30s)
const available = await am.isAvailable()

// Hybrid search
const results = await am.search("memory query", 5)

// Remember an insight
const id = await am.remember("Important fact", "insight", ["tag1", "tag2"])

// Get context for a session
const context = await am.getContext("session-id")

// Session management
const sessionId = await am.startSession()
await am.observe(sessionId, "User asked about X")
await am.endSession(sessionId)
```

Configured via environment variables:
- `AGENTMEMORY_URL` — default `http://localhost:3111`
- `AGENTMEMORY_SECRET` — bearer token
- `AGENTMEMORY_ENABLED` — set to `"false"` to disable

## Testing

Tests in `src/memory/`:
- `test-memory-system.ts` — 33 tests, 45 assertions (init, CRUD, daily logs, auto memories, facts, search, context)
- `test-vector.ts` — 21 tests, 37 assertions (add, search, category, stats, remove, edge cases)
- `test-session-store.ts` — 13 tests, 30 assertions (CRUD, rename, export, agent traces)
