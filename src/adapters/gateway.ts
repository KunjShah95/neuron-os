import { taskQueue } from "../agent/queue"
import type { PlatformAdapter, PlatformMessage } from "./types"
import { createLogger } from "../cli/logger"

const log = createLogger("gateway")

export class MultiPlatformGateway {
  private adapters: Map<string, PlatformAdapter> = new Map()

  public register(adapter: PlatformAdapter) {
    this.adapters.set(adapter.name, adapter)
    log.info(`Registered platform adapter: ${adapter.name}`)
  }

  public async startAll() {
    for (const adapter of this.adapters.values()) {
      try {
        await adapter.start()
        log.info(`Started adapter: ${adapter.name}`)
      } catch (err: any) {
        log.error(`Failed to start adapter ${adapter.name}: ${err.message}`)
      }
    }
  }

  public async stopAll() {
    for (const adapter of this.adapters.values()) {
      try {
        await adapter.stop()
      } catch (err: any) {
        log.error(`Failed to stop adapter ${adapter.name}: ${err.message}`)
      }
    }
  }

  /**
   * Central entry point for incoming messages from any platform (Slack, Telegram, Terminal).
   */
  public async handleMessage(msg: PlatformMessage) {
    log.info(`[${msg.platform}] <${msg.userName}>: ${msg.text}`)

    const text = msg.text.trim()
    if (text.startsWith("/agent ")) {
      const goal = text.replace("/agent ", "").trim()
      const taskId = taskQueue.submit(goal, "normal")
      await this.sendReply(msg.platform, msg.channelId, `🚀 Task queued with ID: ${taskId}`, msg.id)
    } else if (text.startsWith("/ping")) {
      await this.sendReply(msg.platform, msg.channelId, `pong`, msg.id)
    } else {
      // Unrecognized commands could trigger a generic chat response or a help menu.
      await this.sendReply(msg.platform, msg.channelId, `Unrecognized gateway command. Try /agent <goal>`, msg.id)
    }
  }

  /**
   * Sends a message outward through the appropriate platform adapter.
   */
  public async sendReply(platformName: string, channelId: string, text: string, replyToId?: string) {
    const adapter = this.adapters.get(platformName)
    if (!adapter) {
      log.error(`Cannot send reply, adapter not found: ${platformName}`)
      return
    }
    
    try {
      await adapter.send({ channelId, text, replyToId })
    } catch (err: any) {
      log.error(`Error sending message to ${platformName} (channel: ${channelId}): ${err.message}`)
    }
  }

  /**
   * Starts a local Bun HTTP & WebSocket server to accept GUI connections and Webhooks
   */
  public startSocketServer(port = 8080) {
    log.info(`Starting Lean Gateway Protocol socket on port ${port}...`)
    Bun.serve({
      port,
      fetch: (req, server) => {
        // Upgrade WebSocket connections
        if (server.upgrade(req)) return

        // Handle Webhooks (e.g. GitHub events, external API triggers)
        const url = new URL(req.url)
        if (req.method === "POST" && url.pathname === "/webhook") {
          taskQueue.submit("Process external webhook trigger", "high")
          return new Response("Webhook accepted", { status: 202 })
        }

        return new Response("Lean Gateway Protocol running. Use WebSocket for realtime or /webhook for triggers.", { status: 200 })
      },
      websocket: {
        open(_ws) {
          log.info("GUI socket connected.")
        },
        message(ws, message) {
          log.info(`Received socket message: ${message}`)
          try {
            const parsed = JSON.parse(String(message))
            if (parsed.type === "agent_command") {
              const taskId = taskQueue.submit(parsed.goal, "normal")
              ws.send(JSON.stringify({ type: "ack", taskId }))
            }
          } catch {
            ws.send("Error parsing socket message")
          }
        },
        close(_ws) {
          log.info("GUI socket disconnected.")
        }
      }
    })
  }
}

export const gateway = new MultiPlatformGateway()
