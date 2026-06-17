import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { createLogger } from "../cli/logger"
import { ExperienceStore, type ExperienceRecord } from "../experience/store"
import { computeEmbedding, cosineSimilarity } from "../memory/embedding"
import type { SkillCandidate } from "./types"
import { skillReviewStore } from "./skill-review"

const log = createLogger("improve:skill-extractor")

const CANDIDATES_PATH = join(process.cwd(), ".aegis", "skill-candidates.json")

const SIMILARITY_THRESHOLD = 0.65

/**
 * Default confidence threshold for auto-approving skills without manual staging.
 * Can be overridden via SKILL_AUTO_APPROVE_THRESHOLD env var (0.0 - 1.0).
 * A candidate must meet all criteria to auto-approve:
 *   - confidence >= threshold
 *   - successRate >= threshold * 0.9 (slightly more lenient on success rate)
 *   - invocationCount >= min invocations (default 3)
 *   - status is "validated"
 */
function getAutoApproveThreshold(): number {
  const envVal = process.env.SKILL_AUTO_APPROVE_THRESHOLD
  if (envVal) {
    const parsed = Number.parseFloat(envVal)
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      return parsed
    }
    log.warn(`Invalid SKILL_AUTO_APPROVE_THRESHOLD "${envVal}", falling back to default 0.8`)
  }
  return 0.8
}

/** Minimum invocation count before a skill can auto-approve */
function getAutoApproveMinInvocations(): number {
  const envVal = process.env.SKILL_AUTO_APPROVE_MIN_INVOCATIONS
  if (envVal) {
    const parsed = Number.parseInt(envVal, 10)
    if (!Number.isNaN(parsed) && parsed >= 1) {
      return parsed
    }
  }
  return 3
}

export class SkillExtractor {
  private store: ExperienceStore
  private candidates: SkillCandidate[] = []

  constructor(store?: ExperienceStore) {
    this.store = store ?? new ExperienceStore()
    this.loadCandidates()
  }

