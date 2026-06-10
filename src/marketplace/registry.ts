import { Database } from "bun:sqlite"
import { resolve, dirname } from "node:path"
import { mkdirSync, existsSync } from "node:fs"
import type {
  AgentConfig,
  AgentRow,
  MarketplaceEntry,
  SearchFilters,
  SearchResult,
  AgentSignature,
} from "./types"

function rowToEntry(row: AgentRow): MarketplaceEntry {
  const ratingDist = JSON.parse(row.rating_dist || "{}") as Record<number, number>
  return {
    config: {
      name: row.name,
      type: row.type as AgentConfig["type"],
      description: row.description,
      tools: JSON.parse(row.tools || "[]"),
      prompt_template: row.prompt_template,
      budget_usd: row.budget_usd,
      sandbox: row.sandbox as AgentConfig["sandbox"],
      provider: row.provider,
      tags: JSON.parse(row.tags || "[]"),
    },
    author: row.author,
    version: row.version,
    publishedAt: new Date(row.published_at * 1000).toISOString(),
    rating: {
      average: row.rating_avg,
      count: row.rating_count,
      distribution: ratingDist,
    },
    installCount: row.install_count,
    signature: row.signature ? JSON.parse(row.signature) : undefined,
  }
}

export class MarketplaceRegistry {
  private db: Database

  constructor(dbPath?: string) {
    const path =
      dbPath ??
      resolve(
        process.env.HOME || process.env.USERPROFILE || "~",
        ".aegis",
        "marketplace",
        "registry.db",
      )
    const dir = dirname(path)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    this.db = new Database(path, { create: true })
    this.db.exec("PRAGMA journal_mode=WAL")
    this.db.exec("PRAGMA synchronous=NORMAL")
    this.migrate()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'custom',
        description TEXT NOT NULL DEFAULT '',
        author TEXT NOT NULL DEFAULT '',
        provider TEXT NOT NULL DEFAULT 'local',
        tags TEXT NOT NULL DEFAULT '[]',
        config TEXT NOT NULL DEFAULT '{}',
        prompt_template TEXT NOT NULL DEFAULT '',
        budget_usd REAL NOT NULL DEFAULT 0.1,
        sandbox TEXT NOT NULL DEFAULT 'none',
        tools TEXT NOT NULL DEFAULT '[]',
        signature TEXT,
        published_at INTEGER NOT NULL DEFAULT (unixepoch()),
        install_count INTEGER NOT NULL DEFAULT 0,
        rating_avg REAL NOT NULL DEFAULT 0.0,
        rating_count INTEGER NOT NULL DEFAULT 0,
        rating_dist TEXT NOT NULL DEFAULT '{}',
        installed INTEGER NOT NULL DEFAULT 0,
        installed_at INTEGER,
        PRIMARY KEY (name, version)
      );

      CREATE TABLE IF NOT EXISTS agent_ratings (
        agent_name TEXT NOT NULL,
        agent_version TEXT NOT NULL,
        stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
        rated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (agent_name, agent_version) REFERENCES agents(name, version)
      );

      CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
      CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type);
      CREATE INDEX IF NOT EXISTS idx_agents_provider ON agents(provider);
      CREATE INDEX IF NOT EXISTS idx_agents_rating ON agents(rating_avg DESC);
      CREATE INDEX IF NOT EXISTS idx_agents_installs ON agents(install_count DESC);
      CREATE INDEX IF NOT EXISTS idx_ratings_agent ON agent_ratings(agent_name, agent_version);
    `)
  }

  publish(config: AgentConfig, version: string, author: string, signature?: AgentSignature): MarketplaceEntry {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO agents
        (name, version, type, description, author, provider, tags, config,
         prompt_template, budget_usd, sandbox, tools, signature, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
    `)

    insert.run(
      config.name,
      version,
      config.type,
      config.description,
      author,
      config.provider,
      JSON.stringify(config.tags),
      JSON.stringify(config),
      config.prompt_template,
      config.budget_usd,
      config.sandbox,
      JSON.stringify(config.tools),
      signature ? JSON.stringify(signature) : null,
    )

    const row = this.db
      .prepare("SELECT * FROM agents WHERE name = ? AND version = ?")
      .get(config.name, version) as AgentRow

    return rowToEntry(row)
  }

  get(name: string, version?: string): MarketplaceEntry | undefined {
    let row: AgentRow | null
    if (version) {
      row = this.db
        .prepare("SELECT * FROM agents WHERE name = ? AND version = ?")
        .get(name, version) as AgentRow | null
    } else {
      row = this.db
        .prepare("SELECT * FROM agents WHERE name = ? ORDER BY published_at DESC LIMIT 1")
        .get(name) as AgentRow | null
    }
    return row ? rowToEntry(row) : undefined
  }

  list(filters?: SearchFilters): SearchResult {
    const conditions: string[] = []
    const params: (string | number)[] = []

    if (filters?.type) {
      conditions.push("type = ?")
      params.push(filters.type)
    }
    if (filters?.provider) {
      conditions.push("provider = ?")
      params.push(filters.provider)
    }
    if (filters?.minRating) {
      conditions.push("rating_avg >= ?")
      params.push(filters.minRating)
    }
    if (filters?.tag) {
      conditions.push("tags LIKE ?")
      params.push(`%"${filters.tag}"%`)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

    const sortField = filters?.sort === "installs"
      ? "install_count"
      : filters?.sort === "recent"
        ? "published_at"
        : filters?.sort === "name"
          ? "name"
          : "rating_avg"
    const sortOrder = filters?.order === "asc" ? "ASC" : "DESC"

    const pageSize = filters?.pageSize ?? 20
    const page = filters?.page ?? 0
    const offset = page * pageSize

    const countRow = this.db
      .prepare(`SELECT COUNT(*) as total FROM agents ${where}`)
      .get(...params) as { total: number }

    const rows = this.db
      .prepare(`SELECT * FROM agents ${where} ORDER BY ${sortField} ${sortOrder} LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset) as AgentRow[]

    return {
      entries: rows.map(rowToEntry),
      total: countRow.total,
      page,
      pageSize,
      totalPages: Math.ceil(countRow.total / pageSize),
    }
  }

  search(query: string, filters?: SearchFilters): SearchResult {
    const like = `%${query}%`
    const conditions = [
      "(name LIKE ? OR description LIKE ? OR author LIKE ? OR tags LIKE ?)",
    ]
    const params: (string | number)[] = [like, like, like, like]

    if (filters?.type) {
      conditions.push("type = ?")
      params.push(filters.type)
    }
    if (filters?.provider) {
      conditions.push("provider = ?")
      params.push(filters.provider)
    }
    if (filters?.minRating) {
      conditions.push("rating_avg >= ?")
      params.push(filters.minRating)
    }
    if (filters?.tag) {
      conditions.push("tags LIKE ?")
      params.push(`%"${filters.tag}"%`)
    }

    const where = conditions.join(" AND ")
    const sortField = filters?.sort === "installs"
      ? "install_count"
      : filters?.sort === "recent"
        ? "published_at"
        : filters?.sort === "name"
          ? "name"
          : "rating_avg"
    const sortOrder = filters?.order === "asc" ? "ASC" : "DESC"

    const pageSize = filters?.pageSize ?? 20
    const page = filters?.page ?? 0
    const offset = page * pageSize

    const countRow = this.db
      .prepare(`SELECT COUNT(*) as total FROM agents WHERE ${where}`)
      .get(...params) as { total: number }

    const rows = this.db
      .prepare(`SELECT * FROM agents WHERE ${where} ORDER BY ${sortField} ${sortOrder} LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset) as AgentRow[]

    return {
      entries: rows.map(rowToEntry),
      total: countRow.total,
      page,
      pageSize,
      totalPages: Math.ceil(countRow.total / pageSize),
    }
  }

  rate(name: string, version: string, stars: number): void {
    if (stars < 1 || stars > 5) {
      throw new Error("Stars must be between 1 and 5")
    }

    const txn = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO agent_ratings (agent_name, agent_version, stars) VALUES (?, ?, ?)`,
        )
        .run(name, version, stars)

      const stats = this.db
        .prepare(
          `SELECT COUNT(*) as count, AVG(stars) as avg FROM agent_ratings WHERE agent_name = ? AND agent_version = ?`,
        )
        .get(name, version) as { count: number; avg: number }

      const dist = this.db
        .prepare(
          `SELECT stars, COUNT(*) as c FROM agent_ratings WHERE agent_name = ? AND agent_version = ? GROUP BY stars`,
        )
        .all(name, version) as { stars: number; c: number }[]

      const ratingDist: Record<number, number> = {}
      for (const d of dist) ratingDist[d.stars] = d.c

      this.db
        .prepare(
          `UPDATE agents SET rating_avg = ?, rating_count = ?, rating_dist = ? WHERE name = ? AND version = ?`,
        )
        .run(stats.avg, stats.count, JSON.stringify(ratingDist), name, version)
    })

    txn()
  }

  incrementInstalls(name: string, version: string): void {
    this.db
      .prepare(
        `UPDATE agents SET install_count = install_count + 1 WHERE name = ? AND version = ?`,
      )
      .run(name, version)
  }

  markInstalled(name: string, version: string): void {
    this.db
      .prepare(
        `UPDATE agents SET installed = 1, installed_at = unixepoch() WHERE name = ? AND version = ?`,
      )
      .run(name, version)
  }

  markUninstalled(name: string): void {
    this.db
      .prepare(`UPDATE agents SET installed = 0, installed_at = NULL WHERE name = ?`)
      .run(name)
  }

  getInstalled(): MarketplaceEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM agents WHERE installed = 1 ORDER BY name")
      .all() as AgentRow[]
    return rows.map(rowToEntry)
  }

  remove(name: string): void {
    const txn = this.db.transaction(() => {
      this.db.prepare("DELETE FROM agent_ratings WHERE agent_name = ?").run(name)
      this.db.prepare("DELETE FROM agents WHERE name = ?").run(name)
    })
    txn()
  }

  getVersions(name: string): MarketplaceEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM agents WHERE name = ? ORDER BY published_at DESC")
      .all(name) as AgentRow[]
    return rows.map(rowToEntry)
  }

  close(): void {
    this.db.close()
  }
}
