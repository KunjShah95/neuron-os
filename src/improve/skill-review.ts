import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { SkillCandidate } from "./types"

const STAGING_PATH = join(process.cwd(), ".aegis", "skill-staging.json")
const AUTO_APPROVED_PATH = join(process.cwd(), ".aegis", "skill-auto-approved.json")

export class SkillReviewStore {
  private staged: SkillCandidate[] = []
  private autoApproved: SkillCandidate[] = []

  constructor() {
    this.load()
  }

  stage(candidate: SkillCandidate): void {
    const existing = this.staged.findIndex((c) => c.id === candidate.id)
    if (existing >= 0) {
      this.staged[existing] = candidate
    } else {
      this.staged.push(candidate)
    }
    this.save()
  }

  /**
   * Record a skill that was auto-approved (high confidence, skipped staging).
   */
  recordAutoApproved(candidate: SkillCandidate): void {
    const existing = this.autoApproved.findIndex((c) => c.id === candidate.id)
    if (existing >= 0) {
      this.autoApproved[existing] = { ...candidate, status: "auto_approved" }
    } else {
      this.autoApproved.push({ ...candidate, status: "auto_approved" })
    }
    this.save()
  }

  listStaged(): SkillCandidate[] {
    return this.staged.filter((c) => c.status === "candidate" || c.status === "validated")
  }

  /**
   * List all auto-approved skills (high confidence, written directly to disk).
   */
  listAutoApproved(): SkillCandidate[] {
    return [...this.autoApproved.filter((c) => c.status === "auto_approved")]
  }

  /**
   * Get combined stats for staged + auto-approved skills.
   */
  getQueueStats(): { staged: number; autoApproved: number; avgConfidence: number } {
    const staged = this.listStaged()
    const autoApproved = this.listAutoApproved()
    const all = [...staged, ...autoApproved]
    const avgConf = all.length > 0 ? all.reduce((s, c) => s + c.confidence, 0) / all.length : 0
    return { staged: staged.length, autoApproved: autoApproved.length, avgConfidence: Math.round(avgConf * 100) / 100 }
  }

  getById(id: string): SkillCandidate | undefined {
    return this.staged.find((c) => c.id === id)
  }

  remove(id: string): boolean {
    const idx = this.staged.findIndex((c) => c.id === id)
    if (idx < 0) return false
    this.staged.splice(idx, 1)
    this.save()
    return true
  }

  private load(): void {
    // Load staging
    if (!existsSync(STAGING_PATH)) {
      this.staged = []
    } else {
      try {
        this.staged = JSON.parse(readFileSync(STAGING_PATH, "utf-8")) as SkillCandidate[]
      } catch {
        this.staged = []
      }
    }
    // Load auto-approved
    if (!existsSync(AUTO_APPROVED_PATH)) {
      this.autoApproved = []
    } else {
      try {
        this.autoApproved = JSON.parse(readFileSync(AUTO_APPROVED_PATH, "utf-8")) as SkillCandidate[]
      } catch {
        this.autoApproved = []
      }
    }
  }

  private save(): void {
    const dir = join(process.cwd(), ".aegis")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(STAGING_PATH, JSON.stringify(this.staged, null, 2), "utf-8")
    writeFileSync(AUTO_APPROVED_PATH, JSON.stringify(this.autoApproved, null, 2), "utf-8")
  }
}

export const skillReviewStore = new SkillReviewStore()
