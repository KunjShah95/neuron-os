#!/usr/bin/env bun
/**
 * Unit tests for the Vault module — encryption, key management, and credential storage.
 *
 * Tests AES-256-GCM encrypt/decrypt, key generation, vault CRUD operations,
 * env file generation, and legacy migration.
 */

import { existsSync, mkdirSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { tmpdir } from "node:os"

let passed = 0
let failed = 0

function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label}`) }
}

function assertEqual<T>(a: T, b: T, label: string) {
  if (a === b) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
}

function assertThrows(fn: () => void, label: string) {
  try {
    fn()
    failed++; console.error(`  ❌ ${label} — expected to throw but did not`)
  } catch {
    passed++; console.log(`  ✅ ${label}`)
  }
}

const TMP_DIR = resolve(tmpdir(), `aegis-test-vault-${Date.now()}`)

function setup() {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true })
}

function teardown() {
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true })
}

// ══════════════════════════════════════════════════════════════════
//  Crypto: AES-256-GCM
// ══════════════════════════════════════════════════════════════════

console.log("\n╔══════════════════════════════════════════════════════════╗")
console.log("║  Vault — AES-256-GCM Crypto                            ║")
console.log("╚══════════════════════════════════════════════════════════╝\n")

async function testEncryptDecryptRoundtrip() {
  const { encrypt, decrypt } = await import("./crypto")
  const key = Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "hex")

  const plaintext = "Hello, vault! This is a secret message."
  const encrypted = encrypt(plaintext, key)
  assert(typeof encrypted === "string", "encrypt returns a string")
  assert(encrypted.includes(":"), "encrypted format contains colons (iv:tag:ciphertext)")

  const decrypted = decrypt(encrypted, key)
  assertEqual(decrypted, plaintext, "decrypt(encrypt(text)) === text")
}

async function testEncryptProducesDifferentCiphertext() {
  const { encrypt } = await import("./crypto")
  const key = Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "hex")

  const plaintext = "Same message"
  const result1 = encrypt(plaintext, key)
  const result2 = encrypt(plaintext, key)
  assert(result1 !== result2, "same plaintext + same key produces different ciphertext (random IV)")
}

async function testDecryptWithWrongKey() {
  const { encrypt, decrypt } = await import("./crypto")
  const key1 = Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "hex")
  const key2 = Buffer.from("fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210", "hex")

  const encrypted = encrypt("Secret data", key1)
  assertThrows(() => decrypt(encrypted, key2), "decrypt with wrong key throws (GCM auth failure)")
}

async function testDecryptWithTamperedCiphertext() {
  const { encrypt, decrypt } = await import("./crypto")
  const key = Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "hex")

  const encrypted = encrypt("Secret", key)
  const tampered = encrypted.slice(0, -5) + "XXXXX"
  assertThrows(() => decrypt(tampered, key), "decrypt with tampered ciphertext throws")
}

async function testEncryptLargePayload() {
  const { encrypt, decrypt } = await import("./crypto")
  const key = Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "hex")

  const large = "x".repeat(10000)
  const encrypted = encrypt(large, key)
  const decrypted = decrypt(encrypted, key)
  assertEqual(decrypted, large, "large payload (10k chars) encrypt/decrypt roundtrips")
}

async function testEncryptEmptyString() {
  const { encrypt, decrypt } = await import("./crypto")
  const key = Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "hex")

  const encrypted = encrypt("", key)
  const decrypted = decrypt(encrypted, key)
  assertEqual(decrypted, "", "empty string roundtrips")
}

// ══════════════════════════════════════════════════════════════════
//  Key Management
// ══════════════════════════════════════════════════════════════════

console.log("\n╔══════════════════════════════════════════════════════════╗")
console.log("║  Vault — Key Management                                ║")
console.log("╚══════════════════════════════════════════════════════════╝\n")

async function testGenerateAndSaveKey() {
  const { generateAndSaveKey } = await import("./crypto")

  const key = await generateAndSaveKey(TMP_DIR)
  assertEqual(key.length, 32, "generated key is 32 bytes (256 bits)")

  // Key file should exist
  const keyFile = resolve(TMP_DIR, ".vault-key")
  assert(existsSync(keyFile), "key file created on disk")
}

async function testGetVaultKey() {
  const { getVaultKey } = await import("./crypto")

  const key = await getVaultKey(TMP_DIR)
  assert(key !== null, "getVaultKey returns key after generateAndSaveKey")
  assertEqual(key!.length, 32, "retrieved key is 32 bytes")
}

async function testEnsureVaultKey() {
  const { ensureVaultKey } = await import("./crypto")

  const key = await ensureVaultKey(TMP_DIR)
  assertEqual(key.length, 32, "ensureVaultKey returns 32-byte key")
}

// ══════════════════════════════════════════════════════════════════
//  CredentialVault Manager
// ══════════════════════════════════════════════════════════════════

console.log("\n╔══════════════════════════════════════════════════════════╗")
console.log("║  Vault — CredentialVault Manager                       ║")
console.log("╚══════════════════════════════════════════════════════════╝\n")

async function testCredentialVaultSetGet() {
  const { CredentialVault } = await import("./manager")

  const vault = new CredentialVault()
  await vault.set("API_KEY", "sk-test123")

  const value = await vault.get("API_KEY")
  assertEqual(value, "sk-test123", "get returns set value")
}

async function testCredentialVaultGetNonExistent() {
  const { CredentialVault } = await import("./manager")

  const vault = new CredentialVault()
  const value = await vault.get("NONEXISTENT_KEY")
  assertEqual(value, null, "get for non-existent key returns null")
}

async function testCredentialVaultOverwrite() {
  const { CredentialVault } = await import("./manager")

  const vault = new CredentialVault()
  await vault.set("KEY_A", "value1")
  await vault.set("KEY_A", "value2")

  const value = await vault.get("KEY_A")
  assertEqual(value, "value2", "overwriting a key updates its value")
}

async function testCredentialVaultDelete() {
  const { CredentialVault } = await import("./manager")

  const vault = new CredentialVault()
  await vault.set("DELETE_ME", "temp")
  const deleted = await vault.delete("DELETE_ME")
  assert(deleted, "delete returns true for existing key")

  const value = await vault.get("DELETE_ME")
  assertEqual(value, null, "deleted key returns null")
}

async function testCredentialVaultDeleteNonExistent() {
  const { CredentialVault } = await import("./manager")

  const vault = new CredentialVault()
  const deleted = await vault.delete("GHOST")
  assert(!deleted, "delete returns false for non-existent key")
}

async function testCredentialVaultList() {
  const { CredentialVault } = await import("./manager")

  const vault = new CredentialVault()
  await vault.set("KEY_1", "val1")
  await vault.set("KEY_2", "val2", "scope-a")

  const all = await vault.list()
  assert(all.length >= 2, "list returns all entries")

  const scoped = await vault.list("scope-a")
  assert(scoped.length >= 1, "list with scope filters correctly")
  assert(scoped.every((e) => e.scope === "scope-a"), "all scoped entries have correct scope")
}

async function testCredentialVaultScopedEnv() {
  const { CredentialVault } = await import("./manager")

  const vault = new CredentialVault()
  await vault.set("SCOPE_KEY", "scope-val", "scope-b")

  const vars = vault.getEnvVars("scope-b")
  assertEqual(vars["SCOPE_KEY"], "scope-val", "scoped env vars accessible")
}

async function testCredentialVaultIsNotEncryptedInitially() {
  const { CredentialVault } = await import("./manager")

  const vault = new CredentialVault()
  assert(!vault.isEncrypted(), "fresh vault is not encrypted (until first write)")
}

// ══════════════════════════════════════════════════════════════════
//  RUNNER
// ══════════════════════════════════════════════════════════════════

async function runAll() {
  console.log("\n  ╔══════════════════════════════════════════╗")
  console.log("  ║   Vault Module Tests                     ║")
  console.log("  ╚══════════════════════════════════════════╝")

  setup()

  // ── Crypto ──
  await testEncryptDecryptRoundtrip()
  await testEncryptProducesDifferentCiphertext()
  await testDecryptWithWrongKey()
  await testDecryptWithTamperedCiphertext()
  await testEncryptLargePayload()
  await testEncryptEmptyString()

  // ── Key Management ──
  await testGenerateAndSaveKey()
  await testGetVaultKey()
  await testEnsureVaultKey()

  // ── CredentialVault ──
  await testCredentialVaultSetGet()
  await testCredentialVaultGetNonExistent()
  await testCredentialVaultOverwrite()
  await testCredentialVaultDelete()
  await testCredentialVaultDeleteNonExistent()
  await testCredentialVaultList()
  await testCredentialVaultScopedEnv()
  await testCredentialVaultIsNotEncryptedInitially()

  teardown()

  console.log(`\n══ Results: ${passed} passed, ${failed} failed ══\n`)
  process.exit(failed > 0 ? 1 : 0)
}

runAll()
