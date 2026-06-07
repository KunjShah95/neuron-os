import type { Command } from "commander"
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { parse } from "yaml"
import { theme } from "../theme"
import { showBanner } from "../banner"
import { runTest } from "../../harness/runner"
import { BenchmarkBaselineManager, type BenchmarkScore, type BenchmarkBaseline } from "../../bench/baseline"
import { createLogger } from "../logger"

const log = createLogger("benchmark")

const EVALS_DIR = resolve(process.cwd(), "evals/tasks")

interface EvalTaskYaml {
  id: string
  category: string
  description?: string
  input: string
  expected_files?: string[]
  verification?: { command: string; expect_exit_code: number }[]
  timeout_ms?: number
  judge_prompt?: string
}

export function registerBenchmark(program: Command) {
  const bm = program
    .command("benchmark")
    .description("Adversarial eval benchmark — track regression over time")

  bm
    .command("run [task-path]")
    .description("Run eval tasks and compare vs baseline")
    .option("--category <name>", "Filter by category (coding, debugging, etc.)")
    .option("--update-baseline", "Accept current results as new baseline")
    .option("--threshold <pct>", "Fail if regression > X%", "10")
    .option("--json", "Output as JSON for CI consumption")
    .action(handleRun)

  bm
    .command("status")
    .description("Show last benchmark run, score, drift")
    .action(handleStatus)

  bm
    .command("baseline")
    .description("Show current baseline scores")
    .option("--set <file>", "Import a baseline from JSON file")
    .action(handleBaseline)
}

function discoverEvalTasks(taskPath?: string, category?: string): EvalTaskYaml[] {
  if (taskPath) {
    const fullPath = resolve(process.cwd(), taskPath)
    if (!existsSync(fullPath)) {
      return []
    }
    const raw = readFileSync(fullPath, "utf-8")
    const task = parse(raw) as EvalTaskYaml
    if (!task.id) {
      return []
    }
    return [task]
  }

  const tasks: EvalTaskYaml[] = []
  const categories = category ? [category] : readdirSync(EVALS_DIR).filter((d) => {
    const full = resolve(EVALS_DIR, d)
    try { return readdirSync(full).some(f => f.endsWith(".yaml")) } catch { return false }
  })

  for (const cat of categories) {
    const catDir = resolve(EVALS_DIR, cat)
    if (!existsSync(catDir)) continue
    const files = readdirSync(catDir).filter(f => f.endsWith(".yaml"))
    for (const file of files) {
      try {
        const raw = readFileSync(resolve(catDir, file), "utf-8")
        const task = parse(raw) as EvalTaskYaml
        if (task?.id) tasks.push(task)
      } catch (err) {
        log.warn(`Skipping ${cat}/${file}: ${err}`)
      }
    }
  }
  return tasks
}

function estimateCostUsd(durationMs: number): number {
  return Math.round((durationMs / 1000) * 0.003 * 1000) / 1000
}

