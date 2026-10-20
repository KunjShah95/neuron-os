import { readFile, writeFile, mkdir, unlink, chmod } from "node:fs/promises"
import { resolve, sep } from "node:path"
import { existsSync } from "node:fs"
import { ensureVaultKey, encrypt, decrypt } from "./crypto"
import { createLogger } from "../cli/logger"

const log = createLogger("vault")

const SCOPE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const ENV_KEY_PATTERN = /^[^=\r\n]+$/
const SECRET_FILE_MODE = 0o600
const SECRET_DIR_MODE = 0o700

export interface VaultEntry {
  key: string
  value: string
  scope: string
  createdAt: string
  updatedAt: string
}

function homeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || "~"
}

function vaultDir(): string {
  return resolve(homeDir(), ".aegis")
}

function vaultFileEnc(): string {
  return resolve(vaultDir(), "vault.enc")
}

function vaultFileOld(): string {
  return resolve(vaultDir(), "vault.json")
}

function envFilePath(): string {
  return resolve(vaultDir(), "agent.env")
}

function scopedEnvRoot(): string {
  return resolve(vaultDir(), "env")
}

export function isValidScope(scope: string): boolean {
  return typeof scope === "string" && SCOPE_PATTERN.test(scope)
}

export function resolveScopedEnvPath(scope: string): string {
  if (!isValidScope(scope)) {
    throw new Error(`Invalid vault scope: ${JSON.stringify(scope)}`)
  }
  const root = scopedEnvRoot()
  const target = resolve(root, `${scope}.env`)
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`Vault scope resolves outside the vault directory: ${JSON.stringify(scope)}`)
  }
  return target
}

async function restrictFilePermissions(path: string): Promise<void> {
  await chmod(path, SECRET_FILE_MODE).catch(() => undefined)
}

async function restrictDirPermissions(path: string): Promise<void> {
  await chmod(path, SECRET_DIR_MODE).catch(() => undefined)
}

export class CredentialVault {
  private entries: VaultEntry[] = []
  private _encrypted = false

  async initialize(): Promise<void> {
    await mkdir(vaultDir(), { recursive: true })
    await mkdir(scopedEnvRoot(), { recursive: true })
    await restrictDirPermissions(scopedEnvRoot())

    if (existsSync(vaultFileOld()) && !existsSync(vaultFileEnc())) {
      try {
        const raw = await readFile(vaultFileOld(), "utf-8")
        const plainEntries: VaultEntry[] = JSON.parse(raw)
        if (Array.isArray(plainEntries)) {
          this.entries = plainEntries
          log.info("Migrating plaintext vault to encrypted format", { count: plainEntries.length })
          await this.writeEncrypted()
          await unlink(vaultFileOld()).catch(() => undefined)
          log.info("Legacy vault.json removed after migration")
          this._encrypted = true
          await this.writeEnvFile()
          return
        }
      } catch (err) {
        log.warn("Failed to migrate legacy vault.json, starting fresh", { error: String(err) })
      }
    }

    if (existsSync(vaultFileOld()) && existsSync(vaultFileEnc())) {
      log.warn("Both vault.enc and vault.json exist — removing stale vault.json")
      await unlink(vaultFileOld()).catch(() => undefined)
    }

    if (existsSync(vaultFileEnc())) {
      try {
        const key = await ensureVaultKey(vaultDir())
        const raw = await readFile(vaultFileEnc(), "utf-8")
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

  private async writeEncrypted(): Promise<void> {
    const json = JSON.stringify(this.entries)
    const key = await ensureVaultKey(vaultDir())
    const encrypted = encrypt(json, key)
    const target = vaultFileEnc()
    await writeFile(target, encrypted + "\n", "utf-8")
    await restrictFilePermissions(target)
    this._encrypted = true
  }

  private envLines(scope: string): string[] {
    const lines: string[] = []
    for (const entry of this.entries) {
      if (entry.scope !== scope) continue
      if (!ENV_KEY_PATTERN.test(entry.key)) {
        log.warn("Skipping vault entry with an unusable environment key", { key: entry.key, scope })
        continue
      }
      if (/[\r\n]/.test(entry.value)) {
        log.warn("Skipping multi-line vault value in the plaintext env file", { key: entry.key, scope })
        continue
      }
      lines.push(`${entry.key}=${entry.value}`)
    }
    return lines
  }

  private async writeEnvFile(): Promise<void> {
    const lines = this.envLines("global")
    const target = envFilePath()
    if (lines.length === 0) {
      if (existsSync(target)) await unlink(target).catch(() => undefined)
      return
    }
    await writeFile(target, lines.join("\n") + "\n", "utf-8")
    await restrictFilePermissions(target)
  }

  private async writeScopedEnvFile(scope: string): Promise<void> {
    if (scope === "global") return
    const scopedFile = resolveScopedEnvPath(scope)
    await mkdir(scopedEnvRoot(), { recursive: true })
    await restrictDirPermissions(scopedEnvRoot())
    const lines = this.envLines(scope)
    if (lines.length === 0) {
      if (existsSync(scopedFile)) await unlink(scopedFile).catch(() => undefined)
      return
    }
    await writeFile(scopedFile, lines.join("\n") + "\n", "utf-8")
    await restrictFilePermissions(scopedFile)
  }

  async set(key: string, value: string, scope = "global"): Promise<void> {
    if (!isValidScope(scope)) {
      throw new Error(`Invalid vault scope: ${JSON.stringify(scope)}`)
    }
    if (!ENV_KEY_PATTERN.test(key)) {
      throw new Error(`Invalid vault key: ${JSON.stringify(key)}`)
    }
    const existing = this.entries.findIndex((e) => e.key === key && e.scope === scope)
    const now = new Date().toISOString()

    if (existing >= 0) {
      const entry = this.entries[existing]
      if (entry) {
        entry.value = value
        entry.updatedAt = now
      }
    } else {
      this.entries.push({ key, value, scope, createdAt: now, updatedAt: now })
    }

    await this.writeEncrypted()
    await this.writeEnvFile()
    await this.writeScopedEnvFile(scope)
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
      await this.writeScopedEnvFile(scope)
      return true
    }
    return false
  }

  async list(scope?: string): Promise<VaultEntry[]> {
    if (scope) return this.entries.filter((e) => e.scope === scope)
    return [...this.entries]
  }

  isEncrypted(): boolean {
    return this._encrypted
  }

  vaultFilePath(): string {
    return this._encrypted ? vaultFileEnc() : vaultFileOld()
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
    const result: Record<string, string> = {}
    let scopedFile: string
    try {
      scopedFile = resolveScopedEnvPath(scope)
    } catch (err) {
      log.warn("Refusing to load scoped env file", { scope, error: String(err) })
      return result
    }
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
