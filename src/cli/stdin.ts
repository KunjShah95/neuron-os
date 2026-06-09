/**
 * Shared stdin utilities.
 *
 * @clack/prompts uses raw-mode stdin for keystroke capture. After select()
 * or text() completes, stdin can be left in a degraded state with:
 *   1. Raw mode still enabled (common on Windows)
 *   2. Leftover bytes in the buffer (the Enter key that confirmed the selection)
 *   3. Stale data event listeners
 *
 * IMPORTANT: This must NOT call pause() on Windows — it breaks subsequent
 * readline/TUI input. Only remove stale listeners and reset raw mode.
 */

const READLINE_SYMBOLS = ["Symbol(keypress-decoder)", "Symbol(escape-decoder)"]

export function resetStdin(): void {
  try {
    process.stdin.removeAllListeners("data")
    process.stdin.removeAllListeners("keypress")

    for (const sym of Object.getOwnPropertySymbols(process.stdin)) {
      if (READLINE_SYMBOLS.includes(sym.toString())) {
        ;(process.stdin as any)[sym] = undefined
      }
    }

    delete (process.stdin as any)._keypressEventsEmitted

    if (process.stdin.isRaw) {
      process.stdin.setRawMode(false)
    }

    process.stdin.resume()
  } catch {
    // Best-effort — some environments (non-TTY, tests) don't support setRawMode
  }
}
