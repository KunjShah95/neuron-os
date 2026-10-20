import type { Command } from "commander"
import { readFile, writeFile, mkdir, cp, rm, chmod, readdir } from "node:fs/promises"
import { resolve, join } from "node:path"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { theme } from "../theme"
import type { PluginManifest } from "../../plugin/manifest"

async function locatePlugin(name: string, version?: string): Promise<{ dir: string; manifest: PluginManifest } | null> {
  const { parseManifest } = await import("../../plugin/manifest")
  const root = join(homedir(), ".aegis", "plugins", name)
  const candidates: string[] = [root]

  if (version) {
    candidates.push(join(root, version))
  } else {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.isDirectory()) candidates.push(join(root, entry.name))
    }
  }

  for (const dir of candidates) {
    const manifestPath = join(dir, "plugin.yaml")
    if (!existsSync(manifestPath)) continue
    try {
      const yaml = await readFile(manifestPath, "utf-8")
      return { dir, manifest: parseManifest(yaml) }
    } catch {
      continue
    }
  }
  return null
}

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
        const { computeChecksum, signPlugin, generateKeyPair, importPrivateKey, exportPrivateKey, exportPublicKey } =
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
          try {
            privateKey = await importPrivateKey(new Uint8Array(keyData).buffer)
          } catch {
            console.log(
              theme.error(`\u2717 ${keyPath} is not a usable Ed25519 private key — remove it and publish again`),
            )
            process.exit(1)
          }
        } else {
          const pair = await generateKeyPair()
          privateKey = pair.privateKey

          await mkdir(join(homedir(), ".aegis"), { recursive: true })

          const rawPrivate = await exportPrivateKey(privateKey)
          await writeFile(keyPath, Buffer.from(rawPrivate))
          await chmod(keyPath, 0o600)

          const pubKeyData = await exportPublicKey(pair.publicKey)
          const pubPath = keyPath.replace(/\.pem$/, ".pub")
          await writeFile(pubPath, Buffer.from(pubKeyData))

          console.log(theme.info(`\u2139 Generated new key pair`))
          console.log(theme.info(`  Private: ${keyPath}`))
          console.log(theme.info(`  Public:  ${pubPath}`))
          console.log(theme.info(`  Trust it for local installs with: aegis plugin trust ${pubPath}`))
        }

        const signature = await signPlugin(manifest, privateKey)

        const dbPath = join(homedir(), ".aegis", "plugins.db")
        const registry = new PluginRegistry(dbPath)
        try {
          registry.register(manifest, signature, checksum)

          const storeDir = join(homedir(), ".aegis", "plugins", manifest.name, manifest.version)
          await mkdir(storeDir, { recursive: true })
          await cp(pluginDir, storeDir, { recursive: true })

          console.log(theme.success(`\u2713 Published ${manifest.name}@${manifest.version}`))
          console.log(theme.info(`  Signature: ${signature.slice(0, 16)}...${signature.slice(-8)}`))
          console.log(theme.info(`  Checksum:  ${checksum.slice(0, 16)}...`))
        } finally {
          registry.close()
        }
      } catch (err) {
        console.log(theme.error(`\u2717 Publish failed: ${String(err)}`))
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
        const { loadTrustedPluginKeys } = await import("../../plugin/crypto")
        const { importTrustedPublicKey, verifyPluginSignature, computeChecksum } = await import("../../plugin/signer")

        const dbPath = join(homedir(), ".aegis", "plugins.db")
        const registry = new PluginRegistry(dbPath)
        try {
          const located = await locatePlugin(name, opts.version)
          if (!located) {
            console.log(theme.error(`\u2717 Plugin '${name}' not found in local store`))
            process.exit(1)
          }
          const { dir: pluginDir, manifest } = located
          const version = opts.version ?? manifest.version

          const row = registry.get(manifest.name, version) ?? (opts.version ? undefined : registry.get(manifest.name))
          if (!row || !row.signature) {
            console.log(
              theme.error(`\u2717 Plugin '${manifest.name}@${version}' has no signature — refusing to install`),
            )
            process.exit(1)
          }

          const trustedKeys = await loadTrustedPluginKeys()
          if (trustedKeys.length === 0) {
            console.log(
              theme.error(`\u2717 No trusted plugin keys configured — refusing to install '${manifest.name}'`),
            )
            console.log(theme.info("  Trust a publisher key with:  aegis plugin trust <public-key-file>"))
            console.log(theme.info("  Trusted keys are stored in: ~/.aegis/registry/trusted-keys.json"))
            process.exit(1)
          }

          let verifiedBy: string | null = null
          for (const key of trustedKeys) {
            const publicKey = await importTrustedPublicKey(key)
            if (!publicKey) continue
            if (await verifyPluginSignature(manifest, row.signature, publicKey)) {
              verifiedBy = key.keyId
              break
            }
          }
          if (!verifiedBy) {
            console.log(
              theme.error(`\u2717 Signature for '${manifest.name}@${version}' does not match any trusted key`),
            )
            console.log(theme.info("  Trust the publisher key with:  aegis plugin trust <public-key-file>"))
            process.exit(1)
          }

          const entrypointPath = resolve(pluginDir, manifest.entrypoint)
          if (row.checksum && existsSync(entrypointPath)) {
            const checksum = await computeChecksum(new Uint8Array(await readFile(entrypointPath)))
            if (checksum !== row.checksum) {
              console.log(
                theme.error(
                  `\u2717 Entrypoint checksum mismatch for '${manifest.name}@${version}' — refusing to install`,
                ),
              )
              process.exit(1)
            }
          }

          registry.incrementInstalls(manifest.name, version)

          console.log(theme.success(`\u2713 Installed ${name}@${version}`))
          console.log(theme.info(`  Signature verified by trusted key ${verifiedBy}`))
        } finally {
          registry.close()
        }
      } catch (err) {
        console.log(theme.error(`\u2717 Install failed: ${String(err)}`))
        process.exit(1)
      }
    })

  // ── plugin trust <keyFile> ─────────────────────────────────────────
  pluginCmd
    .command("trust <keyFile>")
    .description("Trust a plugin publisher public key")
    .option("--comment <text>", "Note stored alongside the trusted key")
    .action(async (keyFile: string, opts: { comment?: string }) => {
      try {
        const { addTrustedPluginKey, toRawEd25519PublicKey, trustedPluginKeysPath } =
          await import("../../plugin/crypto")

        const path = resolve(keyFile)
        if (!existsSync(path)) {
          console.log(theme.error(`\u2717 Key file not found: ${path}`))
          process.exit(1)
        }

        const publicKey = toRawEd25519PublicKey(await readFile(path))
        if (!publicKey) {
          console.log(theme.error(`\u2717 Not a usable Ed25519 public key: ${path}`))
          process.exit(1)
        }

        const record = await addTrustedPluginKey(publicKey, opts.comment)
        console.log(theme.success(`\u2713 Trusted plugin key ${record.keyId}`))
        console.log(theme.info(`  Stored in: ${trustedPluginKeysPath()}`))
      } catch (err) {
        console.log(theme.error(`\u2717 Trust failed: ${String(err)}`))
        process.exit(1)
      }
    })

  // ── plugin keys ────────────────────────────────────────────────────
  pluginCmd
    .command("keys")
    .description("List trusted plugin publisher keys")
    .action(async () => {
      try {
        const { loadTrustedPluginKeys, trustedPluginKeysPath } = await import("../../plugin/crypto")
        const keys = await loadTrustedPluginKeys()

        if (keys.length === 0) {
          console.log(theme.info("No trusted plugin keys."))
          console.log(theme.info("  Trust one with:  aegis plugin trust <public-key-file>"))
          console.log(theme.info(`  Store: ${trustedPluginKeysPath()}`))
          return
        }

        console.log(theme.heading(`Trusted plugin keys (${keys.length}):`))
        for (const key of keys) {
          const comment = key.comment ? `  ${key.comment}` : ""
          console.log(theme.info(`  ${key.keyId}${comment}  (added ${key.addedAt.slice(0, 10)})`))
        }
      } catch (err) {
        console.log(theme.error(`\u2717 Keys failed: ${String(err)}`))
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
        try {
          const plugins = registry.list()

          if (plugins.length === 0) {
            console.log(theme.info("No plugins installed"))
            return
          }

          console.log(theme.heading(`Plugins (${plugins.length}):`))
          for (const p of plugins) {
            const line = `  ${p.name}@${p.version}  ${p.description ? `- ${p.description}` : ""}`
            console.log(theme.info(line))
          }
        } finally {
          registry.close()
        }
      } catch (err) {
        console.log(theme.error(`\u2717 List failed: ${String(err)}`))
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
        try {
          registry.remove(name)

          const pluginDir = join(homedir(), ".aegis", "plugins", name)
          if (existsSync(pluginDir)) {
            await rm(pluginDir, { recursive: true, force: true })
          }

          console.log(theme.success(`\u2713 Removed ${name}`))
        } finally {
          registry.close()
        }
      } catch (err) {
        console.log(theme.error(`\u2717 Remove failed: ${String(err)}`))
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
        try {
          const results = registry.search(query)

          if (results.length === 0) {
            console.log(theme.info(`No plugins matching "${query}"`))
            return
          }

          console.log(theme.heading(`Results (${results.length}):`))
          for (const p of results) {
            console.log(theme.info(`  ${p.name}@${p.version}  ${p.description ?? ""}`))
          }
        } finally {
          registry.close()
        }
      } catch (err) {
        console.log(theme.error(`\u2717 Search failed: ${String(err)}`))
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
        try {
          const plugin = registry.get(name, opts.version)

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
        } finally {
          registry.close()
        }
      } catch (err) {
        console.log(theme.error(`\u2717 Info failed: ${String(err)}`))
        process.exit(1)
      }
    })
}
