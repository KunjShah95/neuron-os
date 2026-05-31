/**
 * ask — read-only research mode orchestrator.
 *
 * Answers questions about the codebase by invoking the AI agent
 * with read-only tools (no file modifications allowed).
 */

import { createAgentRuntime } from "../agent/runtime"
import { AIProviderManager, type AIConfig } from "../ai"
import { AgentEngine } from "../agent/engine"

function buildAIConfig(): AIConfig {
  return {
    provider: (process.env.AEGIS_AI_PROVIDER as any) ?? "openai",
    model: process.env.AEGIS_AI_MODEL ?? "gpt-4o",
    apiKey: process.env.AEGIS_AI_API_KEY,
    baseUrl: process.env.AEGIS_AI_BASE_URL,
    temperature: 0.3,
  }
}

/**
 * Ask a question about the codebase (read-only).
 * Returns the AI's text response.
 */
export async function runAskOrchestrator(question: string): Promise<string> {
  const runtime = createAgentRuntime("ask-mode", "read", process.cwd())
  const ai = new AIProviderManager(buildAIConfig())
  const engine = new AgentEngine(runtime, ai, { maxSteps: 8 })

  const result = await engine.chat([
    {
      role: "user",
      content: `You are a codebase research assistant. Answer the following question by exploring the codebase using the available tools. Be thorough and cite specific files and line numbers where relevant.\n\nQuestion: ${question}`,
    },
  ])

  return result.text
}
