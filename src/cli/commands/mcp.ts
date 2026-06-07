import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"

export function registerMCP(program: Command) {
  const mcp = program.command("mcp").description("Manage MCP (Model Context Protocol) servers")

  mcp
    .command("serve")
    .description("Start MCP server (expose neuron-os as MCP)")
    .option("-p, --port <port>", "HTTP port", "3100")
    .option("--host <host>", "Host to bind to", "0.0.0.0")
    .option("--key <key>", "API key")
    .option("--stdio", "Use stdio transport instead of HTTP", false)
    .action(async (opts: { port?: string; host?: string; key?: string; stdio?: boolean }) => {
      if (opts.stdio) {
        const { startMCPServerStdio } = await import("../../mcp")
        console.log(theme.info("  Starting MCP server (stdio transport)…"))
        await startMCPServerStdio()
        return
      }

      const { startMCPServerHTTP } = await import("../../mcp")
      const port = parseInt(opts.port ?? "3100", 10)
      startMCPServerHTTP({ port, host: opts.host ?? "0.0.0.0", apiKey: opts.key })
      console.log(theme.dim("  Press Ctrl+C to stop"))
      await new Promise(() => {})
    })

  mcp
    .command("connect")
    .description("Connect to external MCP servers (configured in aegis.config.json)")
    .action(async () => {
      const { connectMCPClients, getMCPClients } = await import("../../mcp/client")

      const clients = getMCPClients()
      if (clients.length === 0) {
        console.log(theme.dim("  No MCP servers configured."))
        console.log(theme.dim("  Add config in aegis.config.json under 'mcp.servers'"))
        return
      }

      console.log(theme.info(`  Connecting to ${clients.length} MCP server(s)…`))
      const count = await connectMCPClients()
      console.log(theme.success(`  ✓ Registered ${count} tools from MCP servers`))
    })

  // Default: show status
  mcp.action(async () => {
    showBanner()
    const { getMCPClients } = await import("../../mcp/client")
    const clients = getMCPClients()
    console.log()
    if (clients.length === 0) {
      console.log(`  ${theme.warn("No MCP servers configured")}`)
      console.log(`  ${theme.muted("  Add config in aegis.config.json under 'mcp.servers'")}`)
    } else {
      console.log(`  ${theme.heading(`MCP Servers (${clients.length})`)}`)
      console.log()
      for (const c of clients) {
        const status = c.enabled === false ? theme.muted("disabled") : theme.success("enabled")
        console.log(`  ${theme.accent(c.name.padEnd(20))} ${c.url} ${status}`)
      }
    }
    console.log()
    console.log(`  ${theme.muted("Subcommands: serve, connect, list")}`)
    console.log()
  })

  mcp
    .command("list")
    .alias("ls")
    .description("List configured MCP servers and registered tools")
    .action(async () => {
      const { getMCPClients } = await import("../../mcp/client")
      const clients = getMCPClients()

      if (clients.length === 0) {
        console.log(theme.dim("  No MCP servers configured."))
        return
      }

      console.log(theme.heading("  MCP Servers:"))
      console.log()
      for (const c of clients) {
        const status = c.enabled === false ? theme.muted("disabled") : theme.success("enabled")
        console.log(`  ${theme.accent(c.name.padEnd(20))} ${c.url} ${status}`)
      }
    })
}
