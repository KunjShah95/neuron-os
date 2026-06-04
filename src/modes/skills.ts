import { existsSync } from "fs"
import { readdir, readFile } from "fs/promises"
import { join } from "path"
import { theme } from "../cli/theme"
import { showInfoScreen } from "./info-screen"
import { fetchTopSkills, fetchRegistryStats } from "../skills/remote"
import type { Mode } from "./types"

interface LocalSkill {
  name: string
  description: string
  tags: string[]
}

async function listLocalSkills(): Promise<LocalSkill[]> {
  const skillsDir = join(process.cwd(), "skills")
  if (!existsSync(skillsDir)) return []

  const entries = await readdir(skillsDir, { withFileTypes: true })
  const skills: LocalSkill[] = []

  for (const entry of entries) {
    const skillDir = join(skillsDir, entry.name)
    if (!entry.isDirectory()) continue
    const skillMd = join(skillDir, "SKILL.md")
    if (!existsSync(skillMd)) continue

    const content = await readFile(skillMd, "utf-8")
    const match = content.match(/^---\n([\s\S]*?)\n---/)
    if (!match) continue
    const raw = match[1]
    if (!raw) continue

    const meta: Record<string, any> = { tags: [] }
    for (const line of raw.split("\n")) {
      const idx = line.indexOf(":")
      if (idx === -1) continue
      const key = line.slice(0, idx).trim()
      const val = line.slice(idx + 1).trim().replace(/^\[|\]$/g, "")
      if (!key) continue
      if (key === "tags") meta.tags = val.split(",").map((s) => s.trim()).filter(Boolean)
      else meta[key] = val
    }

    skills.push({
      name: meta.name || entry.name,
      description: meta.description || "",
      tags: meta.tags || [],
    })
  }

  return skills
}

export const skillsMode: Mode = {
  id: "skills",
  name: "Skills",
  description: "Installed skills & skills.sh browser",

  async run() {
    const local = await listLocalSkills()
    const lines: string[] = [""]

    lines.push(`  ${theme.heading("Installed Skills")}`)
    lines.push(`  ${theme.muted(`(${local.length} total)`)}`)
    lines.push("")

    if (local.length === 0) {
      lines.push(`  ${theme.muted("No skills installed.")}`)
    } else {
      for (const s of local) {
        const tagStr = s.tags.length > 0 ? ` ${theme.muted(s.tags.map((t) => `#${t}`).join(" "))}` : ""
        lines.push(`  ${theme.textBright(s.name)}${tagStr}`)
        if (s.description) lines.push(`    ${theme.muted(s.description)}`)
        lines.push("")
      }
    }

    let remote: any[] = []
    try {
      remote = await fetchTopSkills(5)
    } catch {
      // fetchTopSkills returns empty array on failure, remote stays empty
    }
    const stats = await fetchRegistryStats().catch(() => null)

    if (remote.length > 0) {
      lines.push(`  ${theme.heading("Trending on skills.sh")}`)
      lines.push("")
      for (const s of remote) {
        const tagStr = s.tags?.length > 0 ? ` ${theme.muted(s.tags.map((t: string) => `#${t}`).join(" "))}` : ""
        const installs = s.installs ? ` ${theme.muted(`${s.installs}k installs`)}` : ""
        lines.push(`  ${theme.textBright(s.name)}${installs}${tagStr}`)
        if (s.description) lines.push(`    ${theme.muted(s.description)}`)
        lines.push("")
      }
    }

    if (stats) {
      lines.push(`  ${theme.muted(`${stats.totalSkills.toLocaleString()} skills in registry`)}`)
    }
    lines.push(`  ${theme.muted("Browse all: https://skills.sh")}`)
    lines.push("")

    return showInfoScreen("Skills", lines, { back: true })
  },
}
