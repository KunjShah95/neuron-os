import { describe, it, expect } from "bun:test"
import {
  AutoImprovePipeline,
  type PipelineExtractor,
  type PipelineMonitor,
  type PipelineReviewStore,
  type PipelineValidator,
} from "./pipeline"
import type { SkillCandidate } from "./types"
import type { ExperienceStore } from "../experience/store"

function makeCandidate(overrides: Partial<SkillCandidate> = {}): SkillCandidate {
  return {
    id: "cand-test",
    name: "auto-test-skill",
    description: "test candidate",
    sourcePattern: "test pattern",
    confidence: 0.9,
    derivedFrom: ["exp-1", "exp-2"],
    avgReward: 0.9,
    invocationCount: 4,
    successRate: 0.9,
    createdAt: new Date().toISOString(),
    status: "candidate",
    ...overrides,
  }
}

function makeStore(totalExperiences: number) {
  return {
    getStats: () => ({
      totalExperiences,
      successCount: totalExperiences,
      failureCount: 0,
    }),
  } as unknown as ExperienceStore
}

function makeExtractor(
  candidates: SkillCandidate[],
  validated: SkillCandidate[] = [],
): PipelineExtractor & {
  validatedIds: string[]
} {
  const validatedIds: string[] = []
  return {
    validatedIds,
    extractCandidates: () => candidates,
    getCandidates: (status?: SkillCandidate["status"]) =>
      status ? candidates.filter((c) => c.status === status) : [...candidates],
    validateCandidate: async (candidate: SkillCandidate) => {
      validatedIds.push(candidate.id)
      const updated = { ...candidate, status: "validated" as const }
      validated.push(updated)
      return updated
    },
    approveFromStaging: async (candidateId: string) => ({
      success: true,
      skillPath: `skills/${candidateId}.ts`,
    }),
    rejectCandidate: () => true,
  }
}

function makeValidator(passed: boolean): PipelineValidator {
  return {
    batchValidate: async (candidates: SkillCandidate[]) => ({
      total: candidates.length,
      passed: passed ? candidates.length : 0,
      failed: passed ? 0 : candidates.length,
      results: candidates.map((candidate) => ({
        candidate,
        passed,
        compositeScore: passed ? 0.9 : 0.1,
        grades: [],
        testRun: null,
        recommendation: passed ? ("publish" as const) : ("reject" as const),
        reason: passed ? "ok" : "failed",
        categoryFailures: [],
      })),
      summary: {
        avgScore: passed ? 0.9 : 0.1,
        topCandidates: [],
        avgDurationMs: 1,
      },
    }),
  }
}

function makeReviewStore(staged: SkillCandidate[]): PipelineReviewStore {
  return {
    listStaged: () => staged,
    stage: (candidate: SkillCandidate) => {
      const idx = staged.findIndex((c) => c.id === candidate.id)
      if (idx >= 0) staged[idx] = candidate
      else staged.push(candidate)
    },
  }
}

function makeMonitor(): PipelineMonitor & { usages: string[] } {
  const usages: string[] = []
  return {
    usages,
    listAll: () => [],
    getDegradingSkills: () => [],
    recordUsage: (skillId: string) => {
      usages.push(skillId)
    },
  }
}

describe("AutoImprovePipeline phase reporting", () => {
  it("reports the validation phase as failed when candidates fail validation", async () => {
    const candidate = makeCandidate()
    const extractor = makeExtractor([candidate])
    const pipeline = new AutoImprovePipeline(
      {},
      {
        store: makeStore(5),
        extractor,
        validator: makeValidator(false),
        reviewStore: makeReviewStore([]),
        monitor: makeMonitor(),
      },
    )

    const result = await pipeline.run(["publish", "monitor", "cleanup"])

    const validatePhase = result.phases.find((p) => p.name === "Validate candidates")
    expect(validatePhase).toBeDefined()
    expect(validatePhase!.status).toBe("failed")
    expect(result.success).toBe(false)
    expect(result.validationStats.failed).toBe(1)
    expect(result.validationStats.passed).toBe(0)
  })

  it("reports the validation phase as passed when every candidate passes", async () => {
    const candidate = makeCandidate()
    const validated: SkillCandidate[] = []
    const extractor = makeExtractor([candidate], validated)
    const pipeline = new AutoImprovePipeline(
      {},
      {
        store: makeStore(5),
        extractor,
        validator: makeValidator(true),
        reviewStore: makeReviewStore([]),
        monitor: makeMonitor(),
      },
    )

    const result = await pipeline.run(["publish", "monitor", "cleanup"])

    const validatePhase = result.phases.find((p) => p.name === "Validate candidates")
    expect(validatePhase!.status).toBe("passed")
    expect(result.success).toBe(true)
    expect(result.validationStats.passed).toBe(1)
    expect(extractor.validatedIds).toEqual([candidate.id])
  })

  it("publishes staged candidates that passed validation", async () => {
    const stagedCandidate = makeCandidate({ status: "validated" })
    const extractor = makeExtractor([])
    const monitor = makeMonitor()
    const pipeline = new AutoImprovePipeline(
      {},
      {
        store: makeStore(5),
        extractor,
        validator: makeValidator(true),
        reviewStore: makeReviewStore([stagedCandidate]),
        monitor,
      },
    )

    const result = await pipeline.run(["monitor", "cleanup"])

    const publishPhase = result.phases.find((p) => p.name === "Publish auto-approved skills")
    expect(publishPhase!.status).toBe("passed")
    expect(publishPhase!.details).toContain("Published 1 skill(s)")
    expect(monitor.usages).toEqual([stagedCandidate.id])
  })

  it("skips the validation phase when there are no candidates", async () => {
    const extractor = makeExtractor([])
    const pipeline = new AutoImprovePipeline(
      {},
      {
        store: makeStore(5),
        extractor,
        validator: makeValidator(true),
        reviewStore: makeReviewStore([]),
        monitor: makeMonitor(),
      },
    )

    const result = await pipeline.run(["publish", "monitor", "cleanup"])

    const validatePhase = result.phases.find((p) => p.name === "Validate candidates")
    expect(validatePhase!.status).toBe("skipped")
  })
})
