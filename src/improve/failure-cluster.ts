import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { createLogger } from "../cli/logger"
import { ExperienceStore, type ExperienceRecord } from "../experience/store"
import { computeEmbedding, cosineSimilarity } from "../memory/embedding"
import type { FailureCluster } from "./types"

const log = createLogger("improve:failure-cluster")

const CLUSTERS_PATH = join(process.cwd(), ".aegis", "failure-clusters.json")

const SIMILARITY_THRESHOLD = 0.6

export class FailureClusterer {
  private store: ExperienceStore
  private clusters: FailureCluster[] = []

  constructor(store?: ExperienceStore) {
    this.store = store ?? new ExperienceStore()
    this.loadClusters()
  }

  cluster(minClusterSize = 2): FailureCluster[] {
    const failures = this.store.getRecentFailures(200)
    if (failures.length < minClusterSize) return []

    const newClusters = this.buildClusters(failures, minClusterSize)

    const merged = this.mergeWithExisting(newClusters)
    this.clusters = merged
    this.saveClusters()
    log.info(`Clustered ${failures.length} failures into ${newClusters.length} clusters (${merged.length} total)`)

    return newClusters
  }

  getClusters(severity?: FailureCluster["severity"]): FailureCluster[] {
    if (!severity) return [...this.clusters]
    return this.clusters.filter((c) => c.severity === severity)
  }

  async generateFix(clusterId: string): Promise<string> {
    const cluster = this.clusters.find((c) => c.id === clusterId)
    if (!cluster) return `Cluster ${clusterId} not found`

    const experiences = cluster.experiences
      .map((eid) => {
        const recent = this.store.listRecent(1000)
        return recent.find((e) => e.id === eid)
      })
      .filter(Boolean) as ExperienceRecord[]

    if (experiences.length === 0) return "No experiences found for this cluster"

    const summaries = experiences.map((e) => e.summary).filter(Boolean)
    const commonErrors = this.findCommonErrorPatterns(summaries)

    let fix = `# Fix for: ${cluster.name}\n\n`
    fix += `## Common Pattern\n\n${cluster.commonPattern}\n\n`
    fix += `## Suggested Fix\n\n${cluster.suggestedFix}\n\n`

    if (commonErrors.length > 0) {
      fix += `## Observed Error Patterns\n\n`
      for (const err of commonErrors.slice(0, 5)) {
        fix += `- ${err}\n`
      }
      fix += "\n"
    }

    fix += `## Affected Experiences (${experiences.length})\n\n`
    for (const exp of experiences.slice(0, 10)) {
      fix += `- ${exp.id.slice(0, 8)}: ${exp.goal.slice(0, 60)}\n`
    }

    return fix
  }

  async autoRetryCluster(clusterId: string): Promise<{ retried: number; succeeded: number }> {
    const cluster = this.clusters.find((c) => c.id === clusterId)
    if (!cluster) return { retried: 0, succeeded: 0 }

    const allExperiences = this.store.listRecent(1000)
    const toRetry = cluster.experiences
      .map((eid) => allExperiences.find((e) => e.id === eid))
      .filter(Boolean) as ExperienceRecord[]

    let retried = 0
    const succeeded = 0

    for (const exp of toRetry) {
      const modifiedGoal = `(Retry cluster: ${cluster.name}) ${exp.goal} — ${cluster.suggestedFix}`
      const newId = `retry-${randomUUID().slice(0, 8)}`

      this.store.recordExperience({
        id: newId,
        project: exp.project,
        sessionId: exp.sessionId,
        goal: modifiedGoal,
        agentType: exp.agentType,
        outcome: "failed",
        reward: 0,
        actionCount: 0,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        summary: `Auto-retry of ${exp.id} with fix: ${cluster.suggestedFix.slice(0, 100)}`,
        tags: [...exp.tags, `retry:${cluster.id}`, `cluster:${cluster.name}`],
        metrics: JSON.stringify({
          retryOf: exp.id,
          clusterId: cluster.id,
          suggestedFix: cluster.suggestedFix,
        }),
      })

      retried++
      log.info(`Auto-retry experience ${newId} created for ${exp.id} in cluster ${cluster.name}`)
    }

    return { retried, succeeded }
  }

  getStats(): { totalClusters: number; totalFailures: number; avgSeverity: string } {
    const total = this.clusters.length
    const totalFailures = this.clusters.reduce((s, c) => s + c.count, 0)
    const severityValues: FailureCluster["severity"][] = ["low", "medium", "high", "critical"]
    const avgIdx = total > 0
      ? Math.round(this.clusters.reduce((s, c) => s + severityValues.indexOf(c.severity), 0) / total)
      : 0
    return {
      totalClusters: total,
      totalFailures,
      avgSeverity: severityValues[avgIdx] ?? "low",
    }
  }

  private buildClusters(failures: ExperienceRecord[], minClusterSize: number): FailureCluster[] {
    const clusters: FailureCluster[] = []
    const assigned = new Set<string>()

    for (const f of failures) {
      if (assigned.has(f.id)) continue
      const members: ExperienceRecord[] = [f]
      assigned.add(f.id)

      const fEmb = computeEmbedding(`${f.goal} ${f.summary}`)

      for (const other of failures) {
        if (assigned.has(other.id)) continue
        const tagOverlap = f.tags.some((t) => other.tags.includes(t))
        const otherEmb = computeEmbedding(`${other.goal} ${other.summary}`)
        const sim = cosineSimilarity(fEmb, otherEmb)

        if (sim >= SIMILARITY_THRESHOLD || tagOverlap) {
          members.push(other)
          assigned.add(other.id)
        }
      }

      if (members.length < minClusterSize) continue

      const cluster = this.buildClusterFromMembers(members)
      clusters.push(cluster)
    }

    return clusters.sort((a, b) => b.count - a.count)
  }

