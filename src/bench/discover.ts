/**
 * bench/discover — Load bench tasks from .aegis/bench/*.json.
 *
 * Amendment ΔG7: validates each task and continues on parse errors
 * so a single bad file cannot break the entire bench suite.
 */

import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createLogger } from "../cli/logger"
import type { BenchTask } from "./types"

const log = createLogger("bench")

export const BENCH_DIR = resolve(process.cwd(), ".aegis/bench")

const VALID_METRICS = new Set([
  "tests-pass",
  "lint-clean",
  "typecheck",
  "build",
  "custom-script",
  "manual",
])

function validateTask(t: unknown): t is BenchTask {
  if (!t || typeof t !== "object") return false
  const obj = t as Record<string, unknown>
  if (typeof obj.id !== "string" || !obj.id.trim()) return false
  if (typeof obj.name !== "string") return false
  if (typeof obj.goal !== "string" || !obj.goal.trim()) return false
  if (!Array.isArray(obj.criteria)) return false
  if (obj.criteria.length === 0) return false
  return obj.criteria.every((c) => typeof c === "string" && VALID_METRICS.has(c as string))
}

export function discoverBenchTasks(): BenchTask[] {
  let files: string[] = []
  try {
    files = readdirSync(BENCH_DIR).filter((f) => f.endsWith(".json"))
  } catch {
    return []
  }

  const valid: BenchTask[] = []
  for (const file of files) {
    const filePath = resolve(BENCH_DIR, file)
    try {
      const raw = readFileSync(filePath, "utf-8")
      const parsed = JSON.parse(raw)
      if (validateTask(parsed)) {
        valid.push(parsed)
      } else {
        log.warn(`Invalid bench task (skipped): ${file}`)
      }
    } catch (err) {
      log.warn(`Could not parse bench task (skipped): ${file}`, { error: String(err) })
    }
  }
  return valid.sort((a, b) => a.id.localeCompare(b.id))
}

export function getBenchTask(id: string): BenchTask | undefined {
  return discoverBenchTasks().find((t) => t.id === id)
}
