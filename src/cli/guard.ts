import { isCancel } from "@clack/prompts"
import { createLogger } from "./logger"

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

// ── Global Error Boundaries ───────────────────────────────────────────

/**
 * Register global handlers for unhandled rejections and uncaught exceptions.
 * Prevents a single error from killing the entire process without cleanup.
 */
export function registerErrorBoundaries(onShutdown?: (code: number) => void): void {
  process.on("unhandledRejection", (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : undefined
    log.error("Unhandled promise rejection", { msg, stack: stack?.split("\n").slice(0, 3).join("\\n") })
    onShutdown?.(1)
  })

  process.on("uncaughtException", (error: Error) => {
    log.error("Uncaught exception", { msg: error.message, stack: error.stack?.split("\n").slice(0, 3).join("\\n") })
    onShutdown?.(1)
  })
}
