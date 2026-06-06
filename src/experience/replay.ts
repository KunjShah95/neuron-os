import { randomUUID } from "node:crypto"
import { mkdirSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { createLogger } from "../cli/logger"
import { experienceStore, type ExperienceStore } from "./store"
import type { Outcome } from "./store"
import type { Finding } from "../adversarial/types"
import { ratchetFindings } from "../adversarial/ratchet"

const log = createLogger("experience:replay")

export type RetryStrategy = "same" | "different-model" | "more-context"

export interface RetryResult {
  originalExperienceId: string
  goal: string
  originalOutcome: Outcome
  newOutcome: Outcome
  strategy: string
  durationMs: number
  newExperienceId?: string
  dryRun?: boolean
  skipped?: boolean
}

export interface SkillExtraction {
  name: string
  confidence: number
  goal: string
  steps: string[]
  skillFilePath?: string
}

export interface CycleResult {
  retries: RetryResult[]
  extractions: SkillExtraction[]
  totalDurationMs: number
}

export interface ReplayResult {
  experienceId: string
  retried: boolean
  newOutcome?: Outcome
  error?: string
}

export interface PipelineStats {
  totalRetriesRun: number
  totalRetriesSuccessful: number
  totalSkillsExtracted: number
  lastCycleRun?: string
  averageRetrySuccessRate: number
}

export class ExperienceReplay {
  private store: ExperienceStore

  constructor(store?: ExperienceStore) {
    this.store = store ?? experienceStore
  }

  async retryFailures(options: {
    maxRetries?: number
    strategy?: RetryStrategy
    dryRun?: boolean
  } = {}): Promise<RetryResult[]> {
    const maxRetries = options.maxRetries ?? 2
    const strategy = options.strategy ?? "same"
    const dryRun = options.dryRun ?? false

    const failures = this.store.getRecentFailures(50)
    const results: RetryResult[] = []

    for (const failure of failures) {
      const retryCount = this.countRetries(failure.id)
      if (retryCount >= maxRetries) {
        results.push({
          originalExperienceId: failure.id,
          goal: failure.goal,
          originalOutcome: "failed",
          newOutcome: "failed",
          strategy,
          durationMs: 0,
          skipped: true,
        })
        continue
      }

      const start = Date.now()
      const modifiedGoal = this.buildRetryGoal(failure.goal, strategy, retryCount + 1)
      const agentType = strategy === "different-model"
        ? this.alternateAgentType(failure.agentType)
        : failure.agentType

      if (dryRun) {
        results.push({
          originalExperienceId: failure.id,
          goal: modifiedGoal,
          originalOutcome: "failed",
          newOutcome: "failed",
          strategy,
          durationMs: Date.now() - start,
          dryRun: true,
        })
        continue
      }

      const newId = randomUUID()
      const tags = [...failure.tags, `retry:${failure.id}`, `strategy:${strategy}`]
      const metrics = JSON.stringify({
        retryOf: failure.id,
        strategy,
        retryNumber: retryCount + 1,
        originalGoal: failure.goal,
      })

      this.store.recordExperience({
        id: newId,
        project: failure.project,
        sessionId: failure.sessionId,
        goal: modifiedGoal,
        agentType,
        outcome: "failed",
        reward: 0,
        actionCount: 0,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        summary: `Retry #${retryCount + 1} of ${failure.id} [${strategy}]: ${failure.summary.slice(0, 100)}`,
        tags,
        metrics,
      })

      results.push({
        originalExperienceId: failure.id,
        goal: modifiedGoal,
        originalOutcome: "failed",
        newOutcome: "failed",
        strategy,
        durationMs: Date.now() - start,
        newExperienceId: newId,
      })

      log.info(`Created retry experience ${newId} for ${failure.id} (strategy: ${strategy})`)
    }

    return results
  }

  async extractSkills(options: {
    minConfidence?: number
    minRepetitions?: number
    dryRun?: boolean
    autoApply?: boolean
  } = {}): Promise<SkillExtraction[]> {
    const minConfidence = options.minConfidence ?? 70
    const minRepetitions = options.minRepetitions ?? 3
    const dryRun = options.dryRun ?? true
    const autoApply = options.autoApply ?? false

    const candidates = this.store.findSkillCandidates(minRepetitions)
    const extractions: SkillExtraction[] = []

    for (const candidate of candidates) {
      if (candidate.confidence < minConfidence) continue

      const extraction: SkillExtraction = {
        name: candidate.name,
        confidence: candidate.confidence,
        goal: candidate.goal,
        steps: candidate.steps,
      }

      if (autoApply && !dryRun) {
        const skillDir = join(process.cwd(), "skills", candidate.name)
        const skillPath = join(skillDir, "SKILL.md")
        if (!existsSync(skillDir)) mkdirSync(skillDir, { recursive: true })
        writeFileSync(skillPath, this.buildSkillContent(candidate), "utf-8")
        extraction.skillFilePath = skillPath
        log.info(`Auto-extracted skill → ${skillPath}`)
      }

      extractions.push(extraction)
    }

    return extractions
  }

  async runFullCycle(options: {
    retry?: boolean
    extract?: boolean
    ratchet?: boolean
  } = {}): Promise<CycleResult> {
    const opts = { retry: true, extract: true, ratchet: false, ...options }
    const startedAt = Date.now()

    const retries: RetryResult[] = []
    const extractions: SkillExtraction[] = []

    if (opts.retry) {
      const results = await this.retryFailures()
      retries.push(...results)
    }

    if (opts.extract) {
      const skills = await this.extractSkills({ autoApply: true })
      extractions.push(...skills)
    }

    if (opts.ratchet) {
      const persistent = retries.filter((r) => !r.dryRun && !r.skipped)
      if (persistent.length > 0) {
        await this.ratchetPersistentFailures(persistent)
      }
    }

    return {
      retries,
      extractions,
      totalDurationMs: Date.now() - startedAt,
    }
  }

  async replayExperience(experienceId: string, strategy?: string): Promise<ReplayResult> {
    const recent = this.store.listRecent(1000)
    const experience = recent.find((e) => e.id === experienceId)
    if (!experience) {
      return { experienceId, retried: false, error: "Experience not found" }
    }

    const retryStrategy = (strategy ?? "same") as RetryStrategy
    const retryCount = this.countRetries(experienceId)
    const modifiedGoal = this.buildRetryGoal(experience.goal, retryStrategy, retryCount + 1)

    const newId = randomUUID()
    const tags = [...experience.tags, `retry:${experienceId}`, `strategy:${retryStrategy}`]
    const metrics = JSON.stringify({
      retryOf: experienceId,
      strategy: retryStrategy,
      retryNumber: retryCount + 1,
      originalGoal: experience.goal,
    })

    this.store.recordExperience({
      id: newId,
      project: experience.project,
      sessionId: experience.sessionId,
      goal: modifiedGoal,
      agentType: experience.agentType,
      outcome: "failed",
      reward: 0,
      actionCount: 0,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      summary: `Replay of ${experienceId} [${retryStrategy}]: ${experience.summary.slice(0, 100)}`,
      tags,
      metrics,
    })

    log.info(`Replay experience ${newId} created for ${experienceId} (strategy: ${retryStrategy})`)

    return {
      experienceId,
      retried: true,
      newOutcome: "failed",
    }
  }

  getPipelineStats(): PipelineStats {
    const recent = this.store.listRecent(500)
    const retries = recent.filter((e) =>
      e.tags.some((t) => t.startsWith("retry:")),
    )
    const successes = retries.filter((e) => e.outcome === "success")
    const retriesRun = retries.length
    const retriesSuccessful = successes.length

    return {
      totalRetriesRun: retriesRun,
      totalRetriesSuccessful: retriesSuccessful,
      totalSkillsExtracted: 0,
      lastCycleRun: retries.length > 0 ? retries[0]?.startedAt : undefined,
      averageRetrySuccessRate: retriesRun > 0 ? Math.round((retriesSuccessful / retriesRun) * 100) : 0,
    }
  }

  private countRetries(experienceId: string): number {
    const recent = this.store.listRecent(500)
    return recent.filter((e) => e.tags.includes(`retry:${experienceId}`)).length
  }

  private buildRetryGoal(originalGoal: string, strategy: RetryStrategy, retryNumber: number): string {
    if (strategy === "more-context") {
      return `(Retry #${retryNumber}) ${originalGoal} — Use additional context and verify each step before proceeding.`
    }
    return `${originalGoal} (Retry #${retryNumber})`
  }

  private alternateAgentType(currentType: string): string {
    const types = ["build", "default", "read", "plan"]
    const idx = types.indexOf(currentType)
    const next = types[(idx + 1) % types.length]
    return next ?? "default"
  }

  private buildSkillContent(candidate: {
    name: string
    confidence: number
    goal: string
    steps: string[]
  }): string {
    return [
      `# ${candidate.name}`,
      "",
      "## Description",
      "",
      `Auto-extracted skill for: ${candidate.goal}`,
      "",
      `**Confidence:** ${candidate.confidence}%`,
      "",
      "## Steps",
      "",
      ...candidate.steps.map((s, i) => `${i + 1}. \`${s}\``),
      "",
      "## Trigger",
      "",
      `Use this skill when the task matches: "${candidate.goal.slice(0, 80)}"`,
      "",
    ].join("\n")
  }

  private async ratchetPersistentFailures(failures: RetryResult[]): Promise<void> {
    const findings: Finding[] = failures
      .filter((f) => f.newExperienceId)
      .map((f) => ({
        id: `persistent-${f.originalExperienceId}`,
        task_id: f.originalExperienceId,
        session_id: f.originalExperienceId,
        finding_type: "correctness" as const,
        severity: "medium" as const,
        description: `Persistent failure after retry: ${f.goal.slice(0, 100)}`,
        reproduction: f.goal,
        reproduction_verified: true,
        red_team_agent_id: "replay-pipeline",
        red_team_model: "auto",
        ts: Date.now(),
        ratcheted: false,
        incomplete: false,
        parse_error: false,
      }))

    if (findings.length > 0) {
      await ratchetFindings(findings)
    }
  }
}

export const experienceReplay = new ExperienceReplay()
