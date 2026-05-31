import type { Command } from "commander"

export function registerWakeup(program: Command) {
  program
    .command("wakeup")
    .alias("w")
    .description("Show the banner and available commands")
    .action(handleWakeup)
}

async function handleWakeup() {
  // Re-use the same wakeup logic that runs on no-args
  const { runWakeup } = await import("../wakeup")
  await runWakeup()
}
