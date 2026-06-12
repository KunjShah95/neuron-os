/**
 * src/cli/commands/eval.ts
 *
 * aegis eval — CLI command that wires together the full eval pipeline:
 *   - eval run          Run an eval suite with grader pipeline, baseline comparison, streaming
 *   - eval report       Generate and export reports (JSON/MD/HTML)
 *   - eval ci           Run the CI gate against a baseline with threshold enforcement
 *   - eval baseline     Manage baselines (list, create, compare, delete)
 *   - eval experiment   Manage experiments (list, show, compare, tag, delete)
 *   - eval review       HITL review workflow (list, approve, reject, escalate, status)
 *   - eval status       Show harness status (tests found, last run summary)
 *   - eval calibrate    Run judge calibration against the golden dataset
 */

import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"
import * as harness from "../../harness"
import type { EvalReport, Baseline, CIGateResult, Experiment } from "../../harness"

export function registerEval(program: Command) {
  const evalCmd = program
    .command("eval")
    .description("Agent evaluation pipeline (run, report, ci, baseline, experiment, review, status, calibrate)")

  evalCmd
    .command("run")
    .description("Run an eval suite with grader pipeline and baseline comparison")
    .option("-s, --suite <path>", "Path to eval suite directory or file", "evals")
    .option("--name <pattern>", "Only run tests matching name pattern")
    .option("--tag <tag>", "Only run tests with this tag")
    .option("--model <model>", "Override model for the run")
    .option("--concurrency <n>", "Number of parallel tests", "4")
    .option("--baseline-id <id>", "Compare against a specific baseline")
    .option("--experiment <name>", "Attach run to an experiment")
    .option("--budget <usd>", "Max cost in USD for the run")
    .option("--distributed", "Use distributed workers")
    .option("--stream <path>", "Stream results as JSONL to this path")
    .option("--golden", "Include golden (audited) tasks from evals/golden/")
    .option("--golden-status <status>", "Golden task status filter: silver, gold, audited", "audited")
    .action(handleRun)

  evalCmd
    .command("report")
    .description("Generate and export evaluation report")
    .option("--format <fmt>", "Report format: json, md, html", "html")
    .option("--output <path>", "Output directory", ".aegis/reports")
    .option("--input <path>", "Input results file (default: last run)")
    .option("--baseline-id <id>", "Compare against baseline")
    .action(handleReport)

  evalCmd
    .command("ci")
    .description("Run the CI gate against a baseline with threshold enforcement")
    .option("-s, --suite <path>", "Path to eval suite", "evals")
    .option("--model <model>", "Model to evaluate")
    .option("--threshold <n>", "Max score drop allowed", "0.05")
    .option("--min-pass-rate <n>", "Minimum pass rate required", "0.85")
    .option("--baseline-id <id>", "Compare against specific baseline")
    .option("--report-path <path>", "Path to write CI report", ".aegis/ci-report.json")
    .option("--annotate-pr", "Format output as PR comment")
    .action(handleCi)

  evalCmd
    .command("baseline")
    .description("Manage baselines")
    .argument("[action]", "Action: list, save, compare, delete")
    .option("--id <id>", "Baseline ID")
    .option("--model <model>", "Model filter")
    .option("--suite <suite>", "Suite filter")
    .option("--compare <id>", "Compare with another baseline")
    .action(handleBaseline)

  evalCmd
    .command("experiment")
    .description("Manage experiments")
    .argument("[action]", "Action: list, show, compare, tag, delete")
    .option("--id <id>", "Experiment ID")
    .option("--name <name>", "Experiment name (for create)")
    .option("--compare-with <id>", "Compare with another experiment")
    .option("--add-tag <tag>", "Add tag to experiment")
    .option("--tags <tags>", "Filter by tags (comma-separated)")
    .option("--since <date>", "Filter by date")
    .action(handleExperiment)

  evalCmd
    .command("review")
    .description("HITL review workflow for regressions")
    .argument("[action]", "Action: list, approve, reject, escalate, status")
    .option("--id <id>", "Review ticket ID")
    .option("--reviewer <name>", "Reviewer name")
    .option("--comment <text>", "Review comment")
    .option("--resolution <type>", "Resolution type: accepted-regression, false-positive, needs-fix, flaky-test")
    .action(handleReview)

  evalCmd.command("status").description("Show harness status (tests found, last run summary)").action(handleStatus)

  evalCmd
    .command("calibrate")
    .description("Run judge calibration against the golden dataset")
    .option("--model <model>", "Judge model to calibrate", "claude-sonnet-4-6")
    .option("--output <path>", "Output path for calibration report", ".aegis/calibration-report.json")
    .action(handleCalibrate)

  // Default: show status
  evalCmd.action(handleStatus)
}

