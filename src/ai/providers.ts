import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import type { LanguageModel } from "ai"
import type { AIConfig } from "./provider"

export type ProviderFactory = (config: AIConfig) => LanguageModel

const registry = new Map<string, ProviderFactory>()

export function registerProvider(name: string, factory: ProviderFactory) {
  registry.set(name, factory)
}

export function getProviderFactory(name: string): ProviderFactory | undefined {
  return registry.get(name)
}

export function listProviders(): string[] {
  return Array.from(registry.keys())
}

// Register default providers
registerProvider("openai", (config: AIConfig) => {
  const { apiKey, baseUrl } = config
  return createOpenAI({ apiKey, baseURL: baseUrl ?? undefined }).chat(config.model)
})

registerProvider("anthropic", (config: AIConfig) => {
  const { apiKey, baseUrl } = config
  return createAnthropic({ apiKey, baseURL: baseUrl ?? undefined })(config.model)
})

// Alias deepseek/ollama to OpenAI-backed handler by default (can be overridden)
registerProvider("deepseek", (config: AIConfig) => {
  const { apiKey, baseUrl } = config
  return createOpenAI({ apiKey, baseURL: baseUrl ?? "https://api.deepseek.com/v1" }).chat(config.model)
})

registerProvider("ollama", (config: AIConfig) => {
  const { apiKey, baseUrl } = config
  return createOpenAI({ apiKey, baseURL: baseUrl ?? "http://localhost:11434/v1" }).chat(config.model)
})

registerProvider("gemini", (config: AIConfig) => {
  const { apiKey, baseUrl } = config
  return createOpenAI({ apiKey, baseURL: baseUrl ?? "https://generativelanguage.googleapis.com/v1beta/openai" }).chat(config.model)
})

registerProvider("groq", (config: AIConfig) => {
  const { apiKey, baseUrl } = config
  return createOpenAI({ apiKey, baseURL: baseUrl ?? "https://api.groq.com/openai/v1" }).chat(config.model)
})

registerProvider("openrouter", (config: AIConfig) => {
  const { apiKey, baseUrl } = config
  return createOpenAI({ apiKey, baseURL: baseUrl ?? "https://openrouter.ai/api/v1" }).chat(config.model)
})

registerProvider("custom", (config: AIConfig) => {
  if (!config.baseUrl) throw new Error("baseUrl is required for custom provider")
  return createOpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl }).chat(config.model)
})
