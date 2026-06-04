export interface Agent {
  id: string
  name: string
  type?: string
  status: "running" | "idle" | "stopped" | "error" | "spawning"
  pid: number
  uptime: number
  logCount?: number
}

export interface HealthCheck {
  status: string
  agents: number
  uptime: number
}

export interface MemoryEntry {
  content: string
  timestamp: string
  score?: number
}

export interface Skill {
  name: string
  description: string
  tags: string[]
  installs?: number
}

export interface NavItem {
  path: string
  label: string
  icon: string
}

/** Payload for WebSocket events from the server. */
export interface WsEventPayload {
  event: string
  data: {
    clientId?: string
    agents?: Agent[]
    agentId?: string
    data?: Record<string, unknown>
  }
  timestamp: number
}

/** Parsed event from the WebSocket hook. */
export interface WsEvent {
  event: string
  data: Record<string, unknown>
  timestamp: number
}

/** Connection status for real-time updates. */
export type WsConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting"

/** Response from /api/v1/ws/health endpoint. */
export interface WsHealthResponse {
  status: "running" | "stopped"
  clients: {
    connected: number
    subscribed: number
    peak: number
  }
  uptime: number
  totalConnections: number
  messagesBroadcast: number
  lastConnectionAt: number | null
  clientsList: Array<{
    id: string
    subscribed: boolean
    connectedFor: number
  }>
}
