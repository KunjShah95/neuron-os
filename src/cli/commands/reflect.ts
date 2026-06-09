/**
 * reflect — Reflect on an agent session's progress using AI.
 *
 * Wraps the ReflectionLoop class as a CLI command. Pulls the last N steps
 * from the audit log for a session and evaluates progress, suggesting
 * continue/abandon/pivot decisions.
 */

import type { Command } from "commander"
import { AIProviderManager, resolveApiKey } from "../../ai"
import { getDefaultModel } from "../../ai/models"
import { ReflectionLoop } from "../../agent/reflection"
import { theme } from "../theme"
import { showBanner } from "../banner"

export function registerReflect(program: Command) {
  program
    .command("reflect <session-id>")
    .description("Reflect on an agent session — score progress and suggest next steps")
    .option("-g, --goal <goal>", "The original goal for context")
    .option("-p, --provider <provider>", "AI provider (openai, anthropic, etc.)")
    .option("-m, --model <model>", "AI model name")
    .option("--json", "Output as JSON")
    .action(async (sessionId: string, opts: { goal?: string; provider?: string; model?: string; json?: boolean }) => {
      showBanner()

      const provider = opts.provider || process.env.AEGIS_AI_PROVIDER || "openai"
      const model = opts.model || process.env.AEGIS_AI_MODEL || getDefaultModel(provider as any)
      const goal = opts.goal || "(no goal specified)"

      console.log(`  ${theme.heading("🔍 Reflection")}`)
      console.log(`  ${theme.muted(`Session:   `)} ${sessionId}`)
      console.log(`  ${theme.muted(`Provider:  `)} ${provider}/${model}`)
      console.log()

      try {
        const ai = new AIProviderManager({
          provider: provider as any,
          model,
          apiKey: resolveApiKey(provider) || process.env.AEGIS_AI_API_KEY,
          baseUrl: process.env.AEGIS_AI_BASE_URL,
          temperature: 0.2,
        })

        const reflection = new ReflectionLoop(ai.getModel())

        console.log(`  ${theme.info("Evaluating session progress...")}`)
        console.log()

        const result = await reflection.evaluateProgress(sessionId, goal)

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2))
          return
        }

        // Print human-readable output
        const decisionEmoji = result.decision === "continue" ? "🟢" : result.decision === "pivot" ? "🔄" : "🔴"
        console.log(`  ${theme.bold("Reflection Result")}`)
        console.log(`  ${theme.muted("Score:    ")} ${renderScore(result.score)}`)
        console.log(`  ${theme.muted("Decision:")} ${decisionEmoji} ${result.decision}`)
        console.log()
        console.log(`  ${theme.muted("Summary:")}`)
        console.log(`  ${result.summary}`)
        if (result.suggestedPivot) {
          console.log()
          console.log(`  ${theme.muted("Suggested pivot:")}`)
          console.log(`  ${result.suggestedPivot}`)
        }
        console.log()
      } catch (err: unknown) {
        console.log(`  ${theme.error(`❌ Reflection failed: ${err instanceof Error ? err.message : String(err)}`)}`)
        process.exit(1)
      }
    })
}

function renderScore(score: number): string {
  if (score >= 8) return `🟢 ${score}/10 — Excellent progress`
  if (score >= 6) return `🟡 ${score}/10 — Adequate progress`
  if (score >= 4) return `🟠 ${score}/10 — Needs improvement`
  return `🔴 ${score}/10 — Poor progress`
}
