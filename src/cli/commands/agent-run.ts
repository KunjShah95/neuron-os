import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"

export function registerAgentRun(program: Command) {
  program
    .command("agent-run")
    .alias("ar")
    .description("Run the approval-based agent orchestrator")
    .argument("<goal>", "The goal for the agent to accomplish")
    .option("--project <name>", "Use a specific project workspace (sessions, memory)")
    .action(handleAgentRun)
}

async function handleAgentRun(goal: string, opts: { project?: string }) {
  showBanner()

  console.log(theme.info(`\n  🤖 Agent orchestrator starting for: ${goal}\n`))

  if (opts.project) {
    console.log(theme.muted(`  📁 Project: ${opts.project}`))
  }
  console.log()

  try {
    const { runAgentOrchestrator } = await import("../../modes/agent-run")
    const summary = await runAgentOrchestrator(goal, undefined, opts.project)
    console.log(summary)
    console.log()
  } catch (err: any) {
    console.error(theme.error(`\n  ✗ Error: ${err.message ?? String(err)}\n`))
    process.exit(1)
  }
}
