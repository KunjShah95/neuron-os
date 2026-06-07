export type WorkerStatus = "starting" | "ready" | "busy" | "degraded" | "offline"

export interface WorkerInfo {
  id: string
  hostname: string
  port: number
  status: WorkerStatus
  capacity: {
    cpu: number
    memory: number
    gpu: boolean
    agents: number
    maxAgents: number
  }
  lastHeartbeat: string
  startedAt: string
  tags: string[]
}

export interface ClusterConfig {
  nodeId: string
  role: "leader" | "worker"
  leaderHost?: string
  leaderPort?: number
  listenPort: number
  secret: string
  heartbeatIntervalMs?: number
  heartbeatTimeoutMs?: number
}

export interface ElectionState {
  currentLeader: string | null
  term: number
  votedFor: string | null
  lastHeartbeat: number
}
