import { useState, useEffect, useRef, useCallback } from "react"

export type WsStatus = "disconnected" | "connecting" | "connected" | "reconnecting"

export interface WsEvent {
  event: string
  data: Record<string, unknown>
  timestamp: number
}

export interface UseWebSocketOptions {
  /** WebSocket URL (e.g. "/api/v1/ws") */
  url: string
  /** Auto-reconnect on disconnect */
  reconnect?: boolean
  /** Max reconnect attempts (default: infinite) */
  maxRetries?: number
  /** Base delay between retries (ms), doubled each attempt */
  baseDelay?: number
  /** Whether to fall back to SSE if WebSocket fails */
  sseFallback?: boolean
  /** SSE fallback URL */
  sseUrl?: string
  /** Callback on every event */
  onEvent?: (event: WsEvent) => void
  /** Callback on status change */
  onStatusChange?: (status: WsStatus) => void
}

export interface UseWebSocketReturn {
  status: WsStatus
  lastEvent: WsEvent | null
  events: WsEvent[]
  retryCount: number
  connect: () => void
  disconnect: () => void
  send: (data: unknown) => void
  clearEvents: () => void
}

/**
 * React hook for WebSocket connections with auto-reconnect and SSE fallback.
 *
 * Features:
 * - Auto-reconnect with exponential backoff
 * - Ping/pong keepalive every 30s
 * - SSE fallback when WebSocket is unavailable
 * - Event buffer with configurable max length
 * - Connection status tracking
 */
export function useWebSocket({
  url,
  reconnect = true,
  maxRetries = Infinity,
  baseDelay = 1000,
  sseFallback = true,
  sseUrl,
  onEvent,
  onStatusChange,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [status, setStatus] = useState<WsStatus>("disconnected")
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null)
  const [events, setEvents] = useState<WsEvent[]>([])
  const [retryCount, setRetryCount] = useState(0)

  const wsRef = useRef<WebSocket | null>(null)
  const sseRef = useRef<EventSource | null>(null)
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSseRef = useRef(false)
  const mountedRef = useRef(true)
  const retriesRef = useRef(0)
  const connectRef = useRef<() => void>(() => {})
  const scheduleRetryRef = useRef<() => void>(() => {})

  const updateStatus = useCallback(
    (newStatus: WsStatus) => {
      setStatus(newStatus)
      onStatusChange?.(newStatus)
    },
    [onStatusChange],
  )

  const handleEvent = useCallback(
    (event: WsEvent) => {
      setLastEvent(event)
      setEvents((prev) => {
        const next = [...prev, event]
        // Keep last 200 events
        return next.length > 200 ? next.slice(-200) : next
      })
      onEvent?.(event)
    },
    [onEvent],
  )

  const clearPing = useCallback(() => {
    if (pingRef.current) {
      clearInterval(pingRef.current)
      pingRef.current = null
    }
  }, [])

  const stopSse = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close()
      sseRef.current = null
    }
  }, [])

  // ── Schedule retry (uses refs to break circular deps) ────────────

  const scheduleRetry = useCallback(() => {
    if (!mountedRef.current || retriesRef.current >= maxRetries) return

    retriesRef.current++
    setRetryCount(retriesRef.current)
    updateStatus("reconnecting")

    const delay = Math.min(baseDelay * Math.pow(2, retriesRef.current - 1), 30000)
    retryTimerRef.current = setTimeout(() => {
      if (mountedRef.current) connectRef.current()
    }, delay)
  }, [maxRetries, baseDelay, updateStatus])

  // Keep ref in sync for circular-dependency-safe access
  scheduleRetryRef.current = scheduleRetry

  // ── SSE fallback ─────────────────────────────────────────────────

  const connectSse = useCallback(() => {
    if (!sseUrl || !mountedRef.current) return

    stopSse()
    isSseRef.current = true
    updateStatus("connecting")

    try {
      const es = new EventSource(sseUrl)
      sseRef.current = es

      es.onopen = () => {
        if (!mountedRef.current) return
        updateStatus("connected")
        retriesRef.current = 0
        setRetryCount(0)
      }

      es.onmessage = (msg) => {
        if (!mountedRef.current) return
        try {
          const parsed = JSON.parse(msg.data) as { event: string; data: Record<string, unknown> }
          handleEvent({
            event: parsed.event || "unknown",
            data: parsed.data || {},
            timestamp: Date.now(),
          })
        } catch {}
      }

      es.onerror = () => {
        if (!mountedRef.current) return
        stopSse()
        updateStatus("disconnected")
        if (reconnect) {
          scheduleRetryRef.current()
        }
      }
    } catch {
      updateStatus("disconnected")
      if (reconnect) scheduleRetryRef.current()
    }
  }, [sseUrl, reconnect, updateStatus, handleEvent, stopSse])

  // ── WebSocket connection ─────────────────────────────────────────

  const doConnect = useCallback(() => {
    if (!mountedRef.current) return

    // Clean up any existing connection
    wsRef.current?.close()
    stopSse()
    clearPing()

    isSseRef.current = false
    updateStatus("connecting")

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
      const wsUrl = `${protocol}//${window.location.hostname}:8081${url}`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close()
          return
        }
        updateStatus("connected")
        retriesRef.current = 0
        setRetryCount(0)

        // Start ping keepalive
        clearPing()
        pingRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "ping" }))
          }
        }, 30000)
      }

      ws.onmessage = (msg) => {
        if (!mountedRef.current) return
        try {
          const parsed = JSON.parse(msg.data) as { event: string; data: Record<string, unknown>; timestamp?: number }
          handleEvent({
            event: parsed.event || "unknown",
            data: parsed.data || {},
            timestamp: parsed.timestamp || Date.now(),
          })
        } catch {}
      }

      ws.onclose = () => {
        if (!mountedRef.current) return
        clearPing()
        updateStatus("disconnected")
        if (reconnect) {
          scheduleRetryRef.current()
        }
      }

      ws.onerror = () => {
        // onclose will fire after this, so reconnect is handled there
      }
    } catch (err) {
      if (!mountedRef.current) return
      clearPing()
      updateStatus("disconnected")

      // Fall back to SSE
      if (sseFallback && sseUrl) {
        connectSse()
      } else if (reconnect) {
        scheduleRetryRef.current()
      }
    }
  }, [url, reconnect, sseFallback, sseUrl, updateStatus, handleEvent, clearPing, stopSse, connectSse])

  connectRef.current = doConnect

  const connect = useCallback(() => {
    retriesRef.current = 0
    setRetryCount(0)
    connectRef.current()
  }, [])

  const disconnect = useCallback(() => {
    mountedRef.current = false
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
    clearPing()
    stopSse()
    wsRef.current?.close()
    wsRef.current = null
    updateStatus("disconnected")
  }, [clearPing, stopSse, updateStatus])

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  const clearEvents = useCallback(() => {
    setEvents([])
    setLastEvent(null)
  }, [])

  // ── Lifecycle ────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true
    doConnect()

    return () => {
      mountedRef.current = false
      disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    status,
    lastEvent,
    events,
    retryCount,
    connect,
    disconnect,
    send,
    clearEvents,
  }
}
