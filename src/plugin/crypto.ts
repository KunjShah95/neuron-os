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

import { createHash, sign, verify, generateKeyPairSync, createPrivateKey } from "node:crypto"
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
 * Produce a canonical JSON string of the manifest fields that are signed.
 * This excludes the signature itself (to avoid circularity) and normalizes
 * the key order so that the signature is deterministic.
 *
 * Canonical order:
 *   1. name, 2. version, 3. description, 4. author, 5. url,
 *   6. tags, 7. dependencies, 8. conflicts, 9. engine, 10. publishedAt
 */
function canonicalManifestJson(manifest: SignedPluginManifest): string {
  const obj: Record<string, unknown> = {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
  }

  if (manifest.author) obj.author = manifest.author
  if (manifest.url) obj.url = manifest.url
  if (manifest.tags?.length) obj.tags = [...manifest.tags].sort()
  if (manifest.dependencies?.length) {
    obj.dependencies = [...manifest.dependencies].sort((a, b) => a.name.localeCompare(b.name))
  }
  if (manifest.conflicts?.length) obj.conflicts = [...manifest.conflicts].sort()
  if (manifest.engine) obj.engine = manifest.engine
  obj.publishedAt = manifest.publishedAt

  return JSON.stringify(obj)
}

// ── Sign ─────────────────────────────────────────────────────────────

/**
 * Sign a plugin manifest using the author's private key.
 * Adds the signature to the manifest in-place and returns it.
 */
export function signManifest(
  manifest: SignedPluginManifest,
  privateKeyBase64url: string,
): PluginSignature {
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
    const pubKeyDer = privKey.export({ type: "spki", format: "der" })
    return pubKeyDer.toString("base64url")
  } catch {
    throw new Error("Failed to derive public key from private key. The key may be malformed.")
  }
}

/**
 * Sign a manifest when both public and private keys are available.
 * This is the preferred signing method since it avoids key derivation.
 */
export function signManifestWithKeyPair(
  manifest: SignedPluginManifest,
  keyPair: AuthorKeyPair,
): PluginSignature {
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
    const { join } = await import("node:path")
    const { homedir } = await import("node:os")
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
  const { join } = await import("node:path")
  const { homedir } = await import("node:os")
  const dir = join(homedir(), ".aegis", "registry")
  await mkdir(dir, { recursive: true })
  const keyPath = join(dir, "author-key.json")
  await writeFile(keyPath, JSON.stringify(keyPair, null, 2), "utf-8")
}
