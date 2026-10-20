import { describe, it, expect, afterEach } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const ORIGINAL_HOME = process.env.HOME
const ORIGINAL_USERPROFILE = process.env.USERPROFILE

function useTempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "aegis-vault-scope-"))
  process.env.HOME = dir
  process.env.USERPROFILE = dir
  return dir
}

function restoreHome(): void {
  if (ORIGINAL_HOME === undefined) delete process.env.HOME
  else process.env.HOME = ORIGINAL_HOME
  if (ORIGINAL_USERPROFILE === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = ORIGINAL_USERPROFILE
}

const TRAVERSAL_SCOPES = [
  "../../../etc/passwd",
  "../../../../home/user/.ssh/authorized_keys",
  "..",
  "../evil",
  "foo/../../bar",
  "foo/bar",
  "foo\\bar",
  "..\\..\\evil",
  "with space",
  ".",
  "",
  "a".repeat(65),
]

describe("vault scope validation", () => {
  afterEach(() => {
    restoreHome()
  })

  it("accepts only allow-listed scope names", async () => {
    const { isValidScope } = await import("./manager")

    expect(isValidScope("global")).toBe(true)
    expect(isValidScope("team-a")).toBe(true)
    expect(isValidScope("Team_A1")).toBe(true)
    expect(isValidScope("a".repeat(64))).toBe(true)

    for (const scope of TRAVERSAL_SCOPES) {
      expect(isValidScope(scope)).toBe(false)
    }
  })

  it("rejects traversal scopes on write", async () => {
    const home = useTempHome()
    const { CredentialVault } = await import("./manager")
    const vault = new CredentialVault()

    for (const scope of TRAVERSAL_SCOPES) {
      await expect(vault.set("SECRET_KEY", "secret-value", scope)).rejects.toThrow()
    }

    expect(existsSync(resolve(home, ".aegis", "env"))).toBe(false)
    expect(existsSync(resolve(home, "evil.env"))).toBe(false)
    expect(existsSync(resolve(home, "passwd.env"))).toBe(false)
  })

  it("rejects traversal scopes on load", async () => {
    const home = useTempHome()
    writeFileSync(resolve(home, "outside.env"), "LEAKED=should-not-be-loaded\n", "utf-8")
    const { CredentialVault } = await import("./manager")
    const vault = new CredentialVault()

    for (const scope of TRAVERSAL_SCOPES) {
      const loaded = await vault.loadScopedEnv(scope)
      expect(loaded).toEqual({})
    }
  })

  it("keeps the resolved scoped path inside the vault env directory", async () => {
    useTempHome()
    const { resolveScopedEnvPath } = await import("./manager")
    const root = resolve(process.env.HOME as string, ".aegis", "env")
    const target = resolveScopedEnvPath("team-a")

    expect(target.startsWith(root)).toBe(true)
    expect(target).toBe(join(root, "team-a.env"))
    expect(() => resolveScopedEnvPath("../escape")).toThrow()
  })

  it("writes scoped env files inside the vault env directory", async () => {
    useTempHome()
    const { CredentialVault, resolveScopedEnvPath } = await import("./manager")
    const vault = new CredentialVault()

    await vault.set("SCOPED_KEY", "scoped-value", "team-a")

    const scopedFile = resolveScopedEnvPath("team-a")
    expect(existsSync(scopedFile)).toBe(true)
    expect(readFileSync(scopedFile, "utf-8")).toContain("SCOPED_KEY=scoped-value")
  })
})

describe("vault plaintext env file hardening", () => {
  afterEach(() => {
    restoreHome()
  })

  it("does not create the global env file when there are no global secrets", async () => {
    const home = useTempHome()
    const { CredentialVault } = await import("./manager")
    const vault = new CredentialVault()

    await vault.set("SCOPED_ONLY", "scoped-value", "team-b")

    expect(existsSync(resolve(home, ".aegis", "agent.env"))).toBe(false)
  })

  it("removes the global env file when the last global secret is deleted", async () => {
    const home = useTempHome()
    const { CredentialVault } = await import("./manager")
    const vault = new CredentialVault()

    await vault.set("GLOBAL_KEY", "global-value")
    const envPath = resolve(home, ".aegis", "agent.env")
    expect(existsSync(envPath)).toBe(true)

    await vault.delete("GLOBAL_KEY")
    expect(existsSync(envPath)).toBe(false)
  })

  it("writes the global env file with owner-only permissions", async () => {
    const home = useTempHome()
    const { CredentialVault } = await import("./manager")
    const vault = new CredentialVault()

    await vault.set("GLOBAL_KEY", "global-value")

    const envPath = resolve(home, ".aegis", "agent.env")
    expect(existsSync(envPath)).toBe(true)
    expect(readFileSync(envPath, "utf-8")).toContain("GLOBAL_KEY=global-value")

    if (process.platform !== "win32") {
      expect(statSync(envPath).mode & 0o777).toBe(0o600)
    }
  })

  it("writes scoped env files with owner-only permissions", async () => {
    useTempHome()
    const { CredentialVault, resolveScopedEnvPath } = await import("./manager")
    const vault = new CredentialVault()

    await vault.set("SCOPED_KEY", "scoped-value", "team-c")

    const scopedFile = resolveScopedEnvPath("team-c")
    if (process.platform !== "win32") {
      expect(statSync(scopedFile).mode & 0o777).toBe(0o600)
    }
  })

  it("writes the encrypted vault file with owner-only permissions", async () => {
    const home = useTempHome()
    const { CredentialVault } = await import("./manager")
    const vault = new CredentialVault()

    await vault.set("GLOBAL_KEY", "global-value")

    const vaultPath = resolve(home, ".aegis", "vault.enc")
    expect(existsSync(vaultPath)).toBe(true)
    expect(readFileSync(vaultPath, "utf-8")).not.toContain("global-value")

    if (process.platform !== "win32") {
      expect(statSync(vaultPath).mode & 0o777).toBe(0o600)
    }
  })
})