  /**
   * Extract skill candidates from the experience store, automatically approving
   * high-confidence candidates without manual staging.
   *
   * @param minReward - Minimum reward threshold for considering experiences
   * @param autoApprove - If true (default), auto-approve high-confidence candidates
   * @returns All newly extracted candidates (both auto-approved and staged)
   */
  extractCandidates(minReward = 0.7, autoApprove = true): SkillCandidate[] {
    const successes = this.store.getByOutcome("success", 200).filter((e) => e.reward >= minReward)
    if (successes.length === 0) return []

    const failures = this.store.getByOutcome("failed", 200)

    const clusters = this.clusterBySimilarity(successes)

    const newCandidates: SkillCandidate[] = []
    const stagedCounts = { staged: 0, autoApproved: 0 }

    for (const cluster of clusters) {
      if (cluster.length < 2) continue

      const avgReward = cluster.reduce((s, e) => s + e.reward, 0) / cluster.length
      const successCount = cluster.length
      const similarFailures = this.countSimilarFailures(cluster, failures)
      const successRate = successCount / Math.max(1, successCount + similarFailures)

      const goalWords = cluster[0]?.goal ?? ""
      const name =
        goalWords
          .replace(/[^a-z0-9 ]/gi, "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "-")
          .slice(0, 40) || `auto-skill-${Date.now().toString(36)}`

      const tags = this.mergeTags(cluster)

      const candidate: SkillCandidate = {
        id: `cand-${randomUUID().slice(0, 8)}`,
        name: `auto-${name}`,
        description: tags.length > 0 ? `Pattern: ${tags.slice(0, 3).join(", ")}` : goalWords.slice(0, 100),
        sourcePattern: this.buildSourcePattern(cluster),
        confidence: Math.round(successRate * 100) / 100,
        derivedFrom: cluster.map((e) => e.id),
        avgReward: Math.round(avgReward * 100) / 100,
        invocationCount: cluster.length,
        successRate: Math.round(successRate * 100) / 100,
        createdAt: new Date().toISOString(),
        status: "candidate",
      }

      newCandidates.push(candidate)

      // ── Auto-approve high-confidence candidates ───────────────────────
      if (autoApprove && this.shouldAutoApprove(candidate)) {
        candidate.status = "auto_approved"
        stagedCounts.autoApproved++
      } else {
        stagedCounts.staged++
      }
    }

    const merged = this.mergeWithExisting(newCandidates)
    this.candidates = merged
    this.saveCandidates()

    // ── Process auto-approvals and stage the rest ───────────────────────
    for (const candidate of newCandidates) {
      if (candidate.status === "auto_approved") {
        this.publishAutoApproved(candidate)
      } else {
        skillReviewStore.stage({ ...candidate, status: "validated" })
      }
    }

    log.info(
      `Extracted ${newCandidates.length} skill candidates: ${stagedCounts.staged} staged, ${stagedCounts.autoApproved} auto-approved`,
    )

    return newCandidates
  }

  validateCandidate(candidate: SkillCandidate): Promise<SkillCandidate> {
    const failures = this.store.getByOutcome("failed", 100)
    const wouldHelp = failures.filter((f) => {
      const query = `${f.goal} ${f.summary}`
      const queryEmb = computeEmbedding(query)
      const candEmb = computeEmbedding(candidate.description)
      const sim = cosineSimilarity(queryEmb, candEmb)
      return sim > SIMILARITY_THRESHOLD
    })

    const validated: SkillCandidate = {
      ...candidate,
      confidence:
        wouldHelp.length > 0
          ? Math.min(1, candidate.confidence + 0.1 * (wouldHelp.length / Math.max(1, failures.length)))
          : candidate.confidence,
      status: "validated",
    }

    const idx = this.candidates.findIndex((c) => c.id === candidate.id)
    if (idx >= 0) {
      this.candidates[idx] = validated
      this.saveCandidates()
    }

    return Promise.resolve(validated)
  }

  getCandidates(status?: SkillCandidate["status"]): SkillCandidate[] {
    if (!status) return [...this.candidates]
    return this.candidates.filter((c) => c.status === status)
  }

  async publishCandidate(candidateId: string): Promise<{ success: boolean; skillPath?: string; error?: string }> {
    const candidate = this.candidates.find((c) => c.id === candidateId)
    if (!candidate) return { success: false, error: `Candidate ${candidateId} not found` }

    const staged: SkillCandidate = { ...candidate, status: "candidate" }
    skillReviewStore.stage(staged)

    const idx = this.candidates.findIndex((c) => c.id === candidateId)
    if (idx >= 0) {
      this.candidates[idx] = staged
      this.saveCandidates()
    }

    log.info(`Staged skill candidate for review: ${candidate.name} (${candidateId})`)
    return { success: true, skillPath: undefined }
  }

  async approveFromStaging(candidateId: string): Promise<{ success: boolean; skillPath?: string; error?: string }> {
    const candidate = skillReviewStore.getById(candidateId)
    if (!candidate) return { success: false, error: `Staged candidate ${candidateId} not found` }

    const skillsDir = join(process.cwd(), "src", "skills")
    if (!existsSync(skillsDir)) mkdirSync(skillsDir, { recursive: true })

    const filePath = join(skillsDir, `auto-${candidate.name}.ts`)

    const content = [
      `export const skillId = "${candidate.id}"`,
      `export const name = "${candidate.name}"`,
      `export const description = ${JSON.stringify(candidate.description)}`,
      `export const sourcePattern = ${JSON.stringify(candidate.sourcePattern)}`,
      `export const confidence = ${candidate.confidence}`,
      `export const avgReward = ${candidate.avgReward}`,
      `export const invocationCount = ${candidate.invocationCount}`,
      `export const successRate = ${candidate.successRate}`,
      `export const derivedFrom = ${JSON.stringify(candidate.derivedFrom)}`,
      "",
    ].join("\n")

    try {
      writeFileSync(filePath, content, "utf-8")
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }

    skillReviewStore.remove(candidateId)

    const published: SkillCandidate = { ...candidate, status: "published" }
    const idx = this.candidates.findIndex((c) => c.id === candidateId)
    if (idx >= 0) {
      this.candidates[idx] = published
      this.saveCandidates()
    }

    log.info(`Approved and published skill → ${filePath}`)
    return { success: true, skillPath: filePath }
  }

  rejectCandidate(candidateId: string): boolean {
    const idx = this.candidates.findIndex((c) => c.id === candidateId)
    if (idx < 0) return false
    this.candidates[idx] = { ...(this.candidates[idx] as (typeof this.candidates)[0]), status: "rejected" }
    this.saveCandidates()
    return true
  }

  getStats(): { totalCandidates: number; published: number; autoApproved: number; avgConfidence: number } {
    const total = this.candidates.length
    const published = this.candidates.filter((c) => c.status === "published").length
    const autoApproved = this.candidates.filter((c) => c.status === "auto_approved").length
    const avgConf = total > 0 ? this.candidates.reduce((s, c) => s + c.confidence, 0) / total : 0
    return {
      totalCandidates: total,
      published,
      autoApproved,
      avgConfidence: Math.round(avgConf * 100) / 100,
    }
  }

  /**
   * Check whether a candidate meets the criteria for auto-approval.
   * Requires:
   *   1. confidence >= auto-approve threshold (default 0.8, configurable via env)
   *   2. successRate >= threshold * 0.9
   *   3. invocationCount >= min invocations (default 3, configurable via env)
   */
  private shouldAutoApprove(candidate: SkillCandidate): boolean {
    const threshold = getAutoApproveThreshold()
    const minInvocation = getAutoApproveMinInvocations()
    return (
      candidate.confidence >= threshold &&
      candidate.successRate >= threshold * 0.9 &&
      candidate.invocationCount >= minInvocation
    )
  }

  /**
   * Publish a high-confidence skill candidate directly to disk, bypassing manual staging.
   * Records it in the SkillReviewStore's auto-approved list for auditability.
   */
  private publishAutoApproved(candidate: SkillCandidate): void {
    const skillsDir = join(process.cwd(), "src", "skills")
    if (!existsSync(skillsDir)) mkdirSync(skillsDir, { recursive: true })

    const filePath = join(skillsDir, `auto-${candidate.name}.ts`)

    const content = [
      `// Auto-approved skill — confidence: ${(candidate.confidence * 100).toFixed(0)}%`,
      `// Generated: ${candidate.createdAt}`,
      `// Derived from: ${candidate.derivedFrom.length} experience(s)`,
      "",
      `export const skillId = "${candidate.id}"`,
      `export const name = "${candidate.name}"`,
      `export const description = ${JSON.stringify(candidate.description)}`,
      `export const sourcePattern = ${JSON.stringify(candidate.sourcePattern)}`,
      `export const confidence = ${candidate.confidence}`,
      `export const avgReward = ${candidate.avgReward}`,
      `export const invocationCount = ${candidate.invocationCount}`,
      `export const successRate = ${candidate.successRate}`,
      `export const derivedFrom = ${JSON.stringify(candidate.derivedFrom)}`,
      "",
    ].join("\n")

    try {
      writeFileSync(filePath, content, "utf-8")
      skillReviewStore.recordAutoApproved(candidate)
      log.info(`Auto-approved skill → ${filePath} (confidence: ${(candidate.confidence * 100).toFixed(0)}%)`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.warn(`Failed to write auto-approved skill ${candidate.name}: ${msg}`)
    }
  }

  private clusterBySimilarity(experiences: ExperienceRecord[]): ExperienceRecord[][] {
    const clusters: ExperienceRecord[][] = []
    const assigned = new Set<string>()

    for (const exp of experiences) {
      if (assigned.has(exp.id)) continue
      const cluster: ExperienceRecord[] = [exp]
      assigned.add(exp.id)

      const expEmb = computeEmbedding(`${exp.goal} ${exp.summary}`)

      for (const other of experiences) {
        if (assigned.has(other.id)) continue
        const otherEmb = computeEmbedding(`${other.goal} ${other.summary}`)
        const sim = cosineSimilarity(expEmb, otherEmb)
        if (sim >= SIMILARITY_THRESHOLD) {
          cluster.push(other)
          assigned.add(other.id)
        }
      }

      clusters.push(cluster)
    }

    return clusters
  }

  private countSimilarFailures(cluster: ExperienceRecord[], failures: ExperienceRecord[]): number {
    const clusterEmb = computeEmbedding(cluster.map((e) => `${e.goal} ${e.summary}`).join(" "))

    return failures.filter((f) => {
      const fEmb = computeEmbedding(`${f.goal} ${f.summary}`)
      return cosineSimilarity(clusterEmb, fEmb) >= SIMILARITY_THRESHOLD
    }).length
  }

  private buildSourcePattern(cluster: ExperienceRecord[]): string {
    const goals = cluster.map((e) => e.goal.toLowerCase())
    const commonWords = this.findCommonWords(goals)
    return commonWords.slice(0, 5).join(" ")
  }

  private findCommonWords(phrases: string[]): string[] {
    const wordCounts = new Map<string, number>()
    for (const phrase of phrases) {
      const words = [...new Set(phrase.split(/\s+/).filter((w) => w.length > 2))]
      for (const w of words) {
        wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1)
      }
    }
    return [...wordCounts.entries()]
      .filter(([, count]) => count >= phrases.length * 0.5)
      .sort(([, a], [, b]) => b - a)
      .map(([word]) => word)
  }

  private mergeTags(cluster: ExperienceRecord[]): string[] {
    const tagCounts = new Map<string, number>()
    for (const exp of cluster) {
      for (const tag of exp.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
      }
    }
    return [...tagCounts.entries()]
      .filter(([, count]) => count >= cluster.length * 0.3)
      .sort(([, a], [, b]) => b - a)
      .map(([tag]) => tag)
  }

  private mergeWithExisting(newCandidates: SkillCandidate[]): SkillCandidate[] {
    const existingNonRejected = this.candidates.filter((c) => c.status !== "rejected")
    const existingMap = new Map(existingNonRejected.map((c) => [c.name, c] as const))

    for (const cand of newCandidates) {
      const existing = existingMap.get(cand.name)
      if (existing) {
        existing.confidence = Math.max(existing.confidence, cand.confidence)
        existing.successRate = Math.max(existing.successRate, cand.successRate)
        existing.invocationCount += cand.invocationCount
        existing.avgReward = (existing.avgReward + cand.avgReward) / 2
        existing.derivedFrom = [...new Set([...existing.derivedFrom, ...cand.derivedFrom])]
      } else {
        existingNonRejected.push(cand)
        existingMap.set(cand.name, cand)
      }
    }

    return existingNonRejected
  }

  private loadCandidates(): void {
    if (!existsSync(CANDIDATES_PATH)) {
      this.candidates = []
      return
    }
    try {
      const raw = readFileSync(CANDIDATES_PATH, "utf-8")
      this.candidates = JSON.parse(raw)
    } catch {
      this.candidates = []
    }
  }

  private saveCandidates(): void {
    const dir = join(process.cwd(), ".aegis")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(CANDIDATES_PATH, JSON.stringify(this.candidates, null, 2), "utf-8")
  }
}

export const skillExtractor = new SkillExtractor()
