/**
 * cron/distillation — Self-improving runtime pipeline.
 *
 * The data flywheel that makes the system learn from every session:
 *
 *   1. Session completes → recorded in ExperienceStore
 *   2. Successful sessions → extract reusable skills (SkillCurator.proposeSkillFromRun)
 *   3. Failed sessions → cluster analysis → actionable insights
 *   4. Low-quality skills → pruned automatically
 *   5. Insights written to MEMORY.md for the agent to reference
 *
 * Can be run:
 *   - Manually via TUI: `distill`
 *   - On cron: `aegis cron add nightly-distill 1d "run distillation pipeline"`
 *   - After each agent session: via lifecycle hooks
 */

import { experienceStore, type ClusterInsight } from "../experience/store"
import { generateClusterReport, writeInsightsToMemory } from "../experience/cluster"
import { skillCurator } from "../skills/curator"
import { join } from "node:path"
import { createLogger } from "../cli/logger"

const log = createLogger("distillation")

// ── Types ─────────────────────────────────────────────────────────────

export interface DistillationResult {
  runId: string
  timestamp: string
  totalExperiences: number
  skillsExtracted: Array<{
    name: string
    confidence: number
    path: string
    description: string
  }>
  skillsPruned: number
  clusters: ClusterInsight[]
  insightsWritten: boolean
}

export interface DistillationConfig {
  /** Minimum repetitions of a pattern to extract as skill (default: 3) */
  minRepetitions?: number
  /** Minimum confidence to auto-save a skill (0-100, default: 70) */
  minConfidence?: number
  /** Maximum skills to extract per run (default: 5) */
  maxSkills?: number
  /** Prune skills below this success rate threshold (default: 0.3) */
  pruneThreshold?: number
  /** Whether to write insights to MEMORY.md (default: true) */
  writeMemory?: boolean
  /** Enable auto-approval of high-confidence skills (default: true) */
  autoApprove?: boolean
  /** Confidence threshold for auto-approval (0.0-1.0, default: 0.8, env: SKILL_AUTO_APPROVE_THRESHOLD) */
  autoApproveThreshold?: number
}

// ── Pipeline ──────────────────────────────────────────────────────────

/**
 * Run the full distillation pipeline.
 * This is the main entry point called from TUI commands, cron, or lifecycle hooks.
 */
