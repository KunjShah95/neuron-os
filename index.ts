#!/usr/bin/env bun

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { resolve, join } from "node:path"

// ── Auto-load .env file ─────────────────────────────────────────────
// Loads .env from project root if it exists (before any other imports).
// Checks multiple paths for compatibility across run modes:
//   1. Script directory (import.meta.dir)
//   2. Current working directory (process.cwd())
// Supports both KEY=value and export KEY=value formats.
// Does NOT override already-set environment variables.
function loadDotEnv(): void {
  const candidates = [
    import.meta.dir ? resolve(import.meta.dir, ".env") : null,
    resolve(process.cwd(), ".env"),
  ].filter(Boolean) as string[]
  const envPath = candidates.find((p) => existsSync(p))
  if (!envPath) {
    // No .env file found — not an error, but hint the user on first run
    const hasAnyKey = [
      "AEGIS_AI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY",
      "OPENROUTER_API_KEY", "DEEPSEEK_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY",
      "GROQ_API_KEY", "MISTRAL_API_KEY", "AZURE_OPENAI_API_KEY",
      "TOGETHERAI_API_KEY", "XAI_API_KEY", "COHERE_API_KEY", "PERPLEXITY_API_KEY",
    ].some((k) => process.env[k])
    if (!hasAnyKey) {
      console.warn("  ⚡ No API keys set. Create a .env file from .env.example or run: aegis setup-keys")
    }
    return
  }
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
import { getVersion } from "./src/version"
import { registerAllCommands } from "./src/cli/commands"
import { runWakeup } from "./src/cli/wakeup"
import { registerErrorBoundaries } from "./src/cli/guard"
import { createLogger } from "./src/cli/logger"
import { agentManager } from "./src/agent/manager"
import { recordCommand, flushOnExit } from "./src/telemetry"
import { sessionStore, getProjectSessionStore } from "./src/memory/session-persistence"
import { getActiveProject } from "./src/project/context"

const log = createLogger("cli")

// Track whether we've already restored sessions (avoid spam on every command)
let sessionsRestored = false

// ── Restore sessions from SQLite on startup ───────────────────────
function restoreRecentSessions(): void {
  try {
    const project = getActiveProject()
    const store = project ? getProjectSessionStore(project) : sessionStore
    const recent = store.restoreRecentSessions(5)
    if (recent.length > 0) {
      const active = recent.filter((s) => s.status === "active")
      const lines = [`📂 Restored ${recent.length} session(s) from database`]
      for (const s of recent) {
        const status = s.status === "active" ? "🟢" : s.status === "failed" ? "🔴" : "⚪"
        lines.push(`  ${status} ${s.name.slice(0, 40)} — ${s.goal.slice(0, 60) || "(no goal)"}`)
      }
      if (active.length > 0) {
        lines.push(`  ${active.length} session(s) still active — use \`aegis session resume <id>\` to continue`)
      }
      log.info(lines.join("\n"))
    }
  } catch {
    // Session restoration is best-effort
  }
}

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
  .version(getVersion())

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
    // Restore recent sessions from SQLite once per process invocation
    if (!sessionsRestored) {
      sessionsRestored = true
      restoreRecentSessions()
    }
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

  // ── Record command history ──────────────────────────────────────────
  // Writes to ~/.aegis/command-history.json for the /history command
  const rawArgs = process.argv.slice(2)
  const commandName = rawArgs
    .filter((a) => !a.startsWith("-"))
    .slice(0, 2)
    .map((a) => a.replace(/[^a-zA-Z0-9_-]/g, ""))
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

    // Write to command history file for /history Telegram command
    try {
      const historyDir = join(process.env.HOME || process.env.USERPROFILE || "~", ".aegis")
      const historyFile = join(historyDir, "command-history.json")
      mkdirSync(historyDir, { recursive: true })

      let history: Array<{ command: string; timestamp: string; args?: string }> = []
      if (existsSync(historyFile)) {
        try {
          history = JSON.parse(readFileSync(historyFile, "utf-8"))
        } catch {
          history = []
        }
      }

      history.push({
        command: commandName,
        timestamp: new Date().toISOString(),
        args: rawArgs.length > 1 ? rawArgs.slice(1).join(" ").slice(0, 100) : undefined,
      })

      // Keep last 100 entries
      if (history.length > 100) history = history.slice(-100)
      writeFileSync(historyFile, JSON.stringify(history, null, 2), "utf-8")
    } catch {
      // History recording is best-effort
    }
  }
}
