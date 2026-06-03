import type { Command } from "commander"

export function registerWakeup(program: Command) {
  program
    .command("wakeup")
    .alias("w")
    .description("Show the banner and available commands")
    .action(async () => {
      const { runWakeup } = await import("../wakeup")
      await runWakeup(program)
    })
}
