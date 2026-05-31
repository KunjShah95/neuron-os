import type { Command } from "commander"
import { showBanner } from "../banner"
import { isValidAgentType } from "../../agent"

export function registerChat(program: Command) {
  program
    .command("chat")
    .alias("c")
    .description("Open chat TUI")
    .option("-t, --type <type>", "Agent type (build, plan, read, write, test, validate, review, debug, document, refactor, deploy, monitor, explore)")
    .action(async (options: { type?: string }) => {
      showBanner()

      if (options.type && !isValidAgentType(options.type)) {
        console.error(`Unknown agent type: ${options.type}`)
        console.error(`Available types: build, plan, read, write, test, validate, review, debug, document, refactor, deploy, monitor, explore`)
        process.exit(1)
      }

      const { startChat } = await import("../../chat/renderer")
      await startChat(options.type as any)
    })
}
