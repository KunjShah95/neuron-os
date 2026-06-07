import { EventEmitter } from "node:events"
import { createServer, connect, type Socket, type AddressInfo } from "node:net"
import { cpus, totalmem, freemem, hostname } from "node:os"

import type { WorkerInfo, WorkerStatus, ClusterConfig, ElectionState } from "./types"
import { SecureTransport } from "./transport"

export interface PoolEventMap {
  "worker:join": [WorkerInfo]
  "worker:leave": [string]
  "worker:status": [WorkerInfo]
  "election:new-leader": [string]
  "election:term-change": [number]
}

export class WorkerPool extends EventEmitter {
  private config: ClusterConfig
  readonly workers: Map<string, WorkerInfo> = new Map()
  private election: ElectionState
  private server: ReturnType<typeof createServer> | null = null
  private connections: Map<string, Socket> = new Map()
  private key: Buffer
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private leaderSocket: Socket | null = null
  private started = false
  private _localInfo: WorkerInfo | null = null
  private pendingTasks: Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }> = new Map()

  constructor(config: ClusterConfig) {
    super()
    this.config = {
      heartbeatIntervalMs: 5_000,
      heartbeatTimeoutMs: 15_000,
      ...config,
    }
    this.key = SecureTransport.deriveKey(this.config.secret)
    this.election = {
      currentLeader: null,
      term: 0,
      votedFor: null,
      lastHeartbeat: 0,
    }
  }

  private getOsInfo() {
    const mem = totalmem()
    const free = freemem()
    return {
      cpu: cpus().length,
      memory: Math.round((mem - free) / (1024 * 1024)),
      totalMemory: Math.round(mem / (1024 * 1024)),
    }
  }

  getLocalInfo(): WorkerInfo {
    if (!this._localInfo) {
      const os = this.getOsInfo()
      this._localInfo = {
        id: this.config.nodeId,
        hostname: hostname(),
        port: this.config.listenPort,
        status: "starting",
        capacity: {
          cpu: os.cpu,
          memory: os.totalMemory,
          gpu: false,
          agents: 0,
          maxAgents: Math.max(1, os.cpu * 2),
        },
        lastHeartbeat: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        tags: [],
      }
    }
    return { ...this._localInfo }
  }

  async start(): Promise<void> {
    if (this.started) return
    this.started = true

    if (this.config.role === "leader") {
      await this.startLeader()
    } else {
      await this.startWorker()
    }
  }

  private async startLeader(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => {
        this.handleConnection(socket)
      })

      this.server.listen(this.config.listenPort, () => {
        this.server!.address() as AddressInfo
        const local = this.getLocalInfo()
        local.status = "ready"
        this._localInfo = local
        this.workers.set(this.config.nodeId, local)
        this.election.currentLeader = this.config.nodeId
        this.election.term++
        this.election.votedFor = this.config.nodeId

        this.startHeartbeatChecker()

        this.emit("election:new-leader", this.config.nodeId)
        this.emit("election:term-change", this.election.term)
        resolve()
      })

      this.server.on("error", reject)
    })
  }

  private async startWorker(): Promise<void> {
    const leaderHost = this.config.leaderHost
    const leaderPort = this.config.leaderPort
    if (!leaderHost || !leaderPort) {
      throw new Error("Worker requires leaderHost and leaderPort")
    }

    const local = this.getLocalInfo()
    local.status = "starting"
    this._localInfo = local

    // Try to connect to leader
    await this.connectToLeader(leaderHost, leaderPort)
  }

  private async connectToLeader(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = connect(port, host, () => {
        this.leaderSocket = socket
        const local = this.getLocalInfo()
        local.status = "ready"
        this._localInfo = local

        this.sendMessage(socket, "register", local)
        this.startHeartbeatLoop(socket)
        this.handleLeaderMessages(socket)
        resolve()
      })

      socket.on("error", (err) => {
        if (!this.leaderSocket) {
          this.startElection()
          reject(err)
        }
      })

      socket.on("close", () => {
        this.leaderSocket = null
        this.election.currentLeader = null
        if (this.started) {
          this.startElection()
        }
      })

      setTimeout(() => {
        if (!this.leaderSocket) {
          this.startElection()
          reject(new Error("Connection to leader timed out"))
        }
      }, 5_000)
    })
  }

  private startHeartbeatLoop(_socket: Socket): void {
    const interval = this.config.heartbeatIntervalMs!
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = setInterval(() => {
      if (this.leaderSocket && this._localInfo) {
        this.sendMessage(this.leaderSocket, "heartbeat", {
          id: this.config.nodeId,
          capacity: this._localInfo.capacity,
          status: this._localInfo.status,
        })
      }
    }, interval)
    this.heartbeatTimer.unref()
  }

  private startHeartbeatChecker(): void {
    const timeout = this.config.heartbeatTimeoutMs!
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now()
      for (const [id, worker] of this.workers) {
        if (id === this.config.nodeId) continue
        const hbTime = new Date(worker.lastHeartbeat).getTime()
        if (now - hbTime > timeout) {
          worker.status = "offline"
          this.workers.set(id, worker)
          this.emit("worker:status", worker)
          this.emit("worker:leave", id)
          this.connections.delete(id)
        }
      }
    }, timeout / 2)
    this.heartbeatTimer.unref()
  }

  private handleConnection(socket: Socket): void {
    let buffer = ""

    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf-8")
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const { type, payload } = SecureTransport.parseMessage(line, this.key)
          this.handleLeaderMessage(type, payload as Record<string, unknown>, socket)
        } catch {
          // Ignore malformed messages
        }
      }
    })

    socket.on("close", () => {
      for (const [id, sock] of this.connections) {
        if (sock === socket) {
          const w = this.workers.get(id)
          if (w) {
            w.status = "offline"
            this.workers.set(id, w)
            this.emit("worker:status", w)
            this.emit("worker:leave", id)
          }
          this.connections.delete(id)
          break
        }
      }
    })
  }

  private handleLeaderMessage(type: string, payload: Record<string, unknown>, socket: Socket): void {
    switch (type) {
      case "register": {
        const info = payload as unknown as WorkerInfo
        this.workers.set(info.id, info)
        this.connections.set(info.id, socket)
        this.emit("worker:join", info)

        // Send acknowledgment with current state
        this.sendMessage(socket, "registered", {
          leaderId: this.config.nodeId,
          term: this.election.term,
          workers: Array.from(this.workers.values()),
        })
        break
      }
      case "heartbeat": {
        const workerId = payload.id as string
        const worker = this.workers.get(workerId)
        if (worker) {
          worker.lastHeartbeat = new Date().toISOString()
          worker.status = (payload.status as WorkerStatus) ?? worker.status
          if (payload.capacity) {
            worker.capacity = payload.capacity as WorkerInfo["capacity"]
          }
          this.workers.set(workerId, worker)
          this.emit("worker:status", worker)
        }
        break
      }
      case "task-result": {
        const taskId = payload.taskId as string
        const pending = this.pendingTasks.get(taskId)
        if (pending) {
          pending.resolve(payload.result)
          clearTimeout(pending.timer)
          this.pendingTasks.delete(taskId)
        }
        break
      }
      case "election": {
        const candidateId = payload.candidateId as string
        const term = payload.term as number
        // Simple bully: higher ID wins
        if (term >= this.election.term) {
          this.election.term = term
          this.election.currentLeader = candidateId
          this.election.votedFor = candidateId
          this.sendMessage(socket, "election-ack", { term: this.election.term })
          this.emit("election:new-leader", candidateId)
          this.emit("election:term-change", term)
        }
        break
      }
      case "election-ack": {
        // Another leader already exists
        const ackTerm = payload.term as number
        if (ackTerm >= this.election.term) {
          this.election.term = ackTerm
        }
        break
      }
      case "disconnect": {
        const disconnectId = payload.id as string
        this.connections.delete(disconnectId)
        break
      }
    }
  }

  private handleLeaderMessages(socket: Socket): void {
    let buffer = ""
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf-8")
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const { type, payload } = SecureTransport.parseMessage(line, this.key)
          this.handleWorkerMessage(type, payload as Record<string, unknown>)
        } catch {
          // Ignore malformed messages
        }
      }
    })
  }

  private handleWorkerMessage(type: string, payload: Record<string, unknown>): void {
    switch (type) {
      case "registered": {
        this.election.currentLeader = payload.leaderId as string
        this.election.term = payload.term as number
        const workers = payload.workers as WorkerInfo[]
        for (const w of workers) {
          this.workers.set(w.id, w)
        }
        this.emit("election:new-leader", this.election.currentLeader)
        break
      }
      case "task": {
        const taskId = payload.taskId as string
        const taskType = payload.taskType as string
        const taskPayload = payload.taskPayload
        this.emit("task", { taskId, taskType, taskPayload, sourceWorkerId: payload.sourceWorkerId as string })
        break
      }
      case "broadcast": {
        this.emit("broadcast", payload)
        break
      }
    }
  }

  private sendMessage(socket: Socket, type: string, payload: unknown): void {
    const msg = SecureTransport.createMessage(type, payload, this.key)
    socket.write(msg + "\n")
  }

  private startElection(): void {
    this.election.term++
    this.election.votedFor = this.config.nodeId
    this.election.currentLeader = null
    this.emit("election:term-change", this.election.term)

    // If no leader connection, promote self
    if (!this.leaderSocket) {
      // Check if there are other nodes with higher IDs
      const higherNodes = Array.from(this.workers.values())
        .filter((w) => w.id > this.config.nodeId && w.status !== "offline")

      if (higherNodes.length === 0) {
        // We win the election
        this.becomeLeader()
      }
    }
  }

  private async becomeLeader(): Promise<void> {
    this.config.role = "leader"
    this.election.currentLeader = this.config.nodeId
    this.election.votedFor = this.config.nodeId

    if (!this.server) {
      await this.startLeader()
    } else {
      this.emit("election:new-leader", this.config.nodeId)
      this.emit("election:term-change", this.election.term)
    }
  }

  async stop(): Promise<void> {
    this.started = false
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    // Notify leader we're leaving
    if (this.leaderSocket) {
      this.sendMessage(this.leaderSocket, "disconnect", { id: this.config.nodeId })
      this.leaderSocket.end()
      this.leaderSocket = null
    }

    for (const [, socket] of this.connections) {
      socket.end()
    }
    this.connections.clear()

    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()))
      this.server = null
    }

    this.workers.clear()
    this.pendingTasks.clear()
    this._localInfo = null
  }

  listWorkers(status?: WorkerStatus): WorkerInfo[] {
    const all = Array.from(this.workers.values())
    if (status) return all.filter((w) => w.status === status)
    return all
  }

  getReadyWorkers(): WorkerInfo[] {
    return Array.from(this.workers.values()).filter(
      (w) => w.status === "ready" && w.id !== this.config.nodeId,
    )
  }

  isLeader(): boolean {
    return this.config.role === "leader"
  }

  getLeader(): WorkerInfo | null {
    if (!this.election.currentLeader) return null
    return this.workers.get(this.election.currentLeader) ?? null
  }

  async sendTask(workerId: string, task: { id: string; type: string; payload: unknown }): Promise<unknown> {
    if (this.isLeader()) {
      const socket = this.connections.get(workerId)
      if (!socket) throw new Error(`Worker "${workerId}" not connected`)

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingTasks.delete(task.id)
          reject(new Error(`Task "${task.id}" timed out`))
        }, 60_000)

        this.pendingTasks.set(task.id, { resolve, reject, timer })
        this.sendMessage(socket, "task", {
          taskId: task.id,
          taskType: task.type,
          taskPayload: task.payload,
          sourceWorkerId: this.config.nodeId,
        })
      })
    }

    // Not leader, route through leader
    if (this.leaderSocket) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingTasks.delete(task.id)
          reject(new Error(`Task "${task.id}" timed out`))
        }, 60_000)

        this.pendingTasks.set(task.id, { resolve, reject, timer })
        this.sendMessage(this.leaderSocket!, "forward-task", {
          targetWorkerId: workerId,
          taskId: task.id,
          taskType: task.type,
          taskPayload: task.payload,
          sourceWorkerId: this.config.nodeId,
        })
      })
    }

    throw new Error("No leader available")
  }

  /**
   * Send a task result back to the leader.
   * Workers call this after processing a received task.
   */
  sendTaskResult(taskId: string, result: unknown): void {
    if (this.leaderSocket) {
      this.sendMessage(this.leaderSocket, "task-result", { taskId, result })
    }
  }

  async broadcast(message: { type: string; payload: unknown }): Promise<void> {
    const msg = { ...message, sourceWorkerId: this.config.nodeId }
    for (const [id, socket] of this.connections) {
      if (id !== this.config.nodeId) {
        try {
          this.sendMessage(socket, "broadcast", msg)
        } catch {
          // Best effort broadcast
        }
      }
    }
  }

  getStats() {
    const all = Array.from(this.workers.values())
    const ready = all.filter((w) => w.status === "ready")
    return {
      totalWorkers: all.length,
      readyWorkers: ready.length,
      leader: this.election.currentLeader,
      term: this.election.term,
      totalCapacity: all.reduce(
        (acc, w) => ({
          cpu: acc.cpu + (w.status !== "offline" ? w.capacity.cpu : 0),
          memory: acc.memory + (w.status !== "offline" ? w.capacity.memory : 0),
          agents: acc.agents + (w.status !== "offline" ? w.capacity.maxAgents - w.capacity.agents : 0),
        }),
        { cpu: 0, memory: 0, agents: 0 },
      ),
    }
  }
}
