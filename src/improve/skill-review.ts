import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { SkillCandidate } from "./types"

const STAGING_PATH = join(process.cwd(), ".aegis", "skill-staging.json")

export class SkillReviewStore {
  private staged: SkillCandidate[] = []

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

  listStaged(): SkillCandidate[] {
    return this.staged.filter((c) => c.status === "candidate" || c.status === "validated")
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
    if (!existsSync(STAGING_PATH)) {
      this.staged = []
      return
    }
    try {
      this.staged = JSON.parse(readFileSync(STAGING_PATH, "utf-8")) as SkillCandidate[]
    } catch {
      this.staged = []
    }
  }

  private save(): void {
    const dir = join(process.cwd(), ".aegis")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(STAGING_PATH, JSON.stringify(this.staged, null, 2), "utf-8")
  }
}

export const skillReviewStore = new SkillReviewStore()
