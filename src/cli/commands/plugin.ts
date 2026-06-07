import type { Command } from "commander"
import { readFile, mkdir, cp, rm } from "node:fs/promises"
import { resolve, join, basename } from "node:path"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { theme } from "../theme"
import { fetchTopSkills, searchSkills } from "../../skills/remote"

const REGISTRY_DIR = join(homedir(), ".aegis", "registry")
const INDEX_PATH = join(REGISTRY_DIR, "index.json")
const PACKAGES_DIR = join(REGISTRY_DIR, "packages")

interface PluginManifest {
  name: string
  description: string
  version: string
  author?: string
  tags?: string[]
  publishedAt: string
}

interface RegistryIndex {
  plugins: Record<string, PluginManifest>
}

function getSkillDir(name: string): string {
  return resolve(process.cwd(), "skills", name)
}

function getPluginDir(name: string): string {
  return join(PACKAGES_DIR, name)
}

async function ensureRegistry(): Promise<void> {
  if (!existsSync(REGISTRY_DIR)) {
    await mkdir(REGISTRY_DIR, { recursive: true })
    await mkdir(PACKAGES_DIR, { recursive: true })
    await writeIndex({ plugins: {} })
  }
}

async function readIndex(): Promise<RegistryIndex> {
  await ensureRegistry()
  if (!existsSync(INDEX_PATH)) return { plugins: {} }
  const raw = await readFile(INDEX_PATH, "utf-8")
  return JSON.parse(raw) as RegistryIndex
}

async function writeIndex(index: RegistryIndex): Promise<void> {
  await mkdir(REGISTRY_DIR, { recursive: true })
  await Bun.write(INDEX_PATH, JSON.stringify(index, null, 2))
}

function makeManifest(name: string, description: string, version: string): PluginManifest {
  return {
    name,
    description,
    version,
    publishedAt: new Date().toISOString(),
  }
}

