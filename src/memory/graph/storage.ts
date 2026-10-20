/**
 * Knowledge Graph Storage
 *
 * SQLite-backed storage with in-memory caching for fast graph queries.
 * Supports entity deduplication, relationship indexing, and temporal queries.
 */

import { Database } from "bun:sqlite"
import { resolve } from "node:path"
import { createLogger } from "../../cli/logger"
import { openDatabase } from "../../utils/sqlite"
import type { Entity, Relationship, EntityType, RelationType, GraphQuery, GraphResult } from "./types"
import { DEFAULT_TEMPORAL_CONFIG, type TemporalConfig } from "./types"

const log = createLogger("memory:graph")

const GRAPH_DB_PATH = resolve(process.cwd(), ".aegis/memory/graph")
const DEFAULT_QUERY_LIMIT = 100
const MAX_RELATIONSHIP_ENTITY_IDS = 500

export class GraphStorage {
  private db: Database | null = null
  private cache: Map<string, Entity> = new Map()
  private relCache: Map<string, Relationship> = new Map()
  private temporalConfig: TemporalConfig
  private dbDir: string

  constructor(config: TemporalConfig = DEFAULT_TEMPORAL_CONFIG, options: { dbPath?: string } = {}) {
    this.temporalConfig = config
    this.dbDir = options.dbPath ?? GRAPH_DB_PATH
  }

  async initialize(): Promise<void> {
    const dbFile = resolve(this.dbDir, "graph.db")
    this.db = openDatabase(dbFile)

    this.createSchema()
    this.loadCache()
  }

