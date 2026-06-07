/**
 * src/harness/experiment.ts
 *
 * ExperimentManager — captures full configuration snapshots, git context,
 * and results for reproducible eval experiments.
 *
 * Experiments are stored as JSON files in .aegis/experiments/.
 * Each experiment records the complete config, git state, and results
 * so you can precisely reproduce or compare previous runs.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "node:fs"
import { resolve, join } from "node:path"
import { execSync } from "node:child_process"
import type { EvalReport, TestFilter, RunnerConfig } from "./types"
import type { BudgetConfig } from "./types"

// ── Types ─────────────────────────────────────────────────────────

export interface ExperimentConfig {
  suite: string
  model: string
  agentType: string
  systemPrompt?: string
  toolDefinitions?: string
  testFilter?: TestFilter
  runnerConfig: Partial<RunnerConfig>
  graderWeights?: Record<string, number>
  budgetConfig?: BudgetConfig
}

export interface GitSnapshot {
  commitSha: string
  branch: string
  message: string
  committedAt: string
  dirty: boolean
  diff?: string
}

export interface Experiment {
  id: string
  name: string
  description: string
  hypothesis: string
  config: ExperimentConfig
  git: GitSnapshot
  tags: string[]
  report?: EvalReport
  startedAt: string
  completedAt?: string
  status: "running" | "completed" | "failed" | "aborted"
  error?: string
}

export interface ExperimentComparison {
  scoreDelta: number
  passRateDelta: number
  configDiff: Record<string, { from: unknown; to: unknown }>
  gitDiff: { from: string; to: string }
}

// ── Experiment Manager ───────────────────────────────────────────

export class ExperimentManager {
  private experimentsDir: string

  constructor(baseDir?: string) {
    this.experimentsDir = baseDir ?? resolve(process.cwd(), ".aegis", "experiments")
    mkdirSync(this.experimentsDir, { recursive: true })
  }

  /**
   * Create a new experiment with a full config snapshot.
   */
  async create(name: string, config: ExperimentConfig, tags: string[] = []): Promise<Experiment> {
    const gitInfo = await this.captureGitSnapshot()

    const experiment: Experiment = {
      id: `exp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      description: config.suite,
      hypothesis: tags.join(", "),
      config,
      git: gitInfo,
      tags,
      startedAt: new Date().toISOString(),
      status: "running",
    }

    this.save(experiment)
    return experiment
  }

  /**
   * Mark an experiment as completed with its results.
   */
  complete(id: string, report: EvalReport): void {
    const exp = this.load(id)
    if (!exp) return
    exp.report = report
    exp.completedAt = new Date().toISOString()
    exp.status = "completed"
    this.save(exp)
  }

  /**
   * Mark an experiment as failed.
   */
  fail(id: string, error: string): void {
    const exp = this.load(id)
    if (!exp) return
    exp.error = error
    exp.completedAt = new Date().toISOString()
    exp.status = "failed"
    this.save(exp)
  }

  /**
   * Mark an experiment as aborted.
   */
  abort(id: string): void {
    const exp = this.load(id)
    if (!exp) return
    exp.status = "aborted"
    this.save(exp)
  }

  /**
   * Load an experiment by ID.
   */
  load(id: string): Experiment | null {
    try {
      const path = join(this.experimentsDir, `${id}.json`)
      if (!existsSync(path)) return null
      return JSON.parse(readFileSync(path, "utf-8")) as Experiment
    } catch {
      return null
    }
  }

  /**
   * List all experiments, optionally filtered by tags and date.
   */
  list(tags?: string[], since?: Date): Experiment[] {
    try {
      const files = readdirSync(this.experimentsDir).filter((f) => f.endsWith(".json"))
      const experiments: Experiment[] = []

      for (const file of files) {
        try {
          const exp = JSON.parse(readFileSync(join(this.experimentsDir, file), "utf-8")) as Experiment
          if (tags && tags.length > 0) {
            if (!tags.some((t) => exp.tags.includes(t))) continue
          }
          if (since && new Date(exp.startedAt) < since) continue
          experiments.push(exp)
        } catch {
          // Skip corrupted files
        }
      }

      experiments.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      return experiments
    } catch {
      return []
    }
  }

  /**
   * Compare two experiments side by side.
   */
  compare(idA: string, idB: string): ExperimentComparison {
    const a = this.load(idA)
    const b = this.load(idB)

    if (!a || !b) {
      throw new Error(`Experiment not found: ${!a ? idA : idB}`)
    }

    const scoreDelta = (b?.report?.avgScore ?? 0) - (a?.report?.avgScore ?? 0)

    const aPassRate = a.report && a.report.totalTests > 0 ? a.report.passed / a.report.totalTests : 0
    const bPassRate = b.report && b.report.totalTests > 0 ? b.report.passed / b.report.totalTests : 0
    const passRateDelta = bPassRate - aPassRate

    // Config diff
    const configDiff: Record<string, { from: unknown; to: unknown }> = {}
    for (const key of Object.keys({ ...a.config, ...b.config }) as (keyof ExperimentConfig)[]) {
      const fromVal = JSON.stringify(a.config[key])
      const toVal = JSON.stringify(b.config[key])
      if (fromVal !== toVal) {
        configDiff[key] = { from: a.config[key], to: b.config[key] }
      }
    }

    return {
      scoreDelta,
      passRateDelta,
      configDiff,
      gitDiff: { from: a.git.commitSha, to: b.git.commitSha },
    }
  }

  /**
   * Add tags to an existing experiment.
   */
  tag(id: string, newTags: string[]): void {
    const exp = this.load(id)
    if (!exp) return
    for (const tag of newTags) {
      if (!exp.tags.includes(tag)) {
        exp.tags.push(tag)
      }
    }
    this.save(exp)
  }

  /**
   * Delete an experiment.
   */
  delete(id: string): boolean {
    try {
      const path = join(this.experimentsDir, `${id}.json`)
      if (!existsSync(path)) return false
      unlinkSync(path)
      return true
    } catch {
      return false
    }
  }

  // ── Private ──────────────────────────────────────────────────

  private save(experiment: Experiment): void {
    const path = join(this.experimentsDir, `${experiment.id}.json`)
    writeFileSync(path, JSON.stringify(experiment, null, 2), "utf-8")
  }

  private async captureGitSnapshot(): Promise<GitSnapshot> {
    try {
      const sha = execSync("git rev-parse HEAD", { encoding: "utf-8", timeout: 5000 }).trim()
      const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8", timeout: 5000 }).trim()
      const message = execSync("git log -1 --pretty=%B", { encoding: "utf-8", timeout: 5000 }).trim()
      const dirty = execSync("git status --porcelain", { encoding: "utf-8", timeout: 5000 }).trim().length > 0
      let diff = ""
      if (dirty) {
        diff = execSync("git diff", { encoding: "utf-8", timeout: 5000 }).slice(0, 5000)
      }
      const committedAt = execSync("git log -1 --format=%cI", { encoding: "utf-8", timeout: 5000 }).trim()
      return { commitSha: sha.slice(0, 12), branch, message, committedAt, dirty, diff: diff || undefined }
    } catch {
      return {
        commitSha: "unknown",
        branch: "unknown",
        message: "",
        committedAt: new Date().toISOString(),
        dirty: false,
      }
    }
  }
}
