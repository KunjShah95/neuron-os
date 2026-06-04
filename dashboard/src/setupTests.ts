import "@testing-library/jest-dom"
import { vi } from "vitest"

// Mock window.location for tests
Object.defineProperty(window, "location", {
  value: {
    protocol: "http:",
    host: "localhost:5173",
    href: "http://localhost:5173/",
    pathname: "/",
    origin: "http://localhost:5173",
  },
  writable: true,
})

// Mock localStorage
const store: Record<string, string> = {}
Object.defineProperty(window, "localStorage", {
  value: {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
    get length() { return Object.keys(store).length },
    key: (i: number) => Object.keys(store)[i] ?? null,
  },
  writable: true,
})

// Mock AudioContext for sound tests
class MockAudioContext {
  state = "running"
  currentTime = 0
  destination = { maxChannelCount: 2 }
  createOscillator() {
    return {
      type: "sine",
      frequency: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {} },
      connect: () => {},
      start: () => {},
      stop: () => {},
    }
  }
  createGain() {
    return {
      gain: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {} },
      connect: () => {},
    }
  }
  resume() { this.state = "running" }
}

Object.defineProperty(window, "AudioContext", {
  value: MockAudioContext,
  writable: true,
})

// Shared MockWebSocket class — test files extend or use TrackedMockWebSocket
class BaseMockWebSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3
  CONNECTING = 0; OPEN = 1; CLOSING = 2; CLOSED = 3
  url: string
  readyState: number = BaseMockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onclose: ((e: any) => void) | null = null
  onmessage: ((e: any) => void) | null = null
  onerror: (() => void) | null = null
  send = vi.fn()
  close = vi.fn(() => { this.readyState = BaseMockWebSocket.CLOSED; this.onclose?.({ code: 1000 }) })
  listeners = new Map<string, Set<(...args: any[]) => void>>()

  constructor(url: string) { this.url = url }
  addEventListener(e: string, h: any) {
    if (!this.listeners.has(e)) this.listeners.set(e, new Set())
    this.listeners.get(e)!.add(h)
  }
  removeEventListener(e: string, h: any) { this.listeners.get(e)?.delete(h) }
}

// Default global WebSocket — auto-opens on next tick
class DefaultMockWebSocket extends BaseMockWebSocket {
  constructor(url: string) {
    super(url)
    setTimeout(() => {
      this.readyState = BaseMockWebSocket.OPEN
      this.onopen?.()
    }, 0)
  }
}

Object.defineProperty(window, "WebSocket", { value: DefaultMockWebSocket, writable: true })
