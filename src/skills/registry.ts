import { readFile, readdir } from "node:fs/promises"
import { resolve, join, basename } from "node:path"
import { existsSync } from "node:fs"

export interface SkillMetadata {
  name: string
  description: string
  version?: string
  author?: string
  tags?: string[]
  dependencies?: string[]
}

export interface Skill {
  metadata: SkillMetadata
  content: string
  path: string
  loaded: boolean
}

export interface SkillContext {
  agentId: string
  agentType?: string
  cwd: string
}

export interface SkillManifestEntry {
  name: string
  description: string
  path: string
}

export class SkillRegistry {
  private skills = new Map<string, Skill>()
  private skillPaths: string[] = []

  constructor() {
    // Default skill search paths
    this.skillPaths = [
      resolve(process.cwd(), "skills"),
      resolve(process.cwd(), ".aegis/skills"),
      resolve(process.env.HOME || process.env.USERPROFILE || "~", ".aegis/skills"),
    ]
  }

  addSkillPath(path: string): void {
    if (!this.skillPaths.includes(path)) {
      this.skillPaths.unshift(path) // Higher priority
    }
  }

  async loadAll(): Promise<void> {
    for (const skillPath of this.skillPaths) {
      if (!existsSync(skillPath)) continue

      try {
        const entries = await readdir(skillPath, { withFileTypes: true })

        for (const entry of entries) {
          if (entry.isDirectory()) {
            await this.loadSkillFromDirectory(join(skillPath, entry.name))
          } else if (entry.name === "SKILL.md") {
            await this.loadSkillFromFile(skillPath)
          }
        }
      } catch (err) {
        console.error(`Failed to load skills from ${skillPath}:`, err)
      }
    }
  }

  private async loadSkillFromDirectory(dirPath: string): Promise<void> {
    const skillMdPath = join(dirPath, "SKILL.md")
    if (!existsSync(skillMdPath)) return

    await this.loadSkillFromFile(dirPath)
  }

  private async loadSkillFromFile(dirPath: string): Promise<void> {
    const skillMdPath = join(dirPath, "SKILL.md")

    try {
      const content = await readFile(skillMdPath, "utf-8")
      const { metadata, body } = this.parseSkillMd(content)

      if (!metadata.name) {
        metadata.name = basename(dirPath)
      }

      const skill: Skill = {
        metadata,
        content: body,
        path: dirPath,
        loaded: false,
      }

      this.skills.set(metadata.name, skill)
    } catch (err) {
      console.error(`Failed to load skill from ${skillMdPath}:`, err)
    }
  }

  private parseSkillMd(content: string): { metadata: SkillMetadata; body: string } {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)

    if (!frontmatterMatch) {
      return {
        metadata: { name: "", description: "" },
        body: content,
      }
    }

    const frontmatter = frontmatterMatch[1] || ""
    const body = frontmatterMatch[2] || ""

    const metadata: SkillMetadata = {
      name: "",
      description: "",
    }

    // Parse YAML-like frontmatter
    const lines = frontmatter.split("\n")
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/)
      if (match) {
        const key = match[1]
        const value = match[2]
        if (!key || !value) continue

        if (key === "tags" || key === "dependencies") {
          // Parse array: [item1, item2] or item1, item2
          const cleaned = value.replace(/^\[|\]$/g, "")
          metadata[key] = cleaned.split(",").map((s) => s.trim())
        } else {
          ;(metadata as unknown as Record<string, unknown>)[key] = value.trim()
        }
      }
    }

    return { metadata, body }
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name)
  }

  list(): Skill[] {
    return Array.from(this.skills.values())
  }

  getManifest(): SkillManifestEntry[] {
    return this.list()
      .map((skill) => ({
        name: skill.metadata.name,
        description: skill.metadata.description,
        path: skill.path,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  buildManifestPrompt(): string {
    const entries = this.getManifest()
    if (entries.length === 0) return ""

    return entries.map((skill) => `- **${skill.name}** — ${skill.description} (${skill.path}/SKILL.md)`).join("\n")
  }

  async injectSkill(name: string, ctx: SkillContext): Promise<string | null> {
    const skill = this.skills.get(name)
    if (!skill) return null

    skill.loaded = true

    // Replace template variables
    let content = skill.content
    content = content.replace(/\{\{agentId\}\}/g, ctx.agentId)
    content = content.replace(/\{\{agentType\}\}/g, ctx.agentType || "unknown")
    content = content.replace(/\{\{cwd\}\}/g, ctx.cwd)

    return content
  }

  async readSkill(name: string, ctx: SkillContext): Promise<string | null> {
    return await this.injectSkill(name, ctx)
  }

  async findRelevantSkills(query: string, limit = 3): Promise<Skill[]> {
    const queryLower = query.toLowerCase()
    const scored: Array<{ skill: Skill; score: number }> = []

    for (const skill of this.skills.values()) {
      let score = 0

      // Check name match
      if (skill.metadata.name.toLowerCase().includes(queryLower)) {
        score += 10
      }

      // Check description match
      if (skill.metadata.description.toLowerCase().includes(queryLower)) {
        score += 5
      }

      // Check tags match
      if (skill.metadata.tags) {
        for (const tag of skill.metadata.tags) {
          if (tag.toLowerCase().includes(queryLower)) {
            score += 3
          }
        }
      }

      // Check content match
      if (skill.content.toLowerCase().includes(queryLower)) {
        score += 1
      }

      if (score > 0) {
        scored.push({ skill, score })
      }
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit).map((s) => s.skill)
  }
}

export const skillRegistry = new SkillRegistry()
