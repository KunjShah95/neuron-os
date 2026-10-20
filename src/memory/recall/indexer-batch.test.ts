/**
 * The recall indexer must not report success when it has no database.
 * Previously the missing-db case silently skipped the batch while still
 * logging "Indexed N turns in batch".
 */

import { describe, it, expect } from "bun:test"
import { Database } from "bun:sqlite"
import { FTS5Indexer, ensureFTS5Schema } from "./"
import type { IndexTurn } from "./indexer"

const turns: IndexTurn[] = [
  { sessionId: "sess-batch", turnId: "t1", ts: 1, role: "user", content: "Hello" },
  { sessionId: "sess-batch", turnId: "t2", ts: 2, role: "assistant", content: "Hi there" },
]

describe("FTS5Indexer.indexBatch", () => {
  it("reports zero indexed turns when no database is set", () => {
    const orphan = new FTS5Indexer()
    let indexed = -1
    expect(() => {
      indexed = orphan.indexBatch(turns)
    }).not.toThrow()
    expect(indexed).toBe(0)
    expect(orphan.getStats().totalTurns).toBe(0)
  })

  it("indexes the whole batch when a database is set", () => {
    const db = new Database(":memory:")
    ensureFTS5Schema(db)
    const indexer = new FTS5Indexer()
    indexer.setDb(db)

    const indexed = indexer.indexBatch(turns)
    expect(indexed).toBe(2)

    const count = db.prepare("SELECT COUNT(*) as c FROM recall_index").get() as { c: number }
    expect(count.c).toBe(2)
    db.close()
  })

  it("returns zero for an empty batch", () => {
    const db = new Database(":memory:")
    ensureFTS5Schema(db)
    const indexer = new FTS5Indexer()
    indexer.setDb(db)

    expect(indexer.indexBatch([])).toBe(0)
    db.close()
  })
})
