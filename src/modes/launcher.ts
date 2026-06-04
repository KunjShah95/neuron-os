import ansiEscapes from "ansi-escapes"
import { theme, box } from "../cli/theme"
import { listModes } from "./registry"
import { parseKey } from "./types"
import { getVersionDisplay } from "../version"

export async function runModeLauncher(): Promise<"quit"> {
  const modes = listModes().filter((m) => !m.id.startsWith("_"))
  let selected = 0

  if (!process.stdout.isTTY) {
    console.error("Mode launcher requires a TTY terminal")
    process.exit(1)
  }

  const wasRaw = process.stdin.isRaw
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding("utf8")

  const cols = process.stdout.columns ?? 80

  let running = true
  let cleanedUp = false

  function render() {
    let output = ansiEscapes.cursorHide + ansiEscapes.cursorTo(0, 0)

    const title = " AEGIS MODE SELECTOR "
    const version = ` ${getVersionDisplay()}  ↑↓ navigate  Enter select  Ctrl+Q quit  `
    const titleLine = theme.muted(box.tl + box.h + " ") + theme.heading(title) + theme.muted(" " + box.h.repeat(Math.max(0, cols - title.length - version.length - 4)) + " " + version + box.tr)
    output += titleLine + "\n"
    output += "\n"

    for (let i = 0; i < modes.length; i++) {
      const m = modes[i]!
      const prefix = i === selected ? theme.accent("  > ") : "    "
      const name = i === selected ? theme.textBright(m.name) : theme.text(m.name)
      const desc = theme.muted(` ${m.description}`)
      output += prefix + name + desc + "\n"
    }

    output += "\n"
    output += theme.muted(` ${box.bl}${box.h.repeat(cols - 2)}${box.br}`)
    output += ansiEscapes.cursorShow
    process.stdout.write(output)
  }

  function cleanup() {
    if (cleanedUp) return
    cleanedUp = true
    try {
      process.stdin.setRawMode(wasRaw ?? false)
    } catch {
      // Best-effort restore — stdin may already be cleaned up
    }
    process.stdin.pause()
    process.stdout.write(ansiEscapes.exitAlternativeScreen)
    process.stdout.write(ansiEscapes.cursorShow)
  }

  process.stdin.on("data", async (raw: string) => {
    const key = parseKey(raw)

    if (key.type === "ctrl_q" || key.type === "ctrl_c") {
      running = false
      cleanup()
      process.exit(0)
    }

    if (key.type === "up") {
      selected = Math.max(0, selected - 1)
      render()
    } else if (key.type === "down") {
      selected = Math.min(modes.length - 1, selected + 1)
      render()
    } else if (key.type === "enter") {
      const mode = modes[selected]
      if (!mode) return
      cleanup()
      process.stdin.removeAllListeners("data")

      const result = await mode.run()
      running = false
      if (result === "quit") process.exit(0)
    }
  })

  process.stdout.write(ansiEscapes.enterAlternativeScreen)
  render()

  await new Promise<void>((resolve) => {
    const check = () => { if (!running) resolve() }
    const id = setInterval(check, 100)
    const interval = setInterval(() => {
      if (!running) { clearInterval(id); clearInterval(interval); resolve() }
    }, 100)
  })

  cleanup()
  return "quit"
}
