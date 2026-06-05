/**
 * cli/commands/bench — `aegis bench` CLI.
 *
 * Subcommands per plan §3.5:
 *   list              show tasks + last score
 *   run [task-id]     run one or all tasks
 *   history           show score trend table
 *   baseline          snapshot current scores as baseline
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
} from "../../bench"

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
