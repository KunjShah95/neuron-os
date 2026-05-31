export interface AgentMemoryConfig {
  url?: string
  secret?: string
  enabled?: boolean
}

export interface SearchResult {
  content: string
  score: number
  source?: string
  timestamp?: string
}

export interface SessionSummary {
  id: string
  summary?: string
  created: string
  observationCount?: number
}

export interface Health {
  status: string
  service: string
  viewerPort?: number
}

export interface Stats {
  totalSessions?: number
  totalObservations?: number
  totalMemories?: number
}

const DEFAULT_URL = "http://localhost:3111"
const HEALTH_CACHE_MS = 30_000

export class AgentMemoryConnector {
  private baseUrl: string
  private secret: string
  private enabled: boolean
  private cachedHealth: Health | null = null
  private lastHealthCheck = 0

  constructor(config?: AgentMemoryConfig) {
    this.baseUrl = (config?.url || process.env.AGENTMEMORY_URL || DEFAULT_URL).replace(/\/+$/, "")
    this.secret = config?.secret || process.env.AGENTMEMORY_SECRET || ""
    this.enabled = config?.enabled ?? process.env.AGENTMEMORY_ENABLED !== "false"
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" }
    if (this.secret) h["Authorization"] = `Bearer ${this.secret}`
    return h
  }

  private async fetch<T>(path: string, body?: unknown): Promise<T | null> {
    if (!this.enabled) return null
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: body ? "POST" : "GET",
        headers: this.headers(),
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(5_000),
      })
      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) return null
        return null
      }
      return (await res.json()) as T
    } catch {
      return null
    }
  }

  async isAvailable(): Promise<boolean> {
    const now = Date.now()
    if (this.cachedHealth && now - this.lastHealthCheck < HEALTH_CACHE_MS) {
      return this.cachedHealth.status === "ok"
    }
    const health = await this.fetch<Health>("/agentmemory/livez")
    this.cachedHealth = health
    this.lastHealthCheck = now
    return health?.status === "ok"
  }

  async getHealth(): Promise<Health | null> {
    const h = await this.fetch<Health>("/agentmemory/health")
    if (h) {
      this.cachedHealth = h
      this.lastHealthCheck = Date.now()
    }
    return h
  }

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    if (!(await this.isAvailable())) return []
    const res = await this.fetch<{ results?: SearchResult[] }>("/agentmemory/smart-search", {
      query,
      limit,
      format: "text",
    })
    return res?.results || []
  }

  async remember(content: string, type = "insight", concepts?: string[]): Promise<string | null> {
    if (!(await this.isAvailable())) return null
    const res = await this.fetch<{ id?: string }>("/agentmemory/remember", { content, type, concepts })
    return res?.id || null
  }

  async observe(sessionId: string, content: string): Promise<void> {
    if (!(await this.isAvailable())) return
    await this.fetch("/agentmemory/observe", { sessionId, content })
  }

  async getContext(sessionId: string): Promise<string | null> {
    if (!(await this.isAvailable())) return null
    const res = await this.fetch<{ context?: string }>("/agentmemory/context", { sessionId })
    return res?.context || null
  }

  async startSession(): Promise<string | null> {
    if (!(await this.isAvailable())) return null
    const res = await this.fetch<{ sessionId?: string }>("/agentmemory/session/start")
    return res?.sessionId || null
  }

  async endSession(sessionId: string): Promise<void> {
    if (!(await this.isAvailable())) return
    await this.fetch("/agentmemory/session/end", { sessionId })
  }

  async listSessions(): Promise<SessionSummary[]> {
    if (!(await this.isAvailable())) return []
    const res = await this.fetch<{ sessions?: SessionSummary[] }>("/agentmemory/sessions")
    return res?.sessions || []
  }

  async forget(ids: string[]): Promise<void> {
    if (!(await this.isAvailable())) return
    await this.fetch("/agentmemory/forget", { observationIds: ids })
  }

  async getStats(): Promise<Stats> {
    const health = await this.getHealth()
    if (!health) return {}
    const sessions = await this.listSessions()
    return { totalSessions: sessions.length }
  }
}

export const agentMemory = new AgentMemoryConnector()
