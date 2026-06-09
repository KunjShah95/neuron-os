/**
 * Signal adapter — powered by signal-cli REST API (JSON-RPC over HTTP).
 *
 * Requires a running signal-cli daemon with JSON-RPC enabled.
 * The daemon manages registration and encryption; this adapter sends
 * and receives messages via its HTTP endpoint.
 *
 * Commands: /agent, /ask, /search, /status, /config, /models, /memory,
 *           /cron, /skill, /agents, /logs, /chat, /docs, /plan, /research,
 *           /history, /help, /start
 */

import type { PlatformAdapter, PlatformSendOptions } from "./types"
import { createLogger } from "../cli/logger"
import { WELCOME_MSG, HELP_MSG, getCommandHandler, clip } from "./bot-commands"

const log = createLogger("adapter:signal")

interface SignalConfig {
  /** signal-cli REST API base URL (e.g. http://localhost:8080) */
  apiUrl: string
  /** The Signal phone number (in E.164 format, e.g. +1234567890) */
  fromNumber: string
  allowedUserIds?: string[]
  project?: string
  /** Polling interval in ms for receiving messages (default: 5000) */
  pollIntervalMs?: number
}

/** Max Signal message length */
const SIGNAL_MAX = 2000
const TRUNCATION_SUFFIX = "\n…[truncated]"

export function createSignalAdapter(config: SignalConfig): PlatformAdapter {
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let lastReceiveTimestamp = 0

  async function sendMessage(to: string, text: string): Promise<void> {
    const response = await fetch(`${config.apiUrl}/v1/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: [to],
        message: clip(text, SIGNAL_MAX, TRUNCATION_SUFFIX),
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new Error(`Signal send failed (${response.status}): ${body}`)
    }
  }

  async function pollMessages(): Promise<void> {
    try {
      const response = await fetch(`${config.apiUrl}/v1/receive/${encodeURIComponent(config.fromNumber)}?timeout=10`, {
        signal: AbortSignal.timeout(15_000),
      })

      if (!response.ok) return

      const messages = (await response.json()) as Array<{
        envelope: {
          source: string
          timestamp: number
          dataMessage?: { message?: string }
        }
      }>

      for (const msg of messages) {
        if (!msg.envelope?.dataMessage?.message) continue
        // Skip messages older than our start time to avoid re-processing
        if (msg.envelope.timestamp <= lastReceiveTimestamp) continue

        const text = msg.envelope.dataMessage.message.trim()
        const source = msg.envelope.source
        lastReceiveTimestamp = Math.max(lastReceiveTimestamp, msg.envelope.timestamp)

        // Auth check
        if (config.allowedUserIds && config.allowedUserIds.length > 0 && !config.allowedUserIds.includes(source)) {
          continue
        }

        // Only respond to commands starting with /
        if (!text.startsWith("/")) continue

        const spaceIdx = text.indexOf(" ")
        const command = spaceIdx === -1 ? text.slice(1).toLowerCase() : text.slice(1, spaceIdx).toLowerCase()
        const args = spaceIdx === -1 ? "" : text.slice(spaceIdx + 1).trim()

        if (command === "help") {
          await sendMessage(source, HELP_MSG)
          continue
        }
        if (command === "start") {
          await sendMessage(source, WELCOME_MSG)
          continue
        }

        const handler = getCommandHandler(command)
        if (handler) {
          try {
            const result = await handler(args, config.project)
            await sendMessage(source, result.text)
          } catch (err: unknown) {
            await sendMessage(source, `❌ Error: ${err instanceof Error ? err.message : String(err)}`)
          }
        }
      }
    } catch (err: unknown) {
      // Timeouts and transient errors are expected during polling
      if (err instanceof Error && (err.name !== "TimeoutError" && err.name !== "AbortError")) {
        log.warn(`Signal poll error: ${err.message}`)
      }
    }
  }

  return {
    name: "signal",

    async start() {
      // Verify connection by hitting the API
      try {
        const health = await fetch(`${config.apiUrl}/v1/health`, {
          signal: AbortSignal.timeout(5000),
        })
        if (!health.ok) {
          throw new Error(`Health check returned ${health.status}`)
        }
        log.info(`Signal adapter connected to ${config.apiUrl}`)
      } catch (err: unknown) {
        log.error(`Signal health check failed: ${err instanceof Error ? err.message : String(err)}`)
        throw err
      }

      // Start polling for incoming messages
      const interval = config.pollIntervalMs ?? 5000
      pollTimer = setInterval(pollMessages, interval)
      log.info(`Signal adapter started (polling every ${interval}ms)`)
    },

    async stop() {
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
      log.info("Signal adapter stopped")
    },

    async send(opts: PlatformSendOptions) {
      await sendMessage(opts.channelId, opts.text)
    },
  }
}
