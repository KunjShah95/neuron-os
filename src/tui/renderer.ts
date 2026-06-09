import ansiEscapes from "ansi-escapes"
import { calculateLayout } from "./layout"
import {
  renderHeader,
  renderAgentList,
  renderActivityLog,
  renderStatusBar,
  renderCommandBar,
  renderProviders,
  renderSessions,
  renderA2uiPanel,
} from "./components"
import { createInitialState, updateMetrics, addLogEntry } from "./store"
import { parseKey, handleKey } from "./input"
import { executeCommand } from "./commands"
import { theme, box } from "../cli/theme"

export async function startDashboard(): Promise<void> {
  const state = createInitialState()
  const rows = process.stdout.rows ?? 24
  const cols = process.stdout.columns ?? 80

  // Guard: TTY required
  if (!process.stdout.isTTY) {
    console.error("Dashboard requires a TTY terminal")
    process.exit(1)
  }

  // Enter alternate screen
  process.stdout.write(ansiEscapes.enterAlternativeScreen)

  // Set raw mode
  const wasRaw = process.stdin.isRaw
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding("utf8")

  let running = true
  let cleanedUp = false
  let frameTimer: ReturnType<typeof setTimeout> | null = null
  let metricsTimer: ReturnType<typeof setInterval> | null = null

  // Setup input handler
  const onData = (raw: string) => {
    const key = parseKey(raw)
    handleKey(state, key).then((result) => {
      if (result === "quit") {
        running = false
      }
    })

    if (key.type === "enter" && state.ui.focus === "command") {
      const lastCmd = state.ui.history[state.ui.history.length - 1]
      if (lastCmd) {
        addLogEntry(state, { text: `> ${lastCmd}`, type: "info" })
        // Fire-and-forget command execution — results logged via addLogEntry
        executeCommand(state, lastCmd).catch((err) => {
          addLogEntry(state, { text: `Command error: ${String(err)}`, type: "error" })
        })
      }
    }
  }

  process.stdin.on("data", onData)

  // Metrics polling every 2 seconds
  metricsTimer = setInterval(() => {
    updateMetrics(state)
  }, 2000)

  // Initial metrics
  updateMetrics(state)
  addLogEntry(state, { text: `Terminal: ${cols}x${rows}`, type: "info" })
  addLogEntry(state, { text: "Tab to cycle focus, Ctrl+Q to quit", type: "event" })

  // Render loop
  async function render() {
    if (!running) return cleanup()

    if (state.dirty) {
      const layout = calculateLayout(rows, cols)

      let output = ansiEscapes.cursorHide
      output += ansiEscapes.cursorTo(0, 0)

      // Header
      output += renderHeader(layout.header) + "\n"

      // Left panel: agents / providers / sessions depending on focus
      let leftLines: string[]
      if (state.ui.focus === "providers") {
        leftLines = renderProviders(state, layout.agents)
      } else if (state.ui.focus === "sessions") {
        leftLines = renderSessions(state, layout.agents)
      } else {
        leftLines = renderAgentList(state, layout.agents)
      }
      for (let y = 0; y < layout.agents.height; y++) {
        output += ansiEscapes.cursorTo(layout.agents.x, layout.agents.y + y)
        output += leftLines[y] ?? ""
      }

      // Divider between agents and A2UI panels
      const divider1X = layout.agents.width
      for (let y = 0; y < layout.a2ui.height; y++) {
        output += ansiEscapes.cursorTo(divider1X, layout.header.height + y)
        output += theme.muted(box.v)
      }

      // A2UI panel (center)
      const a2uiLines = renderA2uiPanel(state, layout.a2ui)
      for (let y = 0; y < layout.a2ui.height; y++) {
        output += ansiEscapes.cursorTo(layout.a2ui.x, layout.a2ui.y + y)
        output += a2uiLines[y] ?? ""
      }

      // Divider between A2UI and log panels
      const divider2X = layout.a2ui.x + layout.a2ui.width
      for (let y = 0; y < layout.log.height; y++) {
        output += ansiEscapes.cursorTo(divider2X, layout.header.height + y)
        output += theme.muted(box.v)
      }

      // Activity log (right panel)
      const logLines = renderActivityLog(state, layout.log)
      for (let y = 0; y < layout.log.height; y++) {
        output += ansiEscapes.cursorTo(layout.log.x, layout.log.y + y)
        output += logLines[y] ?? ""
      }

      // Status bar
      output += ansiEscapes.cursorTo(0, layout.status.y)
      output += renderStatusBar(state, layout.status)

      // Command bar
      output += ansiEscapes.cursorTo(0, layout.command.y)
      output += renderCommandBar(state, layout.command)

      // Restore cursor
      output += ansiEscapes.cursorShow

      process.stdout.write(output)
      state.dirty = false
    }

    frameTimer = setTimeout(render, 100) // 10fps
  }

  function cleanup() {
    if (cleanedUp) return
    cleanedUp = true
    if (frameTimer) clearTimeout(frameTimer)
    if (metricsTimer) clearInterval(metricsTimer)
    process.off("SIGINT", cleanup)
    process.off("SIGTERM", cleanup)
    process.stdin.off("data", onData)
    try {
      process.stdin.setRawMode(wasRaw ?? false)
    } catch {
      /* ignore */
    }
    process.stdin.pause()
    process.stdout.write(ansiEscapes.exitAlternativeScreen)
    process.stdout.write(ansiEscapes.cursorShow)
    process.exit(0)
  }

  process.on("SIGINT", cleanup)
  process.on("SIGTERM", cleanup)

  render()
}
