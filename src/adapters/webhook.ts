/**
 * Webhook adapter — general-purpose HTTP server for receiving webhooks
 * from multiple platforms, powered by the shared handleTwilioWebhook utility.
 *
 * Endpoints:
 *   /health                  — Health check (GET)
 *   /webhook/twilio/sms      — Twilio SMS webhook (POST, form data)
 *   /webhook/twilio/whatsapp — Twilio WhatsApp webhook (POST, form data)
 *   /webhook/generic         — Generic JSON webhook (POST, JSON)
 *
 * When Twilio credentials are configured, the adapter uses handleTwilioWebhook
 * to parse form data, validate auth, extract commands, and send replies.
 */

import type { PlatformAdapter, PlatformSendOptions } from "./types"
import { createLogger } from "../cli/logger"
import { taskQueue } from "../agent/queue"
import { handleTwilioWebhook, clipTwilio } from "./bot-commands"
import { verifyHmac } from "../api/hmac"

const log = createLogger("adapter:webhook")

export interface TwilioWebhookEndpoint {
  accountSid: string
  authToken: string
  fromNumber: string
  allowedUserIds?: string[]
  project?: string
}

export interface WebhookAdapterConfig {
  port: number
  host?: string
  /** Twilio SMS endpoint config (enables /webhook/twilio/sms) */
  twilioSms?: TwilioWebhookEndpoint
  /** Twilio WhatsApp endpoint config (enables /webhook/twilio/whatsapp) */
  twilioWhatsApp?: TwilioWebhookEndpoint
  /** Enable generic JSON webhook endpoint at /webhook/generic */
  enableGeneric?: boolean
  /** Optional secret for generic webhook HMAC verification */
  genericSecret?: string
}

export function createWebhookAdapter(config: WebhookAdapterConfig): PlatformAdapter {
  let server: Bun.Server<any> | null = null
  let twilioSmsClient: any = null
  let twilioWhatsAppClient: any = null

  function listEnabledEndpoints(): string[] {
    const endpoints: string[] = ["/health"]
    if (config.twilioSms) endpoints.push("/webhook/twilio/sms")
    if (config.twilioWhatsApp) endpoints.push("/webhook/twilio/whatsapp")
    if (config.enableGeneric) endpoints.push("/webhook/generic")
    return endpoints
  }

  return {
    name: "webhook",

    async start() {
      // Create Twilio clients once at startup
      if (config.twilioSms) {
        const twilio = await import("twilio")
        twilioSmsClient = twilio.default(config.twilioSms.accountSid, config.twilioSms.authToken)
      }
      if (config.twilioWhatsApp) {
        const twilio = await import("twilio")
        twilioWhatsAppClient = twilio.default(config.twilioWhatsApp.accountSid, config.twilioWhatsApp.authToken)
      }

      const { serve } = await import("bun")

      server = serve({
        port: config.port,
        hostname: config.host ?? "0.0.0.0",
        fetch: async (req: Request): Promise<Response> => {
          const url = new URL(req.url)

          // ── Health check ─────────────────────────────────────────
          if (url.pathname === "/health" && req.method === "GET") {
            return new Response(
              JSON.stringify({
                status: "ok",
                endpoints: listEnabledEndpoints(),
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              },
            )
          }

          // ── Twilio SMS webhook ───────────────────────────────────
          if (url.pathname === "/webhook/twilio/sms" && config.twilioSms && twilioSmsClient) {
            const client = twilioSmsClient

            async function sendSmsReply(to: string, text: string) {
              await client.messages.create({
                from: config.twilioSms!.fromNumber,
                to,
                body: clipTwilio(text, 1600),
              })
            }

            return handleTwilioWebhook(
              req,
              {
                allowedUserIds: config.twilioSms.allowedUserIds,
                project: config.twilioSms.project,
                fromNumber: config.twilioSms.fromNumber,
              },
              sendSmsReply,
            )
          }

          // ── Twilio WhatsApp webhook ──────────────────────────────
          if (url.pathname === "/webhook/twilio/whatsapp" && config.twilioWhatsApp && twilioWhatsAppClient) {
            const client = twilioWhatsAppClient

            async function sendWhatsAppReply(to: string, text: string) {
              await client.messages.create({
                from: config.twilioWhatsApp!.fromNumber,
                to,
                body: clipTwilio(text, 1600),
              })
            }

            return handleTwilioWebhook(
              req,
              {
                allowedUserIds: config.twilioWhatsApp.allowedUserIds,
                project: config.twilioWhatsApp.project,
                fromNumber: config.twilioWhatsApp.fromNumber,
              },
              sendWhatsAppReply,
              {
                stripPrefix: "whatsapp:",
                validateTo: true,
              },
            )
          }

          // ── Generic JSON webhook ─────────────────────────────────
          if (url.pathname === "/webhook/generic" && req.method === "POST" && config.enableGeneric) {
            try {
              const body = (await req.json()) as Record<string, unknown>

              // Optional HMAC verification
              if (config.genericSecret) {
                const signature = req.headers.get("x-webhook-signature") || ""
                const valid = await verifyHmac(JSON.stringify(body), config.genericSecret, signature)
                if (!valid) {
                  return new Response(JSON.stringify({ error: "Invalid signature" }), {
                    status: 401,
                    headers: { "Content-Type": "application/json" },
                  })
                }
              }

              // Extract goal from payload or use default
              const goal = (body.goal as string) || (body.text as string) || JSON.stringify(body)
              const taskId = taskQueue.submit(`[webhook] ${goal}`, "normal")

              log.info(`Generic webhook processed: task ${taskId}`)
              return new Response(JSON.stringify({ status: "accepted", taskId }), {
                status: 202,
                headers: { "Content-Type": "application/json" },
              })
            } catch (err: any) {
              return new Response(JSON.stringify({ error: err.message ?? "Invalid payload" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
              })
            }
          }

          // ── 404 for unknown routes ──────────────────────────────
          return new Response(
            JSON.stringify({
              error: "Not found",
              available: listEnabledEndpoints(),
            }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            },
          )
        },
      })

      log.info(`Webhook adapter listening on ${config.host ?? "0.0.0.0"}:${config.port}`)
    },

    async stop() {
      if (server) {
        server.stop()
        server = null
      }
      log.info("Webhook adapter stopped")
    },

    async send(_opts: PlatformSendOptions) {
      // Webhook adapter is receive-only via HTTP endpoints
      throw new Error(
        "Webhook adapter does not support outbound sends. Use gateway.sendReply() to send through another adapter.",
      )
    },
  }
}
