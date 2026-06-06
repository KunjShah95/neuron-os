/**
 * Tests for the ExperienceStore (experience replay buffer).
 * Covers CRUD, querying, clustering, and skill extraction.
 *
 * Each test uses a unique project directory for complete SQLite isolation.
 *
 * Usage: bun test ./src/experience/test-store.ts
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "bun:test"
import { randomUUID } from "node:crypto"
import { rmSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type { ExperienceRecord, ExperienceAction } from "./store"

// ── Helpers ───────────────────────────────────────────────────────────

const BASE_PROJECT = `exp-test-${Date.now().toString(36)}`
const createdProjects: string[] = []

function cleanupProjects() {
  const base = join(homedir(), ".aegis", "projects")
  for (const p of createdProjects) {
    try { rmSync(join(base, p), { recursive: true, force: true }) } catch {}
  }
  createdProjects.length = 0
}

function makeId(): string {
  return `test-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
}

function makeExperience(project: string, overrides?: Partial<ExperienceRecord>): ExperienceRecord {
  return {
    id: makeId(),
    project,
    sessionId: makeId(),
    goal: "test goal",
    agentType: "test-agent",
    outcome: "success",
    reward: 1.0,
    actionCount: 3,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    summary: "Completed successfully",
    tags: ["test"],
    metrics: "{}",
    ...overrides,
  }
}

function makeAction(experienceId: string, overrides?: Partial<ExperienceAction>): Omit<ExperienceAction, "id"> {
  return {
    experienceId,
    stepIndex: 1,
    actionType: "file_modify",
    description: "Modified a file",
    details: "Changed src/index.ts",
    outcome: "success",
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

describe("ExperienceStore", () => {
  let store: any
  let project: string

  beforeAll(() => {
    cleanupProjects()
  })

  afterAll(() => {
    cleanupProjects()
  })

  beforeEach(async () => {
    // Each test gets its own project -> own SQLite DB -> zero contamination
    project = `${BASE_PROJECT}-${randomUUID().slice(0, 8)}`
    createdProjects.push(project)
    const { ExperienceStore } = await import("./store")
    store = new ExperienceStore(project)
  })

  afterEach(() => {
    try { store.close() } catch {}
  })

  // ── Record ──────────────────────────────────────────────────────────

  it("should record an experience and retrieve it", () => {
    const exp = makeExperience(project)
    store.recordExperience(exp)

    const recent = store.listRecent(10, project)
    const found = recent.find((r: ExperienceRecord) => r.id === exp.id)
    expect(found).toBeTruthy()
    expect(found!.goal).toBe("test goal")
    expect(found!.outcome).toBe("success")
    expect(found!.reward).toBe(1.0)
    expect(found!.tags).toEqual(["test"])
  })

  it("should record an action and retrieve it", () => {
    const exp = makeExperience(project)
    store.recordExperience(exp)

    const action = makeAction(exp.id)
    store.addAction(action)

    const actions = store.getActionsForExperience(exp.id)
    expect(actions).toHaveLength(1)
    expect(actions[0]!.actionType).toBe("file_modify")
    expect(actions[0]!.description).toBe("Modified a file")
    expect(actions[0]!.experienceId).toBe(exp.id)
  })

  it("should record multiple actions in order", () => {
    const exp = makeExperience(project)
    store.recordExperience(exp)

    for (let i = 0; i < 5; i++) {
      store.addAction(makeAction(exp.id, { stepIndex: i + 1, actionType: `step-${i + 1}` }))
    }

    const actions = store.getActionsForExperience(exp.id)
    expect(actions).toHaveLength(5)
    for (let i = 0; i < 5; i++) {
      expect(actions[i]!.stepIndex).toBe(i + 1)
      expect(actions[i]!.actionType).toBe(`step-${i + 1}`)
    }
  })

  it("should record an experience with all outcome types", () => {
    for (const outcome of ["success", "failed", "reverted", "partial"] as const) {
      const exp = makeExperience(project, { id: makeId(), outcome })
      store.recordExperience(exp)

      const found = store.listRecent(50, project).find((r: ExperienceRecord) => r.id === exp.id)
      expect(found).toBeTruthy()
      expect(found!.outcome).toBe(outcome)
    }
  })

  // ── Query ───────────────────────────────────────────────────────────

  it("should list recent experiences scoped to project", () => {
    const exp1 = makeExperience(project)
    const exp2 = makeExperience(project)
    store.recordExperience(exp1)
    store.recordExperience(exp2)

    const all = store.listRecent(10, project)
    expect(all.some((r: ExperienceRecord) => r.id === exp1.id)).toBe(true)
    expect(all.some((r: ExperienceRecord) => r.id === exp2.id)).toBe(true)
  })

  it("should respect limit", () => {
    for (let i = 0; i < 5; i++) {
      store.recordExperience(makeExperience(project, { id: makeId(), goal: `goal-${i}` }))
    }

    const limited = store.listRecent(2)
    expect(limited.length).toBeLessThanOrEqual(2)
  })

  it("should get experiences by outcome", () => {
    const success = makeExperience(project, { outcome: "success" })
    const failed = makeExperience(project, { outcome: "failed" })
    store.recordExperience(success)
    store.recordExperience(failed)

    const successes = store.getByOutcome("success")
    const failures = store.getByOutcome("failed")
    expect(successes.some((r: ExperienceRecord) => r.id === success.id)).toBe(true)
    expect(failures.some((r: ExperienceRecord) => r.id === failed.id)).toBe(true)
    expect(failures.some((r: ExperienceRecord) => r.id === success.id)).toBe(false)
  })

  it("should get recent failures", () => {
    const failed = makeExperience(project, { outcome: "failed" })
    store.recordExperience(failed)

    const failures = store.getRecentFailures()
    expect(failures.some((r: ExperienceRecord) => r.id === failed.id)).toBe(true)
  })

  it("should get recent successes", () => {
    const success = makeExperience(project, { outcome: "success" })
    store.recordExperience(success)

    const successes = store.getRecentSuccesses()
    expect(successes.some((r: ExperienceRecord) => r.id === success.id)).toBe(true)
  })

  it("should return empty array for non-existent outcome", () => {
    const reverteds = store.getByOutcome("reverted")
    expect(Array.isArray(reverteds)).toBe(true)
  })

  // ── Stats ───────────────────────────────────────────────────────────

  it("should return stats for empty store", () => {
    const stats = store.getStats()
    expect(typeof stats.totalExperiences).toBe("number")
    expect(typeof stats.successCount).toBe("number")
    expect(typeof stats.failureCount).toBe("number")
  })

  it("should update stats after recording experiences", () => {
    const exp = makeExperience(project, { outcome: "success", reward: 0.8 })
    store.recordExperience(exp)
    store.addAction(makeAction(exp.id))

    const stats = store.getStats()
    expect(stats.totalExperiences).toBe(1)
    expect(stats.totalActions).toBe(1)
  })

  it("should calculate avg reward correctly", () => {
    const exp1 = makeExperience(project, { outcome: "success", reward: 1.0 })
    const exp2 = makeExperience(project, { outcome: "failed", reward: 0.0 })
    store.recordExperience(exp1)
    store.recordExperience(exp2)

    const stats = store.getStats()
    expect(stats.totalExperiences).toBe(2)
    expect(stats.avgReward).toBe(0.5)
  })

  // ── Cluster Insights ────────────────────────────────────────────────

  it("should return empty clusters when no failures exist", () => {
    const clusters = store.computeClusterInsights(2)
    expect(clusters).toEqual([])
  })

  it("should cluster similar failures together", () => {
    // All 3 failures must have IDENTICAL summaries for extractClusterKey to group them
    for (let i = 0; i < 3; i++) {
      const id = makeId()
      store.recordExperience(makeExperience(project, {
        id,
        outcome: "failed",
        summary: "Error: File not found in module",
      }))
      store.addAction(makeAction(id, { outcome: "error", actionType: "file_read" }))
    }

    const clusters = store.computeClusterInsights(2)
    expect(clusters.length).toBeGreaterThanOrEqual(1)
    const found = clusters.find((c: any) =>
      c.clusterKey.toLowerCase().includes("not found"))
    expect(found).toBeTruthy()
    expect(found!.count).toBe(3)
    expect(found!.topSuggestions.length).toBeGreaterThanOrEqual(1)
  })

  it("should cluster timeout failures", () => {
    // All 2 failures must have IDENTICAL summaries
    for (let i = 0; i < 2; i++) {
      store.recordExperience(makeExperience(project, {
        id: makeId(),
        outcome: "failed",
        summary: "Error: Network timeout after 30s",
      }))
    }

    const clusters = store.computeClusterInsights(2)
    const found = clusters.find((c: any) =>
      c.clusterKey.toLowerCase().includes("timeout"))
    expect(found).toBeTruthy()
    expect(found!.count).toBe(2)
  })

  it("should sort clusters by count descending", () => {
    for (let i = 0; i < 5; i++) {
      store.recordExperience(makeExperience(project, {
        id: makeId(), outcome: "failed",
        summary: "Error: Type mismatch",
      }))
    }
    for (let i = 0; i < 3; i++) {
      store.recordExperience(makeExperience(project, {
        id: makeId(), outcome: "failed",
        summary: "Error: Network timeout",
      }))
    }

    const clusters = store.computeClusterInsights(2)
    for (let i = 1; i < clusters.length; i++) {
      expect(clusters[i - 1]!.count).toBeGreaterThanOrEqual(clusters[i]!.count)
    }
  })

  it("should respect minClusterSize threshold", () => {
    store.recordExperience(makeExperience(project, {
      id: makeId(), outcome: "failed",
      summary: "Error: Some rare error",
    }))

    const clusters = store.computeClusterInsights(2)
    const rare = clusters.find((c: any) => c.clusterKey.includes("rare"))
    expect(rare).toBeUndefined()
  })

  // ── Skill Candidates ────────────────────────────────────────────────

  it("should return empty skills when no successes exist", () => {
    const skills = store.findSkillCandidates(2)
    expect(skills).toEqual([])
  })

  it("should identify skill candidates from repeated successful patterns", () => {
    // All 4 must have IDENTICAL goals for normalizeGoal to group them
    for (let i = 0; i < 4; i++) {
      const id = makeId()
      store.recordExperience(makeExperience(project, {
        id,
        outcome: "success",
        goal: "Add unit test for module X",
        reward: 1.0,
        actionCount: 3,
      }))
      store.addAction(makeAction(id, { actionType: "file_read", outcome: "success" }))
      store.addAction(makeAction(id, { actionType: "file_modify", outcome: "success", stepIndex: 2 }))
      store.addAction(makeAction(id, { actionType: "shell_command", outcome: "success", stepIndex: 3 }))
    }

    const skills = store.findSkillCandidates(3)
    expect(skills.length).toBeGreaterThanOrEqual(1)
    expect(skills[0]!.confidence).toBeGreaterThanOrEqual(70)
    expect(skills[0]!.steps).toContain("file_read")
    expect(skills[0]!.steps).toContain("file_modify")
  })

  // ── Cleanup ─────────────────────────────────────────────────────────

  it("should close without error", () => {
    expect(() => store.close()).not.toThrow()
  })
})
