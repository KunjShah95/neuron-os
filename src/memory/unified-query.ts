import { createLogger } from "../cli/logger"
import { FTS5Retriever } from "./recall/retriever"
import { FTS5Indexer } from "./recall/indexer"
import { vectorMemory as defaultVectorMemory, VectorMemory } from "./vector"
import { sessionStore as defaultSessionStore, SessionStore } from "./session-persistence"
import { experienceStore as defaultExperienceStore, ExperienceStore } from "../experience/store"
import { computeEmbedding, cosineSimilarity } from "./embedding"
import { knowledgeGraph as defaultKnowledgeGraph, KnowledgeGraph } from "./graph"

const log = createLogger("unified-query")

export interface UnifiedQuery {
  query: string
  stores?: ("recall" | "vector" | "sessions" | "experience" | "graph")[]
  limit?: number
  minScore?: number
}

export interface UnifiedResult {
  store: "recall" | "vector" | "sessions" | "experience" | "graph"
  score: number
  content: string
  sessionId?: string
  timestamp?: string
  metadata?: Record<string, unknown>
}

export interface UnifiedStoreStats {
  recall: { indexedTurns: number; sessions: number }
  vector: { entries: number }
  sessions: { total: number; messages: number }
  experience: { total: number; successRate: number }
  graph: { entities: number; relationships: number }
}

export class UnifiedMemoryQuery {
  private static recallRetriever: FTS5Retriever | null = null
  private static recallIndexer: FTS5Indexer | null = null
  private static _vectorMemory: VectorMemory = defaultVectorMemory
  private static _sessionStore: SessionStore = defaultSessionStore
  private static _experienceStore: ExperienceStore = defaultExperienceStore
  private static _knowledgeGraph: KnowledgeGraph = defaultKnowledgeGraph

  static configure(deps: {
    recallRetriever?: FTS5Retriever
    recallIndexer?: FTS5Indexer
    vectorMemory?: VectorMemory
    sessionStore?: SessionStore
    experienceStore?: ExperienceStore
    knowledgeGraph?: KnowledgeGraph
  }): void {
    if (deps.recallRetriever !== undefined) this.recallRetriever = deps.recallRetriever
    if (deps.recallIndexer !== undefined) this.recallIndexer = deps.recallIndexer
    if (deps.vectorMemory !== undefined) this._vectorMemory = deps.vectorMemory
    if (deps.sessionStore !== undefined) this._sessionStore = deps.sessionStore
    if (deps.experienceStore !== undefined) this._experienceStore = deps.experienceStore
    if (deps.knowledgeGraph !== undefined) this._knowledgeGraph = deps.knowledgeGraph
  }

  static async search(query: UnifiedQuery): Promise<UnifiedResult[]> {
    const stores = query.stores ?? ["recall", "vector", "sessions", "experience", "graph"]
    const limit = query.limit ?? 5
    const minScore = query.minScore ?? 0.3

    const results = await Promise.all(stores.map((store) => this.searchStore(store, query.query, limit)))

    return this.mergeResults(results.flat(), minScore)
  }

  static async searchStore(
    store: "recall" | "vector" | "sessions" | "experience" | "graph",
    query: string,
    limit: number,
  ): Promise<UnifiedResult[]> {
    try {
      switch (store) {
        case "recall":
          return this.searchRecall(query, limit)
        case "vector":
          return await this.searchVector(query, limit)
        case "sessions":
          return this.searchSessions(query, limit)
        case "experience":
          return this.searchExperience(query, limit)
        case "graph":
          return this.searchGraph(query, limit)
      }
    } catch (err) {
      log.error(`Error searching store "${store}"`, { error: String(err) })
      return []
    }
  }

  static async getStoreStats(): Promise<UnifiedStoreStats> {
    const [recall, vector, sessions, experience, graph] = await Promise.all([
      this.getRecallStats(),
      this.getVectorStats(),
      this.getSessionStats(),
      this.getExperienceStats(),
      this.getGraphStats(),
    ])
    return { recall, vector, sessions, experience, graph }
  }

  // ── Private per-store search ──────────────────────────────────────

  private static searchRecall(query: string, limit: number): UnifiedResult[] {
    if (!this.recallRetriever) return []
    const hits = this.recallRetriever.retrieve({ text: query, maxResults: limit })
    if (hits.length === 0) return []

    const scores = hits.map((h) => h.finalScore)
    const min = Math.min(...scores)
    const max = Math.max(...scores)
    const range = max - min || 1

    return hits.map((h) => ({
      store: "recall" as const,
      score: Math.max(0, Math.min(1, (h.finalScore - min) / range)),
      content: h.content,
      sessionId: h.session_id,
      timestamp: new Date(h.ts).toISOString(),
      metadata: { role: h.role, turnId: h.turn_id },
    }))
  }

