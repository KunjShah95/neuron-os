import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type { AgentProfile } from "./types"

export class ProfileStore {
  private readonly dir: string

  constructor(dir?: string) {
    this.dir = dir ?? join(homedir(), ".aegis", "profiles")
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true })
    }
  }

  list(): AgentProfile[] {
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          return JSON.parse(readFileSync(join(this.dir, f), "utf-8")) as AgentProfile
        } catch {
          return null
        }
      })
      .filter((p): p is AgentProfile => p !== null)
  }

  get(id: string): AgentProfile | undefined {
    const file = join(this.dir, `${id}.json`)
    if (!existsSync(file)) return undefined
    try {
      return JSON.parse(readFileSync(file, "utf-8")) as AgentProfile
    } catch {
      return undefined
    }
  }

  save(profile: AgentProfile): void {
    profile.updatedAt = new Date().toISOString()
    writeFileSync(join(this.dir, `${profile.id}.json`), JSON.stringify(profile, null, 2))
  }

  delete(id: string): boolean {
    const file = join(this.dir, `${id}.json`)
    if (!existsSync(file)) return false
    rmSync(file)
    return true
  }

  getDefault(agentType: string): AgentProfile | undefined {
    return this.list().find((p) => p.agentType === agentType)
  }
}
