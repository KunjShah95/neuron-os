import { readFile, writeFile, mkdir, unlink } from "node:fs/promises"
import { resolve } from "node:path"
import { existsSync } from "node:fs"
import { ensureVaultKey, encrypt, decrypt } from "./crypto"
import { createLogger } from "../cli/logger"

const log = createLogger("vault")

export interface VaultEntry {
  key: string
  value: string
  scope: string
  createdAt: string
  updatedAt: string
}

function vaultDir(): string {
  return resolve(process.env.HOME || process.env.USERPROFILE || "~", ".aegis")
}

const VAULT_DIR = vaultDir()
const VAULT_FILE_ENC = resolve(VAULT_DIR, "vault.enc") // encrypted format
const VAULT_FILE_OLD = resolve(VAULT_DIR, "vault.json") // legacy plaintext
const ENV_FILE = resolve(VAULT_DIR, "agent.env")
const SCOPED_ENV_DIR = resolve(VAULT_DIR, "env")

export class CredentialVault {
  private entries: VaultEntry[] = []
  private _encrypted = false // tracks whether persistence uses encryption

  async initialize(): Promise<void> {
    await mkdir(VAULT_DIR, { recursive: true })
    await mkdir(SCOPED_ENV_DIR, { recursive: true })

    // ── Migrate legacy plaintext vault ──────────────────────────────
    if (existsSync(VAULT_FILE_OLD) && !existsSync(VAULT_FILE_ENC)) {
      try {
        const raw = await readFile(VAULT_FILE_OLD, "utf-8")
        const plainEntries: VaultEntry[] = JSON.parse(raw)
        if (Array.isArray(plainEntries)) {
          this.entries = plainEntries
          log.info("Migrating plaintext vault to encrypted format", { count: plainEntries.length })
          await this.writeEncrypted() // encrypt and write
          await unlink(VAULT_FILE_OLD).catch(() => {})
          log.info("Legacy vault.json removed after migration")
          this._encrypted = true
          await this.writeEnvFile()
          return
        }
      } catch (err) {
        log.warn("Failed to migrate legacy vault.json, starting fresh", { error: String(err) })
      }
    }

    // ── Clean up stale plaintext file if encrypted file exists ─────
    if (existsSync(VAULT_FILE_OLD) && existsSync(VAULT_FILE_ENC)) {
      log.warn("Both vault.enc and vault.json exist — removing stale vault.json")
      await unlink(VAULT_FILE_OLD).catch(() => {})
    }

    // ── Read encrypted vault ───────────────────────────────────────
    if (existsSync(VAULT_FILE_ENC)) {
      try {
        const key = await ensureVaultKey(VAULT_DIR)
        const raw = await readFile(VAULT_FILE_ENC, "utf-8")
        const json = decrypt(raw.trim(), key)
        this.entries = JSON.parse(json)
        this._encrypted = true
      } catch (err) {
        log.error("Failed to decrypt vault, starting empty", { error: String(err) })
        this.entries = []
        this._encrypted = false
      }
    }
  }

  // ── Private helpers ───────────────────────────────────────────────

  /** Encrypt entries and write to vault.enc. Throws on failure. */
  private async writeEncrypted(): Promise<void> {
    const json = JSON.stringify(this.entries)
    const key = await ensureVaultKey(VAULT_DIR)
    const encrypted = encrypt(json, key)
    await writeFile(VAULT_FILE_ENC, encrypted + "\n", "utf-8")
    this._encrypted = true
  }

  /** Write plaintext env files (for runtime consumption). */
  private async writeEnvFile(): Promise<void> {
    const lines = this.entries.filter((e) => e.scope === "global").map((e) => `${e.key}=${e.value}`)
    await writeFile(ENV_FILE, lines.join("\n") + "\n", "utf-8")
  }

  // ── Public API ─────────────────────────────────────────────────────

  async set(key: string, value: string, scope = "global"): Promise<void> {
    const existing = this.entries.findIndex((e) => e.key === key && e.scope === scope)
    const now = new Date().toISOString()

    if (existing >= 0) {
      const entry = this.entries[existing]
      if (entry) { entry.value = value; entry.updatedAt = now }
    } else {
      this.entries.push({ key, value, scope, createdAt: now, updatedAt: now })
    }

    await this.writeEncrypted()
    await this.writeEnvFile()

    // Also write scoped .env
    if (scope !== "global") {
      const scopedFile = resolve(SCOPED_ENV_DIR, `${scope}.env`)
      await mkdir(SCOPED_ENV_DIR, { recursive: true })
      const scopeEntries = this.entries.filter((e) => e.scope === scope)
      const lines = scopeEntries.map((e) => `${e.key}=${e.value}`)
      await writeFile(scopedFile, lines.join("\n") + "\n", "utf-8")
    }
  }

  async get(key: string, scope = "global"): Promise<string | null> {
    const entry = this.entries.find((e) => e.key === key && e.scope === scope)
    return entry?.value ?? null
  }

  async delete(key: string, scope = "global"): Promise<boolean> {
    const before = this.entries.length
    this.entries = this.entries.filter((e) => !(e.key === key && e.scope === scope))
    if (this.entries.length !== before) {
      await this.writeEncrypted()
      await this.writeEnvFile()
      return true
    }
    return false
  }

  async list(scope?: string): Promise<VaultEntry[]> {
    if (scope) return this.entries.filter((e) => e.scope === scope)
    return [...this.entries]
  }

  /** Returns true if the vault is stored with AES-256-GCM encryption. */
  isEncrypted(): boolean {
    return this._encrypted
  }

  /** Returns the path to the vault file for user-facing messages. */
  vaultFilePath(): string {
    return this._encrypted ? VAULT_FILE_ENC : VAULT_FILE_OLD
  }

  getEnvVars(scope = "global"): Record<string, string> {
    const result: Record<string, string> = {}
    for (const entry of this.entries) {
      if (entry.scope === scope || entry.scope === "global") {
        result[entry.key] = entry.value
      }
    }
    return result
  }

  async loadScopedEnv(scope: string): Promise<Record<string, string>> {
    const scopedFile = resolve(SCOPED_ENV_DIR, `${scope}.env`)
    const result: Record<string, string> = {}
    if (!existsSync(scopedFile)) return result

    try {
      const raw = await readFile(scopedFile, "utf-8")
      for (const line of raw.split("\n")) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith("#")) continue
        const eqIdx = trimmed.indexOf("=")
        if (eqIdx > 0) {
          const k = trimmed.slice(0, eqIdx).trim()
          const v = trimmed.slice(eqIdx + 1).trim()
          if (k) result[k] = v
        }
      }
    } catch (err) {
      log.warn("Failed to load scoped env file", { scope, error: String(err) })
    }

    return result
  }
}

export const credentialVault = new CredentialVault()
