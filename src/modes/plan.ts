/**
 * plan — planning mode orchestrator.
 *
 * Generates step-by-step implementation plans without making any changes.
 * Uses read-only tools to explore the codebase before producing a plan.
 */

import { createAgentRuntime } from "../agent/runtime"
import { AIProviderManager, type AIConfig, resolveAutoAIConfig } from "../ai"
import { AgentEngine } from "../agent/engine"
import type { AIProviderType } from "../ai/models"

function buildAIConfig(): AIConfig {
  const explicitProvider = process.env.AEGIS_AI_PROVIDER
  const explicitModel = process.env.AEGIS_AI_MODEL
  if (explicitProvider) {
    return resolveAutoAIConfig({
      provider: explicitProvider as AIProviderType,
      model: explicitModel ?? undefined,
      baseUrl: process.env.AEGIS_AI_BASE_URL,
      temperature: 0.5,
    })
  }
  return resolveAutoAIConfig({ temperature: 0.5 })
}

/**
 * Generate a step-by-step implementation plan for a given goal.
 * Explores the codebase first, then produces a structured plan.
 * Returns the plan as a formatted markdown string.
 *
 * @param goal - The goal to plan for
 * @param sessionDb - If true, persist to SQLite session store (default: false)
 */
export async function runPlanOrchestrator(goal: string, sessionDb?: boolean, project?: string): Promise<string> {
  const runtime = createAgentRuntime("plan-mode", "plan", process.cwd())
  const ai = new AIProviderManager(buildAIConfig())
  const engine = new AgentEngine(runtime, ai, {
    maxSteps: 12,
    ...(sessionDb
      ? {
          sessionId: `plan-${Date.now().toString(36)}`,
          sessionName: `plan-${goal.slice(0, 40)}`,
          goal,
          project,
        }
      : {}),
  })

  try {
    const result = await engine.chat([
      {
        role: "user",
        content: `You are a senior software architect. Create a detailed, step-by-step implementation plan for the following goal. First, explore the codebase to understand the existing structure and patterns. Then produce a plan that includes:

1. **Summary** — Brief overview of what needs to be done
2. **Files to modify** — List of files that need changes, with specific sections
3. **Files to create** — Any new files needed
4. **Implementation steps** — Ordered steps with specific code changes
5. **Testing strategy** — How to verify each step works

Be specific and actionable. Reference existing patterns and conventions in the codebase.

Goal: ${goal}`,
      },
    ])
    if (sessionDb) await engine.completeSession("completed")
    return result.text
  } catch (err) {
    if (sessionDb) await engine.completeSession("failed")
    throw err
  }
}
