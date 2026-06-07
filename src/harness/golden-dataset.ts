/**
 * src/harness/golden-dataset.ts
 *
 * Golden Dataset Manager — manages the Silver→Gold→Audit pipeline
 * for human-verified evaluation tasks.
 *
 * Phase 8: Manages task lifecycle from LLM-generated (Silver) through
 * human verification (Gold) to cross-model validation (Audit).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { createLogger } from "../cli/logger"
import type { TestCase, TestCategory, TestPriority } from "./types"

const log = createLogger("harness:golden-dataset")

// ── Types ────────────────────────────────────────────────────────

export type GoldenTaskStatus = "silver" | "gold" | "audited" | "archived"
export type GoldenDifficulty = "easy" | "medium" | "hard" | "expert"

export interface TrajectoryStep {
  action: string
  description: string
}

export interface CrossValidationResult {
  model: string
  passed: boolean
  score: number
  timestamp: string
  durationMs: number
  notes?: string
}

export interface GoldenTask extends TestCase {
  goldenVersion: number
  goldenAuthor: string
  goldenCreatedAt: string
  goldenVerifiedBy?: string
  goldenVerifiedAt?: string
  goldenStatus: GoldenTaskStatus
  goldenQualityScore?: number // 1-5 human-rated quality
  goldenDifficulty: GoldenDifficulty

  /** Acceptable solution trajectories */
  trajectories: TrajectoryStep[]
  /** Known failure modes to check */
  failureModes: string[]
  /** Cross-model validation results */
  crossValidation: CrossValidationResult[]
  /** Human review notes */
  reviewNotes?: string
}

export interface GoldenDatasetStats {
  total: number
  byStatus: Record<GoldenTaskStatus, number>
  byCategory: Record<string, number>
  byDifficulty: Record<GoldenDifficulty, number>
  avgQualityScore: number
  auditPassRate: number
}

export interface GoldenDatasetConfig {
  storageDir: string
  minQualityForAudit: number
  requireAuditForPublish: boolean
}

const DEFAULT_CONFIG: GoldenDatasetConfig = {
  storageDir: join(process.cwd(), "evals", "golden"),
  minQualityForAudit: 3.5,
  requireAuditForPublish: true,
}

// ── GoldenDatasetManager ────────────────────────────────────────

export class GoldenDatasetManager {
  private config: GoldenDatasetConfig
  private tasks: GoldenTask[] = []

  constructor(config?: Partial<GoldenDatasetConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.loadFromDisk()
  }

  // ── Task Lifecycle ───────────────────────────────────────────

  /**
   * Create a new Silver-grade task (LLM-generated, pending review).
   */
  createSilverTask(params: {
    name: string
    prompt: string
    category: TestCategory
    priority: TestPriority
    difficulty: GoldenDifficulty
    author: string
    tags?: string[]
    expectedPattern?: string
    trajectories?: TrajectoryStep[]
    failureModes?: string[]
  }): GoldenTask {
    const task: GoldenTask = {
      id: `golden-${params.category}-${Date.now().toString(36)}-${randomUUID().slice(0, 4)}`,
      name: params.name,
      prompt: params.prompt,
      category: params.category,
      priority: params.priority,
      tags: params.tags ?? [params.category, "golden", `difficulty:${params.difficulty}`],
      timeout:
        params.difficulty === "expert"
          ? 600000
          : params.difficulty === "hard"
            ? 300000
            : params.difficulty === "medium"
              ? 180000
              : 120000,

      goldenVersion: 1,
      goldenAuthor: params.author,
      goldenCreatedAt: new Date().toISOString(),
      goldenStatus: "silver",
      goldenDifficulty: params.difficulty,

      expected: params.expectedPattern ? { pattern: params.expectedPattern, minScore: 0.7 } : { minScore: 0.7 },

      trajectories: params.trajectories ?? [],
      failureModes: params.failureModes ?? [],
      crossValidation: [],

      setup: { commands: [], files: {} },
    }

    this.tasks.push(task)
    this.saveToDisk()
    log.info(`Created Silver task: ${task.id} (${params.name})`)
    return task
  }

  /**
   * Promote a task from Silver → Gold (human-verified).
   */
  promoteToGold(taskId: string, verifier: string, qualityScore: number, notes?: string): GoldenTask | null {
    const task = this.tasks.find((t) => t.id === taskId)
    if (!task) {
      log.warn(`Task not found: ${taskId}`)
      return null
    }

    task.goldenStatus = "gold"
    task.goldenVerifiedBy = verifier
    task.goldenVerifiedAt = new Date().toISOString()
    task.goldenQualityScore = Math.max(1, Math.min(5, qualityScore))
    task.reviewNotes = notes
    task.goldenVersion++

    this.saveToDisk()
    log.info(`Promoted to Gold: ${taskId} (quality: ${qualityScore})`)
    return task
  }

  /**
   * Add a cross-validation result for audit.
   */
  addCrossValidation(taskId: string, result: CrossValidationResult): GoldenTask | null {
    const task = this.tasks.find((t) => t.id === taskId)
    if (!task) return null

    const existing = task.crossValidation.findIndex((cv) => cv.model === result.model)
    if (existing >= 0) {
      task.crossValidation[existing] = result
    } else {
      task.crossValidation.push(result)
    }

    // Auto-audit: if 2+ models pass, promote to audited
    const passCount = task.crossValidation.filter((cv) => cv.passed).length
    if (passCount >= 2 && task.goldenStatus === "gold") {
      task.goldenStatus = "audited"
      log.info(`Task auto-audited: ${taskId} (${passCount}/${task.crossValidation.length} models pass)`)
    }

    this.saveToDisk()
    return task
  }

