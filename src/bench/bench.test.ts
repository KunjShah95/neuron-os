import { describe, it, expect } from "bun:test"
import { loadHistory, appendRun, getLatestScores } from "./history"
import { mkdtempSync, rmSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("Bench Tests", () => {
  it("should history round trip", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bench-hist-"))
    mkdirSync(join(dir, ".aegis/bench"), { recursive: true })
    const histPath = join(dir, ".aegis/bench/history.json")

    const record = {
      runId: "bench-test-1",
      timestamp: new Date().toISOString(),
      tasks: [{ taskId: "t1", score: 1, passed: true, durationMs: 1000 }],
      aggregate: { passed: 1, total: 1, avgScore: 1 },
    }

    appendRun(record, histPath)
    const loaded = loadHistory(histPath)
    expect(loaded.runs.length === 1).toBe(true)
    expect(loaded.runs[0]!.runId === "bench-test-1").toBe(true)

    rmSync(dir, { recursive: true, force: true })
  })

  it("should history appends", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bench-hist-"))
    mkdirSync(join(dir, ".aegis/bench"), { recursive: true })
    const histPath = join(dir, ".aegis/bench/history.json")

    appendRun(
      {
        runId: "r1",
        timestamp: new Date().toISOString(),
        tasks: [{ taskId: "t1", score: 1, passed: true, durationMs: 100 }],
        aggregate: { passed: 1, total: 1, avgScore: 1 },
      },
      histPath,
    )
    appendRun(
      {
        runId: "r2",
        timestamp: new Date().toISOString(),
        tasks: [{ taskId: "t1", score: 0.5, passed: false, durationMs: 200 }],
        aggregate: { passed: 0, total: 1, avgScore: 0.5 },
      },
      histPath,
    )

    const loaded = loadHistory(histPath)
    expect(loaded.runs.length === 2).toBe(true)
    expect(loaded.runs[0]!.runId === "r1").toBe(true)
    expect(loaded.runs[1]!.runId === "r2").toBe(true)

    rmSync(dir, { recursive: true, force: true })
  })

  it("should history latest scores", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bench-hist-"))
    mkdirSync(join(dir, ".aegis/bench"), { recursive: true })
    const histPath = join(dir, ".aegis/bench/history.json")

    appendRun(
      {
        runId: "r1",
        timestamp: new Date().toISOString(),
        tasks: [
          { taskId: "alpha", score: 0.6, passed: false, durationMs: 100 },
          { taskId: "beta", score: 1, passed: true, durationMs: 200 },
        ],
        aggregate: { passed: 1, total: 2, avgScore: 0.8 },
      },
      histPath,
    )
    appendRun(
      {
        runId: "r2",
        timestamp: new Date().toISOString(),
        tasks: [
          { taskId: "alpha", score: 0.9, passed: true, durationMs: 100 },
          { taskId: "beta", score: 0.7, passed: true, durationMs: 200 },
        ],
        aggregate: { passed: 2, total: 2, avgScore: 0.8 },
      },
      histPath,
    )

    const latest = getLatestScores(histPath)
    expect(latest.get("alpha") === 0.9).toBe(true)
    expect(latest.get("beta") === 0.7).toBe(true)

    rmSync(dir, { recursive: true, force: true })
  })

  it("should history empty file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bench-hist-"))
    const histPath = join(dir, "history.json")

    const loaded = loadHistory(histPath)
    expect(loaded.version === 1).toBe(true)
    expect(loaded.runs.length === 0).toBe(true)

    rmSync(dir, { recursive: true, force: true })
  })
})
