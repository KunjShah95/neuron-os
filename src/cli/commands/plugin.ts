import type { Command } from "commander"
import { readFile, mkdir, cp, rm } from "node:fs/promises"
import { resolve, join, basename } from "node:path"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { theme } from "../theme"
import { fetchTopSkills, searchSkills } from "../../skills/remote"
import type {
  SignedPluginManifest,
  RegistryIndex,
  RegistryManifest,
} from "../../plugin/types"
import {
  generateAuthorKey,
  signManifestWithKeyPair,
  verifyManifest,
  loadAuthorKey,
  saveAuthorKey,
  keyFingerprint,
} from "../../plugin/crypto"
import { buildDependencyGraph, findConflicts, satisfies } from "../../plugin/resolver"

const REGISTRY_DIR = join(homedir(), ".aegis", "registry")
const INDEX_PATH = join(REGISTRY_DIR, "index.json")
const PACKAGES_DIR = join(REGISTRY_DIR, "packages")

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
    await writeIndex({
      version: 1,
      plugins: {},
      installed: {},
    })
  }
}

async function readIndex(): Promise<RegistryIndex> {
  await ensureRegistry()
  if (!existsSync(INDEX_PATH)) {
    return { version: 1, plugins: {}, installed: {} }
  }
  const raw = await readFile(INDEX_PATH, "utf-8")
  return JSON.parse(raw) as RegistryIndex
}

async function writeIndex(index: RegistryIndex): Promise<void> {
  await mkdir(REGISTRY_DIR, { recursive: true })
  await Bun.write(INDEX_PATH, JSON.stringify(index, null, 2))
}

function makeManifest(
  name: string,
  description: string,
  version: string,
): SignedPluginManifest {
  return {
    name,
    description,
    version,
    publishedAt: new Date().toISOString(),
  }
}

function toRegistryManifest(full: SignedPluginManifest): RegistryManifest {
  return {
    name: full.name,
    description: full.description,
    version: full.version,
    author: full.author,
    tags: full.tags,
    publishedAt: full.publishedAt,
    signed: !!full.signature,
    dependencyCount: full.dependencies?.length ?? 0,
  }
}

