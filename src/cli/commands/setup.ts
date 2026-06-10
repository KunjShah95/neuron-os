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
      const { spawn } = await import("node:child_process")
      await new Promise<void>((resolve) => {
        const scriptArg = process.argv[1] ?? ""
        const child = spawn(process.execPath, [scriptArg, "doctor"], {
          stdio: "inherit" as const,
          env: process.env,
        })
        child.on("exit", () => resolve())
      })

      console.log("\n✨ Ready! Run: aegis chat\n")
    })

  // version command alias (complement to --version flag)
  program
    .command("version")
    .description("Show Aegis version")
    .action(async () => {
      const { getVersion } = await import("../../version")
      console.log(getVersion())
    })
}
