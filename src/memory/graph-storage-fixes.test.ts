/**
 * Regression tests for the knowledge-graph storage fixes:
 * - FTS index stays in sync on rename and delete
 * - queryEntities emits valid LIMIT/OFFSET SQL
 * - mentionEntity keeps the cache in agreement with the database
 * - searchEntities never throws on malformed FTS5 input
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { GraphStorage } from "./graph/storage"
import { DEFAULT_TEMPORAL_CONFIG } from "./graph/types"

describe("GraphStorage fixes", () => {
  let dir: string
  let storage: GraphStorage

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "graph-storage-fixes-"))
    storage = new GraphStorage(DEFAULT_TEMPORAL_CONFIG, { dbPath: dir })
    await storage.initialize()
  })

  afterEach(async () => {
    await storage.close()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  })

  // ── BUG 1: FTS index sync ──────────────────────────────────────────

  it("indexes a newly created entity", async () => {
    await storage.createEntity({ type: "person", name: "Alice", aliases: ["Al"], properties: {} })

    const results = await storage.searchEntities("Alice")
    expect(results.length).toBe(1)
    expect(results[0]!.name).toBe("Alice")
  })

  it("reindexes an entity after a rename", async () => {
    const entity = await storage.createEntity({ type: "person", name: "Alice", aliases: [], properties: {} })

    const updated = await storage.updateEntity(entity.id, { name: "Alicia" })
    expect(updated!.name).toBe("Alicia")

    expect(await storage.searchEntities("Alicia")).toHaveLength(1)
    expect(await storage.searchEntities("Alice")).toHaveLength(0)
  })

  it("reindexes an entity when its aliases change", async () => {
    const entity = await storage.createEntity({ type: "person", name: "Alice", aliases: ["Al"], properties: {} })

    expect(await storage.searchEntities("Al")).toHaveLength(1)

    await storage.updateEntity(entity.id, { aliases: ["Ali"] })

    expect(await storage.searchEntities("Ali")).toHaveLength(1)
    expect(await storage.searchEntities("Al")).toHaveLength(0)
  })

  it("removes a deleted entity from the FTS index", async () => {
    const entity = await storage.createEntity({ type: "person", name: "Alice", aliases: [], properties: {} })

    expect(await storage.searchEntities("Alice")).toHaveLength(1)

    const deleted = await storage.deleteEntity(entity.id)
    expect(deleted).toBe(true)

    expect(await storage.searchEntities("Alice")).toHaveLength(0)
    expect(await storage.getEntity(entity.id)).toBeNull()
  })

  it("does not resurrect a deleted entity when a new one reuses the rowid", async () => {
    const entity = await storage.createEntity({ type: "person", name: "Alice", aliases: [], properties: {} })
    await storage.deleteEntity(entity.id)

    await storage.createEntity({ type: "person", name: "Bob", aliases: [], properties: {} })

    expect(await storage.searchEntities("Alice")).toHaveLength(0)
    expect(await storage.searchEntities("Bob")).toHaveLength(1)
  })

  it("deletes relationships attached to a deleted entity", async () => {
    const a = await storage.createEntity({ type: "person", name: "Alice", aliases: [], properties: {} })
    const b = await storage.createEntity({ type: "project", name: "ProjectX", aliases: [], properties: {} })

    await storage.createRelationship({
      sourceId: a.id,
      targetId: b.id,
      type: "works_on",
      properties: {},
      strength: 0.9,
    })

    await storage.deleteEntity(a.id)

    const stats = await storage.getStats()
    expect(stats.relationshipCount).toBe(0)
  })

  // ── BUG 2 + BUG 3: LIMIT / OFFSET SQL ───────────────────────────────

  it("does not throw when only an offset is supplied", async () => {
    for (let i = 0; i < 5; i++) {
      await storage.createEntity({ type: "person", name: `Person ${i}`, aliases: [], properties: {} })
    }

    const result = await storage.query({ offset: 2 })
    expect(Array.isArray(result.entities)).toBe(true)
    expect(result.entities.length).toBe(3)
  })

  it("returns no entities for limit 0", async () => {
    for (let i = 0; i < 5; i++) {
      await storage.createEntity({ type: "person", name: `Person ${i}`, aliases: [], properties: {} })
    }

    const result = await storage.query({ limit: 0 })
    expect(result.entities).toHaveLength(0)
  })

  it("honours an explicit limit", async () => {
    for (let i = 0; i < 5; i++) {
      await storage.createEntity({ type: "person", name: `Person ${i}`, aliases: [], properties: {} })
    }

    const result = await storage.query({ limit: 2 })
    expect(result.entities).toHaveLength(2)
  })

  it("applies a default limit so the whole graph is never loaded", async () => {
    for (let i = 0; i < 130; i++) {
      await storage.createEntity({ type: "person", name: `Person ${i}`, aliases: [], properties: {} })
    }

    const result = await storage.query({})
    expect(result.entities.length).toBeLessThanOrEqual(100)
    expect(result.entities.length).toBeGreaterThan(0)
  })

  // ── BUG 4: mentionEntity cache/DB agreement ────────────────────────

  it("keeps the cached mention count equal to the stored count", async () => {
    const entity = await storage.createEntity({ type: "person", name: "Alice", aliases: [], properties: {} })

    await storage.mentionEntity(entity.id)
    await storage.mentionEntity(entity.id)

    const cached = await storage.getEntity(entity.id)
    expect(cached!.mentionCount).toBe(3)

    const fresh = await storage.query({ entityTypes: ["person"] })
    const fromDb = fresh.entities.find((e) => e.id === entity.id)
    expect(fromDb!.mentionCount).toBe(3)
  })

  it("does not double count a mention on a cache-cold entity", async () => {
    const entity = await storage.createEntity({ type: "person", name: "Alice", aliases: [], properties: {} })

    await storage.mentionEntity(entity.id)

    const fresh = await storage.query({ entityTypes: ["person"] })
    const fromDb = fresh.entities.find((e) => e.id === entity.id)
    expect(fromDb!.mentionCount).toBe(2)
  })

  // ── BUG 5: malformed FTS5 input ────────────────────────────────────

  it("does not throw on malformed FTS5 queries", async () => {
    await storage.createEntity({ type: "person", name: "Alice", aliases: ["Al"], properties: {} })

    const malformed = ['"', "Alice AND", "*", "", "((", "NEAR(", 'x"y', "a OR", "-", "--", "AND", "OR", "NOT"]
    for (const query of malformed) {
      await expect(storage.searchEntities(query)).resolves.toBeDefined()
    }
  })

  it("still finds entities after a malformed query", async () => {
    await storage.createEntity({ type: "person", name: "Alice", aliases: [], properties: {} })

    await storage.searchEntities('"')
    const results = await storage.searchEntities("Alice")
    expect(results).toHaveLength(1)
  })

  it("falls back to a LIKE scan when the FTS query cannot be built", async () => {
    await storage.createEntity({ type: "person", name: "Alice Smith", aliases: [], properties: {} })

    const results = await storage.searchEntities("Alice Smith")
    expect(results).toHaveLength(1)
  })
})
