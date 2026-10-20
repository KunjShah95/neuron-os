/**
 * Failure histogram and action persistence in the experience store.
 *
 * The histogram must be computed with a single grouped query and must return
 * the same counts as a per-goal scan of the failure table.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { ExperienceStore, type ExperienceRecord } from "./store"

function makeExperience(id: string, overrides?: Partial<ExperienceRecord>): ExperienceRecord {
  return {
    id,
    project: "",
    sessionId: `session-${id}`,
    goal: "deploy the billing service",
    agentType: "test-agent",
    outcome: "success",
    reward: 1,
    actionCount: 1,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    summary: "ok",
    tags: [],
    metrics: "{}",
    ...overrides,
  }
}

describe("ExperienceStore failure histogram", () => {
  let dir: string
  let store: ExperienceStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "experience-histogram-"))
    store = new ExperienceStore({ dbPath: join(dir, "experience.db") })
  })

  afterEach(() => {
    store.close()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best-effort cleanup */
    }
  })

  it("counts failures per goal with one grouped query", () => {
    store.recordExperience(makeExperience("s1"))
    store.recordExperience(makeExperience("s2"))
    store.recordExperience(makeExperience("s3"))
    store.recordExperience(makeExperience("f1", { outcome: "failed", reward: 0 }))
    store.recordExperience(makeExperience("f2", { outcome: "failed", reward: 0 }))
    store.recordExperience(makeExperience("f3", { outcome: "failed", goal: "migrate the database", reward: 0 }))

    const counts = store.getFailureCountsByGoal()

    const expected = new Map<string, number>()
    for (const failure of store.getByOutcome("failed", 100)) {
      const key = failure.goal.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 60)
      expected.set(key, (expected.get(key) ?? 0) + 1)
    }

    expect(counts.size).toBe(expected.size)
    for (const [key, count] of expected) {
      expect(counts.get(key)).toBe(count)
    }
    expect(counts.get("deploy the billing service")).toBe(2)
    expect(counts.get("migrate the database")).toBe(1)
  })

  it("feeds the failure histogram into the skill candidate success rate", () => {
    for (let i = 0; i < 3; i++) {
      store.recordExperience(makeExperience(`s${i}`))
    }
    store.recordExperience(makeExperience("f0", { outcome: "failed", reward: 0 }))

    const candidates = store.findSkillCandidates(3)
    expect(candidates.length).toBe(1)
    expect(candidates[0]?.confidence).toBe(75)
  })

  it("stores actions and returns them for the owning experience", () => {
    store.addAction({
      experienceId: "s1",
      stepIndex: 0,
      actionType: "read_file",
      description: "read src/index.ts",
      details: "{}",
      outcome: "success",
      timestamp: new Date().toISOString(),
    })
    store.addAction({
      experienceId: "s1",
      stepIndex: 1,
      actionType: "write_file",
      description: "write src/index.ts",
      details: "{}",
      outcome: "success",
      timestamp: new Date().toISOString(),
    })

    const actions = store.getActionsForExperience("s1")
    expect(actions.length).toBe(2)
    expect(actions[0]?.stepIndex).toBe(0)
    expect(actions[1]?.actionType).toBe("write_file")
    expect(store.getStats().totalActions).toBe(2)
  })

  it("produces skill candidate steps from the recorded actions", () => {
    for (let i = 0; i < 3; i++) {
      store.recordExperience(makeExperience(`s${i}`))
      store.addAction({
        experienceId: `s${i}`,
        stepIndex: 0,
        actionType: "read_file",
        description: "read",
        details: "{}",
        outcome: "success",
        timestamp: new Date().toISOString(),
      })
    }

    const candidates = store.findSkillCandidates(3)
    expect(candidates.length).toBe(1)
    expect(candidates[0]?.steps).toEqual(["read_file"])
  })
})
