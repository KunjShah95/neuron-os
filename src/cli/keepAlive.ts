/**
 * Shared keepAlive() utility for long-running commands.
 *
 * Registers SIGINT and SIGTERM handlers that call the provided cleanup
 * function, then blocks the event loop with an unresolved promise.
 *
 * Usage:
 *   await keepAlive(() => server.stop())
 *
 * This eliminates the repetitive signal-handler + promise pattern
 * duplicated across 15+ command files.
 */

export function keepAlive(cleanup: () => void | Promise<void>): Promise<never> {
  async function handleSignal() {
    try {
      await cleanup()
    } catch {
      // Cleanup errors are non-fatal — always exit
    }
    process.exit(0)
  }

  process.on("SIGINT", handleSignal)
  process.on("SIGTERM", handleSignal)

  return new Promise<never>(() => {})
}
