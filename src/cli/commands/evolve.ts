import type { Command } from "commander"
import { evolutionEngine } from "../../evolve/engine"
import { theme } from "../theme"

export function registerEvolve(program: Command) {
  const evolve = program
    .command("evolve")
    .description("Self-evolving code — agents propose, verify, and apply source mutations")
    .hook("preAction", () => {
      evolutionEngine.getConfig()
    })

  evolve
    .command("run")
    .description("Run an evolution cycle — scan dreams and failures for mutation opportunities")
    .action(async () => {
      try {
        const report = await evolutionEngine.runCycle()
        console.log()
        console.log(`  ${theme.bold("🧬 Evolution Cycle Complete")}`)
        console.log(`  ${theme.muted("─".repeat(50))}`)
        console.log(`  ${theme.info("Mutations proposed:")}  ${report.mutationsProposed}`)
        console.log(`  ${theme.info("Mutations applied:")}   ${report.mutationsApplied}`)
        console.log(`  ${theme.info("Mutations failed:")}    ${report.mutationsFailed}`)
        console.log(`  ${theme.info("Dreams consumed:")}     ${report.insightsConsumed}`)
        console.log(`  ${theme.info("Duration:")}            ${report.durationMs}ms`)
        console.log()
      } catch (err) {
        console.error(`  ${theme.error("✖")} Evolution cycle failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })

  evolve
    .command("propose")
    .description("Propose a new code mutation manually")
    .requiredOption("-f, --file <path>", "Relative path to the source file")
    .requiredOption("-d, --description <text>", "Description of the change")
    .option("-s, --strategy <strategy>", "Mutation strategy", "refactor")
    .option("-c, --confidence <number>", "Confidence score (0-1)", "0.5")
    .option("--diff <text>", "Diff or change description")
    .action(async (opts) => {
      const { readFileSync, existsSync } = await import("node:fs")
      const { join } = await import("node:path")
      const filePath = join(process.cwd(), opts.file)

      if (!existsSync(filePath)) {
        console.error(`  ${theme.error("✖")} File not found: ${opts.file}`)
        process.exit(1)
      }

      const content = readFileSync(filePath, "utf-8")
      const confidence = Number.parseFloat(opts.confidence)

      const mutation = evolutionEngine.proposeMutation({
        filePath: opts.file,
        strategy: opts.strategy,
        description: opts.description,
        diff: opts.diff || opts.description,
        oldContent: content,
        newContent: content,
        confidence: Number.isNaN(confidence) ? 0.5 : confidence,
        sourceInsight: "manual",
      })

      console.log(`  ${theme.success("✓")} Proposed mutation ${theme.bold(mutation.id.slice(0, 12))}`)
      console.log(`  ${theme.muted(`File: ${opts.file}`)}`)
      console.log(`  ${theme.muted(`Strategy: ${opts.strategy}`)}`)
      console.log()
    })

  evolve
    .command("apply <id>")
    .description("Apply and verify a proposed mutation")
    .action(async (id: string) => {
      const result = await evolutionEngine.applyAndVerify(id)
      if (result === "passed") {
        console.log(`  ${theme.success("✓")} Mutation ${theme.bold(id.slice(0, 12))} applied successfully`)
      } else if (result === "rolled-back") {
        console.log(`  ${theme.warn("~")} Mutation ${theme.bold(id.slice(0, 12))} failed verification, rolled back`)
        if (result === "rolled-back") {
          const mutation = evolutionEngine.listMutations(1, "rolled-back").find((m) => m.id === id)
          if (mutation) {
            console.log(`  ${theme.muted(mutation.testResults.slice(0, 300))}`)
          }
        }
      } else {
        console.error(`  ${theme.error("✖")} Mutation ${theme.bold(id.slice(0, 12))} could not be applied`)
        process.exit(1)
      }
    })

  evolve
    .command("list")
    .description("List mutations")
    .option("-l, --limit <count>", "Number of mutations to show", "20")
    .option("-s, --status <status>", "Filter by status")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const limit = Number.parseInt(opts.limit, 10)
      const mutations = evolutionEngine.listMutations(limit, opts.status)

      if (opts.json) {
        console.log(JSON.stringify(mutations, null, 2))
        return
      }

      if (mutations.length === 0) {
        console.log(`  ${theme.muted("No mutations found.")}`)
        return
      }

      console.log()
      console.log(`  ${theme.bold("🧬 Mutations")}`)
      console.log(`  ${theme.muted("─".repeat(60))}`)
      for (const m of mutations) {
        const statusColors: Record<string, (s: string) => string> = {
          proposed: theme.warn,
          applying: theme.info,
          verifying: theme.info,
          passed: theme.success,
          failed: theme.error,
          "rolled-back": theme.muted,
          applied: theme.success,
        }
        const color = statusColors[m.status] || theme.text
        const statusIcon = m.status === "applied" ? "✓" : m.status === "failed" ? "✗" : m.status === "rolled-back" ? "↩" : "○"
        const confidence = (m.confidence * 100).toFixed(0)

        console.log(`  ${color(statusIcon)} ${theme.bold(m.id.slice(0, 12))} ${color(m.status)}`)
        console.log(`     ${theme.muted(m.filePath)}`)
        console.log(`     ${theme.muted(m.description.slice(0, 100))}`)
        console.log(`     ${theme.muted(`${m.strategy} · ${confidence}% confidence`)}`)
        console.log()
      }
    })

  evolve
    .command("rollback <id>")
    .description("Rollback an applied mutation")
    .action((id: string) => {
      const ok = evolutionEngine.rollbackMutation(id)
      if (ok) {
        console.log(`  ${theme.success("✓")} Mutation ${theme.bold(id.slice(0, 12))} rolled back`)
      } else {
        console.error(`  ${theme.error("✖")} Rollback failed for mutation ${theme.bold(id.slice(0, 12))}`)
        process.exit(1)
      }
    })

  evolve
    .command("stats")
    .description("Show evolution system statistics")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const stats = evolutionEngine.getStats()

      if (opts.json) {
        console.log(JSON.stringify(stats, null, 2))
        return
      }

      console.log()
      console.log(`  ${theme.bold("🧬 Evolution Statistics")}`)
      console.log(`  ${theme.muted("─".repeat(50))}`)
      console.log(`  ${theme.info("Total mutations:")}    ${stats.totalMutations}`)
      console.log(`  ${theme.info("Applied:")}             ${stats.appliedMutations}`)
      console.log(`  ${theme.info("Failed:")}              ${stats.failedMutations}`)
      console.log(`  ${theme.info("Rolled back:")}         ${stats.rolledBackMutations}`)
      console.log(`  ${theme.info("Avg confidence:")}      ${(stats.averageConfidence * 100).toFixed(1)}%`)
      console.log(`  ${theme.info("Test pass rate:")}      ${(stats.passRate * 100).toFixed(1)}%`)
      console.log()
      if (Object.keys(stats.mutationsByStrategy).length > 0) {
        console.log(`  ${theme.bold("By Strategy:")}`)
        for (const [strategy, count] of Object.entries(stats.mutationsByStrategy)) {
          console.log(`    ${theme.muted(strategy)}: ${count}`)
        }
        console.log()
      }
      if (stats.topFiles.length > 0) {
        console.log(`  ${theme.bold("Top Files:")}`)
        for (const f of stats.topFiles) {
          console.log(`    ${theme.muted(f.path)}: ${f.count}`)
        }
        console.log()
      }
    })

  evolve
    .command("config")
    .description("View or update evolution configuration")
    .option("--enable", "Enable evolution")
    .option("--disable", "Disable evolution")
    .option("--auto-propose", "Enable auto-propose")
    .option("--auto-apply", "Enable auto-apply for low-risk mutations")
    .option("--confidence <threshold>", "Confidence threshold (0-1)", Number)
    .action((opts) => {
      const config = evolutionEngine.getConfig()

      if (opts.enable) { config.enabled = true; evolutionEngine.updateConfig({ enabled: true }) }
      if (opts.disable) { config.enabled = false; evolutionEngine.updateConfig({ enabled: false }) }
      if (opts.autoPropose) { config.autoPropose = true; evolutionEngine.updateConfig({ autoPropose: true }) }
      if (opts.autoApply) { config.autoApplyLowRisk = true; evolutionEngine.updateConfig({ autoApplyLowRisk: true }) }
      if (opts.confidence) { evolutionEngine.updateConfig({ confidenceThreshold: opts.confidence }) }

      console.log()
      console.log(`  ${theme.bold("🧬 Evolution Configuration")}`)
      console.log(`  ${theme.muted("─".repeat(50))}`)
      console.log(`  ${theme.info("Enabled:")}               ${config.enabled ? theme.success("yes") : theme.error("no")}`)
      console.log(`  ${theme.info("Auto propose:")}          ${config.autoPropose ? theme.success("on") : theme.error("off")}`)
      console.log(`  ${theme.info("Auto apply low risk:")}   ${config.autoApplyLowRisk ? theme.success("on") : theme.error("off")}`)
      console.log(`  ${theme.info("Confidence threshold:")}  ${(config.confidenceThreshold * 100).toFixed(0)}%`)
      console.log(`  ${theme.info("Require test pass:")}     ${config.requireTestPass ? theme.success("yes") : theme.warn("no")}`)
      console.log(`  ${theme.info("Strategies:")}            ${config.strategies.join(", ")}`)
      console.log()
    })
}
