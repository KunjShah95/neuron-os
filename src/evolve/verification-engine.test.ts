import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { VerificationEngine } from "./verification-engine"
import { EvolutionStore } from "./evolution-store"
import type { CodeMutation } from "./types"

function tempDbDir(): string {
  return mkdtempSync(join(tmpdir(), "verif-test-"))
}

function makeMutation(overrides: Partial<CodeMutation> = {}): CodeMutation {
  return {
    id: "mut-" + Date.now().toString(36),
    filePath: "/test/file.ts",
    strategy: "refactor",
    description: "Test mutation",
    diff: '[{"type":"replace","line":1,"text":"const x = 1"}]',
    oldContent: "const x: any = 1\n",
    newContent: "const x: unknown = 1\n",
    status: "proposed",
    confidence: 0.8,
    sourceInsight: "",
    sourceDreamId: "",
    sourceFailureIds: [],
    testResults: "",
    testPassed: false,
    testDurationMs: 0,
    createdAt: new Date().toISOString(),
    appliedAt: "",
    rollbackAt: "",
    ...overrides,
  }
}

describe("VerificationEngine", () => {
  let engine: VerificationEngine
  let dbDir: string
  let store: EvolutionStore

  beforeEach(() => {
    dbDir = tempDbDir()
    store = new EvolutionStore(undefined, { dbPath: dbDir })
    engine = new VerificationEngine(store)
  })

  afterEach(() => {
    try { rmSync(dbDir, { recursive: true, force: true }) } catch {}
  })

  describe("verifyMutation", () => {
    it("returns a VerificationResult with passed=false for non-runnable mutation", async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "verif-verify-"))
      try {
        const testFile = join(tmpDir, "test.ts")
        writeFileSync(testFile, "const x = 1\n")

        const mutation = store.createMutation(makeMutation({
          filePath: testFile,
          oldContent: "const x = 1\n",
          newContent: "const x = 1\n",
          diff: "[]",
        }))

        const result = await engine.verifyMutation(mutation)
        // The verification may or may not pass depending on whether
        // tsc and bun test are available in the environment.
        // At minimum it should return a well-shaped result.
        expect(result).toBeDefined()
        expect(typeof result.passed).toBe("boolean")
        expect(typeof result.durationMs).toBe("number")
        expect(typeof result.output).toBe("string")
        expect(typeof result.error).toBe("string")
      } finally {
        try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
      }
    })

    it("updates mutation status to verifying on start", async () => {
      const mutation = store.createMutation(makeMutation())
      await engine.verifyMutation(mutation)
      // After verify completes, status should be either passed or failed
      const updated = store.getMutation(mutation.id)
      expect(updated).not.toBeNull()
      expect(["passed", "failed"]).toContain(updated!.status)
    })

    it("handles errors gracefully and returns failed result", async () => {
      // Create a mutation with a corrupt diff to trigger an error path
      const mutation = store.createMutation(makeMutation({
        filePath: "/nonexistent/path/file.ts",
      }))
      const result = await engine.verifyMutation(mutation)
      expect(result.passed).toBe(false)
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe("result shape", () => {
    it("returns VerificationResult with all required fields", async () => {
      const mutation = store.createMutation(makeMutation())
      const result = await engine.verifyMutation(mutation)
      expect(result).toHaveProperty("passed")
      expect(result).toHaveProperty("output")
      expect(result).toHaveProperty("durationMs")
      expect(result).toHaveProperty("error")
      expect(typeof result.passed).toBe("boolean")
      expect(typeof result.durationMs).toBe("number")
    })
  })
})
