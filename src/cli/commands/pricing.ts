import type { Command } from "commander"
import { loadPricing, savePricing, DEFAULT_PRICING } from "../../economy/pricing-registry"
import { estimateCost } from "../../economy/cost-router"
import { submitToLeaderboard, fetchLeaderboard } from "../../economy/leaderboard-client"

export function registerPricing(program: Command): void {
  const pricing = program.command("pricing").description("Tool-level economy and cost routing")

  pricing
    .command("list")
    .description("Show all tool and model pricing")
    .action(() => {
      const data = loadPricing()

      console.log("Tool pricing:")
      console.log(
        "  Name".padEnd(24),
        "api_usd".padEnd(12),
        "compute/s".padEnd(12),
        "io/mb".padEnd(12),
        "p50 ms".padEnd(8),
      )
      console.log("  " + "-".repeat(68))
      for (const [name, t] of Object.entries(data.tools)) {
        console.log(
          `  ${name.padEnd(22)} ${(t.api_usd?.toFixed(4) ?? "-").padEnd(10)} ${(t.compute_usd_per_second?.toFixed(6) ?? "-").padEnd(10)} ${(t.io_usd_per_mb?.toFixed(6) ?? "-").padEnd(10)} ${(t.latency_p50_ms?.toString() ?? "-").padEnd(6)}`,
        )
      }

      console.log("\nModel pricing:")
      console.log(
        "  Name".padEnd(24),
        "prompt/1k".padEnd(12),
        "completion/1k".padEnd(14),
        "quality".padEnd(10),
        "score".padEnd(8),
      )
      console.log("  " + "-".repeat(68))
      for (const [name, m] of Object.entries(data.models)) {
        console.log(
          `  ${name.padEnd(22)} $${m.prompt_usd_per_1k.toFixed(4).padEnd(6)} $${m.completion_usd_per_1k.toFixed(4).padEnd(8)} ${m.quality_tier.padEnd(8)} ${(m.benchmark_score?.toFixed(2) ?? "-").padEnd(6)}`,
        )
      }
    })

  pricing
    .command("set")
    .description("Set a pricing value: aegis pricing set <tool|model>.<field> <value>")
    .argument("<path>", "e.g. web_search.api_usd or claude-sonnet-4-6.prompt_usd_per_1k")
    .argument("<value>", "numeric value")
    .action((path: string, value: string) => {
      const parts = path.split(".")
      const numValue = parseFloat(value)
      if (parts.length !== 2 || isNaN(numValue)) {
        console.log("Usage: aegis pricing set <name>.<field> <value>")
        return
      }

      const data = loadPricing()
      const [name, field] = parts as [string, string]

      // Try tools first, then models
      if (data.tools[name] && field in data.tools[name]!) {
        ;(data.tools[name] as Record<string, unknown>)[field] = numValue
        savePricing(data)
        console.log(`Set tools.${name}.${field} = ${numValue}`)
      } else if (data.models[name] && field in data.models[name]!) {
        ;(data.models[name] as Record<string, unknown>)[field] = numValue
        savePricing(data)
        console.log(`Set models.${name}.${field} = ${numValue}`)
      } else {
        console.log(`Not found: ${name} with field ${field}`)
      }
    })

  pricing
    .command("estimate")
    .description("Estimate cost for a task: aegis pricing estimate --input 500 --output 200 --budget 0.05")
    .option("--input <tokens>", "Estimated input tokens", "1000")
    .option("--output <tokens>", "Estimated output tokens", "500")
    .option("--tools <names>", "Comma-separated tool names")
    .option("--calls <n>", "Number of tool calls", "0")
    .option("--complexity <level>", "simple|moderate|complex", "moderate")
    .option("--budget <usd>", "Budget constraint", "1.0")
    .action(
      (opts: {
        input?: string
        output?: string
        tools?: string
        calls?: string
        complexity?: string
        budget?: string
      }) => {
        const input = parseInt(opts.input ?? "1000", 10)
        const output = parseInt(opts.output ?? "500", 10)
        const toolNames = opts.tools ? opts.tools.split(",").map((s) => s.trim()) : []
        const toolCalls = parseInt(opts.calls ?? "0", 10)
        const budget = parseFloat(opts.budget ?? "1.0")

        const result = estimateCost(
          {
            inputTokens: input,
            outputTokens: output,
            tools: toolNames,
            toolCalls,
          },
          { budget },
        )

        console.log(`Cost estimate (${opts.complexity ?? "moderate"} complexity):`)
        console.log(`  Cheap:    $${result.cheap.toFixed(4)}`)
        console.log(`  Balanced: $${result.balanced.toFixed(4)}`)
        console.log(`  Premium:  $${result.premium.toFixed(4)}`)
        console.log()
        console.log(`  Budget: $${budget.toFixed(2)}`)
        console.log(`  ${result.reasoning}`)
      },
    )

  pricing
    .command("refresh")
    .description("Reset pricing to defaults")
    .action(() => {
      savePricing(DEFAULT_PRICING)
      console.log("Pricing reset to defaults.")
    })

  // leaderboard subcommands
  const bench = pricing.command("bench").description("Benchmark suite and leaderboard")

  bench
    .command("leaderboard")
    .description("Show quality/USD leaderboard")
    .option("--category <name>", "Filter by category")
    .option("--provider <name>", "Filter by provider")
    .action(async (opts: { category?: string; provider?: string }) => {
      const entries = await fetchLeaderboard({
        category: opts.category,
        provider: opts.provider,
      })
      if (entries.length === 0) {
        console.log("No leaderboard entries found.")
        console.log("Submit results with: aegis bench submit --run-id <id> --public")
        return
      }
      for (const entry of entries) {
        console.log(
          `  ${entry.provider ?? "?"}/${entry.model ?? "?"}: quality ${entry.quality_score ?? "?"}, cost $${entry.cost_usd ?? "?"}/task`,
        )
      }
    })

  bench
    .command("submit")
    .description("Submit benchmark results to public leaderboard")
    .option("--run-id <id>", "Run ID to submit")
    .option("--public", "Submit publicly (opt-in)")
    .action(async (opts: { runId?: string; public?: boolean }) => {
      if (!opts.runId) {
        console.log("Usage: aegis bench submit --run-id <id> [--public]")
        return
      }
      if (!opts.public) {
        console.log("Use --public flag to submit to the public leaderboard.")
        return
      }
      console.log("Submitting...")
      const result = await submitToLeaderboard({
        run_id: opts.runId,
        aegis_version: "0.2.0",
        model: "unknown",
        provider: "unknown",
        suite_version: "v1",
        category_scores: {},
        total_cost_usd: 0,
        total_tasks: 0,
        submitted_at: Date.now(),
      })
      if (result.success) {
        console.log("Submission successful!")
      } else {
        console.log(`Submission failed: ${result.error}`)
      }
    })
}
