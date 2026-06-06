import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from "react"
import { useWebSocket } from "../hooks/useWebSocket"
import type { WsEvent } from "../hooks/useWebSocket"
import { getWsUrl, getSseUrl } from "../api/client"
import type { A2uiWidget } from "../components/A2uiWidgets"

// ── Context ──────────────────────────────────────────────────────────

interface A2uiStreamState {
  scopedWidgets: Map<string, Map<string, A2uiWidget>>
  lastUpdate: number | null
  isConnected: boolean
  clearAll: () => void
  clearScope: (scope: string) => void
  sendAction: (action: string, widgetId: string, scope: string, payload?: Record<string, unknown>) => void
}

const A2uiStreamContext = createContext<A2uiStreamState | null>(null)

// ── Provider ─────────────────────────────────────────────────────────

export function A2uiStreamProvider({ children }: { children: ReactNode }) {
  const [scopedWidgets, setScopedWidgets] = useState<Map<string, Map<string, A2uiWidget>>>(new Map())
  const [lastUpdate, setLastUpdate] = useState<number | null>(null)
  const widgetsRef = useRef<Map<string, Map<string, A2uiWidget>>>(new Map())

  const { status: wsStatus, send: wsSend } = useWebSocket({
    url: getWsUrl(),
    sseUrl: getSseUrl(),
    sseFallback: true,
    reconnect: true,
    baseDelay: 2000,
    onEvent: useCallback((event: WsEvent) => {
      if (event.event === "a2ui:widget") {
        const data = event.data as Record<string, unknown>
        const rawWidget = data.widget as Record<string, unknown> | undefined
        const scope = (data.scope as string) || "default"

        if (!rawWidget?.type || !rawWidget.id) return

        const widget = rawWidget as unknown as A2uiWidget
        const current = widgetsRef.current

        if (!current.has(scope)) {
          current.set(scope, new Map())
        }

        const scopeWidgets = current.get(scope)!
        scopeWidgets.set(widget.id, widget)

        // Trigger re-render with a fresh Map reference
        setScopedWidgets(new Map(current))
        setLastUpdate(Date.now())
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  })

  const clearAll = useCallback(() => {
    widgetsRef.current = new Map()
    setScopedWidgets(new Map())
    setLastUpdate(Date.now())
  }, [])

  const clearScope = useCallback((scope: string) => {
    const current = widgetsRef.current
    current.delete(scope)
    setScopedWidgets(new Map(current))
    setLastUpdate(Date.now())
  }, [])

  const sendAction = useCallback((action: string, widgetId: string, scope: string, payload?: Record<string, unknown>) => {
    wsSend({
      type: "a2ui:action",
      action,
      widgetId,
      scope,
      payload: payload ?? {},
    })
  }, [wsSend])

  return (
    <A2uiStreamContext.Provider
      value={{
        scopedWidgets,
        lastUpdate,
        isConnected: wsStatus === "connected",
        clearAll,
        clearScope,
        sendAction,
      }}
    >
      {children}
    </A2uiStreamContext.Provider>
  )
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useA2uiStream(): A2uiStreamState {
  const ctx = useContext(A2uiStreamContext)
  if (!ctx) {
    throw new Error("useA2uiStream must be used within an A2uiStreamProvider")
  }
  return ctx
}
