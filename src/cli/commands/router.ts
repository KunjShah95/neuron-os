import type { Command } from "commander"
import { ModelRouter } from "../../economy/model-router"

export function registerRouter(program: Command): void {
  const router = program.command("router").description("Model routing — auto-select cheapest provider/model for tasks")

  router
    .command("route")
    .description("Route a task description to best provider/model")
    .argument("<task>", "Task description or agent type")
    .option("--type <type>", "Agent type (build, read, review, etc.)")
    .option("--budget <usd>", "Max budget", "1.0")
    .option("--tier <tier>", "Preferred tier (cheap, balanced, premium)")
    .option("--json", "JSON output")
    .action((task: string, opts: { type?: string; budget?: string; tier?: string; json?: boolean }) => {
      try {
        const result = ModelRouter.route({
          taskType: opts.type || task,
          budgetUsd: parseFloat(opts.budget ?? "1.0"),
          preferredTier: (opts.tier ?? undefined) as "cheap" | "balanced" | "premium" | undefined,
        })

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2))
        } else {
          console.log(`Provider:    ${result.provider}`)
          console.log(`Model:       ${result.model}`)
          console.log(`Tier:        ${result.tier}`)
          console.log(`Cost:        $${result.estimatedCost.toFixed(4)}`)
          console.log(`API key:     ${result.apiKey ? "configured" : "missing"}`)
          console.log(`Reasoning:   ${result.reasoning}`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`Route failed: ${msg}`)
        process.exit(1)
      }
    })

  router
    .command("list")
    .description("List available models with pricing")
    .option("--tier <tier>", "Filter by tier (cheap, balanced, premium)")
    .option("--provider <name>", "Filter by provider")
    .action((opts: { tier?: string; provider?: string }) => {
      const items = ModelRouter.listAvailable({
        tier: opts.tier as "cheap" | "balanced" | "premium" | undefined,
        provider: opts.provider,
      })

      if (items.length === 0) {
        console.log("No models found matching criteria.")
        return
      }

      console.log("Provider".padEnd(16), "Model".padEnd(22), "Tier".padEnd(10), "Cost (1k in + 500 out)")
      console.log("-".repeat(66))
      for (const item of items) {
        console.log(item.provider.padEnd(14), item.model.padEnd(20), item.tier.padEnd(8), `$${item.cost.toFixed(4)}`)
      }
    })

  router
    .command("suggest")
    .description("Suggest budget for an agent type based on historical defaults")
    .argument("<agent-type>", "Agent type name (build, read, review, etc.)")
    .action((agentType: string) => {
      const budget = ModelRouter.suggestBudget(agentType)
      try {
        const route = ModelRouter.route({ taskType: agentType })
        console.log(`Agent type:       ${agentType}`)
        console.log(`Suggested budget: $${budget.toFixed(2)}`)
        console.log(`Cheapest model:   ${route.provider}/${route.model}`)
        console.log(`Est. cost:        $${route.estimatedCost.toFixed(4)}`)
      } catch {
        console.log(`Agent type:       ${agentType}`)
        console.log(`Suggested budget: $${budget.toFixed(2)}`)
        console.log("(No viable route — increase budget or check pricing registry)")
      }
    })
}
