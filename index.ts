#!/usr/bin/env bun

import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

// ── Auto-load .env file ─────────────────────────────────────────────
// Loads .env from project root if it exists (before any other imports).
// Supports both KEY=value and export KEY=value formats.
// Does NOT override already-set environment variables.
function loadDotEnv(): void {
  const envPath = resolve(import.meta.dir ?? process.cwd(), ".env")
  if (!existsSync(envPath)) return
  try {
    const content = readFileSync(envPath, "utf-8")
    for (const line of content.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      // Strip optional 'export ' prefix
      const cleaned = trimmed.startsWith("export ") ? trimmed.slice(7) : trimmed
      const eqIdx = cleaned.indexOf("=")
      if (eqIdx <= 0) continue
      const key = cleaned.slice(0, eqIdx).trim()
      let value = cleaned.slice(eqIdx + 1).trim()
      // Strip surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (key && !process.env[key]) {
        process.env[key] = value
      }
    }
  } catch {
    // .env loading is best-effort
  }
}
loadDotEnv()

import { Command } from "commander"
import { showBanner } from "./src/cli/banner"
import { registerAllCommands } from "./src/cli/commands"
import { runWakeup } from "./src/cli/wakeup"
import { registerErrorBoundaries } from "./src/cli/guard"
import { createLogger } from "./src/cli/logger"
import { agentManager } from "./src/agent/manager"
import { recordCommand, flushOnExit } from "./src/telemetry"

const log = createLogger("cli")

// ── Graceful Shutdown ─────────────────────────────────────────────────

async function gracefulShutdown(code = 0): Promise<void> {
  log.info("Shutting down gracefully...")

  // Flush any pending telemetry events
  await flushOnExit()

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
  if ((program as any)._interactive) return
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
registerErrorBoundaries((code: number) => {
  if ((program as any)._interactive) {
    log.error("Error in interactive mode, returning to menu...")
    return
  }
  return gracefulShutdown(code)
})

// ── CLI Setup ─────────────────────────────────────────────────────────

const program = new Command()

program
  .name("Aegis")
  .description("The Operating System for Autonomous AI Agents")
  .version("0.1.0")

registerAllCommands(program)

// Show banner before any command except --help/--version or interactive mode
program.hook("preAction", () => {
  if ((program as any)._interactive) return
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

// If no args, launch interactive picker
const noArgs = process.argv.slice(2).length === 0
if (noArgs) {
  await runWakeup(program)
} else {
  // compat alias
  program
    .command("build [sub]")
    .description("Build subcommands (e.g. 'build wakeup')")
    .allowUnknownOption()
    .action(async (sub?: string) => {
      if (sub === "wakeup") {
        await runWakeup(program)
      } else {
        console.log("usage: aegis build wakeup")
      }
    })

  // ── Record telemetry for the command ────────────────────────────────
  // Sanitize: only capture the command path (e.g. "config set"), not argument values
  const rawArgs = process.argv.slice(2)
  const commandName = rawArgs
    .filter((a) => !a.startsWith("-")) // skip flags
    .slice(0, 2)                        // only command + 1 subcommand maximum
    .map((a) => a.replace(/[^a-zA-Z0-9_-]/g, "")) // strip special chars
    .filter(Boolean)
    .join(" ") || "(interactive)"
  const startTime = Date.now()
  let exitCode = 0

  try {
    await program.parseAsync(process.argv)
    exitCode = 0
  } catch (err) {
    exitCode = 1
    throw err
  } finally {
    const duration = Date.now() - startTime
    recordCommand(commandName, exitCode === 0, duration)
  }
}
