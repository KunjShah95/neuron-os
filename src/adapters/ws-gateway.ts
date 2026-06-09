import type { Server, ServerWebSocket } from "bun"
import type { PlatformAdapter, PlatformMessage, PlatformSendOptions } from "./types"
import { createLogger } from "../cli/logger"

const log = createLogger("ws-gateway")

type WsClient = {
  ws: ServerWebSocket<{ userId: string; subscribedChannels: Set<string> }>
  userId: string
  subscribedChannels: Set<string>
}

interface WsClientMessage {
  type: "subscribe" | "unsubscribe" | "run_task" | "ping"
  channel?: string
  goal?: string
  id?: string
}

interface WsServerMessage {
  type: "event" | "state_sync" | "error" | "pong" | "system"
  channel?: string
  payload?: unknown
  id?: string
}

export class WsGatewayAdapter implements PlatformAdapter {
  readonly name = "ws"
  private server: Server<{ userId: string; subscribedChannels: Set<string> }> | null = null
  private clients = new Map<ServerWebSocket<unknown>, WsClient>()
  private port: number

  /** External callback for handling incoming messages */
  onMessage?: (msg: PlatformMessage) => Promise<void>

  constructor(port = 8081) {
    this.port = port
  }

  async start(): Promise<void> {
    if (this.server) return

    this.server = Bun.serve<{ userId: string; subscribedChannels: Set<string> }>({
      port: this.port,
      hostname: "0.0.0.0",
      fetch: (req, server) => {
        const url = new URL(req.url)

        // WebSocket upgrade
        if (url.pathname === "/ws") {
          const token = url.searchParams.get("token")
          if (!token || !token.startsWith("aegis_")) {
            return new Response("Unauthorized: valid aegis_ token required", { status: 401 })
          }

          const userId = url.searchParams.get("userId") || "anonymous"
          const success = server.upgrade(req, {
            data: { userId, subscribedChannels: new Set<string>() },
          })
          if (success) return undefined
          return new Response("WebSocket upgrade failed", { status: 400 })
        }

        // Health check
        if (url.pathname === "/health") {
          return new Response(JSON.stringify({ status: "ok", clients: this.clients.size }), {
            headers: { "Content-Type": "application/json" },
          })
        }

        return new Response("WS Gateway — use /ws for WebSocket", { status: 200 })
      },
      websocket: {
        open: (ws: ServerWebSocket<{ userId: string; subscribedChannels: Set<string> }>) => {
          const userId = ws.data.userId
          this.clients.set(ws as unknown as ServerWebSocket<unknown>, {
            ws,
            userId,
            subscribedChannels: ws.data.subscribedChannels,
          })
          log.info(`WS client connected: ${userId} (${this.clients.size} total)`)

          ws.send(JSON.stringify({
            type: "system",
            payload: { message: "Connected to Aegis WebSocket Gateway", clientId: userId },
          } satisfies WsServerMessage))
        },
        message: (ws: ServerWebSocket<{ userId: string; subscribedChannels: Set<string> }>, raw) => {
          try {
            const msg = JSON.parse(raw as string) as WsClientMessage
            const client = this.clients.get(ws as unknown as ServerWebSocket<unknown>)
            if (!client) return

            switch (msg.type) {
              case "subscribe":
                if (msg.channel) {
                  client.subscribedChannels.add(msg.channel)
                  ws.send(JSON.stringify({ type: "system", payload: { subscribed: msg.channel } } satisfies WsServerMessage))
                }
                break

              case "unsubscribe":
                if (msg.channel) {
                  client.subscribedChannels.delete(msg.channel)
                }
                break

              case "run_task":
                if (this.onMessage && msg.goal) {
                  const platformMsg: PlatformMessage = {
                    id: msg.id || `ws-${Date.now()}`,
                    platform: "ws",
                    channelId: `user:${client.userId}`,
                    userId: client.userId,
                    userName: client.userId,
                    text: msg.goal,
                    timestamp: Date.now(),
                  }
                  this.onMessage(platformMsg).catch((err) => {
                    log.error(`WS task handler error: ${err}`)
                    ws.send(JSON.stringify({ type: "error", payload: { message: String(err) } } satisfies WsServerMessage))
                  })
                }
                break

              case "ping":
                ws.send(JSON.stringify({ type: "pong", id: msg.id } satisfies WsServerMessage))
                break
            }
          } catch (err) {
            ws.send(JSON.stringify({ type: "error", payload: { message: `Invalid message: ${err}` } } satisfies WsServerMessage))
          }
        },
        close: (ws: ServerWebSocket<{ userId: string; subscribedChannels: Set<string> }>) => {
          const client = this.clients.get(ws as unknown as ServerWebSocket<unknown>)
          if (client) {
            log.info(`WS client disconnected: ${client.userId}`)
            this.clients.delete(ws as unknown as ServerWebSocket<unknown>)
          }
        },
      },
    })

    log.info(`WS Gateway started on port ${this.port}`)
  }

  async stop(): Promise<void> {
    if (!this.server) return
    this.server.stop(true)
    this.server = null
    this.clients.clear()
    log.info("WS Gateway stopped")
  }

  async send(opts: PlatformSendOptions): Promise<void> {
    const text = opts.text
    const channel = opts.channelId

    for (const client of this.clients.values()) {
      if (client.subscribedChannels.has(channel) || channel.startsWith(`user:${client.userId}`)) {
        try {
          client.ws.send(JSON.stringify({
            type: "event",
            channel,
            payload: { text, replyToId: opts.replyToId },
          } satisfies WsServerMessage))
        } catch (err) {
          log.error(`Failed to send WS message to ${client.userId}: ${err}`)
        }
      }
    }
  }

  /** Send a state_sync message to a specific user */
  sendStateSync(userId: string, state: unknown): void {
    for (const client of this.clients.values()) {
      if (client.userId === userId) {
        client.ws.send(JSON.stringify({ type: "state_sync", payload: state } satisfies WsServerMessage))
      }
    }
  }

  /** Broadcast a system message to all connected clients */
  broadcastSystem(payload: Record<string, unknown>): void {
    const msg = JSON.stringify({ type: "system", payload } satisfies WsServerMessage)
    for (const client of this.clients.values()) {
      try {
        client.ws.send(msg)
      } catch { /* ignore */ }
    }
  }

  get connectedClients(): number {
    return this.clients.size
  }
}
