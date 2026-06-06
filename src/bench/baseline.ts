import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { homedir } from "node:os"

export interface BenchmarkScore {
  taskId: string
  category: string
  name: string
  passed: boolean
  durationMs: number
  costUsd: number
  timestamp: number
  agentType: string
}

export interface BenchmarkBaseline {
  scores: Record<string, BenchmarkScore>
  createdAt: number
  updatedAt: number
  version: string
}

export interface Regression {
  taskId: string
  name: string
  previousPassed: boolean
  currentPassed: boolean
  previousDurationMs: number
  currentDurationMs: number
  previousCostUsd: number
  currentCostUsd: number
  regressed: boolean
}

export interface RegressionReport {
  totalTasks: number
  passed: number
  failed: number
  regressions: number
  threshold: number
  passedThreshold: boolean
  regressionsList: Regression[]
}

const BASELINE_VERSION = "1"

function defaultBaseline(): BenchmarkBaseline {
  return {
    scores: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: BASELINE_VERSION,
  }
}

export class BenchmarkBaselineManager {
  private baselinePath: string

  constructor(path?: string) {
    this.baselinePath = path ?? resolve(homedir(), ".aegis", "benchmark-baseline.json")
  }

  getBaselinePath(): string {
    return this.baselinePath
  }

  load(): BenchmarkBaseline {
    if (!existsSync(this.baselinePath)) return defaultBaseline()
    try {
      const raw = readFileSync(this.baselinePath, "utf-8")
      const parsed = JSON.parse(raw) as BenchmarkBaseline
      if (parsed.version !== BASELINE_VERSION) return defaultBaseline()
      return parsed
    } catch {
      return defaultBaseline()
    }
  }

  save(baseline: BenchmarkBaseline): void {
    baseline.updatedAt = Date.now()
    mkdirSync(dirname(this.baselinePath), { recursive: true })
    writeFileSync(this.baselinePath, JSON.stringify(baseline, null, 2))
  }

  compare(current: BenchmarkScore[], threshold: number = 10): RegressionReport {
    const baseline = this.load()
    const regressionsList: Regression[] = []

    for (const cur of current) {
      const prev = baseline.scores[cur.taskId]
      if (!prev) continue

      const regressed =
        (prev.passed && !cur.passed) ||
        (prev.passed && cur.passed && cur.durationMs > prev.durationMs * (1 + threshold / 100)) ||
        (prev.passed && cur.passed && cur.costUsd > prev.costUsd * (1 + threshold / 100))

      regressionsList.push({
        taskId: cur.taskId,
        name: cur.name,
        previousPassed: prev.passed,
        currentPassed: cur.passed,
        previousDurationMs: prev.durationMs,
        currentDurationMs: cur.durationMs,
        previousCostUsd: prev.costUsd,
        currentCostUsd: cur.costUsd,
        regressed,
      })
    }

    const totalTasks = current.length
    const passed = current.filter((s) => s.passed).length
    const failed = totalTasks - passed
    const regressions = regressionsList.filter((r) => r.regressed).length

    return {
      totalTasks,
      passed,
      failed,
      regressions,
      threshold,
      passedThreshold: regressions === 0,
      regressionsList,
    }
  }

  importFromFile(filePath: string): BenchmarkBaseline {
    const raw = readFileSync(filePath, "utf-8")
    const data = JSON.parse(raw)
    const baseline = defaultBaseline()
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item.taskId) {
          baseline.scores[item.taskId] = item as BenchmarkScore
        }
      }
    } else if (data.scores) {
      Object.assign(baseline.scores, data.scores)
    }
    return baseline
  }
}
