/**
 * The candidate list must not lose entries when two extractors run
 * concurrently: the merge has to re-read the file and the write has to be
 * atomic.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { SkillExtractor } from "./skill-extractor"
import type { SkillReviewStore } from "./skill-review"
import type { SkillCandidate } from "./types"
import type { ExperienceStore } from "../experience/store"

function makeStore(goal: string, summary: string): ExperienceStore {
  const experiences = [
    { id: "exp-1", goal, summary, outcome: "success", reward: 0.95, tags: ["x"] },
    { id: "exp-2", goal, summary, outcome: "success", reward: 0.92, tags: ["x"] },
  ]

  return {
    getByOutcome: (outcome: string, limit: number) =>
      experiences.filter((e) => e.outcome === outcome).slice(0, limit),
  } as unknown as ExperienceStore
}

function makeReviewStore(): SkillReviewStore {
  const staged: SkillCandidate[] = []
  return {
    stage: (candidate: SkillCandidate) => {
      staged.push(candidate)
    },
    getById: (id: string) => staged.find((c) => c.id === id),
    listStaged: () => staged,
    listAutoApproved: () => [],
    remove: () => true,
    recordAutoApproved: () => {},
  } as unknown as SkillReviewStore
}

describe("SkillExtractor candidate persistence", () => {
  let dir: string
  let candidatesPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "skill-extractor-concurrency-"))
    candidatesPath = join(dir, "skill-candidates.json")
  })

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best-effort cleanup */
    }
  })

  it("keeps candidates written by a concurrent extractor", () => {
    const reviewStore = makeReviewStore()
    const first = new SkillExtractor(makeStore("deploy the billing service", "deployed the billing service"), {
      candidatesPath,
      reviewStore,
    })
    const second = new SkillExtractor(makeStore("migrate the database schema", "migrated the database schema"), {
      candidatesPath,
      reviewStore,
    })

    first.extractCandidates(0.7, false)
    second.extractCandidates(0.7, false)

    const saved = JSON.parse(readFileSync(candidatesPath, "utf-8")) as SkillCandidate[]
    expect(saved.length).toBe(2)
    expect(saved.map((c) => c.name).sort()).toEqual(["auto-deploy-the-billing-service", "auto-migrate-the-database-schema"])
  })

  it("writes the candidate list atomically without leaving temp files behind", () => {
    const reviewStore = makeReviewStore()
    const extractor = new SkillExtractor(makeStore("deploy the billing service", "deployed the billing service"), {
      candidatesPath,
      reviewStore,
    })

    extractor.extractCandidates(0.7, false)

    const files = readdirSync(dir)
    expect(files.filter((f) => f.endsWith(".tmp"))).toHaveLength(0)
    expect(files).toContain("skill-candidates.json")
  })
})
