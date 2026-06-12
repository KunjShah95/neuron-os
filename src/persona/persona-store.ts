import { Database } from "bun:sqlite"
import { join } from "node:path"
import { mkdirSync, existsSync } from "node:fs"
import { createLogger } from "../cli/logger"
import type { PersonaEvent, EvolutionTrigger, EvolutionDirection, PersonaProfile, PersonaStats } from "./types"

const log = createLogger("persona-store")

function generateId(): string {
  return `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`
}

export class PersonaStore {
  private db: Database
  private initialized = false

  constructor(project?: string) {
    const dataDir = project
      ? join(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "projects", project)
      : join(process.cwd(), "data")
    const dir = join(dataDir, "persona")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.db = new Database(join(dir, "persona.db"))
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec("PRAGMA synchronous = NORMAL")
    this.init()
  }

  private init(): void {
    if (this.initialized) return

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS persona_events (
        id TEXT PRIMARY KEY,
        agent_type TEXT NOT NULL,
        agent_id TEXT NOT NULL DEFAULT '',
        trigger TEXT NOT NULL CHECK (trigger IN ('success-streak','failure-streak','pattern-repeated','dream-insight','social-influence','manual','milestone')),
        trait_name TEXT NOT NULL,
        old_value REAL NOT NULL DEFAULT 0,
        new_value REAL NOT NULL DEFAULT 0,
        direction TEXT NOT NULL CHECK (direction IN ('increase','decrease','emerge','fade')),
        reason TEXT NOT NULL DEFAULT '',
        source_experience_id TEXT NOT NULL DEFAULT '',
        source_dream_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS persona_profiles (
        agent_type TEXT NOT NULL,
        agent_id TEXT NOT NULL DEFAULT '',
        archetype TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL DEFAULT '',
        trait_scores TEXT NOT NULL DEFAULT '{}',
        communication_style TEXT NOT NULL DEFAULT '{}',
        dominant_mood TEXT NOT NULL DEFAULT 'content',
        quirk_count INTEGER NOT NULL DEFAULT 0,
        adaptation_count INTEGER NOT NULL DEFAULT 0,
        evolution_count INTEGER NOT NULL DEFAULT 0,
        last_evolved_at TEXT,
        stability_score REAL NOT NULL DEFAULT 1.0,
        PRIMARY KEY (agent_type, agent_id)
      )
    `)

    this.db.exec("CREATE INDEX IF NOT EXISTS idx_persona_events_agent ON persona_events(agent_type, agent_id, created_at DESC)")
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_persona_events_trigger ON persona_events(trigger, created_at DESC)")

    this.initialized = true
    log.debug("Persona store initialized")
  }

  recordEvent(event: Omit<PersonaEvent, "id" | "createdAt">): PersonaEvent {
    const id = generateId()
    const now = new Date().toISOString()
    const evt: PersonaEvent = { id, ...event, createdAt: now }

    this.db
      .prepare(
        `INSERT INTO persona_events (id, agent_type, agent_id, trigger, trait_name, old_value, new_value, direction, reason, source_experience_id, source_dream_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(evt.id, evt.agentType, evt.agentId, evt.trigger, evt.traitName, evt.oldValue, evt.newValue, evt.direction, evt.reason, evt.sourceExperienceId, evt.sourceDreamId, evt.createdAt)

    return evt
  }

  saveProfile(profile: PersonaProfile): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO persona_profiles (agent_type, agent_id, archetype, name, trait_scores, communication_style, dominant_mood, quirk_count, adaptation_count, evolution_count, last_evolved_at, stability_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        profile.agentType, profile.agentId, profile.archetype, profile.name,
        JSON.stringify(profile.traitScores), profile.communicationStyle,
        profile.dominantMood, profile.quirkCount, profile.adaptationCount,
        profile.evolutionCount, profile.lastEvolvedAt, profile.stabilityScore,
      )
  }

  getProfile(agentType: string, agentId: string): PersonaProfile | null {
    const row = this.db
      .prepare("SELECT * FROM persona_profiles WHERE agent_type = ? AND agent_id = ?")
      .get(agentType, agentId) as Record<string, unknown> | null
    return row ? this.rowToProfile(row) : null
  }

  listProfiles(): PersonaProfile[] {
    const rows = this.db.prepare("SELECT * FROM persona_profiles ORDER BY last_evolved_at DESC").all() as Record<string, unknown>[]
    return rows.map((r) => this.rowToProfile(r))
  }

  getEvents(agentType?: string, agentId?: string, limit = 50): PersonaEvent[] {
    let sql = "SELECT * FROM persona_events"
    const params: (string | number | null)[] = []
    const conditions: string[] = []
    if (agentType) { conditions.push("agent_type = ?"); params.push(agentType) }
    if (agentId) { conditions.push("agent_id = ?"); params.push(agentId) }
    if (conditions.length > 0) sql += " WHERE " + conditions.join(" AND ")
    sql += " ORDER BY created_at DESC LIMIT ?"
    params.push(limit)
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[]
    return rows.map((r) => this.rowToEvent(r))
  }

  getStats(): PersonaStats {
    const totalEvents = (this.db.prepare("SELECT COUNT(*) as c FROM persona_events").get() as { c: number }).c
    const totalEvolutions = (this.db.prepare("SELECT COUNT(*) as c FROM persona_events WHERE trigger != 'manual'").get() as { c: number }).c
    const activeProfiles = (this.db.prepare("SELECT COUNT(*) as c FROM persona_profiles").get() as { c: number }).c
    const avgStability = (this.db.prepare("SELECT AVG(stability_score) as avg FROM persona_profiles").get() as { avg: number | null }).avg || 0

    const traitRows = this.db.prepare(`
      SELECT trait_name, SUM(ABS(new_value - old_value)) as total
      FROM persona_events GROUP BY trait_name ORDER BY total DESC LIMIT 5
    `).all() as { trait_name: string; total: number }[]
    const topTraits = traitRows.map((r) => ({ name: r.trait_name, totalDelta: r.total }))

    const triggerRows = this.db.prepare(`
      SELECT trigger, COUNT(*) as c FROM persona_events
      GROUP BY trigger ORDER BY c DESC LIMIT 5
    `).all() as { trigger: string; c: number }[]
    const topTriggers = triggerRows.map((r) => ({ trigger: r.trigger, count: r.c }))

    const lastEvt = this.db.prepare("SELECT created_at FROM persona_events ORDER BY created_at DESC LIMIT 1").get() as { created_at: string } | null

    return {
      totalEvents, totalEvolutions, activeProfiles,
      topTraits, topTriggers, averageStability: avgStability,
      lastCycleAt: lastEvt?.created_at || "",
    }
  }

  private rowToEvent(row: Record<string, unknown>): PersonaEvent {
    return {
      id: row.id as string,
      agentType: row.agent_type as string,
      agentId: row.agent_id as string,
      trigger: row.trigger as EvolutionTrigger,
      traitName: row.trait_name as string,
      oldValue: row.old_value as number,
      newValue: row.new_value as number,
      direction: row.direction as EvolutionDirection,
      reason: row.reason as string,
      sourceExperienceId: row.source_experience_id as string,
      sourceDreamId: row.source_dream_id as string,
      createdAt: row.created_at as string,
    }
  }

  private rowToProfile(row: Record<string, unknown>): PersonaProfile {
    return {
      agentType: row.agent_type as string,
      agentId: row.agent_id as string,
      archetype: row.archetype as string,
      name: row.name as string,
      traitScores: JSON.parse(row.trait_scores as string),
      communicationStyle: row.communication_style as string,
      dominantMood: row.dominant_mood as string,
      quirkCount: row.quirk_count as number,
      adaptationCount: row.adaptation_count as number,
      evolutionCount: row.evolution_count as number,
      lastEvolvedAt: (row.last_evolved_at as string) || "",
      stabilityScore: row.stability_score as number,
    }
  }
}

export const personaStore = new PersonaStore()
