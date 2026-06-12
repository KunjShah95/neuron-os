import { Database } from "bun:sqlite"
import { resolve, dirname } from "node:path"
import { mkdirSync, existsSync } from "node:fs"

export interface SharedSession {
  id: string
  name: string
  agents: string
  users: string
  created_at: number
  updated_at: number
  status: "active" | "closed"
}

export class SessionStore {
  private db: Database
  private prepared: {
    insert: ReturnType<Database["prepare"]>
    get: ReturnType<Database["prepare"]>
    list: ReturnType<Database["prepare"]>
    update: ReturnType<Database["prepare"]>
    remove: ReturnType<Database["prepare"]>
    close_: ReturnType<Database["prepare"]>
  }

  constructor(dbPath?: string) {
    const path = dbPath ?? resolve(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "sessions.db")
    const dir = dirname(path)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    this.db = new Database(path)
    this.db.exec("PRAGMA journal_mode=WAL")
    this.migrate()
    this.prepared = this.prepare()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shared_sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        agents TEXT NOT NULL DEFAULT '[]',
        users TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'closed'))
      );
      CREATE INDEX IF NOT EXISTS idx_shared_sessions_status ON shared_sessions(status);
    `)
  }

  private prepare() {
    return {
      insert: this.db.prepare(
        "INSERT INTO shared_sessions (id, name, agents, users, created_at, updated_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ),
      get: this.db.prepare("SELECT * FROM shared_sessions WHERE id = ?"),
      list: this.db.prepare("SELECT * FROM shared_sessions WHERE status = 'active' ORDER BY updated_at DESC"),
      update: this.db.prepare(
        "UPDATE shared_sessions SET name = ?, agents = ?, users = ?, updated_at = ?, status = ? WHERE id = ?"
      ),
      remove: this.db.prepare("DELETE FROM shared_sessions WHERE id = ?"),
      close_: this.db.prepare("UPDATE shared_sessions SET status = 'closed', updated_at = ? WHERE id = ?"),
    }
  }

  create(name: string): SharedSession {
    const id = `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const now = Math.floor(Date.now() / 1000)
    this.prepared.insert.run(id, name, "[]", "[]", now, now, "active")
    return this.get(id) as SharedSession
  }

  get(id: string): SharedSession | undefined {
    const row = this.prepared.get.get(id) as SharedSession | null
    return row ?? undefined
  }

  list(): SharedSession[] {
    return this.prepared.list.all() as SharedSession[]
  }

  update(session: Partial<SharedSession> & { id: string }): void {
    const existing = this.get(session.id)
    if (!existing) throw new Error(`Session ${session.id} not found`)
    const now = Math.floor(Date.now() / 1000)
    this.prepared.update.run(
      session.name ?? existing.name,
      session.agents ?? existing.agents,
      session.users ?? existing.users,
      now,
      session.status ?? existing.status,
      session.id,
    )
  }

  remove(id: string): void {
    this.prepared.remove.run(id)
  }

  close(id: string): void {
    const now = Math.floor(Date.now() / 1000)
    this.prepared.close_.run(now, id)
  }

  closeDb(): void {
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
    this.db.close()
  }
}
