import type { Command } from "commander"
import { theme } from "../theme"

export function registerServe(program: Command) {
  program
    .command("serve")
    .description("Start the HTTP API server")
    .option("-p, --port <port>", "Port to listen on", "8080")
    .option("--host <host>", "Host to bind to", "0.0.0.0")
    .option("--key <key>", "API key for authentication")
    .option("--cron", "Also start the cron engine", false)
    .action(async (opts: { port?: string; host?: string; key?: string; cron?: boolean }) => {
      const { startApiServer } = await import("../../api")
      const port = parseInt(opts.port ?? "8080", 10)

      console.log(theme.heading("  Starting Aegis API Server"))
      console.log()

      const server = startApiServer({
        port,
        host: opts.host ?? "0.0.0.0",
        apiKey: opts.key,
      })

      if (opts.cron) {
        const { startCronEngine, ensureHeartbeatFile } = await import("../../cron")
        await ensureHeartbeatFile()
        startCronEngine()
        console.log(theme.info("  ⏰ Cron engine started"))
      }

      console.log()
      console.log(theme.dim("  Press Ctrl+C to stop"))

      process.on("SIGINT", () => {
        server.stop()
        process.exit(0)
      })

      // Keep alive
      await new Promise(() => {})
    })
}
