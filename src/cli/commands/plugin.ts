import type { Command } from "commander"
import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises"
import { resolve, join } from "node:path"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { theme } from "../theme"

export function registerPlugin(program: Command): void {
  const pluginCmd = program
    .command("plugin")
    .alias("plugins")
    .description("Manage plugins (publish, install, list, remove, search, info)")

  // ── plugin publish <dir> ──────────────────────────────────────────
  pluginCmd
    .command("publish <dir>")
    .description("Publish a plugin from a directory containing plugin.yaml + dist/")
    .option("-k, --key <path>", "Path to private key file (default ~/.aegis/plugin-key.pem)")
    .action(async (dir: string, opts: { key?: string }) => {
      try {
        const { parseManifest } = await import("../../plugin/manifest")
        const { computeChecksum, signPlugin, generateKeyPair, importPrivateKey, exportPublicKey } =
          await import("../../plugin/signer")
        const { PluginRegistry } = await import("../../plugin/registry")

        const pluginDir = resolve(dir)
        const manifestPath = join(pluginDir, "plugin.yaml")
        if (!existsSync(manifestPath)) {
          console.log(theme.error(`\u2717 plugin.yaml not found in ${pluginDir}`))
          process.exit(1)
        }

        const yaml = await readFile(manifestPath, "utf-8")
        const manifest = parseManifest(yaml)

        const entrypointPath = resolve(pluginDir, manifest.entrypoint)
        if (!existsSync(entrypointPath)) {
          console.log(theme.error(`\u2717 Entrypoint ${manifest.entrypoint} not found in ${pluginDir}`))
          process.exit(2)
        }

        const distCode = await readFile(entrypointPath)
        const checksum = await computeChecksum(new Uint8Array(distCode))

        const keyPath = opts.key ? resolve(opts.key) : join(homedir(), ".aegis", "plugin-key.pem")
        let privateKey: CryptoKey
        if (existsSync(keyPath)) {
          const keyData = await readFile(keyPath)
          privateKey = await importPrivateKey(new Uint8Array(keyData).buffer)
        } else {
          const pair = await generateKeyPair()
          privateKey = pair.privateKey

          await mkdir(join(homedir(), ".aegis"), { recursive: true })

          const rawPrivate = await crypto.subtle.exportKey("raw", privateKey)
          await writeFile(keyPath, Buffer.from(rawPrivate))

          const pubKeyData = await exportPublicKey(pair.publicKey)
          const pubPath = keyPath.replace(/\.pem$/, ".pub")
          await writeFile(pubPath, Buffer.from(pubKeyData))

          console.log(theme.info(`\u2139 Generated new key pair`))
          console.log(theme.info(`  Private: ${keyPath}`))
          console.log(theme.info(`  Public:  ${pubPath}`))
        }

        const signature = await signPlugin(manifest, privateKey)

        const dbPath = join(homedir(), ".aegis", "plugins.db")
        const registry = new PluginRegistry(dbPath)
        registry.register(manifest, signature, checksum)
        registry.close()

        const storeDir = join(homedir(), ".aegis", "plugins", manifest.name, manifest.version)
        await mkdir(storeDir, { recursive: true })
        await cp(pluginDir, storeDir, { recursive: true })

        console.log(theme.success(`\u2713 Published ${manifest.name}@${manifest.version}`))
        console.log(theme.info(`  Signature: ${signature.slice(0, 16)}...${signature.slice(-8)}`))
        console.log(theme.info(`  Checksum:  ${checksum.slice(0, 16)}...`))
      } catch (err) {
        console.log(theme.error(`\u2717 Publish failed: ${(err as Error).message}`))
        process.exit(1)
      }
    })

  // ── plugin install <name> ─────────────────────────────────────────
  pluginCmd
    .command("install <name>")
    .description("Install a plugin by name (latest version)")
    .option("-v, --version <version>", "Specific version to install")
    .action(async (name: string, opts: { version?: string }) => {
      try {
        const { PluginRegistry } = await import("../../plugin/registry")
        const dbPath = join(homedir(), ".aegis", "plugins.db")
        const registry = new PluginRegistry(dbPath)

        const pluginDir = join(homedir(), ".aegis", "plugins", name)
        if (!existsSync(pluginDir)) {
          console.log(theme.error(`\u2717 Plugin '${name}' not found in local store`))
          process.exit(1)
        }

        const yaml = await readFile(join(pluginDir, "plugin.yaml"), "utf-8").catch(() => null)
        if (!yaml) {
          console.log(theme.error(`\u2717 Corrupted plugin: no plugin.yaml in ${pluginDir}`))
          process.exit(1)
        }

        const { parseManifest } = await import("../../plugin/manifest")
        const manifest = parseManifest(yaml)
        const version = opts.version ?? manifest.version
        registry.incrementInstalls(manifest.name, version)
        registry.close()

        console.log(theme.success(`\u2713 Installed ${name}@${version}`))
      } catch (err) {
        console.log(theme.error(`\u2717 Install failed: ${(err as Error).message}`))
        process.exit(1)
      }
    })

  // ── plugin list ───────────────────────────────────────────────────
  pluginCmd
    .command("list")
    .description("List all installed plugins")
    .action(async () => {
      try {
        const { PluginRegistry } = await import("../../plugin/registry")
        const dbPath = join(homedir(), ".aegis", "plugins.db")
        const registry = new PluginRegistry(dbPath)
        const plugins = registry.list()
        registry.close()

        if (plugins.length === 0) {
          console.log(theme.info("No plugins installed"))
          return
        }

        console.log(theme.heading(`Plugins (${plugins.length}):`))
        for (const p of plugins) {
          const line = `  ${p.name}@${p.version}  ${p.description ? `- ${p.description}` : ""}`
          console.log(theme.info(line))
        }
      } catch (err) {
        console.log(theme.error(`\u2717 List failed: ${(err as Error).message}`))
        process.exit(1)
      }
    })

  // ── plugin remove <name> ──────────────────────────────────────────
  pluginCmd
    .command("remove <name>")
    .description("Remove an installed plugin")
    .action(async (name: string) => {
      try {
        const { PluginRegistry } = await import("../../plugin/registry")
        const dbPath = join(homedir(), ".aegis", "plugins.db")
        const registry = new PluginRegistry(dbPath)
        registry.remove(name)
        registry.close()

        const pluginDir = join(homedir(), ".aegis", "plugins", name)
        if (existsSync(pluginDir)) {
          await rm(pluginDir, { recursive: true, force: true })
        }

        console.log(theme.success(`\u2713 Removed ${name}`))
      } catch (err) {
        console.log(theme.error(`\u2717 Remove failed: ${(err as Error).message}`))
        process.exit(1)
      }
    })

  // ── plugin search <query> ─────────────────────────────────────────
  pluginCmd
    .command("search <query>")
    .description("Search plugins by name or description")
    .action(async (query: string) => {
      try {
        const { PluginRegistry } = await import("../../plugin/registry")
        const dbPath = join(homedir(), ".aegis", "plugins.db")
        const registry = new PluginRegistry(dbPath)
        const results = registry.search(query)
        registry.close()

        if (results.length === 0) {
          console.log(theme.info(`No plugins matching "${query}"`))
          return
        }

        console.log(theme.heading(`Results (${results.length}):`))
        for (const p of results) {
          console.log(theme.info(`  ${p.name}@${p.version}  ${p.description ?? ""}`))
        }
      } catch (err) {
        console.log(theme.error(`\u2717 Search failed: ${(err as Error).message}`))
        process.exit(1)
      }
    })

  // ── plugin info <name> ────────────────────────────────────────────
  pluginCmd
    .command("info <name>")
    .description("Show detailed plugin info")
    .option("-v, --version <version>", "Specific version")
    .action(async (name: string, opts: { version?: string }) => {
      try {
        const { PluginRegistry } = await import("../../plugin/registry")
        const dbPath = join(homedir(), ".aegis", "plugins.db")
        const registry = new PluginRegistry(dbPath)
        const plugin = registry.get(name, opts.version)
        registry.close()

        if (!plugin) {
          console.log(theme.error(`\u2717 Plugin '${name}' not found`))
          process.exit(1)
        }

        console.log(theme.heading(`${plugin.name}@${plugin.version}`))
        console.log(theme.info(`  Description: ${plugin.description ?? "N/A"}`))
        console.log(theme.info(`  Author: ${plugin.author ?? "N/A"}`))
        console.log(theme.info(`  License: ${plugin.license ?? "N/A"}`))
        console.log(theme.info(`  Signature: ${plugin.signature.slice(0, 16)}...`))
        console.log(theme.info(`  Checksum: ${plugin.checksum.slice(0, 16)}...`))
        console.log(theme.info(`  Installs: ${plugin.installs_count}`))
        const date = new Date(plugin.created_at * 1000).toISOString().slice(0, 10)
        console.log(theme.info(`  Published: ${date}`))
      } catch (err) {
        console.log(theme.error(`\u2717 Info failed: ${(err as Error).message}`))
        process.exit(1)
      }
    })
}
