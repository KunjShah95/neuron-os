import { isCancel } from "@clack/prompts"
import { createLogger } from "./logger"
import { logCrash } from "./crash-log"

const log = createLogger("system")

export class WizardCancelledError extends Error {
  constructor() {
    super("wizard cancelled")
    this.name = "WizardCancelledError"
  }
}

export function guardCancel<T>(value: T | symbol): T {
  if (isCancel(value)) throw new WizardCancelledError()
  return value
}

// ── Non-fatal error patterns ─────────────────────────────────────────
// These errors should be logged but NOT kill the process.
// The server can continue operating even when these occur.
const NON_FATAL_PATTERNS: RegExp[] = [
  // Network-level errors (transient, should never crash the server)
  /ECONNREFUSED/i,
  /ECONNRESET/i,
  /ECONNABORTED/i,
  /EPIPE/i,
  /EADDRINUSE/i,
  /EADDRNOTAVAIL/i,
  /ENETUNREACH/i,
  /EHOSTUNREACH/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /socket hang up/i,
  /socket closed/i,
  /network/i,
  /connection (lost|closed|refused|reset)/i,
  /timeout/i,

  // AI provider errors (transient provider issues, not our fault)
  /rate limit/i,
  /quota exceeded/i,
  /API key/i,
  /unauthorized/i,
  /forbidden/i,
  /provider.*(error|fail|unavail)/i,
  /model.*(not found|unavail|overloaded)/i,
  /insufficient.*quota/i,
  /context.*length/i,
  /content.*filter/i,
  /safety.*(error|violation)/i,

  // Persistence errors (should not crash the server)
  /Failed to persist/i,
  /Failed to create\/resume session/i,
  /Failed to update session/i,
  /database (locked|busy|timeout)/i,
  /SQLITE/i,
  /better-sqlite3/i,

  // Subsystem failures (non-critical components)
  /Evaluator failed/i,
  /Ratchet measure failed/i,
  /Knowledge graph integration failed/i,
  /Mood update failed/i,
  /Experience recording failed/i,
  /Failed to start adapter/i,
  /cost tracking/i,
  /billing tracker/i,
  /dream/i,
  /evolve/i,
  /plugin/i,
  /cron/i,
  /scheduler/i,
  /self-improvement/i,
  /docs-crawl/i,
  /insight/i,

  // WebSocket / SSE errors (connection-level, not server-level)
  /WebSocket/i,
  /SSE controller/i,
  /event stream/i,
  /long poll/i,

  // General transient errors
  /abort/i,
  /cancel/i,
  /interrupt/i,
  /stream (ended|closed|error)/i,
  /parse error/i,
  /json.*(parse|stringify)/i,
  /body.*(parse|read)/i,
  /payload.*(size|limit)/i,
]

function isNonFatalError(reason: unknown): boolean {
  const msg = reason instanceof Error ? reason.message : String(reason)
  return NON_FATAL_PATTERNS.some((p) => p.test(msg))
}

// ── Global Error Boundaries ───────────────────────────────────────────

/**
 * Register global handlers for unhandled rejections and uncaught exceptions.
 *
 * Non-fatal errors (network failures, provider errors, optional subsystem errors)
 * are logged but do NOT kill the process — the server keeps running.
 *
 * Fatal errors (OOM, corrupted state, etc.) trigger graceful shutdown.
 */
export function registerErrorBoundaries(onShutdown?: (code: number) => void): void {
  process.on("unhandledRejection", (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : undefined

    if (isNonFatalError(reason)) {
      log.warn("Non-fatal unhandled rejection (server continues)", {
        msg,
        stack: stack?.split("\n").slice(0, 3).join("\\n"),
      })
      return // Do NOT shutdown
    }

    log.error("Unhandled promise rejection", { msg, stack: stack?.split("\n").slice(0, 3).join("\\n") })
    // Write crash record before shutdown for post-mortem debugging
    logCrash(reason, { exitCode: 1 })
    onShutdown?.(1)
  })

  process.on("uncaughtException", (error: Error) => {
    if (isNonFatalError(error)) {
      log.warn("Non-fatal uncaught exception (server continues)", {
        msg: error.message,
        stack: error.stack?.split("\n").slice(0, 3).join("\\n"),
      })
      return // Do NOT shutdown
    }

    log.error("Uncaught exception", { msg: error.message, stack: error.stack?.split("\n").slice(0, 3).join("\\n") })
    // Write crash record before shutdown for post-mortem debugging
    logCrash(error, { exitCode: 1 })
    onShutdown?.(1)
  })
}
