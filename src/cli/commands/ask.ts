import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"

export function registerAsk(program: Command) {
  program
    .command("ask")
    .description("Ask a question about the codebase (read-only)")
    .argument("<question>", "Your question about the codebase")
    .option("--session-db", "Persist this session to the SQLite session store")
    .option("--project <name>", "Use a specific project workspace (sessions, memory)")
    .action(handleAsk)
}

async function handleAsk(question: string, opts: { sessionDb?: boolean; project?: string }) {
  showBanner()

  console.log(theme.info(`\n  🔍 Researching: ${question}\n`))

  if (opts.sessionDb) {
    console.log(theme.muted("  📂 Session persistence enabled"))
  }
  if (opts.project) {
    console.log(theme.muted(`  📁 Project: ${opts.project}`))
  }
  console.log()

  try {
    const { runAskOrchestrator } = await import("../../modes/ask")
    const answer = await runAskOrchestrator(question, opts.sessionDb, opts.project)
    console.log(answer)
    console.log()
  } catch (err: any) {
    console.error(theme.error(`\n  ✗ Error: ${err.message ?? String(err)}\n`))
    process.exit(1)
  }
}
