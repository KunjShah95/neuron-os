import { generateText, streamText } from "ai"
import type { LanguageModel } from "ai"
import type { AIProviderType } from "./models"
import { getProviderFactory } from "./providers"

export type AIProvider = AIProviderType

export interface AIConfig {
  provider: AIProvider
  model: string
  apiKey?: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
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

export class AIProviderManager {
  private config: AIConfig

  constructor(config: AIConfig) {
    this.config = config
  }

  getConfig(): AIConfig {
    return { ...this.config }
  }

  getModel(): LanguageModel {
    const { provider } = this.config
    const factory = getProviderFactory(provider)
    if (!factory) throw new Error(`Unsupported provider: ${provider}`)
    return factory(this.config)
  }

  async generate(messages: AIMessage[]): Promise<AIResponse> {
    const model = this.getModel()

    const result = await generateText({
      model,
      messages,
      temperature: this.config.temperature ?? 0.7,
    })

    return {
      text: result.text,
      usage: result.usage
        ? {
            totalTokens: result.usage.totalTokens ?? 0,
          }
        : undefined,
    }
  }

  async *stream(messages: AIMessage[]): AsyncGenerator<string, void, unknown> {
    const model = this.getModel()

    const result = await streamText({
      model,
      messages,
      temperature: this.config.temperature ?? 0.7,
    })

    for await (const chunk of result.textStream) {
      yield chunk
    }
  }
}

export function createAIProvider(config: AIConfig): AIProviderManager {
  return new AIProviderManager(config)
}
