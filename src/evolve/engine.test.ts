import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { EvolutionEngine } from "./engine"
import { EvolutionStore } from "./evolution-store"
import { MutationGenerator } from "./mutation-generator"
import { DEFAULT_EVOLUTION_CONFIG } from "./types"
import type { CodeMutation } from "./types"

function tempDbDir(): string {
  return mkdtempSync(join(tmpdir(), "evolve-test-"))
}

function makeMutation(overrides: Partial<CodeMutation> = {}): CodeMutation {
  return {
    id: "mut-" + Date.now().toString(36),
    filePath: "/test/file.ts",
    strategy: "refactor",
    description: "Test mutation",
    diff: "",
    oldContent: "",
    newContent: "",
    status: "proposed",
    confidence: 0.8,
    sourceInsight: "",
    sourceDreamId: "",
    sourceFailureIds: [],
    testResults: "",
    testPassed: false,
    testDurationMs: 0,
    createdAt: new Date().toISOString(),
    appliedAt: null,
    rollbackAt: null,
    ...overrides,
  }
}

describe("EvolutionStore", () => {
  let dbDir: string
  let store: EvolutionStore

  beforeEach(() => {
    dbDir = tempDbDir()
    store = new EvolutionStore(undefined, { dbPath: dbDir })
  })

  afterEach(() => {
    try { rmSync(dbDir, { recursive: true, force: true }) } catch {}
  })

  it("creates DB file at specified path", () => {
    expect(existsSync(join(dbDir, "evolution.db"))).toBe(true)
  })

  describe("createMutation", () => {
    it("creates a mutation with generated id and defaults", () => {
      const mut = store.createMutation(makeMutation())
      expect(mut.id).toBeDefined()
      expect(mut.status).toBe("proposed")
      expect(mut.filePath).toBe("/test/file.ts")
      expect(mut.strategy).toBe("refactor")
      expect(mut.createdAt).toBeDefined()
    })

    it("generates unique IDs per call", () => {
      const a = store.createMutation(makeMutation())
      const b = store.createMutation(makeMutation())
      expect(a.id).not.toBe(b.id)
    })

    it("round-trips all fields through the database", () => {
      const mut = store.createMutation(makeMutation({
        filePath: "src/complex.ts",
        strategy: "bugfix",
        description: "Fix null reference in parser",
        confidence: 0.92,
        diff: "--- a\n+++ b\n@@ -1 +1 @@\n-const x = null\n+const x = 0\n",
        oldContent: "const x = null",
        newContent: "const x = 0",
      }))
      const fetched = store.getMutation(mut.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.filePath).toBe("src/complex.ts")
      expect(fetched!.strategy).toBe("bugfix")
      expect(fetched!.description).toBe("Fix null reference in parser")
      expect(fetched!.confidence).toBe(0.92)
      expect(fetched!.diff).toContain("const x = null")
    })
  })

  describe("getMutation", () => {
    it("returns null for non-existent mutation", () => {
      expect(store.getMutation("nonexistent")).toBeNull()
    })

    it("returns a created mutation by ID", () => {
      const created = store.createMutation(makeMutation({ description: "Fix null ref", strategy: "bugfix" }))
      const fetched = store.getMutation(created.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.id).toBe(created.id)
      expect(fetched!.strategy).toBe("bugfix")
    })
  })

  describe("updateMutation", () => {
    it("updates specified fields", () => {
      const mut = store.createMutation(makeMutation({ description: "X" }))
      store.updateMutation(mut.id, { status: "applied", testPassed: true, testResults: "All tests passed" })
      const updated = store.getMutation(mut.id)
      expect(updated!.status).toBe("applied")
      expect(updated!.testPassed).toBe(true)
      expect(updated!.testResults).toBe("All tests passed")
    })
  })

  describe("listMutations", () => {
    it("lists all mutations by default", () => {
      store.createMutation(makeMutation({ filePath: "a.ts", description: "A" }))
      store.createMutation(makeMutation({ filePath: "b.ts", description: "B" }))
      const all = store.listMutations()
      expect(all.length).toBeGreaterThanOrEqual(2)
    })

    it("filters by status", () => {
      const m = store.createMutation(makeMutation({ description: "A" }))
      store.updateMutation(m.id, { status: "applied" })
      store.createMutation(makeMutation({ description: "B" }))
      const proposed = store.listMutations(10, "proposed")
      expect(proposed.every((m) => m.status === "proposed")).toBe(true)
    })

    it("respects limit", () => {
      store.createMutation(makeMutation({ description: "A" }))
      store.createMutation(makeMutation({ description: "B" }))
      expect(store.listMutations(1).length).toBe(1)
    })
  })

  describe("getStats", () => {
    it("returns zeros for empty store", () => {
      const stats = store.getStats()
      expect(stats.totalMutations).toBe(0)
      expect(stats.averageConfidence).toBe(0)
      expect(stats.passRate).toBe(0)
    })

    it("reflects inserted data", () => {
      store.createMutation(makeMutation({ confidence: 0.8 }))
      const stats = store.getStats()
      expect(stats.totalMutations).toBe(1)
      expect(stats.averageConfidence).toBe(0.8)
      expect(stats.mutationsByStrategy?.refactor).toBe(1)
    })
  })
})

