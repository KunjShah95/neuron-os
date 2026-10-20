import { describe, expect, it, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { SoulManager } from "./soul"

describe("SoulManager persistence", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aegis-soul-"))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("persists a soul when it is registered", () => {
    const manager = new SoulManager({ dir })
    manager.register("agent-1", manager.generateSoul("build", "Builder"))
    expect(existsSync(join(dir, "agent-1.json"))).toBe(true)
  })

  it("hydrates persisted souls in a new manager instance", () => {
    const first = new SoulManager({ dir })
    first.register("agent-1", first.generateSoul("build", "Builder"))
    first.recordOutcome("agent-1", "build", true)

    const second = new SoulManager({ dir })
    const soul = second.get("agent-1")
    expect(soul).toBeDefined()
    expect(soul?.name).toBe("Builder")
    expect(second.list().length).toBe(1)
  })

  it("persists mood changes made through updateMood", () => {
    const manager = new SoulManager({ dir })
    manager.register("agent-1", manager.generateSoul("build"))
    manager.updateMood("agent-1", "failure")

    const raw = JSON.parse(readFileSync(join(dir, "agent-1.json"), "utf-8")) as { mood: { mood: string } }
    const reloaded = new SoulManager({ dir }).get("agent-1")
    expect(reloaded?.mood.mood).toBe(raw.mood.mood)
  })

  it("persists trait evolution", () => {
    const manager = new SoulManager({ dir })
    manager.register("agent-1", manager.generateSoul("build"))
    const trait = manager.get("agent-1")!.traits[0]!.name
    expect(manager.evolveTrait("agent-1", trait, 5)).toBe(true)

    const reloaded = new SoulManager({ dir }).get("agent-1")
    const reloadedTrait = reloaded?.traits.find((t) => t.name === trait)
    const original = manager.get("agent-1")!.traits.find((t) => t.name === trait)
    expect(reloadedTrait?.score).toBe(original?.score)
  })

  it("keeps the persisted soul when the agent is unregistered", () => {
    const manager = new SoulManager({ dir })
    manager.register("agent-1", manager.generateSoul("build"))
    manager.unregister("agent-1")

    expect(manager.get("agent-1")).toBeUndefined()
    expect(existsSync(join(dir, "agent-1.json"))).toBe(true)
    expect(new SoulManager({ dir }).get("agent-1")).toBeDefined()
  })

  it("ignores malformed soul files instead of failing to start", () => {
    const manager = new SoulManager({ dir })
    manager.register("agent-1", manager.generateSoul("build"))
    writeFileSync(join(dir, "broken.json"), "{not json", "utf-8")

    const second = new SoulManager({ dir })
    expect(second.get("agent-1")).toBeDefined()
    expect(second.list().length).toBe(1)
  })
})
