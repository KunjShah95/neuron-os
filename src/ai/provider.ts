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

export type AIProvider = AIProviderType

export interface AIConfig {
  provider: AIProvider
  model: string
  apiKey?: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
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
