import type { Command } from "commander"
import { registerAllModes, runModeLauncher } from "../../modes"

export function registerWakeup(program: Command) {
  program
    .command("wakeup")
    .alias("w")
    .description("Show mode launcher (interactive TUI)")
    .action(handleWakeup)
}

async function handleWakeup() {
  registerAllModes()
  await runModeLauncher()
}
