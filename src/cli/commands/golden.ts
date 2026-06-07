/**
 * src/cli/commands/golden.ts
 *
 * aegis eval golden — Manage the golden dataset lifecycle.
 *   - create    Create a new Silver-grade task
 *   - list      List tasks by status
 *   - promote   Promote Silver→Gold (human verification)
 *   - audit     Run cross-model validation on Gold tasks
 *   - stats     Show golden dataset statistics
 */

import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"

export function registerGolden(program: Command) {
  const evalCmd =
    program.commands.find((c) => c.name() === "eval") ??
    program.command("eval").description("Agent evaluation pipeline")

  const golden = evalCmd.command("golden").description("Manage golden dataset (Silver→Gold→Audit pipeline)")

  golden
    .command("create")
    .description("Create a new Silver-grade golden task")
    .option("--name <name>", "Task name")
    .option("--prompt <text>", "Task prompt")
    .option(
      "--category <cat>",
      "Test category (smoke, regression, capability, adversarial, benchmark, golden)",
      "capability",
    )
    .option("--difficulty <level>", "Difficulty (easy, medium, hard, expert)", "medium")
    .option("--author <name>", "Task author")
    .option("--expected <pattern>", "Expected output pattern")
    .action(handleGoldenCreate)

  golden
    .command("list")
    .description("List golden tasks by status")
    .option("--status <status>", "Filter by status (silver, gold, audited, archived)")
    .option("--category <cat>", "Filter by category")
    .option("--limit <n>", "Max tasks to show", "20")
    .action(handleGoldenList)

  golden
    .command("promote <id>")
    .description("Promote a Silver task to Gold (human verification)")
    .option("--verifier <name>", "Verifier name", "cli-user")
    .option("--quality <n>", "Quality score 1-5", "4")
    .option("--notes <text>", "Review notes")
    .action(handleGoldenPromote)

  golden
    .command("audit")
    .description("Run cross-model validation on all Gold tasks ready for audit")
    .option("--dry-run", "Show which tasks would be audited without running")
    .action(handleGoldenAudit)

  golden.command("archive <id>").description("Archive a golden task").action(handleGoldenArchive)

  golden
    .command("stats")
    .description("Show golden dataset statistics (total, by status, by category, audit pass rate)")
    .action(handleGoldenStats)
}

// ── Handlers ──────────────────────────────────────────────────────

async function handleGoldenCreate(opts: {
  name?: string
  prompt?: string
  category?: string
  difficulty?: string
  author?: string
  expected?: string
}) {
  showBanner()
  const { goldenDatasetManager } = await import("../../harness/golden-dataset")

  const name = opts.name
  const prompt = opts.prompt
  const author = opts.author
  const category = (opts.category ?? "capability") as
    | "smoke"
    | "regression"
    | "capability"
    | "adversarial"
    | "benchmark"
    | "golden"
  const difficulty = (opts.difficulty ?? "medium") as "easy" | "medium" | "hard" | "expert"

  if (!name || !prompt || !author) {
    console.log(theme.error("\n  Name, prompt, and author are required. Use --name, --prompt, and --author flags.\n"))
    return
  }

  const task = goldenDatasetManager.createSilverTask({
    name,
    prompt,
    category,
    priority: category === "golden" ? "critical" : ("high" as "critical" | "high" | "medium" | "low"),
    difficulty,
    author,
    expectedPattern: opts.expected,
  })

  console.log(theme.success(`\n  ✓ Created Silver task: ${task.name}\n`))
  console.log(`  ID:       ${theme.bold(task.id)}`)
  console.log(`  Category: ${task.category}`)
  console.log(`  Status:   ${theme.warn(task.goldenStatus)}`)
  console.log(`  Path:     ${theme.dim(`evals/golden/${task.goldenStatus}/${task.id}.json`)}`)
  console.log()
}

async function handleGoldenList(opts: { status?: string; category?: string; limit?: string }) {
  showBanner()
  const { goldenDatasetManager } = await import("../../harness/golden-dataset")

  const status = opts.status as "silver" | "gold" | "audited" | "archived" | undefined
  const limit = parseInt(opts.limit ?? "20", 10) || 20

  let tasks = status ? goldenDatasetManager.getTasks(status) : goldenDatasetManager.getTasks()

  if (opts.category) {
    tasks = tasks.filter((t) => t.category === opts.category)
  }

  tasks = tasks.slice(0, limit)

  if (tasks.length === 0) {
    console.log(theme.warn(`\n  No tasks found${status ? ` with status "${status}"` : ""}.\n`))
    return
  }

  console.log(theme.heading(`\n  📋 Golden Tasks (${tasks.length})\n`))

  for (const t of tasks) {
    const statusColor =
      t.goldenStatus === "audited"
        ? theme.success
        : t.goldenStatus === "gold"
          ? theme.info
          : t.goldenStatus === "archived"
            ? theme.dim
            : theme.warn
    const qual = t.goldenQualityScore ? `  Q: ${t.goldenQualityScore.toFixed(1)}` : ""
    const cv =
      t.crossValidation.length > 0
        ? `  CV: ${t.crossValidation.filter((c) => c.passed).length}/${t.crossValidation.length}`
        : ""
    console.log(
      `  ${statusColor(t.goldenStatus.toUpperCase().padEnd(8))} ${theme.bold(t.name.padEnd(36))} ${t.goldenDifficulty.padEnd(6)}${qual}${cv}`,
    )
    console.log(`     ${theme.dim(t.id)}  ${t.category}`)
    console.log()
  }
}

