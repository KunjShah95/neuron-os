#!/usr/bin/env bun

import { Command, Help } from "commander"
import { showBanner } from "./src/cli/banner"
import { registerAllCommands } from "./src/cli/commands"

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

// Compat alias for `Aegis-build wakeup`
program
  .command("build [sub]")
  .description("Build subcommands (e.g. 'build wakeup')")
  .allowUnknownOption()
  .action(async (sub?: string) => {
    if (sub === "wakeup") {
      const { handleWakeup } = await import("./src/cli/commands/wakeup")
      await handleWakeup()
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