async function handleRun(
  taskPath: string | undefined,
  opts: { category?: string; updateBaseline?: boolean; threshold?: string; json?: boolean },
) {
  if (!opts.json) showBanner()

  const threshold = parseFloat(opts.threshold ?? "10")
  const manager = new BenchmarkBaselineManager()
  const tasks = discoverEvalTasks(taskPath, opts.category)

  if (tasks.length === 0) {
    if (opts.json) {
      console.log(JSON.stringify({ error: "No tasks found", results: [] }))
    } else {
      console.log(theme.warn("\n  No eval tasks found.\n"))
    }
    return
  }

  if (!opts.json) {
    console.log(theme.heading(`\n  Running ${tasks.length} eval task(s)...\n`))
  }

  const scores: BenchmarkScore[] = []
  for (const task of tasks) {
    const start = Date.now()
    if (!opts.json) process.stdout.write(`  ${task.id} ... `)
    try {
      const result = await runTest({
        id: task.id,
        name: task.id,
        prompt: task.input,
        tags: [task.category],
        timeout: task.timeout_ms ?? 120000,
      })

      const durationMs = Date.now() - start
      const costUsd = estimateCostUsd(durationMs)

      scores.push({
        taskId: task.id,
        category: task.category,
        name: task.description ?? task.id,
        passed: result.passed,
        durationMs,
        costUsd,
        timestamp: Date.now(),
        agentType: "harness",
      })

      if (!opts.json) {
        console.log(result.passed ? theme.success("passed") : theme.error("failed"))
      }
    } catch {
      const durationMs = Date.now() - start
      scores.push({
        taskId: task.id,
        category: task.category,
        name: task.description ?? task.id,
        passed: false,
        durationMs,
        costUsd: estimateCostUsd(durationMs),
        timestamp: Date.now(),
        agentType: "harness",
      })
      if (!opts.json) console.log(theme.error("error"))
    }
  }

  const passed = scores.filter(s => s.passed).length
  const total = scores.length
  const totalCost = scores.reduce((s, sc) => s + sc.costUsd, 0)

  const report = manager.compare(scores, threshold)

  if (!opts.json) {
    console.log(theme.heading(`\n  Results: ${passed}/${total} passed ($${totalCost.toFixed(3)})\n`))

    if (report.regressions > 0) {
      console.log(theme.warn(`  Regressions detected: ${report.regressions}\n`))
      for (const reg of report.regressionsList.filter(r => r.regressed)) {
        const from = reg.previousPassed ? "✅" : "❌"
        const to = reg.currentPassed ? "✅" : "❌"
        console.log(`  ${reg.taskId}: ${from} → ${to}`)
        if (reg.previousPassed && reg.currentPassed) {
          const durDelta = ((reg.currentDurationMs - reg.previousDurationMs) / reg.previousDurationMs * 100).toFixed(1)
          const costDelta = ((reg.currentCostUsd - reg.previousCostUsd) / reg.previousCostUsd * 100).toFixed(1)
          console.log(`    duration: ${durDelta}%  cost: ${costDelta}%`)
        }
      }
      console.log()
    } else if (report.regressionsList.length > 0) {
      console.log(theme.success("  No regressions detected.\n"))
    }

    if (opts.updateBaseline) {
      const baseline: BenchmarkBaseline = {
        scores: Object.fromEntries(scores.map(s => [s.taskId, s])),
        createdAt: manager.load().createdAt || Date.now(),
        updatedAt: Date.now(),
        version: "1",
      }
      manager.save(baseline)
      console.log(theme.success("  Baseline updated.\n"))
    }

    if (!report.passedThreshold) {
      process.exitCode = 1
    }
  }

  if (opts.json) {
    const output: Record<string, unknown> = {
      summary: { passed, total, totalCost, regressions: report.regressions, threshold },
      results: scores,
      regressions: report.regressionsList.filter(r => r.regressed),
      passedThreshold: report.passedThreshold,
    }
    if (opts.updateBaseline) {
      const baseline: BenchmarkBaseline = {
        scores: Object.fromEntries(scores.map(s => [s.taskId, s])),
        createdAt: manager.load().createdAt || Date.now(),
        updatedAt: Date.now(),
        version: "1",
      }
      manager.save(baseline)
      output.baselineUpdated = true
    }
    console.log(JSON.stringify(output))
    if (!report.passedThreshold) process.exitCode = 1
  }
}

async function handleStatus() {
  showBanner()
  const manager = new BenchmarkBaselineManager()
  const baseline = manager.load()
  const scoreCount = Object.keys(baseline.scores).length

  if (scoreCount === 0) {
    console.log(theme.dim("\n  No baseline recorded yet. Run `aegis benchmark run --update-baseline` first.\n"))
    return
  }

  const scores = Object.values(baseline.scores)
  const passed = scores.filter(s => s.passed).length
  const totalCost = scores.reduce((s, sc) => s + sc.costUsd, 0)
  const avgDuration = scores.reduce((s, sc) => s + sc.durationMs, 0) / scores.length

  console.log(theme.heading("\n  Benchmark Baseline Status\n"))
  console.log(`  Last updated: ${new Date(baseline.updatedAt).toISOString()}`)
  console.log(`  Total tasks:  ${scoreCount}`)
  console.log(`  Passed:       ${theme.success(String(passed))}`)
  console.log(`  Failed:       ${theme.error(String(scoreCount - passed))}`)
  console.log(`  Pass rate:    ${(passed / scoreCount * 100).toFixed(1)}%`)
  console.log(`  Total cost:   $${totalCost.toFixed(3)}`)
  console.log(`  Avg duration: ${Math.round(avgDuration)}ms`)
  console.log()
}

async function handleBaseline(opts: { set?: string }) {
  showBanner()
  const manager = new BenchmarkBaselineManager()

  if (opts.set) {
    const imported = manager.importFromFile(opts.set)
    manager.save(imported)
    console.log(theme.success(`\n  Baseline imported from ${opts.set} (${Object.keys(imported.scores).length} scores)\n`))
    return
  }

  const baseline = manager.load()
  const scores = Object.values(baseline.scores)

  if (scores.length === 0) {
    console.log(theme.dim("\n  No baseline scores yet.\n"))
    return
  }

  const byCategory = new Map<string, BenchmarkScore[]>()
  for (const s of scores) {
    const list = byCategory.get(s.category) ?? []
    list.push(s)
    byCategory.set(s.category, list)
  }

  console.log(theme.heading(`\n  Baseline Scores (${scores.length} tasks)\n`))
  for (const [cat, items] of byCategory) {
    const passed = items.filter(s => s.passed).length
    console.log(`  ${theme.bold(cat)} (${passed}/${items.length})`)
    for (const s of items) {
      const icon = s.passed ? theme.success("✓") : theme.error("✗")
      const time = (s.durationMs / 1000).toFixed(1)
      console.log(`    ${icon} ${s.taskId.padEnd(20)} ${time}s  $${s.costUsd.toFixed(3)}`)
    }
    console.log()
  }
}