describe("MutationGenerator", () => {
  const gen = new MutationGenerator()

  describe("analyzeFile", () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), "mutgen-test-"))
    })

    afterEach(() => {
      try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    })

    it("returns null for non-existent file", () => {
      const result = gen.analyzeFile(join(tmpDir, "nonexistent.ts"))
      expect(result).toBeNull()
    })

    it("detects try/catch in source", () => {
      const filePath = join(tmpDir, "test.ts")
      writeFileSync(filePath, [
        "function foo() {",
        "  try {",
        '    console.log("hello")',
        "  } catch (err) {",
        "    // handle error",
        "  }",
        "}",
      ].join("\n"))
      const result = gen.analyzeFile(filePath)
      expect(result).not.toBeNull()
      expect(result!.hasTryCatch).toBe(true)
    })

    it("detects console.log", () => {
      const filePath = join(tmpDir, "test.ts")
      writeFileSync(filePath, 'console.log("debug")\n')
      const result = gen.analyzeFile(filePath)
      expect(result).not.toBeNull()
      expect(result!.hasConsoleLog).toBe(true)
    })

    it("detects TODO comments", () => {
      const filePath = join(tmpDir, "test.ts")
      writeFileSync(filePath, "// TODO: implement this\n")
      const result = gen.analyzeFile(filePath)
      expect(result).not.toBeNull()
      expect(result!.hasTodo).toBe(true)
    })

    it("detects any types", () => {
      const filePath = join(tmpDir, "test.ts")
      writeFileSync(filePath, "const x: any = 1\n")
      const result = gen.analyzeFile(filePath)
      expect(result).not.toBeNull()
      expect(result!.hasAnyType).toBe(true)
    })

    it("detects non-null assertions", () => {
      const filePath = join(tmpDir, "test.ts")
      writeFileSync(filePath, "const x = foo!\n")
      const result = gen.analyzeFile(filePath)
      expect(result).not.toBeNull()
      expect(result!.hasNonNullAssertion).toBe(true)
    })

    it("detects FIXME comments", () => {
      const filePath = join(tmpDir, "test.ts")
      writeFileSync(filePath, "// FIXME: this is broken\n")
      const result = gen.analyzeFile(filePath)
      expect(result).not.toBeNull()
      expect(result!.hasFIXME).toBe(true)
    })

    it("analyzes an empty file", () => {
      const filePath = join(tmpDir, "empty.ts")
      writeFileSync(filePath, "")
      const result = gen.analyzeFile(filePath)
      expect(result).not.toBeNull()
      expect(result!.lines).toBe(1)
    })
  })
})

describe("EvolutionEngine", () => {
  describe("constructor & config", () => {
    it("creates with default config", () => {
      const engine = new EvolutionEngine()
      const config = engine.getConfig()
      expect(config.enabled).toBe(true)
      expect(config.confidenceThreshold).toBe(DEFAULT_EVOLUTION_CONFIG.confidenceThreshold)
      expect(config.requireTestPass).toBe(true)
    })

    it("accepts partial config overrides", () => {
      const engine = new EvolutionEngine({ enabled: false, confidenceThreshold: 0.9 })
      expect(engine.getConfig().enabled).toBe(false)
      expect(engine.getConfig().confidenceThreshold).toBe(0.9)
    })

    it("getConfig returns a copy", () => {
      const engine = new EvolutionEngine()
      const config = engine.getConfig()
      config.enabled = false
      expect(engine.getConfig().enabled).toBe(true)
    })
  })

  describe("updateConfig", () => {
    it("merges config updates and preserves unset fields", () => {
      const engine = new EvolutionEngine()
      engine.updateConfig({ enabled: false })
      expect(engine.getConfig().enabled).toBe(false)
      expect(engine.getConfig().confidenceThreshold).toBe(DEFAULT_EVOLUTION_CONFIG.confidenceThreshold)
    })
  })

  describe("runCycle", () => {
    it("returns zeroed report when disabled", async () => {
      const engine = new EvolutionEngine({ enabled: false })
      const report = await engine.runCycle()
      expect(report.mutationsProposed).toBe(0)
      expect(report.mutationsApplied).toBe(0)
      expect(report.mutationsFailed).toBe(0)
    })

    it("returns a report when enabled", async () => {
      const engine = new EvolutionEngine()
      const report = await engine.runCycle()
      expect(report).toBeDefined()
      expect(typeof report.mutationsProposed).toBe("number")
      expect(typeof report.mutationsApplied).toBe("number")
      expect(typeof report.mutationsFailed).toBe("number")
    })
  })
})
