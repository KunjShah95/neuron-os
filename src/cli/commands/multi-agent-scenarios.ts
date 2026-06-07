/**
 * src/cli/commands/multi-agent-scenarios.ts
 *
 * aegis eval multi-agent — List and run multi-agent coordination scenarios.
 *   - list      Show available coordination patterns and scenarios
 *   - run       Run a multi-agent scenario
 *   - metrics   Show metrics from a past multi-agent run
 */

import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"

export function registerMultiAgent(program: Command) {
  const evalCmd =
    program.commands.find((c) => c.name() === "eval") ??
    program.command("eval").description("Agent evaluation pipeline")

  const ma = evalCmd
    .command("multi-agent")
    .description("Multi-agent orchestration evaluation — coordination patterns, metrics, and scenarios")

  ma.command("list")
    .description("List available multi-agent scenarios and coordination patterns")
    .option("--pattern <pattern>", "Filter by pattern (sequential, parallel, debate, hierarchical, voting, refine)")
    .action(handleMultiAgentList)

  ma.command("run <scenarioName>")
    .description("Run a multi-agent scenario with sample data")
    .option("--prompt <text>", "Custom prompt for the scenario")
    .option("--dry-run", "Show what would be run without executing")
    .action(handleMultiAgentRun)

  ma.command("metrics")
    .description("Show coordination metrics from a past multi-agent run")
    .option("--test-id <id>", "Test ID to show metrics for")
    .action(handleMultiAgentMetrics)
}

// ── Handlers ──────────────────────────────────────────────────────

async function handleMultiAgentList(opts: { pattern?: string }) {
  showBanner()
  const { MULTI_AGENT_SCENARIOS } = await import("../../harness/multi-agent")

  const scenarios = opts.pattern
    ? MULTI_AGENT_SCENARIOS.filter((s) => s.pattern === opts.pattern)
    : MULTI_AGENT_SCENARIOS

  if (scenarios.length === 0) {
    console.log(theme.warn(`\n  No scenarios found${opts.pattern ? ` for pattern "${opts.pattern}"` : ""}.\n`))
    return
  }

  // Group by pattern
  const byPattern = new Map<string, typeof scenarios>()
  for (const s of scenarios) {
    const list = byPattern.get(s.pattern) ?? []
    list.push(s)
    byPattern.set(s.pattern, list)
  }

  console.log(theme.heading(`\n  🤖 Multi-Agent Scenarios\n`))

  for (const [pattern, patternScenarios] of byPattern) {
    console.log(`  ${theme.bold(pattern.toUpperCase())} — ${patternScenarios.length} scenario(s)\n`)

    for (const s of patternScenarios) {
      console.log(`    ${theme.accent(s.name)}`)
      console.log(`      ${theme.dim(s.description)}`)
      console.log(`      Roles: ${theme.text(s.roles.join(", "))}`)
      console.log()
    }
  }

  console.log(`  ${theme.dim("Run: aegis eval multi-agent run <scenarioName>")}`)
  console.log()
}

