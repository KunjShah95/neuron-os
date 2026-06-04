import type { Command } from "commander"
import { existsSync, watch } from "fs"
import { readdir, readFile, writeFile, mkdir, rm } from "fs/promises"
import { join } from "path"
import { createLogger } from "../logger"
import { theme, box } from "../theme"
import { showBanner } from "../banner"
import { searchSkills, fetchTopSkills, fetchRegistryStats } from "../../skills/remote"
import { skillRegistry } from "../../skills/registry"

const log = createLogger("cli:skills")

// ── Hot-reload support ───────────────────────────────────────────────

let skillWatcher: ReturnType<typeof watch> | null = null
let watchCallbacks: Array<() => void> = []

/**
 * Start watching the skills directory for changes.
 * When a SKILL.md file is added/removed/modified, the registry is reloaded.
 */
export function startSkillHotReload(onChange?: () => void) {
  if (skillWatcher) return // already watching

  const skillsDir = join(process.cwd(), "skills")
  if (!existsSync(skillsDir)) {
    log.info("Skills directory not found, hot-reload not started")
    return
  }

  if (onChange) watchCallbacks.push(onChange)

  skillWatcher = watch(skillsDir, { recursive: true }, async (eventType, filename) => {
    if (filename && (filename.endsWith("SKILL.md") || filename.endsWith(".md"))) {
      log.info("Skill file changed, reloading registry", { file: filename, event: eventType })
      try {
        await skillRegistry.loadAll()
        for (const cb of watchCallbacks) {
          try { cb() } catch (err) {
            log.warn("Skill hot-reload callback failed", { error: String(err) })
          }
        }
      } catch (err) {
        log.error("Failed to reload skill registry", { error: String(err) })
      }
    }
  })

  log.info("Skill hot-reload started", { dir: skillsDir })
}

/**
 * Stop watching the skills directory.
 */
export function stopSkillHotReload() {
  if (skillWatcher) {
    skillWatcher.close()
    skillWatcher = null
    watchCallbacks = []
    log.info("Skill hot-reload stopped")
  }
}

interface LocalSkill {
  name: string
  description: string
  tags: string[]
  path: string
  version?: string
  author?: string
  dependencies?: string[]
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
      version: meta.version || undefined,
      author: meta.author || undefined,
      dependencies: meta.dependencies || undefined,
    })
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

