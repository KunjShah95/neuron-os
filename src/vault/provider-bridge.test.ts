import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { clearVaultCredentials, resolveApiKey } from "../ai/provider"
import { syncVaultToProviders } from "./provider-bridge"
import type { VaultEntry } from "./credential-vault"

class MockVault {
  isUnlocked = true
  private entries = new Map<string, string>()

  store(name: string, value: string): void {
    this.entries.set(name, value)
  }

  retrieveByName(name: string): { value: string; entry: VaultEntry } | null {
    const value = this.entries.get(name)
    if (!value) return null
    return { value, entry: { name, type: "api-key" } as VaultEntry }
  }
}

const SAVED_KEYS: Record<string, string | undefined> = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
}

describe("provider-bridge", () => {
  beforeEach(() => {
    clearVaultCredentials()
  })

  afterEach(() => {
    clearVaultCredentials()
    for (const [key, val] of Object.entries(SAVED_KEYS)) {
      if (val === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = val
      }
    }
  })

  it("should sync provider credentials from vault entries to env vars", () => {
    const vault = new MockVault()
    vault.store("ANTHROPIC_API_KEY", "sk-ant-vault")
    vault.store("GOOGLE_GENERATIVE_AI_API_KEY", "sk-gemini-vault")

    const count = syncVaultToProviders(vault as any)
    expect(count).toBe(2)
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-vault")
    expect(process.env.GOOGLE_GENERATIVE_AI_API_KEY).toBe("sk-gemini-vault")
    expect(resolveApiKey("anthropic")).toBe("sk-ant-vault")
    expect(resolveApiKey("gemini")).toBe("sk-gemini-vault")
  })

  it("should support both ANTHROPIC_API_KEY and api-key-anthropic naming conventions", () => {
    const vault = new MockVault()
    vault.store("api-key-anthropic", "sk-ant-alt")
    vault.store("OPENAI_API_KEY", "sk-openai-standard")

    const count = syncVaultToProviders(vault as any)
    expect(count).toBe(2)
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-alt")
    expect(resolveApiKey("anthropic")).toBe("sk-ant-alt")
    expect(process.env.OPENAI_API_KEY).toBe("sk-openai-standard")
    expect(resolveApiKey("openai")).toBe("sk-openai-standard")
  })

  it("should return 0 when vault is locked", () => {
    const vault = new MockVault()
    vault.isUnlocked = false
    vault.store("ANTHROPIC_API_KEY", "sk-locked")

    const savedAnthropic = process.env.ANTHROPIC_API_KEY
    const savedFallback = process.env.AEGIS_AI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.AEGIS_AI_API_KEY

    const count = syncVaultToProviders(vault as any)
    expect(count).toBe(0)
    expect(resolveApiKey("anthropic")).toBeUndefined()

    if (savedAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = savedAnthropic
    if (savedFallback !== undefined) process.env.AEGIS_AI_API_KEY = savedFallback
  })
})
