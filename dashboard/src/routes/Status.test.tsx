import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import Status from "./Status"

vi.mock("../components/AnimatedPage", () => ({
  default: ({ children, className }: any) => <div className={className}>{children}</div>,
}))

vi.mock("../api/client", () => ({
  api: {
    health: vi.fn().mockResolvedValue({ status: "ok", agents: 0, uptime: 120 }),
    listAgents: vi.fn().mockResolvedValue([]),
  },
  getWsUrl: vi.fn().mockReturnValue("ws://localhost:5173/api/v1/ws"),
  getSseUrl: vi.fn().mockReturnValue("/api/v1/events"),
}))

vi.mock("../hooks/useNotificationSounds", () => ({
  useNotificationSounds: () => ({
    handleEvent: vi.fn(),
    toggleSounds: vi.fn(),
    isEnabled: () => true,
  }),
}))

import type { WsStatus } from "../hooks/useWebSocket"
let mockWsStatus: WsStatus = "connected"
const eventStore: any[] = []
let mockClearEvents = vi.fn()

vi.mock("../hooks/useWebSocket", () => ({
  useWebSocket: () => ({
    status: mockWsStatus,
    events: eventStore,
    retryCount: 0,
    clearEvents: mockClearEvents,
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    lastEvent: eventStore.length > 0 ? eventStore[eventStore.length - 1] : null,
  }),
}))

/** Helper to add events to the store (must be followed by container update). */
function addEvents(...events: Array<{ event: string; data: Record<string, unknown>; timestamp?: number }>) {
  events.forEach((e) => eventStore.push({ ...e, timestamp: e.timestamp ?? Date.now() }))
}

describe("Status page — event feed", () => {
  beforeEach(() => {
    mockWsStatus = "connected"
    eventStore.length = 0
    mockClearEvents = vi.fn()
  })

  /**
   * Helper: render <Status /> and wait for its initial async effects
   * (api.health, api.listAgents) to settle, preventing act() warnings.
   */
  async function renderAndSettle() {
    render(<Status />)
    // Flush the initial useEffect async calls (api.health, api.listAgents)
    await waitFor(() => {
      expect(screen.queryByText("Online")).toBeInTheDocument()
    }, { timeout: 1000 })
  }

  it("renders the status page header", async () => {
    await renderAndSettle()
    expect(screen.getByText("System Status")).toBeInTheDocument()
    expect(screen.getByText("Real-time system health, agents, and event feed")).toBeInTheDocument()
  })

  it("renders metric cards with initial values", async () => {
    await renderAndSettle()
    const statusElements = screen.getAllByText("Status")
    expect(statusElements.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText("Agents")).toBeInTheDocument()
    expect(screen.getByText("Uptime")).toBeInTheDocument()
    expect(screen.getByText("Events")).toBeInTheDocument()
  })

  it("shows empty event feed message when no events", async () => {
    await renderAndSettle()
    expect(
      screen.getByText("No events yet. Events appear here in real-time."),
    ).toBeInTheDocument()
  })

  it("shows connecting message when WebSocket is connecting", async () => {
    mockWsStatus = "connecting"
    render(<Status />)
    await waitFor(() => {
      expect(screen.getByText("Connecting to event stream...")).toBeInTheDocument()
    }, { timeout: 1000 })
  })

  it("shows disconnected message when WebSocket is disconnected", async () => {
    mockWsStatus = "disconnected"
    render(<Status />)
    await waitFor(() => {
      expect(screen.getByText("Disconnected. Reconnecting...")).toBeInTheDocument()
    }, { timeout: 1000 })
  })

  it("renders connected event", async () => {
    addEvents({ event: "connected", data: { clientId: "ws-1" }, timestamp: 1000 })
    await renderAndSettle()
    expect(screen.getByText("Connected to real-time feed")).toBeInTheDocument()
  })

  it("renders agent:spawn event", async () => {
    addEvents({
      event: "agent:spawn",
      data: { agentId: "agent-1", data: { name: "worker-1", type: "coder", status: "spawning" } },
      timestamp: 1000,
    })
    await renderAndSettle()
    expect(screen.getByText("Agent spawned: worker-1")).toBeInTheDocument()
  })

  it("renders agent:kill event", async () => {
    addEvents({ event: "agent:kill", data: { agentId: "agent-1" }, timestamp: 1000 })
    await renderAndSettle()
    expect(screen.getByText("Agent killed: agent-1")).toBeInTheDocument()
  })

  it("renders multiple events in sequence", async () => {
    addEvents(
      { event: "connected", data: { clientId: "ws-1" }, timestamp: 1000 },
      { event: "agent:spawn", data: { agentId: "a1", data: { name: "alice" } }, timestamp: 2000 },
      { event: "agent:kill", data: { agentId: "a1" }, timestamp: 3000 },
    )
    await renderAndSettle()
    expect(screen.getByText("Connected to real-time feed")).toBeInTheDocument()
    expect(screen.getByText("Agent spawned: alice")).toBeInTheDocument()
    expect(screen.getByText("Agent killed: a1")).toBeInTheDocument()
  })

  it("filters events by type using dropdown", async () => {
    addEvents(
      { event: "connected", data: {}, timestamp: 1000 },
      { event: "agent:spawn", data: { agentId: "a1", data: { name: "bot" } }, timestamp: 2000 },
      { event: "agent:kill", data: { agentId: "a1" }, timestamp: 3000 },
    )
    await renderAndSettle()

    // Select "Spawns" filter
    await act(async () => {
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "agent:spawn" } })
    })

    await waitFor(() => {
      expect(screen.queryByText("Connected to real-time feed")).not.toBeInTheDocument()
    })
    expect(screen.getByText("Agent spawned: bot")).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText("Agent killed: a1")).not.toBeInTheDocument()
    })
  })

  it("shows connection status indicators", async () => {
    mockWsStatus = "connected"
    await renderAndSettle()
    expect(screen.getByText("Live")).toBeInTheDocument()
  })

  it("shows 'Connecting' indicator when connecting", async () => {
    mockWsStatus = "connecting"
    render(<Status />)
    await waitFor(() => {
      expect(screen.getByText("Connecting")).toBeInTheDocument()
    }, { timeout: 1000 })
  })

  it("shows 'Offline' indicator when disconnected", async () => {
    mockWsStatus = "disconnected"
    render(<Status />)
    await waitFor(() => {
      expect(screen.getByText("Offline")).toBeInTheDocument()
    }, { timeout: 1000 })
  })

  it("clear button calls clearEvents", async () => {
    await renderAndSettle()
    await act(async () => {
      fireEvent.click(screen.getByText("Clear"))
    })
    expect(mockClearEvents).toHaveBeenCalled()
  })

  it("auto-scroll button toggles state", async () => {
    await renderAndSettle()
    expect(screen.getByText("Auto-scroll")).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByText("Auto-scroll"))
    })
    expect(screen.getByText("Auto-scroll")).toBeInTheDocument()
  })

  it("renders SoundToggle component", async () => {
    await renderAndSettle()
    const toggle = screen.getByTitle(/notification sounds/i)
    expect(toggle).toBeInTheDocument()
  })

  it("renders connection details section", async () => {
    await renderAndSettle()
    expect(screen.getByText("Connection Details")).toBeInTheDocument()
    const found = screen.getAllByText(/WebSocket/)
    expect(found.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText("SSE Fallback")).toBeInTheDocument()
    expect(screen.getByText("Retries")).toBeInTheDocument()
    expect(screen.getByText("Events Buffered")).toBeInTheDocument()
  })
})
