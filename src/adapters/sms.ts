/**
 * SMS adapter — powered by Twilio's Programmable SMS API.
 *
 * Sends SMS text messages via Twilio.
 * For incoming SMS, set up a Twilio webhook pointing to your server.
 *
 * Commands: /agent, /ask, /search, /status, /config, /models, /memory,
 *           /cron, /skill, /agents, /logs, /chat, /docs, /plan, /research,
 *           /history, /help, /start
 */

import twilio from "twilio"
import type { PlatformAdapter, PlatformSendOptions } from "./types"
import { createLogger } from "../cli/logger"
import { handleTwilioWebhook, clipTwilio } from "./bot-commands"

const log = createLogger("adapter:sms")

interface SMSConfig {
  accountSid: string
  authToken: string
  fromNumber: string // Twilio phone number, e.g. "+14155552671"
  allowedUserIds?: string[]
  project?: string
  /** Optional HTTP server for receiving incoming SMS via webhook */
  webhookPort?: number
}

function clipSMS(text: string): string {
  return clipTwilio(text, 1600)
}

export function createSMSAdapter(config: SMSConfig): PlatformAdapter {
  const twilioClient = twilio(config.accountSid, config.authToken)
  let server: Bun.Server<undefined> | null = null

  async function sendReply(to: string, text: string) {
    await twilioClient.messages.create({
      from: config.fromNumber,
      to,
      body: clipSMS(text),
    })
  }

  return {
    name: "sms",

    async start() {
      log.info(`SMS adapter configured with number ${config.fromNumber}`)

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
            )
          },
        })
        log.info(`SMS webhook server listening on port ${config.webhookPort}`)
      }
    },

    async stop() {
      if (server) {
        server.stop()
        server = null
      }
      log.info("SMS adapter stopped")
    },

    async send(opts: PlatformSendOptions) {
      await twilioClient.messages.create({
        from: config.fromNumber,
        to: opts.channelId,
        body: clipSMS(opts.text),
      })
      log.info(`SMS sent to ${opts.channelId}`)
    },
  }
}
