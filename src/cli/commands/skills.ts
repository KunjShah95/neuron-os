import type { Command } from "commander"
import { existsSync } from "fs"
import { readdir, readFile } from "fs/promises"
import { join, basename } from "path"
import { theme, box } from "../theme"
import { showBanner } from "../banner"
import { fetchTopSkills, searchSkills, fetchRegistryStats } from "../../skills/remote"

interface LocalSkill {
  name: string
  description: string
  tags: string[]
  path: string
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
      path: skillDir,
    })
  }

  return skills
}

function renderSkills(local: LocalSkill[], remote: any[], title: string): void {
  console.log(`\n  ${theme.heading(title)}`)

  if (local.length > 0) {
    console.log(`\n  ${theme.bold("Installed")} ${theme.muted(`(${local.length})`)}`)
    for (const s of local) {
      const tagStr = s.tags.length > 0 ? ` ${theme.muted(s.tags.map((t) => `#${t}`).join(" "))}` : ""
      console.log(`    ${box.bullet} ${theme.textBright(s.name)}${tagStr}`)
      if (s.description) console.log(`      ${theme.muted(s.description)}`)
    }
  }

  if (remote.length > 0) {
    console.log(`\n  ${theme.bold("From skills.sh")} ${theme.muted(`(${remote.length})`)}`)
    for (const s of remote) {
      const tagStr = s.tags?.length > 0 ? ` ${theme.muted(s.tags.map((t: string) => `#${t}`).join(" "))}` : ""
      const installs = s.installs ? ` ${theme.muted(`${s.installs}k installs`)}` : ""
      console.log(`    ${box.bullet} ${theme.textBright(s.name)}${installs}${tagStr}`)
      if (s.description) console.log(`      ${theme.muted(s.description)}`)
    }
  }

  if (local.length === 0 && remote.length === 0) {
    console.log(`    ${theme.muted("No skills found.")}`)
  }
}

export async function handleSkills(opts: { search?: string; json?: boolean }) {
  showBanner()

  const local = await listLocalSkills()

  if (opts.json) {
    console.log(JSON.stringify({ local, remote: [] }, null, 2))
    return
  }

  if (opts.search) {
    try {
      const remote = await searchSkills(opts.search)
      renderSkills(local, remote, `Skills matching "${opts.search}"`)
    } catch {
      renderSkills(local, [], `Skills matching "${opts.search}"`)
    }
  } else {
    let remote: any[] = []
    try {
      const top = await fetchTopSkills(5)
      remote = top
    } catch {}

    const stats = await fetchRegistryStats().catch(() => null)
    renderSkills(local, remote, "Skills")
    if (stats) {
      console.log(`\n  ${theme.muted(`${stats.totalSkills.toLocaleString()} skills in registry`)}`)
    }
  }

  console.log(`\n  ${theme.muted("Use --search <query> to search skills.sh")}`)
  console.log(`  ${theme.muted("Browse all skills at")} ${theme.info("https://skills.sh")}\n`)
}

export function registerSkills(program: Command) {
  program
    .command("skills")
    .alias("sk")
    .description("List installed skills and browse skills.sh")
    .option("-s, --search <query>", "Search skills.sh registry")
    .option("--json", "JSON output")
    .action(handleSkills)
}
