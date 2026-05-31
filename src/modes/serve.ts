import { theme } from "../cli/theme"
import { showInfoScreen } from "./info-screen"
import type { Mode } from "./types"

export const serveMode: Mode = {
  id: "serve",
  name: "API Server",
  description: "HTTP API server status and management",

  async run() {
    const lines: string[] = [""]

    lines.push(`  ${theme.heading("API Server")}`)
    lines.push("")
    lines.push(`  ${theme.muted("The API server provides a REST interface to Aegis.")}`)
    lines.push("")
    lines.push(`  ${theme.bold("Default options:")}`)
    lines.push(`  ${theme.accent("●")} Port: 8080`)
    lines.push(`  ${theme.accent("●")} Host: 0.0.0.0`)
    lines.push(`  ${theme.accent("●")} API key: optional`)
    lines.push(`  ${theme.accent("●")} Cron engine: optional (--cron)`)
    lines.push("")
    lines.push(`  ${theme.muted("Available endpoints:")}`)
    lines.push(`  ${theme.accent("●")} POST /api/chat`)
    lines.push(`  ${theme.accent("●")} GET  /api/health`)
    lines.push(`  ${theme.accent("●")} GET  /api/status`)
    lines.push("")
    lines.push(`  ${theme.muted("Start the server from the terminal:")}`)
    lines.push(`  ${theme.dim("  aegis serve [--port 8080] [--host 0.0.0.0] [--key <key>] [--cron]")}`)
    lines.push("")
    lines.push(`  ${theme.muted("Press Ctrl+Q to go back")}`)

    return showInfoScreen("API Server", lines, { back: true })
  },
}
