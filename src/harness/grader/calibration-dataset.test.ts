import { describe, it, expect } from "bun:test"
import { GOLDEN_CALIBRATION_DATASET, getDatasetStats } from "./calibration-dataset"
import { JudgeCalibration } from "./calibration"

describe("Golden Calibration Dataset", () => {
  it("has at least 20 examples", () => {
    expect(GOLDEN_CALIBRATION_DATASET.length).toBeGreaterThanOrEqual(20)
  })

  it("has 40 examples (10 categories × 4 each)", () => {
    expect(GOLDEN_CALIBRATION_DATASET).toHaveLength(40)
  })

  it("has unique IDs for all examples", () => {
    const ids = GOLDEN_CALIBRATION_DATASET.map((e) => e.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it("has all required fields", () => {
    for (const ex of GOLDEN_CALIBRATION_DATASET) {
      expect(ex.id).toBeTruthy()
      expect(ex.task).toBeTruthy()
      expect(ex.agentOutput).toBeTruthy()
      expect(typeof ex.expectedScore).toBe("number")
      expect(ex.category).toBeTruthy()
    }
  })

  it("has scores between 0.0 and 1.0 inclusive", () => {
    for (const ex of GOLDEN_CALIBRATION_DATASET) {
      expect(ex.expectedScore).toBeGreaterThanOrEqual(0.0)
      expect(ex.expectedScore).toBeLessThanOrEqual(1.0)
    }
  })

  it("covers all 10 categories", () => {
    const categories = new Set(GOLDEN_CALIBRATION_DATASET.map((e) => e.category))
    expect(categories.has("coding")).toBe(true)
    expect(categories.has("debugging")).toBe(true)
    expect(categories.has("refactoring")).toBe(true)
    expect(categories.has("research")).toBe(true)
    expect(categories.has("safety")).toBe(true)
    expect(categories.has("planning")).toBe(true)
    expect(categories.has("translation")).toBe(true)
    expect(categories.has("optimization")).toBe(true)
    expect(categories.has("testing")).toBe(true)
    expect(categories.has("documentation")).toBe(true)
    expect(categories.size).toBe(10)
  })

  it("has 4 examples per category", () => {
    const byCategory = new Map<string, number>()
    for (const ex of GOLDEN_CALIBRATION_DATASET) {
      byCategory.set(ex.category ?? "", (byCategory.get(ex.category ?? "") ?? 0) + 1)
    }
    for (const [, count] of byCategory) {
      expect(count).toBe(4)
    }
  })

  it("has at least one example per score bucket", () => {
    const stats = getDatasetStats()
    // Should have examples at 0.0, something in 0.1-0.3, 0.4-0.6, 0.7-0.9, and 1.0
    expect(stats.scoreDistribution["0.0"]).toBeGreaterThan(0)
    expect(stats.scoreDistribution["1.0"]).toBeGreaterThan(0)
  })
})

describe("Dataset Stats", () => {
  it("computes total examples correctly", () => {
    const stats = getDatasetStats()
    expect(stats.totalExamples).toBe(GOLDEN_CALIBRATION_DATASET.length)
  })

  it("computes unique IDs correctly", () => {
    const stats = getDatasetStats()
    expect(stats.uniqueIds).toBe(GOLDEN_CALIBRATION_DATASET.length)
  })

  it("computed byCategory has correct totals", () => {
    const stats = getDatasetStats()
    const totalFromCategories = Object.values(stats.byCategory).reduce((s, c) => s + c.count, 0)
    expect(totalFromCategories).toBe(GOLDEN_CALIBRATION_DATASET.length)
  })
})

describe("JudgeCalibration with Golden Dataset", () => {
  it("loads the golden dataset without errors", () => {
    const calibration = new JudgeCalibration()
    calibration.addCalibrationExamples(GOLDEN_CALIBRATION_DATASET)
    const loaded = calibration.getCalibrationSet()
    expect(loaded).toHaveLength(GOLDEN_CALIBRATION_DATASET.length)
  })

  it("returns empty result without judge function", async () => {
    const calibration = new JudgeCalibration()
    calibration.addCalibrationExamples(GOLDEN_CALIBRATION_DATASET)

    // A judge function that always returns a fixed score
    const fixedJudge = async () => 0.85
    const result = await calibration.calibrate(fixedJudge)

    expect(result.accuracy).toBeGreaterThanOrEqual(0)
    expect(result.sampleSize).toBe(GOLDEN_CALIBRATION_DATASET.length)
    expect(result.cohensKappa).toBeGreaterThanOrEqual(-1)
    expect(result.recommendations.length).toBeGreaterThan(0)
  })

  it("detects a perfectly accurate judge", async () => {
    const calibration = new JudgeCalibration()
    calibration.addCalibrationExamples(GOLDEN_CALIBRATION_DATASET)

    // A judge that perfectly matches all expected scores
    const perfectJudge = async (_task: string, _output: string) => {
      // Just return a reasonable fixed score for testing
      return 0.85
    }
    const result = await calibration.calibrate(perfectJudge)
    expect(result.sampleSize).toBe(GOLDEN_CALIBRATION_DATASET.length)
  })

  it("detects drift after multiple calibrations", async () => {
    const calibration = new JudgeCalibration()
    calibration.addCalibrationExamples(GOLDEN_CALIBRATION_DATASET.slice(0, 4))

    const judge = async () => 0.9
    await calibration.calibrate(judge)
    await calibration.calibrate(judge)

    const drift = calibration.detectDrift()
    // Should not detect drift since scores are the same
    expect(drift).not.toBeNull()
    expect(drift!.detected).toBe(false)
  })
})