  private buildClusterFromMembers(members: ExperienceRecord[]): FailureCluster {
    const summaries = members.map((e) => e.summary)
    const commonPattern = this.extractCommonPattern(summaries)
    const suggestedFix = this.suggestFix(commonPattern, members)
    const severity = this.calculateSeverity(members)

    const goalWords = members[0]?.goal ?? ""
    const name = goalWords
      .replace(/[^a-z0-9 ]/gi, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .slice(0, 30) || `failure-cluster-${Date.now().toString(36)}`

    return {
      id: `fc-${randomUUID().slice(0, 8)}`,
      name,
      description: commonPattern.slice(0, 150),
      experiences: members.map((e) => e.id),
      count: members.length,
      commonPattern,
      suggestedFix,
      severity,
      createdAt: new Date().toISOString(),
    }
  }

  private extractCommonPattern(summaries: string[]): string {
    const errorPatterns = [
      /Error:\s*([^.\n]+)/i,
      /Failed:\s*([^.\n]+)/i,
      /Cannot\s+(.+)/i,
      /not found/i,
      /timeout/i,
      /permission denied/i,
      /ECONNREFUSED/i,
      /ETIMEOUT/i,
      /ENOENT/i,
      /EACCES/i,
    ]

    const counts = new Map<string, number>()
    for (const summary of summaries) {
      for (const pat of errorPatterns) {
        const match = summary.match(pat)
        if (match) {
          const key = match[0].toLowerCase().slice(0, 60)
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      }
    }

    const sorted = [...counts.entries()].sort(([, a], [, b]) => b - a)
    return sorted[0]?.[0] ?? "Unknown failure pattern"
  }

  private suggestFix(pattern: string, members: ExperienceRecord[]): string {
    const p = pattern.toLowerCase()

    if (p.includes("not found") || p.includes("enoent")) {
      return "Ensure files/directories exist before access. Add pre-check steps."
    }
    if (p.includes("timeout") || p.includes("etimedout") || p.includes("econnrefused")) {
      return "Increase timeout thresholds. Add retry with exponential backoff. Verify services are running."
    }
    if (p.includes("permission") || p.includes("eacces")) {
      return "Add elevated permission fallback. Check file ownership and access rights."
    }
    if (p.includes("syntax") || p.includes("parse")) {
      return "Add input validation and parse error handling. Use try-catch around parsing."
    }
    if (p.includes("typeerror") || p.includes("cannot read")) {
      return "Add null/undefined checks before property access. Use optional chaining."
    }

    const actionTypes = new Map<string, number>()
    for (const m of members) {
      const actions = this.store.getActionsForExperience(m.id)
      for (const a of actions) {
        actionTypes.set(a.actionType, (actionTypes.get(a.actionType) ?? 0) + 1)
      }
    }

    const topAction = [...actionTypes.entries()].sort(([, a], [, b]) => b - a)[0]
    if (topAction) {
      return `Review agent prompts for "${topAction[0]}". Add validation and error handling for this action type.`
    }

    return "Review agent prompts and add defensive error handling for this failure pattern."
  }

  private calculateSeverity(members: ExperienceRecord[]): FailureCluster["severity"] {
    if (members.length >= 10) return "critical"
    if (members.length >= 5) return "high"
    if (members.length >= 3) return "medium"
    return "low"
  }

  private findCommonErrorPatterns(summaries: string[]): string[] {
    const patternCounts = new Map<string, number>()
    const patterns = [
      /Error:\s*([^.\n]+)/i,
      /Failed:\s*([^.\n]+)/i,
      /Cannot\s+(.+)/i,
      /(timeout)/gi,
      /(permission denied)/gi,
      /(not found)/gi,
    ]

    for (const s of summaries) {
      for (const pat of patterns) {
        const matches = s.match(pat)
        if (matches?.[0]) {
          patternCounts.set(matches[0], (patternCounts.get(matches[0]) ?? 0) + 1)
        }
      }
    }

    return [...patternCounts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([pattern]) => pattern)
  }

  private mergeWithExisting(newClusters: FailureCluster[]): FailureCluster[] {
    const existingActive = this.clusters.filter(
      (c) => newClusters.some((n) => c.name === n.name),
    )

    const existingNames = new Set(existingActive.map((c) => c.name))
    const retained = this.clusters.filter((c) => !existingNames.has(c.name))

    return [...newClusters, ...retained].sort((a, b) => b.count - a.count)
  }

  private loadClusters(): void {
    if (!existsSync(CLUSTERS_PATH)) {
      this.clusters = []
      return
    }
    try {
      const raw = readFileSync(CLUSTERS_PATH, "utf-8")
      this.clusters = JSON.parse(raw)
    } catch {
      this.clusters = []
    }
  }

  private saveClusters(): void {
    const dir = join(process.cwd(), ".aegis")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(CLUSTERS_PATH, JSON.stringify(this.clusters, null, 2), "utf-8")
  }
}

export const failureClusterer = new FailureClusterer()
