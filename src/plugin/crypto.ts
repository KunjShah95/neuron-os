/**
 * plugin/crypto — Ed25519 signing and verification for plugin manifests.
 *
 * Uses Node.js crypto (Ed25519 via subtle or keygen) to provide:
 *   - Key pair generation (for plugin authors)
 *   - Manifest signing (creates a PluginSignature)
 *   - Signature verification (checks integrity)
 *
 * All keys and signatures are base64url-encoded for JSON-friendly storage.
 */

import { createHash, sign, verify, generateKeyPairSync, createPrivateKey, createPublicKey } from "node:crypto"
import { join } from "node:path"
import { homedir } from "node:os"
import type { SignedPluginManifest, PluginSignature, AuthorKeyPair } from "./types"

// ── Key Generation ───────────────────────────────────────────────────

/**
 * Generate a new Ed25519 author key pair.
 * The private key should be stored securely in ~/.aegis/registry/author-key.json.
 */
export function generateAuthorKey(comment?: string): AuthorKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  })

  return {
    publicKey: publicKey.toString("base64url"),
    privateKey: privateKey.toString("base64url"),
    createdAt: new Date().toISOString(),
    comment,
  }
}

// ── Canonical JSON ───────────────────────────────────────────────────

/**
 * The manifest fields that make up the signed payload.
 * Both plugin/signer.ts and plugin/crypto.ts sign exactly these bytes.
 */
export interface CanonicalManifestFields {
  name: string
  version: string
  description?: string
  author?: string
  license?: string
  url?: string
  entrypoint?: string
  tags?: string[]
  hooks?: object
  dependencies?: Array<{ name: string; version?: string; optional?: boolean }>
  conflicts?: string[]
  permissions?: string[]
  engine?: object
  publishedAt?: string
}

export const CANONICAL_MANIFEST_FIELDS = [
  "name",
  "version",
  "description",
  "author",
  "license",
  "url",
  "entrypoint",
  "publishedAt",
  "engine",
  "tags",
  "hooks",
  "dependencies",
  "conflicts",
  "permissions",
] as const

const ED25519_SPKI_PREFIX = "302a300506032b6570032100"

function sortedRecord(source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(source).sort()) {
    const value = source[key]
    if (value === undefined) continue
    out[key] = value
  }
  return out
}

/**
 * Produce the canonical JSON string of a manifest.
 *
 * This is the single canonicalization used by every plugin signing and
 * verification path in this repository. It covers every security relevant
 * field of the manifest — including `entrypoint` (the code that runs),
 * `permissions` (what the plugin asks for) and the nested `hooks` object —
 * so any change to a signed manifest changes the signed bytes.
 *
 * Output is deterministic: fixed field order, sorted object keys, sorted
 * arrays, and stable dependency ordering.
 */
