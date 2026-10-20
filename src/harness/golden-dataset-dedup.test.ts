import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, rmSync, mkdirSync } from "node:fs"
import { resolve, join } from "node:path"
import { GoldenDatasetManager } from "./golden-dataset"

const TEST_DIR = resolve(process.cwd(), ".aegis", "test-golden-dedup")

function makeTask(manager: GoldenDatasetManager, name: string): string {
  const task = manager.createSilverTask({
    name,
    prompt: "do the thing",
    category: "capability",
    priority: "high",
    difficulty: "easy",
    author: "tester",
  })
  return task.id
}

describe("GoldenDatasetManager stale copies", () => {
  let manager: GoldenDatasetManager

  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
    mkdirSync(TEST_DIR, { recursive: true })
    manager = new GoldenDatasetManager({ storageDir: TEST_DIR })
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it("removes the silver copy when a task is promoted to gold", () => {
    const id = makeTask(manager, "Promote me")

    expect(existsSync(join(TEST_DIR, "silver", `${id}.json`))).toBe(true)

    manager.promoteToGold(id, "reviewer", 4.5)

    expect(existsSync(join(TEST_DIR, "silver", `${id}.json`))).toBe(false)
    expect(existsSync(join(TEST_DIR, "gold", `${id}.json`))).toBe(true)
  })

  it("removes the gold copy when a task is archived", () => {
    const id = makeTask(manager, "Archive me")
    manager.promoteToGold(id, "reviewer", 4.5)

    manager.archiveTask(id)

    expect(existsSync(join(TEST_DIR, "gold", `${id}.json`))).toBe(false)
    expect(existsSync(join(TEST_DIR, "archived", `${id}.json`))).toBe(true)
  })

  it("loads each task only once after a promotion", () => {
    const id = makeTask(manager, "Counted once")
    manager.promoteToGold(id, "reviewer", 4.5)

    const reloaded = new GoldenDatasetManager({ storageDir: TEST_DIR })

    expect(reloaded.getTasks()).toHaveLength(1)
    expect(reloaded.getTasks("gold")).toHaveLength(1)
    expect(reloaded.getTasks("silver")).toHaveLength(0)
    expect(reloaded.getStats().total).toBe(1)
    expect(reloaded.getStats().byStatus.gold).toBe(1)
  })

  it("does not double count after a promotion and an audit", () => {
    const id = makeTask(manager, "Audited")
    manager.promoteToGold(id, "reviewer", 4.5)
    manager.addCrossValidation(id, { model: "m1", passed: true, score: 0.9, timestamp: "", durationMs: 1 })
    manager.addCrossValidation(id, { model: "m2", passed: true, score: 0.9, timestamp: "", durationMs: 1 })

    const reloaded = new GoldenDatasetManager({ storageDir: TEST_DIR })

    expect(reloaded.getTasks()).toHaveLength(1)
    expect(reloaded.getTasks("audited")).toHaveLength(1)
    expect(existsSync(join(TEST_DIR, "gold", `${id}.json`))).toBe(false)
    expect(existsSync(join(TEST_DIR, "audited", `${id}.json`))).toBe(true)
  })
})