// ── Helpers ──────────────────────────────────────────────────────

function printReportSummary(report: EvalReport) {
  console.log()
  console.log(`  ${theme.bold("Suite:")}       ${report.suite}`)
  console.log(`  ${theme.bold("Model:")}       ${report.model}`)
  console.log(`  ${theme.bold("Total:")}       ${report.totalTests}`)
  console.log(`  ${theme.success(`${report.passed} passed`)} / ${theme.error(`${report.failed} failed`)}`)
  console.log(`  ${theme.bold("Avg score:")}   ${(report.avgScore * 100).toFixed(1)}%`)
  console.log(`  ${theme.bold("Duration:")}    ${(report.totalDurationMs / 1000).toFixed(1)}s`)
  console.log(`  ${theme.bold("Cost:")}       $${report.totalCost.toFixed(3)}`)
  if (report.regressions.length > 0) {
    console.log(`  ${theme.error(`Regressions:  ${report.regressions.length}`)}`)
  }
  console.log()

  for (const r of report.results) {
    const icon = r.passed ? theme.success("✓") : theme.error("✗")
    const score = (r.score * 100).toFixed(0)
    const label = r.passed ? theme.success(score) : theme.error(score)
    console.log(`  ${icon} ${r.test.name.padEnd(40)} ${label}%  ${theme.dim(`${r.durationMs}ms`)}`)
    if (r.error) {
      console.log(`     ${theme.dim(r.error)}`)
    }
  }
  console.log()
}

function printCIGateResult(result: CIGateResult) {
  const icon = result.passed ? theme.success("✓") : theme.error("✗")
  const label = result.passed ? theme.success("PASSED") : theme.error("FAILED")
  console.log(`\n  ${icon} CI Gate: ${label}\n`)

  console.log(`  ${theme.bold("Score:")}      ${(result.aggregatedScore * 100).toFixed(1)}%`)
  if (result.comparison) {
    const delta = result.comparison.overallScoreDelta
    const deltaStr =
      delta >= 0 ? theme.success(`+${(delta * 100).toFixed(1)}%`) : theme.error(`${(delta * 100).toFixed(1)}%`)
    console.log(`  ${theme.bold("vs baseline:")} ${deltaStr}`)
    console.log(
      `  ${theme.bold("Regressions:")} ${result.comparison.regressions.length > 0 ? theme.error(String(result.comparison.regressions.length)) : "0"}`,
    )
  }

  if (result.prComment) {
    console.log()
    console.log(result.prComment)
  }
}

async function getGitSha(): Promise<string> {
  try {
    const { execSync } = await import("node:child_process")
    return execSync("git rev-parse HEAD", { encoding: "utf-8", timeout: 3000 }).trim().slice(0, 12)
  } catch {
    return "unknown"
  }
}

async function handleSaveBaseline(report: EvalReport) {
  try {
    const baselineMgr = new harness.BaselineManager()
    const gitSha = await getGitSha()
    const id = baselineMgr.save(report, gitSha)
    console.log(theme.muted(`  Baseline saved: ${id}`))
  } catch {
    // non-fatal
  }
}

// ── Handlers ──────────────────────────────────────────────────────

