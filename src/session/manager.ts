import { SessionStore } from "./store"

export type SessionEvent = "agent_joined" | "agent_left" | "user_joined" | "user_left" | "state_updated" | "session_closed"

export interface SessionEventPayload {
  event: SessionEvent
  sessionId: string
  actor?: string
  data?: Record<string, unknown>
  timestamp: number
}

export class SessionManager {
  private store: SessionStore
  private listeners: Map<string, Set<(event: SessionEventPayload) => void>> = new Map()

  /** Callback for state change notifications (e.g., forward to WS adapter) */
  onStateChange?: (sessionId: string, state: Record<string, unknown>) => void

  constructor(store?: SessionStore) {
    this.store = store ?? new SessionStore()
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  create(name: string, creatorUserId: string) {
    const session = this.store.create(name)
    // Add creator as first user
    this.store.update({
      id: session.id,
      users: JSON.stringify([creatorUserId]),
    })
    const updated = this.store.get(session.id) as SharedSession
    this.emit("user_joined", session.id, creatorUserId)
    this.emitStateChange(session.id, { users: [creatorUserId] })
    return updated
  }

  get(id: string) {
    return this.store.get(id)
  }

  list() {
    return this.store.list()
  }

  // ── Agent Management ──────────────────────────────────────────────

  addAgent(sessionId: string, agentId: string) {
    const session = this.store.get(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)
    const agents: string[] = JSON.parse(session.agents)
    if (!agents.includes(agentId)) {
      agents.push(agentId)
      this.store.update({ id: sessionId, agents: JSON.stringify(agents) })
    }
    this.emit("agent_joined", sessionId, agentId)
    this.emitStateChange(sessionId, { agents })
    return agents
  }

  removeAgent(sessionId: string, agentId: string) {
    const session = this.store.get(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)
    const agents: string[] = JSON.parse(session.agents).filter((a: string) => a !== agentId)
    this.store.update({ id: sessionId, agents: JSON.stringify(agents) })
    this.emit("agent_left", sessionId, agentId)
    this.emitStateChange(sessionId, { agents })
    return agents
  }

  // ── User Management ───────────────────────────────────────────────

  joinUser(sessionId: string, userId: string) {
    const session = this.store.get(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)
    const users: string[] = JSON.parse(session.users)
    if (!users.includes(userId)) {
      users.push(userId)
      this.store.update({ id: sessionId, users: JSON.stringify(users) })
    }
    this.emit("user_joined", sessionId, userId)
    this.emitStateChange(sessionId, { users })
    return users
  }

  leaveUser(sessionId: string, userId: string) {
    const session = this.store.get(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)
    const users: string[] = JSON.parse(session.users).filter((u: string) => u !== userId)
    this.store.update({ id: sessionId, users: JSON.stringify(users) })
    this.emit("user_left", sessionId, userId)
    this.emitStateChange(sessionId, { users })
    return users
  }

  // ── Session Status ────────────────────────────────────────────────

  close(sessionId: string) {
    this.store.close(sessionId)
    this.emit("session_closed", sessionId)
    this.emitStateChange(sessionId, { status: "closed" })
  }

  remove(sessionId: string) {
    this.store.remove(sessionId)
  }

  // ── Event System ──────────────────────────────────────────────────

  on(event: SessionEvent, listener: (payload: SessionEventPayload) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)?.add(listener)
    return () => this.listeners.get(event)?.delete(listener)
  }

  private emit(event: SessionEvent, sessionId: string, actor?: string, data?: Record<string, unknown>) {
    const payload: SessionEventPayload = { event, sessionId, actor, data, timestamp: Date.now() }
    const handlers = this.listeners.get(event)
    if (handlers) {
      for (const handler of handlers) {
        try { handler(payload) } catch { /* isolate listener failures */ }
      }
    }
  }

  private emitStateChange(sessionId: string, partial: Record<string, unknown>) {
    this.onStateChange?.(sessionId, partial)
  }

  closeDb() {
    this.store.closeDb()
  }
}
