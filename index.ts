#!/usr/bin/env bun

import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { setPendingCommand, flushHistorySync } from "./src/cli/history"

// ── Auto-load .env file ─────────────────────────────────────────────
// Loads .env from project root if it exists (before any other imports).
// Checks multiple paths for compatibility across run modes:
//   1. Script directory (import.meta.dir)
//   2. Current working directory (process.cwd())
// Supports both KEY=value and export KEY=value formats.
// Does NOT override already-set environment variables.
function loadDotEnv(): void {
  // Hermetic mode: skip loading any .env / vault files. Used by CI and the
  // CLI smoke tests so zero-key guards can be exercised deterministically.
  if (process.env["AEGIS_NO_DOTENV"] === "1") return

  const candidates = [
    import.meta.dir ? resolve(import.meta.dir, ".env") : null,
    resolve(process.cwd(), ".env"),
  ].filter(Boolean) as string[]
  const envPath = candidates.find((p) => existsSync(p))
  if (envPath) {
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

  // ── Load vault agent.env (keys from `aegis setup-keys`) ──────────
  const homeDir = process.env.HOME || process.env.USERPROFILE
  if (homeDir) {
    const vaultEnvPath = resolve(homeDir, ".aegis", "agent.env")
    if (existsSync(vaultEnvPath)) {
      try {
        const content = readFileSync(vaultEnvPath, "utf-8")
        for (const line of content.split("\n")) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith("#")) continue
          const eqIdx = trimmed.indexOf("=")
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim()
            let value = trimmed.slice(eqIdx + 1).trim()
            if (key && !process.env[key]) {
              process.env[key] = value
            }
          }
        }
      } catch {
        // agent.env loading is best-effort
      }
    }
  }

  // ── Warn if no keys are set at all ───────────────────────────────
  if (!envPath) {
    const hasAnyKey = [
      "AEGIS_AI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY",
      "OPENROUTER_API_KEY", "DEEPSEEK_API_KEY", "GEMINI_API_KEY",
      "GOOGLE_GENERATIVE_AI_API_KEY", "GROQ_API_KEY", "MISTRAL_API_KEY",
      "AZURE_OPENAI_API_KEY", "TOGETHERAI_API_KEY", "XAI_API_KEY",
      "COHERE_API_KEY", "PERPLEXITY_API_KEY", "NVIDIA_API_KEY", "CUSTOM_API_KEY",
    ].some((k) => process.env[k])
    if (!hasAnyKey) {
      console.warn("  ⚡ No API keys set. Create a .env file from .env.example or run: aegis setup-keys")
    }
  }
}
loadDotEnv()

// ── Fast path: --version (skip all heavy module loading) ──────────────
// Static imports are hoisted in ES modules, so we must detect --version
// before any heavy imports are even loaded. We keep only lightweight
// imports (fs, path, history) at the top and defer everything else.
const _rawArgs = process.argv.slice(2)
if (_rawArgs.includes("--version") || _rawArgs.includes("-V")) {
  let version = "0.0.0"
  try {
    const dir = import.meta.dir ?? process.cwd()
    const pkg = JSON.parse(readFileSync(resolve(dir, "package.json"), "utf-8"))
    version = String(pkg.version || "0.0.0")
  } catch {
    // fallback
  }
  console.log(version)
  process.exit(0)
}

// ── Heavy imports (deferred so --version never loads them) ────────────
// These are loaded lazily via dynamic import() so the --version fast path
// above never pays the ~5s cost of transpiling 100K+ lines of TypeScript.
const { Command } = await import("commander")
const { showBanner } = await import("./src/cli/banner")
const { getVersion } = await import("./src/version")
const { registerAllCommands } = await import("./src/cli/commands")
const { runWakeup } = await import("./src/cli/wakeup")
const { registerErrorBoundaries } = await import("./src/cli/guard")
const { createLogger } = await import("./src/cli/logger")
const { agentManager } = await import("./src/agent/manager")
const { recordCommand, flushOnExit } = await import("./src/telemetry")
const { sessionStore, getProjectSessionStore } = await import("./src/memory/session-persistence")
const { getActiveProject } = await import("./src/project/context")

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
  // In child processes spawned from the wakeup menu, skip gracefulShutdown
  // (heavy agent/telemetry cleanup) but still exit so the process doesn't
  // hang. Give command-specific handlers (telegram, serve, etc.) a chance
  // to run their cleanup first via a short delay.
  if (process.env.AEGIS_SPAWNED) {
    log.debug("SIGINT in spawned child — exiting (command handler may also fire)")
    setTimeout(() => process.exit(0), 100)
    return
  }
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
const noArgs = _rawArgs.length === 0
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
  // Uses process.on("exit") via setPendingCommand() so history is flushed
  // even when signal handlers call process.exit() (skipping the finally block).
  const commandName = _rawArgs
    .filter((a) => !a.startsWith("-"))
    .slice(0, 2)
    .map((a) => a.replace(/[^a-zA-Z0-9_-]/g, ""))
    .filter(Boolean)
    .join(" ") || "(interactive)"
  const startTime = Date.now()
  let exitCode = 0
  let historyWritten = false

  setPendingCommand({
    command: commandName,
    timestamp: new Date().toISOString(),
    args: _rawArgs.length > 1 ? _rawArgs.slice(1).join(" ").slice(0, 100) : undefined,
  })

  // Called both from finally (normal exit) and process 'exit' handler (early
  // exit via process.exit() in signal handlers). The flag prevents double-writes.
  function writeCommandHistory(code: number): void {
    if (historyWritten) return
    historyWritten = true
    flushHistorySync()
    recordCommand(commandName, code === 0, Date.now() - startTime)
  }

  // 'exit' fires synchronously even when process.exit() is called directly
  // (e.g. from adapter SIGINT handlers), ensuring history is always recorded.
  process.on("exit", writeCommandHistory)

  try {
    await program.parseAsync(process.argv)
    exitCode = 0
  } catch (err) {
    exitCode = 1
    throw err
  } finally {
    writeCommandHistory(exitCode)
  }
}
