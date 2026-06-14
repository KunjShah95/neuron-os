/**
 * ask — read-only research mode orchestrator.
 *
 * Answers questions about the codebase by invoking the AI agent
 * with read-only tools (no file modifications allowed).
 */

import { createAgentRuntime } from "../agent/runtime"
import { AIProviderManager, type AIConfig, resolveAutoAIConfig } from "../ai"
import { AgentEngine } from "../agent/engine"
import { getDefaultModel } from "../ai/models"
import type { AIProviderType } from "../ai/models"

function buildAIConfig(): AIConfig {
  const explicitProvider = process.env.AEGIS_AI_PROVIDER || process.env.AEGIS_DEFAULT_PROVIDER
  if (explicitProvider) {
    return resolveAutoAIConfig({
      provider: explicitProvider as AIProviderType,
      model: process.env.AEGIS_AI_MODEL || process.env.AEGIS_DEFAULT_MODEL || getDefaultModel(explicitProvider as AIProviderType),
      baseUrl: process.env.AEGIS_AI_BASE_URL,
      temperature: 0.3,
    })
  }
  return resolveAutoAIConfig({ temperature: 0.3 })
}

/**
 * Ask a question about the codebase (read-only).
 * Returns the AI's text response.
 *
 * @param question - The question to research
 * @param sessionDb - If true, persist to SQLite session store (default: false)
 */
export async function runAskOrchestrator(question: string, sessionDb?: boolean, project?: string): Promise<string> {
  const runtime = createAgentRuntime("ask-mode", "read", process.cwd())
  const ai = new AIProviderManager(buildAIConfig())
  const engine = new AgentEngine(runtime, ai, {
    maxSteps: 8,
    ...(sessionDb
      ? {
          sessionId: `ask-${Date.now().toString(36)}`,
          sessionName: `ask-${question.slice(0, 40)}`,
          goal: question,
          project,
        }
      : {}),
  })

  try {
    const result = await engine.chat([
      {
        role: "user",
        content: `You are a codebase research assistant. Answer the following question by exploring the codebase using the available tools. Be thorough and cite specific files and line numbers where relevant.\n\nQuestion: ${question}`,
      },
    ])
    if (sessionDb) await engine.completeSession("completed")
    return result.text
  } catch (err) {
    if (sessionDb) await engine.completeSession("failed")
    throw err
  }
}
