/**
 * cli/commands/bench — `aegis bench` CLI.
 *
 * Subcommands per plan §3.5:
 *   list              show tasks + last score
 *   run [task-id]     run one or all tasks
 *   history           show score trend table
 *   baseline          snapshot current scores as baseline
 *   providers         run a task against all configured AI providers
 */

import type { Command } from "commander"
import { theme } from "../theme"
import {
  discoverBenchTasks,
  getBenchTask,
  runBenchSuite,
  loadHistory,
  appendRun,
  getLatestScores,
  ProviderBenchmark,
} from "../../bench"
import { listProviders } from "../../ai/providers"

export function registerBench(program: Command) {
  const bench = program
    .command("bench")
    .description("North-star agent benchmark suite")

  bench
    .command("list")
    .description("List bench tasks with latest scores")
    .action(handleList)

  bench
    .command("run [taskId]")
    .description("Run one or all bench tasks")
    .option("--no-ratchet", "Disable git ratchet for this run")
    .action(handleRun)

  bench
    .command("history")
    .description("Show bench run history (most recent 10)")
    .action(handleHistory)

  bench
    .command("baseline")
    .description("Print the latest scores (use for regression baseline)")
    .action(handleBaseline)

  bench
    .command("providers")
    .description("Run a task against all configured AI providers and compare latency/cost")
    .argument("[task]", "Task prompt to send to each provider")
    .option("--model <model>", "Override model for all providers")
    .option("--provider <name>", "Only test specific provider (repeatable)", collectProviders, [])
    .option("--timeout <ms>", "Per-provider timeout in milliseconds", "60000")
    .option("--json", "Output as JSON")
    .action(handleProviders)
}

function collectProviders(value: string, acc: string[]): string[] {
  acc.push(value)
  return acc
}

function handleList() {
  const tasks = discoverBenchTasks()
  const scores = getLatestScores()

  console.log(theme.info(`\n  Bench Tasks (${tasks.length})\n`))
  for (const t of tasks) {
    const score = scores.get(t.id)
    const scoreStr = score !== undefined ? `${Math.round(score * 100)}%` : "—"
    const criteria = t.criteria.join(", ")
    console.log(
      `  ${t.id.padEnd(34)} ${scoreStr.padStart(5)}  ${t.name}  [${criteria}]`,
    )
  }
  console.log()
}

async function handleRun(
  taskId: string | undefined,
  opts: { ratchet: boolean },
) {
  const tasks = taskId
    ? [getBenchTask(taskId)].filter((t): t is NonNullable<typeof t> => Boolean(t))
    : discoverBenchTasks()

  if (tasks.length === 0) {
    console.log(
      theme.warn("\n  No bench tasks found. Add .json files to .aegis/bench/\n"),
    )
    return
  }

  console.log(theme.info(`\n  Running ${tasks.length} bench task(s)...\n`))

  const record = await runBenchSuite(tasks, {
    ratchet: opts.ratchet,
    onProgress: (msg) => console.log(theme.muted(`  ${msg}`)),
  })

  appendRun(record)

  const pct = Math.round(record.aggregate.avgScore * 100)
  console.log(
    theme.success(
      `\n  Bench complete: ${record.aggregate.passed}/${record.aggregate.total} passed (avg ${pct}%)\n`,
    ),
  )
}

function handleHistory() {
  const hist = loadHistory()
  console.log(theme.info(`\n  Bench History (${hist.runs.length} runs)\n`))
  for (const run of hist.runs.slice(-10)) {
    const pct = Math.round(run.aggregate.avgScore * 100)
    console.log(
      `  ${run.timestamp.slice(0, 19).replace("T", " ")}  ${run.aggregate.passed}/${run.aggregate.total}  avg ${pct}%  ${run.runId}`,
    )
  }
  console.log()
}

function handleBaseline() {
  const scores = getLatestScores()
  if (scores.size === 0) {
    console.log(theme.warn("\n  No scores yet — run `aegis bench run` first.\n"))
    return
  }
  console.log(theme.info(`\n  Latest scores (${scores.size} tasks)\n`))
  for (const [id, score] of scores) {
    console.log(`  ${id.padEnd(34)} ${(score * 100).toFixed(0)}%`)
  }
  console.log()
}

async function handleProviders(
  task: string | undefined,
  opts: { model?: string; provider: string[]; timeout: string; json?: boolean },
) {
  const prompt = task ?? "Write a short poem about artificial intelligence."
  const timeoutMs = parseInt(opts.timeout, 10) || 60000
  const bm = new ProviderBenchmark()

  const modelPerProvider: Record<string, string> | undefined = opts.model
    ? Object.fromEntries(listProviders().map((p) => [p, opts.model!]))
    : undefined

  const providers = opts.provider.length > 0 ? opts.provider : undefined

  console.log(theme.info(`\n  Running provider benchmark: "${prompt.slice(0, 60)}${prompt.length > 60 ? "..." : ""}"\n`))

  const start = Date.now()
  const report = await bm.runAgainstAllProviders(prompt, { providers, timeoutMs, modelPerProvider })
  const totalElapsed = Date.now() - start

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2))
    return
  }

  const header = `  ${"Provider".padEnd(20)} ${"Model".padEnd(22)} ${"Status".padEnd(8)} ${"Duration".padEnd(10)} ${"Output".padEnd(8)} ${"Cost".padEnd(10)}`
  console.log(theme.info(header))
  console.log(theme.dim(`  ${"─".repeat(78)}`))

  for (const r of report.results) {
    const status = r.success ? theme.success("✅") : theme.error("❌")
    const duration = r.success ? `${(r.durationMs / 1000).toFixed(1)}s` : "—"
    const output = r.success ? `${r.outputLength}` : "—"
    const cost = r.costUsd !== undefined ? `$${r.costUsd.toFixed(6)}` : "—"
    const errSuffix = r.error ? ` ${theme.dim(`(${r.error})`)}` : ""
    console.log(
      `  ${r.provider.padEnd(20)} ${r.model.padEnd(22)} ${status}${" ".repeat(5)} ${duration.padEnd(8)} ${output.padEnd(8)} ${cost.padEnd(10)}${errSuffix}`,
    )
  }

  console.log(theme.dim(`  ${"─".repeat(78)}`))

  if (report.fastest) {
    console.log(theme.success(`\n  Fastest  → ${report.fastest.provider} (${(report.fastest.durationMs / 1000).toFixed(1)}s)`))
  }
  if (report.cheapest && report.cheapest.costUsd !== undefined) {
    console.log(theme.success(`  Cheapest → ${report.cheapest.provider} ($${report.cheapest.costUsd.toFixed(6)})`))
  }

  const totalProviders = report.results.length
  const configured = report.results.filter((r) => r.success || (r.error && r.error !== "No API key configured"))
  const skipped = report.results.filter((r) => r.error === "No API key configured").length
  const passed = report.results.filter((r) => r.success).length
  const failed = configured.length - passed

  console.log(theme.dim(`\n  ${totalProviders} providers total, ${skipped} skipped (no key), ${passed} passed, ${failed} failed`))
  console.log(theme.dim(`  Total benchmark time: ${(totalElapsed / 1000).toFixed(1)}s\n`))
}
