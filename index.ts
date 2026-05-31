#!/usr/bin/env bun

import { Command } from "commander"
import { showBanner } from "./src/cli/banner"
import { registerAllCommands } from "./src/cli/commands"
import { runWakeup } from "./src/cli/wakeup"
import { registerErrorBoundaries } from "./src/cli/guard"
import { createLogger } from "./src/cli/logger"
import { agentManager } from "./src/agent/manager"

const log = createLogger("cli")

// ── Graceful Shutdown ─────────────────────────────────────────────────

async function gracefulShutdown(code = 0): Promise<void> {
  log.info("Shutting down gracefully...")

  // Kill all running agents with a reasonable timeout
  const agentCount = agentManager.agents.size
  if (agentCount > 0) {
    log.info(`Stopping ${agentCount} agent(s)...`)
    try {
      await agentManager.destroy()
    } catch (err) {
      log.error("Error during agent cleanup", { error: String(err) })
    }
  }

  log.info("Shutdown complete")
  process.exit(code)
}

// Register signal handlers
process.on("SIGINT", () => {
  log.debug("Received SIGINT")
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  gracefulShutdown(0)
})

process.on("SIGTERM", () => {
  log.debug("Received SIGTERM")
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  gracefulShutdown(0)
})

// Register error boundaries (unhandledRejection, uncaughtException)
registerErrorBoundaries(gracefulShutdown)

// ── CLI Setup ─────────────────────────────────────────────────────────

const program = new Command()

program
  .name("Aegis")
  .description("The Operating System for Autonomous AI Agents")
  .version("0.1.0")

registerAllCommands(program)

// If no args, show banner and run the wakeup TUI (pick CLI or Telegram mode)
const noArgs = process.argv.slice(2).length === 0
if (noArgs) {
  await runWakeup()
  await gracefulShutdown(0)
} else {
  // Only register commands and parse if there are args

// compat alias
program
  .command("build [sub]")
  .description("Build subcommands (e.g. 'build wakeup')")
  .allowUnknownOption()
  .action(async (sub?: string) => {
    if (sub === "wakeup") {
      await runWakeup()
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

  // Ensure process exits after command completes
  await gracefulShutdown(0)
}
