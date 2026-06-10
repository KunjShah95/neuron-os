import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { getDefaultConfiguredProvider } from "./provider-guard"

describe("getDefaultConfiguredProvider", () => {
  const saved: Record<string, string | undefined> = {}
  const keys = [
    "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY",
    "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GROQ_API_KEY",
    "MISTRAL_API_KEY", "DEEPSEEK_API_KEY", "AEGIS_AI_API_KEY",
  ]

  beforeEach(() => {
    for (const k of keys) { saved[k] = process.env[k]; delete process.env[k] }
  })

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] !== undefined) process.env[k] = saved[k]
      else delete process.env[k]
    }
  })

  it("returns null when no keys set", () => {
    expect(getDefaultConfiguredProvider()).toBeNull()
  })

  it("returns anthropic when ANTHROPIC_API_KEY set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    const result = getDefaultConfiguredProvider()
    expect(result?.provider).toBe("anthropic")
    expect(result?.model).toBeTruthy()
  })

  it("prefers anthropic over openai", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    process.env.OPENAI_API_KEY = "sk-test"
    expect(getDefaultConfiguredProvider()?.provider).toBe("anthropic")
  })

  it("falls back to openai when anthropic missing", () => {
    process.env.OPENAI_API_KEY = "sk-test"
    expect(getDefaultConfiguredProvider()?.provider).toBe("openai")
  })
})
