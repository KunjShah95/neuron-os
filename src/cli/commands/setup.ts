import type { Command } from "commander"

export function registerSetup(program: Command) {
  program
    .command("setup")
    .description("Configure and initialize Aegis workspace")
    .action(async () => {
      const { runSetupFlow } = await import("../../wizard/flows/setup")
      const { createClackPrompter } = await import("../../wizard/clack-prompter")
      const prompter = createClackPrompter()
      await runSetupFlow(prompter)
    })
}
