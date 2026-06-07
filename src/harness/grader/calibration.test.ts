/**
 * Tests for judge calibration module
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, rmSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { tmpdir } from "node:os"
import { JudgeCalibration, createDefaultCalibrationSet } from "./calibration"

describe("JudgeCalibration", () => {
  const testDir = resolve(tmpdir(), `calibration-test-${Date.now()}`)
  let calibration: JudgeCalibration

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
    calibration = new JudgeCalibration(testDir)
  })

  afterEach(() => {
    try { rmSync(testDir, { recursive: true, force: true }) } catch {}
  })

  it("starts with empty calibration set", () => {
    expect(calibration.getCalibrationSet()).toEqual([])
  })

  it("adds and retrieves calibration examples", () => {
    calibration.addCalibrationExample({
      id: "test-1",
      task: "Add two numbers",
      agentOutput: "1 + 1 = 2",
      expectedScore: 1.0,
    })
    expect(calibration.getCalibrationSet()).toHaveLength(1)
    expect(calibration.getCalibrationSet()[0].id).toBe("test-1")
  })

  it("replaces existing example with same ID", () => {
    calibration.addCalibrationExample({
      id: "test-1",
      task: "Old",
      agentOutput: "",
      expectedScore: 0.5,
    })
    calibration.addCalibrationExample({
      id: "test-1",
      task: "New",
      agentOutput: "",
      expectedScore: 1.0,
    })
    expect(calibration.getCalibrationSet()).toHaveLength(1)
    expect(calibration.getCalibrationSet()[0].task).toBe("New")
  })

  it("persists to disk and reloads", () => {
    calibration.addCalibrationExample({
      id: "persist-1",
      task: "Test persistence",
      agentOutput: "output",
      expectedScore: 0.8,
    })

    const reloaded = new JudgeCalibration(testDir)
    expect(reloaded.getCalibrationSet()).toHaveLength(1)
    expect(reloaded.getCalibrationSet()[0].id).toBe("persist-1")
  })

  it("returns null for detectDrift with insufficient history", () => {
    expect(calibration.detectDrift()).toBeNull()
  })

  it("returns baseline confidence when no performance history", () => {
    expect(calibration.getCalibratedConfidence(0.9)).toBe(0.9)
  })

  it("calibrate returns valid result structure", async () => {
    calibration.addCalibrationExample({
      id: "cal-1",
      task: "Test",
      agentOutput: "output",
      expectedScore: 0.8,
    })

    const result = await calibration.calibrate(async () => 0.8)
    expect(result).toHaveProperty("accuracy")
    expect(result).toHaveProperty("meanError")
    expect(result).toHaveProperty("stdDev")
    expect(result).toHaveProperty("recommendations")
    expect(result.sampleSize).toBe(1)
  })

  it("calibrate returns 0 accuracy when no examples", async () => {
    const result = await calibration.calibrate(async () => 0.5)
    expect(result.sampleSize).toBe(0)
  })

  it("calibrate computes accuracy correctly", async () => {
    calibration.addCalibrationExamples([
      { id: "a", task: "a", agentOutput: "", expectedScore: 1.0 },
      { id: "b", task: "b", agentOutput: "", expectedScore: 0.0 },
      { id: "c", task: "c", agentOutput: "", expectedScore: 0.5 },
    ])
    // Judge returns: 0.95 (within 0.1 of 1.0 ✓), 0.1 (within 0.1 of 0.0 ✓), 0.6 (within 0.1 of 0.5 ✓)
    const result = await calibration.calibrate(async (task) => {
      if (task === "a") return 0.95
      if (task === "b") return 0.1
      return 0.6
    })
    expect(result.accuracy).toBeCloseTo(1.0, 2)
  })
})

describe("createDefaultCalibrationSet", () => {
  it("returns 6 default calibration examples", () => {
    const examples = createDefaultCalibrationSet()
    expect(examples).toHaveLength(6)
    expect(examples[0].id).toBe("cal-perfect")
    expect(examples[1].id).toBe("cal-partial")
    expect(examples[2].id).toBe("cal-wrong")
    expect(examples[3].id).toBe("cal-empty")
    expect(examples[4].id).toBe("cal-safe")
    expect(examples[5].id).toBe("cal-unsafe")
  })
})
