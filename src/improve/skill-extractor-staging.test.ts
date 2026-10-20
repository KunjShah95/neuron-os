import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { SkillExtractor } from "./skill-extractor"
import type { SkillReviewStore } from "./skill-review"
import type { SkillCandidate } from "./types"
import type { ExperienceStore } from "../experience/store"

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "skill-extractor-test-"))
}

function makeStore(): ExperienceStore {
  const experiences = [
    {
      id: "exp-1",
      goal: "deploy the billing service",
      summary: "deployed the billing service to the staging cluster",
      outcome: "success",
      reward: 0.95,
      tags: ["deploy", "billing"],
      createdAt: new Date().toISOString(),
    },
    {
      id: "exp-2",
      goal: "deploy the billing service",
      summary: "deployed the billing service to the staging cluster",
      outcome: "success",
      reward: 0.92,
      tags: ["deploy", "billing"],
      createdAt: new Date().toISOString(),
    },
  ]

  return {
    getByOutcome: (outcome: string, limit: number) => experiences.filter((e) => e.outcome === outcome).slice(0, limit),
  } as unknown as ExperienceStore
}

function makeReviewStore(): { store: SkillReviewStore; staged: SkillCandidate[] } {
  const staged: SkillCandidate[] = []
  const store = {
    staged,
    getById: (id: string) => staged.find((c) => c.id === id),
    listStaged: () => staged.filter((c) => c.status === "candidate" || c.status === "validated"),
    listAutoApproved: () => [],
    stage: (candidate: SkillCandidate) => {
      const idx = staged.findIndex((c) => c.id === candidate.id)
      if (idx >= 0) staged[idx] = candidate
      else staged.push(candidate)
    },
    remove: (id: string) => {
      const idx = staged.findIndex((c) => c.id === id)
      if (idx < 0) return false
      staged.splice(idx, 1)
      return true
    },
    recordAutoApproved: () => {},
  } as unknown as SkillReviewStore

  return { store, staged }
}

describe("SkillExtractor staging", () => {
  let dir: string

  beforeEach(() => {
    dir = tempDir()
  })

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
  })

  it("stages extracted candidates as candidates rather than validated ones", () => {
    const { store, staged } = makeReviewStore()
    const extractor = new SkillExtractor(makeStore(), {
      candidatesPath: join(dir, "skill-candidates.json"),
      reviewStore: store,
    })

    const candidates = extractor.extractCandidates(0.7)

    expect(candidates.length).toBeGreaterThan(0)
    for (const candidate of candidates) {
      expect(candidate.status).toBe("candidate")
    }

    expect(staged.length).toBe(candidates.length)
    for (const candidate of staged) {
      expect(candidate.status).toBe("candidate")
    }
  })

  it("marks a candidate as validated only after validation runs", async () => {
    const { store, staged } = makeReviewStore()
    const extractor = new SkillExtractor(makeStore(), {
      candidatesPath: join(dir, "skill-candidates.json"),
      reviewStore: store,
    })

    const candidates = extractor.extractCandidates(0.7)
    const candidate = candidates[0] as SkillCandidate

    const validated = await extractor.validateCandidate(candidate)

    expect(validated.status).toBe("validated")
    expect(extractor.getCandidates("validated").length).toBe(1)
    expect(extractor.getCandidates("candidate").length).toBe(0)
    expect(staged[0]?.status).toBe("validated")
  })
})