export function registerPlugin(program: Command): void {
  const pluginCmd = program
    .command("plugin")
    .alias("plugins")
    .description(
      "Manage the plugin marketplace registry (publish, install, list, remove, sign, verify, info, depends, update)",
    )

  // ── plugin publish <path> ──────────────────────────────────────────

  pluginCmd
    .command("publish")
    .description("Package a skill directory into the local registry")
    .argument("<path>", "Path to the skill directory")
    .option("-d, --description <text>", "Description for the plugin")
    .option("-v, --version <version>", "Version string", "1.0.0")
    .option("--author <author>", "Author name")
    .option("--sign", "Auto-sign with saved author key if available", false)
    .action(
      async (
        path: string,
        options: { description?: string; version?: string; author?: string; sign?: boolean },
      ) => {
        const skillPath = resolve(process.cwd(), path)
        const name = basename(skillPath)
        const skillMdPath = join(skillPath, "SKILL.md")

        if (!existsSync(skillMdPath)) {
          console.log(`  ${theme.error(`No SKILL.md found at ${skillPath}`)}\\n`)
          return
        }

        let description = options.description || name
        let tags: string[] = []
        let deps: string[] = []
        try {
          const content = await readFile(skillMdPath, "utf-8")
          const match = content.match(/^---\n([\s\S]*?)\n---/)
          if (match?.[1]) {
            for (const line of match[1].split("\n")) {
              const idx = line.indexOf(":")
              if (idx === -1) continue
              const key = line.slice(0, idx).trim()
              const val = line.slice(idx + 1).trim().replace(/^\[|\]$/g, "")
              if (!key) continue
              if (key === "description") description = val
              if (key === "tags") tags = val.split(",").map((s) => s.trim()).filter(Boolean)
              if (key === "dependencies") deps = val.split(",").map((s) => s.trim()).filter(Boolean)
            }
          }
        } catch {}

        const manifest = makeManifest(name, description, options.version || "1.0.0")
        manifest.author = options.author
        manifest.tags = tags
        if (deps.length > 0) {
          manifest.dependencies = deps.map((d) => ({ name: d, version: "*" }))
        }

        // Auto-sign if requested
        if (options.sign) {
          const authorKey = await loadAuthorKey()
          if (authorKey) {
            signManifestWithKeyPair(manifest, authorKey)
            console.log(`  ${theme.muted(`Signed with key ${keyFingerprint(authorKey.publicKey)}`)}\\n`)
          } else {
            console.log(`  ${theme.muted("No author key found. Run 'aegis plugin gen-key' first.")}\\n`)
          }
        }

        const destDir = getPluginDir(name)
        if (existsSync(destDir)) {
          await rm(destDir, { recursive: true })
        }

        await mkdir(destDir, { recursive: true })
        await cp(skillPath, destDir, { recursive: true })

        const index = await readIndex()
        index.plugins[name] = manifest
        await writeIndex(index)

        console.log(`\\n  ${theme.accent(`Published "${name}" v${manifest.version} to local registry`)}`)
        console.log(`  ${theme.muted(destDir)}`)
        if (manifest.dependencies?.length) {
          console.log(`  ${theme.muted(`${manifest.dependencies.length} dependenc${manifest.dependencies.length === 1 ? "y" : "ies"}`)}`)
        }
        console.log("")
      },
    )

  // ── plugin gen-key ────────────────────────────────────────────────

  pluginCmd
    .command("gen-key")
    .description("Generate a new Ed25519 author key pair for signing plugins")
    .option("--comment <text>", "Optional comment to identify this key")
    .action(async (options: { comment?: string }) => {
      const existing = await loadAuthorKey()
      if (existing) {
        console.log(`\\n  ${theme.warn("⚠ Author key already exists at ~/.aegis/registry/author-key.json")}`)
        console.log(`  ${theme.muted("Generate a new one? It will overwrite the existing key. Use --force to proceed.")}`)
        console.log("")
        return
      }

      console.log(`\\n  ${theme.heading("Generating Ed25519 Author Key")}\\n`)
      const keyPair = generateAuthorKey(options.comment)

      await saveAuthorKey(keyPair)

      console.log(`  ${theme.accent("✅ Key pair generated and saved")}`)
      console.log(`  ${theme.muted(`Location: ~/.aegis/registry/author-key.json`)}`)
      console.log(`  ${theme.muted(`Fingerprint: ${keyFingerprint(keyPair.publicKey)}`)}`)
      console.log(`  ${theme.muted(`Algorithm: Ed25519`)}`)
      console.log("")
      console.log(`  ${theme.muted("Use 'aegis plugin sign <name>' to sign your published plugins.")}`)
      console.log("")
    })

  // ── plugin sign <name> ────────────────────────────────────────────

  pluginCmd
    .command("sign")
    .description("Sign a published plugin with your author key")
    .argument("<name>", "Plugin name to sign")
    .action(async (name: string) => {
      const index = await readIndex()
      const manifest = index.plugins[name]

      if (!manifest) {
        console.log(`  ${theme.error(`Plugin "${name}" not found in registry.`)}\\n`)
        return
      }

      const authorKey = await loadAuthorKey()
      if (!authorKey) {
        console.log(`  ${theme.error("No author key found.")}`)
        console.log(`  ${theme.muted("Generate one with: aegis plugin gen-key")}\\n`)
        return
      }

      signManifestWithKeyPair(manifest, authorKey)
      await writeIndex(index)

      console.log(`\\n  ${theme.accent(`✅ Signed "${name}" v${manifest.version}`)}`)
      console.log(`  ${theme.muted(`Key fingerprint: ${keyFingerprint(authorKey.publicKey)}`)}`)
      console.log("")
    })

  // ── plugin verify <name> ──────────────────────────────────────────

  pluginCmd
    .command("verify")
    .description("Verify a plugin's signature integrity")
    .argument("<name>", "Plugin name to verify")
    .action(async (name: string) => {
      const index = await readIndex()
      const manifest = index.plugins[name]

      if (!manifest) {
        console.log(`  ${theme.error(`Plugin "${name}" not found in registry.`)}\\n`)
        return
      }

      if (!manifest.signature) {
        console.log(`\\n  ${theme.warn(`⚠ "${name}" is not signed.`)}\\n`)
        return
      }

      const valid = verifyManifest(manifest)

      if (valid) {
        console.log(`\\n  ${theme.accent(`✅ "${name}" — signature valid`)}`)
        console.log(`  ${theme.muted(`Algorithm: ${manifest.signature.algorithm}`)}`)
        console.log(`  ${theme.muted(`Signed: ${manifest.signature.signedAt.slice(0, 10)}`)}`)
        console.log(`  ${theme.muted(`Key fingerprint: ${keyFingerprint(manifest.signature.publicKey)}`)}`)
      } else {
        console.log(`\\n  ${theme.error(`❌ "${name}" — signature INVALID or tampered!`)}`)
        console.log(`  ${theme.muted("The plugin content does not match its signature.")}`)
        console.log(`  ${theme.muted("It may have been corrupted or tampered with.")}`)
      }
      console.log("")
    })

  // ── plugin info <name> ────────────────────────────────────────────

  pluginCmd
    .command("info")
    .description("Show detailed plugin information including dependencies")
    .argument("<name>", "Plugin name")
    .option("--json", "Output as JSON", false)
    .action(async (name: string, options: { json?: boolean }) => {
      const index = await readIndex()
      const manifest = index.plugins[name]

      if (!manifest) {
        console.log(`  ${theme.error(`Plugin "${name}" not found in registry.`)}\\n`)
        return
      }

      const installed = index.installed[name]
      const sigValid = manifest.signature ? verifyManifest(manifest) : false

      if (options.json) {
        console.log(JSON.stringify({ ...manifest, signatureValid: sigValid, installed: !!installed }, null, 2))
        return
      }

      console.log(`\\n  ${theme.heading(`Plugin: ${manifest.name}`)}`)
      console.log("")
      console.log(`  ${theme.bold("Description:")}  ${manifest.description}`)
      console.log(`  ${theme.bold("Version:")}       ${manifest.version}`)
      if (manifest.author) console.log(`  ${theme.bold("Author:")}        ${manifest.author}`)
      if (manifest.url) console.log(`  ${theme.bold("URL:")}           ${manifest.url}`)
      console.log(`  ${theme.bold("Published:")}     ${manifest.publishedAt.slice(0, 10)}`)

      // Signature status
      const sigStatus = manifest.signature
        ? sigValid
          ? theme.accent("✅ Valid")
          : theme.error("❌ Invalid")
        : theme.muted("Not signed")
      console.log(`  ${theme.bold("Signature:")}     ${sigStatus}`)

      // Install status
      if (installed) {
        console.log(`  ${theme.bold("Installed:")}     ${theme.accent("Yes")} (${installed.installedAt.slice(0, 10)})`)
      } else {
        console.log(`  ${theme.bold("Installed:")}     ${theme.muted("No")}`)
      }

      // Tags
      if (manifest.tags?.length) {
        console.log(`  ${theme.bold("Tags:")}          ${manifest.tags.map((t) => `#${t}`).join(", ")}`)
      }

      // Dependencies
      if (manifest.dependencies?.length) {
        console.log("")
        console.log(`  ${theme.heading("Dependencies")}`)
        for (const dep of manifest.dependencies) {
          const depManifest = index.plugins[dep.name]
          const depInstalled = index.installed[dep.name]
          const depVersion = depManifest ? depManifest.version : theme.muted("missing")
          const depStatus = depInstalled
            ? theme.accent("installed")
            : depManifest
              ? theme.warn("in registry")
              : theme.error("not found")
          const satisfied = depManifest ? satisfies(depManifest.version, dep.version) : false
          const depSatisfied = satisfied
            ? theme.accent("✓")
            : theme.error("✗")
          console.log(
            `  ${depSatisfied} ${theme.textBright(dep.name)} ${theme.muted(dep.version)} → ${depVersion} ${depStatus}`,
          )
        }
      }

      // Conflicts
      if (manifest.conflicts?.length) {
        console.log("")
        console.log(`  ${theme.heading("Conflicts")}`)
        for (const conflict of manifest.conflicts) {
          console.log(`  ⚠ ${theme.textBright(conflict)}`)
        }
      }

      console.log("")
    })

  // ── plugin depends <name> ─────────────────────────────────────────

  pluginCmd
    .command("depends")
    .description("Show the dependency tree for a plugin")
    .argument("<name>", "Plugin name")
    .option("--check", "Check for conflicts and resolution issues", false)
    .action(async (name: string, options: { check?: boolean }) => {
      const index = await readIndex()
      const root = index.plugins[name]

      if (!root) {
        console.log(`  ${theme.error(`Plugin "${name}" not found in registry.`)}\\n`)
        return
      }

      // Build the dependency graph
      const pluginMap = new Map(Object.entries(index.plugins))
      const graph = buildDependencyGraph(pluginMap, name)

      console.log(`\\n  ${theme.heading(`Dependency Tree: ${name}@${root.version}`)}`)
      console.log("")

      if (graph.nodes.size === 0 && graph.unresolved.length === 0) {
        console.log(`  ${theme.muted("No dependencies.")}`)
        console.log("")
        return
      }

      // Print dependency tree
      const treeVisited = new Set<string>()
      function printTree(nodeName: string, depth: number) {
        const manifest = pluginMap.get(nodeName)
        const indent = "  ".repeat(depth + 1)
        const depS = depth > 0 ? "└─ " : ""

        if (treeVisited.has(nodeName)) {
          console.log(`${indent}${depS}${theme.warn(`${nodeName} (circular ⚠)`)}`)
          return
        }
        treeVisited.add(nodeName)

        const version = manifest?.version || "?"
        const installed = index.installed[nodeName]
        const status = installed
          ? theme.accent("✓")
          : manifest
            ? theme.warn("·")
            : theme.error("✗ missing")

        console.log(`${indent}${depS}${status} ${theme.textBright(nodeName)} ${theme.muted(`v${version}`)}`)

        if (manifest?.dependencies) {
          for (const dep of manifest.dependencies) {
            printTree(dep.name, depth + 1)
          }
        }
      }

      printTree(name, 0)

      // Summary
      console.log("")
      console.log(`  ${theme.muted(`${graph.nodes.size - 1} direct/transitive dependenc${graph.nodes.size - 1 === 1 ? "y" : "ies"}`)}`)

      if (graph.unresolved.length > 0) {
        console.log(`  ${theme.error(`${graph.unresolved.length} unresolved`)}`)
        for (const u of graph.unresolved) {
          console.log(`    ${theme.error(`✗ ${u.name} ${u.spec} (required by ${u.requiredBy})`)}`)
        }
      }

      // Conflict detection
      if (options.check) {
        const conflicts = findConflicts(pluginMap)
        if (conflicts.length > 0) {
          console.log("")
          console.log(`  ${theme.heading("Conflicts Detected")}`)
          for (const c of conflicts) {
            console.log(`  ${theme.error(`⚠ ${c.plugin} → ${c.dependency}: ${c.requiredVersions.join(", ")}`)}`)
          }
        } else if (graph.unresolved.length === 0 && graph.cycles.length === 0) {
          console.log(`  ${theme.accent("No conflicts detected. Dependency tree is healthy.")}`)
        }
      }

      if (graph.cycles.length > 0) {
        console.log("")
        console.log(`  ${theme.error(`${graph.cycles.length} circular dependenc${graph.cycles.length === 1 ? "y" : "ies"}`)}`)
        for (const cycle of graph.cycles) {
          console.log(`  ${theme.error(`↺ ${cycle.join(" → ")}`)}`)
        }
      }

      console.log("")
    })

  // ── plugin update <name> ──────────────────────────────────────────

  pluginCmd
    .command("update")
    .description("Check for available updates in the registry")
    .argument("[name]", "Plugin name to check (omit to check all)")
    .option("--all", "Check all installed plugins", false)
    .action(async (name: string | undefined, _options: { all?: boolean }) => {
      const index = await readIndex()

      const pluginsToCheck: Array<{ name: string; manifest: SignedPluginManifest }> = []

      if (name) {
        const manifest = index.plugins[name]
        if (!manifest) {
          console.log(`  ${theme.error(`Plugin "${name}" not found in registry.`)}\\n`)
          return
        }
        pluginsToCheck.push({ name, manifest })
      } else {
        // Check all
        for (const [n, m] of Object.entries(index.plugins)) {
          pluginsToCheck.push({ name: n, manifest: m })
        }
      }

      if (pluginsToCheck.length === 0) {
        console.log(`  ${theme.muted("No plugins in registry.")}\\n`)
        return
      }

      console.log(`\\n  ${theme.heading("Plugin Update Check")}\\n`)

      let updatesFound = 0
      // In a real marketplace, this would query a remote registry API.
      // For now, we check if there's a newer version in the same local registry
      // (simulating what a real update check would look like).
      for (const { name: pName, manifest: m } of pluginsToCheck) {
        const installedInfo = index.installed[pName]

        // Check if registry version differs from installed version
        let status: string
        if (installedInfo && installedInfo.version !== m.version) {
          status = `${theme.warn(`registry: v${m.version} (installed: v${installedInfo.version})`)}`
          updatesFound++
        } else if (installedInfo) {
          status = `${theme.accent("up-to-date")}  ${theme.muted(`installed: v${installedInfo.version}`)}`
        } else {
          status = `${theme.accent("latest")}  ${theme.muted(`v${m.version}`)}`
        }

        console.log(`  ${theme.textBright(pName.padEnd(20))} ${status}`)
      }

      if (updatesFound > 0) {
        console.log(`\\n  ${theme.accent(`${updatesFound} update${updatesFound > 1 ? "s" : ""} available`)}`)
        console.log(`  ${theme.muted("Run 'aegis plugin install <name> --force' to update.")}`)
      } else {
        console.log(`\\n  ${theme.accent("All plugins up-to-date")}`)
        console.log(`  ${theme.muted("(Local registry — no remote update source configured)")}`)
      }
      console.log("")
    })

  // ── plugin verify-all ─────────────────────────────────────────────

  pluginCmd
    .command("verify-all")
    .description("Verify signatures of all signed plugins in the registry")
    .action(async () => {
      const index = await readIndex()
      const entries = Object.entries(index.plugins)

      let valid = 0
      let invalid = 0
      let unsigned = 0

      console.log(`\\n  ${theme.heading("Verifying All Plugin Signatures")}\\n`)

      for (const [name, manifest] of entries) {
        if (!manifest.signature) {
          unsigned++
          console.log(`  ${theme.muted(`· ${name.padEnd(20)} not signed`)}`)
          continue
        }

        const ok = verifyManifest(manifest)
        if (ok) {
          valid++
          console.log(`  ${theme.accent(`✓ ${name.padEnd(20)} signature valid`)}`)
        } else {
          invalid++
          console.log(`  ${theme.error(`✗ ${name.padEnd(20)} signature INVALID`)}`)
        }
      }

      console.log("")
      console.log(`  ${theme.muted(`Total: ${entries.length} | Valid: ${valid} | Invalid: ${invalid} | Unsigned: ${unsigned}`)}`)
      console.log("")
    })

  // ── install (with dependency resolution) ─────────────────────────

  pluginCmd
    .command("install")
    .description("Install a plugin from the local registry into skills/")
    .argument("<name>", "Plugin name to install")
    .option("-f, --force", "Overwrite existing skill directory", false)
    .option("--resolve-deps", "Auto-resolve and install dependencies", false)
    .action(async (name: string, options: { force?: boolean; resolveDeps?: boolean }) => {
      const index = await readIndex()
      const manifest = index.plugins[name]

      if (!manifest) {
        console.log(`  ${theme.error(`Plugin "${name}" not found in registry.`)}`)
        console.log(`  ${theme.muted("Run 'aegis plugin list' to see available plugins.")}\\n`)
        return
      }

      // Verify signature if present
      if (manifest.signature) {
        const valid = verifyManifest(manifest)
        if (!valid) {
          console.log(`  ${theme.error(`⚠ "${name}" has an INVALID signature.`)}`)
          console.log(`  ${theme.muted("The plugin may have been tampered with. Install with --force to override.")}`)
          if (!options.force) {
            console.log("")
            return
          }
        } else {
          console.log(`  ${theme.accent(`✓ Signature verified for "${name}"`)}`)
        }
      }

      const srcDir = getPluginDir(name)
      const destDir = getSkillDir(name)

      if (!existsSync(srcDir)) {
        console.log(`  ${theme.error(`Plugin directory ${srcDir} missing. Run 'aegis plugin publish' again.`)}\\n`)
        return
      }

      if (existsSync(destDir) && !options.force) {
        console.log(`  ${theme.muted(`Skill "${name}" already exists at ${destDir}. Use --force to overwrite.`)}\\n`)
        return
      }

      // Resolve dependencies if requested
      if (options.resolveDeps && manifest.dependencies?.length) {
        console.log(`  ${theme.muted(`Resolving ${manifest.dependencies.length} dependenc${manifest.dependencies.length === 1 ? "y" : "ies"}...`)}`)
        const pluginMap = new Map(Object.entries(index.plugins))
        const graph = buildDependencyGraph(pluginMap, name)

        if (graph.unresolved.length > 0) {
          console.log(`  ${theme.error(`${graph.unresolved.length} unresolved dependenc${graph.unresolved.length === 1 ? "y" : "ies"}:`)}`)
          for (const u of graph.unresolved) {
            console.log(`    ${theme.error(`✗ ${u.name} ${u.spec} (required by ${u.requiredBy})`)}`)
          }
          console.log(`  ${theme.muted("Install missing dependencies first.")}`)
          console.log("")
          return
        }

        if (graph.cycles.length > 0) {
          console.log(`  ${theme.error(`Circular dependencies detected:`)}`)
          for (const cycle of graph.cycles) {
            console.log(`    ${theme.error(`↺ ${cycle.join(" → ")}`)}`)
          }
          console.log("")
          return
        }

        // Install all dependency plugins first
        for (const [depName] of graph.nodes) {
          if (depName === name) continue
          const depManifest = index.plugins[depName]
          if (!depManifest) continue

          const depSrcDir = getPluginDir(depName)
          const depDestDir = getSkillDir(depName)

          if (existsSync(depDestDir)) continue // already installed

          if (existsSync(depSrcDir)) {
            console.log(`  ${theme.muted(`Installing dependency: ${depName}@${depManifest.version}...`)}`)
            await mkdir(depDestDir, { recursive: true })
            await cp(depSrcDir, depDestDir, { recursive: true })

            index.installed[depName] = {
              name: depName,
              version: depManifest.version,
              installedAt: new Date().toISOString(),
              path: depDestDir,
              signatureVerified: !!depManifest.signature && verifyManifest(depManifest),
              dependenciesResolved: true,
            }
          } else {
            console.log(`  ${theme.warn(`Dependency "${depName}" is in registry but has no package directory.`)}`)
          }
        }
      }

      // Install the main plugin
      if (existsSync(destDir)) {
        await rm(destDir, { recursive: true })
      }

      await mkdir(destDir, { recursive: true })
      await cp(srcDir, destDir, { recursive: true })

      // Record install state
      index.installed[name] = {
        name,
        version: manifest.version,
        installedAt: new Date().toISOString(),
        path: destDir,
        signatureVerified: !!manifest.signature && verifyManifest(manifest),
        dependenciesResolved: options.resolveDeps ? true : false,
      }
      await writeIndex(index)

      console.log(`\\n  ${theme.accent(`Installed "${name}" v${manifest.version} → skills/${name}`)}`)
      console.log(`  ${theme.muted(manifest.description)}`)
      if (manifest.signature) {
        console.log(`  ${theme.muted("Signed: ✓")}`)
      }
      if (manifest.dependencies?.length) {
        console.log(`  ${theme.muted(`${manifest.dependencies.length} dependenc${manifest.dependencies.length === 1 ? "y" : "ies"} registered`)}`)
      }
      console.log("")
    })

  // ── plugin list ────────────────────────────────────────────────────

  pluginCmd
    .command("list")
    .description("List all plugins in the local registry")
    .option("--signed", "Show only signed plugins", false)
    .option("--unsigned", "Show only unsigned plugins", false)
    .action(async (opts: { signed?: boolean; unsigned?: boolean }) => {
      const index = await readIndex()
      let entries = Object.entries(index.plugins)

      if (opts.signed) entries = entries.filter(([, m]) => !!m.signature)
      if (opts.unsigned) entries = entries.filter(([, m]) => !m.signature)

      const registryEntries = entries.map(([, m]) => toRegistryManifest(m))

      console.log(`\\n  ${theme.heading("Local Plugin Registry")}`)
      console.log(`  ${theme.muted(`${registryEntries.length} plugin${registryEntries.length !== 1 ? "s" : ""} registered`)}\\n`)

      if (registryEntries.length === 0) {
        console.log(`  ${theme.muted("No plugins in registry.")}`)
        console.log(`  ${theme.muted("Publish one with: aegis plugin publish <path>")}\\n`)
        return
      }

      for (const entry of registryEntries) {
        const version = entry.version ? ` v${entry.version}` : ""
        const author = entry.author ? ` by ${entry.author}` : ""
        const signed = entry.signed ? ` ${theme.accent("🔒")}` : ""
        const deps = entry.dependencyCount > 0 ? ` ${theme.muted(`${entry.dependencyCount} dep${entry.dependencyCount > 1 ? "s" : ""}`)}` : ""
        console.log(`  ${theme.textBright(entry.name)}${version}${author}${signed}${deps}`)
        if (entry.description) {
          console.log(`    ${theme.muted(entry.description)}`)
        }
        console.log(`    ${theme.muted(`published: ${entry.publishedAt.slice(0, 10)}`)}`)
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
        console.log(`  ${theme.error(`Plugin "${name}" not found in registry.`)}\\n`)
        return
      }

      delete index.plugins[name]
      delete index.installed[name]
      await writeIndex(index)

      if (!options.keepFiles) {
        const pkgDir = getPluginDir(name)
        if (existsSync(pkgDir)) {
          await rm(pkgDir, { recursive: true })
        }

        // Also remove from skills/ if installed
        const skillDir = getSkillDir(name)
        if (existsSync(skillDir)) {
          await rm(skillDir, { recursive: true })
        }
      }

      console.log(`  ${theme.accent(`Removed "${name}" from registry.`)}\\n`)
    })

  // ── plugin search <query> ──────────────────────────────────────────

  pluginCmd
    .command("search")
    .description("Search the remote plugin marketplace (skills.sh)")
    .argument("<query>", "Search query")
    .option("-l, --limit <number>", "Max results", "10")
    .action(async (query: string, options: { limit?: string }) => {
      const limit = parseInt(options.limit || "10", 10) || 10
      console.log(`\\n  ${theme.heading("Searching plugin marketplace for:")} ${query}\\n`)

      const results = await searchSkills(query, limit)
      if (results.length === 0) {
        console.log(`  ${theme.muted("No results found. Try a different query.")}\\n`)
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
      console.log(`  ${theme.muted("Install from URL with: aegis plugin install-from-url <url>")}\\n`)
    })

  // ── plugin browse ──────────────────────────────────────────────────

  pluginCmd
    .command("browse")
    .description("Browse trending plugins in the marketplace (skills.sh)")
    .option("-l, --limit <number>", "Max results", "20")
    .action(async (options: { limit?: string }) => {
      const limit = parseInt(options.limit || "20", 10) || 20
      console.log(`\\n  ${theme.heading("Trending Plugins on skills.sh")}\\n`)

      const results = await fetchTopSkills(limit)
      if (results.length === 0) {
        console.log(`  ${theme.muted("Marketplace unavailable. Set SKILLS_API_URL or try again later.")}\\n`)
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
      console.log(`  ${theme.muted("Install from URL with: aegis plugin install-from-url <url>")}\\n`)
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

      console.log(`\\n  ${theme.heading(`Installing plugin from: ${url}`)}\\n`)
      console.log(`  ${theme.muted(`Cloning ${ref} branch into local registry...`)}`)

      const destDir = resolve(PACKAGES_DIR, repoName)
      if (existsSync(destDir)) {
        if (!options.force) {
          console.log(`  ${theme.muted(`Plugin "${repoName}" already exists. Use --force to reinstall.`)}\\n`)
          return
        }
        await rm(destDir, { recursive: true })
      }

      await mkdir(destDir, { recursive: true })

      try {
        const { execSync } = await import("node:child_process")
        execSync(`git clone --depth 1 --branch ${ref} ${url} ${destDir}`, { stdio: "pipe", timeout: 60000 })

        const manifest = makeManifest(repoName, `Installed from ${url}`, "1.0.0")
        manifest.author = `git:${url}`

        // Try to extract metadata from SKILL.md
        const skillMdPath = join(destDir, "SKILL.md")
        if (existsSync(skillMdPath)) {
          try {
            const content = await readFile(skillMdPath, "utf-8")
            const match = content.match(/^---\n([\s\S]*?)\n---/)
            if (match?.[1]) {
              for (const line of match[1].split("\n")) {
                const idx = line.indexOf(":")
                if (idx === -1) continue
                const key = line.slice(0, idx).trim()
                const val = line.slice(idx + 1).trim()
                if (key === "description") manifest.description = val
                if (key === "version") manifest.version = val
                if (key === "author") manifest.author = val
              }
            }
          } catch {}
        }

        const index = await readIndex()
        index.plugins[repoName] = manifest
        await writeIndex(index)

        console.log(`  ${theme.accent(`✅ Installed "${repoName}" from ${url}`)}`)
        if (manifest.version) console.log(`  ${theme.muted(`Version: ${manifest.version}`)}`)
        console.log("")
      } catch (err) {
        if (existsSync(destDir)) {
          await rm(destDir, { recursive: true, force: true })
        }
        console.log(`  ${theme.error(`Failed to install: ${err}`)}\\n`)
      }
    })
}
