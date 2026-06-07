import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"
import type { SkillCandidate, FailureCluster, SelfPlayConfig } from "../../improve/types"

export function registerImprove(program: Command) {
  const improve = program
    .command("improve")
    .description("Self-improving agents — skill extraction, failure clustering, adversarial self-play")

  // ── Skill subcommands ──────────────────────────────────────────────

  const skill = improve.command("skill").description("Manage skill candidates extracted from successful experiences")

  skill
    .command("extract")
    .description("Extract skill candidates from successful experiences")
    .option("--min-reward <n>", "Minimum reward threshold", "0.7")
    .action(handleSkillExtract)

  skill
    .command("list")
    .description("List skill candidates")
    .option("--status <status>", "Filter by status (candidate|validated|published|rejected)")
    .action(handleSkillList)

  skill
    .command("validate <id>")
    .description("Validate a skill candidate against recent failures")
    .action(handleSkillValidate)

  skill
    .command("publish <id>")
    .description("Publish a candidate as a real skill in src/skills/")
    .action(handleSkillPublish)

  skill.command("reject <id>").description("Reject a skill candidate").action(handleSkillReject)

  skill.command("stats").description("Show skill extraction statistics").action(handleSkillStats)

  // ── Failure subcommands ────────────────────────────────────────────

  const failure = improve.command("failure").description("Cluster and analyze agent failures")

  failure
    .command("cluster")
    .description("Cluster recent failures by similarity")
    .option("--min-size <n>", "Minimum cluster size", "2")
    .action(handleFailureCluster)

  failure
    .command("list")
    .description("List failure clusters")
    .option("--severity <level>", "Filter by severity (low|medium|high|critical)")
    .action(handleFailureList)

  failure.command("fix <id>").description("Generate fix suggestion for a failure cluster").action(handleFailureFix)

  failure
    .command("retry <id>")
    .description("Auto-retry failed experiences in a cluster with suggested fix")
    .action(handleFailureRetry)

  // ── Adversarial subcommands ────────────────────────────────────────

  const adversarial = improve.command("adversarial").description("Adversarial self-play for system hardening")

  adversarial
    .command("run")
    .description("Run adversarial self-play session")
    .option("--agent-types <types>", "Comma-separated agent types", "build,debug,review")
    .option("--scenarios <n>", "Number of scenarios", "5")
    .option("--rounds <n>", "Max rounds per scenario", "3")
    .option("--budget <usd>", "Budget in USD", "1.0")
    .action(handleAdversarialRun)

  adversarial
    .command("results")
    .description("Show past adversarial self-play results")
    .option("--limit <n>", "Number of results to show", "10")
    .action(handleAdversarialResults)

  adversarial
    .command("analyze")
    .description("Analyze adversarial results for regressions")
    .action(handleAdversarialAnalyze)

  // ── Scheduler subcommands ────────────────────────────────────

  const scheduler = improve.command("scheduler").description("Self-improvement cron scheduler management")

  scheduler
    .command("init")
    .description("Register self-improvement cron triggers (skill extraction every 6h, failure clustering every 12h)")
    .action(handleSchedulerInit)

  scheduler.command("remove").description("Remove all self-improvement cron triggers").action(handleSchedulerRemove)

  scheduler.command("status").description("Check if self-improvement scheduler is active").action(handleSchedulerStatus)

  scheduler
    .command("run <job>")
    .description("Run extraction/clustering immediately (skill-extract, failure-cluster, all)")
    .action(handleSchedulerRun)
}

// ── Skill handlers ─────────────────────────────────────────────────

async function handleSkillExtract(opts: { minReward?: string }) {
  showBanner()
  const { SkillExtractor } = await import("../../improve/skill-extractor")
  const extractor = new SkillExtractor()

  const minReward = parseFloat(opts.minReward ?? "0.7") || 0.7
  const candidates = extractor.extractCandidates(minReward)

  if (candidates.length === 0) {
    console.log(theme.dim("\n  No skill candidates found. Run more agent sessions first.\n"))
    return
  }

  console.log(theme.heading(`\n  🧠 Skill Candidates Extracted (${candidates.length})\n`))
  for (const c of candidates) {
    const bar = "█".repeat(Math.round(c.confidence * 10)) + "░".repeat(10 - Math.round(c.confidence * 10))
    console.log(`  ${theme.bold(c.name)}`)
    console.log(`     Confidence: ${theme.accent(`${(c.confidence * 100).toFixed(0)}%`)} ${bar}`)
    console.log(`     Success:    ${(c.successRate * 100).toFixed(0)}%  Reward: ${c.avgReward.toFixed(2)}`)
    console.log(`     Status:     ${theme.dim(c.status)}`)
    console.log(`     Sources:    ${theme.dim(c.derivedFrom.length)} experiences`)
    console.log()
  }
}