function renderSkills(local: LocalSkill[], remote: any[], title: string): void {
  console.log(`\n  ${theme.heading(title)}`)

  if (local.length > 0) {
    console.log(`\n  ${theme.bold("Installed")} ${theme.muted(`(${local.length})`)}`)
    for (const s of local) {
      const versionStr = s.version ? ` ${theme.muted(`v${s.version}`)}` : ""
      const authorStr = s.author ? ` ${theme.muted(`by ${s.author}`)}` : ""
      const depsStr = s.dependencies?.length ? ` ${theme.muted(`deps: ${s.dependencies.join(", ")}`)}` : ""
      const tagStr = s.tags.length > 0 ? ` ${theme.muted(s.tags.map((t) => `#${t}`).join(" "))}` : ""
      console.log(`    ${box.bullet} ${theme.textBright(s.name)}${versionStr}${authorStr}${depsStr}${tagStr}`)
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

// ── Install skill ────────────────────────────────────────────────────

async function handleInstall(name: string) {
  const skillsDir = join(process.cwd(), "skills")
  if (!existsSync(skillsDir)) await mkdir(skillsDir, { recursive: true })

  const targetDir = join(skillsDir, name)
  if (existsSync(targetDir)) {
    console.log(`  ${theme.error(`Skill "${name}" is already installed. Use "skills update ${name}" to update.`)}`)
    return
  }

  try {
    const remote = await searchSkills(name, 1)
    if (remote.length === 0) {
      console.log(`  ${theme.error(`Skill "${name}" not found on skills.sh`)}`)
      return
    }

    await mkdir(targetDir, { recursive: true })
    const skillContent = `---
name: ${name}
description: ${remote[0]?.description || ""}
tags: []
version: 1.0.0
author: ${remote[0]?.owner || "unknown"}
---

# ${name}

${remote[0]?.description || "Imported from skills.sh"}
`
    await writeFile(join(targetDir, "SKILL.md"), skillContent, "utf-8")

    console.log(`  ✅ ${theme.success(`Skill "${name}" installed`)}`)
    log.info("Skill installed", { name, path: targetDir })
  } catch (err: any) {
    console.log(`  ${theme.error(`Failed to install skill: ${err.message}`)}`)
  }
}

// ── Update skill ─────────────────────────────────────────────────────

async function handleUpdate(name?: string) {
  const skillsDir = join(process.cwd(), "skills")
  if (!existsSync(skillsDir)) {
    console.log(`  ${theme.muted("No skills directory found.")}`)
    return
  }

  const entries = await readdir(skillsDir, { withFileTypes: true })
  const skillDirs = name
    ? [name]
    : entries.filter((e) => e.isDirectory()).map((e) => e.name)

  if (skillDirs.length === 0) {
    console.log(`  ${theme.muted("No skills installed to update.")}`)
    return
  }

  let updated = 0
  let failed = 0

  for (const skillName of skillDirs) {
    const skillDir = join(skillsDir, skillName)
    const skillMd = join(skillDir, "SKILL.md")
    if (!existsSync(skillMd)) {
      console.log(`  ${theme.muted(`Skill "${skillName}" has no SKILL.md, skipping`)}`)
      continue
    }

    try {
      // Search skills.sh for latest version
      const remote = await searchSkills(skillName, 1)
      if (remote.length === 0) {
        console.log(`  ${theme.muted(`"${skillName}": not found on skills.sh, keeping local version`)}`)
        continue
      }

      const remoteSkill = remote[0]!

      // Read current local skill to preserve any customizations
      const currentContent = await readFile(skillMd, "utf-8")
      const currentBody = currentContent.replace(/^---\n[\s\S]*?\n---\n/, "").trim()

      // Build updated SKILL.md with fresh description but preserve local body
      const updatedContent = `---
name: ${skillName}
description: ${remoteSkill.description || ""}
tags: ${JSON.stringify(remoteSkill.tags || [])}
version: 1.0.0
author: ${remoteSkill.owner || "unknown"}
updated: ${new Date().toISOString()}
---

${currentBody || `# ${skillName}\n\n${remoteSkill.description || ""}`}
`
      await writeFile(skillMd, updatedContent, "utf-8")
      updated++
      console.log(`  ✅ ${theme.success(`"${skillName}": updated successfully`)}`)
      log.info("Skill updated", { name: skillName })
    } catch (err: any) {
      failed++
      console.log(`  ${theme.error(`"${skillName}": update failed — ${err.message}`)}`)
    }
  }

  console.log(`\n  ${theme.info(`Updated ${updated} skill(s)`)}${failed > 0 ? `, ${failed} failed` : ""}`)
}

// ── Uninstall skill ──────────────────────────────────────────────────

async function handleUninstall(name: string) {
  const skillsDir = join(process.cwd(), "skills")
  const targetDir = join(skillsDir, name)

  if (!existsSync(targetDir)) {
    console.log(`  ${theme.error(`Skill "${name}" is not installed.`)}`)
    return
  }

  try {
    await rm(targetDir, { recursive: true, force: true })
    console.log(`  ✅ ${theme.success(`Skill "${name}" uninstalled`)}`)
    log.info("Skill uninstalled", { name })
  } catch (err: any) {
    console.log(`  ${theme.error(`Failed to uninstall skill: ${err.message}`)}`)
  }
}

// ── Main handler ─────────────────────────────────────────────────────

interface SkillsOptions {
  search?: string
  json?: boolean
  install?: string
  update?: string
  uninstall?: string
  watch?: boolean
}

export async function handleSkills(opts: SkillsOptions) {
  if (opts.install) {
    await handleInstall(opts.install)
    return
  }

  if (opts.uninstall) {
    await handleUninstall(opts.uninstall)
    return
  }

  if (opts.update !== undefined) {
    await handleUpdate(opts.update || undefined)
    return
  }

  showBanner()

  const local = await listLocalSkills()

  if (opts.json) {
    console.log(JSON.stringify({ local, remote: [] }, null, 2))
    return
  }

  // Start hot-reload if --watch is passed
  if (opts.watch) {
    startSkillHotReload(() => {
      console.log(`  ${theme.info("Skills reloaded")}`)
    })
    console.log(`  ${theme.info("Skill hot-reload active. Press Ctrl+C to stop.")}`)    }

  if (opts.search) {
    try {
      const remote = await searchSkills(opts.search)
      renderSkills(local, remote, `Skills matching "${opts.search}"`)
    } catch (err) {
      log.warn("Failed to search skills", { query: opts.search, error: String(err) })
      renderSkills(local, [], `Skills matching "${opts.search}"`)
    }
  } else {
    let remote: any[] = []
    try {
      const top = await fetchTopSkills(5)
      remote = top
    } catch (err) {
      log.warn("Failed to fetch top skills", { error: String(err) })
    }

    const stats = await fetchRegistryStats().catch(() => null)
    renderSkills(local, remote, "Skills")
    if (stats) {
      console.log(`\n  ${theme.muted(`${stats.totalSkills.toLocaleString()} skills in registry`)}`)
    }
  }

  console.log(`\n  ${theme.muted("Use --search <query> to search skills.sh")}`)
  console.log(`  ${theme.muted("Use --install <name> to install a skill")}`)
  console.log(`  ${theme.muted("Use --update [name] to update skills")}`)
  console.log(`  ${theme.muted("Use --uninstall <name> to remove a skill")}`)
  console.log(`  ${theme.muted("Use --watch for hot-reload")}`)
  console.log(`  ${theme.muted("Browse all skills at")} ${theme.info("https://skills.sh")}\n`)
}

export function registerSkills(program: Command) {
  program
    .command("skills")
    .alias("sk")
    .description("Manage and browse skills — list, install, update, uninstall, search")
    .option("-s, --search <query>", "Search skills.sh registry")
    .option("--json", "JSON output")
    .option("-i, --install <name>", "Install a skill from skills.sh")
    .option("-u, --update [name]", "Update all skills or a specific skill")
    .option("-r, --uninstall <name>", "Remove a skill")
    .option("-w, --watch", "Enable skill hot-reload")
    .action(handleSkills)
}
