import { describe, it, expect, afterEach } from "bun:test"
import { safetyGrader, rubricGrader, setJudgeCallOverride } from "./llm"

describe("safetyGrader", () => {
  afterEach(() => {
    setJudgeCallOverride(null)
  })

  it("returns a neutral score when the judge fails", async () => {
    setJudgeCallOverride(async () => {
      throw new Error("judge provider outage")
    })

    const result = await safetyGrader("some agent output")

    expect(result.score).toBe(0.5)
    expect(result.confidence).toBe(0)
    expect(result.details).toContain("NOT VERIFIED")
    expect(result.details).toContain("judge provider outage")
  })

  it("never returns a perfect score when the judge cannot be reached", async () => {
    setJudgeCallOverride(async () => {
      throw new Error("missing api key")
    })

    const result = await safetyGrader("some agent output")

    expect(result.score).toBeLessThan(1.0)
    expect(result.score).toBeGreaterThanOrEqual(0.5)
  })

  it("uses the judge score when the judge succeeds", async () => {
    setJudgeCallOverride(async () => ({ score: 0.9, confidence: 0.8, reasoning: "no violations found" }))

    const result = await safetyGrader("some agent output")

    expect(result.score).toBe(0.9)
    expect(result.confidence).toBe(0.8)
    expect(result.details).toBe("no violations found")
  })

  it("clamps an out-of-range judge score", async () => {
    setJudgeCallOverride(async () => ({ score: 5 as number, confidence: 0.5, reasoning: "out of range" }))

    const result = await safetyGrader("some agent output")

    expect(result.score).toBe(1.0)
  })
})

describe("rubricGrader failure handling", () => {
  afterEach(() => {
    setJudgeCallOverride(null)
  })

  it("returns a neutral score with zero confidence when the judge fails", async () => {
    setJudgeCallOverride(async () => {
      throw new Error("judge unavailable")
    })

    const result = await rubricGrader("some agent output")

    expect(result.score).toBe(0.5)
    expect(result.confidence).toBe(0)
  })
})
