/**
 * experience/store — SQLite-backed experience replay buffer.
 *
 * Stores every agent trajectory (goal → actions → outcome) so the system
 * can learn from its history. This is the foundation of the self-improving
 * data flywheel: distill skills from successes, cluster failures for insights.
 *
 * Schema:
 *   experiences  — one row per agent run (goal, outcome, reward, summary)
 *   experience_actions — individual action steps within a run (ordered)
 *
 * Integration points:
 * - AgentEngine hooks record each chat/action cycle
 * - AgentToolExecutor records staged mutations
 * - SkillCurator reads successful experiences to propose new skills
 * - Cluster analyzer reads failed experiences to surface pain points
 */

import { Database } from "bun:sqlite"
import { join } from "node:path"
import { mkdirSync, existsSync } from "node:fs"
import { createLogger } from "../cli/logger"
import { computeEmbedding, cosineSimilarity } from "../memory/embedding"

const log = createLogger("experience")

// ── Types ─────────────────────────────────────────────────────────────

export type Outcome = "success" | "failed" | "reverted" | "partial"

export interface ExperienceRecord {
  id: string
  project: string
  sessionId: string
  goal: string
  agentType: string
  outcome: Outcome
  reward: number
  actionCount: number
  /** ISO timestamp */
  startedAt: string
  /** ISO timestamp */
  completedAt: string
  /** Free-text summary of what happened */
  summary: string
  /** Tags for categorization (e.g., ["bug-fix", "feature", "refactor"]) */
  tags: string[]
  /** JSON string of metrics (token count, duration, etc.) */
  metrics: string
}

export interface ExperienceAction {
  id: number
  experienceId: string
  stepIndex: number
  actionType: string
  description: string
  details: string
  outcome: string
  timestamp: string
}

export interface ClusterInsight {
  id: string
  clusterKey: string
  count: number
  successRate: number
  commonFailures: Array<{ pattern: string; count: number }>
  topSuggestions: string[]
  lastObserved: string
}

// ── ExperienceStore ───────────────────────────────────────────────────

export class ExperienceStore {
  private db: Database
  private initialized = false

  constructor(project?: string) {
    const dataDir = project
      ? join(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "projects", project)
      : join(process.cwd(), "data")
    const dir = join(dataDir, "experience")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.db = new Database(join(dir, "experience.db"))
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec("PRAGMA synchronous = NORMAL")
    this.init()
  }

  private init(): void {
    if (this.initialized) return

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS experiences (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL DEFAULT '',
        session_id TEXT NOT NULL,
        goal TEXT NOT NULL,
        agent_type TEXT NOT NULL DEFAULT 'default',
        outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failed', 'reverted', 'partial')),
        reward REAL NOT NULL DEFAULT 0.0,
        action_count INTEGER NOT NULL DEFAULT 0,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        metrics TEXT NOT NULL DEFAULT '{}'
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS experience_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        experience_id TEXT NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
        step_index INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        details TEXT NOT NULL DEFAULT '',
        outcome TEXT NOT NULL DEFAULT 'unknown',
        timestamp TEXT NOT NULL
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_experience_project
      ON experiences(project, started_at DESC)
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_experience_outcome
      ON experiences(outcome, started_at DESC)
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_experience_actions_parent
      ON experience_actions(experience_id, step_index)
    `)

    this.initialized = true
    log.info("Experience store initialized")
  }

  // ── Record ──────────────────────────────────────────────────────────

  recordExperience(record: ExperienceRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO experiences (id, project, session_id, goal, agent_type, outcome, reward, action_count, started_at, completed_at, summary, tags, metrics)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      record.id,
      record.project,
      record.sessionId,
      record.goal,
      record.agentType,
      record.outcome,
      record.reward,
      record.actionCount,
      record.startedAt,
      record.completedAt,
      record.summary,
      JSON.stringify(record.tags),
      record.metrics,
    )
  }

  addAction(action: Omit<ExperienceAction, "id">): void {
    const stmt = this.db.prepare(`
      INSERT INTO experience_actions (experience_id, step_index, action_type, description, details, outcome, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      action.experienceId,
      action.stepIndex,
      action.actionType,
      action.description,
      action.details,
      action.outcome,
      action.timestamp,
    )
  }

  // ── Query ───────────────────────────────────────────────────────────

  listRecent(limit = 20, project?: string): ExperienceRecord[] {
    const sql = project
      ? "SELECT * FROM experiences WHERE project = ? ORDER BY started_at DESC LIMIT ?"
      : "SELECT * FROM experiences ORDER BY started_at DESC LIMIT ?"

    const rows = project
      ? (this.db.prepare(sql).all(project, limit) as Record<string, unknown>[])
      : (this.db.prepare(sql).all(limit) as Record<string, unknown>[])

    return rows.map((r) => this.rowToExperience(r))
  }

  getByOutcome(outcome: Outcome, limit = 50): ExperienceRecord[] {
    const rows = this.db.prepare(
      "SELECT * FROM experiences WHERE outcome = ? ORDER BY started_at DESC LIMIT ?",
    ).all(outcome, limit) as Record<string, unknown>[]
    return rows.map((r) => this.rowToExperience(r))
  }

  getRecentFailures(limit = 20): ExperienceRecord[] {
    return this.getByOutcome("failed", limit)
  }

  getRecentSuccesses(limit = 20): ExperienceRecord[] {
    return this.getByOutcome("success", limit)
  }

  /**
   * Search experiences by goal similarity. Loads the most recent 200
   * candidates, embeds the query + each goal+summary, ranks by cosine
   * similarity weighted by outcome and reward.
   *
   * Sufficient until the buffer exceeds ~10k rows. Beyond that, swap
   * in a vector index (sqlite-vss or external).
   */
  searchByGoalSimilarity(
    query: string,
    limit = 5,
    project?: string,
  ): Array<ExperienceRecord & { similarity: number }> {
    const candidates = this.listRecent(200, project)
    if (candidates.length === 0) return []

    const queryEmbed = computeEmbedding(query)

    const scored = candidates
      .map((record) => {
        const text = `${record.goal} ${record.summary}`.trim()
        const sim = cosineSimilarity(queryEmbed, computeEmbedding(text))
        // Outcome boost: success gets 1.2, partial 0.9, failed 0.8, reverted 0.7
        const outcomeBoost =
          record.outcome === "success" ? 1.2 :
          record.outcome === "partial" ? 0.9 :
          record.outcome === "failed" ? 0.8 :
          0.7 // reverted
        // Reward boost: rewards above 0 get a 0.5–1.0 multiplier
        const rewardBoost = 0.5 + Math.max(0, Math.min(1, record.reward)) * 0.5
        const adjusted = sim * outcomeBoost * rewardBoost
        return { record, similarity: adjusted }
      })
      .filter((r) => r.similarity >= 0.15)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)

    return scored.map((r) => ({ ...r.record, similarity: r.similarity }))
  }

