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
import { clip, checkAuth, parseCommand, routeCommand } from "./bot-commands"

const log = createLogger("adapter:matrix")

interface MatrixConfig {
  homeserverUrl: string
  accessToken: string
  userId: string
  allowedUserIds?: string[]
  project?: string
}

/** matrix-js-sdk types the event emitter methods but the declarations are incomplete — extend them here. */
type MatrixClientFull = MatrixClient & {
  on(event: string, handler: (...args: unknown[]) => void): void
  once(event: string, handler: (...args: unknown[]) => void): void
  joinRoom(roomId: string): Promise<unknown>
  sendEvent(roomId: string, type: string, content: Record<string, unknown>): Promise<unknown>
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
      const c = client as MatrixClientFull

      c.once("sync", (_state: unknown) => {
        log.info(`Matrix sync complete: ${_state}`)
      })

      c.on("RoomMember.membership", (...args: unknown[]) => {
        const member = args[1] as { membership: string; userId: string; roomId: string }
        if (member.membership === "invite" && member.userId === config.userId) {
          (c.joinRoom(member.roomId) as Promise<unknown>).catch((err: Error) => {
            log.warn(`Failed to auto-join room ${member.roomId}: ${err.message}`)
          })
        }
      })

      // ── Message handler ─────────────────────────────────────────────
      c.on("Room.timeline", (...args: unknown[]) => {
        const event = args[0] as { getType(): string; getSender(): string | null; getContent(): { body?: string } | null }
        const room = args[1] as { roomId: string }
        // Only handle messages
        if (event.getType() !== "m.room.message") return
        // Ignore own messages
        if (event.getSender() === config.userId) return

        const content = event.getContent()
        const body: string = content?.body?.trim() ?? ""
        const sender = event.getSender() ?? ""
        const roomId = room.roomId

        const canonicalSender = stripMatrixId(sender)
        if (!checkAuth(sender, config.allowedUserIds) && !checkAuth(canonicalSender, config.allowedUserIds)) return

        const parsed = parseCommand(body)
        if (!parsed) return

        routeCommand(parsed.command, parsed.args, async (responseText) => {
          await sendMatrixMessage(roomId, responseText)
        }, config.project).catch((err) => log.warn(`Matrix reply error: ${err.message}`))
      })

      // ── Start client ────────────────────────────────────────────────
      await (client as MatrixClient).startClient({ initialSyncLimit: 0 })
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

    await (c as MatrixClientFull).sendEvent(roomId, "m.room.message", {
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
