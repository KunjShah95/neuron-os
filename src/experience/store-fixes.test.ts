/**
 * Regression tests for the experience store and replay fixes:
 * - recordExperience is idempotent (upsert instead of throwing)
 * - searchByGoalSimilarity thresholds the raw cosine similarity
 * - failure histogram is computed once for skill candidate extraction
 * - replayExperience finds experiences beyond the 1000 most recent
 * - getPipelineStats reports the real extracted-skill count
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { randomUUID } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { ExperienceStore, type ExperienceRecord } from "./store"
import { ExperienceReplay } from "./replay"

function makeId(): string {
  return `test-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
}

function makeExperience(overrides?: Partial<ExperienceRecord>): ExperienceRecord {
  return {
    id: makeId(),
    project: "test-project",
    sessionId: "s1",
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

describe("ExperienceStore fixes", () => {
  let dir: string
  let store: ExperienceStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "exp-store-fixes-"))
    store = new ExperienceStore(undefined, { dbPath: dir })
  })

  afterEach(() => {
    try {
      store.close()
    } catch {
      // best-effort
    }
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  })

  // ── BUG 6: idempotent recordExperience ─────────────────────────────

  it("records the same experience twice without throwing", () => {
    const record = makeExperience()

    expect(() => store.recordExperience(record)).not.toThrow()
    expect(() => store.recordExperience(record)).not.toThrow()
  })

  it("keeps a single row when the same experience is recorded twice", () => {
    const record = makeExperience()

    store.recordExperience(record)
    store.recordExperience(record)

    const all = store.listRecent(50)
    expect(all.filter((r) => r.id === record.id)).toHaveLength(1)
  })

  it("updates the stored trajectory when an experience is re-recorded", () => {
    const record = makeExperience({ outcome: "failed", reward: 0, summary: "first attempt" })

    store.recordExperience(record)
    store.recordExperience({ ...record, outcome: "success", reward: 0.9, summary: "second attempt" })

    const found = store.listRecent(50).find((r) => r.id === record.id)
    expect(found).toBeDefined()
    expect(found!.outcome).toBe("success")
    expect(found!.reward).toBe(0.9)
    expect(found!.summary).toBe("second attempt")
  })

  it("preserves actions recorded against a re-recorded experience", () => {
    const record = makeExperience()
    store.recordExperience(record)
    store.addAction({
      experienceId: record.id,
      stepIndex: 1,
      actionType: "file_modify",
      description: "Modified a file",
      details: "",
      outcome: "success",
      timestamp: new Date().toISOString(),
    })

    store.recordExperience({ ...record, summary: "second attempt" })

    const actions = store.getActionsForExperience(record.id)
    expect(actions).toHaveLength(1)
    expect(actions[0]!.actionType).toBe("file_modify")
  })

  // ── BUG 7: similarity threshold uses raw cosine ───────────────────

  it("keeps the best raw-cosine match even when its outcome boost is low", () => {
    const query = "refactor the authentication middleware handler"

    store.recordExperience(
      makeExperience({
        id: "failed-high-cosine",
        goal: "migrate the postgres cluster to the new version",
        summary: "migrate the postgres cluster to the new version",
        outcome: "failed",
        reward: 0,
      }),
    )
    store.recordExperience(
      makeExperience({
        id: "success-low-cosine",
        goal: "prepare a launch announcement for the product launch",
        summary: "prepare a launch announcement for the product launch",
        outcome: "success",
        reward: 1,
      }),
    )

    const results = store.searchByGoalSimilarity(query, 5)
    const ids = results.map((r) => r.id)

    expect(ids).toContain("failed-high-cosine")
    expect(ids).not.toContain("success-low-cosine")
    expect(results[0]!.similarity).toBeGreaterThanOrEqual(0.15)
  })

  it("excludes records below the raw cosine threshold", () => {
    const query = "refactor the authentication middleware handler"

    store.recordExperience(
      makeExperience({
        goal: "prepare a launch announcement for the product launch",
        summary: "prepare a launch announcement for the product launch",
        outcome: "success",
        reward: 1,
      }),
    )

    const results = store.searchByGoalSimilarity(query, 5)
    expect(results).toHaveLength(0)
  })

  it("ranks a boosted successful match above an equally similar failure", () => {
    const query = "repair the flaky websocket reconnect test"

    store.recordExperience(
      makeExperience({
        id: "success",
        goal: query,
        summary: query,
        outcome: "success",
        reward: 1,
      }),
    )
    store.recordExperience(
      makeExperience({
        id: "failed",
        goal: query,
        summary: query,
        outcome: "failed",
        reward: 0,
      }),
    )

    const results = store.searchByGoalSimilarity(query, 5)
    expect(results.map((r) => r.id)).toEqual(["success", "failed"])
  })

  // ── BUG 8: failure histogram computed once ─────────────────────────

  it("accounts for failures of the same goal when scoring skill candidates", () => {
    for (let i = 0; i < 4; i++) {
      const id = makeId()
      store.recordExperience(
        makeExperience({
          id,
          goal: "Add unit test for module X",
          outcome: "success",
          reward: 1,
          actionCount: 1,
        }),
      )
      store.addAction({
        experienceId: id,
        stepIndex: 1,
        actionType: "file_read",
        description: "read",
        details: "",
        outcome: "success",
        timestamp: new Date().toISOString(),
      })
    }

    const withoutFailures = store.findSkillCandidates(3)
    expect(withoutFailures.length).toBeGreaterThanOrEqual(1)
    expect(withoutFailures[0]!.confidence).toBe(100)

    for (let i = 0; i < 4; i++) {
      store.recordExperience(
        makeExperience({
          id: makeId(),
          goal: "Add unit test for module X",
          outcome: "failed",
          reward: 0,
        }),
      )
    }

    const withFailures = store.findSkillCandidates(3)
    expect(withFailures).toHaveLength(0)
  })

  // ── BUG 11: getById + skill extraction counter ─────────────────────

  it("looks an experience up by id regardless of age", () => {
    const record = makeExperience({ id: "old-experience" })
    store.recordExperience(record)

    for (let i = 0; i < 1100; i++) {
      store.recordExperience(makeExperience({ id: `filler-${i}` }))
    }

    const found = store.getById("old-experience")
    expect(found).not.toBeNull()
    expect(found!.id).toBe("old-experience")
  })

  it("returns null for an unknown experience id", () => {
    expect(store.getById("does-not-exist")).toBeNull()
  })

  it("reports the real number of extracted skills", async () => {
    const replay = new ExperienceReplay(store)
    expect(replay.getPipelineStats().totalSkillsExtracted).toBe(0)

    for (let i = 0; i < 4; i++) {
      const id = makeId()
      store.recordExperience(
        makeExperience({
          id,
          goal: "Add unit test for module X",
          outcome: "success",
          reward: 1,
          actionCount: 1,
        }),
      )
      store.addAction({
        experienceId: id,
        stepIndex: 1,
        actionType: "file_read",
        description: "read",
        details: "",
        outcome: "success",
        timestamp: new Date().toISOString(),
      })
    }

    const extractions = await replay.extractSkills({ minConfidence: 70, minRepetitions: 3, dryRun: false })
    expect(extractions.length).toBeGreaterThanOrEqual(1)
    expect(replay.getPipelineStats().totalSkillsExtracted).toBeGreaterThanOrEqual(1)
  })

  it("replays an experience that is older than the 1000 most recent", async () => {
    const replay = new ExperienceReplay(store)
    const record = makeExperience({ id: "ancient-experience", goal: "fix the parser" })
    store.recordExperience(record)

    for (let i = 0; i < 1100; i++) {
      store.recordExperience(makeExperience({ id: `filler-${i}` }))
    }

    const result = await replay.replayExperience("ancient-experience")
    expect(result.retried).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it("reports an error for an unknown experience id", async () => {
    const replay = new ExperienceReplay(store)
    const result = await replay.replayExperience("missing")
    expect(result.retried).toBe(false)
    expect(result.error).toBe("Experience not found")
  })
})
