/**
 * plan — planning mode orchestrator.
 *
 * Generates step-by-step implementation plans without making any changes.
 * Uses read-only tools to explore the codebase before producing a plan.
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
    temperature: 0.5,
  }
}

/**
 * Generate a step-by-step implementation plan for a given goal.
 * Explores the codebase first, then produces a structured plan.
 * Returns the plan as a formatted markdown string.
 */
export async function runPlanOrchestrator(goal: string): Promise<string> {
  const runtime = createAgentRuntime("plan-mode", "plan", process.cwd())
  const ai = new AIProviderManager(buildAIConfig())
  const engine = new AgentEngine(runtime, ai, { maxSteps: 12 })

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

  return result.text
}
