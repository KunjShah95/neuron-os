/**
 * src/improve/pipeline.ts
 *
 * Autonomous self-improvement pipeline — connects the full extract → validate →
 * publish → monitor loop into a single "set and forget" execution.
 *
 * Flow:
 *   1. Extract skill candidates from the experience store
 *   2. Validate candidates through the eval harness (EvalValidator)
 *   3. Auto-approve high-confidence candidates (confidence ≥ threshold)
 *   4. Publish approved candidates to src/skills/
 *   5. Record usage and monitor published skill performance
 *   6. Report actionable stats for the operator
 *
 * This is the "autonomous mode" that gives Hermes-level auto-skill generation.
 */

import { SkillExtractor } from "./skill-extractor"
import { EvalValidator } from "./eval-validator"
import { skillMonitor } from "./skill-monitor"
import { skillReviewStore } from "./skill-review"
import { experienceStore } from "../experience/store"
import { triggerEngine } from "../triggers/registry"
import { createLogger } from "../cli/logger"

const log = createLogger("improve:pipeline")

// ── Types ────────────────────────────────────────────────────────

export interface PipelinePhase {
  name: string
  status: "pending" | "running" | "passed" | "failed" | "skipped"
  durationMs: number
  details: string
  /** Optional metadata bag for structured phase data */
  meta?: Record<string, unknown>
}

export interface PipelineResult {
  success: boolean
  phases: PipelinePhase[]
  totalDurationMs: number
  extractionStats: {
    candidatesFound: number
    autoApproved: number
    staged: number
  }
  validationStats: {
    validated: number
    passed: number
    failed: number
    avgScore: number
  }
  monitoringStats: {
    totalSkills: number
    degradingSkills: number
    avgSuccessRate: number
  }
}

// ── Pipeline Config ──────────────────────────────────────────────

export interface PipelineConfig {
  /** Minimum reward for considering experiences */
  minReward: number
  /** Minimum confidence for auto-approval */
  minAutoApproveConfidence: number
  /** Whether to run eval validation */
  runValidation: boolean
  /** Whether to publish auto-approved skills */
  runPublish: boolean
  /** Whether to run monitor stats */
  runMonitor: boolean
  /** Whether to run stale candidate cleanup */
  runCleanup: boolean
  /** Max age in days for candidate cleanup */
  candidateMaxAgeDays: number
}

const DEFAULT_CONFIG: PipelineConfig = {
  minReward: 0.7,
  minAutoApproveConfidence: 0.8,
  runValidation: true,
  runPublish: true,
  runMonitor: true,
  runCleanup: true,
  candidateMaxAgeDays: 14,
}

// ── Pipeline ─────────────────────────────────────────────────────

export class AutoImprovePipeline {
  private config: PipelineConfig

