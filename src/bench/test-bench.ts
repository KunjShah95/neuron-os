import { loadHistory, appendRun, getLatestScores } from "./history"
import { mkdtempSync, rmSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

export async function testHistoryRoundTrip() {
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
  assert(loaded.runs.length === 1, `one run stored, got ${loaded.runs.length}`)
  assert(loaded.runs[0]!.runId === "bench-test-1", "run id preserved")

  rmSync(dir, { recursive: true, force: true })
}

export async function testHistoryAppends() {
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
  assert(loaded.runs.length === 2, `two runs, got ${loaded.runs.length}`)
  assert(loaded.runs[0]!.runId === "r1", "first is r1")
  assert(loaded.runs[1]!.runId === "r2", "second is r2")

  rmSync(dir, { recursive: true, force: true })
}

export async function testHistoryLatestScores() {
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
  assert(latest.get("alpha") === 0.9, `alpha latest 0.9, got ${latest.get("alpha")}`)
  assert(latest.get("beta") === 0.7, `beta latest 0.7, got ${latest.get("beta")}`)

  rmSync(dir, { recursive: true, force: true })
}

export async function testHistoryEmptyFile() {
  const dir = mkdtempSync(join(tmpdir(), "bench-hist-"))
  const histPath = join(dir, "history.json")

  const loaded = loadHistory(histPath)
  assert(loaded.version === 1, "default version 1")
  assert(loaded.runs.length === 0, "empty runs")

  rmSync(dir, { recursive: true, force: true })
}

if (import.meta.main) {
  await testHistoryRoundTrip()
  await testHistoryAppends()
  await testHistoryLatestScores()
  await testHistoryEmptyFile()
  console.log("bench history tests passed")
}
