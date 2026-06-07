/**
 * Matrix adapter — powered by matrix-js-sdk with auto-join and command routing.
 *
 * Connects to any Matrix homeserver via the Matrix client-server API.
 * Auto-joins invited rooms and responds to commands prefixed with /.
 *
 * Commands: /agent, /ask, /search, /status, /config, /models, /memory,
 *           /cron, /skill, /agents, /logs, /chat, /docs, /plan, /research,
 *           /history, /help, /start
 */

import { createClient, type MatrixClient } from "matrix-js-sdk"
import type { PlatformAdapter, PlatformSendOptions } from "./types"
import { createLogger } from "../cli/logger"
import { WELCOME_MSG, HELP_MSG, getCommandHandler, clip } from "./bot-commands"

const log = createLogger("adapter:matrix")

interface MatrixConfig {
  homeserverUrl: string
  accessToken: string
  userId: string
  allowedUserIds?: string[]
  project?: string
}

/** Max Matrix message length (room message limit) */
const MATRIX_MAX = 65000
const TRUNCATION_SUFFIX = "\n…[truncated]"

/** Strip Matrix user ID prefix to get the actual user (e.g. @user:server → user) */
function stripMatrixId(userId: string): string {
  return userId.replace(/^@/, "").split(":")[0] ?? userId
}

export function createMatrixAdapter(config: MatrixConfig): PlatformAdapter {
  let client: MatrixClient | null = null

  return {
    name: "matrix",

    async start() {
      client = createClient({
        baseUrl: config.homeserverUrl,
        accessToken: config.accessToken,
        userId: config.userId,
      })

      // ── Lifecycle handlers ──────────────────────────────────────────
      const c = client as any

      c.once("sync", (_state: string) => {
        log.info(`Matrix sync complete: ${_state}`)
      })

      c.on("RoomMember.membership", (_event: any, member: any) => {
        if (member.membership === "invite" && member.userId === config.userId) {
          c.joinRoom(member.roomId).catch((err: any) => {
            log.warn(`Failed to auto-join room ${member.roomId}: ${err.message}`)
          })
        }
      })

      // ── Message handler ─────────────────────────────────────────────
      c.on("Room.timeline", (event: any, room: any) => {
        // Only handle messages
        if (event.getType() !== "m.room.message") return
        // Ignore own messages
        if (event.getSender() === config.userId) return

        const content = event.getContent()
        const body: string = content?.body?.trim() ?? ""
        const sender = event.getSender() ?? ""
        const roomId = room.roomId

        // Auth check against allowed user IDs
        const canonicalSender = stripMatrixId(sender)
        if (
          config.allowedUserIds &&
          config.allowedUserIds.length > 0 &&
          !config.allowedUserIds.includes(sender) &&
          !config.allowedUserIds.includes(canonicalSender)
        ) {
          return
        }

        // Only respond to commands starting with /
        if (!body.startsWith("/")) return

        const spaceIdx = body.indexOf(" ")
        const command = spaceIdx === -1 ? body.slice(1).toLowerCase() : body.slice(1, spaceIdx).toLowerCase()
        const args = spaceIdx === -1 ? "" : body.slice(spaceIdx + 1).trim()

        // Handle built-in commands asynchronously
        const reply = async () => {
          if (command === "help") {
            await sendMatrixMessage(roomId, HELP_MSG)
            return
          }
          if (command === "start") {
            await sendMatrixMessage(roomId, WELCOME_MSG)
            return
          }

          const handler = getCommandHandler(command)
          if (handler) {
            try {
              const result = await handler(args, config.project)
              await sendMatrixMessage(roomId, result.text)
            } catch (err: any) {
              await sendMatrixMessage(roomId, `❌ Error: ${err.message ?? String(err)}`)
            }
          }
        }

        reply().catch((err) => log.warn(`Matrix reply error: ${err.message}`))
      })

      // ── Start client ────────────────────────────────────────────────
      await (client as any).startClient({ initialSyncLimit: 0 })
      log.info(`Matrix adapter started as ${config.userId}`)
    },

    async stop() {
      if (client) {
        client.stopClient()
        client = null
      }
      log.info("Matrix adapter stopped")
    },

    async send(opts: PlatformSendOptions) {
      await sendMatrixMessage(opts.channelId, opts.text)
    },
  }

  // ── Helper to send a message ──────────────────────────────────────────

  async function sendMatrixMessage(roomId: string, text: string): Promise<void> {
    const c = client
    if (!c) throw new Error("Matrix client not started")

    await (c as any).sendEvent(roomId, "m.room.message", {
      msgtype: "m.text",
      body: clip(text, MATRIX_MAX, TRUNCATION_SUFFIX),
      format: "org.matrix.custom.html",
      formatted_body: clip(text, MATRIX_MAX, TRUNCATION_SUFFIX)
        .replace(/\n/g, "<br>")
        .replace(/\*([^*]+)\*/g, "<strong>$1</strong>")
        .replace(/`([^`]+)`/g, "<code>$1</code>"),
    })
  }
}