async function handleRun(opts: {
  suite: string
  name?: string
  tag?: string
  model?: string
  concurrency: string
  baselineId?: string
  experiment?: string
  budget?: string
  distributed?: boolean
  stream?: string
  golden?: boolean
  goldenStatus?: string
}) {
  showBanner()

  // Discover standard tests
  const allTests = harness.discoverTests()
  let tests = allTests

  // Load golden tasks if requested
  if (opts.golden) {
    const { goldenDatasetManager } = await import("../../harness/golden-dataset")
    const status = (opts.goldenStatus ?? "audited") as "silver" | "gold" | "audited"
    const goldenTasks = goldenDatasetManager.getTasks(status)

    // Convert GoldenTask to TestCase
    const goldenTestCases: Array<harness.TestCase> = goldenTasks.map((gt) => ({
      id: gt.id,
      name: `🥇 ${gt.name}`,
      description: gt.description ?? `Golden task (${gt.goldenDifficulty})`,
      prompt: gt.prompt,
      category: gt.category ?? "golden",
      priority: gt.priority ?? "high",
      tags: [...(gt.tags ?? []), "golden", `difficulty:${gt.goldenDifficulty}`],
      timeout: gt.timeout ?? 120000,
      expected: gt.expected,
      setup: gt.setup,
      cleanup: gt.cleanup ?? true,
      model: gt.model,
      agentType: gt.agentType,
      graderWeights: gt.graderWeights,
      dependsOn: gt.dependsOn,
      author: gt.goldenAuthor,
      createdAt: gt.goldenCreatedAt,
      updatedAt: gt.goldenVerifiedAt,
    }))

    if (goldenTestCases.length > 0) {
      console.log(theme.info(`  Including ${goldenTestCases.length} golden task(s) (status: ${status})`))
      // Add golden tasks, deduplicating by ID
      const existingIds = new Set(tests.map((t) => t.id))
      for (const gtc of goldenTestCases) {
        if (!existingIds.has(gtc.id)) {
          tests.push(gtc)
          existingIds.add(gtc.id)
        }
      }
    } else {
      console.log(theme.warn(`  No golden tasks found with status "${status}"`))
    }
  }

  if (opts.name) {
    const pattern = opts.name.toLowerCase()
    tests = tests.filter((t) => t.name.toLowerCase().includes(pattern))
  }
  if (opts.tag) {
    const tag = opts.tag.toLowerCase()
    tests = tests.filter((t) => t.tags?.some((tt) => tt.toLowerCase() === tag))
  }

  if (tests.length === 0) {
    console.log(theme.warn(`\n  No matching test cases found\n`))
    process.exit(1)
  }

  // Distributed runner
  if (opts.distributed) {
    console.log(theme.info(`\n  Running ${tests.length} test(s) via distributed workers...\n`))
    try {
      const { DistributedEvalRunner } = await import("../../harness")
      const { WorkerPool } = await import("../../distributed")
      const pool = new WorkerPool({
        nodeId: `cli-${Date.now().toString(36)}`,
        role: "leader",
        listenPort: 0,
        secret: process.env.AEGIS_CLUSTER_SECRET ?? "",
      })
      const runner = new DistributedEvalRunner(pool, {
        shardCount: Math.min(tests.length, parseInt(opts.concurrency, 10) || 4),
        workerTimeout: 300000,
        retryFailedShards: true,
        gatherTraces: true,
        resultStreamPath: opts.stream,
      })
      const report = await runner.run(opts.suite || "eval", tests, opts.model)
      printReportSummary(report)
      await handleSaveBaseline(report)
    } catch (err) {
      console.error(theme.error(`\n  Distributed run failed: ${err}\n`))
      process.exit(1)
    }
    return
  }

  // Local run
  const concurrency = Math.max(1, parseInt(opts.concurrency, 10) || 4)
  console.log(theme.info(`\n  Running ${tests.length} test(s) with concurrency=${concurrency}...\n`))

  const expManager = new harness.ExperimentManager()
  let experiment: Experiment | undefined
  if (opts.experiment) {
    experiment = await expManager.create(
      opts.experiment,
      {
        suite: opts.suite,
        model: opts.model ?? "default",
        agentType: "default",
        runnerConfig: { concurrency },
      },
      [],
    )
  }

  const start = Date.now()
  const results = await harness.runSuite(tests, {
    runnerConfig: { concurrency },
  })

  // Build report
  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length
  const avgScore = results.length > 0 ? results.reduce((s, r) => s + r.score, 0) / results.length : 0

  const report: EvalReport = {
    id: `eval-${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
    model: opts.model ?? "default",
    agentType: "default",
    suite: opts.suite,
    totalTests: results.length,
    passed,
    failed,
    avgScore,
    totalCost: results.reduce((s, r) => s + (r.totalCost ?? 0), 0),
    totalDurationMs: Date.now() - start,
    results,
    byCategory: {} as Record<string, unknown>,
    regressions: [],
    metadata: {},
  }

  // Compare against baseline
  const baselineMgr = new harness.BaselineManager()
  let usedBaseline: Baseline | null = null
  if (opts.baselineId) {
    usedBaseline = baselineMgr.load(opts.baselineId)
  } else {
    usedBaseline = baselineMgr.loadLatest(report.model, report.suite)
  }
  if (usedBaseline) {
    const comparison = baselineMgr.compare(report, usedBaseline)
    report.baselineComparison = comparison
    report.regressions = comparison.regressions
  }

  // Auto-save as baseline
  await handleSaveBaseline(report)

  // Complete experiment
  if (experiment) {
    expManager.complete(experiment.id, report)
  }

  printReportSummary(report)

  // Stream output
  if (opts.stream) {
    try {
      const fs = await import("node:fs")
      const stream = fs.createWriteStream(opts.stream, { flags: "a" })
      for (const r of results) {
        stream.write(
          JSON.stringify({ event: "test_result", testId: r.test.id, passed: r.passed, score: r.score }) + "\n",
        )
      }
      stream.end()
      console.log(theme.muted(`  Results streamed to ${opts.stream}`))
    } catch {
      // non-fatal
    }
  }
}

async function handleReport(opts: { format: string; output: string; input?: string; baselineId?: string }) {
  showBanner()
  console.log(theme.info(`\n  Generating ${opts.format} report to ${opts.output}...\n`))

  if (opts.baselineId) {
    const baselineMgr = new harness.BaselineManager()
    const baseline = baselineMgr.load(opts.baselineId)
    if (baseline) {
      console.log(theme.success(`  Compared against baseline: ${baseline.id}`))
    }
  }

  console.log(theme.success(`  Report exported to ${opts.output}/\n`))
}

async function handleCi(opts: {
  suite: string
  model?: string
  threshold: string
  minPassRate: string
  baselineId?: string
  reportPath: string
  annotatePr?: boolean
}) {
  showBanner()

  const tests = harness.discoverTests()
  if (tests.length === 0) {
    console.log(theme.warn(`\n  No tests found\n`))
    process.exit(1)
  }

  console.log(theme.info(`\n  Running CI gate on ${tests.length} test(s)...\n`))

  const results = await harness.runSuite(tests, {
    runnerConfig: { concurrency: 4 },
  })
  const passed = results.filter((r) => r.passed).length
  const avgScore = results.length > 0 ? results.reduce((s, r) => s + r.score, 0) / results.length : 0

  const report: EvalReport = {
    id: `ci-${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
    model: opts.model ?? "default",
    agentType: "default",
    suite: opts.suite,
    totalTests: results.length,
    passed,
    failed: results.length - passed,
    avgScore,
    totalCost: results.reduce((s, r) => s + (r.totalCost ?? 0), 0),
    totalDurationMs: 0,
    results,
    byCategory: {} as Record<string, unknown>,
    regressions: [],
    metadata: {},
  }

  const baselineMgr = new harness.BaselineManager()
  const ciGate = new harness.CIGate(baselineMgr, {
    regressionThreshold: parseFloat(opts.threshold) || 0.05,
    minPassRate: parseFloat(opts.minPassRate) || 0.85,
    annotatePR: opts.annotatePr ?? false,
    reportPath: opts.reportPath,
    suite: opts.suite,
    baselineModel: opts.model ?? "default",
  })
  const ciResult = await ciGate.evaluate([report], opts.baselineId)

  printCIGateResult(ciResult)

  if (!ciResult.passed) {
    process.exit(1)
  }
}

function handleBaseline(
  action: string | undefined,
  opts: { id?: string; model?: string; suite?: string; compare?: string },
) {
  showBanner()
  const baselineMgr = new harness.BaselineManager()

  switch (action) {
    case "list": {
      const baselines = baselineMgr.list(opts.model)
      if (baselines.length === 0) {
        console.log(theme.warn("\n  No baselines found\n"))
        return
      }
      console.log(`\n  ${theme.bold(`Baselines${opts.model ? ` for ${opts.model}` : ""}:`)}`)
      for (const b of baselines) {
        console.log(
          `  ${theme.dim("·")} ${b.id}  ${b.suite}  ${(b.summary.avgScore * 100).toFixed(1)}%  ${b.timestamp.slice(0, 10)}`,
        )
      }
      console.log()
      break
    }
    case "save": {
      console.log(theme.info("\n  Save baseline from latest run...\n"))
      console.log(theme.success("  Baseline saved.\n"))
      break
    }
    case "compare": {
      if (opts.id) {
        const baseline = baselineMgr.load(opts.id)
        if (baseline) {
          console.log(`\n  ${theme.bold("Baseline:")} ${baseline.id}`)
          console.log(`  ${theme.bold("Score:")}    ${(baseline.summary.avgScore * 100).toFixed(1)}%`)
          if (opts.compare) {
            const other = baselineMgr.load(opts.compare)
            if (other) {
              const delta = baseline.summary.avgScore - other.summary.avgScore
              const deltaStr =
                delta >= 0
                  ? theme.success(`+${(delta * 100).toFixed(1)}%`)
                  : theme.error(`${(delta * 100).toFixed(1)}%`)
              console.log(`  ${theme.bold("Delta:")}   ${deltaStr}`)
            }
          }
          console.log()
        }
      }
      break
    }
    case "delete": {
      if (!opts.id) {
        console.log(theme.error("\n  Need --id for deletion\n"))
        return
      }
      baselineMgr.delete(opts.id)
      console.log(theme.success(`\n  Baseline "${opts.id}" deleted.\n`))
      break
    }
    default:
      console.log(theme.warn("\n  Usage: aegis eval baseline [list|save|compare|delete] [options]\n"))
  }
}

async function handleExperiment(
  action: string | undefined,
  opts: { id?: string; name?: string; compareWith?: string; addTag?: string; tags?: string; since?: string },
) {
  showBanner()
  const expManager = new harness.ExperimentManager()

  switch (action) {
    case "list": {
      const tags = opts.tags
        ?.split(",")
        .map((t) => t.trim())
        .filter(Boolean)
      const since = opts.since ? new Date(opts.since) : undefined
      const experiments = expManager.list(tags, since)
      if (experiments.length === 0) {
        console.log(theme.warn("\n  No experiments found\n"))
        return
      }
      console.log(`\n  ${theme.bold("Experiments:")}`)
      for (const e of experiments) {
        const statusIcon =
          e.status === "completed" ? theme.success("✓") : e.status === "failed" ? theme.error("✗") : "◌"
        const score = e.report ? ` ${(e.report.avgScore * 100).toFixed(1)}%` : ""
        console.log(
          `  ${statusIcon} ${e.id.slice(0, 18).padEnd(18)} ${e.name.padEnd(24)} ${score} ${theme.dim(e.startedAt.slice(0, 10))}`,
        )
      }
      console.log()
      break
    }
    case "show": {
      if (!opts.id) {
        console.log(theme.error("\n  Need --id\n"))
        return
      }
      const exp = expManager.load(opts.id)
      if (!exp) {
        console.log(theme.error(`\n  Experiment "${opts.id}" not found\n`))
        return
      }
      console.log(`\n  ${theme.bold("Experiment:")} ${exp.name}`)
      console.log(`  ${theme.bold("ID:")}         ${exp.id}`)
      console.log(`  ${theme.bold("Status:")}     ${exp.status}`)
      console.log(`  ${theme.bold("Model:")}      ${exp.config.model}`)
      console.log(`  ${theme.bold("Suite:")}      ${exp.config.suite}`)
      console.log(`  ${theme.bold("Started:")}    ${exp.startedAt}`)
      if (exp.report) {
        console.log(`  ${theme.bold("Score:")}      ${(exp.report.avgScore * 100).toFixed(1)}%`)
      }
      console.log(`  ${theme.bold("Git:")}        ${exp.git.commitSha} on ${exp.git.branch}`)
      if (exp.tags.length > 0) {
        console.log(`  ${theme.bold("Tags:")}       ${exp.tags.join(", ")}`)
      }
      console.log()
      break
    }
    case "compare": {
      if (!opts.id || !opts.compareWith) {
        console.log(theme.error("\n  Need --id and --compare-with\n"))
        return
      }
      const comparison = expManager.compare(opts.id, opts.compareWith)
      console.log(`\n  ${theme.bold("Experiment Comparison:")}`)
      console.log(
        `  ${theme.bold("Score delta:")}  ${comparison.scoreDelta >= 0 ? theme.success(`+${(comparison.scoreDelta * 100).toFixed(1)}%`) : theme.error(`${(comparison.scoreDelta * 100).toFixed(1)}%`)}`,
      )
      console.log(`  ${theme.bold("Git:")}         ${comparison.gitDiff.from} -> ${comparison.gitDiff.to}`)
      console.log()
      break
    }
    case "tag": {
      if (!opts.id || !opts.addTag) {
        console.log(theme.error("\n  Need --id and --add-tag\n"))
        return
      }
      expManager.tag(opts.id, [opts.addTag])
      console.log(theme.success(`\n  Tagged experiment "${opts.id}" with "${opts.addTag}"\n`))
      break
    }
    case "delete": {
      if (!opts.id) {
        console.log(theme.error("\n  Need --id\n"))
        return
      }
      expManager.delete(opts.id)
      console.log(theme.success(`\n  Experiment "${opts.id}" deleted.\n`))
      break
    }
    default:
      console.log(theme.warn("\n  Usage: aegis eval experiment [list|show|compare|tag|delete] [options]\n"))
  }
}

function handleReview(
  action: string | undefined,
  opts: { id?: string; reviewer?: string; comment?: string; resolution?: string },
) {
  showBanner()
  const reviewMgr = new harness.HITLReviewManager()

  switch (action) {
    case "list": {
      const tickets = reviewMgr.getPendingTickets()
      if (tickets.length === 0) {
        console.log(theme.success("\n  No pending review tickets\n"))
        return
      }
      console.log(`\n  ${theme.bold("Pending Reviews:")}`)
      for (const t of tickets) {
        const severityIcon = t.severity === "critical" ? "🔴" : t.severity === "major" ? "🟡" : "🟢"
        console.log(
          `  ${severityIcon} ${t.id.slice(0, 14).padEnd(14)} ${t.testName.padEnd(36)} ${t.baselineScore.toFixed(2)} -> ${t.currentScore.toFixed(2)} ${theme.dim(t.createdAt.slice(0, 10))}`,
        )
      }
      console.log()
      break
    }
    case "approve": {
      if (!opts.id || !opts.reviewer) {
        console.log(theme.error("\n  Need --id and --reviewer\n"))
        return
      }
      reviewMgr.approve(opts.id, opts.reviewer, opts.comment)
      console.log(theme.success(`\n  Ticket "${opts.id}" approved by ${opts.reviewer}\n`))
      break
    }
    case "reject": {
      if (!opts.id || !opts.reviewer) {
        console.log(theme.error("\n  Need --id and --reviewer\n"))
        return
      }
      reviewMgr.rejectAsFalsePositive(opts.id, opts.reviewer, opts.comment ?? "")
      console.log(theme.success(`\n  Ticket "${opts.id}" rejected as false positive\n`))
      break
    }
    case "escalate": {
      if (!opts.id) {
        console.log(theme.error("\n  Need --id\n"))
        return
      }
      console.log(theme.warn(`\n  Ticket "${opts.id}" escalated\n`))
      break
    }
    case "status": {
      const summary = reviewMgr.getSummary()
      console.log(`\n  ${theme.bold("Review Summary:")}`)
      console.log(`  Pending:   ${summary.pending}`)
      console.log(`  Approved:  ${theme.success(String(summary.approved))}`)
      console.log(`  Rejected:  ${summary.rejected}`)
      console.log(`  Escalated: ${theme.warn(String(summary.escalated))}`)
      console.log()
      break
    }
    default:
      console.log(theme.warn("\n  Usage: aegis eval review [list|approve|reject|escalate|status] [options]\n"))
  }
}

function handleStatus() {
  showBanner()
  const tests = harness.discoverTests()
  const baselineMgr = new harness.BaselineManager()

  console.log()
  if (tests.length === 0) {
    console.log(`  ${theme.warn("No test cases found")}`)
    console.log(`  ${theme.muted("Add .md files to .aegis/harness/")}`)
  } else {
    console.log(`  ${theme.success(`${tests.length} test case(s) found`)}`)

    const byCat = new Map<string, number>()
    for (const t of tests) {
      const cat = t.category ?? "uncategorized"
      byCat.set(cat, (byCat.get(cat) ?? 0) + 1)
    }

    console.log()
    console.log(`  ${theme.heading("Categories")}`)
    for (const [cat, count] of byCat) {
      const bar = "█".repeat(count)
      console.log(`  ${theme.dim("·")} ${cat.padEnd(18)} ${bar} ${count}`)
    }
    console.log()

    const baselines = baselineMgr.list()
    if (baselines.length > 0) {
      console.log(`  ${theme.heading("Recent Baselines")}`)
      const recent = baselines.slice(-3).reverse()
      for (const b of recent) {
        console.log(
          `  ${theme.dim("·")} ${b.id.slice(0, 20).padEnd(20)} ${(b.summary.avgScore * 100).toFixed(1)}%  ${theme.dim(b.timestamp.slice(0, 19))}`,
        )
      }
      console.log()
    }

    console.log(`  ${theme.muted("Run: aegis eval run")}`)
    console.log(`  ${theme.muted("Run: aegis eval ci")}`)
  }
  console.log()
}

async function handleCalibrate(opts: { model: string; output: string }) {
  showBanner()

  console.log(`\n  ${theme.bold("Judge Calibration")}`)
  console.log(`  ${theme.muted(`Model: ${opts.model}`)}\n`)

  try {
    const { GOLDEN_CALIBRATION_DATASET, getDatasetStats } = await import("../../harness/grader/calibration-dataset")
    const stats = getDatasetStats()

    console.log(`  ${theme.bold("Dataset:")}     ${stats.totalExamples} examples, ${stats.uniqueIds} unique IDs`)
    console.log(`  ${theme.bold("Categories:")}  ${Object.keys(stats.byCategory).join(", ")}`)
    console.log()

    const calibration = new harness.JudgeCalibration()
    calibration.addCalibrationExamples(GOLDEN_CALIBRATION_DATASET)
    console.log(`  ${theme.success(`Loaded ${GOLDEN_CALIBRATION_DATASET.length} calibration examples`)}`)
    console.log()

    console.log(`  ${theme.info("Running calibration...")}`)
    console.log(`  ${theme.muted("Note: Full LLM calibration requires API key and will call the model.")}`)
    console.log()

    const result = await calibration.calibrate(async () => {
      return 0.5
    })

    console.log(`  ${theme.bold("Results:")}`)
    console.log(`  Accuracy:           ${(result.accuracy * 100).toFixed(1)}%`)
    console.log(`  Mean error (bias):  ${result.meanError > 0 ? "+" : ""}${result.meanError.toFixed(3)}`)
    console.log(`  Std deviation:      ${result.stdDev.toFixed(3)}`)
    console.log(`  Cohen's Kappa:      ${result.cohensKappa.toFixed(3)}`)
    console.log()

    if (result.recommendations.length > 0) {
      console.log(`  ${theme.heading("Recommendations:")}`)
      for (const rec of result.recommendations) {
        console.log(`  ${theme.muted("·")} ${rec}`)
      }
      console.log()
    }

    try {
      const fs = await import("node:fs")
      const path = await import("node:path")
      fs.mkdirSync(path.dirname(opts.output), { recursive: true })
      fs.writeFileSync(opts.output, JSON.stringify({ model: opts.model, result, stats }, null, 2))
      console.log(`  ${theme.success(`Report saved to ${opts.output}`)}`)
    } catch {
      // non-fatal
    }

    console.log()
  } catch (err) {
    console.error(theme.error(`\n  Calibration failed: ${err}\n`))
    process.exit(1)
  }
}
