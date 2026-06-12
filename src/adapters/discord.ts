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
import { clip, checkAuth, parseCommand, routeCommand } from "./bot-commands"

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
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  })

  client.once(Events.ClientReady, (c) => {
    log.info(`Discord bot logged in as ${c.user.tag}`)
  })

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return
    if (!checkAuth(message.author.id, config.allowedUserIds)) return

    const parsed = parseCommand(message.content.trim())
    if (!parsed) return

    await routeCommand(parsed.command, parsed.args, async (text) => {
      await message.channel.send(clip(text, DISCORD_MAX - 100, TRUNCATION_SUFFIX))
    }, config.project)
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
      const ch = channel as { send?: (text: string) => Promise<unknown> } | null
      if (ch && typeof ch.send === "function") {
        await ch.send(clip(opts.text, DISCORD_MAX - 100, TRUNCATION_SUFFIX))
      }
    },
  }
}
