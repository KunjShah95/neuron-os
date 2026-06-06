# Dialectic User Modeling + FTS5 Cross-Session Recall — Design Spec

**Date:** 2026-06-06
**Status:** Draft
**Scope:** v0.8.x — replace TF-IDF with FTS5 + LLM summarization; add Honcho-style user model

## Context

Aegis currently has a memory system (`src/memory/`) with:
- TF-IDF vector search (small-scale, no semantic)
- Session persistence (`src/memory/session-store.ts`)
- An optional AgentMemory sidecar (BM25 + Vector + Graph, 95.2% R@5 on LongMemEval-S — already strong, but requires a separate process)

The gap is twofold:

1. **In-process recall is too weak.** TF-IDF misses semantic matches; the AgentMemory sidecar is a separate process that has to be running. Hermes' pattern — SQLite FTS5 + LLM summarization at recall time — gives strong recall with zero extra processes.

2. **No user model.** Even with good recall, the agent doesn't build a *deepening* model of who you are, your preferences, your recurring topics, your communication style. Honcho (the reference impl) does this with a "dialectic" loop: periodic "what did I learn?" diffs against the existing model, with human confirmation.

This spec replaces TF-IDF with FTS5 + LLM summarization (the sidecar remains as an opt-in upgrade path) and adds the dialectic user model.

## 1. Goals

1. **FTS5-backed recall** — every session turn indexed in a SQLite FTS5 virtual table; BM25 + recency + entity overlap scoring.
2. **LLM summarization at recall** — top-k raw hits are summarized into a `<recall_context>` block; the LLM sees a tight summary, not 50 raw turns.
3. **Dialectic user model** — rolling per-user profile (preferences, topics, decisions, communication style); updated via periodic "what did I learn?" diffs that the user confirms.
4. **Honcho adapter (optional)** — if `HONCHO_API_KEY` is set, sync the local model to Honcho's hosted service; otherwise fully local.
5. **Local-first** — user model is a plain JSON file at `~/.aegis/memory/user_model.json`, versioned with an audit log of every dialectic change.

## 2. Non-Goals (v1)

- Global user model across multiple users on one Aegis install (per-user only; multi-user is v0.9 per ROADMAP)
- Automatic cross-device sync (Honcho adapter covers the hosted case; local-only otherwise)
- Memory palace / graph-based user modeling (BM25 + recency is sufficient for the v1.x use case; the knowledge-graph milestone at v0.8 already has its own spec)
- "Memory decay" / TTL-based forgetting beyond the 90-day rolling window
- LLM-generated user personas or impersonation features

## 3. Architecture

```
  ┌─────────────────────────────────────────────────────────┐
  │  Agent loop (existing src/agent/agent-worker.ts)        │
  │    - on each turn: index in FTS5                        │
  │    - on agent-loop start: load user_model + recall     │
  └─────────────┬───────────────────────────────────────────┘
                │
                ▼
  ┌─────────────────────────────────────────────────────────┐
  │  src/memory/recall/                                     │
  │    - schema.sql (FTS5 virtual table + entities)        │
  │    - indexer.ts (writes per turn)                      │
  │    - retriever.ts (BM25 + recency + entity)            │
  │    - summarizer.ts (LLM summary of top-k)              │
  └─────────────┬───────────────────────────────────────────┘
                │
                ▼
  ┌─────────────────────────────────────────────────────────┐
  │  src/memory/user-model/                                 │
  │    - user_model.json (versioned, audit logged)         │
  │    - dialectic.ts (periodic "what did I learn?" diff)  │
  │    - confirm.ts (user-in-the-loop prompts)             │
  │    - honcho-adapter.ts (optional sync)                 │
  └─────────────────────────────────────────────────────────┘
```

## 4. FTS5 Schema

```sql
-- In src/memory/recall/schema.sql (run on first use)
CREATE VIRTUAL TABLE recall_index USING fts5(
  session_id UNINDEXED,
  turn_id    UNINDEXED,
  ts         UNINDEXED,         -- unix ms
  role       UNINDEXED,         -- 'user' | 'assistant' | 'tool'
  content,
  entities,                     -- space-separated named entities (e.g. "react-hooks useEffect")
  tokenize = 'porter unicode61'
);

CREATE TABLE recall_meta (
  session_id TEXT PRIMARY KEY,
  started_at INTEGER,
  last_seen  INTEGER,
  turn_count INTEGER
);

CREATE VIRTUAL TABLE recall_entities USING fts5(
  entity,
  turn_ids,                     -- comma-separated
  tokenize = 'porter unicode61'
);
```

