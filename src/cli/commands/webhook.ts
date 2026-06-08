/**
 * webhook — CLI command to start the multi-platform webhook receiver.
 *
 * Starts an HTTP server with endpoints for:
 *   - GitHub/GitLab webhooks (auto-review PRs, push analysis)
 *   - Twilio SMS webhooks (via handleTwilioWebhook)
 *   - Twilio WhatsApp webhooks (via handleTwilioWebhook)
 *   - Generic JSON webhooks (queues to AgentPool)
 *   - Health check
 */

import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"
import { credentialVault } from "../../vault"
import { createWebhookAdapter } from "../../adapters"

export function registerWebhook(program: Command) {
  program
    .command("webhook")
    .description("Start the multi-platform webhook receiver (GitHub, Twilio, generic)")
    .option("-p, --port <port>", "Port to listen on", "9090")
    .option("--host <host>", "Host to bind to", "0.0.0.0")
    .option("--secret <secret>", "Webhook secret for payload verification")
    .option("--github-token <token>", "GitHub token for posting PR comments")
    .option("--no-review", "Disable auto PR review")
    .option("--no-fix", "Disable auto fix on push")
    .option("--twilio", "Enable Twilio SMS/WhatsApp webhook endpoints")
    .option("--generic", "Enable generic JSON webhook endpoint")
    .option("--generic-secret <secret>", "HMAC secret for generic webhook verification")
    .action(handleWebhook)
}

async function handleWebhook(opts: {
  port?: string
  host?: string
  secret?: string
  githubToken?: string
  review?: boolean
  fix?: boolean
  twilio?: boolean
  generic?: boolean
  genericSecret?: string
}) {
  showBanner()
  await credentialVault.initialize()

  const port = parseInt(opts.port ?? "9090", 10)
  const host = opts.host ?? "0.0.0.0"

  console.log(theme.heading("  🌐 Multi-Platform Webhook Receiver"))
  console.log()

  // ── Read Twilio config from vault if --twilio is set ───────────────
  let twilioSmsConfig: { accountSid: string; authToken: string; fromNumber: string } | undefined
  let twilioWhatsAppConfig: { accountSid: string; authToken: string; fromNumber: string } | undefined

  if (opts.twilio) {
    const accountSid = await credentialVault.get("TWILIO_ACCOUNT_SID", "global")
    const authToken = await credentialVault.get("TWILIO_AUTH_TOKEN", "global")
    const smsNumber = await credentialVault.get("TWILIO_PHONE_NUMBER", "global")
    const whatsappNumber = await credentialVault.get("TWILIO_WHATSAPP_NUMBER", "global")

    if (accountSid && authToken) {
      if (smsNumber) {
        twilioSmsConfig = { accountSid, authToken, fromNumber: smsNumber }
      }
      if (whatsappNumber) {
        twilioWhatsAppConfig = { accountSid, authToken, fromNumber: whatsappNumber }
      }
    }

    if (!twilioSmsConfig && !twilioWhatsAppConfig) {
      console.log(
        theme.warn("  ⚠ No Twilio numbers configured. Set TWILIO_PHONE_NUMBER and/or TWILIO_WHATSAPP_NUMBER in vault."),
      )
    }
  }

  // ── Start WebhookAdapter for Twilio/generic endpoints ──────────────
  const useAdapter = twilioSmsConfig || twilioWhatsAppConfig || opts.generic
  let adapter: ReturnType<typeof createWebhookAdapter> | null = null

  if (useAdapter) {
    adapter = createWebhookAdapter({
      port: port + 1, // Use next port to avoid conflict with GitHub webhook
      host,
      twilioSms: twilioSmsConfig,
      twilioWhatsApp: twilioWhatsAppConfig,
      enableGeneric: !!opts.generic,
      genericSecret: opts.genericSecret,
    })
    await adapter.start()
  }

  // ── Start GitHub/GitLab webhook handler ────────────────────────────
  const config = {
    secret: opts.secret,
    autoReviewPRs: opts.review !== false,
    autoFixOnPush: opts.fix !== false,
    githubToken: opts.githubToken,
  }

  console.log(`  Port:          ${theme.accent(String(port))}`)
  console.log(`  Host:          ${theme.dim(host)}`)
  console.log(`  Auto-review:   ${config.autoReviewPRs ? theme.success("enabled") : theme.warn("disabled")}`)
  console.log(`  Auto-fix:      ${config.autoFixOnPush ? theme.success("enabled") : theme.warn("disabled")}`)
  console.log(`  Auth:          ${config.secret ? theme.success("HMAC verification") : theme.warn("none")}`)
  console.log()

  if (useAdapter) {
    console.log(
      `  Twilio SMS:    ${twilioSmsConfig ? theme.success(`/webhook/twilio/sms (port ${port + 1})`) : theme.warn("disabled")}`,
    )
    console.log(
      `  Twilio WhatsApp: ${twilioWhatsAppConfig ? theme.success(`/webhook/twilio/whatsapp (port ${port + 1})`) : theme.warn("disabled")}`,
    )
    console.log(
      `  Generic:       ${opts.generic ? theme.success(`/webhook/generic (port ${port + 1})`) : theme.warn("disabled")}`,
    )
    console.log()
  }

  const { createWebhookHandler } = await import("../../api/webhook-handler")
  const handler = createWebhookHandler(config)

  const server = Bun.serve({
    port,
    hostname: host,
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url)

      // Health check
      if (url.pathname === "/health" && request.method === "GET") {
        return new Response(
          JSON.stringify({
            status: "ok",
            gitHubWebhook: `http://${host}:${port}/api/v1/webhook/github`,
            twilioEndpoints: useAdapter ? `http://${host}:${port + 1}/webhook/twilio/...` : undefined,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        )
      }

      return handler(request)
    },
  })

  console.log(theme.success(`  ✓ GitHub/GitLab webhooks on http://${host}:${port}/api/v1/webhook/github`))
  if (useAdapter) {
    console.log(theme.success(`  ✓ Platform webhooks on http://${host}:${port + 1}/webhook/twilio/...`))
  }
  console.log()
  console.log(`  ${theme.dim("Endpoints:")}`)
  console.log(`  ${theme.dim("  POST /api/v1/webhook/github    — GitHub webhooks")}`)
  console.log(`  ${theme.dim("  POST /api/v1/webhook/gitlab    — GitLab webhooks")}`)
  if (twilioSmsConfig) console.log(`  ${theme.dim(`  POST /webhook/twilio/sms       — Twilio SMS (port ${port + 1})`)}`)
  if (twilioWhatsAppConfig)
    console.log(`  ${theme.dim(`  POST /webhook/twilio/whatsapp  — Twilio WhatsApp (port ${port + 1})`)}`)
  if (opts.generic) console.log(`  ${theme.dim(`  POST /webhook/generic          — Generic JSON (port ${port + 1})`)}`)
  console.log()
  console.log(theme.dim("  Press Ctrl+C to stop"))

  process.on("SIGINT", async () => {
    server.stop()
    try {
      if (adapter) await adapter.stop()
    } catch {
      /* ignore adapter stop failure */
    }
    console.log(theme.dim("\n  Webhook receiver stopped"))
    process.exit(0)
  })

  await new Promise(() => {})
}
