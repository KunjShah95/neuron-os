/**
 * WhatsApp adapter — powered by Twilio's WhatsApp Business API.
 *
 * Sends and receives WhatsApp messages via Twilio.
 * Requires a Twilio account with WhatsApp sandbox or approved Business Profile.
 *
 * Commands: /agent, /ask, /search, /status, /config, /models, /memory,
 *           /cron, /skill, /agents, /logs, /chat, /docs, /plan, /research,
 *           /history, /help, /start
 */

import twilio from "twilio"
import type { PlatformAdapter, PlatformSendOptions } from "./types"
import { createLogger } from "../cli/logger"
import { handleTwilioWebhook, clipTwilio } from "./bot-commands"

const log = createLogger("adapter:whatsapp")

interface WhatsAppConfig {
  accountSid: string
  authToken: string
  fromNumber: string // Twilio WhatsApp number, e.g. "whatsapp:+14155238886"
  allowedUserIds?: string[]
  project?: string
  /** Optional HTTP server for receiving incoming messages via webhook */
  webhookPort?: number
}

function clipWhatsApp(text: string): string {
  return clipTwilio(text, 1600)
}

export function createWhatsAppAdapter(config: WhatsAppConfig): PlatformAdapter {
  const twilioClient = twilio(config.accountSid, config.authToken)
  let server: Bun.Server<any> | null = null

  async function sendReply(to: string, text: string) {
    await twilioClient.messages.create({
      from: config.fromNumber,
      to,
      body: clipWhatsApp(text),
    })
  }

  return {
    name: "whatsapp",

    async start() {
      log.info(`WhatsApp adapter configured with number ${config.fromNumber}`)

      // Start webhook server if port specified
      if (config.webhookPort) {
        const { serve } = await import("bun")
        server = serve({
          port: config.webhookPort,
          fetch: async (req) => {
            return handleTwilioWebhook(
              req,
              {
                allowedUserIds: config.allowedUserIds,
                project: config.project,
                fromNumber: config.fromNumber,
              },
              sendReply,
              {
                stripPrefix: "whatsapp:",
                validateTo: true,
              },
            )
          },
        })
        log.info(`WhatsApp webhook server listening on port ${config.webhookPort}`)
      }
    },

    async stop() {
      if (server) {
        server.stop()
        server = null
      }
      log.info("WhatsApp adapter stopped")
    },

    async send(opts: PlatformSendOptions) {
      await twilioClient.messages.create({
        from: config.fromNumber,
        to: opts.channelId,
        body: clipWhatsApp(opts.text),
      })
      log.info(`WhatsApp message sent to ${opts.channelId}`)
    },
  }
}
