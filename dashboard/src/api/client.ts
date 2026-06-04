import type { Agent, MemoryEntry, WsEventPayload } from "./types"

const BASE = "/api/v1"

/** WebSocket URL for real-time updates (derived from current origin). */
export function getWsUrl(): string {
  return "/api/v1/ws"
}

/** SSE fallback URL for environments without WebSocket support. */
export function getSseUrl(): string {
  return "/api/v1/events"
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as any).error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  health: () => request<{ status: string; agents: number; uptime: number }>("/health"),

  listAgents: () =>
    request<{ agents: Agent[] }>("/agents").then((r) => r.agents),

  getAgent: (id: string) => request<Agent>(`/agents/${id}`),

  spawnAgent: (name: string, type?: string) =>
    request<{ id: string; name: string; status: string }>("/agents", {
      method: "POST",
      body: JSON.stringify({ name, type }),
    }),

  killAgent: (id: string) =>
    request<{ status: string }>(`/agents/${id}`, { method: "DELETE" }),

  sendTask: (agentId: string, goal: string) =>
    request<{ taskId: string; status: string }>(`/agents/${agentId}/tasks`, {
      method: "POST",
      body: JSON.stringify({ goal }),
    }),

  getMemory: () => request<{ memory: { content: string; timestamp: string }[] }>("/memory").then(r => r.memory),

  appendMemory: (content: string) =>
    request<{ status: string }>("/memory", {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  searchMemory: (query: string) =>
    request<{ results: MemoryEntry[] }>("/memory/search", {
      method: "POST",
      body: JSON.stringify({ query }),
    }).then((r) => r.results),

  getTypes: () => request<{ types: any[] }>("/types").then((r) => r.types),
}
