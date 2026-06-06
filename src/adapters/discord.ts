/**
 * Discord adapter — powered by discord.js with full command bot support.
 *
 * Commands: /agent, /ask, /search, /status, /config, /models, /memory,
 *           /cron, /skill, /agents, /logs, /chat, /docs, /plan, /research,
 *           /history, /help, /start
 */

import { Client, GatewayIntentBits, Events } from "discord.js"
import type { PlatformAdapter, PlatformSendOptions } from "./types"
import { createLogger } from "../cli/logger"
import {
  WELCOME_MSG,
  HELP_MSG,
  getCommandHandler,
  clip,
} from "./bot-commands"

const log = createLogger("adapter:discord")

interface DiscordConfig {
  botToken: string
  allowedUserIds?: string[]
  project?: string
}

/** Max Discord message length (minus 100 to leave room for truncation suffix) */
const DISCORD_MAX = 2000
const TRUNCATION_SUFFIX = "\n\n…[truncated]"

export function createDiscordAdapter(config: DiscordConfig): PlatformAdapter {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  })

  client.once(Events.ClientReady, (c) => {
    log.info(`Discord bot logged in as ${c.user.tag}`)
  })

  client.on(Events.MessageCreate, async (message) => {
    // Ignore bot messages
    if (message.author.bot) return

    // Check auth
    if (
      config.allowedUserIds &&
      config.allowedUserIds.length > 0 &&
      !config.allowedUserIds.includes(message.author.id)
    ) {
      return
    }

    const text = message.content.trim()

    // Only respond to messages starting with /
    if (!text.startsWith("/")) return

    // Extract command and args
    const spaceIdx = text.indexOf(" ")
    const command = spaceIdx === -1 ? text.slice(1).toLowerCase() : text.slice(1, spaceIdx).toLowerCase()
    const args = spaceIdx === -1 ? "" : text.slice(spaceIdx + 1).trim()

    // Handle help specially
    if (command === "help") {
      await message.channel.send(clip(HELP_MSG, DISCORD_MAX - 100, TRUNCATION_SUFFIX))
      return
    }
    if (command === "start") {
      await message.channel.send(clip(WELCOME_MSG, DISCORD_MAX - 100, TRUNCATION_SUFFIX))
      return
    }

    // Route to handler
    const handler = getCommandHandler(command)
    if (!handler) {
      // Unknown command — ignore silently
      return
    }

    try {
      const result = await handler(args, config.project)
      await message.channel.send(clip(result.text, DISCORD_MAX - 100, TRUNCATION_SUFFIX))
    } catch (err: any) {
      await message.channel.send(`❌ Error: ${err.message ?? String(err)}`)
    }
  })

  return {
    name: "discord",

    async start() {
      await client.login(config.botToken)
      log.info("Discord adapter started")
    },

    async stop() {
      client.destroy()
      log.info("Discord adapter stopped")
    },

    async send(opts: PlatformSendOptions) {
      const channel = await client.channels.fetch(opts.channelId)
      if (channel && "send" in channel && typeof (channel as any).send === "function") {
        await (channel as any).send(clip(opts.text, DISCORD_MAX - 100, TRUNCATION_SUFFIX))
      }
    },
  }
}