async function handleSkillList(opts: { status?: string }) {
  showBanner()
  const { SkillExtractor } = await import("../../improve/skill-extractor")
  const extractor = new SkillExtractor()

  const status = opts.status as SkillCandidate["status"] | undefined
  const candidates = extractor.getCandidates(status)

  if (candidates.length === 0) {
    console.log(theme.dim("\n  No skill candidates found.\n"))
    return
  }

  console.log(theme.heading(`\n  📋 Skill Candidates (${candidates.length})\n`))
  for (const c of candidates) {
    const statusColor =
      c.status === "published"
        ? theme.success
        : c.status === "validated"
          ? theme.info
          : c.status === "rejected"
            ? theme.error
            : theme.warn
    console.log(`  ${theme.bold(c.name)}  ${statusColor(c.status)}`)
    console.log(
      `     ${theme.dim(c.id)} · ${(c.confidence * 100).toFixed(0)}% confidence · ${c.derivedFrom.length} sources`,
    )
    console.log()
  }
}

async function handleSkillValidate(id: string) {
  showBanner()
  const { SkillExtractor } = await import("../../improve/skill-extractor")
  const extractor = new SkillExtractor()

  const all = extractor.getCandidates()
  const candidate = all.find((c) => c.id === id || c.name === id)
  if (!candidate) {
    console.log(theme.error(`\n  Candidate not found: ${id}\n`))
    return
  }

  const validated = await extractor.validateCandidate(candidate)
  console.log(theme.heading(`\n  ✅ Validated: ${validated.name}\n`))
  console.log(`  Status:     ${theme.success(validated.status)}`)
  console.log(`  Confidence: ${theme.accent(`${(validated.confidence * 100).toFixed(0)}%`)}`)
  console.log()
}

async function handleSkillPublish(id: string) {
  showBanner()
  const { SkillExtractor } = await import("../../improve/skill-extractor")
  const extractor = new SkillExtractor()

  const result = await extractor.publishCandidate(id)
  if (!result.success) {
    console.log(theme.error(`\n  Failed to publish: ${result.error}\n`))
    return
  }

  console.log(theme.heading(`\n  📦 Published Skill\n`))
  console.log(`  Path: ${theme.success(result.skillPath ?? "")}`)
  console.log()
}

async function handleSkillReject(id: string) {
  showBanner()
  const { SkillExtractor } = await import("../../improve/skill-extractor")
  const extractor = new SkillExtractor()

  const ok = extractor.rejectCandidate(id)
  if (!ok) {
    console.log(theme.error(`\n  Candidate not found: ${id}\n`))
    return
  }

  console.log(theme.dim(`\n  Rejected candidate: ${id}\n`))
}

async function handleSkillStats() {
  showBanner()
  const { SkillExtractor } = await import("../../improve/skill-extractor")
  const extractor = new SkillExtractor()

  const stats = extractor.getStats()
  console.log(theme.heading("\n  📊 Skill Extraction Stats\n"))
  console.log(`  Total candidates:  ${theme.bold(String(stats.totalCandidates))}`)
  console.log(`  Published:         ${theme.success(String(stats.published))}`)
  console.log(`  Avg confidence:    ${theme.text(`${(stats.avgConfidence * 100).toFixed(0)}%`)}`)
  console.log()
}

// ── Failure handlers ───────────────────────────────────────────────

async function handleFailureCluster(opts: { minSize?: string }) {
  showBanner()
  const { FailureClusterer } = await import("../../improve/failure-cluster")
  const clusterer = new FailureClusterer()

  const minSize = parseInt(opts.minSize ?? "2", 10) || 2
  const clusters = clusterer.cluster(minSize)

  if (clusters.length === 0) {
    console.log(theme.success("\n  ✅ No failure clusters found.\n"))
    return
  }

  console.log(theme.heading(`\n  🔴 Failure Clusters (${clusters.length})\n`))
  for (const c of clusters) {
    const severityColor =
      c.severity === "critical"
        ? theme.error
        : c.severity === "high"
          ? theme.warn
          : c.severity === "medium"
            ? theme.info
            : theme.dim
    console.log(`  ${severityColor(c.severity.toUpperCase())} ${theme.bold(c.name)} (${c.count} failures)`)
    console.log(`     Pattern: ${theme.dim(c.commonPattern.slice(0, 80))}`)
    console.log(`     Fix:     ${theme.text(c.suggestedFix.slice(0, 80))}`)
    console.log()
  }
}