export async function runDistillationPipeline(config: DistillationConfig = {}): Promise<DistillationResult> {
  const {
    minRepetitions = 3,
    minConfidence = 70,
    maxSkills = 5,
    pruneThreshold = 0.3,
    writeMemory = true,
    autoApprove = true,
    autoApproveThreshold,
  } = config

  // Set env var for extractor to pick up custom threshold
  if (autoApproveThreshold !== undefined) {
    process.env.SKILL_AUTO_APPROVE_THRESHOLD = String(autoApproveThreshold)
  }

  const runId = `distill-${Date.now().toString(36)}`
  const timestamp = new Date().toISOString()

  log.info(`Distillation pipeline ${runId} started`)

  // ── 1. Analyze session data ────────────────────────────────────────
  const stats = experienceStore.getStats()
  log.info(
    `Experience store: ${stats.totalExperiences} total, ${stats.successCount} successes, ${stats.failureCount} failures`,
  )

  // ── 2. Find skill candidates via SkillExtractor (with auto-approval) ──
  const { SkillExtractor } = await import("../improve/skill-extractor")
  const { skillReviewStore } = await import("../improve/skill-review")

  const extractor = new SkillExtractor(experienceStore)
  const candidates = extractor.extractCandidates(0.7, autoApprove)

  // Also check the old-style experienceStore candidates for backward compatibility
  const skillCandidates = experienceStore.findSkillCandidates(minRepetitions)
  log.info(`Found ${skillCandidates.length} legacy candidates, ${candidates.length} extracted via SkillExtractor`)

  const queueStats = skillReviewStore.getQueueStats()
  log.info(
    `Skill queue: ${queueStats.staged} staged, ${queueStats.autoApproved} auto-approved (avg confidence: ${(queueStats.avgConfidence * 100).toFixed(0)}%)`,
  )

  // Build skillsExtracted report from extractor results
  const skillsExtracted: DistillationResult["skillsExtracted"] = []
  for (const candidate of candidates) {
    if (candidate.status === "auto_approved" || candidate.status === "published") {
      const path = join(process.cwd(), "src", "skills", `auto-${candidate.name}.ts`)
      skillsExtracted.push({
        name: candidate.name,
        confidence: candidate.confidence,
        path,
        description: candidate.description.slice(0, 100),
      })
    }
  }

  // ── Also check old-style candidates (backward compat) ───────────────
  for (const candidate of skillCandidates.slice(0, maxSkills)) {
    if (candidate.confidence < minConfidence) {
      log.debug(`Skipping ${candidate.name}: confidence ${candidate.confidence} < ${minConfidence}`)
      continue
    }
    // Skip if already handled by SkillExtractor
    if (skillsExtracted.some((s) => s.name === candidate.name || s.description.includes(candidate.name))) continue

    try {
      const content = [
        "---",
        `name: ${candidate.name}`,
        `description: Auto-extracted from ${candidate.confidence}% confidence successful pattern`,
        `tags: [auto-extracted, workflow, ${candidate.steps.join(", ")}]`,
        "---",
        "",
        `# ${candidate.name}`,
        "",
        "## When to use",
        "",
        `Use this skill when: "${candidate.goal}"`,
        "",
        "## Steps",
        "",
        ...candidate.steps.map((step, i) => `${i + 1}. Execute \`${step}\` action`),
        "",
        "## Notes",
        "",
        "- Auto-extracted by distillation pipeline",
        `- Confidence: ${candidate.confidence}%`,
        `- Generated: ${timestamp}`,
        "",
      ].join("\n")

      const path = await skillCurator.saveProposedSkill(candidate.name, content)
      await skillCurator.recordUse(candidate.name, true, 100)

      skillsExtracted.push({
        name: candidate.name,
        confidence: candidate.confidence,
        path,
        description: candidate.goal.slice(0, 100),
      })

      log.info(`Extracted legacy skill: ${candidate.name} (${candidate.confidence}%)`)
    } catch (err: unknown) {
      log.warn(`Failed to extract skill ${candidate.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── 3. Prune low-quality skills ────────────────────────────────────
  const pruned = await skillCurator.pruneLowScorers(pruneThreshold)
  log.info(`Pruned ${pruned.length} low-quality skills`)

  // ── 4. Cluster failure analysis ────────────────────────────────────
  const report = generateClusterReport(2)
  log.info(`Found ${report.topClusters.length} failure clusters`)

  // ── 5. Write insights to MEMORY.md ─────────────────────────────────
  let insightsWritten = false
  if (writeMemory && (report.topClusters.length > 0 || skillsExtracted.length > 0)) {
    try {
      await writeInsightsToMemory()
      insightsWritten = true
      log.info("Wrote insights to MEMORY.md")
    } catch (err: unknown) {
      log.warn(`Failed to write insights to memory: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── 6. Record this distillation as an experience ───────────────────
  try {
    experienceStore.recordExperience({
      id: runId,
      project: process.cwd().split("/").pop() || "default",
      sessionId: runId,
      goal: "self-improvement distillation",
      agentType: "distillation",
      outcome: skillsExtracted.length > 0 ? "success" : "partial",
      reward: skillsExtracted.length / Math.max(1, maxSkills),
      actionCount: skillCandidates.length,
      startedAt: timestamp,
      completedAt: new Date().toISOString(),
      summary: `Extracted ${skillsExtracted.length} skills, pruned ${pruned.length}, found ${report.topClusters.length} failure clusters`,
      tags: ["distillation", "self-improvement"],
      metrics: JSON.stringify({
        totalExperiences: stats.totalExperiences,
        skillCandidatesFound: skillCandidates.length,
        skillsExtracted: skillsExtracted.length,
        skillsPruned: pruned.length,
        clusters: report.topClusters.length,
      }),
    })
  } catch (err: unknown) {
    log.warn(`Failed to record distillation experience: ${err instanceof Error ? err.message : String(err)}`)
  }

  log.info(`Distillation pipeline ${runId} complete`)

  return {
    runId,
    timestamp,
    totalExperiences: stats.totalExperiences,
    skillsExtracted,
    skillsPruned: pruned.length,
    clusters: report.topClusters,
    insightsWritten,
  }
}

// ── Lightweight hook: record a single session after it completes ────────

export interface SessionRecord {
  sessionId: string
  goal: string
  agentType: string
  outcome: "success" | "failed" | "reverted" | "partial"
  summary: string
  actionCount: number
  reward?: number
  tags?: string[]
}

/**
 * Quick hook to record an agent session into the experience store.
 * Call this from agent lifecycle hooks after a session completes.
 * Returns true if the session was successfully recorded.
 */
export function recordSessionToExperience(record: SessionRecord): boolean {
  try {
    experienceStore.recordExperience({
      id: `exp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      project: process.cwd().split("/").pop() || "default",
      sessionId: record.sessionId,
      goal: record.goal,
      agentType: record.agentType,
      outcome: record.outcome,
      reward: record.reward ?? (record.outcome === "success" ? 1.0 : record.outcome === "partial" ? 0.5 : 0.0),
      actionCount: record.actionCount,
      startedAt: new Date(Date.now() - 60_000).toISOString(), // approximate
      completedAt: new Date().toISOString(),
      summary: record.summary,
      tags: record.tags ?? [record.agentType],
      metrics: JSON.stringify({ recorded: true }),
    })
    log.info(`Session recorded: ${record.sessionId} (${record.outcome})`)
    return true
  } catch (err: unknown) {
    log.warn(`Failed to record session: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}
