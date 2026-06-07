/**
 * Voice adapter — powered by Twilio's Programmable Voice API.
 *
 * Makes outbound phone calls with text-to-speech (TTS) via TwiML.
 * Text is converted to speech using the <Say> verb.
 *
 * This is an outbound-only adapter. Incoming calls are not handled
 * (set up a Twilio webhook separately if needed).
 *
 * Config uses same Twilio credentials as SMS (TWILIO_ACCOUNT_SID,
 * TWILIO_AUTH_TOKEN) plus TWILIO_VOICE_NUMBER for the caller ID.
 */

import twilio from "twilio"
import type { PlatformAdapter, PlatformSendOptions } from "./types"
import { createLogger } from "../cli/logger"

const log = createLogger("adapter:voice")

interface VoiceConfig {
  accountSid: string
  authToken: string
  fromNumber: string // Twilio voice-enabled phone number, e.g. "+14155552671"
  /** TTS voice: "man", "woman", "alice" (default: "alice") */
  voice?: "man" | "woman" | "alice"
  /** TTS language (default: "en-US") */
  language?: string
  /** Max call duration in seconds (default: 30) */
  maxDuration?: number
}

/** Max text length for TTS (longer text gets clipped) */
const TTS_MAX_LEN = 1500

function stripMarkdown(text: string): string {
  // Remove markdown formatting for cleaner speech
  return text
    .replace(/\*([^*]+)\*/g, "$1") // bold
    .replace(/_([^_]+)_/g, "$1") // italic
    .replace(/`([^`]+)`/g, "$1") // code
    .replace(/```[\s\S]*?```/g, "") // code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/#{1,6}\s/g, "") // headings
    .replace(/>\s/g, "") // blockquotes
    .replace(/[-*+]\s/g, "") // list markers
    .replace(/\n{2,}/g, ". ") // double newlines -> sentence break
    .replace(/\n/g, " ") // single newlines -> space
    .trim()
}

export function createVoiceAdapter(config: VoiceConfig): PlatformAdapter {
  const twilioClient = twilio(config.accountSid, config.authToken)

  return {
    name: "voice",

    async start() {
      log.info(`Voice adapter configured with number ${config.fromNumber}`)

      // Verify Twilio credentials by fetching account info
      try {
        const account = await twilioClient.api.accounts(config.accountSid).fetch()
        log.info(`Twilio account verified: ${account.friendlyName} (${account.status})`)
      } catch (err: any) {
        log.error(`Twilio account verification failed: ${err.message}`)
        throw err
      }
    },

    async stop() {
      log.info("Voice adapter stopped")
    },

    async send(opts: PlatformSendOptions) {
      // channelId is the recipient's phone number, e.g. "+1234567890"
      const toNumber = opts.channelId

      // Clean text for speech
      const cleanText = stripMarkdown(opts.text)
      const speechText =
        cleanText.length <= TTS_MAX_LEN
          ? cleanText
          : cleanText.slice(0, TTS_MAX_LEN) + ". The message has been truncated."

      // Build TwiML with <Say> verb for text-to-speech
      const twiml = new twilio.twiml.VoiceResponse()
      twiml.say(
        {
          voice: config.voice ?? "alice",
          language: (config.language ?? "en-US") as any,
        },
        speechText,
      )

      // Make the outbound call
      const call = await twilioClient.calls.create({
        twiml: twiml.toString(),
        to: toNumber,
        from: config.fromNumber,
        timeout: config.maxDuration ?? 30,
      })

      log.info(`Voice call initiated to ${toNumber}: SID ${call.sid}`)
    },
  }
}
