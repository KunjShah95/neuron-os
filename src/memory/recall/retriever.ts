/**
 * src/memory/recall/retriever.ts
 *
 * BM25 + recency + entity-overlap scoring against the FTS5 recall_index.
 * Returns top-k hits with a finalScore that blends all three signals.
 */

import { createLogger } from "../../cli/logger"
import type { RecallHit, RecallQuery, RecallConfig } from "./types"

const log = createLogger("recall:retriever")

export class FTS5Retriever {
  private db: import("better-sqlite3").Database | null = null

  constructor(private config: RecallConfig) {}

  setDb(db: import("better-sqlite3").Database): void {
    this.db = db
  }

  /**
   * Build an FTS5-safe query string from natural language.
   * Escapes special characters and joins terms with AND.
   */
  private buildFtsQuery(text: string): string {
    const terms = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => `"${t}"`)
    return terms.join(" AND ")
  }

  /**
   * Recency multiplier: higher weight for recent turns.
   * Linearly decays from 1.0 (today) to 0.5 (maxAgeDays ago).
   */
  private recencyMultiplier(ts: number, maxAgeDays: number): number {
    const ageMs = Date.now() - ts
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
    const ratio = Math.min(1, Math.max(0, ageMs / maxAgeMs))
    return 1.0 - ratio * 0.5
  }

  /**
   * Entity overlap bonus: +0.1 for each entity that matches
   * between the query and the hit.
   */
  private entityBonus(queryEntities: string[], hitEntities: string[]): number {
    if (queryEntities.length === 0 || hitEntities.length === 0) return 0
    const overlap = queryEntities.filter((e) => hitEntities.includes(e))
    return overlap.length * 0.1
  }

  /** Extract entity-like words from text (capitalized words, hyphenated terms) */
  private extractEntities(text: string): string[] {
    const matches = text.match(/([A-Z][a-z]+(?:-[A-Z][a-z]+)*|[a-z]+-[a-z]+(?:-[a-z]+)*)/g)
    return [...new Set(matches ?? [])]
  }

  /**
   * Retrieve top-k hits matching the query.
   */
  retrieve(query: RecallQuery): RecallHit[] {
    if (!this.db) {
      log.warn("No database set")
      return []
    }

    const maxResults = query.maxResults ?? this.config.maxResults
    const maxAgeDays = query.maxAgeDays ?? this.config.maxAgeDays
    const ftsQuery = this.buildFtsQuery(query.text)

    try {
      const rows = this.db
        .prepare(
          `SELECT session_id, turn_id, ts, role, content, entities,
                  bm25(recall_index) AS score
           FROM recall_index
           WHERE recall_index MATCH ?
           ORDER BY score
           LIMIT ?`,
        )
        .all(ftsQuery, 50) as Array<{
        session_id: string
        turn_id: string
        ts: number
        role: string
        content: string
        entities: string | null
        score: number
      }>

      const queryEntities = this.extractEntities(query.text)

      const hits: RecallHit[] = rows.map((row) => {
        const hitEntities = (row.entities ?? "").split(" ").filter(Boolean)
        return {
          session_id: row.session_id,
          turn_id: row.turn_id,
          ts: row.ts,
          role: row.role as RecallHit["role"],
          content: row.content,
          score: row.score,
          finalScore:
            row.score * 0.6 + // BM25 weight
            this.recencyMultiplier(row.ts, maxAgeDays) * 0.3 + // recency weight
            this.entityBonus(queryEntities, hitEntities) * 0.1, // entity weight
        }
      })

      // Sort by final score descending, take top-k
      hits.sort((a, b) => b.finalScore - a.finalScore)
      return hits.slice(0, maxResults)
    } catch (err) {
      log.error("FTS5 query failed — falling back to linear scan", { error: String(err) })

      // Fallback: linear scan over last 50 turns
      try {
        const recentRows = this.db
          .prepare(
            `SELECT session_id, turn_id, ts, role, content, 0.0 AS score
             FROM recall_index
             ORDER BY ts DESC
             LIMIT 50`,
          )
          .all() as Array<{
          session_id: string
          turn_id: string
          ts: number
          role: string
          content: string
          score: number
        }>

        // Simple keyword match on the fallback
        const queryTerms = query.text.toLowerCase().split(/\s+/).filter(Boolean)
        return recentRows
          .filter((row) => queryTerms.some((term) => row.content.toLowerCase().includes(term)))
          .slice(0, maxResults)
          .map((row) => ({
            session_id: row.session_id,
            turn_id: row.turn_id,
            ts: row.ts,
            role: row.role as RecallHit["role"],
            content: row.content,
            score: 0,
            finalScore: this.recencyMultiplier(row.ts, maxAgeDays),
          }))
      } catch (fallbackErr) {
        log.error("Fallback scan also failed", { error: String(fallbackErr) })
        return []
      }
    }
  }
}
