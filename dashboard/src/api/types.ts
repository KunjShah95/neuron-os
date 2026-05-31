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