Indexing is triggered by the existing `message` hook (post phase) in `src/agent/hooks/`. The hook already fires on every message in/out of an agent — we just add a side effect.

## 5. Retriever

```ts
type RecallQuery = { text: string, maxResults?: number, maxAgeDays?: number }

async function retrieve(q: RecallQuery): Promise<RecallHit[]> {
  const ftsHits = db.prepare(`
    SELECT session_id, turn_id, ts, role, content,
           bm25(recall_index) AS score
    FROM recall_index
    WHERE recall_index MATCH ?
    ORDER BY score
    LIMIT 50
  `).all(buildFtsQuery(q.text))

  const entityHits = expandEntities(ftsHits, q.text)
  const recencyWeighted = ftsHits.map(h => ({
    ...h,
    finalScore: h.score * recencyMultiplier(h.ts, q.maxAgeDays ?? 90),
  }))
  return recencyWeighted
    .sort((a, b) => a.finalScore - b.finalScore)
    .slice(0, q.maxResults ?? 3)
}
```

## 6. Summarizer

```ts
async function summarizeContext(hits: RecallHit[], budget: number): Promise<string> {
  if (hits.length === 0) return ''
  const joined = hits.map(h => `[${h.role}] ${h.content}`).join('\n')
  const summary = await llm.complete({
    system: 'You are summarizing prior conversation context for an AI agent. Be terse. Preserve entities, decisions, and unresolved questions.',
    prompt: joined,
    maxTokens: budget,  // default 400
  })
  return summary
}
```

The summarizer is wrapped in a 5s timeout; on timeout, raw hits (truncated to budget) are returned instead.

## 7. User Model

`~/.aegis/memory/user_model.json`:

```json
{
  "version": 17,
  "updated_at": 1749200000000,
  "preferences": {
    "communication_style": "concise, prefers bullet points",
    "code_style": "functional TypeScript, no classes unless necessary",
    "tooling": "bun, neovim, no docker locally"
  },
  "recurring_topics": [
    { "topic": "agent OS design", "frequency": 0.32, "last_seen": 1749190000000 },
    { "topic": "memory systems", "frequency": 0.18, "last_seen": 1749180000000 }
  ],
  "decision_patterns": [
    "prefers typed APIs over dynamic ones",
    "ships features in small, committable PRs",
    "writes design docs before code"
  ],
  "audit_log": [
    { "version": 17, "ts": 1749200000000, "change": "Added preference: code_style = functional TypeScript", "evidence": ["turn:abc123"], "confirmed": true },
    { "version": 16, "ts": 1749100000000, "change": "Removed assumption: uses Docker (corrected to 'no docker locally')", "evidence": ["turn:def456"], "confirmed": true }
  ]
}
```

## 8. Dialectic Engine

Runs as a cron job (default: after each session ends, plus daily at 4am). Logic:

```ts
async function runDialectic(sessionId: string): Promise<DialecticProposal | null> {
  const recent = await loadSessionTurns(sessionId)
  const model = await loadUserModel()
  const proposal = await llm.complete({
    system: `You are updating a user model. Given recent turns and the current model, emit a JSON object describing ONE of:
      - { "type": "add_preference", "key": "...", "value": "...", "evidence_turn_ids": [...] }
      - { "type": "update_preference", "key": "...", "new_value": "...", "old_value": "...", "evidence_turn_ids": [...] }
      - { "type": "remove_preference", "key": "...", "reason": "..." }
      - { "type": "no_change" }
      Emit ONLY the JSON. No prose.`,
    prompt: `Current model:\n${JSON.stringify(model, null, 2)}\n\nRecent turns:\n${formatTurns(recent)}`,
  })
  if (proposal.type === 'no_change') return null
  return { proposal, requiresConfirmation: isMaterial(proposal) }
}
```

`isMaterial(proposal)` returns true if the change is a new preference, an update that conflicts with the existing value, or a removal. Trivial updates (e.g., bumping `last_seen` on a recurring topic) are applied silently.

