import { Database } from "bun:sqlite"
import { randomBytes, scryptSync, createCipheriv, createDecipheriv, createHmac, timingSafeEqual } from "node:crypto"
import { join, resolve } from "node:path"
import { createLogger } from "../cli/logger"
import { openDatabase } from "../utils/sqlite"

const log = createLogger("vault:credential")
const ALGORITHM = "aes-256-gcm"
const KEY_LENGTH = 32
const IV_LENGTH = 16
const VERIFIER_CONFIG_KEY = "key_verifier"
const VERIFIER_DOMAIN = "aegis.vault.key-verifier.v1"

export interface VaultEntry {
  id: string
  name: string
  type: "api-key" | "password" | "token" | "certificate" | "env-file"
  encryptedValue: string
  iv: string
  authTag: string
  metadata: {
    createdBy: string
    createdAt: string
    updatedAt: string
    expiresAt?: string
    tags: string[]
  }
  accessCount: number
  lastAccessedAt?: string
}

export class CredentialVault {
  private db: Database
  private masterKey: Buffer | null = null
  private salt: Buffer | null = null
  private _isUnlocked = false
  private _verified = false

  constructor(dbPathOverride?: string) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "~"
    const defaultDbPath = join(resolve(homeDir, ".aegis"), "vault.db")
    const dbPath = dbPathOverride || defaultDbPath
    this.db = openDatabase(dbPath)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vault_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        encrypted_value TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        access_count INTEGER NOT NULL DEFAULT 0,
        last_accessed_at TEXT
      )
    `)

    const saltRow = this.db.prepare("SELECT value FROM vault_config WHERE key = 'salt'").get() as
      { value: string } | undefined
    if (saltRow) {
      this.salt = Buffer.from(saltRow.value, "hex")
    }
  }

  initialize(masterPassword: string): void {
    if (this.salt) {
      if (this.hasStoredEntries() || this.readVerifier()) {
        throw new Error("Vault is already initialized")
      }
      this.db.prepare("DELETE FROM vault_config WHERE key = 'salt'").run()
      this.salt = null
    }
    this.salt = randomBytes(32)
    this.db
      .prepare("INSERT OR REPLACE INTO vault_config (key, value) VALUES ('salt', ?)")
      .run(this.salt.toString("hex"))
    this.masterKey = scryptSync(masterPassword, this.salt, KEY_LENGTH)
    this.writeVerifier(this.masterKey)
    this._isUnlocked = true
    this._verified = true
    log.info("Vault initialized")
  }

  unlock(masterPassword: string): boolean {
    if (!this.salt) {
      log.warn("Vault not initialized")
      return false
    }
    const candidateKey = scryptSync(masterPassword, this.salt, KEY_LENGTH)
    const verifier = this.readVerifier()

    if (verifier) {
      if (!this.verifierMatches(candidateKey, verifier)) {
        this.lock()
        log.warn("Vault unlock rejected: incorrect master password")
        return false
      }
      this.masterKey = candidateKey
      this._isUnlocked = true
      this._verified = true
      return true
    }

    const legacyEntry = this.firstEntryRow()
    if (legacyEntry && this.decryptsWithKey(legacyEntry, candidateKey)) {
      this.masterKey = candidateKey
      this._isUnlocked = true
      this._verified = true
      this.writeVerifier(candidateKey)
      log.info("Vault upgraded with key verification")
      return true
    }

    this.masterKey = candidateKey
    this._isUnlocked = true
    this._verified = false
    log.warn("Vault unlocked without verification: this vault has no key verifier")
    return true
  }

  lock(): void {
    this.masterKey = null
    this._isUnlocked = false
    this._verified = false
    log.info("Vault locked")
  }

  get isUnlocked(): boolean {
    return this._isUnlocked
  }

  get isVerified(): boolean {
    return this._verified
  }

  private deriveVerifier(key: Buffer): string {
    return createHmac("sha256", key).update(VERIFIER_DOMAIN).digest("hex")
  }

  private readVerifier(): string | null {
    const row = this.db.prepare("SELECT value FROM vault_config WHERE key = ?").get(VERIFIER_CONFIG_KEY) as
      { value: string } | undefined
    return row?.value ?? null
  }

  private writeVerifier(key: Buffer): void {
    this.db
      .prepare("INSERT OR REPLACE INTO vault_config (key, value) VALUES (?, ?)")
      .run(VERIFIER_CONFIG_KEY, this.deriveVerifier(key))
  }

  private verifierMatches(key: Buffer, verifier: string): boolean {
    const expected = Buffer.from(verifier, "hex")
    const actual = Buffer.from(this.deriveVerifier(key), "hex")
    if (expected.length === 0 || expected.length !== actual.length) return false
    return timingSafeEqual(expected, actual)
  }

  private firstEntryRow(): { encrypted_value: string; iv: string; auth_tag: string } | null {
    const row = this.db
      .prepare("SELECT encrypted_value, iv, auth_tag FROM entries ORDER BY rowid ASC LIMIT 1")
      .get() as { encrypted_value: string; iv: string; auth_tag: string } | undefined
    return row ?? null
  }

  private hasStoredEntries(): boolean {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM entries").get() as { c: number }
    return row.c > 0
  }

  private decryptsWithKey(row: { encrypted_value: string; iv: string; auth_tag: string }, key: Buffer): boolean {
    try {
      this.decrypt(row.encrypted_value, row.iv, row.auth_tag, key)
      return true
    } catch {
      return false
    }
  }

  private encrypt(plaintext: string): { encryptedValue: string; iv: string; authTag: string } {
    if (!this.masterKey) throw new Error("Vault is locked")
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, this.masterKey, iv)
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()])
    const authTag = cipher.getAuthTag()
    return {
      encryptedValue: encrypted.toString("hex"),
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
    }
  }

  private decrypt(
    encryptedValue: string,
    ivHex: string,
    authTagHex: string,
    key: Buffer | null = this.masterKey,
  ): string {
    if (!key) throw new Error("Vault is locked")
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"))
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"))
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedValue, "hex")), decipher.final()])
    return decrypted.toString("utf-8")
  }

  private ensureUnlocked(): void {
    if (!this._isUnlocked || !this.masterKey) {
      throw new Error("Vault is locked. Call unlock() first.")
    }
  }

  private ensureOverwriteAllowed(name: string): void {
    if (this._verified) return
    if (this.entryExists(name)) {
      throw new Error(
        "Vault unlock was not verified — refusing to overwrite an existing credential. Re-initialize an empty vault to set a master password.",
      )
    }
  }

  private entryExists(name: string): boolean {
    const row = this.db.prepare("SELECT id FROM entries WHERE name = ?").get(name)
    return row !== null && row !== undefined
  }

  private nextId(): string {
    return "v-" + Date.now().toString(36) + "-" + randomBytes(4).toString("hex")
  }

  store(name: string, value: string, type: VaultEntry["type"], metadata?: Partial<VaultEntry["metadata"]>): VaultEntry {
    this.ensureUnlocked()
    this.ensureOverwriteAllowed(name)
    const { encryptedValue, iv, authTag } = this.encrypt(value)
    const id = this.nextId()
    const now = new Date().toISOString()
    const entryMeta = {
      createdBy: metadata?.createdBy ?? "unknown",
      createdAt: now,
      updatedAt: now,
      expiresAt: metadata?.expiresAt,
      tags: metadata?.tags ?? [],
    }

    this.db
      .prepare(
        `
      INSERT INTO entries (id, name, type, encrypted_value, iv, auth_tag, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(id, name, type, encryptedValue, iv, authTag, JSON.stringify(entryMeta))

    log.info("Credential stored", { name, type, id })
    return {
      id,
      name,
      type,
      encryptedValue,
      iv,
      authTag,
      metadata: entryMeta,
      accessCount: 0,
    }
  }

  retrieve(id: string): { value: string; entry: VaultEntry } | null {
    this.ensureUnlocked()
    const row = this.db.prepare("SELECT * FROM entries WHERE id = ?").get(id) as Record<string, unknown> | undefined
    if (!row) return null

    this.db
      .prepare("UPDATE entries SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id)

    const entry = this.rowToEntry(row)
    const value = this.decrypt(entry.encryptedValue, entry.iv, entry.authTag)
    return { value, entry }
  }

  retrieveByName(name: string): { value: string; entry: VaultEntry } | null {
    this.ensureUnlocked()
    const row = this.db.prepare("SELECT * FROM entries WHERE name = ?").get(name) as Record<string, unknown> | undefined
    if (!row) return null

    this.db
      .prepare("UPDATE entries SET access_count = access_count + 1, last_accessed_at = ? WHERE name = ?")
      .run(new Date().toISOString(), name)

    const entry = this.rowToEntry(row)
    const value = this.decrypt(entry.encryptedValue, entry.iv, entry.authTag)
    return { value, entry }
  }

  delete(id: string): boolean {
    const result = this.db.prepare("DELETE FROM entries WHERE id = ?").run(id)
    if (result.changes > 0) {
      log.info("Credential deleted", { id })
      return true
    }
    return false
  }

  list(type?: VaultEntry["type"]): Omit<VaultEntry, "encryptedValue" | "iv" | "authTag">[] {
    const sql = type
      ? "SELECT * FROM entries WHERE type = ? ORDER BY metadata_json->>'$.createdAt' DESC"
      : "SELECT * FROM entries ORDER BY metadata_json->>'$.createdAt' DESC"
    const params = type ? [type] : []
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[]
    return rows.map((r) => {
      const entry = this.rowToEntry(r)
      const { encryptedValue, iv, authTag, ...rest } = entry
      void encryptedValue
      void iv
      void authTag
      return rest
    })
  }

  rotateKey(name: string, newValue: string): VaultEntry | null {
    this.ensureUnlocked()
    if (!this._verified) {
      throw new Error("Vault unlock was not verified — refusing to rotate an existing credential.")
    }
    const existing = this.retrieveByName(name)
    if (!existing) return null

    const { encryptedValue, iv, authTag } = this.encrypt(newValue)
    const now = new Date().toISOString()
    const meta = { ...existing.entry.metadata, updatedAt: now }

    this.db
      .prepare(
        `
      UPDATE entries SET encrypted_value = ?, iv = ?, auth_tag = ?, metadata_json = ?, access_count = 0
      WHERE name = ?
    `,
      )
      .run(encryptedValue, iv, authTag, JSON.stringify(meta), name)

    log.info("Credential rotated", { name })
    return {
      ...existing.entry,
      encryptedValue,
      iv,
      authTag,
      metadata: meta,
      accessCount: 0,
    }
  }

  getExpiredEntries(): VaultEntry[] {
    const now = new Date().toISOString()
    const rows = this.db
      .prepare(
        "SELECT * FROM entries WHERE json_extract(metadata_json, '$.expiresAt') IS NOT NULL AND json_extract(metadata_json, '$.expiresAt') < ?",
      )
      .all(now) as Record<string, unknown>[]
    return rows.map((r) => this.rowToEntry(r))
  }

  getStats(): { totalEntries: number; types: Record<string, number>; expired: number; locked: boolean } {
    const total = (this.db.prepare("SELECT COUNT(*) as c FROM entries").get() as { c: number }).c
    const typeRows = this.db.prepare("SELECT type, COUNT(*) as c FROM entries GROUP BY type").all() as {
      type: string
      c: number
    }[]
    const types: Record<string, number> = {}
    for (const r of typeRows) {
      types[r.type] = r.c
    }
    const now = new Date().toISOString()
    const expired =
      (
        this.db
          .prepare(
            "SELECT COUNT(*) as c FROM entries WHERE json_extract(metadata_json, '$.expiresAt') IS NOT NULL AND json_extract(metadata_json, '$.expiresAt') < ?",
          )
          .all(now) as { c: number }[]
      )[0]?.c ?? 0
    return { totalEntries: total, types, expired, locked: !this._isUnlocked }
  }

  private rowToEntry(row: Record<string, unknown>): VaultEntry {
    const meta = JSON.parse((row.metadata_json as string) || "{}")
    return {
      id: row.id as string,
      name: row.name as string,
      type: row.type as VaultEntry["type"],
      encryptedValue: row.encrypted_value as string,
      iv: row.iv as string,
      authTag: row.auth_tag as string,
      metadata: {
        createdBy: meta.createdBy ?? "unknown",
        createdAt: meta.createdAt ?? "",
        updatedAt: meta.updatedAt ?? "",
        expiresAt: meta.expiresAt,
        tags: meta.tags ?? [],
      },
      accessCount: (row.access_count as number) ?? 0,
      lastAccessedAt: (row.last_accessed_at as string) ?? undefined,
    }
  }
}
