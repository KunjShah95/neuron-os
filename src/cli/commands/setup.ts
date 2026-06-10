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

  // Quick-start alias for new users
  program
    .command("init")
    .alias("quick-start")
    .alias("start")
    .description("Quick start guide - configure API keys and launch Aegis")
    .action(async () => {
      const { runSetupKeysWizard } = await import("./setup-keys")
      console.log("\n🛡️  Welcome to Aegis! Let's get you set up...\n")
      await runSetupKeysWizard()
      console.log("\n✨ Setup complete! Launching Aegis...\n")
      const { runWakeup } = await import("../wakeup")
      await runWakeup(program)
    })
}
