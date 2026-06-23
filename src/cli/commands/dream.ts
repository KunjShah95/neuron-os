import type { Command } from "commander"
import { dreamEngine } from "../../dream/engine"
import { theme } from "../theme"

export function registerDream(program: Command) {
  const dream = program
    .command("dream")
    .description("Agent subconscious — dream processing and insight generation")
    .hook("preAction", () => {
      dreamEngine.markActivity()
    })

  dream
    .command("run")
    .description("Run a dream cycle immediately")
    .option("-t, --type <type>", "Dream type: memory-replay, pattern-discovery, knowledge-compression, counterfactual")
    .action(async () => {
      try {
        const report = await dreamEngine.runCycle()
        console.log()
        console.log(`  ${theme.bold("🌙 Dream Cycle Complete")}`)
        console.log(`  ${theme.muted("─".repeat(50))}`)
        console.log(`  ${theme.info("Dreams created:")}     ${report.dreamsCreated}`)
        console.log(`  ${theme.info("Insights generated:")}  ${report.insightsGenerated}`)
        console.log(`  ${theme.info("Duration:")}           ${report.durationMs}ms`)
        console.log()
        if (report.topInsights.length > 0) {
          console.log(`  ${theme.bold("Top Insights:")}`)
          for (const ins of report.topInsights) {
            const confidence = (ins.confidence * 100).toFixed(0)
            console.log(`    ${theme.warn("💡")} ${theme.heading(ins.title)}`)
            console.log(`       ${theme.muted(ins.description.slice(0, 120))}`)
            console.log(`       ${theme.muted(`confidence: ${confidence}% · source: ${ins.type}`)}`)
            console.log()
          }
        }
      } catch (err) {
        console.error(`  ${theme.error("✖")} Dream cycle failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })

  dream
    .command("list")
    .description("List recent dreams")
    .option("-l, --limit <count>", "Number of dreams to show", "10")
    .option("-t, --agent-type <type>", "Filter by agent type")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const limit = Number.parseInt(opts.limit, 10)
      const dreams = dreamEngine.listDreams(limit, opts.agentType)

      if (opts.json) {
        console.log(JSON.stringify(dreams, null, 2))
        return
      }

      if (dreams.length === 0) {
        console.log(`  ${theme.muted("No dreams recorded yet.")}`)
        return
      }

      console.log()
      console.log(`  ${theme.bold("🌙 Recent Dreams")}`)
      console.log(`  ${theme.muted("─".repeat(60))}`)
      for (const d of dreams) {
        const vivid = d.vividness === "vivid" ? theme.warn("✦") : d.vividness === "moderate" ? theme.info("◈") : theme.dim("◇")
        const statusIcon = d.status === "completed" ? theme.success("✓") : d.status === "processing" ? theme.warn("⋯") : d.status === "failed" ? theme.error("✗") : theme.dim("○")
        const duration = d.durationMs > 0 ? `${d.durationMs}ms` : "—"
        const agentLabel = d.agentId ? `${d.agentType}:${d.agentId}` : d.agentType

        console.log(`  ${statusIcon} ${vivid} ${theme.bold(d.type)} ${theme.muted(`(${agentLabel})`)}`)
        console.log(`     ${theme.muted(d.summary || "No summary")}`)
        console.log(`     ${theme.muted(`${d.startedAt} · ${duration} · ${d.insightIds.length} insights`)}`)
        console.log()
      }
    })

  dream
    .command("insights")
    .description("List generated insights")
    .option("-l, --limit <count>", "Number of insights to show", "30")
    .option("--actionable", "Show only actionable insights")
    .option("--apply <id>", "Mark an insight as applied")
    .option("--json", "Output as JSON")
    .action((opts) => {
      if (opts.apply) {
        dreamEngine.markInsightApplied(opts.apply)
        console.log(`  ${theme.success("✓")} Insight ${theme.bold(opts.apply)} marked as applied`)
        return
      }

      const limit = Number.parseInt(opts.limit, 10)
      const insights = dreamEngine.getInsights(limit, !!opts.actionable)

      if (opts.json) {
        console.log(JSON.stringify(insights, null, 2))
        return
      }

      if (insights.length === 0) {
        console.log(`  ${theme.muted("No insights found.")}`)
        return
      }

      console.log()
      console.log(`  ${theme.bold("💡 Dream Insights")}`)
      console.log(`  ${theme.muted("─".repeat(60))}`)
      for (const ins of insights) {
        const typeLabels: Record<string, string> = { pattern: "●", counterfactual: "◆", correlation: "◈", compression: "■", synthesis: "▲" }
        const marker = typeLabels[ins.type] || "●"
        const applied = ins.applied ? theme.success(" [applied]") : ins.actionable ? theme.warn(" [actionable]") : ""
        console.log(`  ${marker} ${theme.bold(ins.title)}`)
        console.log(`     ${theme.muted(ins.description.slice(0, 120))}`)
        console.log(`     ${theme.muted(`${(ins.confidence * 100).toFixed(0)}% confidence · ${ins.sourceCount} sources · ${ins.id}${applied}`)}`)
        console.log()
      }
    })

  dream
    .command("config")
    .description("View or update dream configuration")
    .option("--enable", "Enable dreaming")
    .option("--disable", "Disable dreaming")
    .option("--min-idle <minutes>", "Minimum idle minutes before dreaming", Number)
    .option("--max-duration <ms>", "Maximum dream duration in ms", Number)
    .action((opts) => {
      const config = dreamEngine.getConfig()

      if (opts.enable) { config.enabled = true; dreamEngine.updateConfig({ enabled: true }) }
      if (opts.disable) { config.enabled = false; dreamEngine.updateConfig({ enabled: false }) }
      if (opts.minIdle) { config.minIdleMinutes = opts.minIdle; dreamEngine.updateConfig({ minIdleMinutes: opts.minIdle }) }
      if (opts.maxDuration) { config.maxDreamDurationMs = opts.maxDuration; dreamEngine.updateConfig({ maxDreamDurationMs: opts.maxDuration }) }

      console.log()
      console.log(`  ${theme.bold("🌙 Dream Configuration")}`)
      console.log(`  ${theme.muted("─".repeat(50))}`)
      console.log(`  ${theme.info("Enabled:")}           ${config.enabled ? theme.success("yes") : theme.error("no")}`)
      console.log(`  ${theme.info("Min idle minutes:")}   ${config.minIdleMinutes}`)
      console.log(`  ${theme.info("Max duration:")}       ${config.maxDreamDurationMs}ms`)
      console.log(`  ${theme.info("Memory replay:")}      ${config.memoryReplay.enabled ? theme.success("on") : theme.error("off")} (sample: ${config.memoryReplay.sampleSize}, min sim: ${config.memoryReplay.minSimilarity})`)
      console.log(`  ${theme.info("Pattern discovery:")}  ${config.patternDiscovery.enabled ? theme.success("on") : theme.error("off")} (min cluster: ${config.patternDiscovery.minClusterSize}, lookback: ${config.patternDiscovery.lookbackHours}h)`)
      console.log(`  ${theme.info("Knowledge compress:")} ${config.knowledgeCompression.enabled ? theme.success("on") : theme.error("off")} (max entries: ${config.knowledgeCompression.maxEntries})`)
      console.log(`  ${theme.info("Counterfactual:")}     ${config.counterfactual.enabled ? theme.success("on") : theme.error("off")} (max alts: ${config.counterfactual.maxAlternatives})`)
      console.log()
    })

  dream
    .command("share")
    .description("Run cross-agent dream sharing — consolidates insights across agent types")
    .option("-t, --agent-type <types...>", "Agent type(s) to share dreams between (e.g., 'build plan test'). Omitting shares across all agents + includes fleet mood consolidation.")
    .action(async (opts) => {
      try {
        const agentTypes = opts.agentType as string[] | undefined
        const report = await dreamEngine.runShareCycle(agentTypes)

        console.log()
        console.log(`  ${theme.bold("🔄 Cross-Agent Dream Sharing")}`)
        console.log(`  ${theme.muted("─".repeat(60))}`)

        if (agentTypes && agentTypes.length > 0) {
          console.log(`  ${theme.info("Shared between:")}    ${agentTypes.join(", ")}`)
        } else {
          console.log(`  ${theme.info("Scope:")}             All agent types`)
        }

        console.log(`  ${theme.info("Dreams created:")}     ${report.dreamsCreated}`)
        console.log(`  ${theme.info("Insights generated:")}  ${report.insightsGenerated}`)
        console.log(`  ${theme.info("Duration:")}           ${report.durationMs}ms`)
        console.log()

        if (report.topInsights.length > 0) {
          console.log(`  ${theme.bold("💡 Shared Insights")}`)
          for (const ins of report.topInsights) {
            const confidence = (ins.confidence * 100).toFixed(0)
            console.log(`    ${theme.warn("🔗")} ${theme.heading(ins.title)}`)
            console.log(`       ${theme.muted(ins.description.slice(0, 140))}`)
            console.log(`       ${theme.muted(`confidence: ${confidence}% · source: ${ins.type} · id: ${ins.id}`)}`)
            console.log()
          }
        } else {
          console.log(`  ${theme.muted("No shared insights generated. Not enough dream data yet.")}`)
          console.log(`  ${theme.muted("Run agents first to generate experiences and dreams.")}`)
          console.log()
        }
      } catch (err) {
        console.error(`  ${theme.error("✖")} Dream share cycle failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })

  dream
    .command("stats")
    .description("Show dream system statistics")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const stats = dreamEngine.getStats()

      if (opts.json) {
        console.log(JSON.stringify(stats, null, 2))
        return
      }

      console.log()
      console.log(`  ${theme.bold("🌙 Dream Statistics")}`)
      console.log(`  ${theme.muted("─".repeat(50))}`)
      console.log(`  ${theme.info("Total dreams:")}       ${stats.totalDreams}`)
      console.log(`  ${theme.info("Completed dreams:")}   ${stats.completedDreams}`)
      console.log(`  ${theme.info("Total insights:")}     ${stats.totalInsights}`)
      console.log(`  ${theme.info("Actionable:")}         ${stats.actionableInsights}`)
      console.log(`  ${theme.info("Applied:")}            ${stats.appliedInsights}`)
      console.log()
      if (Object.keys(stats.dreamsByType).length > 0) {
        console.log(`  ${theme.bold("By Type:")}`)
        for (const [type, count] of Object.entries(stats.dreamsByType)) {
          console.log(`    ${theme.muted(type)}: ${count}`)
        }
        console.log()
      }
    })
}
