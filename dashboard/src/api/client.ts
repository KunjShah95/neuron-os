import type { Agent, MemoryEntry, WsEventPayload, WsHealthResponse } from "./types"

const BASE = "/api/v1"

/** Default retry config for transient failures. */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 200,
  maxDelayMs: 2000,
}

/** WebSocket URL for real-time updates (derived from current origin). */
export function getWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${proto}//${window.location.host}/api/v1/ws`
}

/** SSE fallback URL for environments without WebSocket support. */
export function getSseUrl(): string {
  return "/api/v1/events"
}

/**
 * Fetch with exponential backoff retry for transient failures.
 * Retries on network errors and 5xx status codes. Does not retry 4xx.
 */
async function requestWithRetry<T>(
  path: string,
  init?: RequestInit,
  retries = RETRY_CONFIG.maxRetries,
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(BASE + path, {
        ...init,
        headers: { "Content-Type": "application/json", ...init?.headers },
        signal: init?.signal ?? undefined,
      })

      if (!res.ok) {
        // Don't retry 4xx client errors
        if (res.status >= 400 && res.status < 500) {
          const body = await res.json().catch(() => ({}))
          throw new ApiError((body as any).error || `HTTP ${res.status}`, res.status)
        }
        // Retry 5xx server errors
        throw new ApiError(`HTTP ${res.status}`, res.status)
      }

      return res.json()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status >= 400 && err.status < 500) throw err // Don't retry 4xx
        lastError = err
      } else if (err instanceof DOMException && err.name === "AbortError") {
        throw err // Don't retry aborted requests
      } else {
        lastError = err instanceof Error ? err : new Error(String(err))
      }

      if (attempt < retries) {
        const delay = Math.min(RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt), RETRY_CONFIG.maxDelayMs)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }

  throw lastError || new Error(`Request failed after ${retries} retries`)
}

/** Typed API error with HTTP status code. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

/** Options for the raw request helper. */
export interface RequestOptions {
  method?: string
  body?: unknown
  signal?: AbortSignal
  retries?: number
}

/**
 * Low-level request helper with retry.
 */
export async function apiRequest<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const init: RequestInit = { method: opts.method || "GET" }
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body)
  }
  if (opts.signal) {
    init.signal = opts.signal
  }
  return requestWithRetry<T>(path, init, opts.retries)
}

export const api = {
  /** Server health check with no retry (fast fail). */
  health: () =>
    requestWithRetry<{ status: string; agents: number; uptime: number }>("/health", {}, 0),

  /** WebSocket connection health stats. */
  wsHealth: () =>
    requestWithRetry<WsHealthResponse>("/ws/health"),

  listAgents: () =>
    requestWithRetry<{ agents: Agent[] }>("/agents").then((r) => r.agents),

  getAgent: (id: string) => requestWithRetry<Agent>(`/agents/${id}`),

  spawnAgent: (name: string, type?: string) =>
    requestWithRetry<{ id: string; name: string; status: string }>("/agents", {
      method: "POST",
      body: JSON.stringify({ name, type }),
    }),

  killAgent: (id: string) =>
    requestWithRetry<{ status: string }>(`/agents/${id}`, { method: "DELETE" }),

  sendTask: (agentId: string, goal: string) =>
    requestWithRetry<{ taskId: string; status: string }>(`/agents/${agentId}/tasks`, {
      method: "POST",
      body: JSON.stringify({ goal }),
    }),

  getMemory: () =>
    requestWithRetry<{ memory: string }>("/memory").then((r) => r.memory),

  appendMemory: (content: string) =>
    requestWithRetry<{ status: string }>("/memory", {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  searchMemory: (query: string) =>
    requestWithRetry<{ results: MemoryEntry[] }>("/memory/search", {
      method: "POST",
      body: JSON.stringify({ query }),
    }).then((r) => r.results),

  getTypes: () => requestWithRetry<{ types: any[] }>("/types").then((r) => r.types),
}
