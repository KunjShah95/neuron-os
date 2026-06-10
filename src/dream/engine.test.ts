import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { DreamEngine } from "./engine"
import { DreamStore } from "./dream-store"
import { InsightGenerator } from "./insight-generator"
import { MemoryReplay } from "./memory-replay"
import { DEFAULT_DREAM_CONFIG } from "./types"
import type { DreamInsight, MemoryReplayResult } from "./types"

function tempDbDir(): string {
  return mkdtempSync(join(tmpdir(), "dream-test-"))
}

function makeInsight(overrides: Partial<DreamInsight> & { dreamId: string }): DreamInsight {
  return {
    id: `insight-${Date.now().toString(36)}`,
    type: "pattern",
    title: "Test insight",
    description: "A test insight",
    confidence: 0.8,
    sourceCount: 3,
    actionable: true,
    applied: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe("DreamStore", () => {
  let dbDir: string
  let store: DreamStore

  beforeEach(() => {
    dbDir = tempDbDir()
    store = new DreamStore(undefined, { dbPath: dbDir })
  })

  afterEach(() => {
    store.close()
    try { rmSync(dbDir, { recursive: true, force: true }) } catch {}
  })

  it("creates DB file at specified path", () => {
    expect(existsSync(join(dbDir, "dream.db"))).toBe(true)
  })

  describe("createDream", () => {
    it("creates a dream entry with defaults", () => {
      const dream = store.createDream({ agentType: "builder", type: "memory-replay" })
      expect(dream.id).toBeDefined()
      expect(dream.agentType).toBe("builder")
      expect(dream.type).toBe("memory-replay")
      expect(dream.status).toBe("pending")
      expect(dream.vividness).toBe("moderate")
      expect(dream.sourceIds).toEqual([])
      expect(dream.insightIds).toEqual([])
    })

    it("accepts optional agentId", () => {
      const dream = store.createDream({ agentType: "builder", agentId: "agent-123", type: "pattern-discovery" })
      expect(dream.agentId).toBe("agent-123")
    })

    it("generates unique IDs per call", () => {
      const a = store.createDream({ agentType: "builder", type: "memory-replay" })
      const b = store.createDream({ agentType: "builder", type: "memory-replay" })
      expect(a.id).not.toBe(b.id)
    })
  })

  describe("getDream", () => {
    it("returns null for non-existent dream", () => {
      expect(store.getDream("nonexistent")).toBeNull()
    })

    it("returns a created dream by ID", () => {
      const created = store.createDream({ agentType: "builder", type: "memory-replay" })
      const fetched = store.getDream(created.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.id).toBe(created.id)
      expect(fetched!.agentType).toBe("builder")
    })
  })

  describe("updateDream", () => {
    it("updates specified fields", () => {
      const dream = store.createDream({ agentType: "builder", type: "memory-replay" })
      store.updateDream(dream.id, { status: "completed", summary: "Updated summary" })
      const updated = store.getDream(dream.id)
      expect(updated!.status).toBe("completed")
      expect(updated!.summary).toBe("Updated summary")
    })

    it("does not throw on empty update", () => {
      const dream = store.createDream({ agentType: "builder", type: "memory-replay" })
      expect(() => store.updateDream(dream.id, {})).not.toThrow()
    })
  })

  describe("listDreams", () => {
    it("lists dreams in reverse chronological order", () => {
      store.createDream({ agentType: "builder", type: "memory-replay" })
      store.createDream({ agentType: "builder", type: "memory-replay" })
      const dreams = store.listDreams()
      expect(dreams.length).toBeGreaterThanOrEqual(2)
      const times = dreams.map((d) => new Date(d.startedAt).getTime())
      expect(times[0]).toBeGreaterThanOrEqual(times[1])
    })

    it("filters by agentType", () => {
      store.createDream({ agentType: "builder", type: "memory-replay" })
      store.createDream({ agentType: "tester", type: "memory-replay" })
      const filtered = store.listDreams(10, "builder")
      expect(filtered.every((d) => d.agentType === "builder")).toBe(true)
    })

    it("respects limit parameter", () => {
      store.createDream({ agentType: "builder", type: "memory-replay" })
      store.createDream({ agentType: "builder", type: "memory-replay" })
      expect(store.listDreams(1).length).toBe(1)
    })
  })

  describe("addInsight", () => {
    it("creates an insight with generated id and createdAt", () => {
      const dream = store.createDream({ agentType: "builder", type: "memory-replay" })
      const insight = store.addInsight({
        dreamId: dream.id,
        type: "pattern",
        title: "Found pattern",
        description: "Repeated failure in auth",
        confidence: 0.9,
        sourceCount: 5,
        actionable: true,
      })
      expect(insight.id).toBeDefined()
      expect(insight.createdAt).toBeDefined()
      expect(insight.dreamId).toBe(dream.id)
    })
  })

  describe("getInsightsForDream", () => {
    it("returns insights sorted by confidence descending", () => {
      const dream = store.createDream({ agentType: "builder", type: "memory-replay" })
      store.addInsight({ dreamId: dream.id, type: "pattern", title: "Low", description: "", confidence: 0.3, sourceCount: 1, actionable: false })
      store.addInsight({ dreamId: dream.id, type: "pattern", title: "High", description: "", confidence: 0.9, sourceCount: 1, actionable: true })
      const insights = store.getInsightsForDream(dream.id)
      expect(insights.length).toBe(2)
      expect(insights[0].confidence).toBeGreaterThanOrEqual(insights[1].confidence)
    })
  })

  describe("getAllInsights", () => {
    it("filters by actionableOnly", () => {
      const dream = store.createDream({ agentType: "builder", type: "memory-replay" })
      store.addInsight({ dreamId: dream.id, type: "pattern", title: "A", description: "", confidence: 0.5, sourceCount: 1, actionable: true })
      store.addInsight({ dreamId: dream.id, type: "pattern", title: "B", description: "", confidence: 0.5, sourceCount: 1, actionable: false })
      const actionable = store.getAllInsights(10, true)
      expect(actionable.every((i) => i.actionable)).toBe(true)
    })
  })

  describe("markInsightApplied", () => {
    it("sets applied to true", () => {
      const dream = store.createDream({ agentType: "builder", type: "memory-replay" })
      const insight = store.addInsight({ dreamId: dream.id, type: "pattern", title: "A", description: "", confidence: 0.5, sourceCount: 1, actionable: true })
      store.markInsightApplied(insight.id)
      const insights = store.getInsightsForDream(dream.id)
      expect(insights[0].applied).toBe(true)
    })
  })

  describe("getStats", () => {
    it("returns aggregate counts with zeros for empty store", () => {
      const stats = store.getStats()
      expect(stats.totalDreams).toBe(0)
      expect(stats.completedDreams).toBe(0)
      expect(stats.totalInsights).toBe(0)
      expect(stats.dreamsByType).toEqual({})
    })

    it("reflects inserted data", () => {
      const dream = store.createDream({ agentType: "builder", type: "memory-replay" })
      store.updateDream(dream.id, { status: "completed" })
      store.addInsight({ dreamId: dream.id, type: "pattern", title: "X", description: "", confidence: 0.5, sourceCount: 1, actionable: true })
      const stats = store.getStats()
      expect(stats.totalDreams).toBe(1)
      expect(stats.completedDreams).toBe(1)
      expect(stats.totalInsights).toBe(1)
      expect(stats.dreamsByType["memory-replay"]).toBe(1)
    })
  })
})

describe("DreamEngine", () => {
  let engine: DreamEngine

  afterEach(() => {
    engine.close()
    const dataDir = join(process.cwd(), "data", "dream")
    try { rmSync(dataDir, { recursive: true, force: true }) } catch {}
  })

  describe("constructor & config", () => {
    it("creates with default config", () => {
      engine = new DreamEngine()
      const config = engine.getConfig()
      expect(config.enabled).toBe(true)
      expect(config.minIdleMinutes).toBe(DEFAULT_DREAM_CONFIG.minIdleMinutes)
      expect(config.maxDreamDurationMs).toBe(DEFAULT_DREAM_CONFIG.maxDreamDurationMs)
    })

    it("accepts partial config overrides", () => {
      engine = new DreamEngine({ minIdleMinutes: 10, maxDreamDurationMs: 60000 })
      expect(engine.getConfig().minIdleMinutes).toBe(10)
      expect(engine.getConfig().maxDreamDurationMs).toBe(60000)
    })

    it("getConfig returns a copy (immutable)", () => {
      engine = new DreamEngine()
      const config = engine.getConfig()
      config.enabled = false
      expect(engine.getConfig().enabled).toBe(true)
    })
  })

  describe("updateConfig", () => {
    it("merges config updates", () => {
      engine = new DreamEngine()
      engine.updateConfig({ enabled: false })
      expect(engine.getConfig().enabled).toBe(false)
    })

    it("does not affect unset fields", () => {
      engine = new DreamEngine()
      engine.updateConfig({ enabled: false })
      expect(engine.getConfig().minIdleMinutes).toBe(DEFAULT_DREAM_CONFIG.minIdleMinutes)
    })
  })

  describe("runCycle", () => {
    it("returns a populated report", async () => {
      engine = new DreamEngine()
      const report = await engine.runCycle()
      expect(report.cycleId).toBeDefined()
      expect(report.startedAt).toBeDefined()
      expect(report.completedAt).toBeDefined()
      expect(typeof report.dreamsCreated).toBe("number")
      expect(typeof report.insightsGenerated).toBe("number")
      expect(Array.isArray(report.topInsights)).toBe(true)
    })
  })
})

describe("InsightGenerator", () => {
  const gen = new InsightGenerator()

  describe("generateFromMemoryReplay", () => {
    it("creates pattern insights from string patterns", () => {
      const result: MemoryReplayResult = {
        replayedExperiences: [],
        patternsFound: ["builder agents show failure pattern 5 times"],
        anomalies: [],
        crossCorrelations: [],
      }
      const insights = gen.generateFromMemoryReplay("dream-1", result)
      expect(insights.length).toBe(1)
      expect(insights[0].type).toBe("pattern")
      expect(insights[0].dreamId).toBe("dream-1")
    })

    it("creates correlation insights from anomaly strings", () => {
      const result: MemoryReplayResult = {
        replayedExperiences: [],
        patternsFound: [],
        anomalies: ["low-reward anomaly: exp-1 had unusually low reward"],
        crossCorrelations: [],
      }
      const insights = gen.generateFromMemoryReplay("dream-1", result)
      expect(insights.some((i) => i.type === "correlation")).toBe(true)
    })

    it("creates correlation insights from cross-correlations above threshold", () => {
      const result: MemoryReplayResult = {
        replayedExperiences: [],
        patternsFound: [],
        anomalies: [],
        crossCorrelations: [{ source: "builder", target: "tester", correlation: 0.9 }],
      }
      const insights = gen.generateFromMemoryReplay("dream-1", result)
      expect(insights.some((i) => i.type === "correlation")).toBe(true)
    })

    it("returns empty array for empty results", () => {
      const result: MemoryReplayResult = {
        replayedExperiences: [],
        patternsFound: [],
        anomalies: [],
        crossCorrelations: [],
      }
      const insights = gen.generateFromMemoryReplay("dream-1", result)
      expect(insights).toEqual([])
    })
  })
})

describe("MemoryReplay", () => {
  const replay = new MemoryReplay()

  it("replay() returns defined result", () => {
    const result = replay.replay(DEFAULT_DREAM_CONFIG.memoryReplay)
    expect(result).toBeDefined()
    expect(Array.isArray(result.patternsFound)).toBe(true)
    expect(Array.isArray(result.anomalies)).toBe(true)
  })
})
