/**
 * tui/terminal-md — renders markdown text to the terminal with proper formatting.
 * Uses marked + marked-terminal for rendering.
 */

import { marked } from "marked"
import { markedTerminal } from "marked-terminal"

let ready = false

function ensureMarked(): void {
  if (ready) return
  const w = Math.max(40, Math.min(process.stdout.columns || 80, 120))
  void marked.use((markedTerminal as any)({ width: w, reflowText: true }))
  ready = true
}

/**
 * Render markdown source text to ANSI-formatted terminal output.
 */
export function renderTerminalMarkdown(source: string): string {
  ensureMarked()
  return marked.parse(source.trimEnd(), { async: false }) as string
}
