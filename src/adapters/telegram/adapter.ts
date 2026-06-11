import { Telegraf } from "telegraf"
import type { PlatformAdapter, PlatformSendOptions } from "../types"
import { registerCallbacks } from "./callbacks"
import { registerAiCommands } from "./commands-ai"
import { registerInfoCommands } from "./commands-info"
import { HELP_MSG, WELCOME_MSG, type ApprovalCallbacks, type TelegramConfig } from "./messages"

export function createTelegramAdapter(config: TelegramConfig): PlatformAdapter {
  const bot = new Telegraf(config.botToken)

  bot.use(async (ctx, next) => {
    if (!ctx.from) return
    const userId = String(ctx.from.id)
    if (config.allowedUserIds && config.allowedUserIds.length > 0 && !config.allowedUserIds.includes(userId)) {
      await ctx.reply("⛔ Unauthorized. Your user ID is not allowed to use this bot.")
      return
    }
    await next()
  })

  bot.start(async (ctx) => {
    await ctx.reply(WELCOME_MSG, { parse_mode: "Markdown" })
  })

  bot.help(async (ctx) => {
    await ctx.reply(HELP_MSG, { parse_mode: "Markdown" })
  })

  const approvalCallbacks: ApprovalCallbacks = new Map()

  const TTL_MS = 5 * 60 * 1000
  const cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [msgId, entry] of approvalCallbacks) {
      if (now - entry.createdAt > TTL_MS) {
        approvalCallbacks.delete(msgId)
      }
    }
  }, 60_000)

  registerAiCommands(bot, config, approvalCallbacks)
  registerInfoCommands(bot)
  registerCallbacks(bot, approvalCallbacks)

  bot.catch((err, ctx) => {
    console.error(`[telegram] Error for ${ctx.updateType}:`, err)
  })

  return {
    name: "telegram",

    async start() {
      await bot.launch()
      console.log("[telegram] Telegraf bot started")
    },

    async stop() {
      clearInterval(cleanupInterval)
      approvalCallbacks.clear()
      bot.stop()
      console.log("[telegram] Telegraf bot stopped")
    },

    async send(opts: PlatformSendOptions) {
      await bot.telegram.sendMessage(opts.channelId, opts.text, {
        parse_mode: "Markdown",
      })
    },
  }
}
