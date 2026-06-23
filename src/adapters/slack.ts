/**
 * Slack adapter — powered by @slack/web-api with Socket Mode for real-time messaging.
 *
 * Commands: /agent, /ask, /search, /status, /config, /models, /memory,
 *           /cron, /skill, /agents, /logs, /chat, /docs, /plan, /research,
 *           /history, /help, /start
 */

import { WebClient } from "@slack/web-api"
import type { PlatformAdapter, PlatformSendOptions } from "./types"
import { createLogger } from "../cli/logger"
import { checkAuth, parseCommand, routeCommand } from "./bot-commands"

const log = createLogger("adapter:slack")

interface SlackConfig {
  botToken: string
  appToken?: string
  signingSecret?: string
  allowedUserIds?: string[]
  project?: string
}

interface SocketModeClientLike {
  on(event: string, handler: (payload: Record<string, unknown>) => unknown): void
  start(): Promise<void>
  disconnect(): Promise<void>
}

export function createSlackAdapter(config: SlackConfig): PlatformAdapter {
  const client = new WebClient(config.botToken)
  let socketModeClient: SocketModeClientLike | null = null

  return {
    name: "slack",

    async start() {
      // Test connection by calling auth.test
      try {
        const auth = await client.auth.test()
        log.info(`Slack adapter connected as ${auth.user}`)
      } catch (err: unknown) {
        log.error(`Slack auth test failed: ${err instanceof Error ? err.message : String(err)}`)
        throw err
      }

      // Start Socket Mode client if app token is provided
      if (config.appToken) {
        const { SocketModeClient } = await import("@slack/socket-mode")
        socketModeClient = new SocketModeClient({
          appToken: config.appToken,
        })

        socketModeClient.on("message", async (event: Record<string, unknown>) => {
          const ev = event.event as Record<string, unknown> | undefined
          // Handle app_mention events
          if (ev?.type === "app_mention") {
            const text = (ev.text as string) || ""
            const channel = ev.channel as string | undefined
            const user = ev.user as string | undefined

            if (!checkAuth(user ?? "", config.allowedUserIds)) return

            // Extract command from mention: "<@BOTID> /command args"
            const match = text.match(/\/\w+/)
            if (!match) return

            const fullCmd = text.slice(text.indexOf(match[0])).trim()
            const parsed = parseCommand(fullCmd)
            if (!parsed) return

            await routeCommand(parsed.command, parsed.args, async (responseText) => {
              await client.chat.postMessage({ channel: channel ?? "", text: responseText, mrkdwn: true })
            }, config.project)
          }
        })

        await socketModeClient.start()
        log.info("Slack Socket Mode started")
      }

      log.info("Slack adapter started")
    },

    async stop() {
      if (socketModeClient) {
        await socketModeClient.disconnect()
        socketModeClient = null
      }
      log.info("Slack adapter stopped")
    },

    async send(opts: PlatformSendOptions) {
      await client.chat.postMessage({
        channel: opts.channelId,
        text: opts.text,
        mrkdwn: true,
      })
    },
  }
}
