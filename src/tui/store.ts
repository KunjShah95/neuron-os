import { agentManager } from "../agent/manager"
import type { AgentEvent } from "../agent/types"

export type AgentStatus = "running" | "idle" | "stopped" | "error"

export interface AgentState {
  id: string
  name: string
  status: AgentStatus
  lastActivity: string
  currentTool?: string
  pid: number
}

export interface LogEntry {
  timestamp: string
  text: string
  type: "info" | "success" | "warn" | "error" | "event"
}

export interface SystemMetrics {
  memPercent: number
  cpuPercent: number
  sessionCount: number
  uptime: number
}

export interface UIState {
  logScroll: number
  focus: "log" | "agents" | "command" | "providers" | "sessions"
  input: string
  history: string[]
  historyIndex: number
  // Pending UI action for confirm flows (delete/rename/export)
  pendingAction?: {
    type: "delete" | "rename" | "export"
    sessionId: string
  }
}

export interface AppState {
  agents: Map<string, AgentState>
  log: LogEntry[]
  metrics: SystemMetrics
  ui: UIState
  dirty: boolean
  // interactive lists for providers and sessions
  providers: string[]
  providerIndex: number
  sessions: string[]
  sessionIndex: number
}

// ── Event bridge: AgentManager → TUI store ────────────────────────────

function mapToTuiStatus(status: string): AgentStatus {
  switch (status) {
    case "spawning":
    case "running":
    case "busy":
      return "running"
    case "idle":
      return "idle"
    case "stopping":
    case "stopped":
      return "stopped"
    case "error":
      return "error"
    default:
      return "idle"
  }
}

export function createAgentEventBridge(state: AppState): (event: AgentEvent) => void {
  return (event: AgentEvent) => {
    switch (event.type) {
      case "agent:spawned": {
        const inst = agentManager.get(event.agentId)
        if (inst) {
          state.agents.set(event.agentId, {
            id: event.agentId,
            name: inst.def.name,
            status: "running",
            lastActivity: new Date().toLocaleTimeString(),
            pid: inst.pid,
          })
          addLogEntry(state, { text: `Agent "${inst.def.name}" spawned (pid ${inst.pid})`, type: "success" })
        }
        break
      }
      case "agent:ready":
        break
      case "agent:stopped": {
        const a = state.agents.get(event.agentId)
        if (a) {
          a.status = "stopped"
          a.lastActivity = new Date().toLocaleTimeString()
          addLogEntry(state, { text: `Agent "${a.name}" stopped`, type: "info" })
        }
        break
      }
      case "agent:error": {
        const a2 = state.agents.get(event.agentId)
        if (a2) {
          a2.status = "error"
          a2.lastActivity = new Date().toLocaleTimeString()
          const data = event.data as { message?: string } | undefined
          addLogEntry(state, { text: `Agent "${a2.name}" error: ${data?.message ?? "unknown"}`, type: "error" })
        }
        break
      }
      case "agent:log": {
        const data = event.data as { level?: string; text?: string } | undefined
        if (data?.text) {
          const logType =
            data.level === "error" ? ("error" as const) : data.level === "warn" ? ("warn" as const) : ("info" as const)
          const a3 = state.agents.get(event.agentId)
          const prefix = a3 ? `[${a3.name}] ` : ""
          addLogEntry(state, { text: `${prefix}${data.text}`, type: logType })
        }
        break
      }
      case "agent:heartbeat": {
        const a4 = state.agents.get(event.agentId)
        if (a4) {
          a4.lastActivity = new Date().toLocaleTimeString()
        }
        break
      }
      case "agent:exit": {
        const a5 = state.agents.get(event.agentId)
        if (a5) {
          a5.status = "stopped"
          a5.lastActivity = new Date().toLocaleTimeString()
          const data = event.data as { code?: number } | undefined
          addLogEntry(state, { text: `Agent "${a5.name}" exited (code ${data?.code ?? "?"})`, type: "event" })
        }
        break
      }
      case "agent:recovering": {
        const data = event.data as { attempt?: number; delay?: number; exitCode?: number } | undefined
        const a6 = state.agents.get(event.agentId)
        if (a6) {
          a6.status = "running" // Keep showing as running during recovery
          addLogEntry(state, {
            text: `Agent "${a6.name}" crashed (code ${data?.exitCode ?? "?"}), recovering #${data?.attempt ?? 1} in ${data?.delay ?? 0}ms`,
            type: "warn",
          })
        }
        break
      }
      case "agent:recovered": {
        const data = event.data as { newId?: string; attempts?: number } | undefined
        const a7 = state.agents.get(event.agentId)
        if (a7) {
          addLogEntry(state, {
            text: `Agent "${a7.name}" recovered after ${data?.attempts ?? 0} attempt(s) (new id: ${data?.newId ?? "?"})`,
            type: "success",
          })
        }
        break
      }
      case "agent:maxRetries": {
        const data = event.data as { attempts?: number; exitCode?: number } | undefined
        const a8 = state.agents.get(event.agentId)
        if (a8) {
          a8.status = "error"
          addLogEntry(state, {
            text: `Agent "${a8.name}" auto-recovery exhausted after ${data?.attempts ?? 0} attempts`,
            type: "error",
          })
        }
        break
      }
    }
    state.dirty = true
  }
}

// ── Initial state ─────────────────────────────────────────────────────

export function createInitialState(): AppState {
  const agentMap = new Map<string, AgentState>()

  for (const [id, inst] of agentManager.agents) {
    agentMap.set(id, {
      id,
      name: inst.def.name,
      status: mapToTuiStatus(inst.status),
      lastActivity: new Date(inst.lastActivity).toLocaleTimeString(),
      pid: inst.pid,
    })
  }

  if (agentMap.size === 0) {
    agentMap.set("main", {
      id: "main",
      name: "main",
      status: "idle",
      lastActivity: new Date().toLocaleTimeString(),
      pid: 0,
    })
  }

  return {
    agents: agentMap,
    log: [{ timestamp: new Date().toLocaleTimeString(), text: "Aegis dashboard started", type: "info" }],
    metrics: { memPercent: 0, cpuPercent: 0, sessionCount: 0, uptime: 0 },
    ui: {
      logScroll: 0,
      focus: "command",
      input: "",
      history: [],
      historyIndex: -1,
      pendingAction: undefined,
    },
    providers: [],
    providerIndex: 0,
    sessions: [],
    sessionIndex: 0,
    dirty: true,
  }
}

// ── Mutations ─────────────────────────────────────────────────────────

export function addLogEntry(state: AppState, entry: Omit<LogEntry, "timestamp">) {
  state.log.push({ ...entry, timestamp: new Date().toLocaleTimeString() })
  if (state.log.length > 1000) state.log.shift()
  state.ui.logScroll = 0
  state.dirty = true
}

export function updateMetrics(state: AppState) {
  const mem = process.memoryUsage()
  state.metrics.memPercent = Math.min(100, Math.round((mem.rss / 1024 / 1024 / 1024) * 100))
  state.metrics.uptime = Math.floor(process.uptime())
  state.dirty = true
}

export function setAgentStatus(state: AppState, id: string, status: AgentStatus, tool?: string) {
  const agent = state.agents.get(id)
  if (agent) {
    agent.status = status
    agent.lastActivity = new Date().toLocaleTimeString()
    agent.currentTool = tool
    state.dirty = true
  }
}
