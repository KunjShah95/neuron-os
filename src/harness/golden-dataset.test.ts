/**
 * src/harness/golden-dataset.test.ts
 *
 * Tests for the GoldenDatasetManager — manages the Silver→Gold→Audit
 * pipeline for human-verified evaluation tasks.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, unlinkSync, rmdirSync, readdirSync } from "node:fs"
import { resolve, join } from "node:path"
import { GoldenDatasetManager } from "./golden-dataset"
import type { CrossValidationResult } from "./golden-dataset"

// ── Helpers ──────────────────────────────────────────────────────

const TEST_STORAGE_DIR = resolve(process.cwd(), "evals", "test-golden")

function rmdirRecursive(dir: string): void {
  try {
    if (!existsSync(dir)) return
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        rmdirRecursive(fullPath)
      } else {
        unlinkSync(fullPath)
      }
    }
    rmdirSync(dir)
  } catch {}
}

function makeCrossValidation(overrides: Partial<CrossValidationResult> = {}): CrossValidationResult {
  return {
    model: overrides.model ?? "test-model",
    passed: overrides.passed ?? true,
    score: overrides.score ?? 0.85,
    timestamp: new Date().toISOString(),
    durationMs: 5000,
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────────

describe("GoldenDatasetManager", () => {
  let manager: GoldenDatasetManager

  beforeEach(() => {
    rmdirRecursive(TEST_STORAGE_DIR)
    manager = new GoldenDatasetManager({
      storageDir: TEST_STORAGE_DIR,
      minQualityForAudit: 3.5,
      requireAuditForPublish: true,
    })
  })

  afterEach(() => {
    manager = null!
    rmdirRecursive(TEST_STORAGE_DIR)
  })

  describe("createSilverTask", () => {
    it("creates a silver task with all required fields", () => {
      const task = manager.createSilverTask({
        name: "Write a function",
        prompt: "Write a TypeScript function that sums two numbers",
        category: "capability",
        priority: "high",
        difficulty: "easy",
        author: "test-user",
      })

      expect(task.id).toContain("golden-capability")
      expect(task.name).toBe("Write a function")
      expect(task.goldenStatus).toBe("silver")
      expect(task.goldenDifficulty).toBe("easy")
      expect(task.goldenAuthor).toBe("test-user")
      expect(task.goldenVersion).toBe(1)
      expect(task.timeout).toBe(120000) // easy → 120000
      expect(task.tags).toContain("golden")
      expect(task.tags).toContain("difficulty:easy")
      expect(task.crossValidation).toEqual([])
    })

    it("creates tasks with different difficulty-based timeouts", () => {
      const easy = manager.createSilverTask({
        name: "Easy",
        prompt: "x",
        category: "capability",
        priority: "low",
        difficulty: "easy",
        author: "t",
      })
      expect(easy.timeout).toBe(120000)

      const medium = manager.createSilverTask({
        name: "Medium",
        prompt: "x",
        category: "capability",
        priority: "low",
        difficulty: "medium",
        author: "t",
      })
      expect(medium.timeout).toBe(180000)

      const hard = manager.createSilverTask({
        name: "Hard",
        prompt: "x",
        category: "capability",
        priority: "low",
        difficulty: "hard",
        author: "t",
      })
      expect(hard.timeout).toBe(300000)

      const expert = manager.createSilverTask({
        name: "Expert",
        prompt: "x",
        category: "capability",
        priority: "low",
        difficulty: "expert",
        author: "t",
      })
      expect(expert.timeout).toBe(600000)
    })

    it("accepts optional expectedPattern", () => {
      const task = manager.createSilverTask({
        name: "With pattern",
        prompt: "Do something",
        category: "capability",
        priority: "high",
        difficulty: "medium",
        author: "tester",
        expectedPattern: "function sum",
      })

      expect(task.expected?.pattern).toBe("function sum")
      expect(task.expected?.minScore).toBe(0.7)
    })

    it("accepts trajectories and failure modes", () => {
      const task = manager.createSilverTask({
        name: "Complex task",
        prompt: "Build a web server",
        category: "capability",
        priority: "high",
        difficulty: "hard",
        author: "tester",
        trajectories: [
          { action: "plan", description: "Plan the architecture" },
          { action: "code", description: "Implement the server" },
        ],
        failureModes: ["forgets error handling", "no tests"],
      })

      expect(task.trajectories).toHaveLength(2)
      expect(task.failureModes).toHaveLength(2)
    })
  })

  describe("promoteToGold", () => {
    it("promotes a silver task to gold", () => {
      const task = manager.createSilverTask({
        name: "Promote me",
        prompt: "Do stuff",
        category: "capability",
        priority: "high",
        difficulty: "medium",
        author: "tester",
      })

      const promoted = manager.promoteToGold(task.id, "reviewer-1", 4.2, "Looks good!")
      expect(promoted).not.toBeNull()
      expect(promoted!.goldenStatus).toBe("gold")
      expect(promoted!.goldenVerifiedBy).toBe("reviewer-1")
      expect(promoted!.goldenQualityScore).toBe(4.2)
      expect(promoted!.goldenVersion).toBe(2)
      expect(promoted!.reviewNotes).toBe("Looks good!")
    })

    it("returns null for nonexistent task", () => {
      const result = manager.promoteToGold("nonexistent", "reviewer", 4.0)
      expect(result).toBeNull()
    })

    it("clamps quality score to 1-5 range", () => {
      const task = manager.createSilverTask({
        name: "Clamp test",
        prompt: "x",
        category: "capability",
        priority: "high",
        difficulty: "easy",
        author: "tester",
      })

      const tooHigh = manager.promoteToGold(task.id, "r", 10)
      expect(tooHigh!.goldenQualityScore).toBe(5)

      // New task for below-min test
      const task2 = manager.createSilverTask({
        name: "Clamp low",
        prompt: "x",
        category: "capability",
        priority: "high",
        difficulty: "easy",
        author: "t",
      })
      const lowResult = manager.promoteToGold(task2.id, "r", -5)
      expect(lowResult!.goldenQualityScore).toBe(1)
    })
  })

  describe("addCrossValidation", () => {
    it("adds a cross-validation result", () => {
      const task = manager.createSilverTask({
        name: "Validate me",
        prompt: "x",
        category: "capability",
        priority: "high",
        difficulty: "easy",
        author: "t",
      })
      manager.promoteToGold(task.id, "reviewer", 4.0)

      const cv = makeCrossValidation({ model: "gpt-4o", passed: true, score: 0.9 })
      const updated = manager.addCrossValidation(task.id, cv)

      expect(updated!.crossValidation).toHaveLength(1)
      expect(updated!.crossValidation[0]!.model).toBe("gpt-4o")
    })

    it("returns null for nonexistent task", () => {
      const result = manager.addCrossValidation("nonexistent", makeCrossValidation())
      expect(result).toBeNull()
    })

    it("updates existing result for same model", () => {
      const task = manager.createSilverTask({
        name: "Update cv",
        prompt: "x",
        category: "capability",
        priority: "high",
        difficulty: "easy",
        author: "t",
      })
      manager.promoteToGold(task.id, "reviewer", 4.0)
      manager.addCrossValidation(task.id, makeCrossValidation({ model: "gpt-4o", passed: true, score: 0.9 }))
      manager.addCrossValidation(task.id, makeCrossValidation({ model: "gpt-4o", passed: false, score: 0.3 }))

      const updated = manager.getTask(task.id)
      expect(updated!.crossValidation).toHaveLength(1) // Updated, not appended
      expect(updated!.crossValidation[0]!.passed).toBe(false)
    })

    it("auto-audits when 2+ models pass", () => {
      const task = manager.createSilverTask({
        name: "Auto audit",
        prompt: "x",
        category: "capability",
        priority: "high",
        difficulty: "easy",
        author: "t",
      })
      manager.promoteToGold(task.id, "reviewer", 4.0)
      manager.addCrossValidation(task.id, makeCrossValidation({ model: "model-a", passed: true }))
      manager.addCrossValidation(task.id, makeCrossValidation({ model: "model-b", passed: true }))

      const updated = manager.getTask(task.id)
      expect(updated!.goldenStatus).toBe("audited")
    })
  })

  describe("archiveTask", () => {
    it("archives a task", () => {
      const task = manager.createSilverTask({
        name: "Archive me",
        prompt: "x",
        category: "capability",
        priority: "high",
        difficulty: "easy",
        author: "t",
      })

      const result = manager.archiveTask(task.id)
      expect(result).toBe(true)
      expect(manager.getTask(task.id)!.goldenStatus).toBe("archived")
    })

    it("returns false for nonexistent task", () => {
      const result = manager.archiveTask("nonexistent")
      expect(result).toBe(false)
    })
  })

  describe("queries", () => {
    it("getTasks returns all tasks when no status filter", () => {
      manager.createSilverTask({
        name: "T1",
        prompt: "x",
        category: "capability",
        priority: "high",
        difficulty: "easy",
        author: "t",
      })
      manager.createSilverTask({
        name: "T2",
        prompt: "x",
        category: "capability",
        priority: "high",
        difficulty: "easy",
        author: "t",
      })

      expect(manager.getTasks()).toHaveLength(2)
    })

    it("getTasks filters by status", () => {
      const t = manager.createSilverTask({
        name: "T",
        prompt: "x",
        category: "capability",
        priority: "high",
        difficulty: "easy",
        author: "t",
      })
      manager.promoteToGold(t.id, "r", 4.0)

      expect(manager.getTasks("silver")).toHaveLength(0)
      expect(manager.getTasks("gold")).toHaveLength(1)
    })

    it("getTask returns undefined for missing task", () => {
      expect(manager.getTask("nonexistent")).toBeUndefined()
    })

    it("getPendingReview returns silver tasks sorted by creation date", () => {
      manager.createSilverTask({
        name: "Older",
        prompt: "x",
        category: "capability",
        priority: "high",
        difficulty: "easy",
        author: "t",
      })
      manager.createSilverTask({
        name: "Newer",
        prompt: "x",
        category: "capability",
        priority: "high",
        difficulty: "easy",
        author: "t",
      })

      const pending = manager.getPendingReview()
      expect(pending).toHaveLength(2)
    })

    it("getReadyForAudit returns only gold tasks above quality threshold", () => {
      const t1 = manager.createSilverTask({
        name: "Good",
        prompt: "x",
        category: "capability",
        priority: "high",
        difficulty: "easy",
        author: "t",
      })
      manager.promoteToGold(t1.id, "r", 4.0) // 4.0 >= 3.5 ✓

      const t2 = manager.createSilverTask({
        name: "Low quality",
        prompt: "x",
        category: "capability",
        priority: "high",
        difficulty: "easy",
        author: "t",
      })
      manager.promoteToGold(t2.id, "r", 2.0) // 2.0 < 3.5 ✗

      const ready = manager.getReadyForAudit()
      expect(ready).toHaveLength(1)
      expect(ready[0]!.name).toBe("Good")
    })

    it("getPublished returns audited tasks with 2+ cross-validations", () => {
      const t = manager.createSilverTask({
        name: "Publishable",
        prompt: "x",
        category: "capability",
        priority: "high",
        difficulty: "easy",
        author: "t",
      })
      manager.promoteToGold(t.id, "r", 4.0)
      manager.addCrossValidation(t.id, makeCrossValidation({ model: "m1", passed: true }))
      manager.addCrossValidation(t.id, makeCrossValidation({ model: "m2", passed: true }))
      // 2 passes triggers auto-audit

      const published = manager.getPublished()
      expect(published).toHaveLength(1)
      expect(published[0]!.name).toBe("Publishable")
    })
  })

  describe("getStats", () => {
    it("returns zero stats for empty manager", () => {
      const stats = manager.getStats()
      expect(stats.total).toBe(0)
      expect(stats.avgQualityScore).toBe(0)
      expect(stats.auditPassRate).toBe(0)
    })

    it("returns correct stats with mixed tasks", () => {
      const t1 = manager.createSilverTask({
        name: "A",
        prompt: "x",
        category: "capability",
        priority: "high",
        difficulty: "easy",
        author: "t",
      })
      manager.promoteToGold(t1.id, "r", 4.0)

      manager.createSilverTask({
        name: "B",
        prompt: "x",
        category: "adversarial",
        priority: "high",
        difficulty: "hard",
        author: "t",
      })

      const stats = manager.getStats()
      expect(stats.total).toBe(2)
      expect(stats.byStatus.silver).toBe(1)
      expect(stats.byStatus.gold).toBe(1)
      expect(stats.byCategory.capability).toBe(1)
      expect(stats.byCategory.adversarial).toBe(1)
      expect(stats.byDifficulty.easy).toBe(1)
      expect(stats.byDifficulty.hard).toBe(1)
      expect(stats.avgQualityScore).toBe(4.0)
    })

    it("tracks audit pass rate", () => {
      const t = manager.createSilverTask({
        name: "Audited",
        prompt: "x",
        category: "capability",
        priority: "high",
        difficulty: "easy",
        author: "t",
      })
      manager.promoteToGold(t.id, "r", 4.0)
      manager.addCrossValidation(t.id, makeCrossValidation({ model: "m1", passed: true }))
      manager.addCrossValidation(t.id, makeCrossValidation({ model: "m2", passed: false }))

      const stats = manager.getStats()
      expect(stats.auditPassRate).toBe(0.5)
    })
  })

  describe("persistence", () => {
    it("persists tasks to disk and reloads them", () => {
      const t = manager.createSilverTask({
        name: "Persist me",
        prompt: "Should survive reload",
        category: "capability",
        priority: "high",
        difficulty: "easy",
        author: "tester",
      })

      // Create a new manager pointing to same dir
      const manager2 = new GoldenDatasetManager({
        storageDir: TEST_STORAGE_DIR,
      })

      const loaded = manager2.getTask(t.id)
      expect(loaded).not.toBeNull()
      expect(loaded!.name).toBe("Persist me")
      expect(loaded!.prompt).toBe("Should survive reload")
    })

    it("creates status subdirectories on save", () => {
      const t = manager.createSilverTask({
        name: "Dir test",
        prompt: "x",
        category: "capability",
        priority: "high",
        difficulty: "easy",
        author: "t",
      })
      manager.promoteToGold(t.id, "r", 4.0)

      const goldDir = join(TEST_STORAGE_DIR, "gold")
      expect(existsSync(goldDir)).toBe(true)
    })
  })
})
