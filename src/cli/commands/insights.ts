import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"

export function registerInsights(program: Command) {
  const cmd = program
    .command("insights")
    .alias("i")
    .description("Cross-database intelligence — join audit, billing, experience, and telemetry")

  cmd
    .command("summary")
    .description("High-level system status across all 4 databases")
    .action(handleSummary)

  cmd
    .command("sessions")
    .description("Session-level report joining audit + billing + experience + telemetry")
    .option("-l, --limit <number>", "Number of sessions to show", "20")
    .action(handleSessions)

  cmd
    .command("agents")
    .description("Agent performance heatmap (by agent_type)")
    .action(handleAgents)

  cmd
    .command("failures")
    .description("Root cause: what failed, what it cost, what patterns")
    .action(handleFailures)

  cmd
    .command("costs")
    .description("Cost vs outcome analysis (cheapest paths to success)")
    .action(handleCosts)

  cmd
    .command("timeline")
    .description("Timeline of activity across all stores")
    .option("-d, --days <number>", "Number of days to show", "20")
    .action(handleTimeline)

  cmd
    .command("export")
    .description("Export unified data as JSON")
    .option("--format <format>", "Export format", "json")
    .option("-o, --output <path>", "Output file path")
    .action(handleExport)
}

async function handleSummary() {
  showBanner()
  const { auditStore } = await import("../../audit/store")
  const { billingTracker } = await import("../../billing/tracker")
  const { experienceStore } = await import("../../experience/store")
  const { tracingStore } = await import("../../telemetry/tracing")

  const auditStats = auditStore.getStats()
  const totalSpend = billingTracker.getTotalSpend()
  const budgetLimit = billingTracker.getBudgetLimit()
  const expStats = experienceStore.getStats()
  const traceStats = tracingStore.getStats()

  console.log(theme.heading("\n  \u{1F4CA} System Intelligence Summary\n"))

  console.log(`  ${theme.bold("Audit Log")}`)
  console.log(`    Entries:  ${theme.bold(String(auditStats.totalEntries))}`)
  console.log(`    Sessions: ${theme.text(String(auditStats.totalSessions))}`)
  const topTypes = Object.entries(auditStats.byType).slice(0, 5)
  if (topTypes.length > 0) {
    console.log(`    Types:    ${theme.dim(topTypes.map(([t, c]) => `${t}:${c}`).join(", "))}`)
  } else {
    console.log(`    Types:    ${theme.dim("none")}`)
  }
  console.log()

  console.log(`  ${theme.bold("Billing")}`)
  console.log(`    Total spend: $${totalSpend.toFixed(4)}`)
  const pct = budgetLimit > 0 ? ((totalSpend / budgetLimit) * 100).toFixed(1) : "N/A"
  console.log(`    Budget:      $${budgetLimit.toFixed(2)} (${pct}% used)`)
  console.log()

  console.log(`  ${theme.bold("Experience Buffer")}`)
  console.log(`    Total:     ${theme.bold(String(expStats.totalExperiences))}`)
  console.log(`    Success:   ${theme.success(String(expStats.successCount))}`)
  console.log(`    Failed:    ${theme.error(String(expStats.failureCount))}`)
  if (expStats.totalExperiences > 0) {
    console.log(`    Avg reward: ${theme.text(expStats.avgReward.toFixed(2))}`)
  }
  console.log()

  console.log(`  ${theme.bold("Telemetry Traces")}`)
  console.log(`    Spans:    ${theme.bold(String(traceStats.totalSpans))}`)
  console.log(`    Sessions: ${theme.text(String(traceStats.sessionCount))}`)
  const statusStr = Object.entries(traceStats.byStatus).map(([s, c]) => `${s}:${c}`).join(", ")
  console.log(`    Status:   ${theme.dim(statusStr || "none")}`)
  console.log()
}

