import { describe, it, expect, afterEach } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import type { PluginManifest } from "./manifest"

const ORIGINAL_HOME = process.env.HOME
const ORIGINAL_USERPROFILE = process.env.USERPROFILE
const TEMP_HOMES: string[] = []

function useTempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "aegis-trusted-keys-"))
  TEMP_HOMES.push(dir)
  process.env.HOME = dir
  process.env.USERPROFILE = dir
  return dir
}

function restoreHome(): void {
  if (ORIGINAL_HOME === undefined) delete process.env.HOME
  else process.env.HOME = ORIGINAL_HOME
  if (ORIGINAL_USERPROFILE === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = ORIGINAL_USERPROFILE
  for (const dir of TEMP_HOMES) rmSync(dir, { recursive: true, force: true })
  TEMP_HOMES.length = 0
}

const manifest: PluginManifest = {
  name: "trusted-plugin",
  version: "1.0.0",
  entrypoint: "./dist/index.js",
  hooks: { on_agent_spawn: true },
  dependencies: [],
  permissions: ["fs:read"],
}

describe("trusted plugin key store", () => {
  afterEach(() => {
    restoreHome()
  })

  it("stores trusted keys in the registry directory", async () => {
    const home = useTempHome()
    const { addTrustedPluginKey, loadTrustedPluginKeys, trustedPluginKeysPath } = await import("./crypto")

    const record = await addTrustedPluginKey("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "publisher")

    expect(trustedPluginKeysPath()).toBe(resolve(home, ".aegis", "registry", "trusted-keys.json"))
    expect(existsSync(trustedPluginKeysPath())).toBe(true)

    const stored = JSON.parse(readFileSync(trustedPluginKeysPath(), "utf-8"))
    expect(stored.version).toBe(1)
    expect(stored.keys).toHaveLength(1)
    expect(stored.keys[0].keyId).toBe(record.keyId)

    const loaded = await loadTrustedPluginKeys()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].publicKey).toBe(record.publicKey)
    expect(loaded[0].comment).toBe("publisher")
  })

  it("does not duplicate an already trusted key", async () => {
    useTempHome()
    const { addTrustedPluginKey, loadTrustedPluginKeys } = await import("./crypto")

    await addTrustedPluginKey("BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB")
    await addTrustedPluginKey("BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB")

    const loaded = await loadTrustedPluginKeys()
    expect(loaded).toHaveLength(1)
  })

  it("returns an empty list when no trusted keys are configured", async () => {
    useTempHome()
    const { loadTrustedPluginKeys } = await import("./crypto")
    expect(await loadTrustedPluginKeys()).toEqual([])
  })

  it("normalizes raw, base64, hex and author-key public key material", async () => {
    useTempHome()
    const { generateKeyPair, exportPublicKey } = await import("./signer")
    const { toRawEd25519PublicKey } = await import("./crypto")

    const { publicKey } = await generateKeyPair()
    const raw = Buffer.from(await exportPublicKey(publicKey))

    const expected = raw.toString("base64url")
    expect(toRawEd25519PublicKey(raw)).toBe(expected)
    expect(toRawEd25519PublicKey(expected)).toBe(expected)
    expect(toRawEd25519PublicKey(raw.toString("hex"))).toBe(expected)
    expect(toRawEd25519PublicKey(JSON.stringify({ publicKey: expected }))).toBe(expected)
    expect(toRawEd25519PublicKey("not-a-key")).toBeNull()
  })
})

describe("plugin signature verification against trusted keys", () => {
  afterEach(() => {
    restoreHome()
  })

  it("accepts a plugin signed by a trusted publisher key", async () => {
    useTempHome()
    const { generateKeyPair, exportPublicKey, signPlugin, verifyPluginSignature, importTrustedPublicKey } =
      await import("./signer")
    const { addTrustedPluginKey, loadTrustedPluginKeys } = await import("./crypto")

    const { publicKey, privateKey } = await generateKeyPair()
    const signature = await signPlugin(manifest, privateKey)
    const rawPublic = Buffer.from(await exportPublicKey(publicKey)).toString("base64url")
    await addTrustedPluginKey(rawPublic, "publisher")

    const trusted = await loadTrustedPluginKeys()
    expect(trusted).toHaveLength(1)

    let verified = false
    for (const key of trusted) {
      const imported = await importTrustedPublicKey(key)
      if (!imported) continue
      if (await verifyPluginSignature(manifest, signature, imported)) verified = true
    }
    expect(verified).toBe(true)
  })

  it("rejects a plugin signed by an untrusted publisher key", async () => {
    useTempHome()
    const { generateKeyPair, exportPublicKey, signPlugin, verifyPluginSignature, importTrustedPublicKey } =
      await import("./signer")
    const { addTrustedPluginKey, loadTrustedPluginKeys } = await import("./crypto")

    const trustedPair = await generateKeyPair()
    const trustedRaw = Buffer.from(await exportPublicKey(trustedPair.publicKey)).toString("base64url")
    await addTrustedPluginKey(trustedRaw, "publisher")

    const roguePair = await generateKeyPair()
    const rogueSignature = await signPlugin(manifest, roguePair.privateKey)

    const trusted = await loadTrustedPluginKeys()
    let verified = false
    for (const key of trusted) {
      const imported = await importTrustedPublicKey(key)
      if (!imported) continue
      if (await verifyPluginSignature(manifest, rogueSignature, imported)) verified = true
    }
    expect(verified).toBe(false)
  })

  it("rejects a tampered manifest even when the publisher key is trusted", async () => {
    useTempHome()
    const { generateKeyPair, exportPublicKey, signPlugin, verifyPluginSignature, importTrustedPublicKey } =
      await import("./signer")
    const { addTrustedPluginKey, loadTrustedPluginKeys } = await import("./crypto")

    const { publicKey, privateKey } = await generateKeyPair()
    const signature = await signPlugin(manifest, privateKey)
    const rawPublic = Buffer.from(await exportPublicKey(publicKey)).toString("base64url")
    await addTrustedPluginKey(rawPublic, "publisher")

    const tampered: PluginManifest = { ...manifest, permissions: ["fs:read", "shell:exec"] }
    const trusted = await loadTrustedPluginKeys()
    let verified = false
    for (const key of trusted) {
      const imported = await importTrustedPublicKey(key)
      if (!imported) continue
      if (await verifyPluginSignature(tampered, signature, imported)) verified = true
    }
    expect(verified).toBe(false)
  })
})
