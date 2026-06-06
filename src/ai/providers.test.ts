import { describe, it, expect, afterEach } from "bun:test"
import {
  registerProvider,
  getProviderFactory,
  listProviders,
  type ProviderFactory,
} from "./providers"
import {
  createAIProvider,
  resolveApiKey,
  parseFallbacksFromEnv,
  type AIConfig,
} from "./provider"
import { getDefaultModel, getProviderBaseUrl, type AIProviderType } from "./models"

describe("Provider Registry", () => {

  it("should list all registered providers", () => {
    const providers = listProviders()
    expect(providers.length).toBeGreaterThanOrEqual(14)
    expect(providers).toContain("openai")
    expect(providers).toContain("anthropic")
    expect(providers).toContain("deepseek")
    expect(providers).toContain("ollama")
    expect(providers).toContain("gemini")
    expect(providers).toContain("groq")
    expect(providers).toContain("openrouter")
    expect(providers).toContain("mistral")
    expect(providers).toContain("azure")
    expect(providers).toContain("togetherai")
    expect(providers).toContain("custom")
    // New providers
    expect(providers).toContain("xai")
    expect(providers).toContain("cohere")
    expect(providers).toContain("perplexity")
  })

  it("should get provider factory for each registered provider", () => {
    const providers = listProviders()
    for (const name of providers) {
      const factory = getProviderFactory(name)
      expect(factory).toBeDefined()
      expect(typeof factory).toBe("function")
    }
  })

  it("should return undefined for unknown provider", () => {
    expect(getProviderFactory("nonexistent")).toBeUndefined()
  })

  it("should allow registering additional providers at runtime", () => {
    const factory: ProviderFactory = () => ({}) as any
    registerProvider("test-provider", factory)
    expect(getProviderFactory("test-provider")).toBe(factory)
  })
})

describe("Provider Model References", () => {

  it("should have default model for each provider", () => {
    const providers: AIProviderType[] = [
      "anthropic", "openai", "deepseek", "ollama", "gemini", "groq",
      "openrouter", "mistral", "azure", "togetherai", "xai", "cohere", "perplexity",
    ]
    for (const p of providers) {
      const model = getDefaultModel(p)
      expect(model.length).toBeGreaterThan(0)
    }
  })

  it("should return empty string for custom provider", () => {
    expect(getDefaultModel("custom")).toBe("")
  })

  it("should have base URL for each provider", () => {
    const cases: [AIProviderType, string][] = [
      ["anthropic", "https://api.anthropic.com/v1"],
      ["openai", "https://api.openai.com/v1"],
      ["deepseek", "https://api.deepseek.com/v1"],
      ["ollama", "http://localhost:11434"],
      ["gemini", "https://generativelanguage.googleapis.com/v1beta/openai"],
      ["groq", "https://api.groq.com/openai/v1"],
      ["openrouter", "https://openrouter.ai/api/v1"],
      ["mistral", "https://api.mistral.ai/v1"],
      ["togetherai", "https://api.together.ai/v1"],
      ["xai", "https://api.x.ai/v1"],
      ["cohere", "https://api.cohere.com/v1"],
      ["perplexity", "https://api.perplexity.ai"],
    ]
    for (const [provider, expectedUrl] of cases) {
      expect(getProviderBaseUrl(provider)).toBe(expectedUrl)
    }
  })

  it("should return user base URL for azure and custom", () => {
    expect(getProviderBaseUrl("azure", "https://my-azure.openai.azure.com")).toBe("https://my-azure.openai.azure.com")
    expect(getProviderBaseUrl("custom", "https://my-custom-url.com/v1")).toBe("https://my-custom-url.com/v1")
  })
})

describe("resolveApiKey", () => {

  const SAVED_KEYS: Record<string, string | undefined> = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    XAI_API_KEY: process.env.XAI_API_KEY,
    COHERE_API_KEY: process.env.COHERE_API_KEY,
    PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
    AEGIS_AI_API_KEY: process.env.AEGIS_AI_API_KEY,
  }

  afterEach(() => {
    // Restore only the keys we modify in tests
    for (const [key, val] of Object.entries(SAVED_KEYS)) {
      if (val === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = val
      }
    }
  })

  it("should resolve correct env var for each provider", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    process.env.OPENAI_API_KEY = "sk-openai-test"
    process.env.XAI_API_KEY = "sk-xai-test"
    process.env.COHERE_API_KEY = "sk-cohere-test"
    process.env.PERPLEXITY_API_KEY = "pplx-test"

    expect(resolveApiKey("anthropic")).toBe("sk-ant-test")
    expect(resolveApiKey("openai")).toBe("sk-openai-test")
    expect(resolveApiKey("xai")).toBe("sk-xai-test")
    expect(resolveApiKey("cohere")).toBe("sk-cohere-test")
    expect(resolveApiKey("perplexity")).toBe("pplx-test")
  })

  it("should fallback to AEGIS_AI_API_KEY", () => {
    process.env.AEGIS_AI_API_KEY = "sk-fallback"
    expect(resolveApiKey("anthropic")).toBe("sk-fallback")
  })

  it("should return undefined when no key is set", () => {
    expect(resolveApiKey("nonexistent")).toBeUndefined()
  })
})

