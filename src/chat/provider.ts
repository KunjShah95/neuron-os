import type { ChatState } from "./store"
import { appendToStreamingMessage, finalizeStreamingMessage, setStreamingError } from "./store"
import { AIProviderManager, type AIConfig } from "../ai"
import { AgentEngine, createAgentRuntime } from "../agent"
import { loadConfig } from "../config"
import type { ModelMessage } from "ai"
import type { AIProviderType } from "../ai/models"

export interface ProviderConfig {
  apiKey?: string
  model?: string
  maxTokens?: number
  system?: string
}

function loadAIConfig(): AIConfig {
  const cfg = loadConfig()
  return {
    provider: (process.env.AI_PROVIDER || cfg.provider || "anthropic") as AIProviderType,
    model: process.env.AI_MODEL || cfg.model || "claude-sonnet-4-20250514",
    apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || cfg.apiKey,
    baseUrl: process.env.AI_BASE_URL || cfg.baseUrl,
    temperature: process.env.AI_TEMPERATURE ? Number(process.env.AI_TEMPERATURE) : cfg.temperature ?? 0.7,
    maxTokens: process.env.AI_MAX_TOKENS ? Number(process.env.AI_MAX_TOKENS) : cfg.maxTokens ?? 8192,
  }
}

export function createEngine(agentType?: string, overrideConfig?: Partial<AIConfig>): AgentEngine {
  const base = loadAIConfig()
  const config: AIConfig = {
    ...base,
    ...(overrideConfig || {}),
  }
  const ai = new AIProviderManager(config)
  const runtime = createAgentRuntime("chat", agentType)
  return new AgentEngine(runtime, ai, { maxSteps: 10 })
}

export async function streamResponse(
  state: ChatState,
  engine: AgentEngine | null,
  signal?: AbortSignal,
): Promise<void> {
  if (!engine) {
    setStreamingError(state, "No AI engine configured. Run `aegis setup` or set the API key environment variable for your provider.")
    return
  }

  const messages = buildModelMessages(state)

  try {
    await engine.streamChat(messages, {
      onChunk: (chunk) => {
        if (signal?.aborted) return
        appendToStreamingMessage(state, chunk)
      },
      onSignal: signal,
    })
    if (!signal?.aborted) {
      finalizeStreamingMessage(state)
    }
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      finalizeStreamingMessage(state)
      return
    }
    if (signal?.aborted) {
      finalizeStreamingMessage(state)
      return
    }
    const message = err instanceof Error ? err.message : "Unknown error"
    setStreamingError(state, message)
  }
}

function buildModelMessages(state: ChatState): ModelMessage[] {
  return state.messages
    .filter((m) => m.status === "complete" && m.content.trim())
    .map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    })) as ModelMessage[]
}
