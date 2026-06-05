import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"

export function registerPlan(program: Command) {
  program
    .command("plan")
    .description("Generate a step-by-step implementation plan")
    .argument("<goal>", "What you want to accomplish")
    .option("--session-db", "Persist this session to the SQLite session store")
    .option("--project <name>", "Use a specific project workspace (sessions, memory)")
    .action(handlePlan)
}

async function handlePlan(goal: string, opts: { sessionDb?: boolean; project?: string }) {
  showBanner()

  console.log(theme.info(`\n  📋 Generating plan for: ${goal}\n`))

  if (opts.sessionDb) {
    console.log(theme.muted("  📂 Session persistence enabled"))
  }
  if (opts.project) {
    console.log(theme.muted(`  📁 Project: ${opts.project}`))
  }
  console.log()

  try {
    const { runPlanOrchestrator } = await import("../../modes/plan")
    const result = await runPlanOrchestrator(goal, opts.sessionDb, opts.project)
    console.log(result)
  } catch (err: any) {
    console.error(theme.error(`\n  ✗ Error: ${err.message ?? String(err)}\n`))
    process.exit(1)
  }
}
