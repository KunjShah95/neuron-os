import { agentManager } from "../agent/manager"
import type { AgentEvent } from "../agent/types"
import { a2uiManager, type A2uiEvent } from "../tools/a2ui"
import { createLogger } from "../cli/logger"
import { SECURITY_HEADERS } from "./security"
import { listAgentSummaries } from "./routes/agents"

const log = createLogger("api")

interface WsClient {
  socket: import("bun").ServerWebSocket<undefined>
  id: string
  subscribed: boolean
  connectedAt: number
}

const wsClients = new Map<string, WsClient>()
let wsIdCounter = 0
let unsubWsRef: (() => void) | null = null

interface WsHealthStats {
  totalConnections: number
  messagesBroadcast: number
  bridgeStartedAt: number | null
  lastConnectionAt: number | null
  peakConcurrent: number
}

const wsHealth: WsHealthStats = {
  totalConnections: 0,
  messagesBroadcast: 0,
  bridgeStartedAt: null,
  lastConnectionAt: null,
  peakConcurrent: 0,
}

export function getWsHealth(): {
  status: string
  clients: { connected: number; subscribed: number; peak: number }
  uptime: number
  totalConnections: number
  messagesBroadcast: number
  lastConnectionAt: number | null
  clientsList: Array<{ id: string; subscribed: boolean }>
} {
  const now = Date.now()
  return {
    status: unsubWsRef ? "running" : "stopped",
    clients: {
      connected: wsClients.size,
      subscribed: [...wsClients.values()].filter((c) => c.subscribed).length,
      peak: wsHealth.peakConcurrent,
    },
    uptime: wsHealth.bridgeStartedAt ? Math.floor((now - wsHealth.bridgeStartedAt) / 1000) : 0,
    totalConnections: wsHealth.totalConnections,
    messagesBroadcast: wsHealth.messagesBroadcast,
    lastConnectionAt: wsHealth.lastConnectionAt,
    clientsList: [...wsClients.entries()].map(([id, client]) => ({
      id,
      subscribed: client.subscribed,
      connectedFor: Math.floor((now - client.connectedAt) / 1000),
    })),
  }
}

function broadcastWsEvent(event: string, data: Record<string, unknown>) {
  const msg = JSON.stringify({ event, data, timestamp: Date.now() })
  for (const [id, client] of wsClients) {
    if (client.subscribed) {
      try {
        client.socket.send(msg)
        wsHealth.messagesBroadcast++
      } catch {
        wsClients.delete(id)
      }
    }
  }
}

export function startWsEventBridge(): void {
  if (unsubWsRef) return

  wsHealth.bridgeStartedAt = Date.now()

  const handler = (event: AgentEvent) => {
    broadcastWsEvent(event.type || "agent:event", {
      agentId: event.agentId,
      data: event.data,
    })
  }

  agentManager.onEvent(handler)
  unsubWsRef = () => agentManager.offEvent(handler)
  log.info("WebSocket event bridge started")
}

export function startA2uiWsBridge(): () => void {
  const handler = (event: A2uiEvent) => {
    broadcastWsEvent("a2ui:widget", {
      scope: event.scope,
      widget: event.widget as unknown as Record<string, unknown>,
      replace: event.replace,
    })
  }

  a2uiManager.onEvent(handler)
  log.info("A2UI WebSocket bridge started")

  return () => {
    a2uiManager.offEvent(handler)
    log.info("A2UI WebSocket bridge stopped")
  }
}

export function stopWsEventBridge(): void {
  if (unsubWsRef) {
    unsubWsRef()
    unsubWsRef = null
  }
}

export function clearWsClients(): void {
  wsClients.clear()
}

interface InboundWsMessage {
  type?: unknown
  action?: unknown
  scope?: unknown
  widgetId?: unknown
  payload?: unknown
}

export function createWebSocketHandlers() {
  return {
    async open(ws: import("bun").ServerWebSocket<undefined>) {
      const id = `ws-${++wsIdCounter}`
      wsClients.set(id, { socket: ws, id, subscribed: true, connectedAt: Date.now() })

      wsHealth.totalConnections++
      wsHealth.lastConnectionAt = Date.now()
      wsHealth.peakConcurrent = Math.max(wsHealth.peakConcurrent, wsClients.size)

      log.info("WebSocket client connected", {
        clientId: id,
        totalConnections: wsHealth.totalConnections,
        concurrent: wsClients.size,
      })

      const agents = listAgentSummaries()
      ws.send(JSON.stringify({ event: "connected", data: { clientId: id, agents }, timestamp: Date.now() }))
    },

    message(ws: import("bun").ServerWebSocket<undefined>, message: string | Buffer) {
      try {
        const parsed = JSON.parse(message.toString()) as InboundWsMessage
        if (parsed.type === "ping") {
          ws.send(JSON.stringify({ event: "pong", data: {}, timestamp: Date.now() }))
        }
        if (parsed.type === "unsubscribe") {
          for (const [, client] of wsClients) {
            if (client.socket === ws) {
              client.subscribed = false
              break
            }
          }
        }
        if (parsed.type === "subscribe") {
          for (const [, client] of wsClients) {
            if (client.socket === ws) {
              client.subscribed = true
              break
            }
          }
        }

        if (parsed.type === "a2ui:action") {
          const { action, scope, widgetId, payload } = parsed
          a2uiManager.triggerAction({
            action: String(action || ""),
            widgetId: String(widgetId || ""),
            scope: String(scope || "default"),
            payload: (payload || {}) as Record<string, unknown>,
            timestamp: Date.now(),
          })
          log.info("A2UI action triggered", { action, scope, widgetId })
        }
      } catch (err) {
        log.warn("WS message parse failed", { error: String(err) })
      }
    },

    close(ws: import("bun").ServerWebSocket<undefined>) {
      for (const [id, client] of wsClients) {
        if (client.socket === ws) {
          wsClients.delete(id)
          log.info("WebSocket client disconnected", { clientId: id })
          break
        }
      }
    },

    drain(_ws: import("bun").ServerWebSocket<undefined>) {},
  }
}

export function createSseResponse(): Response {
  let unsubSse: (() => void) | null = null
  let closed = false

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      const agents = listAgentSummaries()
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: "connected", data: { agents } })}\n\n`))

      const handler = (event: AgentEvent) => {
        if (closed) return
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ event: event.type || "agent:event", data: { agentId: event.agentId, data: event.data } })}\n\n`,
            ),
          )
        } catch (err) {
          log.warn("SSE controller enqueue failed", { error: String(err) })
        }
      }
      agentManager.onEvent(handler)
      unsubSse = () => agentManager.offEvent(handler)
    },
    cancel() {
      closed = true
      if (unsubSse) {
        unsubSse()
        unsubSse = null
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...SECURITY_HEADERS,
    },
  })
}
