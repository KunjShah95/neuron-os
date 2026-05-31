import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"

export function registerAsk(program: Command) {
  program
    .command("ask")
    .description("Ask a question about the codebase (read-only)")
    .argument("<question>", "Your question about the codebase")
    .action(handleAsk)
}

async function handleAsk(question: string) {
  showBanner()

  console.log(theme.info(`\n  🔍 Researching: ${question}\n`))

  try {
    const { runAskOrchestrator } = await import("../../modes/ask")
    const answer = await runAskOrchestrator(question)
    console.log(answer)
    console.log()
  } catch (err: any) {
    console.error(theme.error(`\n  ✗ Error: ${err.message ?? String(err)}\n`))
    process.exit(1)
  }
}
