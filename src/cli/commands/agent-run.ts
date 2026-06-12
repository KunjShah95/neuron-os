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
    .option("--ratchet", "Enable git ratchet — revert agent changes on regression")
    .option("--eval <metrics>", "Comma-separated eval metrics: typecheck,tests-pass,lint-clean,build")
    .option("--test-cmd <command>", "Raw shell command used by ratchet (legacy heuristic mode)")
    .action(handleAgentRun)
}

async function handleAgentRun(
  goal: string,
  opts: { project?: string; ratchet?: boolean; eval?: string; testCmd?: string },
) {
  const { requireAnyProvider } = await import("../../ai/provider-guard")
  requireAnyProvider()
  showBanner()

  console.log(theme.info(`\n  🤖 Agent orchestrator starting for: ${goal}\n`))

  if (opts.project) {
    console.log(theme.muted(`  📁 Project: ${opts.project}`))
  }
  if (opts.ratchet) {
    console.log(theme.muted(`  🪝 Ratchet: enabled (will revert on regression)`))
  }
  if (opts.eval) {
    console.log(theme.muted(`  📊 Eval: ${opts.eval}`))
  }
  if (opts.testCmd) {
    console.log(theme.muted(`  🧪 Test command: ${opts.testCmd}`))
  }
  console.log()

  const evaluation = opts.eval
    ? opts.eval
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean)
        .map((metric) => ({ metric: metric as string }))
    : undefined

  try {
    const { runAgentOrchestrator } = await import("../../modes/agent-run")
    const summary = await runAgentOrchestrator(goal, undefined, opts.project, {
      ratchet: opts.ratchet ?? !!opts.testCmd,
      evaluation,
      testCommand: opts.testCmd,
    })
    console.log(summary)
    console.log()
  } catch (err: unknown) {
    console.error(theme.error(`\n  ✗ Error: ${err instanceof Error ? err.message : String(err)}\n`))
    process.exit(1)
  }
}