  private static async searchVector(query: string, limit: number): Promise<UnifiedResult[]> {
    await this._vectorMemory.initialize()
    const entries = await this._vectorMemory.search(query, limit * 2)
    if (entries.length === 0) return []

    const queryEmbed = computeEmbedding(query)
    const withScores = entries.map((e) => ({
      entry: e,
      score: cosineSimilarity(queryEmbed, computeEmbedding(e.content)),
    }))
    withScores.sort((a, b) => b.score - a.score)

    return withScores.slice(0, limit).map((s) => ({
      store: "vector" as const,
      score: s.score,
      content: s.entry.content,
      sessionId: s.entry.source,
      timestamp: s.entry.timestamp ?? new Date().toISOString(),
      metadata: { category: s.entry.category, id: s.entry.id },
    }))
  }

  private static searchSessions(query: string, limit: number): UnifiedResult[] {
    const results = this._sessionStore.searchMessages(query, limit)
    if (results.length === 0) return []

    return results.map((r, i) => ({
      store: "sessions" as const,
      score: Math.max(0.1, 0.7 * (1 - i / (results.length * 2))),
      content: r.message.content,
      sessionId: r.message.sessionId,
      timestamp: new Date(r.message.timestamp).toISOString(),
      metadata: {
        role: r.message.role,
        sessionName: r.session.name,
        sessionGoal: r.session.goal,
      },
    }))
  }

  private static searchExperience(query: string, limit: number): UnifiedResult[] {
    const results = this._experienceStore.searchByGoalSimilarity(query, limit)
    if (results.length === 0) return []

    return results.map((r) => ({
      store: "experience" as const,
      score: Math.max(0, Math.min(1, r.similarity)),
      content: `[${r.outcome}] ${r.goal} — ${r.summary}`,
      sessionId: r.sessionId,
      timestamp: r.completedAt,
      metadata: {
        outcome: r.outcome,
        reward: r.reward,
        agentType: r.agentType,
        tags: r.tags,
      },
    }))
  }

  private static searchGraph(query: string, limit: number): UnifiedResult[] {
    const entities = this._knowledgeGraph.search({ query, limit })
    if (entities.length === 0) return []

    return entities.map((e) => ({
      store: "graph" as const,
      score: e.confidence,
      content: `[${e.type}] ${e.name}: ${e.context}`.slice(0, 300),
      sessionId: e.source,
      timestamp: e.updatedAt,
      metadata: { entityId: e.id, entityType: e.type, confidence: e.confidence },
    }))
  }

  // ── Private stats ─────────────────────────────────────────────────

  private static async getRecallStats(): Promise<UnifiedStoreStats["recall"]> {
    if (this.recallIndexer) {
      const stats = this.recallIndexer.getStats()
      return { indexedTurns: stats.totalTurns, sessions: stats.totalSessions }
    }
    return { indexedTurns: 0, sessions: 0 }
  }

  private static async getVectorStats(): Promise<UnifiedStoreStats["vector"]> {
    try {
      await this._vectorMemory.initialize()
      const stats = await this._vectorMemory.getStats()
      return { entries: stats.total }
    } catch {
      return { entries: 0 }
    }
  }

  private static async getSessionStats(): Promise<UnifiedStoreStats["sessions"]> {
    try {
      const stats = this._sessionStore.getStats()
      return { total: stats.totalSessions, messages: stats.totalMessages }
    } catch {
      return { total: 0, messages: 0 }
    }
  }

  private static async getExperienceStats(): Promise<UnifiedStoreStats["experience"]> {
    try {
      const stats = this._experienceStore.getStats()
      const successRate =
        stats.totalExperiences > 0 ? Math.round((stats.successCount / stats.totalExperiences) * 100) : 0
      return { total: stats.totalExperiences, successRate }
    } catch {
      return { total: 0, successRate: 0 }
    }
  }

  private static async getGraphStats(): Promise<UnifiedStoreStats["graph"]> {
    try {
      const stats = this._knowledgeGraph.getStats()
      return { entities: stats.entityCount, relationships: stats.relationshipCount }
    } catch {
      return { entities: 0, relationships: 0 }
    }
  }

  // ── Merge / dedup / rank ──────────────────────────────────────────

  private static mergeResults(results: UnifiedResult[], minScore: number): UnifiedResult[] {
    const seen = new Set<string>()

    return results
      .filter((r) => r.score >= minScore)
      .filter((r) => {
        const key = `${r.sessionId ?? ""}:${this.contentHash(r.content)}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => b.score - a.score)
  }

  private static contentHash(content: string): string {
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      hash = (hash << 5) - hash + content.charCodeAt(i)
      hash = hash & hash
    }
    return String(hash)
  }
}
