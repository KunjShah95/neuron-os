import { describe, it, expect } from "bun:test"
/**
 * Unit tests for the Vault module — encryption, key management, and credential storage.
 *
 * Tests AES-256-GCM encrypt/decrypt, key generation, vault CRUD operations,
 * env file generation, and legacy migration.
 */

import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { tmpdir } from "node:os"

describe("Vault Tests", () => {
  const TMP_DIR = resolve(tmpdir(), `aegis-test-vault-${Date.now()}`)

  // ══════════════════════════════════════════════════════════════════
  //  Crypto: AES-256-GCM
  // ══════════════════════════════════════════════════════════════════

  console.log("╚══════════════════════════════════════════════════════════╝\n")

  it("should encrypt decrypt roundtrip", async () => {
    const { encrypt, decrypt } = await import("./crypto")
    const key = Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "hex")

    const plaintext = "Hello, vault! This is a secret message."
    const encrypted = encrypt(plaintext, key)
    expect(typeof encrypted === "string").toBe(true)
    expect(encrypted.includes(":")).toBe(true)

    const decrypted = decrypt(encrypted, key)
    expect(decrypted).toBe(plaintext)
  })

  it("should encrypt produces different ciphertext", async () => {
    const { encrypt } = await import("./crypto")
    const key = Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "hex")

    const plaintext = "Same message"
    const result1 = encrypt(plaintext, key)
    const result2 = encrypt(plaintext, key)
    expect(result1 !== result2).toBe(true)
  })

  it("should decrypt with wrong key", async () => {
    const { encrypt, decrypt } = await import("./crypto")
    const key1 = Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "hex")
    const key2 = Buffer.from("fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210", "hex")

    const encrypted = encrypt("Secret data", key1)
    expect(() => decrypt(encrypted, key2)).toThrow()
  })

  it("should decrypt with tampered ciphertext", async () => {
    const { encrypt, decrypt } = await import("./crypto")
    const key = Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "hex")

    const encrypted = encrypt("Secret", key)
    const tampered = encrypted.slice(0, -5) + "XXXXX"
    expect(() => decrypt(tampered, key)).toThrow()
  })

  it("should encrypt large payload", async () => {
    const { encrypt, decrypt } = await import("./crypto")
    const key = Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "hex")

    const large = "x".repeat(10000)
    const encrypted = encrypt(large, key)
    const decrypted = decrypt(encrypted, key)
    expect(decrypted).toBe(large)
  })

  it("should encrypt empty string", async () => {
    const { encrypt, decrypt } = await import("./crypto")
    const key = Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "hex")

    const encrypted = encrypt("", key)
    const decrypted = decrypt(encrypted, key)
    expect(decrypted).toBe("")
  })

  // ══════════════════════════════════════════════════════════════════
  //  Key Management
  // ══════════════════════════════════════════════════════════════════

  console.log("╚══════════════════════════════════════════════════════════╝\n")

  it("should generate and save key", async () => {
    const { generateAndSaveKey } = await import("./crypto")

    const key = await generateAndSaveKey(TMP_DIR)
    expect(key.length).toBe(32)

    // Key file should exist
    const keyFile = resolve(TMP_DIR, ".vault-key")
    expect(existsSync(keyFile)).toBe(true)
  })

  it("should get vault key", async () => {
    const { getVaultKey } = await import("./crypto")

    const key = await getVaultKey(TMP_DIR)
    expect(key !== null).toBe(true)
    expect(key!.length).toBe(32)
  })

  it("should ensure vault key", async () => {
    const { ensureVaultKey } = await import("./crypto")

    const key = await ensureVaultKey(TMP_DIR)
    expect(key.length).toBe(32)
  })

  // ══════════════════════════════════════════════════════════════════
  //  CredentialVault Manager
  // ══════════════════════════════════════════════════════════════════

  console.log("╚══════════════════════════════════════════════════════════╝\n")

  it("should credential vault set get", async () => {
    const { CredentialVault } = await import("./manager")

    const vault = new CredentialVault()
    await vault.set("API_KEY", "sk-test123")

    const value = await vault.get("API_KEY")
    expect(value).toBe("sk-test123")
  })

  it("should credential vault get non existent", async () => {
    const { CredentialVault } = await import("./manager")

    const vault = new CredentialVault()
    const value = await vault.get("NONEXISTENT_KEY")
    expect(value).toBe(null)
  })

  it("should credential vault overwrite", async () => {
    const { CredentialVault } = await import("./manager")

    const vault = new CredentialVault()
    await vault.set("KEY_A", "value1")
    await vault.set("KEY_A", "value2")

    const value = await vault.get("KEY_A")
    expect(value).toBe("value2")
  })

  it("should credential vault delete", async () => {
    const { CredentialVault } = await import("./manager")

    const vault = new CredentialVault()
    await vault.set("DELETE_ME", "temp")
    const deleted = await vault.delete("DELETE_ME")
    expect(deleted).toBe(true)

    const value = await vault.get("DELETE_ME")
    expect(value).toBe(null)
  })

  it("should credential vault delete non existent", async () => {
    const { CredentialVault } = await import("./manager")

    const vault = new CredentialVault()
    const deleted = await vault.delete("GHOST")
    expect(!deleted).toBe(true)
  })

  it("should credential vault list", async () => {
    const { CredentialVault } = await import("./manager")

    const vault = new CredentialVault()
    await vault.set("KEY_1", "val1")
    await vault.set("KEY_2", "val2", "scope-a")

    const all = await vault.list()
    expect(all.length >= 2).toBe(true)

    const scoped = await vault.list("scope-a")
    expect(scoped.length >= 1).toBe(true)
    expect(scoped.every((e) => e.scope === "scope-a")).toBe(true)
  })

  it("should credential vault scoped env", async () => {
    const { CredentialVault } = await import("./manager")

    const vault = new CredentialVault()
    await vault.set("SCOPE_KEY", "scope-val", "scope-b")

    const vars = vault.getEnvVars("scope-b")
    expect(vars["SCOPE_KEY"]).toBe("scope-val")
  })

  it("should credential vault is not encrypted initially", async () => {
    const { CredentialVault } = await import("./manager")

    const vault = new CredentialVault()
    expect(!vault.isEncrypted()).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════
  //  RUNNER
  // ══════════════════════════════════════════════════════════════════
})
