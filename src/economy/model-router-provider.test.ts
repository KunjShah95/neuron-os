import { describe, it, expect } from "bun:test"
import { resolveModelProvider } from "./model-router"
import { loadPricing } from "./pricing-registry"
import { listProviders } from "../ai/providers"

describe("resolveModelProvider", () => {
  it("resolves the registry llama models to their real providers", () => {
    expect(resolveModelProvider("meta-llama/llama-3.1-70b-instruct:free")).toBe("openrouter")
    expect(resolveModelProvider("meta/llama-3.1-70b-instruct")).toBe("nvidia")
    expect(resolveModelProvider("meta/llama-3.1-8b-instruct")).toBe("nvidia")
    expect(resolveModelProvider("llama-3.3-70b-versatile")).toBe("groq")
  })

  it("resolves the registry mixtral model to its real provider", () => {
    expect(resolveModelProvider("mistralai/mixtral-8x22b-instruct-v0.1")).toBe("nvidia")
  })

  it("resolves the remaining namespaced models", () => {
    expect(resolveModelProvider("microsoft/phi-4:free")).toBe("openrouter")
    expect(resolveModelProvider("google/gemini-2.5-pro")).toBe("openrouter")
    expect(resolveModelProvider("qwen/qwen2.5-vl-3b-instruct:free")).toBe("openrouter")
    expect(resolveModelProvider("nvidia/nemotron-4-340b-instruct")).toBe("nvidia")
    expect(resolveModelProvider("cognitivecomputations/dolphin3.0-mistral-24b:free")).toBe("openrouter")
    expect(resolveModelProvider("openrouter/free")).toBe("openrouter")
  })

  it("keeps the flat model names on their original providers", () => {
    expect(resolveModelProvider("claude-sonnet-4-6")).toBe("anthropic")
    expect(resolveModelProvider("gpt-4o")).toBe("openai")
    expect(resolveModelProvider("gpt-4o-mini")).toBe("openai")
    expect(resolveModelProvider("gemini-2.5-pro")).toBe("gemini")
    expect(resolveModelProvider("deepseek-v3")).toBe("deepseek")
    expect(resolveModelProvider("mistral-large-latest")).toBe("mistral")
  })

  it("falls back to a multi-provider gateway for unknown models", () => {
    expect(resolveModelProvider("totally-unknown-model")).toBe("openrouter")
    expect(resolveModelProvider("openai")).not.toBe("openai")
  })

  it("never resolves a registry model to an unregistered provider", () => {
    const registered = listProviders()
    for (const model of Object.keys(loadPricing().models)) {
      expect(registered).toContain(resolveModelProvider(model))
    }
  })
})