  getActionsForExperience(id: string): ExperienceAction[] {
    const rows = this.db.prepare(
      "SELECT * FROM experience_actions WHERE experience_id = ? ORDER BY step_index ASC",
    ).all(id) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as number,
      experienceId: r.experience_id as string,
      stepIndex: r.step_index as number,
      actionType: r.action_type as string,
      description: r.description as string,
      details: r.details as string,
      outcome: r.outcome as string,
      timestamp: r.timestamp as string,
    }))
  }

  getStats(): {
    totalExperiences: number
    successCount: number
    failureCount: number
    revertedCount: number
    avgReward: number
    totalActions: number
  } {
    const totals = this.db.prepare("SELECT COUNT(*) as c FROM experiences").get() as { c: number }
    const successes = this.db.prepare("SELECT COUNT(*) as c FROM experiences WHERE outcome = 'success'").get() as { c: number }
    const failures = this.db.prepare("SELECT COUNT(*) as c FROM experiences WHERE outcome = 'failed'").get() as { c: number }
    const reverteds = this.db.prepare("SELECT COUNT(*) as c FROM experiences WHERE outcome = 'reverted'").get() as { c: number }
    const avgReward = this.db.prepare("SELECT COALESCE(AVG(reward), 0) as r FROM experiences").get() as { r: number }
    const actions = this.db.prepare("SELECT COUNT(*) as c FROM experience_actions").get() as { c: number }

    return {
      totalExperiences: totals.c,
      successCount: successes.c,
      failureCount: failures.c,
      revertedCount: reverteds.c,
      avgReward: avgReward.r,
      totalActions: actions.c,
    }
  }

  // ── Cluster Insights ───────────────────────────────────────────────

  /**
   * Analyze recent failures and group them by common patterns.
   * Returns actionable insights for the roadmap.
   */
  computeClusterInsights(minClusterSize = 2): ClusterInsight[] {
    const failures = this.getRecentFailures(100)
    if (failures.length < minClusterSize) return []

    const clusters = new Map<string, { count: number; failures: typeof failures; lastSeen: string }>()

    for (const f of failures) {
      // Extract cluster key from summary: look for error-like patterns
      const key = this.extractClusterKey(f.summary)
      const existing = clusters.get(key) || { count: 0, failures: [], lastSeen: "" }
      existing.count++
      existing.failures.push(f)
      if (f.completedAt > existing.lastSeen) existing.lastSeen = f.completedAt
      clusters.set(key, existing)
    }

    const insights: ClusterInsight[] = []
    let id = 0

    for (const [clusterKey, data] of clusters) {
      if (data.count < minClusterSize) continue
      id++

      // Find common failure patterns in actions
      const patternCounts = new Map<string, number>()
      for (const f of data.failures) {
        const actions = this.getActionsForExperience(f.id)
        for (const a of actions) {
          if (a.outcome === "error" || a.outcome === "failed") {
            patternCounts.set(a.actionType, (patternCounts.get(a.actionType) ?? 0) + 1)
          }
        }
      }

      const commonFailures = [...patternCounts.entries()]
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([pattern, count]) => ({ pattern, count }))

      insights.push({
        id: `cluster-${id}`,
        clusterKey,
        count: data.count,
        successRate: 0,
        commonFailures,
        topSuggestions: this.suggestImprovements(clusterKey, commonFailures),
        lastObserved: data.lastSeen,
      })
    }

    return insights.sort((a, b) => b.count - a.count)
  }

  private extractClusterKey(summary: string): string {
    // Look for error messages, failure indicators
    const errorPatterns = [
      /Error:\s*([^.\n]+)/i,
      /Failed:\s*([^.\n]+)/i,
      /Cannot\s+(.+)/i,
      /not found/i,
      /timeout/i,
      /permission denied/i,
      /already exists/i,
    ]

    for (const pat of errorPatterns) {
      const match = summary.match(pat)
      if (match) return match[0].slice(0, 80)
    }

    // Fall back to first meaningful segment
    const lines = summary.split("\n").filter(Boolean)
    return lines[0]?.slice(0, 80) || "unknown"
  }

  private suggestImprovements(clusterKey: string, failures: Array<{ pattern: string; count: number }>): string[] {
    const suggestions: string[] = []

    if (clusterKey.toLowerCase().includes("not found")) {
      suggestions.push("Add automatic file creation before modification operations")
    }
    if (clusterKey.toLowerCase().includes("timeout")) {
      suggestions.push("Increase timeout threshold or add retry with exponential backoff")
    }
    if (clusterKey.toLowerCase().includes("permission")) {
      suggestions.push("Add chmod fallback or check permissions before operations")
    }
    if (clusterKey.toLowerCase().includes("already exists")) {
      suggestions.push("Add upsert semantics to file creation operations")
    }
    if (failures.some((f) => f.pattern === "tool_execute")) {
      suggestions.push("Add shell command validation and safe-fallback for unknown commands")
    }
    if (failures.some((f) => f.pattern === "file_modify")) {
      suggestions.push("Improve file read before write — ensure agent always reads the latest content")
    }

    if (suggestions.length === 0) {
      suggestions.push("Review agent prompts for this failure pattern")
    }

    return suggestions
  }

  // ── Skill Extraction ───────────────────────────────────────────────

  /**
   * Find repetitive successful patterns that could be extracted as skills.
   * Returns tuples of (skillName, confidence, description).
   */
  findSkillCandidates(minRepetitions = 3): Array<{ name: string; confidence: number; steps: string[]; goal: string }> {
    const successes = this.getRecentSuccesses(200)

    // Group by goal similarity
    const goalGroups = new Map<string, typeof successes>()
    for (const s of successes) {
      const key = this.normalizeGoal(s.goal)
      const group = goalGroups.get(key) || []
      group.push(s)
      goalGroups.set(key, group)
    }

    const candidates: Array<{ name: string; confidence: number; steps: string[]; goal: string }> = []

    for (const [normalized, group] of goalGroups) {
      if (group.length < minRepetitions) continue

      // Extract common action patterns across all runs in this group
      const actionPatterns = new Map<string, number>()
      let totalActions = 0

      for (const exp of group) {
        const actions = this.getActionsForExperience(exp.id)
        totalActions += actions.length
        for (const a of actions) {
          actionPatterns.set(a.actionType, (actionPatterns.get(a.actionType) ?? 0) + 1)
        }
      }

      const avgActions = totalActions / group.length
      const successRate = group.length / (group.length + this.getFailuresForGoal(normalized))

      // High success rate + consistent pattern = good skill candidate
      if (successRate > 0.7 && avgActions <= 5) {
        const name = normalized
          .replace(/[^a-z0-9 ]/gi, "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "-")
          .slice(0, 40) || `auto-skill-${Date.now().toString(36)}`

        const steps = [...actionPatterns.entries()]
          .sort(([, a], [, b]) => b - a)
          .map(([type]) => type)

        candidates.push({
          name: `auto-${name}`,
          confidence: Math.round(successRate * 100),
          steps,
          goal: group[0]?.goal || "",
        })
      }
    }

    return candidates.sort((a, b) => b.confidence - a.confidence)
  }

  private normalizeGoal(goal: string): string {
    return goal
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60)
  }

  private getFailuresForGoal(normalized: string): number {
    const all = this.db.prepare(
      "SELECT goal, outcome FROM experiences WHERE outcome = 'failed'",
    ).all() as { goal: string; outcome: string }[]
    return all.filter((e) => this.normalizeGoal(e.goal) === normalized).length
  }

  // ── Cleanup ─────────────────────────────────────────────────────────

  close(): void {
    this.db.close()
    log.info("Experience store closed")
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private rowToExperience(row: Record<string, unknown>): ExperienceRecord {
    return {
      id: row.id as string,
      project: row.project as string,
      sessionId: row.session_id as string,
      goal: row.goal as string,
      agentType: row.agent_type as string,
      outcome: row.outcome as Outcome,
      reward: row.reward as number,
      actionCount: row.action_count as number,
      startedAt: row.started_at as string,
      completedAt: row.completed_at as string,
      summary: row.summary as string,
      tags: JSON.parse((row.tags as string) || "[]"),
      metrics: (row.metrics as string) || "{}",
    }
  }
}

/** Singleton instance */
export const experienceStore = new ExperienceStore()
