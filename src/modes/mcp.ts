import { theme } from "../cli/theme"
import { showInfoScreen } from "./info-screen"
import { getMCPClients } from "../mcp/client"
import type { Mode } from "./types"

export const mcpMode: Mode = {
  id: "mcp",
  name: "MCP",
  description: "Model Context Protocol server management",

  async run() {
    const clients = getMCPClients()
    const lines: string[] = [""]

    lines.push(`  ${theme.heading("MCP Servers")}`)
    lines.push("")

    if (clients.length === 0) {
      lines.push(`  ${theme.muted("No MCP servers configured.")}`)
      lines.push("")
      lines.push(`  ${theme.muted("Configure servers in aegis.config.json under 'mcp.servers':")}`)
      lines.push(`  ${theme.dim('  { "mcp": { "servers": [{ "name": "...", "url": "...", "apiKey": "..." }] } }')}`)
    } else {
      for (const c of clients) {
        const status = c.enabled === false ? theme.muted("disabled") : theme.success("enabled")
        lines.push(`  ${theme.accent(c.name.padEnd(20))} ${c.url} ${status}`)
      }
    }

    lines.push("")
    lines.push(`  ${theme.bold("Available commands:")}`)
    lines.push(`  ${theme.accent("●")} ${theme.dim("aegis mcp list")}     - List configured MCP servers`)
    lines.push(`  ${theme.accent("●")} ${theme.dim("aegis mcp connect")}  - Connect to MCP servers`)
    lines.push(`  ${theme.accent("●")} ${theme.dim("aegis mcp serve")}    - Expose Aegis as MCP server`)
    lines.push("")
    lines.push(`  ${theme.muted("Press ↑↓ to scroll, Esc or Ctrl+Q to go back")}`)

    return showInfoScreen("MCP", lines, { back: true })
  },
}
