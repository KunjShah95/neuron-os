type Cleanup = () => void | Promise<void>

interface ShutdownHandlerOptions {
  exit?: boolean
  exitCode?: number
  /** Force-kill after this many ms if cleanup hangs. Defaults to no limit. */
  forceKillAfterMs?: number
}

/**
 * Register SIGINT and SIGTERM handlers that run the given cleanup function.
 *
 * When `exit` is true (default), calls `process.exit(exitCode)` after cleanup.
 * Set `exit: false` for cases where cleanup should not terminate the process
 * (e.g. closing a readline interface so the natural close path resumes).
 *
 * Pass `forceKillAfterMs` to hard-kill if cleanup hangs beyond that threshold.
 *
 * Returns an unregister function to remove the handlers.
 */
export function registerShutdownHandlers(
  cleanup: Cleanup,
  options: ShutdownHandlerOptions = {},
): () => void {
  const { exit = true, exitCode = 0, forceKillAfterMs } = options
  let shuttingDown = false

  const handleSignal = async () => {
    if (shuttingDown) return
    shuttingDown = true

    let forceTimer: ReturnType<typeof setTimeout> | undefined
    if (forceKillAfterMs !== undefined) {
      forceTimer = setTimeout(() => process.exit(exitCode), forceKillAfterMs)
      forceTimer.unref?.()
    }

    try {
      await cleanup()
      clearTimeout(forceTimer)
      if (exit) process.exit(exitCode)
    } catch {
      clearTimeout(forceTimer)
      if (exit) process.exit(1)
    }
  }

  process.on("SIGINT", handleSignal)
  process.on("SIGTERM", handleSignal)

  return () => {
    process.off("SIGINT", handleSignal)
    process.off("SIGTERM", handleSignal)
  }
}

/**
 * Block the event loop with an unresolved promise after registering
 * SIGINT/SIGTERM cleanup handlers. The process exits via the signal
 * handler (which calls `process.exit(0)` after cleanup).
 *
 * Usage:
 *   await keepAlive(() => server.stop())
 *   await keepAlive(() => server.stop(), { forceKillAfterMs: 5000 })
 */
export function keepAlive(cleanup: Cleanup, options?: Omit<ShutdownHandlerOptions, "exit">): Promise<never> {
  registerShutdownHandlers(cleanup, { ...options, exit: true })
  return new Promise<never>(() => {})
}
