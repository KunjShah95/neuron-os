import { describe, it, expect, beforeEach } from "bun:test"
import { Database } from "bun:sqlite"
import { FTS5Indexer, ensureFTS5Schema } from "./"
import type { IndexTurn } from "./indexer"

function makeDb(): Database {
  const db = new Database(":memory:")
  ensureFTS5Schema(db)
  return db
}

describe("ensureFTS5Schema", () => {
  it("creates recall_index virtual table", () => {
    const db = makeDb()
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='recall_index'")
      .get() as { name: string } | null
    expect(row).not.toBeNull()
    db.close()
  })

  it("creates recall_meta table", () => {
    const db = makeDb()
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='recall_meta'")
      .get() as { name: string } | null
    expect(row).not.toBeNull()
    db.close()
  })

  it("is idempotent — calling twice does not throw", () => {
    const db = new Database(":memory:")
    expect(() => {
      ensureFTS5Schema(db)
      ensureFTS5Schema(db)
    }).not.toThrow()
    db.close()
  })
})

describe("FTS5Indexer", () => {
  let db: Database
  let indexer: FTS5Indexer

  beforeEach(() => {
    db = makeDb()
    indexer = new FTS5Indexer()
    indexer.setDb(db)
  })

  const baseTurn: IndexTurn = {
    sessionId: "sess-1",
    turnId: "turn-1",
    ts: Date.now(),
    role: "user",
    content: "How does authentication work in this project?",
  }

  it("indexes a single turn without throwing", () => {
    expect(() => indexer.indexTurn(baseTurn)).not.toThrow()
  })

  it("inserts the turn into recall_index", () => {
    indexer.indexTurn(baseTurn)
    const row = db.prepare("SELECT * FROM recall_index WHERE turn_id = ?").get("turn-1") as Record<string, unknown> | null
    expect(row).not.toBeNull()
    expect(row!.session_id).toBe("sess-1")
  })

  it("upserts recall_meta with session info", () => {
    indexer.indexTurn(baseTurn)
    const meta = db.prepare("SELECT * FROM recall_meta WHERE session_id = ?").get("sess-1") as Record<string, unknown> | null
    expect(meta).not.toBeNull()
    expect(meta!.turn_count).toBe(1)
  })

  it("increments turn_count on subsequent turns", () => {
    indexer.indexTurn(baseTurn)
    indexer.indexTurn({ ...baseTurn, turnId: "turn-2", content: "Next question" })
    const meta = db.prepare("SELECT * FROM recall_meta WHERE session_id = ?").get("sess-1") as Record<string, unknown> | null
    expect(meta!.turn_count).toBe(2)
  })

  it("indexes entities as space-joined string", () => {
    indexer.indexTurn({ ...baseTurn, entities: ["auth", "JWT", "OAuth"] })
    const row = db.prepare("SELECT entities FROM recall_index WHERE turn_id = ?").get("turn-1") as { entities: string } | null
    expect(row!.entities).toBe("auth JWT OAuth")
  })

  it("handles empty entities gracefully", () => {
    expect(() => indexer.indexTurn({ ...baseTurn, entities: [] })).not.toThrow()
  })

  it("indexes a batch of turns", () => {
    const turns: IndexTurn[] = [
      { sessionId: "sess-2", turnId: "t1", ts: Date.now(), role: "user", content: "Hello" },
      { sessionId: "sess-2", turnId: "t2", ts: Date.now(), role: "assistant", content: "Hi there" },
      { sessionId: "sess-2", turnId: "t3", ts: Date.now(), role: "tool", content: "Tool result" },
    ]
    expect(() => indexer.indexBatch(turns)).not.toThrow()
    const count = db.prepare("SELECT COUNT(*) as c FROM recall_index WHERE session_id = 'sess-2'").get() as { c: number }
    expect(count.c).toBe(3)
  })

  it("does not throw when db is not set", () => {
    const orphan = new FTS5Indexer()
    expect(() => orphan.indexTurn(baseTurn)).not.toThrow()
  })
})