async function handleGoldenPromote(
  id: string,
  opts: {
    verifier?: string
    quality?: string
    notes?: string
  },
) {
  showBanner()
  const { goldenDatasetManager } = await import("../../harness/golden-dataset")

  const qualityScore = Math.max(1, Math.min(5, parseInt(opts.quality ?? "4", 10) || 4))
  const task = goldenDatasetManager.promoteToGold(id, opts.verifier ?? "cli-user", qualityScore, opts.notes)

  if (!task) {
    console.log(theme.error(`\n  Task not found: ${id}\n`))
    return
  }

  console.log(theme.success(`\n  ✓ Promoted to Gold: ${task.name}\n`))
  console.log(`  ID:       ${theme.bold(task.id)}`)
  console.log(`  Status:   ${theme.success(task.goldenStatus)}`)
  console.log(`  Quality:  ${"★".repeat(qualityScore)}${"☆".repeat(5 - qualityScore)} (${qualityScore}/5)`)
  console.log(`  Verifier: ${opts.verifier}`)
  console.log()
}

async function handleGoldenAudit(opts: { dryRun?: boolean }) {
  showBanner()
  const { goldenDatasetManager } = await import("../../harness/golden-dataset")
  const { GoldenTaskValidator } = await import("../../harness/golden-validator")

  const ready = goldenDatasetManager.getReadyForAudit()

  if (ready.length === 0) {
    console.log(theme.warn("\n  No Gold tasks ready for audit (need quality score ≥ 3.5).\n"))
    return
  }

  if (opts.dryRun) {
    console.log(theme.heading(`\n  🔍 Dry Run: ${ready.length} task(s) ready for audit\n`))
    for (const t of ready) {
      console.log(`  ${theme.bold(t.name)}  (${t.id})`)
      console.log(
        `     Quality: ${"★".repeat(Math.round(t.goldenQualityScore ?? 0))}  Difficulty: ${t.goldenDifficulty}`,
      )
      console.log()
    }
    return
  }

  console.log(theme.heading(`\n  🔍 Cross-Model Validating ${ready.length} Gold task(s)\n`))
  console.log(theme.dim("  This runs each task through GPT-4o, Claude Sonnet 4, and Gemini 2.0 Flash.\n"))

  const validator = new GoldenTaskValidator()
  const report = await validator.validateAllGold()

  console.log()
  console.log(
    `  ${theme.bold("Results:")}  ${theme.success(`${report.totalPassed} passed`)}  ${theme.error(`${report.totalFailed} failed`)}  ${theme.dim(`${report.totalTasks} total`)}`,
  )
  console.log(`  Pass rate: ${(report.passRate * 100).toFixed(0)}%`)
  console.log()

  for (const [model, stats] of Object.entries(report.byModel)) {
    console.log(
      `  ${theme.bold(model.padEnd(20))} ${theme.success(`${stats.passed}/${stats.total}`)}  avg: ${(stats.avgScore * 100).toFixed(0)}%`,
    )
  }
  console.log()

  for (const rec of report.recommendations) {
    const icon = rec.includes("failed ALL") ? theme.error("!") : theme.warn("→")
    console.log(`  ${icon} ${rec}`)
  }
  console.log()
}

async function handleGoldenArchive(id: string) {
  showBanner()
  const { goldenDatasetManager } = await import("../../harness/golden-dataset")

  const ok = goldenDatasetManager.archiveTask(id)
  if (!ok) {
    console.log(theme.error(`\n  Task not found: ${id}\n`))
    return
  }

  console.log(theme.dim(`\n  ✓ Archived task: ${id}\n`))
}

async function handleGoldenStats() {
  showBanner()
  const { goldenDatasetManager } = await import("../../harness/golden-dataset")

  const stats = goldenDatasetManager.getStats()

  console.log(theme.heading("\n  📊 Golden Dataset Statistics\n"))
  console.log(`  Total tasks:     ${theme.bold(String(stats.total))}`)
  console.log()
  console.log(`  By status:`)
  for (const [status, count] of Object.entries(stats.byStatus)) {
    const color =
      status === "audited"
        ? theme.success
        : status === "archived"
          ? theme.dim
          : status === "gold"
            ? theme.info
            : theme.warn
    console.log(`    ${color(status.padEnd(10))} ${"█".repeat(count)} ${count}`)
  }
  console.log()
  console.log(`  By difficulty:`)
  for (const [diff, count] of Object.entries(stats.byDifficulty)) {
    console.log(`    ${diff.padEnd(10)} ${"█".repeat(count)} ${count}`)
  }
  console.log()
  console.log(`  Avg quality:     ${stats.avgQualityScore.toFixed(1)} / 5.0`)
  console.log(`  Audit pass rate: ${(stats.auditPassRate * 100).toFixed(0)}%`)
  console.log()
}

// ── (no helpers needed for this command) ───────────────────────