async function handleFailureList(opts: { severity?: string }) {
  showBanner()
  const { FailureClusterer } = await import("../../improve/failure-cluster")
  const clusterer = new FailureClusterer()

  const severity = opts.severity as FailureCluster["severity"] | undefined
  const clusters = clusterer.getClusters(severity)

  if (clusters.length === 0) {
    console.log(theme.dim("\n  No failure clusters.\n"))
    return
  }

  console.log(theme.heading(`\n  📋 Failure Clusters (${clusters.length})\n`))
  for (const c of clusters) {
    console.log(`  ${theme.bold(c.name)}`)
    console.log(`     ID:       ${theme.dim(c.id)} · ${c.count} experiences · ${c.severity}`)
    console.log(`     Pattern:  ${theme.dim(c.commonPattern.slice(0, 80))}`)
    console.log()
  }
}

async function handleFailureFix(id: string) {
  showBanner()
  const { FailureClusterer } = await import("../../improve/failure-cluster")
  const clusterer = new FailureClusterer()

  const fix = await clusterer.generateFix(id)
  console.log(fix)
}

async function handleFailureRetry(id: string) {
  showBanner()
  const { FailureClusterer } = await import("../../improve/failure-cluster")
  const clusterer = new FailureClusterer()

  console.log(theme.heading(`\n  🔄 Auto-Retry Cluster: ${id}\n`))
  const result = await clusterer.autoRetryCluster(id)
  console.log(`  Retried:  ${theme.bold(String(result.retried))}`)
  console.log(`  Succeeded: ${theme.success(String(result.succeeded))}`)
  console.log()
}

// ── Adversarial handlers ───────────────────────────────────────────

async function handleAdversarialRun(opts: {
  agentTypes?: string
  scenarios?: string
  rounds?: string
  budget?: string
}) {
  showBanner()
  const { AdversarialSelfPlay } = await import("../../improve/adversarial")
  const adv = new AdversarialSelfPlay()

  const config: SelfPlayConfig = {
    agentTypes: (opts.agentTypes ?? "build,debug,review").split(",").map((s) => s.trim()),
    scenarioCount: parseInt(opts.scenarios ?? "5", 10) || 5,
    maxRounds: parseInt(opts.rounds ?? "3", 10) || 3,
    parallelAgents: 2,
    budget_usd: parseFloat(opts.budget ?? "1.0") || 1.0,
  }

  console.log(theme.heading("\n  🎯 Adversarial Self-Play Session\n"))
  console.log(`  Agent types: ${theme.text(config.agentTypes.join(", "))}`)
  console.log(`  Scenarios:   ${theme.bold(String(config.scenarioCount))}`)
  console.log(`  Max rounds:  ${config.maxRounds}`)
  console.log(`  Budget:      $${config.budget_usd.toFixed(2)}`)
  console.log()

  const results = await adv.runSession(config)

  const analyzed = adv.analyzeResults(results)
  console.log(theme.heading("  Results\n"))
  console.log(`  Sessions:          ${theme.bold(String(analyzed.totalSessions))}`)
  console.log(`  Defender wins:     ${theme.success(String(analyzed.defenderWins))}`)
  console.log(`  Attacker wins:     ${theme.error(String(analyzed.attackerWins))}`)
  console.log(`  Draws:             ${theme.dim(String(analyzed.draws))}`)
  console.log()

  if (analyzed.criticalFindings.length > 0) {
    console.log(theme.heading("  Critical Findings\n"))
    for (const f of analyzed.criticalFindings) {
      console.log(`  ${theme.error("!")} ${f}`)
    }
    console.log()
  }

  if (analyzed.regressions.length > 0) {
    console.log(theme.heading("  ⚠ Regressions Detected\n"))
    for (const r of analyzed.regressions) {
      console.log(`  ${theme.error(r)}`)
    }
    console.log()
  }
}

async function handleAdversarialResults(opts: { limit?: string }) {
  showBanner()
  const { AdversarialSelfPlay } = await import("../../improve/adversarial")
  const adv = new AdversarialSelfPlay()

  const limit = parseInt(opts.limit ?? "10", 10) || 10
  const sessions = adv.getSessions(limit)

  if (sessions.length === 0) {
    console.log(theme.dim("\n  No adversarial sessions yet.\n"))
    return
  }

  console.log(theme.heading(`\n  📋 Adversarial Sessions (${sessions.length})\n`))
  for (const s of sessions) {
    const icon =
      s.winner === "defender" ? theme.success("🛡") : s.winner === "attacker" ? theme.error("⚔") : theme.warn("=")
    console.log(`  ${icon} ${s.scenario.slice(0, 60)}`)
    console.log(`     Winner: ${theme.bold(s.winner)} · ${s.rounds} rounds · ${s.findings.length} findings`)
    console.log(`     ${theme.dim(s.createdAt.slice(0, 10))}`)
    console.log()
  }
}

