import ansiEscapes from "ansi-escapes"
import { theme } from "../cli/theme"
import { parseKey } from "./types"

export async function showInfoScreen(
  title: string,
  lines: string[],
  options?: { back?: boolean },
): Promise<"back" | "quit"> {
  if (!process.stdout.isTTY) {
    for (const l of lines) console.log(l)
    return "quit"
  }

  const wasRaw = process.stdin.isRaw
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding("utf8")

  const rows = process.stdout.rows ?? 24
  const cols = process.stdout.columns ?? 80

  let scrollOffset = 0
  let running = true
  let cleanedUp = false
  let result: "back" | "quit" = "quit"

  function render() {
    let output = ansiEscapes.cursorHide + ansiEscapes.cursorTo(0, 0)

    const hint = options?.back ? " ↑↓ scroll  Esc back  Ctrl+Q quit " : " ↑↓ scroll  Ctrl+Q quit "
    const headerLine = theme.muted(
      `╭─ ${title} ${"─".repeat(Math.max(0, cols - title.length - hint.length - 4))} ${hint}╮`,
    )
    output += headerLine + "\n"

    const visibleRows = rows - 2
    const start = Math.min(Math.max(0, lines.length - visibleRows), scrollOffset)
    const end = Math.min(lines.length, start + visibleRows)

    for (let i = start; i < end; i++) {
      const line = lines[i] ?? ""
      output += line + "\n"
    }

    for (let i = end - start; i < visibleRows; i++) {
      output += "\n"
    }

    if (lines.length > visibleRows) {
      const scrollInfo = theme.muted(
        `  ${start + 1}-${end} of ${lines.length} (${Math.round((end / lines.length) * 100)}%)`,
      )
      output += scrollInfo
    }

    output += theme.muted(`╰${"─".repeat(cols - 2)}╯`)
    output += ansiEscapes.cursorShow
    process.stdout.write(output)
  }

  function cleanup() {
    if (cleanedUp) return
    cleanedUp = true
    // Best-effort restore of terminal state — stdin may already be in a clean state
    try {
      process.stdin.setRawMode(wasRaw ?? false)
    } catch {}
    process.stdin.pause()
    process.stdout.write(ansiEscapes.exitAlternativeScreen)
    process.stdout.write(ansiEscapes.cursorShow)
  }

  const onData = (raw: string) => {
    const key = parseKey(raw)
    if (key.type === "ctrl_q" || key.type === "ctrl_c") {
      result = "quit"
      running = false
      return
    }
    if (key.type === "escape" && options?.back) {
      result = "back"
      running = false
      return
    }
    if (key.type === "up" || key.type === "page_up") {
      scrollOffset = Math.max(0, scrollOffset - (key.type === "page_up" ? 10 : 1))
      render()
    } else if (key.type === "down" || key.type === "page_down") {
      scrollOffset = Math.min(lines.length, scrollOffset + (key.type === "page_down" ? 10 : 1))
      render()
    }
  }

  process.stdin.on("data", onData)
  process.stdout.write(ansiEscapes.enterAlternativeScreen)
  render()

  await new Promise<void>((resolve) => {
    const id = setInterval(() => {
      if (!running) {
        clearInterval(id)
        resolve()
      }
    }, 100)
  })

  process.stdin.off("data", onData)
  cleanup()
  return result
}
