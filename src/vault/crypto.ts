/**
 * AES-256-GCM encryption / decryption for the credential vault.
 *
 * Key priority:
 *   1. AEGIS_VAULT_KEY environment variable
 *   2. ~/.aegis/.vault-key file (auto-generated on first use)
 *
 * If neither exists on first access, a random key is generated and
 * persisted to ~/.aegis/.vault-key with restrictive permissions.
 *
 * The vault directory is provided by the caller so that path resolution
 * is consistent with the rest of the vault system.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { createLogger } from "../cli/logger"

const log = createLogger("vault:crypto")

// ── Constants ─────────────────────────────────────────────────────────

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12          // 96-bit IV recommended for GCM
const KEY_LENGTH = 32          // 256 bits
const KEY_FILENAME = ".vault-key"

// ── Key Management ────────────────────────────────────────────────────

/** Path to the auto-generated key file (derived from vault dir) */
function keyFilePath(vaultDir: string): string {
  return resolve(vaultDir, KEY_FILENAME)
}

/**
 * Retrieve the vault encryption key.
 *
 * Priority: AEGIS_VAULT_KEY env var > ~/.aegis/.vault-key file.
 * Returns `null` if neither is available.
 */
export async function getVaultKey(vaultDir: string): Promise<Buffer | null> {
  // 1. Environment variable
  const envKey = process.env.AEGIS_VAULT_KEY
  if (envKey) {
    try {
      const buf = Buffer.from(envKey, "hex")
      if (buf.length === KEY_LENGTH) return buf
      log.warn("AEGIS_VAULT_KEY env var is set but is not a valid 64-hex-char key — ignoring")
    } catch {
      log.warn("AEGIS_VAULT_KEY env var is set but could not be parsed — ignoring")
    }
  }

  // 2. Key file
  const kf = keyFilePath(vaultDir)
  if (existsSync(kf)) {
    try {
      const raw = await readFile(kf, "utf-8")
      const key = raw.trim()
      const buf = Buffer.from(key, "hex")
      if (buf.length === KEY_LENGTH) return buf
      log.warn("Vault key file is corrupted (wrong length), will regenerate")
    } catch {
      // Will regenerate below
    }
  }

  return null
}

/**
 * Generate a new random encryption key and persist it to disk.
 * Returns the generated key.
 */
export async function generateAndSaveKey(vaultDir: string): Promise<Buffer> {
  const key = randomBytes(KEY_LENGTH)
  const hex = key.toString("hex")
  const kf = keyFilePath(vaultDir)

  // Ensure directory exists
  if (!existsSync(vaultDir)) {
    await mkdir(vaultDir, { recursive: true })
  }

  await writeFile(kf, hex + "\n", "utf-8")

  // Restrict permissions (owner read/write only)
  try {
    await chmod(kf, 0o600)
  } catch {
    // chmod may not work on all platforms (Windows) — non-fatal
  }

  return key
}

/**
 * Convenience: ensure a key exists (generate if needed) and return it.
 * This is the main entry-point for the vault manager.
 */
export async function ensureVaultKey(vaultDir: string): Promise<Buffer> {
  const existing = await getVaultKey(vaultDir)
  if (existing) return existing
  return generateAndSaveKey(vaultDir)
}

// ── Encryption / Decryption ───────────────────────────────────────────

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * Returns a colon-delimited hex string:
 *   <iv-hex>:<tag-hex>:<ciphertext-hex>
 *
 * The IV is randomly generated on each call so the same plaintext
 * produces different ciphertext each time.
 */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, "utf8", "hex")
  encrypted += cipher.final("hex")
  const tag = cipher.getAuthTag().toString("hex")

  return `${iv.toString("hex")}:${tag}:${encrypted}`
}

/**
 * Decrypt a string previously produced by `encrypt()`.
 *
 * Input format: <iv-hex>:<tag-hex>:<ciphertext-hex>
 *
 * Throws if the key is wrong or the ciphertext has been tampered with
 * (GCM authentication tag mismatch).
 */
export function decrypt(encoded: string, key: Buffer): string {
  const parts = encoded.split(":")
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload format")
  }

  const [ivHex, tagHex, ciphertext] = parts
  const iv = Buffer.from(ivHex!, "hex")
  const tag = Buffer.from(tagHex!, "hex")

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  let decrypted = decipher.update(ciphertext!, "hex", "utf8")
  decrypted += decipher.final("utf8")
  return decrypted
}
