/**
 * Knowledge Graph Storage
 * 
 * SQLite-backed storage with in-memory caching for fast graph queries.
 * Supports entity deduplication, relationship indexing, and temporal queries.
 */

import { Database } from "bun:sqlite"
import { resolve } from "node:path"
import { mkdir } from "node:fs/promises"
import type { Entity, Relationship, EntityType, RelationType, GraphQuery, GraphResult } from "./types"
import { DEFAULT_TEMPORAL_CONFIG, type TemporalConfig } from "./types"

const GRAPH_DB_PATH = resolve(process.cwd(), ".aegis/memory/graph")

export class GraphStorage {
  private db: Database | null = null
  private cache: Map<string, Entity> = new Map()
  private relCache: Map<string, Relationship> = new Map()
  private temporalConfig: TemporalConfig

  constructor(config: TemporalConfig = DEFAULT_TEMPORAL_CONFIG) {
    this.temporalConfig = config
  }

  async initialize(): Promise<void> {
    await mkdir(GRAPH_DB_PATH, { recursive: true })
    
    const dbFile = resolve(GRAPH_DB_PATH, "graph.db")
    this.db = new Database(dbFile)
    this.db.exec("PRAGMA journal_mode = WAL")
    
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

  async createEntity(entity: Omit<Entity, "id" | "createdAt" | "updatedAt" | "lastMentionedAt" | "mentionCount">): Promise<Entity> {
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
      fullEntity.embedding ? JSON.stringify(fullEntity.embedding) : null
    )

    // Update FTS index
    const ftsStmt = this.db.prepare(`
      INSERT INTO entity_fts (rowid, name, aliases) 
      VALUES ((SELECT rowid FROM entities WHERE id = ?), ?, ?)
    `)
    ftsStmt.run(fullEntity.id, fullEntity.name, fullEntity.aliases.join(" "))

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
      id
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

    const entity = await this.getEntity(id)
    if (entity) {
      entity.mentionCount++
      entity.lastMentionedAt = now
      this.cache.set(id, entity)
    }
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
      fullRel.strength
    )

    this.relCache.set(fullRel.id, fullRel)
    return fullRel
  }

  async getRelationships(entityId: string, direction: "out" | "in" | "both" = "both", type?: RelationType): Promise<Relationship[]> {
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
      relationships.push(...rows.map(r => this.rowToRelationship(r)))
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
      relationships.push(...rows.map(r => this.rowToRelationship(r)))
    }

    return relationships
  }

  // ── Query Operations ───────────────────────────────────────────────

  async query(query: GraphQuery): Promise<GraphResult> {
    if (!this.db) return { entities: [], relationships: [], scores: new Map() }

    const entities = await this.queryEntities(query)
    const relationships = await this.queryRelationships(query, entities.map(e => e.id))
    const scores = this.computeTemporalScores(entities)

    // Filter by min relevance
    if (query.minRelevance) {
      const filtered = entities.filter(e => (scores.get(e.id) || 0) >= query.minRelevance!)
      const filteredIds = new Set(filtered.map(e => e.id))
      return {
        entities: filtered,
        relationships: relationships.filter(r => filteredIds.has(r.sourceId) && filteredIds.has(r.targetId)),
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
    
    if (query.limit) {
      sql += " LIMIT ?"
      params.push(query.limit)
    }
    if (query.offset) {
      sql += " OFFSET ?"
      params.push(query.offset)
    }

    const stmt = this.db.query(sql)
    const rows = stmt.all(...params) as Parameters<typeof this.rowToEntity>[0][]
    return rows.map(r => this.rowToEntity(r))
  }

  private async queryRelationships(query: GraphQuery, entityIds: string[]): Promise<Relationship[]> {
    if (!this.db || entityIds.length === 0) return []

    const conditions: string[] = []
    const params: (string | number)[] = []

    // Only get relationships between the queried entities
    conditions.push(`source_id IN (${entityIds.map(() => "?").join(",")})`)
    conditions.push(`target_id IN (${entityIds.map(() => "?").join(",")})`)
    params.push(...entityIds, ...entityIds)

    if (query.relationTypes?.length) {
      conditions.push(`type IN (${query.relationTypes.map(() => "?").join(",")})`)
      params.push(...query.relationTypes)
    }

    let sql = "SELECT * FROM relationships WHERE " + conditions.join(" AND ")
    sql += " ORDER BY strength DESC"

    const stmt = this.db.query(sql)
    const rows = stmt.all(...params) as Parameters<typeof this.rowToRelationship>[0][]
    return rows.map(r => this.rowToRelationship(r))
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

  async searchEntities(query: string, limit = 10): Promise<Entity[]> {
    if (!this.db) return []

    // Use FTS5 for text search
    const stmt = this.db.query(`
      SELECT e.* FROM entity_fts fts
      JOIN entities e ON e.rowid = fts.rowid
      WHERE entity_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `)

    const rows = stmt.all(query, limit) as Parameters<typeof this.rowToEntity>[0][]
    return rows.map(r => this.rowToEntity(r))
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
    const typeRows = this.db.query("SELECT type, COUNT(*) as count FROM entities GROUP BY type").all() as Array<{ type: string; count: number }>
    for (const row of typeRows) {
      byType[row.type] = row.count
    }

    const byRelationType: Record<string, number> = {}
    const relTypeRows = this.db.query("SELECT type, COUNT(*) as count FROM relationships GROUP BY type").all() as Array<{ type: string; count: number }>
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
