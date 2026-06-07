import type { Command } from "commander"
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { parse } from "yaml"
import { loadFindings, loadRecentFindings, storeFindings } from "../../adversarial/findings-store"
import { runAdversarial, getDefaultAdversarialConfig } from "../../adversarial/orchestrator"
import { ratchetFindings } from "../../adversarial/ratchet"
import { runTest } from "../../harness/runner"
import { createLogger } from "../logger"

const log = createLogger("adversarial-cli")
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

function discoverEvalTasks(category?: string): EvalTaskYaml[] {
  const tasks: EvalTaskYaml[] = []
  const categories = category
    ? [category]
    : readdirSync(EVALS_DIR).filter((d) => {
        const full = resolve(EVALS_DIR, d)
        try {
          return readdirSync(full).some((f) => f.endsWith(".yaml"))
        } catch {
          return false
        }
      })

  for (const cat of categories) {
    const catDir = resolve(EVALS_DIR, cat)
    if (!existsSync(catDir)) continue
    const files = readdirSync(catDir).filter((f) => f.endsWith(".yaml"))
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

export function registerAdversarial(program: Command): void {
  const adversarial = program.command("adversarial").alias("adv").description("Red-team adversarial self-play")

  adversarial
    .command("enable")
    .description("Enable adversarial self-play in config")
    .action(() => {
      console.log("Set `adversarial.enabled: true` in Aegis config to enable.")
      console.log("Or run: aegis config set adversarial.enabled true")
    })

  adversarial
    .command("disable")
    .description("Disable adversarial self-play in config")
    .action(() => {
      console.log("Set `adversarial.enabled: false` in Aegis config to disable.")
      console.log("Or run: aegis config set adversarial.enabled false")
    })

  adversarial
    .command("status")
    .description("Show recent adversarial findings summary")
    .action(() => {
      const recent = loadRecentFindings(7)
      const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 }
      for (const f of recent) {
        const key = f.severity as keyof typeof bySeverity
        bySeverity[key]++
      }
      console.log(`Recent findings (7d): ${recent.length} total`)
      console.log(`  Critical: ${bySeverity.critical}`)
      console.log(`  High:     ${bySeverity.high}`)
      console.log(`  Medium:   ${bySeverity.medium}`)
      console.log(`  Low:      ${bySeverity.low}`)
    })

  adversarial
    .command("run")
    .description("Run adversarial evals against tasks")
    .option("--all", "Run against all eval task files")
    .option("--json", "Output results as JSON for CI consumption")
    .option("--category <name>", "Filter by task category (coding, debugging, etc.)")
    .option("--mutation <type>", "Mutation type (strip-precondition, flip-boolean, inject-malicious, etc.)")
    .action(handleRun)

  adversarial
    .command("findings")
    .description("List adversarial findings")
    .option("--since <days>", "Filter by recency (days)", "7")
    .option("--severity <level>", "Filter by minimum severity (low|medium|high|critical)")
    .option("--task <id>", "Filter by task ID")
    .action((opts: { since?: string; severity?: string; task?: string }) => {
      const since = opts.since ? parseInt(opts.since, 10) : undefined
      const findings = opts.task ? loadFindings(opts.task, since) : loadRecentFindings(since, opts.severity)

      if (findings.length === 0) {
        console.log("No findings.")
        return
      }

      for (const f of findings) {
        const tag = f.ratcheted ? " [RATCHETED]" : ""
        console.log(`  ${f.severity.padEnd(8)} ${f.finding_type.padEnd(14)} ${f.id}${tag}`)
        console.log(`    ${f.description.slice(0, 120)}`)
        if (f.ratchet_case_path) console.log(`    -> ${f.ratchet_case_path}`)
        console.log()
      }
    })

  adversarial
    .command("ratchet")
    .description("Manage ratcheted regression cases")
    .argument("[action]", "list | revert <finding_id>", "list")
    .argument("[findingId]", "Finding ID to revert")
    .option("--all", "Rachet all unratcheted findings")
    .action((action: string, findingId?: string, opts?: { all?: boolean }) => {
      if (opts?.all) {
        const all = loadRecentFindings(365)
        const unratcheted = all.filter((f) => !f.ratcheted)
        if (unratcheted.length === 0) {
          console.log("No unratcheted findings to ratchet.")
          return
        }
        ratchetFindings(unratcheted).then((ratcheted) => {
          console.log(`Ratcheted ${ratcheted.length} findings.`)
        })
        return
      }
      if (action === "list") {
        const all = loadRecentFindings(365)
        const ratcheted = all.filter((f) => f.ratcheted)
        if (ratcheted.length === 0) {
          console.log("No ratcheted findings.")
          return
        }
        console.log(`Ratcheted findings (${ratcheted.length}):`)
        for (const f of ratcheted) {
          const path = f.ratchet_case_path ?? "?"
          console.log(`  ${f.id} -> ${path} (${f.severity})`)
        }
      } else if (action === "revert" && findingId) {
        console.log(`Reverted finding ${findingId} (mark ratcheted=false)`)
      } else {
        console.log("Usage: aegis adversarial ratchet list")
        console.log("       aegis adversarial ratchet revert <finding_id>")
        console.log("       aegis adversarial ratchet --all")
      }
    })
}

async function handleRun(opts: { all?: boolean; json?: boolean; category?: string; mutation?: string }) {
  if (!opts.all && !opts.category) {
    if (opts.json) {
      console.log(JSON.stringify({ error: "Use --all or --category to specify target tasks", results: [] }))
    } else {
      console.log("Use --all or --category to specify target tasks.")
    }
    return
  }

  const tasks = discoverEvalTasks(opts.category)
  if (tasks.length === 0) {
    if (opts.json) {
      console.log(JSON.stringify({ error: "No tasks found", results: [] }))
    } else {
      console.log("No eval tasks found.")
    }
    return
  }

  if (!opts.json) {
    console.log(`Running adversarial evals on ${tasks.length} task(s)...\n`)
  }

  const allFindings: Record<string, unknown>[] = []
  let totalFailed = 0

  for (const task of tasks) {
    const sessionId = `adv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

    if (!opts.json) process.stdout.write(`  ${task.id} ... `)

    try {
      const result = await runTest({
        id: task.id,
        name: task.id,
        prompt: task.input,
        tags: [task.category],
        timeout: task.timeout_ms ?? 120000,
      })

      const config = getDefaultAdversarialConfig()

      const findings = await runAdversarial({
        taskId: task.id,
        sessionId,
        taskDescription: task.description ?? task.id,
        result: result.output ?? task.input,
        config,
      })

      if (findings.length > 0) {
        storeFindings(task.id, findings)
        allFindings.push({
          taskId: task.id,
          category: task.category,
          findings: findings.map((f) => ({
            id: f.id,
            finding_type: f.finding_type,
            severity: f.severity,
            description: f.description.slice(0, 200),
          })),
          passed: result.passed,
        })
        if (!result.passed) totalFailed++
      }

      if (!opts.json) {
        const status = findings.length > 0 ? `${findings.length} finding(s)` : "clean"
        console.log(status)
      }
    } catch (err) {
      allFindings.push({
        taskId: task.id,
        category: task.category,
        error: String(err),
        passed: false,
      })
      totalFailed++
      if (!opts.json) console.log(`error: ${err}`)
    }
  }

  if (!opts.json) {
    console.log(
      `\nDone. ${tasks.length - totalFailed}/${tasks.length} passed. ${allFindings.length} tasks had findings.`,
    )
    return
  }

  const output: Record<string, unknown> = {
    total: tasks.length,
    failed: totalFailed,
    newRegressions: allFindings.filter(
      (f) => f.findings && Array.isArray(f.findings) && (f.findings as unknown[]).length > 0,
    ).length,
    results: allFindings,
    ts: Date.now(),
  }
  console.log(JSON.stringify(output))
}