export function registerPlugin(program: Command): void {
  const pluginCmd = program
    .command("plugin")
    .alias("plugins")
    .description("Manage the local plugin registry (publish, install, list, remove)")

  // ── plugin publish <path> ──────────────────────────────────────────

  pluginCmd
    .command("publish")
    .description("Package a skill directory into the local registry")
    .argument("<path>", "Path to the skill directory")
    .option("-d, --description <text>", "Description for the plugin")
    .option("-v, --version <version>", "Version string", "1.0.0")
    .action(async (path: string, options: { description?: string; version?: string }) => {
      const skillPath = resolve(process.cwd(), path)
      const name = basename(skillPath)
      const skillMdPath = join(skillPath, "SKILL.md")

      if (!existsSync(skillMdPath)) {
        console.log(`  ${theme.error(`No SKILL.md found at ${skillPath}`)}\n`)
        return
      }

      let description = options.description || name
      try {
        const content = await readFile(skillMdPath, "utf-8")
        const match = content.match(/^---\n[\s\S]*?description:\s*(.+)\n[\s\S]*?\n---/)
        if (match?.[1]) description = match[1].trim()
      } catch {}

      const manifest = makeManifest(name, description, options.version || "1.0.0")

      const destDir = getPluginDir(name)
      if (existsSync(destDir)) {
        await rm(destDir, { recursive: true })
      }

      await mkdir(destDir, { recursive: true })
      await cp(skillPath, destDir, { recursive: true })

      const index = await readIndex()
      index.plugins[name] = manifest
      await writeIndex(index)

      console.log(`\n  ${theme.accent(`Published "${name}" to local registry`)}`)
      console.log(`  ${theme.muted(destDir)}\n`)
    })

  // ── plugin install <name> ──────────────────────────────────────────

  pluginCmd
    .command("install")
    .description("Install a plugin from the local registry into skills/")
    .argument("<name>", "Plugin name to install")
    .option("-f, --force", "Overwrite existing skill directory", false)
    .action(async (name: string, options: { force?: boolean }) => {
      const index = await readIndex()
      const manifest = index.plugins[name]

      if (!manifest) {
        console.log(`  ${theme.error(`Plugin "${name}" not found in registry.`)}`)
        console.log(`  ${theme.muted("Run 'aegis plugin list' to see available plugins.")}\n`)
        return
      }

      const srcDir = getPluginDir(name)
      const destDir = getSkillDir(name)

      if (!existsSync(srcDir)) {
        console.log(`  ${theme.error(`Plugin directory ${srcDir} missing. Run 'aegis plugin publish' again.`)}\n`)
        return
      }

      if (existsSync(destDir) && !options.force) {
        console.log(`  ${theme.muted(`Skill "${name}" already exists at ${destDir}. Use --force to overwrite.`)}\n`)
        return
      }

      if (existsSync(destDir)) {
        await rm(destDir, { recursive: true })
      }

      await mkdir(destDir, { recursive: true })
      await cp(srcDir, destDir, { recursive: true })

      console.log(`\n  ${theme.accent(`Installed "${name}" → skills/${name}`)}`)
      console.log(`  ${theme.muted(manifest.description)}\n`)
    })

  // ── plugin list ────────────────────────────────────────────────────

  pluginCmd
    .command("list")
    .description("List all plugins in the local registry")
    .action(async () => {
      const index = await readIndex()
      const entries = Object.entries(index.plugins)

      console.log(`\n  ${theme.heading("Local Plugin Registry")}`)
      console.log(`  ${theme.muted(`${entries.length} plugin${entries.length !== 1 ? "s" : ""} registered`)}\n`)

      if (entries.length === 0) {
        console.log(`  ${theme.muted("No plugins published yet.")}`)
        console.log(`  ${theme.muted("Publish one with: aegis plugin publish <path>")}\n`)
        return
      }

      for (const [name, manifest] of entries) {
        const version = manifest.version ? ` v${manifest.version}` : ""
        const author = manifest.author ? ` by ${manifest.author}` : ""
        console.log(`  ${theme.textBright(name)}${version}${author}`)
        if (manifest.description) {
          console.log(`    ${theme.muted(manifest.description)}`)
        }
        console.log(`    ${theme.muted(`published: ${manifest.publishedAt.slice(0, 10)}`)}`)
        console.log("")
      }
    })

  // ── plugin remove <name> ───────────────────────────────────────────

  pluginCmd
    .command("remove")
    .alias("rm")
    .description("Remove a plugin from the local registry")
    .argument("<name>", "Plugin name to remove")
    .option("--keep-files", "Keep the package directory on disk", false)
    .action(async (name: string, options: { keepFiles?: boolean }) => {
      const index = await readIndex()

      if (!index.plugins[name]) {
        console.log(`  ${theme.error(`Plugin "${name}" not found in registry.`)}\n`)
        return
      }

      delete index.plugins[name]
      await writeIndex(index)

      if (!options.keepFiles) {
        const pkgDir = getPluginDir(name)
        if (existsSync(pkgDir)) {
          await rm(pkgDir, { recursive: true })
        }
      }

      console.log(`  ${theme.accent(`Removed "${name}" from registry.`)}\n`)
    })

  // ── plugin search <query> ──────────────────────────────────────────

  pluginCmd
    .command("search")
    .description("Search the remote plugin marketplace (skills.sh)")
    .argument("<query>", "Search query")
    .option("-l, --limit <number>", "Max results", "10")
    .action(async (query: string, options: { limit?: string }) => {
      const limit = parseInt(options.limit || "10", 10) || 10
      console.log(`\n  ${theme.heading("Searching plugin marketplace for:")} ${query}\n`)

      const results = await searchSkills(query, limit)
      if (results.length === 0) {
        console.log(`  ${theme.muted("No results found. Try a different query.")}\n`)
        return
      }

      for (const skill of results) {
        const installs = skill.installs ? ` ${theme.muted(`${skill.installs.toLocaleString()} installs`)}` : ""
        const tagStr = skill.tags?.length > 0 ? ` ${theme.muted(skill.tags.map((t) => `#${t}`).join(" "))}` : ""
        console.log(`  ${theme.textBright(skill.name)}${installs}${tagStr}`)
        if (skill.description) {
          console.log(`    ${theme.muted(skill.description)}`)
        }
        console.log("")
      }
      console.log(`  ${theme.muted("Install with: aegis plugin install-from-url <url>")}\n`)
    })

  // ── plugin browse ──────────────────────────────────────────────────

  pluginCmd
    .command("browse")
    .description("Browse trending plugins in the marketplace (skills.sh)")
    .option("-l, --limit <number>", "Max results", "20")
    .action(async (options: { limit?: string }) => {
      const limit = parseInt(options.limit || "20", 10) || 20
      console.log(`\n  ${theme.heading("Trending Plugins on skills.sh")}\n`)

      const results = await fetchTopSkills(limit)
      if (results.length === 0) {
        console.log(`  ${theme.muted("Marketplace unavailable. Set SKILLS_API_URL or try again later.")}\n`)
        return
      }

      for (let i = 0; i < results.length; i++) {
        const skill = results[i]!
        const installs = skill.installs ? ` ${theme.muted(`${skill.installs.toLocaleString()} installs`)}` : ""
        const tagStr = skill.tags?.length > 0 ? ` ${theme.muted(skill.tags.map((t) => `#${t}`).join(" "))}` : ""
        console.log(`  ${(i + 1).toString().padStart(2, " ")}. ${theme.textBright(skill.name)}${installs}${tagStr}`)
        if (skill.description) {
          console.log(`     ${theme.muted(skill.description)}`)
        }
        console.log("")
      }
      console.log(`  ${theme.muted("Install with: aegis plugin install-from-url <url>")}\n`)
    })

  // ── plugin install-from-url <url> ──────────────────────────────────

  pluginCmd
    .command("install-from-url")
    .description("Install a plugin from a git URL (GitHub, GitLab, etc.)")
    .argument("<url>", "Git repository URL")
    .option("--name <name>", "Plugin name (default: repo name)")
    .option("--ref <ref>", "Branch, tag, or commit", "main")
    .option("-f, --force", "Overwrite existing skill directory", false)
    .action(async (url: string, options: { name?: string; ref?: string; force?: boolean }) => {
      const repoName = options.name || basename(url.replace(/\.git$/, ""))
      const ref = options.ref || "main"

      console.log(`\n  ${theme.heading(`Installing plugin from: ${url}`)}\n`)
      console.log(`  ${theme.muted(`Cloning ${ref} branch into local registry...`)}`)

      const destDir = resolve(PACKAGES_DIR, repoName)
      if (existsSync(destDir)) {
        if (!options.force) {
          console.log(`  ${theme.muted(`Plugin "${repoName}" already exists. Use --force to reinstall.`)}\n`)
          return
        }
        await rm(destDir, { recursive: true })
      }

      await mkdir(destDir, { recursive: true })

      try {
        const { execSync } = await import("node:child_process")
        execSync(`git clone --depth 1 --branch ${ref} ${url} ${destDir}`, { stdio: "pipe", timeout: 60000 })

        // Register in the index
        const manifest = makeManifest(repoName, `Installed from ${url}`, "1.0.0")
        manifest.author = `git:${url}`
        const index = await readIndex()
        index.plugins[repoName] = manifest
        await writeIndex(index)

        console.log(`  ${theme.accent(`✅ Installed "${repoName}" from ${url}`)}\n`)
      } catch (err) {
        // Clean up on failure
        if (existsSync(destDir)) {
          await rm(destDir, { recursive: true, force: true })
        }
        console.log(`  ${theme.error(`Failed to install: ${err}`)}\n`)
      }
    })
}