Material proposals are surfaced to the user:
- **TUI**: a "🪞 Memory update" notification; `/memory` shows the diff and accepts y/n
- **Dashboard**: a modal on session end
- **Gateway adapters**: an opt-in reply-style prompt (e.g., Telegram inline keyboard)

## 9. Honcho Adapter (optional)

```ts
// src/memory/user-model/honcho-adapter.ts
export class HonchoAdapter {
  constructor(private apiKey: string, private workspace: string) {}

  async sync(model: UserModel): Promise<SyncResult> {
    // GET /workspaces/{workspace}/users  → list
    // POST /workspaces/{workspace}/users/{user_id}/representations  → push latest
    // GET /workspaces/{workspace}/users/{user_id}/dialectic  → pull Honcho's own dialectic
    // Reconcile: local source of truth, Honcho is a read cache
  }
}
```

The local file is always the source of truth. Honcho is a read-cache + cross-device sync target. If `HONCHO_API_KEY` is unset, the adapter is a no-op.

## 10. CLI Surface

```bash
aegis memory recall <query>              # show top-k hits + their scores
aegis memory summarize <query>           # show the LLM-summarized recall context
aegis memory user-model show             # show ~/.aegis/memory/user_model.json (formatted)
aegis memory user-model diff             # show pending dialectic proposals
aegis memory user-model accept <id>      # accept a pending proposal
aegis memory user-model reject <id> --reason "..."
aegis memory user-model reset [--confirm] # wipe and start over
aegis memory honcho status               # show sync state
aegis memory honcho sync [--now]         # trigger manual sync
```

## 11. Error Handling

| Failure | Behavior |
|---|---|
| FTS5 query parse error | Fall back to linear scan over last 50 turns |
| LLM summarizer timeout (>5s) | Return raw hits truncated to token budget |
| User model corruption | Recover from last versioned snapshot; surface warning in dashboard |
| Honcho sync failure (network / auth) | Local model stays source of truth; retry on next dial; surface in `aegis memory honcho status` |
| Dialectic LLM produces malformed JSON | Re-prompt once; on second failure, skip this run (no proposal emitted) |
| Conflicting concurrent writes to user_model.json | Mutex on `.user_model.lock`; second writer waits or exits |

## 12. Testing

**Unit:**
- FTS5 query builder — special characters, phrase queries, AND/OR
- Retriever scoring — BM25 + recency multiplier
- Summarizer mock — token budget enforcement, timeout fallback
- Dialectic diff logic — `isMaterial` classifications, JSON shape validation
- Honcho adapter mock — sync round-trip, conflict resolution

**Integration:**
- Seed 100 fake turns, run recall query, assert top-3 contain the expected session
- Synthetic session sequence → user model evolves correctly (preference added, then contradicted, then corrected)
- FTS5 corruption recovery (manual file munging → load latest snapshot)

**E2E:**
- Human: "What did I work on last week?" → recall surfaces the right session; summarizer gives a tight 3-bullet summary
- Human: "I usually prefer X" → next session shows the preference in the system prompt's `<user_profile>` block
- Human: "Actually I changed my mind about X" → dialectic proposal surfaces; user confirms; model updates

## 13. Phasing

| Phase | PR | What |
|---|---|---|
| 1 | `feat(memory): FTS5 schema + indexer` | Foundation; replace TF-IDF for new sessions |
| 2 | `feat(memory): retriever + summarizer` | Recall path |
| 3 | `feat(memory): user_model.json + load into system prompt` | Static model |
| 4 | `feat(memory): dialectic engine + confirm flow` | Dynamic model |
| 5 | `feat(memory): honcho adapter` | Optional sync |
| 6 | `feat(memory): migrate existing TF-IDF data` | Backfill |
| 7 | `docs(memory): user guide` | User-facing |

## 14. Open Questions (for plan review)

- Should the user model be loaded into the system prompt as a fixed `<user_profile>` block (current proposal) or as a tool the agent can query when relevant (lower context cost, slightly higher latency)?
- For Honcho sync, push-only (local is authoritative) or bidirectional reconcile (more complex, but matches Honcho's model)?
- Default for the dialectic confirmation: required for every material change, or batched once per day (3am digest)?
