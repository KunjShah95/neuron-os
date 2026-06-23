import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { rmSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { GraphStorage } from "./storage"
import { DEFAULT_TEMPORAL_CONFIG } from "./types"

const GRAPH_DB_PATH = resolve(process.cwd(), ".aegis/memory/graph")

describe("GraphStorage", () => {
  let storage: GraphStorage

  beforeAll(async () => {
    storage = new GraphStorage(DEFAULT_TEMPORAL_CONFIG)
    await storage.initialize()
  })

  afterAll(async () => {
    await storage.close()
    try {
      rmSync(GRAPH_DB_PATH, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  })

  it("initializes successfully", () => {
    expect(storage).toBeDefined()
    expect(existsSync(resolve(GRAPH_DB_PATH, "graph.db"))).toBe(true)
  })

  it("creates an entity and retrieves it by id", async () => {
    const entity = await storage.createEntity({
      type: "person",
      name: "Alice",
      aliases: ["Al"],
      properties: { role: "engineer" },
    })

    expect(entity.id).toMatch(/^ent-/)
    expect(entity.name).toBe("Alice")
    expect(entity.type).toBe("person")
    expect(entity.aliases).toEqual(["Al"])
    expect(entity.mentionCount).toBe(1)

    const found = await storage.getEntity(entity.id)
    expect(found).not.toBeNull()
    expect(found!.name).toBe("Alice")
  })

  it("returns null for nonexistent entity", async () => {
    const result = await storage.getEntity("nonexistent-id")
    expect(result).toBeNull()
  })

  it("finds entity by name", async () => {
    await storage.createEntity({
      type: "project",
      name: "NeuronOS",
      aliases: [],
      properties: {},
    })

    const found = await storage.findEntityByName("NeuronOS")
    expect(found).not.toBeNull()
    expect(found!.type).toBe("project")
  })

  it("finds entity by name case-insensitively", async () => {
    const found = await storage.findEntityByName("neuronos")
    expect(found).not.toBeNull()
  })

  it("updates an entity", async () => {
    const entity = await storage.createEntity({
      type: "concept",
      name: "MemorySystem",
      aliases: [],
      properties: { status: "draft" },
    })

    const updated = await storage.updateEntity(entity.id, {
      properties: { status: "stable" },
    })

    expect(updated).not.toBeNull()
    expect(updated!.properties.status).toBe("stable")
  })

  it("creates a relationship between entities", async () => {
    const source = await storage.createEntity({ type: "person", name: "Bob", aliases: [], properties: {} })
    const target = await storage.createEntity({ type: "project", name: "ProjectX", aliases: [], properties: {} })

    const rel = await storage.createRelationship({
      sourceId: source.id,
      targetId: target.id,
      type: "works_on",
      properties: {},
      strength: 0.9,
    })

    expect(rel.id).toBeDefined()
    expect(rel.sourceId).toBe(source.id)
    expect(rel.targetId).toBe(target.id)
    expect(rel.type).toBe("works_on")
    expect(rel.strength).toBe(0.9)
  })

  it("queries entities by type", async () => {
    const results = await storage.query({ entityTypes: ["person"] })
    expect(results.entities.length).toBeGreaterThanOrEqual(1)
    for (const e of results.entities) {
      expect(e.type).toBe("person")
    }
  })

  it("returns empty results for unseen type", async () => {
    const results = await storage.query({ entityTypes: ["location"] })
    expect(results.entities.length).toBe(0)
  })
})
