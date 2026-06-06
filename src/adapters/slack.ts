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
import {
  WELCOME_MSG,
  HELP_MSG,
  getCommandHandler,
} from "./bot-commands"

const log = createLogger("adapter:slack")

interface SlackConfig {
  botToken: string
  appToken?: string
  signingSecret?: string
  allowedUserIds?: string[]
  project?: string
}

export function createSlackAdapter(config: SlackConfig): PlatformAdapter {
  const client = new WebClient(config.botToken)
  let socketModeClient: any = null

  return {
    name: "slack",

    async start() {
      // Test connection by calling auth.test
      try {
        const auth = await client.auth.test()
        log.info(`Slack adapter connected as ${auth.user}`)
      } catch (err: any) {
        log.error(`Slack auth test failed: ${err.message}`)
        throw err
      }

      // Start Socket Mode client if app token is provided
      if (config.appToken) {
        const { SocketModeClient } = await import("@slack/socket-mode")
        socketModeClient = new SocketModeClient({
          appToken: config.appToken,
        })

        socketModeClient.on("message", async (event: any) => {
          // Handle app_mention events
          if (event.event?.type === "app_mention") {
            const text = event.event.text || ""
            const channel = event.event.channel
            const user = event.event.user

            // Check auth
            if (
              config.allowedUserIds &&
              config.allowedUserIds.length > 0 &&
              !config.allowedUserIds.includes(user)
            ) {
              return
            }

            // Extract command from mention: "<@BOTID> /command args"
            const match = text.match(/\/\w+/)
            if (!match) return

            const fullCmd = text.slice(text.indexOf(match[0])).trim()
            const spaceIdx = fullCmd.indexOf(" ")
            const command = spaceIdx === -1 ? fullCmd.slice(1).toLowerCase() : fullCmd.slice(1, spaceIdx).toLowerCase()
            const args = spaceIdx === -1 ? "" : fullCmd.slice(spaceIdx + 1).trim()

            if (command === "help") {
              await client.chat.postMessage({ channel, text: HELP_MSG, mrkdwn: true })
              return
            }
            if (command === "start") {
              await client.chat.postMessage({ channel, text: WELCOME_MSG, mrkdwn: true })
              return
            }

            const handler = getCommandHandler(command)
            if (handler) {
              try {
                const result = await handler(args, config.project)
                await client.chat.postMessage({ channel, text: result.text, mrkdwn: true })
              } catch (err: any) {
                await client.chat.postMessage({ channel, text: `❌ Error: ${err.message ?? String(err)}` })
              }
            }
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
