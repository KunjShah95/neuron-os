import { generateText, streamText } from "ai"
import type { LanguageModel } from "ai"
import type { AIProviderType } from "./models"
import { getProviderFactory } from "./providers"

const vaultOverrides = new Map<string, string>()

export function setVaultCredential(provider: string, apiKey: string): void {
  vaultOverrides.set(provider, apiKey)
}

export function clearVaultCredentials(): void {
  vaultOverrides.clear()
}

// ── Auto Provider Detection ──────────────────────────────────────────

const PROVIDER_PRIORITY: Array<{ provider: string; model: string }> = [
  { provider: "groq", model: "llama-3.3-70b-versatile" },
  { provider: "openrouter", model: "openrouter/free" },
  { provider: "gemini", model: "gemini-2.0-flash" },
  { provider: "deepseek", model: "deepseek-chat" },
  { provider: "togetherai", model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo" },
  { provider: "nvidia", model: "mistralai/mixtral-8x22b-instruct-v0.1" },
  { provider: "mistral", model: "mistral-large-latest" },
  { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  { provider: "openai", model: "gpt-4o" },
  { provider: "xai", model: "grok-2" },
  { provider: "cohere", model: "command-r-plus" },
  { provider: "perplexity", model: "sonar-pro" },
]

export function getConfiguredProviders(): Array<{ provider: string; model: string; apiKey?: string }> {
  const configured: Array<{ provider: string; model: string; apiKey?: string }> = []
  for (const entry of PROVIDER_PRIORITY) {
    const apiKey = resolveApiKey(entry.provider)
    if (apiKey) {
      configured.push({ provider: entry.provider, model: entry.model, apiKey })
    }
  }
  return configured
}

export function getDefaultConfiguredProvider(): { provider: string; model: string; apiKey?: string } | null {
  const providers = getConfiguredProviders()
  return providers[0] ?? null
}

export function buildAutoFallbacks(): AIConfig["fallbacks"] {
  const all = getConfiguredProviders()
  if (all.length <= 1) return undefined
  return all.slice(1).map((p) => ({
    provider: p.provider,
    model: p.model,
    apiKey: p.apiKey ?? resolveApiKey(p.provider),
  }))
}

export function resolveAutoAIConfig(overrides?: Partial<AIConfig>): AIConfig {
  const configured = getConfiguredProviders()
  if (!configured.length) {
    return {
      provider: "groq" as AIProvider,
      model: "llama-3.3-70b-versatile",
      ...overrides,
    }
  }
  const primary = configured[0]!
  const fallbacks = configured.length > 1
    ? configured.slice(1).map((p) => ({
        provider: p.provider as AIProvider,
        model: p.model,
        apiKey: p.apiKey ?? resolveApiKey(p.provider),
      }))
    : undefined
  return {
    provider: primary.provider as AIProvider,
    model: primary.model,
    apiKey: primary.apiKey ?? resolveApiKey(primary.provider),
    fallbacks,
    ...overrides,
  }
}

export function requireAnyProvider(): void {
  if (getConfiguredProviders().length > 0) return
  console.error("")
  console.error("  ✗ [AEGIS_E001] No AI provider configured.")
  console.error("")
  console.error("  To get started, set at least one API key:")
  console.error("    • export ANTHROPIC_API_KEY=sk-...")
  console.error("    • export OPENAI_API_KEY=sk-...")
  console.error("    • export GROQ_API_KEY=gsk_...")
  console.error("")
  console.error("  Or run: aegis setup-keys")
  console.error("")
  process.exit(1)
}

export type AIProvider = AIProviderType

export interface AIConfig {
  provider: AIProvider
  model: string
  apiKey?: string
  baseUrl?: string
  temperature?: number
  maxOutputTokens?: number
  fallbacks?: Array<{
    provider: string
    model: string
    apiKey?: string
    baseUrl?: string
  }>
}

export interface AIMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface AIResponse {
  text: string
  usage?: {
    totalTokens: number
  }
}

export function resolveApiKey(provider: string): string | undefined {
  const override = vaultOverrides.get(provider)
  if (override) return override

  const envMap: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    groq: "GROQ_API_KEY",
    gemini: "GOOGLE_GENERATIVE_AI_API_KEY",
    mistral: "MISTRAL_API_KEY",
    azure: "AZURE_OPENAI_API_KEY",
    togetherai: "TOGETHERAI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    xai: "XAI_API_KEY",
    cohere: "COHERE_API_KEY",
    perplexity: "PERPLEXITY_API_KEY",
    nvidia: "NVIDIA_API_KEY",
  }
  return process.env[envMap[provider] || ""] || process.env.AEGIS_AI_API_KEY
}

export function parseFallbacksFromEnv(): AIConfig["fallbacks"] {
  const raw = process.env.AEGIS_AI_FALLBACKS
  if (!raw) return undefined
  return raw.split(",").map((entry) => {
    const [provider, ...rest] = entry.trim().split(":")
    const model = rest.join(":")
    if (!provider || !model) throw new Error(`Invalid fallback entry "${entry}". Expected format: provider:model`)
    return {
      provider,
      model,
      apiKey: resolveApiKey(provider),
    }
  })
}

export class AIProviderManager {
  private config: AIConfig

  constructor(config: AIConfig) {
    this.config = {
      ...config,
      fallbacks: config.fallbacks ?? parseFallbacksFromEnv(),
    }
  }

  getConfig(): AIConfig {
    return { ...this.config }
  }

  getModel(config?: AIConfig): LanguageModel {
    const cfg = config ?? this.config
    const factory = getProviderFactory(cfg.provider)
    if (!factory) throw new Error(`Unsupported provider: ${cfg.provider}`)
    return factory(cfg)
  }

  private *allConfigs(): Generator<AIConfig> {
    yield this.config
    if (this.config.fallbacks) {
      for (const fb of this.config.fallbacks) {
        yield {
          ...this.config,
          provider: fb.provider as AIProvider,
          model: fb.model,
          apiKey: fb.apiKey ?? resolveApiKey(fb.provider),
          baseUrl: fb.baseUrl ?? this.config.baseUrl,
        }
      }
    }
  }

  async generate(messages: AIMessage[]): Promise<AIResponse> {
    let lastErr: unknown
    for (const cfg of this.allConfigs()) {
      try {
        const model = this.getModel(cfg)
        const result = await generateText({
          model,
          messages,
          temperature: cfg.temperature ?? 0.7,
          maxOutputTokens: cfg.maxOutputTokens,
        })
        return {
          text: result.text,
          usage: result.usage ? { totalTokens: result.usage.totalTokens ?? 0 } : undefined,
        }
      } catch (err) {
        lastErr = err
        if (cfg !== this.config) {
          console.error(`[AI] Fallback ${cfg.provider}:${cfg.model} failed:`, (err as Error).message)
        }
      }
    }
    throw lastErr
  }

  async *stream(messages: AIMessage[]): AsyncGenerator<string, void, unknown> {
    let lastErr: unknown
    for (const cfg of this.allConfigs()) {
      try {
        const model = this.getModel(cfg)
        const result = await streamText({
          model,
          messages,
          temperature: cfg.temperature ?? 0.7,
          maxOutputTokens: cfg.maxOutputTokens,
        })
        for await (const chunk of result.textStream) {
          yield chunk
        }
        return
      } catch (err) {
        lastErr = err
        if (cfg !== this.config) {
          console.error(`[AI] Fallback ${cfg.provider}:${cfg.model} failed:`, (err as Error).message)
        }
      }
    }
    throw lastErr
  }
}

export function createAIProvider(config: AIConfig): AIProviderManager {
  return new AIProviderManager(config)
}
