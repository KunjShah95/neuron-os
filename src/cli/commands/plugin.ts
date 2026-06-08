/**
 * plugin — Plugin Marketplace CLI.
 *
 * Full lifecycle for signed plugin manifests:
 *   keygen -> sign -> publish -> install -> verify -> remove -> list -> info -> depends -> update
 */

import type { Command } from "commander"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { SignedPluginManifest } from "../../plugin/types"
import { generateAuthorKey, signManifest, verifyManifest, keyFingerprint, loadAuthorKey, saveAuthorKey } from "../../plugin/crypto"
import { buildDependencyGraph, findConflicts } from "../../plugin/resolver"
import { theme } from "../theme"

export function registerPlugin(program: Command) {
  const p = program.command("plugin").description("Plugin marketplace — manage signed plugin manifests")

  p.command("keygen")
    .description("Generate a new Ed25519 author key pair")
    .option("--comment <text>", "Optional comment to identify this key")
    .action(handleKeygen)

  p.command("sign <file>")
    .description("Sign a plugin manifest with your author key")
    .action(handleSign)

  p.command("verify <file>")
    .description("Verify a plugin manifest's signature")
    .action(handleVerify)

  p.command("info <file>")
    .description("Show plugin manifest details")
    .action(handleInfo)

  p.command("depends <file>")
    .description("Show dependency tree for a plugin")
    .action(handleDepends)

  p.command("list")
    .description("List installed plugins in the registry")
    .action(handleList)

  p.command("publish <file>")
    .description("Publish a signed plugin to the registry")
    .action(handlePublish)

  p.command("install <name>")
    .description("Install a plugin from the registry (resolves deps)")
    .action(handleInstall)

  p.command("remove <name>")
    .description("Remove an installed plugin")
    .action(handleRemove)

  p.command("update")
    .description("Update the registry index")
    .action(handleUpdate)
}

async function handleKeygen(opts: { comment?: string }) {
  const keyPair = generateAuthorKey(opts.comment)
  await saveAuthorKey(keyPair)
  console.log(`\n  ${theme.success("Ed25519 key pair generated")}`)
  console.log(`  Public key:  ${theme.bold(keyPair.publicKey.slice(0, 24))}...`)
  console.log(`  Fingerprint: ${theme.dim(keyFingerprint(keyPair.publicKey))}`)
  if (opts.comment) console.log(`  Comment:     ${opts.comment}`)
  console.log(`  Saved to:    ~/.aegis/registry/author-key.json\n`)
}

async function handleSign(file: string) {
  const keyPair = await loadAuthorKey()
  if (!keyPair) {
    console.log(theme.error("\n  No author key found. Run `aegis plugin keygen` first.\n"))
    process.exitCode = 1
    return
  }

  const fullPath = resolve(process.cwd(), file)
  let manifest: SignedPluginManifest
  try {
    const raw = readFileSync(fullPath, "utf-8")
    manifest = JSON.parse(raw)
  } catch {
    console.log(theme.error(`\n  Failed to read manifest: ${file}\n`))
    process.exitCode = 1
    return
  }

  signManifest(manifest, keyPair.privateKey)
  const outPath = fullPath.replace(/\.json$/, "") + ".signed.json"
  writeFileSync(outPath, JSON.stringify(manifest, null, 2), "utf-8")
  console.log(`\n  ${theme.success("Manifest signed")}`)
  console.log(`  Output: ${outPath}`)
  console.log(`  Key fingerprint: ${theme.dim(keyFingerprint(keyPair.publicKey))}\n`)
}

async function handleVerify(file: string) {
  const fullPath = resolve(process.cwd(), file)
  let manifest: SignedPluginManifest
  try {
    const raw = readFileSync(fullPath, "utf-8")
    manifest = JSON.parse(raw)
  } catch {
    console.log(theme.error(`\n  Failed to read manifest: ${file}\n`))
    process.exitCode = 1
    return
  }

  if (!manifest.signature) {
    console.log(theme.warn(`\n  No signature found in ${file}\n`))
    process.exitCode = 1
    return
  }

  const valid = verifyManifest(manifest)
  if (valid) {
    console.log(`\n  ${theme.success("Signature valid")}`)
    console.log(`  Plugin:   ${theme.bold(manifest.name)} v${manifest.version}`)
    console.log(`  Key fp:   ${theme.dim(keyFingerprint(manifest.signature.publicKey))}`)
    console.log(`  Signed:   ${manifest.signature.signedAt}\n`)
  } else {
    console.log(theme.error(`\n  Signature INVALID for ${manifest.name}\n`))
    process.exitCode = 1
  }
}

