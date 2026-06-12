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

  program
    .command("init")
    .alias("quick-start")
    .alias("start")
    .description("Quick start guide - configure API keys and launch Aegis")
    .action(async () => {
      const { getDefaultConfiguredProvider } = await import("../../ai/provider-guard")
      console.log("\n🛡️  Welcome to Aegis!\n")

      if (!getDefaultConfiguredProvider()) {
        console.log("  No API keys found. Starting interactive setup...\n")
        const { runSetupKeysWizard } = await import("./setup-keys")
        await runSetupKeysWizard()
      } else {
        console.log("  API keys already configured.\n")
      }

      console.log("\n  Verifying setup...\n")
      const { handleDoctor } = await import("./doctor")
      await handleDoctor()

      console.log("\n✨ Ready! Run: aegis chat\n")
    })

  program
    .command("version")
    .description("Show Aegis version")
    .action(async () => {
      const { getVersion } = await import("../../version")
      console.log(getVersion())
    })
}
