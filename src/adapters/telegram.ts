import type { PlatformAdapter, PlatformMessage, PlatformSendOptions } from "./types"
import { agentManager } from "../agent/manager"

interface TelegramConfig {
  botToken: string
  allowedUserIds?: string[]
}

export function createTelegramAdapter(config: TelegramConfig): PlatformAdapter {
  let bot: any = null
  let running = false

  async function send(opts: PlatformSendOptions): Promise<void> {
    if (!bot) return
    try {
      const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: opts.channelId,
          text: opts.text,
          reply_to_message_id: opts.replyToId ? parseInt(opts.replyToId) : undefined,
        }),
      })
    } catch (err) {
      console.error(`[telegram] Failed to send message:`, err)
    }
  }

  let lastUpdateId = 0

  async function pollUpdates(): Promise<void> {
    while (running) {
      try {
        const url = `https://api.telegram.org/bot${config.botToken}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`
        const res = await fetch(url)
        const data = await res.json() as any

        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            lastUpdateId = update.update_id
            const msg = update.message
            if (!msg?.text) continue

            const userId = String(msg.from?.id || "")
            if (config.allowedUserIds && config.allowedUserIds.length > 0 && !config.allowedUserIds.includes(userId)) {
              await send({ channelId: String(msg.chat.id), text: "Unauthorized user." })
              continue
            }

            const platformMsg: PlatformMessage = {
              id: `tg-${update.update_id}`,
              platform: "telegram",
              channelId: String(msg.chat.id),
              userId,
              userName: msg.from?.first_name || "Unknown",
              text: msg.text,
              replyToId: msg.reply_to_message?.message_id ? String(msg.reply_to_message.message_id) : undefined,
              timestamp: msg.date * 1000,
            }

            await handleTelegramMessage(platformMsg)
          }
        }
      } catch (err) {
        if (running) {
          console.error(`[telegram] Poll error:`, err)
        }
      }
    }
  }

  async function handleTelegramMessage(msg: PlatformMessage): Promise<void> {
    try {
      const agentId = await agentManager.spawn({
        name: `tg-${msg.userId}`,
        agentType: "build",
        script: "src/agent/agent-worker.ts",
        tags: ["telegram"],
        recovery: { maxRetries: 2 },
      })

      const taskId = `tg-${Date.now()}`
      agentManager.sendIpc(agentId, {
        type: "run-task",
        id: taskId,
        payload: { goal: msg.text },
        timestamp: Date.now(),
      })

      await send({ channelId: msg.channelId, text: "🤖 Processing your request..." })
    } catch (err) {
      console.error(`[telegram] Handler error:`, err)
      await send({ channelId: msg.channelId, text: "❌ Error processing request" })
    }
  }

  return {
    name: "telegram",

    async start() {
      running = true
      pollUpdates().catch(console.error)
      console.log("[telegram] Adapter started")
    },

    async stop() {
      running = false
      console.log("[telegram] Adapter stopped")
    },

    send,
  }
}