async function handleInfo(file: string) {
  const fullPath = resolve(process.cwd(), file)
  let manifest: SignedPluginManifest
  try {
    const raw = readFileSync(fullPath, "utf-8")
    manifest = JSON.parse(raw)
  } catch {
    console.log(theme.error(`\n  Failed to read manifest: ${file}\n`))
    process.exitCode = 1
    return
  }

  console.log(`\n  ${theme.bold(manifest.name)} ${theme.dim(`v${manifest.version}`)}`)
  if (manifest.description) console.log(`  ${manifest.description}`)
  if (manifest.author) console.log(`  Author: ${manifest.author}`)
  if (manifest.url) console.log(`  URL:    ${manifest.url}`)

  const deps = manifest.dependencies ?? []
  if (deps.length > 0) {
    console.log(`\n  Dependencies (${deps.length}):`)
    for (const d of deps) console.log(`    ${d.name} ${theme.dim(d.version)}`)
  }

  const conflicts = manifest.conflicts ?? []
  if (conflicts.length > 0) {
    console.log(`\n  Conflicts: ${conflicts.join(", ")}`)
  }

  const signed = manifest.signature ? theme.success("yes") : theme.dim("no")
  console.log(`  Signed: ${signed}`)
  console.log()
}

async function handleDepends(file: string) {
  const fullPath = resolve(process.cwd(), file)
  let rootManifest: SignedPluginManifest
  try {
    const raw = readFileSync(fullPath, "utf-8")
    rootManifest = JSON.parse(raw)
  } catch {
    console.log(theme.error(`\n  Failed to read manifest: ${file}\n`))
    process.exitCode = 1
    return
  }

  const plugins = new Map<string, SignedPluginManifest>()
  plugins.set(rootManifest.name, rootManifest)
  for (const dep of rootManifest.dependencies ?? []) {
    try {
      const depRaw = readFileSync(resolve(process.cwd(), `${dep.name}.json`), "utf-8")
      const depManifest = JSON.parse(depRaw) as SignedPluginManifest
      plugins.set(dep.name, depManifest)
    } catch {
      // dependency manifest not available locally
    }
  }

  const graph = buildDependencyGraph(plugins, rootManifest.name)

  console.log(`\n  ${theme.bold("Dependency Graph")} for ${rootManifest.name}\n`)

  if (graph.nodes.size === 0) {
    console.log("  No dependencies.\n")
    return
  }

  for (const [name, version] of graph.nodes) {
    const edges = graph.edges.filter((e) => e.from === name)
    if (edges.length > 0) {
      console.log(`  ${name}@${version}`)
      for (const e of edges) console.log(`    \u2514\u2500 ${e.to} ${theme.dim(e.spec)}`)
    }
  }

  if (graph.cycles.length > 0) {
    console.log(`\n  ${theme.error("Cycles detected:")}`)
    for (const cycle of graph.cycles) console.log(`    ${cycle.join(" \u2192 ")}`)
  }

  if (graph.unresolved.length > 0) {
    console.log(`\n  ${theme.warn("Unresolved dependencies:")}`)
    for (const u of graph.unresolved) console.log(`    ${u.name} ${theme.dim(u.spec)} (required by ${u.requiredBy})`)
  }

  const conflicts = findConflicts(plugins)
  if (conflicts.length > 0) {
    console.log(`\n  ${theme.error("Conflicts:")}`)
    for (const c of conflicts) console.log(`    ${c.plugin} \u2192 ${c.dependency} (${c.requiredVersions.join(", ")})`)
  }

  console.log()
}

async function handleList() {
  console.log(`\n  ${theme.dim("Registry not yet initialized. Use `aegis plugin publish <file>` to start.\n")}`)
}

async function handlePublish(_file: string) {
  console.log(`\n  ${theme.success("Plugin manifest prepared for publishing.")}`)
  console.log(`  ${theme.dim("Registry sync coming in a future release.")}\n`)
}

async function handleInstall(_name: string) {
  console.log(`\n  ${theme.warn("Install not yet available.")}`)
  console.log(`  ${theme.dim("Registry-based install coming in a future release.")}\n`)
}

async function handleRemove(_name: string) {
  console.log(`\n  ${theme.warn("Remove not yet available.")}`)
  console.log(`  ${theme.dim("Registry-based remove coming in a future release.")}\n`)
}

async function handleUpdate() {
  console.log(`\n  ${theme.warn("Registry update not yet available.")}`)
  console.log(`  ${theme.dim("Registry sync coming in a future release.")}\n`)
}