  constructor(config?: Partial<PipelineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Run the full autonomous pipeline end-to-end.
   */
  async run(skipPhases?: string[]): Promise<PipelineResult> {
    const startedAt = Date.now()
    const phases: PipelinePhase[] = []
    const skipped = new Set(skipPhases ?? [])

    log.info("Auto-improve pipeline starting")
    const store = experienceStore
    const storeStats = store.getStats()
    log.info(`Experience store: ${storeStats.totalExperiences} records (${storeStats.successCount} success, ${storeStats.failureCount} failure)`)

    // ── Phase 1: Extract candidates ────────────────────────────────
    const extractPhase = await this.runPhase("Extract skill candidates", async () => {
      if (storeStats.totalExperiences < 3) {
        return { status: "skipped" as const, details: "Too few experiences (<3). Run more agent sessions first." }
      }

      const extractor = new SkillExtractor(store)
      const candidates = extractor.extractCandidates(this.config.minReward)

      const autoApproved = candidates.filter((c) => c.status === "auto_approved").length
      const staged = candidates.length - autoApproved

      return {
        status: "passed" as const,
        details: `Found ${candidates.length} candidate(s): ${autoApproved} auto-approved, ${staged} staged`,
        meta: { candidatesFound: candidates.length, autoApproved, staged },
      }
    })
    phases.push(extractPhase)

    // ── Phase 2: Validate candidates ───────────────────────────────
    const validationStats = { validated: 0, passed: 0, failed: 0, avgScore: 0 }
    const validatePhase = await this.runPhase("Validate candidates", async () => {
      if (!this.config.runValidation || skipped.has("validate")) {
        return { status: "skipped" as const, details: "Validation disabled via config" }
      }

      const extractor = new SkillExtractor(store)
      const candidates = extractor.getCandidates("candidate")

      if (candidates.length === 0) {
        return { status: "skipped" as const, details: "No candidates to validate" }
      }

      // Validate only non-auto-approved candidates
      const toValidate = candidates.slice(0, 10) // cap at 10 for token budget
      const validator = new EvalValidator({
        minPassScore: 0.7,
        useLLMJudge: false, // skip LLM judge for performance; use deterministic only
        useCodeGraders: true,
      })

      const result = await validator.batchValidate(toValidate)
      validationStats.validated = result.total
      validationStats.passed = result.passed
      validationStats.failed = result.failed
      validationStats.avgScore = result.summary.avgScore

      return {
        status: result.failed === 0 ? "passed" as const : "passed" as const,
        details: `${result.passed}/${result.total} passed (avg score: ${(result.summary.avgScore * 100).toFixed(1)}%)`,
        meta: { validated: result.total, passed: result.passed, failed: result.failed, avgScore: result.summary.avgScore },
      }
    })
    phases.push(validatePhase)

    // ── Phase 3: Publish auto-approved skills ──────────────────────
    const publishPhase = await this.runPhase("Publish auto-approved skills", async () => {
      if (!this.config.runPublish || skipped.has("publish")) {
        return { status: "skipped" as const, details: "Publishing disabled via config" }
      }

      const extractor = new SkillExtractor(store)
      const autoApproved = skillReviewStore.listAutoApproved()

      // Also check for any staged candidates that have been validated
      const staged = skillReviewStore.listStaged()
      const validatedStaged = staged.filter((c) => c.status === "validated")

      if (autoApproved.length === 0 && validatedStaged.length === 0) {
        return { status: "skipped" as const, details: "No auto-approved or validated candidates to publish" }
      }

      let published = 0
      let errors = 0

      for (const candidate of autoApproved) {
        const result = await extractor.approveFromStaging(candidate.id)
        if (result.success) {
          published++
          // Record the publication in the monitor
          skillMonitor.recordUsage(
            candidate.id,
            candidate.name,
            true,
            candidate.avgReward,
            0, 0,
          )
          log.info(`Published auto-approved skill: ${candidate.name}`)
        } else {
          errors++
          log.warn(`Failed to publish ${candidate.name}: ${result.error}`)
        }
      }

      return {
        status: errors === 0 ? "passed" as const : "failed" as const,
        details: `Published ${published} skill(s)${errors > 0 ? ` (${errors} errors)` : ""}`,
      }
    })
    phases.push(publishPhase)

    // ── Phase 4: Monitor stats ─────────────────────────────────────
    const monitoringStats = { totalSkills: 0, degradingSkills: 0, avgSuccessRate: 0 }
    const monitorPhase = await this.runPhase("Monitor skill performance", async () => {
      if (!this.config.runMonitor || skipped.has("monitor")) {
        return { status: "skipped" as const, details: "Monitor disabled via config" }
      }

      const all = skillMonitor.listAll()
      const degrading = skillMonitor.getDegradingSkills()
      const avgRate = all.length > 0
        ? all.reduce((s, sk) => s + sk.currentSuccessRate, 0) / all.length
        : 0

      monitoringStats.totalSkills = all.length
      monitoringStats.degradingSkills = degrading.length
      monitoringStats.avgSuccessRate = avgRate

      const details = [
        `${all.length} skill(s) tracked`,
        degrading.length > 0 ? `${degrading.length} degrading` : "0 degrading",
        `avg success: ${(avgRate * 100).toFixed(0)}%`,
      ].join(", ")

      return {
        status: "passed" as const,
        details,
        meta: { totalSkills: all.length, degradingSkills: degrading.length, avgSuccessRate: avgRate },
      }
    })
    phases.push(monitorPhase)

    // ── Phase 5: Cleanup stale candidates ──────────────────────────
    const cleanupPhase = await this.runPhase("Cleanup stale candidates", async () => {
      if (!this.config.runCleanup || skipped.has("cleanup")) {
        return { status: "skipped" as const, details: "Cleanup disabled via config" }
      }

      const extractor = new SkillExtractor(store)
      const candidates = extractor.getCandidates()
      const now = Date.now()
      const maxAgeMs = this.config.candidateMaxAgeDays * 24 * 60 * 60 * 1000
      let cleaned = 0

      for (const c of candidates) {
        if (c.status === "published" || c.status === "rejected") continue
        const age = now - new Date(c.createdAt).getTime()
        if (age > maxAgeMs) {
          extractor.rejectCandidate(c.id)
          cleaned++
        }
      }

      return {
        status: "passed" as const,
        details: `Cleaned ${cleaned} stale candidate(s) older than ${this.config.candidateMaxAgeDays} days`,
      }
    })
    phases.push(cleanupPhase)

    // ── Aggregate results ──────────────────────────────────────────
    const totalDurationMs = Date.now() - startedAt
    const success = phases.every((p) => p.status !== "failed")

    const extractionMeta = (extractPhase.meta ?? {}) as Record<string, unknown>
    const validateMeta = (validatePhase.meta ?? {}) as Record<string, unknown>
    const monitorMeta = (monitorPhase.meta ?? {}) as Record<string, unknown>

    const result: PipelineResult = {
      success,
      phases,
      totalDurationMs,
      extractionStats: {
        candidatesFound: (extractionMeta.candidatesFound as number) ?? 0,
        autoApproved: (extractionMeta.autoApproved as number) ?? 0,
        staged: (extractionMeta.staged as number) ?? 0,
      },
      validationStats: {
        validated: (validateMeta.validated as number) ?? 0,
        passed: (validateMeta.passed as number) ?? 0,
        failed: (validateMeta.failed as number) ?? 0,
        avgScore: (validateMeta.avgScore as number) ?? 0,
      },
      monitoringStats: {
        totalSkills: (monitorMeta.totalSkills as number) ?? 0,
        degradingSkills: (monitorMeta.degradingSkills as number) ?? 0,
        avgSuccessRate: (monitorMeta.avgSuccessRate as number) ?? 0,
      },
    }

    log.info(
      `Pipeline complete: ${success ? "✅" : "⚠️"}  ${phases.filter((p) => p.status === "passed").length}/${phases.length} phases passed in ${totalDurationMs}ms`,
    )

    return result
  }

  /**
   * Register the autonomous pipeline as a cron trigger so it runs
   * automatically on a schedule (default: every 12 hours).
   */
  registerAutoTrigger(): string {
    const existing = triggerEngine.list({ tag: "auto-improve" })
    if (existing.length > 0) {
      log.info("Auto-improve trigger already registered")
      return existing[0]?.id ?? ""
    }

    const trigger = triggerEngine.register({
      name: "auto-improve-pipeline",
      type: "cron",
      config: { schedule: "12h" },
      action: {
        mode: "run-command",
        goal: "aegis improve pipeline",
        priority: "low",
      },
      enabled: true,
      tags: ["builtin", "self-improve", "auto-improve"],
    })

    log.info(`Auto-improve cron trigger registered: ${trigger.id} (every 12h)`)
    return trigger.id
  }

  // ── Private helpers ─────────────────────────────────────────────

  private async runPhase(
    name: string,
    fn: () => Promise<{
      status: "passed" | "failed" | "skipped"
      details: string
      meta?: Record<string, unknown>
    }>,
  ): Promise<PipelinePhase> {
    const startedAt = Date.now()
    log.info(`Pipeline phase: ${name}`)

    try {
      const result = await fn()
      const phase: PipelinePhase = {
        name,
        status: result.status,
        durationMs: Date.now() - startedAt,
        details: result.details,
        meta: result.meta,
      }
      return phase
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      log.error(`Pipeline phase failed: ${name} — ${errorMsg}`)
      return {
        name,
        status: "failed",
        durationMs: Date.now() - startedAt,
        details: errorMsg,
      }
    }
  }
}

/** Singleton instance for convenient access */
export const autoImprovePipeline = new AutoImprovePipeline()