async function handleSessions(opts: { limit?: string }) {
  showBanner()
  const displayLimit = parseInt(opts.limit ?? "20", 10) || 20
  const { auditStore } = await import("../../audit/store")
  const { billingTracker } = await import("../../billing/tracker")
  const { experienceStore } = await import("../../experience/store")
  const { tracingStore } = await import("../../telemetry/tracing")

  const auditEntries = auditStore.query({ limit: 100000 })
  const auditBySession = new Map<string, { entryCount: number; totalDuration: number; toolCalls: number }>()
  for (const e of auditEntries) {
    const s = auditBySession.get(e.sessionId) || { entryCount: 0, totalDuration: 0, toolCalls: 0 }
    s.entryCount++
    s.totalDuration += e.durationMs
    if (e.eventType === "tool_call") s.toolCalls++
    auditBySession.set(e.sessionId, s)
  }

  const billingRows = billingTracker.getCostBySession()
  const costBySession = new Map<string, number>()
  for (const r of billingRows) {
    costBySession.set(r.sessionId, (costBySession.get(r.sessionId) || 0) + r.totalCost)
  }
  const billingSessions = new Set(billingRows.map(r => r.sessionId))

  const allExp = experienceStore.listRecent(10000)
  const expBySession = new Map<string, { outcome: string; reward: number }>()
  for (const e of allExp) {
    if (!expBySession.has(e.sessionId)) {
      expBySession.set(e.sessionId, { outcome: e.outcome, reward: e.reward })
    }
  }

  const traceSessionIds = new Set(tracingStore.getAllSessionIds())

  const allSessionIds = new Set<string>()
  for (const sid of auditBySession.keys()) allSessionIds.add(sid)
  for (const sid of billingSessions) allSessionIds.add(sid)
  for (const e of allExp) allSessionIds.add(e.sessionId)
  for (const sid of traceSessionIds) allSessionIds.add(sid)

  if (allSessionIds.size === 0) {
    console.log(theme.dim("\n  No session data found.\n"))
    return
  }

  console.log(theme.heading(`\n  \u{1F517} Session Overview (${allSessionIds.size} total)\n`))

  const sorted = [...allSessionIds].sort().slice(0, displayLimit)
  for (const sid of sorted) {
    const a = auditBySession.get(sid)
    const cost = costBySession.get(sid)
    const e = expBySession.get(sid)
    const t = traceSessionIds.has(sid)

    let coverage = 0
    if (a) coverage++
    if (cost !== undefined) coverage++
    if (e) coverage++
    if (t) coverage++

    const parts: string[] = []
    parts.push(a ? theme.success("a") : theme.dim("a"))
    parts.push(cost !== undefined ? theme.success("b") : theme.dim("b"))
    parts.push(e ? theme.success("e") : theme.dim("e"))
    parts.push(t ? theme.success("t") : theme.dim("t"))

    const costStr = cost !== undefined ? `$${cost.toFixed(4)}` : "-"
    const outcomeStr = e ? e.outcome : "-"
    const durationStr = a ? `${(a.totalDuration / 1000).toFixed(1)}s` : "-"
    const toolStr = a ? `${a.toolCalls} tools` : "-"

    console.log(`  ${theme.bold(sid.slice(0, 36))}`)
    console.log(`    Cov: ${coverage}/4 [${parts.join(" ")}]  Dur: ${durationStr}  Cost: ${costStr}`)
    console.log(`    Out: ${outcomeStr}  ${toolStr}`)
    console.log()
  }

  if (allSessionIds.size > displayLimit) {
    console.log(theme.dim(`  ... and ${allSessionIds.size - displayLimit} more sessions (use --limit to show more)\n`))
  }
}

async function handleAgents() {
  showBanner()
  const { experienceStore } = await import("../../experience/store")
  const { billingTracker } = await import("../../billing/tracker")

  const allExp = experienceStore.listRecent(10000)
  const billingRows = billingTracker.getCostBySession()
  const costBySession = new Map<string, number>()
  for (const r of billingRows) {
    costBySession.set(r.sessionId, (costBySession.get(r.sessionId) || 0) + r.totalCost)
  }

  const agentGroups = new Map<string, { runs: number; successes: number; failures: number; totalReward: number; totalActions: number; sessions: Set<string> }>()
  for (const e of allExp) {
    const key = e.agentType || "default"
    const g = agentGroups.get(key) || { runs: 0, successes: 0, failures: 0, totalReward: 0, totalActions: 0, sessions: new Set<string>() }
    g.runs++
    if (e.outcome === "success") g.successes++
    if (e.outcome === "failed") g.failures++
    g.totalReward += e.reward
    g.totalActions += e.actionCount
    g.sessions.add(e.sessionId)
    agentGroups.set(key, g)
  }

  if (agentGroups.size === 0) {
    console.log(theme.dim("\n  No agent performance data available.\n"))
    return
  }

  console.log(theme.heading(`\n  \u{1F3C3} Agent Performance Heatmap\n`))

  for (const [agentType, g] of [...agentGroups.entries()].sort(([, a], [, b]) => b.runs - a.runs)) {
    const successRate = g.runs > 0 ? (g.successes / g.runs) * 100 : 0
    const avgReward = g.runs > 0 ? (g.totalReward / g.runs).toFixed(2) : "0.00"
    const avgActions = g.runs > 0 ? (g.totalActions / g.runs).toFixed(1) : "0.0"

    let totalCost = 0
    let costSessions = 0
    for (const sid of g.sessions) {
      const cost = costBySession.get(sid)
      if (cost !== undefined) { totalCost += cost; costSessions++ }
    }
    const avgCost = costSessions > 0 ? (totalCost / costSessions).toFixed(4) : "N/A"

    const barLen = Math.round(successRate / 10)
    const bar = theme.success("\u2588".repeat(Math.min(barLen, 10))) + theme.error("\u2588".repeat(Math.max(0, 10 - barLen)))

    console.log(`  ${theme.bold(agentType)}`)
    console.log(`    Runs: ${g.runs}  OK: ${theme.success(String(g.successes))}  FAIL: ${theme.error(String(g.failures))}`)
    console.log(`    Rate: ${bar} ${successRate.toFixed(0)}%`)
    console.log(`    Avg: ${avgActions} actions, reward ${avgReward}, cost $${avgCost}`)
    console.log()
  }
}

