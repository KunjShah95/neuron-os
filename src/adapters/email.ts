/**
 * Email adapter — SMTP-based email sending via nodemailer.
 *
 * Supports sending emails through any SMTP server.
 * Receiving emails is not supported (SMTP is push-only).
 * For incoming email handling, integrate with a service like SendGrid Inbound Parse.
 */

import nodemailer from "nodemailer"
import type { PlatformAdapter, PlatformSendOptions } from "./types"
import { createLogger } from "../cli/logger"

const log = createLogger("adapter:email")

interface EmailConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

export function createEmailAdapter(config: EmailConfig): PlatformAdapter {
  let transporter: nodemailer.Transporter | null = null

  return {
    name: "email",

    async start() {
      transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.pass,
        },
      })

      // Verify connection
      try {
        await transporter.verify()
        log.info(`Email adapter connected to ${config.host}:${config.port}`)
      } catch (err: any) {
        log.error(`Email adapter verification failed: ${err.message}`)
        throw err
      }
    },

    async stop() {
      if (transporter) {
        transporter.close()
        transporter = null
        log.info("Email adapter stopped")
      }
    },

    async send(opts: PlatformSendOptions) {
      if (!transporter) {
        throw new Error("Email adapter not started")
      }

      await transporter.sendMail({
        from: config.from,
        to: opts.channelId,  // channelId holds the recipient email address
        subject: "Neuron OS Notification",
        text: opts.text.replace(/\*([^*]+)\*/g, "$1"), // strip markdown bold
        replyTo: opts.replyToId,
      })

      log.info(`Email sent to ${opts.channelId}`)
    },
  }
}