describe("AIProviderManager", () => {

  it("should create provider with config", () => {
    const config: AIConfig = {
      provider: "openai",
      model: "gpt-4o",
    }
    const provider = createAIProvider(config)
    expect(provider.getConfig()).toBeDefined()
    expect(provider.getConfig().provider).toBe("openai")
    expect(provider.getConfig().model).toBe("gpt-4o")
  })

  it("should get model for valid provider", () => {
    const config: AIConfig = {
      provider: "openai",
      model: "gpt-4o",
    }
    const provider = createAIProvider(config)
    const model = provider.getModel()
    expect(model).toBeDefined()
    expect(typeof model).toBe("object")
  })

  it("should throw for unsupported provider", () => {
    const config: AIConfig = {
      provider: "nonexistent" as AIProviderType,
      model: "test",
    }
    expect(() => createAIProvider(config).getModel()).toThrow("Unsupported provider: nonexistent")
  })

  it("should reject generate without API key", async () => {
    const config: AIConfig = {
      provider: "openai",
      model: "gpt-4o",
    }
    const provider = createAIProvider(config)
    await expect(provider.generate([{ role: "user", content: "hi" }])).rejects.toThrow()
  })

  it("should complete stream gracefully when API call fails", async () => {
    const config: AIConfig = {
      provider: "openai",
      model: "gpt-4o",
    }
    const provider = createAIProvider(config)
    const stream = provider.stream([{ role: "user", content: "hi" }])

    // streamText() from the Vercel AI SDK logs the error and returns an
    // already-exhausted stream (0 chunks) instead of throwing.
    const chunks: string[] = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }
    expect(chunks.length).toBe(0)
  })

  it("should fallback and still complete gracefully when all providers fail", async () => {
    const config: AIConfig = {
      provider: "openai",
      model: "gpt-4o",
      fallbacks: [
        { provider: "deepseek", model: "deepseek-chat" },
      ],
    }
    const provider = createAIProvider(config)
    const stream = provider.stream([{ role: "user", content: "hi" }])

    // Both primary and fallback fail (no API keys), exercising the
    // fallback iteration path. Stream completes with 0 chunks.
    const chunks: string[] = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }
    expect(chunks.length).toBe(0)
  })

  it("should reject async generator when all providers throw", async () => {
    // Register a mock provider factory that always throws
    const throwingFactory: ProviderFactory = () => {
      throw new Error("Simulated provider failure")
    }
    registerProvider("rejection-test", throwingFactory)

    const config: AIConfig = {
      provider: "rejection-test" as AIProviderType,
      model: "test-model",
    }
    const provider = createAIProvider(config)
    const stream = provider.stream([{ role: "user", content: "hi" }])

    // When getModel() throws (not caught by the try/catch around streamText),
    // the error propagates through the async generator's catch block as lastErr,
    // then throw lastErr at the top level causes next() to reject.
    await expect(stream.next()).rejects.toThrow("Simulated provider failure")
  })

  it("should reject stream async generator with fallback chain", async () => {
    // Two throwing providers in fallback chain
    const throwingFactory: ProviderFactory = () => {
      throw new Error("Provider boom")
    }
    registerProvider("rejection-fb1", throwingFactory)
    registerProvider("rejection-fb2", throwingFactory)

    const config: AIConfig = {
      provider: "rejection-fb1" as AIProviderType,
      model: "test",
      fallbacks: [
        { provider: "rejection-fb2" as AIProviderType, model: "test" },
      ],
    }
    const provider = createAIProvider(config)
    const stream = provider.stream([{ role: "user", content: "hi" }])

    // Both primary and fallback throw — the last error propagates
    await expect(stream.next()).rejects.toThrow("Provider boom")
  })

  it("should complete gracefully for each registered provider without API key", async () => {
    // Iterate over known types rather than listProviders() to avoid mock provider leakage
    const knownProviders: AIProviderType[] = [
      "anthropic", "openai", "deepseek", "gemini", "groq", "openrouter",
      "mistral", "togetherai", "xai", "cohere", "perplexity",
    ]

    for (const providerName of knownProviders) {
      const defaultModel = getDefaultModel(providerName)
      const config: AIConfig = {
        provider: providerName,
        model: defaultModel,
      }

      const mgr = createAIProvider(config)
      const stream = mgr.stream([{ role: "user", content: "hi" }])

      const chunks: string[] = []
      for await (const chunk of stream) {
        chunks.push(chunk)
      }
      expect(chunks.length).toBe(0)
    }
  })
})

describe("Fallback Configuration", () => {

  const FALLBACK_SAVED: Record<string, string | undefined> = {
    AEGIS_AI_FALLBACKS: process.env.AEGIS_AI_FALLBACKS,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  }

  afterEach(() => {
    for (const [key, val] of Object.entries(FALLBACK_SAVED)) {
      if (val === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = val
      }
    }
  })

  it("should parse fallbacks from env var", () => {
    process.env.AEGIS_AI_FALLBACKS = "anthropic:claude-sonnet-4-20250514,deepseek:deepseek-chat"
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    process.env.DEEPSEEK_API_KEY = "sk-ds-test"

    const fallbacks = parseFallbacksFromEnv()
    expect(fallbacks).toBeDefined()
    expect(fallbacks!.length).toBe(2)
    expect(fallbacks![0]!.provider).toBe("anthropic")
    expect(fallbacks![0]!.model).toBe("claude-sonnet-4-20250514")
    expect(fallbacks![0]!.apiKey).toBe("sk-ant-test")
    expect(fallbacks![1]!.provider).toBe("deepseek")
    expect(fallbacks![1]!.model).toBe("deepseek-chat")
    expect(fallbacks![1]!.apiKey).toBe("sk-ds-test")
  })

  it("should return undefined when no fallbacks env var set", () => {
    delete process.env.AEGIS_AI_FALLBACKS
    expect(parseFallbacksFromEnv()).toBeUndefined()
  })

  it("should throw on malformed fallback entry", () => {
    process.env.AEGIS_AI_FALLBACKS = "invalid-entry"
    expect(() => parseFallbacksFromEnv()).toThrow("Invalid fallback entry")
  })
})
