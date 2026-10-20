/**
 * Knowledge graph hardening:
 *  - getRelated(depth) must return exactly `depth` hops
 *  - relationships are unique per (source, target, type)
 *  - repeated mentions must not inflate entity confidence
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { KnowledgeGraph } from "./graph"

describe("KnowledgeGraph", () => {
  let dir: string
  let graph: KnowledgeGraph

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "graph-hardening-"))
    graph = new KnowledgeGraph(join(dir, "knowledge-graph.db"))
  })

  afterEach(() => {
    graph.close()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best-effort cleanup */
    }
  })

  it("returns exactly one hop for depth 1", () => {
    const a = graph.addEntity("Alpha", "concept", "alpha context", "source-1")
    const b = graph.addEntity("Beta", "concept", "beta context", "source-1")
    const c = graph.addEntity("Gamma", "concept", "gamma context", "source-1")

    graph.addRelationship(a.id, b.id, "mentions")
    graph.addRelationship(b.id, c.id, "mentions")

    const oneHop = graph.getRelated(a.id, undefined, 1)
    expect(oneHop.length).toBe(1)
    expect(oneHop[0]?.entity.id).toBe(b.id)

    const twoHops = graph.getRelated(a.id, undefined, 2)
    expect(twoHops.length).toBe(2)
    expect(twoHops.map((r) => r.entity.id)).toContain(c.id)
  })

  it("does not accumulate duplicate relationships", () => {
    const a = graph.addEntity("Alpha", "concept", "alpha context", "source-1")
    const b = graph.addEntity("Beta", "concept", "beta context", "source-1")

    for (let i = 0; i < 5; i++) {
      graph.addRelationship(a.id, b.id, "mentions", 0.5)
    }

    expect(graph.getStats().relationshipCount).toBe(1)
  })

  it("keeps relationships with a different type apart", () => {
    const a = graph.addEntity("Alpha", "concept", "alpha context", "source-1")
    const b = graph.addEntity("Beta", "concept", "beta context", "source-1")

    graph.addRelationship(a.id, b.id, "mentions")
    graph.addRelationship(a.id, b.id, "calls")

    expect(graph.getStats().relationshipCount).toBe(2)
  })

  it("does not inflate confidence for repeated mentions from the same source", () => {
    const first = graph.addEntity("Alpha", "concept", "alpha context", "source-1")
    expect(first.confidence).toBe(0.5)

    const repeat = graph.addEntity("Alpha", "concept", "alpha context", "source-1")
    expect(repeat.confidence).toBe(first.confidence)

    const again = graph.addEntity("Alpha", "concept", "alpha context", "source-1")
    expect(again.confidence).toBe(first.confidence)
  })

  it("grows confidence only for new independent evidence and never saturates", () => {
    const first = graph.addEntity("Alpha", "concept", "alpha context", "source-1")

    const corroborated = graph.addEntity("Alpha", "concept", "different context", "source-2")
    expect(corroborated.confidence).toBeGreaterThan(first.confidence)
    expect(corroborated.confidence).toBeLessThan(1)

    let current = corroborated.confidence
    for (let i = 3; i < 60; i++) {
      current = graph.addEntity("Alpha", "concept", `context ${i}`, `source-${i}`).confidence
    }
    expect(current).toBeLessThan(1)
  })

  it("does not create duplicate rows when relationships are extracted repeatedly", () => {
    const text = "Alpha calls Beta and Beta uses Gamma"
    const entities = graph.extractEntities(text, "session:1")

    expect(entities.length).toBeGreaterThanOrEqual(2)
    graph.extractRelationships(text, entities)
    const firstCount = graph.getStats().relationshipCount
    expect(firstCount).toBeGreaterThan(0)

    graph.extractRelationships(text, graph.extractEntities(text, "session:1"))
    expect(graph.getStats().relationshipCount).toBe(firstCount)
  })
})
