import { describe, it, expect } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CredentialVault } from "./credential-vault"

function makeVault(): { vault: CredentialVault; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "aegis-cred-vault-"))
  return { vault: new CredentialVault(join(dir, "vault.db")), dir }
}

function dropKeyVerifier(vault: CredentialVault): void {
  const db = (vault as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } } }).db
  db.prepare("DELETE FROM vault_config WHERE key = 'key_verifier'").run()
}

describe("credential vault unlock verification", () => {
  it("rejects an incorrect master password", () => {
    const { vault } = makeVault()
    vault.initialize("correct-password")

    expect(vault.unlock("correct-password")).toBe(true)
    expect(vault.isUnlocked).toBe(true)
    expect(vault.isVerified).toBe(true)

    vault.lock()
    expect(vault.unlock("wrong-password")).toBe(false)
    expect(vault.isUnlocked).toBe(false)
    expect(vault.isVerified).toBe(false)
  })

  it("rejects an empty master password", () => {
    const { vault } = makeVault()
    vault.initialize("correct-password")
    vault.lock()

    expect(vault.unlock("")).toBe(false)
    expect(vault.isUnlocked).toBe(false)
  })

  it("does not let a wrong password destroy an existing secret", () => {
    const { vault } = makeVault()
    vault.initialize("correct-password")
    vault.store("GITHUB_TOKEN", "gh_secret_value", "token")

    expect(vault.unlock("wrong-password")).toBe(false)

    expect(vault.unlock("correct-password")).toBe(true)
    const retrieved = vault.retrieveByName("GITHUB_TOKEN")
    expect(retrieved?.value).toBe("gh_secret_value")
  })

  it("does not let a wrong password rotate an existing secret", () => {
    const { vault } = makeVault()
    vault.initialize("correct-password")
    vault.store("GITHUB_TOKEN", "gh_secret_value", "token")

    expect(vault.unlock("wrong-password")).toBe(false)

    expect(vault.unlock("correct-password")).toBe(true)
    const rotated = vault.rotateKey("GITHUB_TOKEN", "rotated_value")
    expect(rotated).not.toBeNull()
    expect(vault.retrieveByName("GITHUB_TOKEN")?.value).toBe("rotated_value")
  })

  it("refuses to unlock a vault that was never initialized", () => {
    const { vault } = makeVault()
    expect(vault.unlock("anything")).toBe(false)
    expect(vault.isUnlocked).toBe(false)
  })

  it("upgrades a legacy vault without a verifier once the password is proven", () => {
    const { vault } = makeVault()
    vault.initialize("correct-password")
    vault.store("API_KEY", "api_secret_value", "api-key")
    dropKeyVerifier(vault)
    vault.lock()

    expect(vault.unlock("correct-password")).toBe(true)
    expect(vault.isVerified).toBe(true)

    vault.lock()
    expect(vault.unlock("correct-password")).toBe(true)
    expect(vault.isVerified).toBe(true)
    expect(vault.retrieveByName("API_KEY")?.value).toBe("api_secret_value")
  })

  it("does not mark a legacy vault as verified when the password cannot be proven", () => {
    const { vault } = makeVault()
    vault.initialize("correct-password")
    vault.store("API_KEY", "api_secret_value", "api-key")
    dropKeyVerifier(vault)
    vault.lock()

    expect(vault.unlock("wrong-password")).toBe(true)
    expect(vault.isVerified).toBe(false)
  })

  it("refuses to overwrite an existing entry when the unlock was not verified", () => {
    const { vault } = makeVault()
    vault.initialize("correct-password")
    vault.store("API_KEY", "api_secret_value", "api-key")
    dropKeyVerifier(vault)
    vault.lock()

    expect(vault.unlock("wrong-password")).toBe(true)
    expect(vault.isVerified).toBe(false)

    expect(() => vault.store("API_KEY", "destroyed_value", "api-key")).toThrow()
    expect(() => vault.rotateKey("API_KEY", "destroyed_value")).toThrow()

    expect(vault.unlock("correct-password")).toBe(true)
    expect(vault.retrieveByName("API_KEY")?.value).toBe("api_secret_value")
  })

  it("refuses to re-initialize a vault that already holds credentials", () => {
    const { vault } = makeVault()
    vault.initialize("correct-password")
    vault.store("API_KEY", "api_secret_value", "api-key")

    expect(() => vault.initialize("another-password")).toThrow()
  })
})
