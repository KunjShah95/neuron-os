import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { tmpdir, homedir } from "node:os"
import { DreamEngine, type DreamPhases } from "./engine"

function tempDbDir(): string {
  return mkdtempSync(join(tmpdir(), "dream-cycle-test-"))
}

const CONFIG_PATH = join(homedir(), ".aegis", "config.json")

describe("DreamEngine cycle guard", () => {
  let dbDir: string
  let configBackup: string | null = null
  let configExisted = false

  beforeEach(() => {
    dbDir = tempDbDir()
    configExisted = existsSync(CONFIG_PATH)
    configBackup = configExisted ? readFileSync(CONFIG_PATH, "utf-8") : null
  })

  afterEach(() => {
    if (configExisted && configBackup !== null) {
      writeFileSync(CONFIG_PATH, configBackup, "utf-8")
    } else if (!configExisted && existsSync(CONFIG_PATH)) {
      try {
        unlinkSync(CONFIG_PATH)
      } catch {
        // best-effort cleanup
      }
    }
    try {
      rmSync(dbDir, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
  })

  it("refuses to start a second cycle while one is running", async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const phases: Partial<DreamPhases> = {
      memoryReplay: async () => {
        await gate
        return { insights: [], dreamCount: 0 }
      },
    }

    const engine = new DreamEngine(undefined, { dbPath: dbDir, phases })
    const first = engine.runCycle()

    expect(engine.isCycleRunning()).toBe(true)

    await expect(engine.runCycle()).rejects.toThrow(/already in progress/i)

    release()
    const report = await first

    expect(report.cycleId).toBeDefined()
    expect(engine.isCycleRunning()).toBe(false)
    engine.close()
  })

  it("does not start a second cycle from tick while a cycle is running", async () => {
    let runs = 0
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const phases: Partial<DreamPhases> = {
      memoryReplay: async () => {
        runs++
        await gate
        return { insights: [], dreamCount: 0 }
      },
    }

    const engine = new DreamEngine({ minIdleMinutes: 0 }, { dbPath: dbDir, phases })

    engine.tick()
    engine.tick()
    await Promise.resolve()
    engine.tick()
    await Promise.resolve()

    expect(runs).toBe(1)

    release()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(runs).toBe(1)
    engine.close()
  })

  it("promotes sibling phase insights when one phase rejects", async () => {
    const phases: Partial<DreamPhases> = {
      memoryReplay: async () => {
        throw new Error("memory replay exploded")
      },
      patternDiscovery: async () => ({
        insights: [
          {
            id: "insight-1",
            dreamId: "dream-1",
            type: "pattern",
            title: "Sibling insight",
            description: "produced by the pattern phase",
            confidence: 0.9,
            sourceCount: 4,
            actionable: true,
            applied: false,
            createdAt: new Date().toISOString(),
          },
        ],
        dreamCount: 1,
      }),
      knowledgeCompression: async () => ({ insights: [], dreamCount: 0 }),
      counterfactual: async () => ({ insights: [], dreamCount: 0 }),
      sharedDream: async () => ({ insights: [], dreamCount: 0 }),
      moodConsolidation: async () => ({ insights: [], dreamCount: 0 }),
    }

    const engine = new DreamEngine(undefined, { dbPath: dbDir, phases })
    const report = await engine.runCycle()

    expect(report.insightsGenerated).toBe(1)
    expect(report.patternCount).toBe(1)
    expect(report.topInsights.length).toBe(1)
    expect(report.topInsights[0]?.title).toBe("Sibling insight")

    const persisted = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as { persistedInsights?: string[] }
    expect(persisted.persistedInsights ?? []).toContain("[pattern] Sibling insight")

    engine.close()
  })

  it("abandons a cycle that exceeds maxDreamDurationMs", async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const phases: Partial<DreamPhases> = {
      memoryReplay: async () => {
        await gate
        return { insights: [], dreamCount: 0 }
      },
    }

    const engine = new DreamEngine({ maxDreamDurationMs: 20 }, { dbPath: dbDir, phases })
    const report = await engine.runCycle()

    expect(report.insightsGenerated).toBe(0)
    expect(report.durationMs).toBeGreaterThanOrEqual(0)

    release()
    engine.close()
  })
})
