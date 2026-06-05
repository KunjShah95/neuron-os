/**
 * webhook — CLI command to start the webhook receiver.
 *
 * Starts an HTTP endpoint that accepts GitHub/GitLab webhooks
 * and dispatches tasks to the AgentPool.
 */

import type { Command } from "commander"
import { theme } from "../theme"

export function registerWebhook(program: Command) {
  program
    .command("webhook")
    .description("Start the webhook receiver for GitHub/GitLab auto-review")
    .option("-p, --port <port>", "Port to listen on", "9090")
    .option("--host <host>", "Host to bind to", "0.0.0.0")
    .option("--secret <secret>", "Webhook secret for payload verification")
    .option("--github-token <token>", "GitHub token for posting PR comments")
    .option("--no-review", "Disable auto PR review")
    .option("--no-fix", "Disable auto fix on push")
    .action(async (opts: {
      port?: string; host?: string; secret?: string; githubToken?: string
      review?: boolean; fix?: boolean
    }) => {
      const port = parseInt(opts.port ?? "9090", 10)

      console.log(theme.heading("  🌐 Webhook Receiver"))
      console.log()

      const config = {
        secret: opts.secret,
        autoReviewPRs: opts.review !== false,
        autoFixOnPush: opts.fix !== false,
        githubToken: opts.githubToken,
      }

      console.log(`  Port:          ${theme.accent(String(port))}`)
      console.log(`  Auto-review:   ${config.autoReviewPRs ? theme.success("enabled") : theme.warn("disabled")}`)
      console.log(`  Auto-fix:      ${config.autoFixOnPush ? theme.success("enabled") : theme.warn("disabled")}`)
      console.log(`  Auth:          ${config.secret ? theme.success("HMAC verification") : theme.warn("none")}`)
      console.log()

      const { createWebhookHandler } = await import("../../api/webhook-handler")
      const handler = createWebhookHandler(config)

      const server = Bun.serve({
        port,
        hostname: opts.host ?? "0.0.0.0",
        async fetch(request: Request): Promise<Response> {
          const url = new URL(request.url)

          // Health check
          if (url.pathname === "/health" && request.method === "GET") {
            return new Response(JSON.stringify({ status: "ok" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          }

          return handler(request)
        },
      })

      console.log(theme.success(`  ✓ Listening on http://${opts.host ?? "0.0.0.0"}:${port}`))
      console.log()
      console.log(`  ${theme.dim("Endpoints:")}`)
      console.log(`  ${theme.dim("  POST /api/v1/webhook/github")}`)
      console.log(`  ${theme.dim("  POST /api/v1/webhook/gitlab")}`)
      console.log()
      console.log(`  ${theme.dim("Configure your repo webhook to point to:")}`)
      console.log(`  ${theme.dim(`  http://<your-host>:${port}/api/v1/webhook/github`)}`)
      console.log()
      console.log(theme.dim("  Press Ctrl+C to stop"))

      process.on("SIGINT", () => {
        server.stop()
        console.log(theme.dim("\n  Webhook receiver stopped"))
        process.exit(0)
      })

      await new Promise(() => {})
    })
}