async function handleFailures() {
  showBanner()
  const { experienceStore } = await import("../../experience/store")
  const { auditStore } = await import("../../audit/store")
  const { billingTracker } = await import("../../billing/tracker")

  const failures = experienceStore.getRecentFailures(50)
  const clusters = experienceStore.computeClusterInsights(2)

  const billingRows = billingTracker.getCostBySession()
  const costBySession = new Map<string, number>()
  for (const r of billingRows) {
    costBySession.set(r.sessionId, (costBySession.get(r.sessionId) || 0) + r.totalCost)
  }

  const auditEntries = auditStore.query({ limit: 100000 })
  const toolCallsBySession = new Map<string, number>()
  for (const e of auditEntries) {
    if (e.eventType === "tool_call") {
      toolCallsBySession.set(e.sessionId, (toolCallsBySession.get(e.sessionId) || 0) + 1)
    }
  }

  if (failures.length === 0) {
    console.log(theme.success("\n  \u2705 No failures recorded!\n"))
    return
  }

  console.log(theme.heading(`\n  \u{1F534} Failure Analysis (${failures.length} total)\n`))

  for (const f of failures.slice(0, 10)) {
    const cost = costBySession.get(f.sessionId)
    const toolCalls = toolCallsBySession.get(f.sessionId)
    const costStr = cost !== undefined ? `$${cost.toFixed(4)}` : "N/A"
    const toolStr = toolCalls !== undefined ? `${toolCalls} tools` : "N/A"

    console.log(`  ${theme.error("\u2717")} ${theme.bold(f.goal.slice(0, 60))}`)
    console.log(`     Agent: ${theme.dim(f.agentType)}  Cost: ${costStr}  Tools: ${toolStr}`)
    console.log(`     ${theme.dim(f.summary.slice(0, 100))}`)
    console.log()
  }

  if (failures.length > 10) {
    console.log(theme.dim(`  ... and ${failures.length - 10} more failures\n`))
  }

  if (clusters.length > 0) {
    console.log(theme.heading(`  \u{1F4C8} Failure Clusters\n`))
    for (const c of clusters) {
      console.log(`  ${theme.error("\u25CF")} ${theme.bold(c.clusterKey.slice(0, 60))} (${c.count} occurrences)`)
      for (const s of c.topSuggestions.slice(0, 3)) {
        console.log(`     ${theme.success("\u2192")} ${theme.dim(s)}`)
      }
      console.log()
    }
  }
}

async function handleCosts() {
  showBanner()
  const { experienceStore } = await import("../../experience/store")
  const { billingTracker } = await import("../../billing/tracker")

  const allExp = experienceStore.listRecent(10000)
  const billingRows = billingTracker.getCostBySession()
  const costBySession = new Map<string, number>()
  for (const r of billingRows) {
    costBySession.set(r.sessionId, (costBySession.get(r.sessionId) || 0) + r.totalCost)
  }

  const joined: Array<{ sessionId: string; cost: number; outcome: string; duration: number; actionCount: number; reward: number }> = []
  for (const e of allExp) {
    const cost = costBySession.get(e.sessionId)
    if (cost === undefined) continue
    const duration = e.completedAt && e.startedAt
      ? (new Date(e.completedAt).getTime() - new Date(e.startedAt).getTime()) / 1000
      : 0
    joined.push({
      sessionId: e.sessionId,
      cost,
      outcome: e.outcome,
      duration,
      actionCount: e.actionCount,
      reward: e.reward,
    })
  }

  if (joined.length === 0) {
    console.log(theme.dim("\n  No sessions with both billing and experience data.\n"))
    return
  }

  const successes = joined.filter(j => j.outcome === "success")
  const failures = joined.filter(j => j.outcome === "failed")

  console.log(theme.heading(`\n  \u{1F4B0} Cost vs Outcome (${joined.length} sessions)\n`))

  if (successes.length > 0) {
    const cheapest = successes.reduce((a, b) => a.cost < b.cost ? a : b)
    console.log(`  ${theme.success("\u2713")} Cheapest success: $${cheapest.cost.toFixed(4)}`)
    console.log(`     ${cheapest.actionCount} actions, ${cheapest.duration.toFixed(0)}s`)
    console.log(`     ${theme.dim(cheapest.sessionId.slice(0, 40))}`)
    console.log()
  }

  if (failures.length > 0) {
    const mostExpensive = failures.reduce((a, b) => a.cost > b.cost ? a : b)
    console.log(`  ${theme.error("\u2717")} Most expensive failure: $${mostExpensive.cost.toFixed(4)}`)
    console.log(`     ${mostExpensive.actionCount} actions, ${mostExpensive.duration.toFixed(0)}s`)
    console.log(`     ${theme.dim(mostExpensive.sessionId.slice(0, 40))}`)
    console.log()
  }

  const bestValue = [...successes].sort(
    (a, b) => (a.cost / Math.max(a.reward, 0.01)) - (b.cost / Math.max(b.reward, 0.01)),
  )[0]
  if (bestValue) {
    console.log(`  ${theme.accent("\u2605")} Best value: $${bestValue.cost.toFixed(4)} for reward ${bestValue.reward}`)
    console.log(`     ${bestValue.actionCount} actions`)
    console.log(`     ${theme.dim(bestValue.sessionId.slice(0, 40))}`)
    console.log()
  }

  const avgCost = joined.reduce((s, j) => s + j.cost, 0) / joined.length
  console.log(`  Summary:`)
  console.log(`    Avg cost per session: $${avgCost.toFixed(4)}`)
  console.log(`    Success rate: ${successes.length}/${joined.length} (${((successes.length / joined.length) * 100).toFixed(0)}%)`)
  console.log()
}

