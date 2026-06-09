import type { Command } from "commander"
import { theme } from "../theme"

export function registerServe(program: Command) {
  program
    .command("serve")
    .description("Start the HTTP API server")
    .option("-p, --port <port>", "Port to listen on", "8080")
    .option("--host <host>", "Host to bind to", "0.0.0.0")
    .option("--key <key>", "API key for authentication")
    .option("--auth", "Enable RBAC authentication on all endpoints", false)
    .option("--auth-required", "Require valid API key for all requests (default: false)", false)
    .option("--cron", "Also start the cron engine", false)
    .option("--auto-improve", "Start self-improvement scheduler (default)", true)
    .option("--no-auto-improve", "Skip self-improvement scheduler startup")
    .option("--webhook-secret <secret>", "Enable webhook routes at /api/v1/webhook/* with HMAC verification")
    .option("--session-db", "Enable session store endpoints at /api/v1/sessions/*")
    .option("--ws", "Enable WebSocket gateway on port 8081", false)
    .option("--ws-port <port>", "WebSocket gateway port", "8081")
    .action(
      async (opts: {
        port?: string
        host?: string
        key?: string
        auth?: boolean
        authRequired?: boolean
        cron?: boolean
        autoImprove?: boolean
        webhookSecret?: string
        sessionDb?: boolean
        ws?: boolean
        wsPort?: string
      }) => {
        const { startApiServer } = await import("../../api")
        const port = parseInt(opts.port ?? "8080", 10)
        const { gateway } = await import("../../adapters/gateway")

        console.log(theme.heading("  Starting Aegis API Server"))
        console.log()

        const server = startApiServer({
          port,
          host: opts.host ?? "0.0.0.0",
          apiKey: opts.key,
          auth: opts.auth,
          authRequired: opts.authRequired,
          webhookConfig: opts.webhookSecret
            ? { secret: opts.webhookSecret, autoReviewPRs: true, autoFixOnPush: true }
            : undefined,
          sessionDb: opts.sessionDb ?? false,
        })

        if (opts.cron) {
          const { startCronEngine, ensureHeartbeatFile } = await import("../../cron")
          await ensureHeartbeatFile()
          startCronEngine()
          console.log(theme.info("  ⏰ Cron engine started"))

          const { registerCrawlJobs } = await import("../../docs-crawl")
          registerCrawlJobs()
          console.log(theme.info("  📚 Docs-crawl scheduled jobs registered"))
        }

        if (opts.autoImprove !== false) {
          try {
            const { ImprovementScheduler } = await import("../../improve/scheduler")
            const scheduler = new ImprovementScheduler()
            const ids = scheduler.registerDefaults()
            console.log(theme.info(`  🧠 Self-improvement scheduler started (${ids.length} job(s))`))
          } catch {
            console.log(theme.dim("  Self-improvement scheduler unavailable (non-fatal)"))
          }
        }

        if (opts.webhookSecret) {
          console.log(theme.info(`  🌐 Webhook routes enabled (secret: ${opts.webhookSecret.slice(0, 4)}…)`))
        }

        if (opts.sessionDb) {
          console.log(theme.info("  📂 Session store endpoints enabled at /api/v1/sessions/*"))
        }

        // Start WebSocket gateway if requested
        if (opts.ws) {
          const { WsGatewayAdapter } = await import("../../adapters/ws-gateway")
          const wsPort = parseInt(opts.wsPort ?? "8081", 10)
          const wsAdapter = new WsGatewayAdapter(wsPort)

          // Wire onMessage to gateway
          wsAdapter.onMessage = async (msg) => {
            await gateway.handleMessage(msg)
          }

          gateway.register(wsAdapter)
          await wsAdapter.start()

          console.log(theme.info(`  WebSocket gateway started on port ${wsPort}`))

          // Wire session manager to WS gateway for state streaming
          const { SessionManager } = await import("../../session/manager")
          const sessionManager = new SessionManager()
          sessionManager.onStateChange = (sessionId, state) => {
            wsAdapter.broadcastSystem({ sessionId, state })
          }
          console.log(theme.info("  Multi-user session manager enabled"))
        }

        console.log()
        console.log(theme.dim("  Press Ctrl+C to stop"))

        const handleSignal = () => {
          server.stop()
          process.exit(0)
        }
        process.on("SIGINT", handleSignal)
        process.on("SIGTERM", handleSignal)

        // Keep alive
        await new Promise(() => {})
      },
    )
}
