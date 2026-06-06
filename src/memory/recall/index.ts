/**
 * src/memory/recall/index.ts
 *
 * FTS5-backed recall module — indexes every session turn in a SQLite FTS5
 * virtual table and retrieves context via BM25 + recency + entity scoring.
 *
 * Architecture:
 *   schema.sql   → CREATE VIRTUAL TABLE ... USING fts5(...)
 *   indexer.ts   → writes per-turn to the FTS5 table
 *   retriever.ts → BM25 + recency + entity expansion
 *   summarizer.ts → LLM summary of top-k hits (fallback to raw)
 */

export { FTS5Indexer } from "./indexer"
export { FTS5Retriever } from "./retriever"
export { Summarizer } from "./summarizer"
export type { RecallHit, RecallQuery, RecallConfig } from "./types"

export const DEFAULT_RECALL_CONFIG = {
  maxResults: 3,
  maxAgeDays: 90,
  summaryTokenBudget: 400,
  summarizerTimeoutMs: 5000,
}

export function ensureFTS5Schema(db: any): void {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS recall_index USING fts5(
      session_id UNINDEXED,
      turn_id    UNINDEXED,
      ts         UNINDEXED,
      role       UNINDEXED,
      content,
      entities,
      tokenize = 'porter unicode61'
    );
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS recall_meta (
      session_id TEXT PRIMARY KEY,
      started_at INTEGER,
      last_seen  INTEGER,
      turn_count INTEGER
    );
  `)

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS recall_entities USING fts5(
      entity,
      turn_ids,
      tokenize = 'porter unicode61'
    );
  `)
}
