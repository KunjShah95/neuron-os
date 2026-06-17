#!/usr/bin/env bun
/**
 * src/cli/supervisor.ts
 *
 * Process supervisor that spawns a child process and auto-restarts it
 * on unplanned crashes. Uses exponential backoff between restarts.
 *
 * Usage:
 *   bun run src/cli/supervisor.ts -- <command> [args...]
 *
 * Example:
 *   bun run src/cli/supervisor.ts -- bun run index.ts serve --port 8080
 *
 * The supervisor watches the child process exit code:
 *   - Exit code 0            -> planned shutdown, supervisor exits
 *   - Exit code null/undefined -> signal termination (SIGINT/SIGTERM)
 *   - Any other exit code    -> crash, supervisor restarts with backoff
 *
 * Backoff: 1s -> 2s -> 4s -> 8s -> max 30s, resets after 60s of uptime
 */

import { logChildCrash } from "./crash-log"

const BACKOFF_BASE_MS = 1000
const BACKOFF_MAX_MS = 30_000
const UPTIME_RESET_MS = 60_000
const MAX_RESTARTS = 20

interface SupervisorOptions {
  args: string[]
  maxRestarts?: number
}

function parseArgs(): SupervisorOptions {
  const args = process.argv.slice(2)
  const sepIdx = args.indexOf("--")
  if (sepIdx === -1 || sepIdx === args.length - 1) {
    console.error("[supervisor] Usage: supervisor.ts -- <command> [args...]")
    process.exit(1)
  }
  return { args: args.slice(sepIdx + 1) }
}

/**
 * Determine if an exit code indicates a planned/signal-based shutdown.
 * On Unix: SIGINT=130 (128+2), SIGTERM=143 (128+15)
 * On Windows: signal handlers produce exit code 0 or 1, never 130/143
 * null/undefined means the process was terminated by a signal.
 */
function isPlannedShutdown(exitCode: number | null): boolean {
  if (exitCode === null || exitCode === undefined) {
    // Process was killed by a signal (SIGTERM/SIGKILL)
    return true
  }
  if (exitCode === 0) {
    // Clean exit
    return true
  }
  // Unix signal codes: 128 + signum
  // SIGINT = 2 -> 130, SIGTERM = 15 -> 143
  if (exitCode === 130 || exitCode === 143) {
    return true
  }
  return false
}

async function runSupervisor(opts: SupervisorOptions): Promise<void> {
  const { args, maxRestarts = MAX_RESTARTS } = opts
  let restartCount = 0

  while (restartCount < maxRestarts) {
    const startTime = Date.now()
    console.error("[supervisor] Spawning: " + args.join(" ") + " (restart #" + restartCount + ")")

    const proc = Bun.spawn(args, {
      stdio: ["inherit", "inherit", "inherit"],
      env: { ...process.env, AEGIS_SPAWNED: "1" },
    })

    const exitCode = await proc.exited

    if (isPlannedShutdown(exitCode)) {
      console.error("[supervisor] Child exited cleanly (code " + exitCode + "). Shutting down supervisor.")
      process.exit(0)
    }

    // Crash recovery
    const uptime = Date.now() - startTime
    restartCount++

    // Log crash to crash.log for post-mortem debugging
    logChildCrash(exitCode, uptime / 1000, restartCount)

    // Reset restart count if process ran for a while (stable)
    if (uptime > UPTIME_RESET_MS) {
      restartCount = 0
    }

    // Exponential backoff
    const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, restartCount - 1), BACKOFF_MAX_MS)
    console.error(
      "[supervisor] Child crashed with exit code " + exitCode +
      " after " + (uptime / 1000).toFixed(1) + "s. " +
      "Restarting in " + (delay / 1000).toFixed(1) + "s (attempt " + restartCount + "/" + maxRestarts + ")...",
    )

    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  console.error("[supervisor] Max restarts (" + maxRestarts + ") reached. Giving up.")
  process.exit(1)
}

// Only run as main entry point — not when imported as a module
// This guard allows other modules to import supervisor.ts safely
// (e.g., for type checks or testing) without triggering side effects.
if (import.meta.main) {
  const opts = parseArgs()
  runSupervisor(opts).catch((err) => {
    console.error("[supervisor] Fatal error:", err)
    process.exit(1)
  })
}
