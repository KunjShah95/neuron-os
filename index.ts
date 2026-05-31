#!/usr/bin/env bun

import { Command, Help } from "commander"
import { showBanner } from "./src/cli/banner"
import { registerAllCommands } from "./src/cli/commands"
import { registerAllModes } from "./src/modes"

const program = new Command()

program
  .name("Aegis")
  .description("The Operating System for Autonomous AI Agents")
  .version("0.1.0")
  .configureHelp({
    subcommandTerm: (cmd) => {
      const aliases = cmd.aliases()
      if (aliases.length > 0) {
        return `${cmd.name()} (${aliases.join(", ")})`
      }
      return cmd.name()
    },
  })

registerAllCommands(program)
registerAllModes()

// If no args, launch mode launcher instead of showing help
const noArgs = process.argv.slice(2).length === 0
if (noArgs) {
  showBanner()
  const { runModeLauncher } = await import("./src/modes")
  await runModeLauncher()
  process.exit(0)
}

// Compat alias for `Aegis-build wakeup`
program
  .command("build [sub]")
  .description("Build subcommands (e.g. 'build wakeup')")
  .allowUnknownOption()
  .action(async (sub?: string) => {
    if (sub === "wakeup") {
      const { registerAllModes, runModeLauncher } = await import("./src/modes")
      registerAllModes()
      await runModeLauncher()
    } else {
      console.log("usage: aegis build wakeup")
    }
  })

// Show banner before any command except --help/--version
program.hook("preAction", () => {
  const args = process.argv.slice(2)
  if (
    !args.includes("--help") &&
    !args.includes("-h") &&
    !args.includes("--version") &&
    !args.includes("-V")
  ) {
    showBanner()
  }
})

await program.parseAsync(process.argv)
