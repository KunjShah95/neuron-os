/**
 * Shared mock AI utilities for integration tests.
 *
 * Provides mock LanguageModel and AIProviderManager implementations
 * that return predefined text without requiring real API keys.
 *
 * Replaces duplicated code in test-lifecycle-integration.ts and
 * test-chat-integration.ts.
 */

import { AIProviderManager } from "../ai"
import type { AIConfig } from "../ai"
import { AgentRuntime } from "../agent/runtime"
import { AgentEngine, type AgentEngineConfig } from "../agent/engine"
import { MemorySystem } from "../memory/system"
import type { LanguageModel } from "ai"
import { mkdirSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Create a mock LanguageModel that returns predefined text.
 *
 * Works with Vercel AI SDK v6 (specificationVersion "v2").
 * Supports both doGenerate (chat) and doStream (streamChat) with
 * realistic chunk splitting for streaming tests.
 */
export function createMockModel(responseText: string): LanguageModel {
  // Split on word boundaries for realistic streaming
  const chunks = responseText.split(/(?<=\s)/).filter(Boolean)

  return {
    specificationVersion: "v2",
    provider: "mock",
    modelId: "mock-model",

    async doGenerate(_options: Record<string, unknown>) {
      return {
        content: [{ type: "text" as const, text: responseText }],
        finishReason: "stop" as const,
        usage: { promptTokens: 10, completionTokens: responseText.length },
        rawCall: { rawPrompt: null, rawSettings: null },
      }
    },

    async doStream(_options: Record<string, unknown>) {
      const stream = new ReadableStream({
        async start(controller: any) {
          for (const chunk of chunks) {
            controller.enqueue({ type: "text-delta" as const, delta: chunk })
          }
          controller.enqueue({
            type: "finish" as const,
            finishReason: "stop" as const,
            usage: { promptTokens: 10, completionTokens: responseText.length },
          })
          controller.close()
        },
      })

      return {
        stream,
        rawCall: { rawPrompt: null, rawSettings: null },
      }
    },
  } as unknown as LanguageModel
}

/**
 * Create a mock AIProviderManager that returns a mock model.
 *
 * Overrides getModel() via Object.defineProperty to return a
 * predefined mock model. Allows AgentEngine.chat() and streamChat()
 * to run without real API keys.
 */
export function createMockAI(responseText: string): AIProviderManager {
  const mockModel = createMockModel(responseText)

  const ai = new AIProviderManager({
    provider: "mock",
    model: "mock-model",
  } as unknown as AIConfig)

  Object.defineProperty(ai, "getModel", {
    value: () => mockModel,
    writable: false,
  })

  return ai
}

// Re-export types for use in test files
export { AIProviderManager, type AIConfig }

/**
 * Create a ready-to-use AgentEngine with a mock AI and a MemorySystem
 * pointed at a temp directory.
 *
 * @param tmpRoot - The root directory for temp files
 * @param subdir - A unique subdirectory name for this test
 * @param aiResponse - The predefined text the mock AI should return
 * @param engineConfig - Optional AgentEngine config (e.g., maxSteps)
 */
export async function createTestEngine(
  tmpRoot: string,
  subdir: string,
  aiResponse: string,
  engineConfig?: AgentEngineConfig,
): Promise<{ engine: AgentEngine; runtime: AgentRuntime; memory: MemorySystem; dir: string }> {
  const dir = resolve(tmpRoot, subdir)
  mkdirSync(dir, { recursive: true })

  const memory = new MemorySystem(dir)
  await memory.initialize()

  const runtime = new AgentRuntime({ agentId: "engine-test", agentType: "build", cwd: dir }, memory)

  const ai = createMockAI(aiResponse)
  const engine = new AgentEngine(runtime, ai, engineConfig)

  return { engine, runtime, memory, dir }
}
