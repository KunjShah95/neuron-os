/**
 * IRC adapter — powered by irc-framework with command routing and auto-rejoin.
 *
 * Connects to any IRC server, joins channels, and responds to commands.
 * Supports both channel messages and private messages with the / prefix.
 *
 * Commands: /agent, /ask, /search, /status, /config, /models, /memory,
 *           /cron, /skill, /agents, /logs, /chat, /docs, /plan, /research,
 *           /history, /help, /start
 */

import { Client } from "irc-framework"
import type { PlatformAdapter, PlatformSendOptions } from "./types"
import { createLogger } from "../cli/logger"
import { clip, checkAuth, parseCommand, routeCommand } from "./bot-commands"

const log = createLogger("adapter:irc")

interface IRCConfig {
  server: string
  port?: number
  nickname: string
  channels: string[]
  /** Optional SASL authentication */
  password?: string
  /** TLS/SSL (default: true for 6697, false for 6667) */
  tls?: boolean
  allowedUserIds?: string[]
  project?: string
}

/** Max IRC message length (RFC 1459: 512 bytes including CRLF) */
const IRC_MAX = 400

export function createIRCAdapter(config: IRCConfig): PlatformAdapter {
  const port = config.port ?? ((config.tls ?? true) ? 6697 : 6667)
  const useTls = config.tls ?? port === 6697
  let client: Client | null = null

  /** Send a message to a channel or user with IRC-safe truncation */
  function sendIRCMessage(target: string, text: string): void {
    if (!client) throw new Error("IRC client not started")
    // Split long messages into multiple lines
    const lines = text.split("\n")
    for (const line of lines) {
      const truncated = clip(line, IRC_MAX, "…")
      client.say(target, truncated)
    }
  }

  return {
    name: "irc",

    async start() {
      client = new Client()

      // ── Connection handler ──────────────────────────────────────────
      client.connect({
        host: config.server,
        port,
        nick: config.nickname,
        password: config.password,
        tls: useTls,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        version: null as any, // Skip CTCP version reply from irc-framework
      })

      const c = client

      c.on("registered", () => {
        log.info(`IRC connected as ${config.nickname} on ${config.server}:${port}`)

        // Join configured channels
        for (const channel of config.channels) {
          c.join(channel)
          log.info(`IRC joined channel ${channel}`)
        }
      })

      // ── Message handler ─────────────────────────────────────────────
      c.on("message", (event: unknown) => {
        const ev = event as { message?: string; nick?: string; target?: string }
        const text = ev.message?.trim() ?? ""
        const sender = ev.nick ?? ""
        const target = ev.target ?? "" // channel or user

        // Skip own messages
        if (sender.toLowerCase() === config.nickname.toLowerCase()) return

        if (!checkAuth(sender, config.allowedUserIds) && !checkAuth(sender.toLowerCase(), config.allowedUserIds)) return

        const parsed = parseCommand(text)
        if (!parsed) return

        const replyTarget = target.startsWith("#") ? target : sender
        routeCommand(parsed.command, parsed.args, async (responseText) => {
          sendIRCMessage(replyTarget, responseText)
        }, config.project).catch((err) => log.warn(`IRC reply error: ${err instanceof Error ? err.message : String(err)}`))
      })

      // ── Connection error handler ────────────────────────────────────
      c.on("error", (err: unknown) => {
        log.error(`IRC error: ${err instanceof Error ? err.message : String(err)}`)
      })

      // Wait for registration
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("IRC connection timeout")), 30_000)
        c.once("registered", () => {
          clearTimeout(timeout)
          resolve()
        })
        c.once("close", () => {
          clearTimeout(timeout)
          reject(new Error("IRC connection closed"))
        })
      })
    },

    async stop() {
      if (client) {
        for (const channel of config.channels) {
          try {
            client.part(channel)
          } catch {
            /* ignore */
          }
        }
        client.quit("Adapter shutting down")
        client = null
      }
      log.info("IRC adapter stopped")
    },

    async send(opts: PlatformSendOptions) {
      sendIRCMessage(opts.channelId, opts.text)
    },
  }
}
