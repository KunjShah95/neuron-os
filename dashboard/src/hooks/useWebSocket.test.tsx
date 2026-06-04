import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import { useWebSocket } from "./useWebSocket"

/**
 * Tracked mock — DOES NOT auto-open. Test calls _open() explicitly
 * after the hook has had a chance to assign onopen.
 */
let activeWs: any = null
const origWebSocket = (window as any).WebSocket

class ControlledMockWebSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3
  CONNECTING = 0; OPEN = 1; CLOSING = 2; CLOSED = 3
  url: string; readyState = 0
  onopen: (() => void) | null = null
  onclose: ((e: any) => void) | null = null
  onmessage: ((e: any) => void) | null = null
  onerror: (() => void) | null = null
  send = vi.fn()
  close = vi.fn(() => { this.readyState = 3; this.onclose?.({ code: 1000 }) })

  constructor(url: string) { this.url = url; activeWs = this }

  /** Test helper: simulate the WebSocket opening */
  _open() { this.readyState = 1; this.onopen?.() }
  /** Test helper: simulate receiving a message */
  _receive(data: any) { this.onmessage?.({ data: JSON.stringify(data) }) }
  /** Test helper: simulate close with a code (no this.close() — that would fire onclose twice) */
  _close(code = 1000) { this.readyState = 3; this.onclose?.({ code }) }

  addEventListener(_e: string, _h: any) { /* noop for tests */ }
  removeEventListener(_e: string, _h: any) { /* noop */ }
}

describe("useWebSocket", () => {
  beforeEach(() => {
    activeWs = null
    ;(window as any).WebSocket = ControlledMockWebSocket
  })

  afterEach(() => {
    ;(window as any).WebSocket = origWebSocket
  })

  it("connects on mount and transitions to connected", async () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: "/api/v1/ws", reconnect: false }),
    )

    expect(result.current.status).toBe("connecting")
    expect(result.current.retryCount).toBe(0)

    // Simulate the WebSocket opening
    act(() => { activeWs._open() })

    expect(result.current.status).toBe("connected")
  })

  it("disconnects and cleans up on unmount", () => {
    const { result, unmount } = renderHook(() =>
      useWebSocket({ url: "/api/v1/ws", reconnect: false }),
    )

    act(() => { activeWs._open() })
    expect(result.current.status).toBe("connected")

    const ws = activeWs
    unmount()
    expect(ws.close).toHaveBeenCalled()
  })

  it("captures incoming WebSocket events", () => {
    const onEvent = vi.fn()
    const { result } = renderHook(() =>
      useWebSocket({ url: "/api/v1/ws", reconnect: false, onEvent }),
    )

    act(() => { activeWs._open() })

    act(() => {
      activeWs._receive({ event: "connected", data: { clientId: "abc" }, timestamp: Date.now() })
    })

    expect(result.current.lastEvent?.event).toBe("connected")
    expect(result.current.lastEvent?.data).toEqual({ clientId: "abc" })
    expect(result.current.events).toHaveLength(1)
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ event: "connected" }))
  })

  it("limits event buffer to 200 entries", () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: "/api/v1/ws", reconnect: false }),
    )

    act(() => { activeWs._open() })

    for (let i = 0; i < 210; i++) {
      act(() => { activeWs._receive({ event: "test", data: { n: i }, timestamp: Date.now() }) })
    }

    expect(result.current.events).toHaveLength(200)
    expect(result.current.events[0].data).toEqual({ n: 10 })
    expect(result.current.events[199].data).toEqual({ n: 209 })
  })

  it("clearEvents empties the buffer", () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: "/api/v1/ws", reconnect: false }),
    )

    act(() => { activeWs._open() })
    act(() => { activeWs._receive({ event: "test", data: {}, timestamp: 1 }) })
    expect(result.current.events).toHaveLength(1)

    act(() => { result.current.clearEvents() })
    expect(result.current.events).toHaveLength(0)
    expect(result.current.lastEvent).toBeNull()
  })

  it("reconnects on close when reconnect is enabled", () => {
    vi.useFakeTimers()
    const { result } = renderHook(() =>
      useWebSocket({ url: "/api/v1/ws", reconnect: true, baseDelay: 1000 }),
    )

    act(() => { activeWs._open() })
    expect(result.current.status).toBe("connected")

    // onclose calls updateStatus("disconnected") then synchronously scheduleRetry
    // which calls updateStatus("reconnecting"). React batches both → final = "reconnecting".
    act(() => { activeWs._close(1006) })
    expect(result.current.status).toBe("reconnecting")
    expect(result.current.retryCount).toBe(1)

    // Advance past the retry delay (1000ms)
    act(() => { vi.advanceTimersByTime(2000) })
    expect(result.current.status).toBe("connecting")
    vi.useRealTimers()
  })

  it("does not reconnect when reconnect is disabled", () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: "/api/v1/ws", reconnect: false }),
    )

    act(() => { activeWs._open() })
    expect(result.current.status).toBe("connected")

    act(() => { activeWs._close(1000) })
    expect(result.current.status).toBe("disconnected")
    expect(result.current.retryCount).toBe(0)
  })

  it("does not capture events after unmount", () => {
    const { result, unmount } = renderHook(() =>
      useWebSocket({ url: "/api/v1/ws", reconnect: false }),
    )

    act(() => { activeWs._open() })
    unmount()

    // This should not throw or update state
    act(() => { activeWs._receive({ event: "late", data: {} }) })
    expect(result.current.events).toHaveLength(0)
  })

  it("disconnect() method cleans up and sets status to disconnected", () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: "/api/v1/ws", reconnect: false }),
    )

    act(() => { activeWs._open() })
    expect(result.current.status).toBe("connected")

    act(() => { result.current.disconnect() })
    expect(result.current.status).toBe("disconnected")
  })

  it("send() method sends JSON data through the WebSocket", () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: "/api/v1/ws", reconnect: false }),
    )

    act(() => { activeWs._open() })
    expect(activeWs.send).not.toHaveBeenCalled()

    act(() => { result.current.send({ type: "ping" }) })
    expect(activeWs.send).toHaveBeenCalledWith(JSON.stringify({ type: "ping" }))
  })

  it("connect() resets retry count and reconnects", () => {
    vi.useFakeTimers()
    const { result } = renderHook(() =>
      useWebSocket({ url: "/api/v1/ws", reconnect: true, baseDelay: 1000 }),
    )

    act(() => { activeWs._open() })
    expect(result.current.status).toBe("connected")

    // Close triggers reconnect scheduling
    act(() => { activeWs._close(1006) })
    expect(result.current.retryCount).toBe(1)

    // Clear onclose on old WS to prevent close() inside doConnect from retriggering
    if (activeWs) activeWs.onclose = null
    act(() => { result.current.connect() })
    expect(result.current.retryCount).toBe(0)
    vi.useRealTimers()
  })
})
