/**
 * Shared stdin utilities.
 *
 * @clack/prompts uses raw-mode stdin for keystroke capture. After select()
 * or text() completes, stdin can be left in a degraded state with:
 *   1. Raw mode still enabled (common on Windows)
 *   2. Leftover bytes in the buffer (the Enter key that confirmed the selection)
 *   3. Stale data event listeners
 *
 * Root cause: @clack/core calls emitKeypressEvents(stdin) on each prompt, which
 * sets stdin._keypressEventsEmitted = true and attaches keypress-decoder /
 * escape-decoder symbols. Its rl.close() does NOT clear these, so the next
 * emitKeypressEvents() call skips re-attaching the data listener — stdin freezes.
 *
 * Checked @clack/core 1.4.2 (latest as of 2026-06): still affected.
 * This workaround must stay until the fix is upstreamed into @clack/core.
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
        ;(process.stdin as unknown as Record<string | symbol, unknown>)[sym] = undefined
      }
    }

    delete (process.stdin as unknown as Record<string, unknown>)._keypressEventsEmitted

    if (process.stdin.isRaw) {
      process.stdin.setRawMode(false)
    }

    process.stdin.resume()
  } catch {
    // Best-effort — some environments (non-TTY, tests) don't support setRawMode
  }
}
