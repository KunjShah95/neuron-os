import { Database } from "bun:sqlite"
import { join } from "node:path"
import { mkdirSync, existsSync } from "node:fs"
import { createLogger } from "../cli/logger"

const log = createLogger("knowledge-graph")

export interface GraphEntity {
  id: string
  name: string
  type: string
  context: string
  source: string
  createdAt: string
  updatedAt: string
  confidence: number
}

export interface GraphRelationship {
  id: string
  sourceId: string
  targetId: string
  type: string
  weight: number
  createdAt: string
}

export interface GraphQuery {
  query: string
  type?: string
  minConfidence?: number
  limit?: number
}

export class KnowledgeGraph {
  private db: Database
  private initialized = false

  constructor() {
    const dir = join(process.cwd(), "data", "memory")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.db = new Database(join(dir, "knowledge-graph.db"))
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec("PRAGMA synchronous = NORMAL")
    this.init()
  }

  private init(): void {
    if (this.initialized) return

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        context TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.5
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS relationships (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        target_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 0.5,
        created_at TEXT NOT NULL
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_entities_name
      ON entities(name)
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_entities_type
      ON entities(type)
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_relationships_source
      ON relationships(source_id)
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_relationships_target
      ON relationships(target_id)
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_relationships_type
      ON relationships(type)
    `)

    this.initialized = true
    log.debug("Knowledge graph initialized")
  }

  addEntity(name: string, type: string, context: string, source: string): GraphEntity {
    const existing = this.getEntityByName(name)
    if (existing) {
      const confidence = Math.min(1, existing.confidence + 0.05)
      const now = new Date().toISOString()
      const stmt = this.db.prepare(`
        UPDATE entities SET type = ?, context = ?, source = ?, updated_at = ?, confidence = ?
        WHERE id = ?
      `)
      stmt.run(type, context || existing.context, source || existing.source, now, confidence, existing.id)
      return { ...existing, type, context: context || existing.context, updatedAt: now, confidence }
    }

    const id = `ent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const now = new Date().toISOString()
    const stmt = this.db.prepare(`
      INSERT INTO entities (id, name, type, context, source, created_at, updated_at, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(id, name, type, context, source, now, now, 0.5)

    return { id, name, type, context, source, createdAt: now, updatedAt: now, confidence: 0.5 }
  }

  addRelationship(sourceId: string, targetId: string, type: string, weight = 0.5): GraphRelationship {
    const id = `rel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const now = new Date().toISOString()
    const stmt = this.db.prepare(`
      INSERT INTO relationships (id, source_id, target_id, type, weight, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    stmt.run(id, sourceId, targetId, type, weight, now)

    return { id, sourceId, targetId, type, weight, createdAt: now }
  }

  search(query: GraphQuery): GraphEntity[] {
    const terms = query.query.toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return []

    const likeClauses = terms.map(() => "LOWER(e.name) LIKE ? OR LOWER(e.context) LIKE ?").join(" OR ")
    const params: any[] = []
    for (const term of terms) {
      params.push(`%${term}%`, `%${term}%`)
    }

    let sql = `SELECT * FROM entities e WHERE (${likeClauses})`
    const queryParams: any[] = [...params]

    if (query.type) {
      sql += " AND e.type = ?"
      queryParams.push(query.type)
    }

    if (query.minConfidence !== undefined) {
      sql += " AND e.confidence >= ?"
      queryParams.push(query.minConfidence)
    }

    sql += " ORDER BY e.confidence DESC"
    if (query.limit !== undefined) {
      sql += " LIMIT ?"
      queryParams.push(query.limit)
    }

    const rows = this.db.prepare(sql).all(...queryParams) as Record<string, unknown>[]
    return rows.map((r) => this.rowToEntity(r))
  }

  getRelated(
    entityId: string,
    relationType?: string,
    depth = 1,
  ): Array<{ entity: GraphEntity; relationship: GraphRelationship }> {
    const visited = new Set<string>()
    const results: Array<{ entity: GraphEntity; relationship: GraphRelationship }> = []

    const collect = (id: string, currentDepth: number) => {
      if (currentDepth > depth || visited.has(id)) return
      visited.add(id)

      let sql = `
        SELECT e.*, r.id as r_id, r.source_id, r.target_id, r.type as r_type, r.weight, r.created_at as r_created_at
        FROM relationships r
        JOIN entities e ON e.id = CASE WHEN r.source_id = ? THEN r.target_id ELSE r.source_id END
        WHERE (r.source_id = ? OR r.target_id = ?)
      `
      const params: any[] = [id, id, id]

      if (relationType) {
        sql += " AND r.type = ?"
        params.push(relationType)
      }

      const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[]
      for (const row of rows) {
        const entity = this.rowToEntity(row)
        if (visited.has(entity.id)) continue
        const rel: GraphRelationship = {
          id: row.r_id as string,
          sourceId: row.source_id as string,
          targetId: row.target_id as string,
          type: row.r_type as string,
          weight: row.weight as number,
          createdAt: row.r_created_at as string,
        }
        results.push({ entity, relationship: rel })
        collect(entity.id, currentDepth + 1)
      }
    }

    collect(entityId, 0)
    return results
  }

  getEntityByName(name: string): GraphEntity | undefined {
    const row = this.db.prepare("SELECT * FROM entities WHERE name = ?").get(name) as Record<string, unknown> | null
    return row ? this.rowToEntity(row) : undefined
  }

  getStats(): { entityCount: number; relationshipCount: number; topTypes: Array<{ type: string; count: number }> } {
    const entityCount = (this.db.prepare("SELECT COUNT(*) as c FROM entities").get() as { c: number }).c
    const relationshipCount = (this.db.prepare("SELECT COUNT(*) as c FROM relationships").get() as { c: number }).c

    const typeRows = this.db
      .prepare("SELECT type, COUNT(*) as count FROM entities GROUP BY type ORDER BY count DESC LIMIT 10")
      .all() as { type: string; count: number }[]

    return { entityCount, relationshipCount, topTypes: typeRows }
  }

  extractEntities(text: string, source: string): GraphEntity[] {
    const entities: GraphEntity[] = []
    const seen = new Set<string>()

    const tryAdd = (name: string, type: string) => {
      if (name.length < 2 || seen.has(name)) return
      seen.add(name)
      entities.push(this.addEntity(name, type, text.slice(0, 200), source))
    }

    const backtickPattern = /`([^`]+)`/g
    let match: RegExpExecArray | null
    while ((match = backtickPattern.exec(text)) !== null) {
      const term = match[1]!.trim()
      if (term.length >= 2) {
        if (/[A-Z]/.test(term[0]!) || /[a-z]/.test(term[0]!)) {
          tryAdd(term, /[A-Z]/.test(term[0]!) ? "concept" : "tool")
        }
      }
    }

    const capitalizedPattern = /\b([A-Z][a-zA-Z]+)\b/g
    while ((match = capitalizedPattern.exec(text)) !== null) {
      const word = match[1]!
      if (
        word.length >= 3 &&
        ![
          "The",
          "This",
          "That",
          "When",
          "What",
          "Which",
          "Where",
          "How",
          "Why",
          "Will",
          "Can",
          "Has",
          "Had",
          "Did",
          "Was",
          "Were",
        ].includes(word)
      ) {
        tryAdd(word, "concept")
      }
    }

    const funcPattern = /(\w+)\(\)/g
    while ((match = funcPattern.exec(text)) !== null) {
      tryAdd(match[1]!, "function")
    }

    return entities
  }

  extractRelationships(text: string, entities: GraphEntity[]): GraphRelationship[] {
    const rels: GraphRelationship[] = []
    if (entities.length < 2) return rels

    const textLower = text.toLowerCase()

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i]!
        const b = entities[j]!
        const posA = textLower.indexOf(a.name.toLowerCase())
        const posB = textLower.indexOf(b.name.toLowerCase())
        if (posA === -1 || posB === -1) continue

        const distance = Math.abs(posA - posB)
        const weight = Math.max(0.1, 1 - distance / text.length)

        const between = textLower.slice(Math.min(posA, posB), Math.max(posA, posB))
        let relType = "mentions"
        if (/calls|invokes|executes|runs|triggers/.test(between)) relType = "calls"
        else if (/extends|inherits|implements|subclasses/.test(between)) relType = "extends"
        else if (/depends|requires|needs|uses/.test(between)) relType = "depends-on"
        else if (/mentions|refers|references|relates/.test(between)) relType = "mentions"

        const rel = this.addRelationship(a.id, b.id, relType, weight)
        rels.push(rel)
      }
    }

    return rels
  }

  close(): void {
    this.db.close()
    log.info("Knowledge graph closed")
  }

  private rowToEntity(row: Record<string, unknown>): GraphEntity {
    return {
      id: row.id as string,
      name: row.name as string,
      type: row.type as string,
      context: row.context as string,
      source: row.source as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      confidence: row.confidence as number,
    }
  }
}

export const knowledgeGraph = new KnowledgeGraph()
