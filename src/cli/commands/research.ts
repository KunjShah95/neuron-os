import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"

export function registerResearch(program: Command) {
  program
    .command("research")
    .alias("rs")
    .description("Run an autonomous research loop with safe ratchet mechanism")
    .argument("<goal>", "The goal for the research loop to pursue")
    .option("-m, --max-iterations <number>", "Maximum research iterations", "10")
    .option("--project <name>", "Use a specific project workspace (sessions, memory)")
    .action(handleResearch)
}

async function handleResearch(goal: string, opts: { maxIterations?: string; project?: string }) {
  showBanner()

  console.log(theme.info(`\n  🧪 Autonomous research loop: ${goal}\n`))

  const maxIterations = Math.max(1, parseInt(opts.maxIterations ?? "10", 10) || 10)
  console.log(theme.muted(`  Max iterations: ${maxIterations}`))

  if (opts.project) {
    console.log(theme.muted(`  📁 Project: ${opts.project}`))
  }
  console.log()

  try {
    const { runResearchLoop } = await import("../../modes/research")
    const result = await runResearchLoop(
      {
        goal,
        successCriteria: goal,
        maxIterations,
      },
      (progress) => {
        console.log(theme.dim(`  ${progress}`))
      },
    )

    console.log(result.finalSummary)
    console.log()
  } catch (err: any) {
    console.error(theme.error(`\n  ✗ Error: ${err.message ?? String(err)}\n`))
    process.exit(1)
  }
}
