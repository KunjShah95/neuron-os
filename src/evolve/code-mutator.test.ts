import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { CodeMutator } from "./code-mutator"
import type { CodeMutation } from "./types"

/**
 * Use a relative path from process.cwd() so that path.resolve(cwd, relativePath)
 * in CodeMutator correctly resolves on all platforms (including Windows).
 * Absolute temp paths cause issues with path.join on Windows.
 */
const TEST_DIR = "data/evolve-test-codemut"
const TEST_DIR_ABS = resolve(process.cwd(), TEST_DIR)

function makeMutation(overrides: Partial<CodeMutation> = {}): CodeMutation {
  return {
    id: "mut-" + Date.now().toString(36),
    filePath: "test/file.ts",
    strategy: "refactor",
    description: "Test mutation",
    diff: "",
    oldContent: "const x = 1\n",
    newContent: "const x = 2\n",
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

describe("CodeMutator", () => {
  let mutator: CodeMutator

  beforeEach(() => {
    // Ensure the test directory exists
    mkdirSync(TEST_DIR_ABS, { recursive: true })
    mutator = new CodeMutator()
  })

  afterEach(() => {
    try { rmSync(TEST_DIR_ABS, { recursive: true, force: true }) } catch {}
  })

  describe("applyMutation", () => {
    it("writes new content to the file", () => {
      const relPath = join(TEST_DIR, "apply-test.ts")
      const absPath = join(TEST_DIR_ABS, "apply-test.ts")
      writeFileSync(absPath, "const x = 1\n", "utf-8")

      const mutation: CodeMutation = makeMutation({
        filePath: relPath,
        oldContent: "const x = 1\n",
        newContent: "const x = 2\n",
      })

      const result = mutator.applyMutation(mutation)
      expect(result).toBe(true)

      const content = readFileSync(absPath, "utf-8")
      expect(content).toBe("const x = 2\n")
    })

    it("returns false for non-existent file", () => {
      const mutation: CodeMutation = makeMutation({
        filePath: join(TEST_DIR, "nonexistent.ts"),
        oldContent: "",
        newContent: "new content",
      })

      const result = mutator.applyMutation(mutation)
      expect(result).toBe(false)
    })

    it("creates a backup of the original file", () => {
      const relPath = join(TEST_DIR, "backup-test.ts")
      const absPath = join(TEST_DIR_ABS, "backup-test.ts")
      writeFileSync(absPath, "original content\n", "utf-8")

      const mutation: CodeMutation = makeMutation({
        filePath: relPath,
        oldContent: "original content\n",
        newContent: "modified content\n",
      })

      const result = mutator.applyMutation(mutation)
      expect(result).toBe(true)

      const content = readFileSync(absPath, "utf-8")
      expect(content).toBe("modified content\n")
    })
  })

  describe("rollbackMutation", () => {
    it("restores original content from backup", () => {
      const relPath = join(TEST_DIR, "rollback-test.ts")
      const absPath = join(TEST_DIR_ABS, "rollback-test.ts")
      writeFileSync(absPath, "original content\n", "utf-8")

      const mutation: CodeMutation = makeMutation({
        filePath: relPath,
        oldContent: "original content\n",
        newContent: "modified content\n",
      })

      // Apply first
      const applied = mutator.applyMutation(mutation)
      expect(applied).toBe(true)
      expect(readFileSync(absPath, "utf-8")).toBe("modified content\n")

      // Then rollback
      const result = mutator.rollbackMutation(mutation)
      expect(result).toBe(true)

      const content = readFileSync(absPath, "utf-8")
      expect(content).toBe("original content\n")
    })

    it("returns false when no backup exists", () => {
      const mutation: CodeMutation = makeMutation({
        filePath: join(TEST_DIR, "never-applied.ts"),
        oldContent: "",
        newContent: "content",
      })

      const result = mutator.rollbackMutation(mutation)
      expect(result).toBe(false)
    })
  })
})
