import { describe, it, expect, afterAll } from "bun:test"
/**
 * Regression tests for the knowledge graph and memory namespace fixes:
 * - getRelated() must honour the requested hop count (depth 1 = direct neighbours)
 * - expired namespace entries must be filtered out of query() results
 * - purgeExpired() must hard-delete expired rows
 * - close() must be safe to call twice
 */

import { mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { KnowledgeGraph } from "./graph"
import { MemoryNamespaceManager } from "./namespace"

const TMP_ROOT = resolve(tmpdir(), "aegis-test-graph-ns-fixes-" + Date.now())

function graphPath(subdir: string): string {
  const dir = resolve(TMP_ROOT, subdir)
  mkdirSync(dir, { recursive: true })
  return resolve(dir, "knowledge-graph.db")
}

function nsPath(subdir: string): string {
  const dir = resolve(TMP_ROOT, subdir)
  mkdirSync(dir, { recursive: true })
  return resolve(dir, "namespaces.db")
}

describe("Knowledge graph fixes", () => {
  afterAll(() => {
    try {
      rmSync(TMP_ROOT, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    } catch {
      // best-effort cleanup
    }
  })

  it("getRelated returns only direct neighbours at depth 1", () => {
    const graph = new KnowledgeGraph(graphPath("depth"))
    const a = graph.addEntity("alpha", "concept", "a", "test")
    const b = graph.addEntity("beta", "concept", "b", "test")
    const c = graph.addEntity("gamma", "concept", "c", "test")
    const d = graph.addEntity("delta", "concept", "d", "test")

    graph.addRelationship(a.id, b.id, "knows", 0.8)
    graph.addRelationship(b.id, c.id, "knows", 0.8)
    graph.addRelationship(c.id, d.id, "knows", 0.8)

    const hop1 = graph.getRelated(a.id, undefined, 1)
    expect(hop1.length).toBe(1)
    expect(hop1[0]!.entity.id).toBe(b.id)

    const hop2 = graph.getRelated(a.id, undefined, 2)
    expect(hop2.length).toBe(2)
    expect(hop2.map((r) => r.entity.id)).toEqual([b.id, c.id])

    const hop3 = graph.getRelated(a.id, undefined, 3)
    expect(hop3.map((r) => r.entity.id)).toEqual([b.id, c.id, d.id])

    // The root is never part of its own related set
    expect(hop3.some((r) => r.entity.id === a.id)).toBe(false)

    graph.close()
    // close() is idempotent
    graph.close()
  })

  it("enforces foreign keys on relationships", () => {
    const graph = new KnowledgeGraph(graphPath("cascade"))
    const a = graph.addEntity("src", "concept", "a", "test")
    const b = graph.addEntity("dst", "concept", "b", "test")
    graph.addRelationship(a.id, b.id, "knows", 0.8)

    expect(graph.getStats().relationshipCount).toBe(1)

    // Referencing an unknown entity violates the foreign key
    expect(() => graph.addRelationship(a.id, "no-such-entity", "knows", 0.8)).toThrow()

    graph.close()
  })
})

describe("Memory namespace fixes", () => {
  afterAll(() => {
    try {
      rmSync(TMP_ROOT, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    } catch {
      // best-effort cleanup
    }
  })

  it("query() excludes expired entries", () => {
    const ns = new MemoryNamespaceManager(nsPath("expiry"))
    const space = ns.createNamespace("test", 30)
    const live = ns.addEntry(space.id, "still relevant fact", "fact", "test")

    // Insert an already-expired entry directly
    const expired = ns.addEntry(space.id, "stale expired fact", "fact", "test")
    const db = (ns as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } } }).db
    db.prepare("UPDATE namespace_entries SET expires_at = ? WHERE id = ?").run(
      new Date(Date.now() - 60_000).toISOString(),
      expired.id,
    )

    const results = ns.query([space.id], "fact")
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe(live.id)

    ns.close()
    ns.close()
  })

  it("purgeExpired() hard-deletes expired rows", () => {
    const ns = new MemoryNamespaceManager(nsPath("purge"))
    const space = ns.createNamespace("test", 30)
    const live = ns.addEntry(space.id, "keep this one", "fact", "test")
    const expired = ns.addEntry(space.id, "delete this one", "fact", "test")

    const db = (ns as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } } }).db
    db.prepare("UPDATE namespace_entries SET expires_at = ? WHERE id = ?").run(
      new Date(Date.now() - 60_000).toISOString(),
      expired.id,
    )

    const purged = ns.purgeExpired()
    expect(purged).toBe(1)
    expect(ns.listEntries(space.id).map((e) => e.id)).toEqual([live.id])
    expect(ns.getStats().totalEntries).toBe(1)

    ns.close()
  })
})