export function canonicalManifestJson(manifest: CanonicalManifestFields): string {
  const obj: Record<string, unknown> = {
    name: manifest.name,
    version: manifest.version,
  }

  if (manifest.description !== undefined) obj.description = manifest.description
  if (manifest.author !== undefined) obj.author = manifest.author
  if (manifest.license !== undefined) obj.license = manifest.license
  if (manifest.url !== undefined) obj.url = manifest.url
  if (manifest.entrypoint !== undefined) obj.entrypoint = manifest.entrypoint
  if (manifest.publishedAt !== undefined) obj.publishedAt = manifest.publishedAt
  if (manifest.engine !== undefined) obj.engine = sortedRecord(manifest.engine as Record<string, unknown>)
  if (manifest.tags?.length) obj.tags = [...manifest.tags].sort()
  if (manifest.hooks !== undefined) obj.hooks = sortedRecord(manifest.hooks as Record<string, unknown>)
  if (manifest.dependencies?.length) {
    obj.dependencies = manifest.dependencies
      .map((dep) => ({
        name: dep.name,
        version: dep.version ?? "",
        ...(dep.optional === undefined ? {} : { optional: dep.optional }),
      }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
  }
  if (manifest.conflicts?.length) obj.conflicts = [...manifest.conflicts].sort()
  if (manifest.permissions?.length) obj.permissions = [...manifest.permissions].sort()

  return JSON.stringify(obj)
}

// ── Sign ─────────────────────────────────────────────────────────────

/**
 * Sign a plugin manifest using the author's private key.
 * Adds the signature to the manifest in-place and returns it.
 */
export function signManifest(manifest: SignedPluginManifest, privateKeyBase64url: string): PluginSignature {
  const canonical = canonicalManifestJson(manifest)
  const hash = createHash("sha512").update(canonical).digest()

  const privateKey = Buffer.from(privateKeyBase64url, "base64url")
  const signature = sign(null, hash, {
    key: privateKey,
    format: "der",
    type: "pkcs8",
  })

  const sig: PluginSignature = {
    publicKey: "", // filled in below
    value: signature.toString("base64url"),
    signedAt: new Date().toISOString(),
    algorithm: "ed25519",
  }

  // Derive the public key from the private key
  sig.publicKey = derivePublicKeyFromPrivate(privateKeyBase64url)

  manifest.signature = sig
  return sig
}

/**
 * Derive the Ed25519 public key from a private key using Node.js crypto.
 * Uses createPublicKey which properly handles PKCS8 DER parsing.
 */
function derivePublicKeyFromPrivate(privateKeyBase64url: string): string {
  const der = Buffer.from(privateKeyBase64url, "base64url")
  try {
    const privKey = createPrivateKey({ key: der, format: "der", type: "pkcs8" })
    const pubKeyDer = createPublicKey(privKey).export({ type: "spki", format: "der" })
    return pubKeyDer.toString("base64url")
  } catch {
    throw new Error("Failed to derive public key from private key. The key may be malformed.")
  }
}

/**
 * Sign a manifest when both public and private keys are available.
 * This is the preferred signing method since it avoids key derivation.
 */
export function signManifestWithKeyPair(manifest: SignedPluginManifest, keyPair: AuthorKeyPair): PluginSignature {
  const canonical = canonicalManifestJson(manifest)
  const hash = createHash("sha512").update(canonical).digest()

  const privateKey = Buffer.from(keyPair.privateKey, "base64url")
  const signature = sign(null, hash, {
    key: privateKey,
    format: "der",
    type: "pkcs8",
  })

  const sig: PluginSignature = {
    publicKey: keyPair.publicKey,
    value: signature.toString("base64url"),
    signedAt: new Date().toISOString(),
    algorithm: "ed25519",
  }

  manifest.signature = sig
  return sig
}

// ── Verify ───────────────────────────────────────────────────────────

/**
 * Verify a plugin manifest's signature against its public key.
 * Returns true if the signature is valid, false otherwise.
 */
export function verifyManifest(manifest: SignedPluginManifest): boolean {
  if (!manifest.signature) return false

  const { publicKey, value, algorithm } = manifest.signature

  if (algorithm !== "ed25519") return false

  const canonical = canonicalManifestJson(manifest)
  const hash = createHash("sha512").update(canonical).digest()
  const sigBytes = Buffer.from(value, "base64url")
  const pubKeyBytes = Buffer.from(publicKey, "base64url")

  try {
    return verify(
      null,
      hash,
      {
        key: pubKeyBytes,
        format: "der",
        type: "spki",
      },
      sigBytes,
    )
  } catch {
    return false
  }
}

// ── Key Fingerprint ──────────────────────────────────────────────────

/**
 * Compute a short fingerprint for a public key (first 8 bytes, hex-encoded).
 * Useful for identifying keys in CLI output.
 */
export function keyFingerprint(publicKeyBase64url: string): string {
  const bytes = Buffer.from(publicKeyBase64url, "base64url")
  return bytes.subarray(0, 8).toString("hex")
}

/**
 * Load author key pair from ~/.aegis/registry/author-key.json.
 * Returns null if the file doesn't exist or is malformed.
 */
export async function loadAuthorKey(): Promise<AuthorKeyPair | null> {
  try {
    const { readFile } = await import("node:fs/promises")
    const keyPath = join(homedir(), ".aegis", "registry", "author-key.json")
    const raw = await readFile(keyPath, "utf-8")
    return JSON.parse(raw) as AuthorKeyPair
  } catch {
    return null
  }
}

/**
 * Save author key pair to ~/.aegis/registry/author-key.json.
 */
export async function saveAuthorKey(keyPair: AuthorKeyPair): Promise<void> {
  const { writeFile, mkdir } = await import("node:fs/promises")
  const dir = join(homedir(), ".aegis", "registry")
  await mkdir(dir, { recursive: true })
  const keyPath = join(dir, "author-key.json")
  await writeFile(keyPath, JSON.stringify(keyPair, null, 2), "utf-8")
}

// ── Trusted Plugin Keys ──────────────────────────────────────────────

export interface TrustedPluginKey {
  keyId: string
  publicKey: string
  comment?: string
  addedAt: string
}

export interface TrustedPluginKeyStore {
  version: number
  keys: TrustedPluginKey[]
}

export const TRUSTED_PLUGIN_KEYS_VERSION = 1

export function trustedPluginKeysPath(): string {
  return join(homedir(), ".aegis", "registry", "trusted-keys.json")
}

export async function loadTrustedPluginKeys(): Promise<TrustedPluginKey[]> {
  try {
    const { readFile } = await import("node:fs/promises")
    const raw = await readFile(trustedPluginKeysPath(), "utf-8")
    const parsed = JSON.parse(raw) as TrustedPluginKeyStore
    if (!parsed || !Array.isArray(parsed.keys)) return []
    return parsed.keys.filter((key) => typeof key?.keyId === "string" && typeof key?.publicKey === "string")
  } catch {
    return []
  }
}

export async function saveTrustedPluginKeys(keys: TrustedPluginKey[]): Promise<void> {
  const { writeFile, mkdir } = await import("node:fs/promises")
  const dir = join(homedir(), ".aegis", "registry")
  await mkdir(dir, { recursive: true })
  const store: TrustedPluginKeyStore = { version: TRUSTED_PLUGIN_KEYS_VERSION, keys }
  await writeFile(trustedPluginKeysPath(), JSON.stringify(store, null, 2), "utf-8")
}

export async function addTrustedPluginKey(publicKey: string, comment?: string): Promise<TrustedPluginKey> {
  const keys = await loadTrustedPluginKeys()
  const existing = keys.find((key) => key.publicKey === publicKey)
  if (existing) return existing
  const record: TrustedPluginKey = {
    keyId: keyFingerprint(publicKey),
    publicKey,
    comment,
    addedAt: new Date().toISOString(),
  }
  await saveTrustedPluginKeys([...keys, record])
  return record
}

export async function removeTrustedPluginKey(keyId: string): Promise<boolean> {
  const keys = await loadTrustedPluginKeys()
  const remaining = keys.filter((key) => key.keyId !== keyId)
  if (remaining.length === keys.length) return false
  await saveTrustedPluginKeys(remaining)
  return true
}

function rawEd25519PublicKey(material: Buffer): Buffer | null {
  if (material.length === 32) return material
  if (material.length === 44 && material.subarray(0, 12).equals(Buffer.from(ED25519_SPKI_PREFIX, "hex"))) {
    return material.subarray(12)
  }
  return null
}

/**
 * Normalize arbitrary public key material (raw 32 byte key, hex, base64,
 * base64url, SPKI DER, or an author-key.json file) into a base64url encoded
 * raw Ed25519 public key. Returns null when the material is not a usable
 * Ed25519 public key.
 */
export function toRawEd25519PublicKey(material: Buffer | string): string | null {
  const buffer = Buffer.isBuffer(material) ? material : Buffer.from(material)
  const text = buffer.toString("utf-8").trim()

  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as { publicKey?: string }
      if (typeof parsed.publicKey === "string") return toRawEd25519PublicKey(Buffer.from(parsed.publicKey, "base64url"))
    } catch {
      return null
    }
    return null
  }

  const candidates: Buffer[] = [buffer]
  if (/^[0-9a-fA-F]+$/.test(text) && text.length % 2 === 0) candidates.push(Buffer.from(text, "hex"))
  candidates.push(Buffer.from(text, "base64url"))

  for (const candidate of candidates) {
    const raw = rawEd25519PublicKey(candidate)
    if (raw) return raw.toString("base64url")
  }
  return null
}