async function handleTimeline(opts: { days?: string }) {
  showBanner()
  const displayDays = parseInt(opts.days ?? "20", 10) || 20
  const { auditStore } = await import("../../audit/store")
  const { billingTracker } = await import("../../billing/tracker")
  const { experienceStore } = await import("../../experience/store")

  const auditEntries = auditStore.query({ limit: 100000 })
  const costHistory = billingTracker.getCostHistory(365)
  const allExp = experienceStore.listRecent(10000)

  const auditByDate = new Map<string, number>()
  for (const e of auditEntries) {
    const date = e.timestamp.slice(0, 10)
    auditByDate.set(date, (auditByDate.get(date) || 0) + 1)
  }

  const expByDate = new Map<string, { total: number; successes: number }>()
  for (const e of allExp) {
    const date = e.startedAt.slice(0, 10)
    const existing = expByDate.get(date) || { total: 0, successes: 0 }
    existing.total++
    if (e.outcome === "success") existing.successes++
    expByDate.set(date, existing)
  }

  const costByDate = new Map(costHistory.map(c => [c.date, c.totalCost]))

  const allDates = new Set<string>()
  for (const d of auditByDate.keys()) allDates.add(d)
  for (const d of expByDate.keys()) allDates.add(d)
  for (const c of costHistory) allDates.add(c.date)

  const sortedDates = [...allDates].sort()

  if (sortedDates.length === 0) {
    console.log(theme.dim("\n  No timeline data available.\n"))
    return
  }

  console.log(theme.heading(`\n  \u{1F4C5} Activity Timeline (${sortedDates.length} days)\n`))

  for (const date of sortedDates.slice(-displayDays)) {
    const auditCount = auditByDate.get(date) || 0
    const cost = costByDate.get(date)
    const exp = expByDate.get(date)

    const costStr = cost !== undefined ? `$${cost.toFixed(4)}` : "-"
    const expStr = exp ? `${exp.total}runs(${exp.successes}ok)` : "-"

    const barLen = Math.min(auditCount, 40)
    const bar = theme.accent("\u2588".repeat(Math.round(barLen / 2)))

    console.log(`  ${theme.dim(date)} ${bar} ${auditCount} entries`)
    console.log(`     Cost: ${costStr}  Exp: ${expStr}`)
    console.log()
  }
}

async function handleExport(opts: { format?: string; output?: string }) {
  showBanner()
  const { auditStore } = await import("../../audit/store")
  const { billingTracker } = await import("../../billing/tracker")
  const { experienceStore } = await import("../../experience/store")
  const { tracingStore } = await import("../../telemetry/tracing")

  const data = {
    exportedAt: new Date().toISOString(),
    audit: auditStore.getStats(),
    billing: {
      totalSpend: billingTracker.getTotalSpend(),
      budgetLimit: billingTracker.getBudgetLimit(),
      byModel: billingTracker.getCostByModel(),
      bySession: billingTracker.getCostBySession(),
    },
    experience: experienceStore.getStats(),
    telemetry: tracingStore.getStats(),
  }

  const json = JSON.stringify(data, null, 2)

  if (opts.output) {
    const fs = await import("node:fs")
    fs.writeFileSync(opts.output, json, "utf-8")
    console.log(theme.success(`\n  \u2713 Exported to ${opts.output}\n`))
  } else {
    console.log(json)
  }
}