async function handleAdversarialAnalyze() {
  showBanner()
  const { AdversarialSelfPlay } = await import("../../improve/adversarial")
  const adv = new AdversarialSelfPlay()

  const sessions = adv.getSessions(100)
  const analyzed = adv.analyzeResults(sessions)
  const stats = adv.getStats()

  console.log(theme.heading("\n  📊 Adversarial Analysis\n"))
  console.log(`  Total sessions:     ${theme.bold(String(stats.totalSessions))}`)
  console.log(`  Total scenarios:    ${stats.totalScenarios}`)
  console.log(`  Avg rounds:         ${stats.avgRounds}`)
  console.log()
  console.log(
    `  Defender win rate:  ${theme.success(`${sessions.length > 0 ? ((analyzed.defenderWins / sessions.length) * 100).toFixed(0) : 0}%`)}`,
  )
  console.log(
    `  Attacker win rate:  ${theme.error(`${sessions.length > 0 ? ((analyzed.attackerWins / sessions.length) * 100).toFixed(0) : 0}%`)}`,
  )
  console.log(
    `  Draw rate:          ${theme.dim(`${sessions.length > 0 ? ((analyzed.draws / sessions.length) * 100).toFixed(0) : 0}%`)}`,
  )
  console.log()

  if (analyzed.regressions.length > 0) {
    console.log(theme.heading("  ⚠ Regressions\n"))
    for (const r of analyzed.regressions) {
      console.log(`  ${theme.error(r)}`)
    }
    console.log()
  }

  if (analyzed.criticalFindings.length > 0) {
    console.log(theme.heading("  Critical Findings\n"))
    for (const f of analyzed.criticalFindings) {
      console.log(`  ${theme.error(f)}`)
    }
    console.log()
  }
}

// ── Scheduler handlers ────────────────────────────────────────────

async function handleSchedulerInit() {
  showBanner()
  const { ImprovementScheduler } = await import("../../improve/scheduler")
  const scheduler = new ImprovementScheduler()

  const ids = scheduler.registerDefaults()
  console.log(theme.heading(`\n  ⏰ Self-Improvement Scheduler Initialized\n`))
  console.log(`  Registered ${ids.length} cron trigger(s):`)
  for (const id of ids) {
    console.log(`    ${theme.success("✓")} ${theme.bold(id)}`)
  }
  console.log()
}

async function handleSchedulerRemove() {
  showBanner()
  const { ImprovementScheduler } = await import("../../improve/scheduler")
  const scheduler = new ImprovementScheduler()

  const count = scheduler.removeDefaults()
  console.log(theme.heading(`\n  Removed ${count} self-improvement scheduler trigger(s)\n`))
}

async function handleSchedulerStatus() {
  showBanner()
  const { ImprovementScheduler } = await import("../../improve/scheduler")
  const scheduler = new ImprovementScheduler()

  const active = scheduler.hasDefaults()
  if (active) {
    const triggers = (await import("../../triggers/registry")).triggerEngine.list({ tag: "self-improve" })
    console.log(theme.heading("\n  ✅ Self-Improvement Scheduler is Active\n"))
    for (const t of triggers) {
      const lastFired = t.lastFiredAt ? ` (last: ${new Date(t.lastFiredAt).toLocaleString()})` : " (never fired)"
      console.log(`  ${theme.success("✓")} ${theme.bold(t.name)}`)
      console.log(`     ID:    ${theme.dim(t.id)}`)
      console.log(`     Type:  ${t.type}`)
      console.log(`     Goal:  ${t.action.goal}`)
      console.log(`     Fires: ${t.fireCount}${lastFired}`)
      console.log()
    }
  } else {
    console.log(theme.dim("\n  Self-Improvement Scheduler is not active.\n"))
    console.log(`  Run ${theme.bold("aegis improve scheduler init")} to enable it.`)
    console.log()
  }
}

async function handleSchedulerRun(job: string) {
  showBanner()
  const { ImprovementScheduler } = await import("../../improve/scheduler")
  const scheduler = new ImprovementScheduler()

  const valid = ["skill-extract", "failure-cluster", "all"]
  if (!valid.includes(job)) {
    console.log(theme.error(`\n  Invalid job: "${job}". Valid: ${valid.join(", ")}\n`))
    return
  }

  console.log(theme.heading(`\n  ▶ Running: ${job}\n`))
  const results = await scheduler.runNow(job as "skill-extract" | "failure-cluster" | "all")

  for (const r of results) {
    if (r.result.startsWith("Failed:")) {
      console.log(`  ${theme.error("✗")} ${r.job}: ${r.result}`)
    } else {
      console.log(`  ${theme.success("✓")} ${r.job}: ${r.result}`)
    }
  }
  console.log()
}
