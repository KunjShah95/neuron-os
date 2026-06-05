/**
 * bench/history — Read/write bench score history.
 *
 * Persists to .aegis/bench/history.json. Keeps the most recent 100 runs.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import type { BenchHistory, BenchRunRecord } from "./types"

const DEFAULT_PATH = resolve(process.cwd(), ".aegis/bench/history.json")
const MAX_RUNS = 100

export function loadHistory(path = DEFAULT_PATH): BenchHistory {
  if (!existsSync(path)) return { version: 1, runs: [] }
  try {
    const raw = readFileSync(path, "utf-8")
    const parsed = JSON.parse(raw) as BenchHistory
    if (parsed.version !== 1 || !Array.isArray(parsed.runs)) {
      return { version: 1, runs: [] }
    }
    return parsed
  } catch {
    return { version: 1, runs: [] }
  }
}

export function appendRun(record: BenchRunRecord, path = DEFAULT_PATH): void {
  const hist = loadHistory(path)
  hist.runs.push(record)
  if (hist.runs.length > MAX_RUNS) {
    hist.runs = hist.runs.slice(-MAX_RUNS)
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(hist, null, 2))
}

export function getLatestScores(path = DEFAULT_PATH): Map<string, number> {
  const hist = loadHistory(path)
  const map = new Map<string, number>()
  for (const run of hist.runs) {
    for (const task of run.tasks) {
      map.set(task.taskId, task.score)
    }
  }
  return map
}