async function handleMultiAgentRun(
  scenarioName: string,
  opts: {
    prompt?: string
    dryRun?: boolean
  },
) {
  showBanner()
  const { MULTI_AGENT_SCENARIOS, createMultiAgentTest } = await import("../../harness/multi-agent")

  const match = MULTI_AGENT_SCENARIOS.find((s) => s.name.toLowerCase().includes(scenarioName.toLowerCase()))

  if (!match) {
    console.log(theme.error(`\n  Scenario not found: "${scenarioName}"\n`))
    console.log(`  Available: ${MULTI_AGENT_SCENARIOS.map((s) => s.name).join(", ")}`)
    console.log()
    return
  }

  const prompt = opts.prompt ?? `Execute a ${match.pattern} multi-agent workflow for: ${match.description}`

  const test = createMultiAgentTest(match, prompt)

  if (opts.dryRun) {
    console.log(theme.heading(`\n  🔍 Dry Run: ${match.name}\n`))
    console.log(`  Pattern:  ${theme.bold(match.pattern)}`)
    console.log(`  Roles:    ${match.roles.join(", ")}`)
    console.log(`  Prompt:   ${theme.dim(prompt.slice(0, 100))}`)
    console.log()
    console.log(`  ${theme.bold("Test config:")}`)
    console.log(`  ID:       ${test.id}`)
    console.log(`  Timeout:  ${test.timeout}ms`)
    console.log(`  Protocol: ${test.handoff.protocol}`)
    console.log(`  Max rounds: ${test.handoff.maxRounds ?? "N/A"}`)
    if (test.consensus) {
      console.log(`  Consensus: required=${test.consensus.required}, threshold=${test.consensus.threshold}`)
    }
    console.log(`  Metrics tracked: ${(test.trackMetrics ?? []).join(", ")}`)
    console.log()
    return
  }

  console.log(theme.heading(`\n  ▶ Running: ${match.name}\n`))
  console.log(`  Pattern:  ${theme.bold(match.pattern)}`)
  console.log(`  Roles:    ${match.roles.join(", ")}`)
  console.log(`  Protocol: ${test.handoff.protocol}`)
  console.log(`  ${theme.dim("Starting multi-agent evaluation...")}`)
  console.log()

  try {
    const { MultiAgentMetricCollector } = await import("../../harness/multi-agent-collector")
    const collector = new MultiAgentMetricCollector()

    // Simulate single-agent traces for now (real execution requires agent orchestration)
    const startTime = Date.now()
    const simulatedTraces = match.roles.map((role, i) => ({
      role,
      traces: [
        {
          name: "think",
          params: { thought: `Analyzing task from ${role} perspective` },
          result: `Output from ${role}`,
          durationMs: 1000 + i * 200,
        },
        {
          name: i < match.roles.length - 1 ? "write" : "complete",
          params: { content: `${role} output` },
          result: `${role} completed`,
          durationMs: 500,
        },
      ],
      output: `[${role.toUpperCase()}]: Completed task for ${match.name}`,
    }))

    const durationMs = Date.now() - startTime
    const metrics = collector.buildReport(test, simulatedTraces, durationMs, 0.05, [])

    console.log(theme.success(`  ✓ Multi-agent run complete\n`))
    console.log(`  ${theme.bold("Coordination Metrics")}`)
    console.log(`  Pattern:            ${metrics.pattern}`)
    console.log(`  Agents:             ${metrics.agentCount}`)
    console.log(`  Handoffs:           ${metrics.coordinationMetrics.totalHandoffs}`)
    console.log(`  Handoff accuracy:   ${(metrics.coordinationMetrics.handoffAccuracy * 100).toFixed(0)}%`)
    console.log(`  Context loss:       ${(metrics.coordinationMetrics.contextLossScore * 100).toFixed(0)}%`)
    console.log(`  Agent utilization:  ${(metrics.coordinationMetrics.agentUtilization * 100).toFixed(0)}%`)
    console.log(`  Contribution balance (Gini): ${metrics.coordinationMetrics.contributionBalance.toFixed(2)}`)
    console.log(`  Duration:           ${(metrics.totalDurationMs / 1000).toFixed(1)}s`)
    console.log()

    if (metrics.perAgentMetrics.length > 0) {
      console.log(`  ${theme.bold("Per-Agent Metrics")}`)
      for (const am of metrics.perAgentMetrics) {
        console.log(
          `  ${theme.accent(am.role.padEnd(16))} ${am.calls} calls  ${am.durationMs.toFixed(0)}ms avg  contribution: ${(am.contribution * 100).toFixed(0)}%`,
        )
      }
      console.log()
    }

    if (metrics.coordinationMetrics.outputCoherence !== null) {
      console.log(`  Output coherence:   ${(metrics.coordinationMetrics.outputCoherence * 100).toFixed(0)}%`)
    }
    if (metrics.coordinationMetrics.decompositionQuality !== null) {
      console.log(`  Decomposition qual: ${(metrics.coordinationMetrics.decompositionQuality * 100).toFixed(0)}%`)
    }
    if (metrics.coordinationMetrics.parallelSpeedup !== null) {
      console.log(`  Parallel speedup:   ${metrics.coordinationMetrics.parallelSpeedup.toFixed(1)}x`)
    }
    console.log()
  } catch (err) {
    console.error(theme.error(`\n  Multi-agent run failed: ${err}\n`))
  }
}

async function handleMultiAgentMetrics(opts: { testId?: string }) {
  showBanner()

  console.log(theme.heading(`\n  📊 Coordination Metrics\n`))
  console.log(`  ${theme.dim("Multi-agent evaluation metrics require a completed run.")}`)
  console.log(`  Run ${theme.bold("aegis eval multi-agent run")} first to generate data.`)

  if (opts.testId) {
    console.log()
    console.log(`  Filter by test ID: ${opts.testId}`)
  }
  console.log()
}
