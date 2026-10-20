/**
 * The dream store declares `dream_insights.dream_id REFERENCES dreams(id)
 * ON DELETE CASCADE`, which only works when foreign key enforcement is
 * enabled on the connection.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { Database } from "bun:sqlite"
import { DreamStore } from "./dream-store"

describe("DreamStore foreign keys", () => {
  let dir: string
  let store: DreamStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "dream-fk-"))
    store = new DreamStore(undefined, { dbPath: dir })
  })

  afterEach(() => {
    store.close()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best-effort cleanup */
    }
  })

  it("enforces the insight -> dream foreign key", () => {
    expect(() =>
      store.addInsight({
        dreamId: "does-not-exist",
        type: "pattern",
        title: "orphan insight",
        description: "no parent dream",
        confidence: 0.5,
        sourceCount: 1,
        actionable: false,
      }),
    ).toThrow()
  })

  it("cascades insight deletion when the parent dream is removed", () => {
    const dream = store.createDream({ agentType: "builder", type: "memory-replay" })
    store.addInsight({
      dreamId: dream.id,
      type: "pattern",
      title: "linked insight",
      description: "linked to the dream",
      confidence: 0.9,
      sourceCount: 2,
      actionable: true,
    })

    expect(store.getInsightsForDream(dream.id).length).toBe(1)

    const raw = new Database(join(dir, "dream.db"))
    raw.exec("PRAGMA foreign_keys = ON")
    raw.prepare("DELETE FROM dreams WHERE id = ?").run(dream.id)
    raw.close()

    expect(store.getInsightsForDream(dream.id).length).toBe(0)
  })
})
