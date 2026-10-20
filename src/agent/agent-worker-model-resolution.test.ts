import { describe, it, expect } from "bun:test"
import { resolveModelSelection, isModelValidForProvider } from "./agent-worker"

describe("resolveModelSelection", () => {
  it("prefers the routed provider/model over the configured default", () => {
    const selection = resolveModelSelection({
      AEGIS_DEFAULT_PROVIDER: "anthropic",
      AEGIS_DEFAULT_MODEL: "claude-sonnet-4-20250514",
      AEGIS_ROUTED_PROVIDER: "groq",
      AEGIS_ROUTED_MODEL: "llama-3.3-70b-versatile",
    })

    expect(selection.source).toBe("routed")
    expect(selection.provider).toBe("groq")
    expect(selection.model).toBe("llama-3.3-70b-versatile")
  })

  it("keeps an explicit user model over the routed model", () => {
    const selection = resolveModelSelection({
      AEGIS_AI_MODEL: "gpt-4o",
      AEGIS_ROUTED_PROVIDER: "groq",
      AEGIS_ROUTED_MODEL: "llama-3.3-70b-versatile",
    })

    expect(selection.source).toBe("explicit")
    expect(selection.model).toBe("gpt-4o")
  })

  it("keeps an explicit user provider over the routed provider", () => {
    const selection = resolveModelSelection({
      AEGIS_AI_PROVIDER: "openai",
      AEGIS_ROUTED_PROVIDER: "groq",
      AEGIS_ROUTED_MODEL: "llama-3.3-70b-versatile",
    })

    expect(selection.source).toBe("explicit")
    expect(selection.provider).toBe("openai")
  })

  it("ignores an AEGIS_AI_* value that merely repeats the default", () => {
    const selection = resolveModelSelection({
      AEGIS_DEFAULT_PROVIDER: "anthropic",
      AEGIS_DEFAULT_MODEL: "claude-sonnet-4-20250514",
      AEGIS_AI_PROVIDER: "anthropic",
      AEGIS_AI_MODEL: "claude-sonnet-4-20250514",
      AEGIS_ROUTED_PROVIDER: "groq",
      AEGIS_ROUTED_MODEL: "llama-3.3-70b-versatile",
    })

    expect(selection.source).toBe("routed")
    expect(selection.provider).toBe("groq")
  })

  it("falls back to the default when no routed values exist", () => {
    const selection = resolveModelSelection({
      AEGIS_DEFAULT_PROVIDER: "anthropic",
      AEGIS_DEFAULT_MODEL: "claude-sonnet-4-20250514",
    })

    expect(selection.source).toBe("default")
    expect(selection.provider).toBe("anthropic")
    expect(selection.model).toBe("claude-sonnet-4-20250514")
  })

  it("auto-detects when nothing is configured", () => {
    const selection = resolveModelSelection({})

    expect(selection.source).toBe("auto")
    expect(selection.provider).toBeUndefined()
    expect(selection.model).toBeUndefined()
  })

  it("ignores an empty routed model", () => {
    const selection = resolveModelSelection({
      AEGIS_DEFAULT_PROVIDER: "anthropic",
      AEGIS_DEFAULT_MODEL: "claude-sonnet-4-20250514",
      AEGIS_ROUTED_PROVIDER: "groq",
      AEGIS_ROUTED_MODEL: "   ",
    })

    expect(selection.source).toBe("default")
    expect(selection.provider).toBe("anthropic")
  })

  it("ignores a routed model that is not valid for the routed provider", () => {
    const selection = resolveModelSelection({
      AEGIS_DEFAULT_PROVIDER: "anthropic",
      AEGIS_DEFAULT_MODEL: "claude-sonnet-4-20250514",
      AEGIS_ROUTED_PROVIDER: "openrouter",
      AEGIS_ROUTED_MODEL: "gpt-4o",
    })

    expect(selection.source).toBe("default")
    expect(selection.provider).toBe("anthropic")
  })

  it("ignores an unknown routed provider", () => {
    const selection = resolveModelSelection({
      AEGIS_DEFAULT_PROVIDER: "anthropic",
      AEGIS_DEFAULT_MODEL: "claude-sonnet-4-20250514",
      AEGIS_ROUTED_PROVIDER: "not-a-provider",
      AEGIS_ROUTED_MODEL: "gpt-4o",
    })

    expect(selection.source).toBe("default")
  })

  it("derives a provider for an explicit model the default provider cannot serve", () => {
    const selection = resolveModelSelection({
      AEGIS_DEFAULT_PROVIDER: "groq",
      AEGIS_DEFAULT_MODEL: "llama-3.3-70b-versatile",
      AEGIS_AI_MODEL: "gpt-4o",
    })

    expect(selection.source).toBe("explicit")
    expect(selection.model).toBe("gpt-4o")
    expect(selection.provider).toBe("openai")
  })
})

describe("isModelValidForProvider", () => {
  it("accepts a model listed for the provider", () => {
    expect(isModelValidForProvider("groq", "llama-3.3-70b-versatile")).toBe(true)
    expect(isModelValidForProvider("openrouter", "openai/gpt-4o")).toBe(true)
    expect(isModelValidForProvider("perplexity", "sonar-pro")).toBe(true)
  })

  it("accepts a model whose prefix matches the provider", () => {
    expect(isModelValidForProvider("anthropic", "claude-sonnet-4-6")).toBe(true)
    expect(isModelValidForProvider("openai", "gpt-4o-mini")).toBe(true)
    expect(isModelValidForProvider("nvidia", "mistralai/mixtral-8x22b-instruct-v0.1")).toBe(true)
  })

  it("rejects a model that belongs to another provider", () => {
    expect(isModelValidForProvider("openrouter", "gpt-4o")).toBe(false)
    expect(isModelValidForProvider("groq", "gpt-4o")).toBe(false)
  })
})