  private createSchema(): void {
    if (!this.db) return

    // Entities table with full-text search
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        aliases TEXT, -- JSON array
        properties TEXT, -- JSON object
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_mentioned_at TEXT NOT NULL,
        mention_count INTEGER DEFAULT 1,
        embedding TEXT -- JSON array, optional
      )
    `)

    // Relationships table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS relationships (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        type TEXT NOT NULL,
        properties TEXT, -- JSON object
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        strength REAL DEFAULT 1.0,
        FOREIGN KEY (source_id) REFERENCES entities(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES entities(id) ON DELETE CASCADE
      )
    `)

    // Indexes for fast queries
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_entities_mentioned ON entities(last_mentioned_at)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_rels_source ON relationships(source_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_rels_target ON relationships(target_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_rels_type ON relationships(type)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_rels_strength ON relationships(strength DESC)`)

    // FTS5 for text search on entity names and aliases
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS entity_fts USING fts5(
        name, aliases,
        content='entities',
        content_rowid='rowid'
      )
    `)

    this.createFtsTriggers()
  }

  private createFtsTriggers(): void {
    if (!this.db) return

    const existing = this.db
      .query("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'entities_fts_ai'")
      .get()

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS entities_fts_ai AFTER INSERT ON entities BEGIN
        INSERT INTO entity_fts(rowid, name, aliases) VALUES (new.rowid, new.name, new.aliases);
      END;

      CREATE TRIGGER IF NOT EXISTS entities_fts_au AFTER UPDATE ON entities BEGIN
        INSERT INTO entity_fts(entity_fts, rowid, name, aliases) VALUES('delete', old.rowid, old.name, old.aliases);
        INSERT INTO entity_fts(rowid, name, aliases) VALUES (new.rowid, new.name, new.aliases);
      END;

      CREATE TRIGGER IF NOT EXISTS entities_fts_ad AFTER DELETE ON entities BEGIN
        INSERT INTO entity_fts(entity_fts, rowid, name, aliases) VALUES('delete', old.rowid, old.name, old.aliases);
      END;
    `)

    if (!existing) {
      const row = this.db.query("SELECT COUNT(*) as c FROM entities").get() as { c: number }
      if (row.c > 0) {
        this.db.exec("INSERT INTO entity_fts(entity_fts) VALUES('rebuild')")
        log.info("Rebuilt entity FTS index to match entities table")
      }
    }
  }

  private loadCache(): void {
    if (!this.db) return

    // Load frequently accessed entities into memory
    const stmt = this.db.query(`
      SELECT * FROM entities 
      WHERE mention_count > 2 
      ORDER BY last_mentioned_at DESC 
      LIMIT 1000
    `)

    const rows = stmt.all() as Array<{
      id: string
      type: EntityType
      name: string
      aliases: string
      properties: string
      created_at: string
      updated_at: string
      last_mentioned_at: string
      mention_count: number
      embedding?: string
    }>

    for (const row of rows) {
      this.cache.set(row.id, this.rowToEntity(row))
    }
  }

  private rowToEntity(row: {
    id: string
    type: EntityType
    name: string
    aliases: string
    properties: string
    created_at: string
    updated_at: string
    last_mentioned_at: string
    mention_count: number
    embedding?: string
  }): Entity {
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      aliases: JSON.parse(row.aliases || "[]"),
      properties: JSON.parse(row.properties || "{}"),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastMentionedAt: row.last_mentioned_at,
      mentionCount: row.mention_count,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
    }
  }

  private rowToRelationship(row: {
    id: string
    source_id: string
    target_id: string
    type: RelationType
    properties: string
    created_at: string
    updated_at: string
    strength: number
  }): Relationship {
    return {
      id: row.id,
      sourceId: row.source_id,
      targetId: row.target_id,
      type: row.type,
      properties: JSON.parse(row.properties || "{}"),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      strength: row.strength,
    }
  }

  // ── Entity Operations ───────────────────────────────────────────────

  async createEntity(
    entity: Omit<Entity, "id" | "createdAt" | "updatedAt" | "lastMentionedAt" | "mentionCount">,
  ): Promise<Entity> {
    if (!this.db) throw new Error("Storage not initialized")

    const now = new Date().toISOString()
    const id = `ent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

    const fullEntity: Entity = {
      ...entity,
      id,
      createdAt: now,
      updatedAt: now,
      lastMentionedAt: now,
      mentionCount: 1,
    }

    const stmt = this.db.prepare(`
      INSERT INTO entities (id, type, name, aliases, properties, created_at, updated_at, last_mentioned_at, mention_count, embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      fullEntity.id,
      fullEntity.type,
      fullEntity.name,
      JSON.stringify(fullEntity.aliases),
      JSON.stringify(fullEntity.properties),
      fullEntity.createdAt,
      fullEntity.updatedAt,
      fullEntity.lastMentionedAt,
      fullEntity.mentionCount,
      fullEntity.embedding ? JSON.stringify(fullEntity.embedding) : null,
    )

    this.cache.set(fullEntity.id, fullEntity)
    return fullEntity
  }

  async getEntity(id: string): Promise<Entity | null> {
    // Check cache first
    const cached = this.cache.get(id)
    if (cached) return cached

    if (!this.db) return null

    const stmt = this.db.query("SELECT * FROM entities WHERE id = ?")
    const row = stmt.get(id) as Parameters<typeof this.rowToEntity>[0] | null

    if (!row) return null

    const entity = this.rowToEntity(row)
    this.cache.set(id, entity)
    return entity
  }

  async findEntityByName(name: string, type?: EntityType): Promise<Entity | null> {
    if (!this.db) return null

    let sql = "SELECT * FROM entities WHERE name = ? COLLATE NOCASE"
    const params: (string | EntityType)[] = [name]

    if (type) {
      sql += " AND type = ?"
      params.push(type)
    }

    const stmt = this.db.query(sql)
    const row = stmt.get(...params) as Parameters<typeof this.rowToEntity>[0] | null

    if (!row) return null
    return this.rowToEntity(row)
  }

  async updateEntity(id: string, updates: Partial<Entity>): Promise<Entity | null> {
    if (!this.db) return null

    const existing = await this.getEntity(id)
    if (!existing) return null

    const updated: Entity = {
      ...existing,
      ...updates,
      id: existing.id, // Prevent ID change
      updatedAt: new Date().toISOString(),
    }

    const stmt = this.db.prepare(`
      UPDATE entities 
      SET name = ?, aliases = ?, properties = ?, updated_at = ?, 
          last_mentioned_at = ?, mention_count = ?, embedding = ?
      WHERE id = ?
    `)

    stmt.run(
      updated.name,
      JSON.stringify(updated.aliases),
      JSON.stringify(updated.properties),
      updated.updatedAt,
      updated.lastMentionedAt,
      updated.mentionCount,
      updated.embedding ? JSON.stringify(updated.embedding) : null,
      id,
    )

    this.cache.set(id, updated)
    return updated
  }

  async mentionEntity(id: string): Promise<void> {
    if (!this.db) return

    const now = new Date().toISOString()
    const stmt = this.db.prepare(`
      UPDATE entities 
      SET mention_count = mention_count + 1, last_mentioned_at = ?
      WHERE id = ?
    `)
    stmt.run(now, id)

    const row = this.db.query("SELECT * FROM entities WHERE id = ?").get(id) as Parameters<
      typeof this.rowToEntity
    >[0] | null
    if (!row) return

    const entity = this.rowToEntity(row)
    const cached = this.cache.get(id)
    if (cached) {
      cached.mentionCount = entity.mentionCount
      cached.lastMentionedAt = entity.lastMentionedAt
      this.cache.set(id, cached)
    } else {
      this.cache.set(id, entity)
    }
  }

  async deleteEntity(id: string): Promise<boolean> {
    if (!this.db) return false

    const existing = await this.getEntity(id)
    if (!existing) return false

    this.db.prepare("DELETE FROM relationships WHERE source_id = ? OR target_id = ?").run(id, id)
    this.db.prepare("DELETE FROM entities WHERE id = ?").run(id)

    this.cache.delete(id)
    for (const [relId, rel] of this.relCache) {
      if (rel.sourceId === id || rel.targetId === id) this.relCache.delete(relId)
    }
    return true
  }

  // ── Relationship Operations ───────────────────────────────────────

  async createRelationship(rel: Omit<Relationship, "id" | "createdAt" | "updatedAt">): Promise<Relationship> {
    if (!this.db) throw new Error("Storage not initialized")

    const now = new Date().toISOString()
    const id = `rel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

    const fullRel: Relationship = {
      ...rel,
      id,
      createdAt: now,
      updatedAt: now,
    }

    const stmt = this.db.prepare(`
      INSERT INTO relationships (id, source_id, target_id, type, properties, created_at, updated_at, strength)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      fullRel.id,
      fullRel.sourceId,
      fullRel.targetId,
      fullRel.type,
      JSON.stringify(fullRel.properties),
      fullRel.createdAt,
      fullRel.updatedAt,
      fullRel.strength,
    )

    this.relCache.set(fullRel.id, fullRel)
    return fullRel
  }

  async getRelationships(
    entityId: string,
    direction: "out" | "in" | "both" = "both",
    type?: RelationType,
  ): Promise<Relationship[]> {
    if (!this.db) return []

    const relationships: Relationship[] = []

    if (direction === "out" || direction === "both") {
      let sql = "SELECT * FROM relationships WHERE source_id = ?"
      const params: (string | RelationType)[] = [entityId]

      if (type) {
        sql += " AND type = ?"
        params.push(type)
      }

      const stmt = this.db.query(sql)
      const rows = stmt.all(...params) as Parameters<typeof this.rowToRelationship>[0][]
      relationships.push(...rows.map((r) => this.rowToRelationship(r)))
    }

    if (direction === "in" || direction === "both") {
      let sql = "SELECT * FROM relationships WHERE target_id = ?"
      const params: (string | RelationType)[] = [entityId]

      if (type) {
        sql += " AND type = ?"
        params.push(type)
      }

      const stmt = this.db.query(sql)
      const rows = stmt.all(...params) as Parameters<typeof this.rowToRelationship>[0][]
      relationships.push(...rows.map((r) => this.rowToRelationship(r)))
    }

    return relationships
  }

  // ── Query Operations ───────────────────────────────────────────────

  async query(query: GraphQuery): Promise<GraphResult> {
    if (!this.db) return { entities: [], relationships: [], scores: new Map() }

    const entities = await this.queryEntities(query)
    const relationships = await this.queryRelationships(
      query,
      entities.map((e) => e.id),
    )
    const scores = this.computeTemporalScores(entities)

    // Filter by min relevance
    if (query.minRelevance) {
      const filtered = entities.filter((e) => (scores.get(e.id) || 0) >= (query.minRelevance ?? 0))
      const filteredIds = new Set(filtered.map((e) => e.id))
      return {
        entities: filtered,
        relationships: relationships.filter((r) => filteredIds.has(r.sourceId) && filteredIds.has(r.targetId)),
        scores,
      }
    }

    return { entities, relationships, scores }
  }

  private async queryEntities(query: GraphQuery): Promise<Entity[]> {
    if (!this.db) return []

    const conditions: string[] = []
    const params: (string | number)[] = []

    if (query.entityTypes?.length) {
      conditions.push(`type IN (${query.entityTypes.map(() => "?").join(",")})`)
      params.push(...query.entityTypes)
    }

    if (query.since) {
      conditions.push("last_mentioned_at >= ?")
      params.push(query.since.toISOString())
    }

    if (query.until) {
      conditions.push("last_mentioned_at <= ?")
      params.push(query.until.toISOString())
    }

    let sql = "SELECT * FROM entities"
    if (conditions.length) {
      sql += " WHERE " + conditions.join(" AND ")
    }
    sql += " ORDER BY mention_count DESC, last_mentioned_at DESC"

    const limit = query.limit === undefined ? DEFAULT_QUERY_LIMIT : query.limit
    sql += " LIMIT ?"
    params.push(limit < 0 ? -1 : limit)

    if (query.offset !== undefined && query.offset > 0) {
      sql += " OFFSET ?"
      params.push(query.offset)
    }

    const stmt = this.db.query(sql)
    const rows = stmt.all(...params) as Parameters<typeof this.rowToEntity>[0][]
    return rows.map((r) => this.rowToEntity(r))
  }

  private async queryRelationships(query: GraphQuery, entityIds: string[]): Promise<Relationship[]> {
    if (!this.db || entityIds.length === 0) return []

    const ids = entityIds.slice(0, MAX_RELATIONSHIP_ENTITY_IDS)
    if (ids.length === 0) return []

    const conditions: string[] = []
    const params: (string | number)[] = []

    // Only get relationships between the queried entities
    conditions.push(`source_id IN (${ids.map(() => "?").join(",")})`)
    conditions.push(`target_id IN (${ids.map(() => "?").join(",")})`)
    params.push(...ids, ...ids)

    if (query.relationTypes?.length) {
      conditions.push(`type IN (${query.relationTypes.map(() => "?").join(",")})`)
      params.push(...query.relationTypes)
    }

    let sql = "SELECT * FROM relationships WHERE " + conditions.join(" AND ")
    sql += " ORDER BY strength DESC"

    const stmt = this.db.query(sql)
    const rows = stmt.all(...params) as Parameters<typeof this.rowToRelationship>[0][]
    return rows.map((r) => this.rowToRelationship(r))
  }

  private computeTemporalScores(entities: Entity[]): Map<string, number> {
    const scores = new Map<string, number>()
    const now = Date.now()
    const halfLifeMs = this.temporalConfig.halfLifeDays * 24 * 60 * 60 * 1000

    for (const entity of entities) {
      const lastMentioned = new Date(entity.lastMentionedAt).getTime()
      const ageMs = now - lastMentioned

      // Exponential decay: score = 0.5^(age / halfLife)
      let score = Math.pow(0.5, ageMs / halfLifeMs)

      // Boost for recent mentions
      if (ageMs < 7 * 24 * 60 * 60 * 1000) {
        score *= this.temporalConfig.boostRecent
      }

      // Boost for frequently mentioned
      if (entity.mentionCount > 5) {
        score *= this.temporalConfig.boostFrequent
      }

      scores.set(entity.id, Math.min(score, 1.0))
    }

    return scores
  }

  // ── Search Operations ───────────────────────────────────────────────

  private buildFtsQuery(text: string): string {
    const terms = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => `"${t}"`)
    return terms.join(" AND ")
  }

  async searchEntities(query: string, limit = 10): Promise<Entity[]> {
    if (!this.db) return []

    const ftsQuery = this.buildFtsQuery(query)

    if (ftsQuery) {
      try {
        const stmt = this.db.query(`
          SELECT e.* FROM entity_fts fts
          JOIN entities e ON e.rowid = fts.rowid
          WHERE entity_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `)

        const rows = stmt.all(ftsQuery, limit) as Parameters<typeof this.rowToEntity>[0][]
        return rows.map((r) => this.rowToEntity(r))
      } catch (err) {
        log.warn("FTS5 entity search failed — falling back to LIKE scan", { error: String(err) })
      }
    }

    return this.likeSearchEntities(query, limit)
  }

  private likeSearchEntities(query: string, limit: number): Entity[] {
    if (!this.db) return []

    const term = query.trim().replace(/[\\%_]/g, (m) => `\\${m}`)
    if (!term) return []

    const stmt = this.db.query(`
      SELECT * FROM entities
      WHERE name LIKE ? ESCAPE '\\' OR aliases LIKE ? ESCAPE '\\'
      ORDER BY mention_count DESC, last_mentioned_at DESC
      LIMIT ?
    `)

    const pattern = `%${term}%`
    const rows = stmt.all(pattern, pattern, limit) as Parameters<typeof this.rowToEntity>[0][]
    return rows.map((r) => this.rowToEntity(r))
  }

  // ── Stats & Maintenance ────────────────────────────────────────────

  async getStats(): Promise<{
    entityCount: number
    relationshipCount: number
    byType: Record<string, number>
    byRelationType: Record<string, number>
  }> {
    if (!this.db) {
      return { entityCount: 0, relationshipCount: 0, byType: {}, byRelationType: {} }
    }

    const entityCount = (this.db.query("SELECT COUNT(*) as count FROM entities").get() as { count: number }).count
    const relCount = (this.db.query("SELECT COUNT(*) as count FROM relationships").get() as { count: number }).count

    const byType: Record<string, number> = {}
    const typeRows = this.db.query("SELECT type, COUNT(*) as count FROM entities GROUP BY type").all() as Array<{
      type: string
      count: number
    }>
    for (const row of typeRows) {
      byType[row.type] = row.count
    }

    const byRelationType: Record<string, number> = {}
    const relTypeRows = this.db
      .query("SELECT type, COUNT(*) as count FROM relationships GROUP BY type")
      .all() as Array<{ type: string; count: number }>
    for (const row of relTypeRows) {
      byRelationType[row.type] = row.count
    }

    return { entityCount, relationshipCount: relCount, byType, byRelationType }
  }

  async close(): Promise<void> {
    this.cache.clear()
    this.relCache.clear()
    this.db?.close()
    this.db = null
  }
}

export const graphStorage = new GraphStorage()
