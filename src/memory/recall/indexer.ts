/**
 * src/memory/recall/indexer.ts
 *
 * Writes every session turn to the FTS5 recall index.
 * Called from agent lifecycle hooks on each message in/out.
 */

import { createLogger } from "../../cli/logger"
import type { RecallConfig } from "./types"

const log = createLogger("recall:indexer")

export interface IndexTurn {
  sessionId: string
  turnId: string
  ts: number
  role: "user" | "assistant" | "tool"
  content: string
  entities?: string[]
}

export class FTS5Indexer {
  private db: any | null = null

  constructor(_config?: Partial<RecallConfig>) {}

  /** Set the database instance (must open a SQLite db first) */
  setDb(db: any): void {
    this.db = db
  }

  /** Index a single turn into the FTS5 table */
  indexTurn(turn: IndexTurn): void {
    if (!this.db) {
      log.warn("No database set — skipping index")
      return
    }

    try {
      const stmt = this.db.prepare(`
        INSERT INTO recall_index (session_id, turn_id, ts, role, content, entities)
        VALUES (?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        turn.sessionId,
        turn.turnId,
        turn.ts,
        turn.role,
        turn.content,
        (turn.entities ?? []).join(" "),
      )

      // Upsert session metadata
      const metaStmt = this.db.prepare(`
        INSERT INTO recall_meta (session_id, started_at, last_seen, turn_count)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(session_id) DO UPDATE SET
          last_seen = excluded.last_seen,
          turn_count = turn_count + 1
      `)

      metaStmt.run(turn.sessionId, turn.ts, turn.ts)
    } catch (err) {
      log.error("Failed to index turn", { error: String(err), turnId: turn.turnId })
    }
  }

  /** Index a batch of turns (for backfill) */
  indexBatch(turns: IndexTurn[]): void {
    const tx = this.db?.transaction(() => {
      for (const turn of turns) {
        this.indexTurn(turn)
      }
    })
    if (tx) tx()
    log.info(`Indexed ${turns.length} turns in batch`)
  }

  /** Get total indexed turn count */
  getStats(): { totalTurns: number; totalSessions: number } {
    if (!this.db) return { totalTurns: 0, totalSessions: 0 }

    const turnCount = (this.db.prepare("SELECT COUNT(*) as cnt FROM recall_index").get() as any)?.cnt ?? 0
    const sessionCount = (this.db.prepare("SELECT COUNT(*) as cnt FROM recall_meta").get() as any)?.cnt ?? 0

    return { totalTurns: turnCount, totalSessions: sessionCount }
  }
}