  /**
   * Archive a task (remove from active set).
   */
  archiveTask(taskId: string): boolean {
    const task = this.tasks.find((t) => t.id === taskId)
    if (!task) return false
    task.goldenStatus = "archived"
    this.saveToDisk()
    return true
  }

  // ── Queries ─────────────────────────────────────────────────

  /**
   * Get tasks filtered by status.
   */
  getTasks(status?: GoldenTaskStatus): GoldenTask[] {
    if (!status) return [...this.tasks]
    return this.tasks.filter((t) => t.goldenStatus === status)
  }

  /**
   * Get task by ID.
   */
  getTask(taskId: string): GoldenTask | undefined {
    return this.tasks.find((t) => t.id === taskId)
  }

  /**
   * Get tasks needing human review (Silver status).
   */
  getPendingReview(): GoldenTask[] {
    return this.tasks
      .filter((t) => t.goldenStatus === "silver")
      .sort((a, b) => new Date(a.goldenCreatedAt).getTime() - new Date(b.goldenCreatedAt).getTime())
  }

  /**
   * Get tasks ready for audit (Gold status, quality score above threshold).
   */
  getReadyForAudit(): GoldenTask[] {
    return this.tasks.filter(
      (t) => t.goldenStatus === "gold" && (t.goldenQualityScore ?? 0) >= this.config.minQualityForAudit,
    )
  }

  /**
   * Get audited tasks that are ready for production use.
   */
  getPublished(): GoldenTask[] {
    return this.tasks.filter((t) => t.goldenStatus === "audited" && t.crossValidation.length >= 2)
  }

  /**
   * Get dataset statistics.
   */
  getStats(): GoldenDatasetStats {
    const byStatus: Record<string, number> = {
      silver: 0,
      gold: 0,
      audited: 0,
      archived: 0,
    }
    const byCategory: Record<string, number> = {}
    const byDifficulty: Record<string, number> = {
      easy: 0,
      medium: 0,
      hard: 0,
      expert: 0,
    }

    let qualitySum = 0
    let qualityCount = 0
    let auditPasses = 0
    let auditTotal = 0

    for (const task of this.tasks) {
      byStatus[task.goldenStatus] = (byStatus[task.goldenStatus] ?? 0) + 1
      byCategory[task.category ?? "unknown"] = (byCategory[task.category ?? "unknown"] ?? 0) + 1
      byDifficulty[task.goldenDifficulty] = (byDifficulty[task.goldenDifficulty] ?? 0) + 1

      if (task.goldenQualityScore) {
        qualitySum += task.goldenQualityScore
        qualityCount++
      }

      if (task.crossValidation.length > 0) {
        auditPasses += task.crossValidation.filter((cv) => cv.passed).length
        auditTotal += task.crossValidation.length
      }
    }

    return {
      total: this.tasks.length,
      byStatus,
      byCategory,
      byDifficulty,
      avgQualityScore: qualityCount > 0 ? qualitySum / qualityCount : 0,
      auditPassRate: auditTotal > 0 ? auditPasses / auditTotal : 0,
    }
  }

  // ── Persistence ──────────────────────────────────────────────

  private loadFromDisk(): void {
    if (!existsSync(this.config.storageDir)) {
      this.tasks = []
      return
    }

    try {
      // Load individual task files
      const files = this.loadTaskFiles()
      this.tasks = files
      log.info(`Loaded ${this.tasks.length} golden tasks from disk`)
    } catch (err) {
      log.warn(`Failed to load golden tasks: ${err}`)
      this.tasks = []
    }
  }

  private loadTaskFiles(): GoldenTask[] {
    const tasks: GoldenTask[] = []

    const walkDir = (dir: string): void => {
      if (!existsSync(dir)) return

      const items = readdirSync(dir, { withFileTypes: true })

      for (const item of items) {
        const fullPath = join(dir, item.name)
        if (item.isDirectory()) {
          walkDir(fullPath)
        } else if (item.name.endsWith(".json")) {
          try {
            const raw = readFileSync(fullPath, "utf-8")
            const task = JSON.parse(raw) as GoldenTask
            if (task.id && task.name) tasks.push(task)
          } catch {
            log.warn(`Skipping invalid task file: ${fullPath}`)
          }
        }
      }
    }

    walkDir(this.config.storageDir)
    return tasks
  }

  private saveToDisk(): void {
    if (!existsSync(this.config.storageDir)) {
      mkdirSync(this.config.storageDir, { recursive: true })
    }

    // Write each task as an individual JSON file, organized by status
    for (const task of this.tasks) {
      const statusDir = join(this.config.storageDir, task.goldenStatus)
      if (!existsSync(statusDir)) {
        mkdirSync(statusDir, { recursive: true })
      }
      const filePath = join(statusDir, `${task.id}.json`)
      writeFileSync(filePath, JSON.stringify(task, null, 2), "utf-8")
    }

    // Write combined index
    const indexPath = join(this.config.storageDir, "index.json")
    writeFileSync(
      indexPath,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          total: this.tasks.length,
          tasks: this.tasks.map((t) => ({
            id: t.id,
            name: t.name,
            category: t.category,
            status: t.goldenStatus,
            difficulty: t.goldenDifficulty,
            quality: t.goldenQualityScore,
            verifiedBy: t.goldenVerifiedBy,
            createdAt: t.goldenCreatedAt,
          })),
        },
        null,
        2,
      ),
      "utf-8",
    )

    log.debug(`Saved ${this.tasks.length} golden tasks to ${this.config.storageDir}`)
  }
}

export const goldenDatasetManager = new GoldenDatasetManager()
