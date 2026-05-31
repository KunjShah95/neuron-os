import { spawn } from "bun"
import type { Subprocess } from "bun"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type {
  AgentDef,
  AgentInstance,
  AgentLogEntry,
  AgentLogLevel,
  AgentIpcMessage,
  AgentEvent,
  AgentManagerOptions,
  AgentEventType,
  RecoveryConfig,
  RecoveryState,
} from "./types"
import { HookRegistry } from "./hooks"
import { getAgentType, getAllAgentTypes, type AgentType } from "./agent-types"

// ── Helpers ───────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let nextAgentId = 1
function generateId(): string {
  return `agent-${nextAgentId++}-${Date.now().toString(36)}`
}

function now(): number {
  return Date.now()
}

const DEFAULT_RECOVERY: Required<RecoveryConfig> = {
  maxRetries: 5,
  backoffMs: 1_000,
  backoffMultiplier: 2,
  backoffMax: 60_000,
}

// ── AgentManager ──────────────────────────────────────────────────────

export class AgentManager {
  /** All tracked agent instances, keyed by id */
  readonly agents = new Map<string, AgentInstance>()

  /** Lifecycle hook registry */
  readonly hooks = new HookRegistry()

  /** Per-agent recovery state */
  private recoveryStates = new Map<string, RecoveryState>()

  /** External event callbacks (supports multiple listeners) */
  private listeners: Set<(event: AgentEvent) => void> = new Set()

  /** Heartbeat timer handle */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  /** Map from agent ID to abort controllers for in-flight operations */
  private abortControllers = new Map<string, AbortController>()

  constructor(opts: AgentManagerOptions = {}) {
    if (opts.onEvent) {
      this.listeners.add(opts.onEvent)
    }
    const hbMs = opts.heartbeatMs ?? 5_000

    if (hbMs > 0) {
      this.heartbeatTimer = setInterval(() => this.checkHeartbeats(), hbMs * 2)
    }
  }

  /** Register a listener for agent events. */
  onEvent(cb: (event: AgentEvent) => void): void {
    this.listeners.add(cb)
  }

  /** Remove an event listener. */
  offEvent(cb: (event: AgentEvent) => void): void {
    this.listeners.delete(cb)
  }

  // ── Spawn ───────────────────────────────────────────────────────────

  /**
   * Spawn a new agent worker as a child process.
   * Returns the agent id once the process is launched.
   */
  async spawn(def: AgentDef): Promise<string> {
    // If agentType is specified, apply type configuration
    let effectiveDef = def
    if (def.agentType) {
      const type = getAgentType(def.agentType)
      if (!type) {
        throw new Error(`Unknown agent type: ${def.agentType}. Run 'aegis agent types' to see available types.`)
      }
      
      // Merge type tools with def tools (def overrides)
      const tools = def.tools ?? type.tools
      
      // Apply type configuration
      effectiveDef = {
        ...def,
        tools,
        env: {
          ...def.env,
          AEGIS_AGENT_TYPE: type.name,
          AEGIS_SYSTEM_PROMPT: type.systemPrompt,
          ...(type.modelHint ? { AEGIS_MODEL_HINT: type.modelHint } : {}),
          ...(type.maxTurns ? { AEGIS_MAX_TURNS: String(type.maxTurns) } : {}),
          ...(type.temperature ? { AEGIS_TEMPERATURE: String(type.temperature) } : {}),
        },
      }
    }
    
    const id = generateId()
    const scriptPath = resolve(process.cwd(), effectiveDef.script)

    // Pre-spawn hook
    const instance = this.createPendingInstance(id, effectiveDef)
    this.agents.set(id, instance)

    const controller = new AbortController()
    this.abortControllers.set(id, controller)

    await this.hooks.run("spawn", "pre", id, instance, { def: effectiveDef })

    try {
      const child = spawn({
        cmd: ["bun", "run", scriptPath, ...(effectiveDef.args ?? [])],
        env: {
          ...process.env as Record<string, string>,
          AEGIS_AGENT_ID: id,
          AEGIS_AGENT_NAME: effectiveDef.name,
          ...effectiveDef.env,
        },
        stdout: "pipe",
        stderr: "pipe",
        stdin: "pipe",
      })

      instance.process = child
      instance.pid = child.pid

      // Wire up stdout (IPC channel)
      if (child.stdout) {
        this.readStream(id, child.stdout, "stdout")
      }

      // Wire up stderr (free-form logging)
      if (child.stderr) {
        this.readStream(id, child.stderr, "stderr")
      }

      // Process exit handler — triggers auto-recovery if configured
      child.exited.then((code) => {
        instance.exitCode = code
        const prevStatus = instance.status
        const exitedStatus: "stopped" | "error" = code === 0 ? "stopped" : "error"
        instance.status = exitedStatus

        if (code !== 0 && prevStatus !== "stopping") {
          this.emit("agent:error", id, { code, message: `Process exited with code ${code}` })
          // Attempt auto-recovery — if triggered, skip exit event
          const didRecover = this.triggerRecovery(id, code)
          if (!didRecover) {
            this.emit("agent:exit", id, { code })
          }
        } else {
          this.emit("agent:exit", id, { code })
        }

        instance.log.push(this.makeLog("info", `Process exited with code ${code}`))
        this.abortControllers.delete(id)
      })

      this.emit("agent:spawned", id, { pid: child.pid })
      instance.log.push(this.makeLog("info", `Spawned (pid ${child.pid})`))
      
      if (effectiveDef.agentType) {
        instance.log.push(this.makeLog("info", `Agent type: ${effectiveDef.agentType}`))
      }

      // Wait for "ready" message with a timeout
      await this.waitForReady(id, 10_000)

      // Post-spawn hook
      await this.hooks.run("spawn", "post", id, instance, { def: effectiveDef })
    } catch (err) {
      instance.status = "error"
      const msg = err instanceof Error ? err.message : String(err)
      instance.log.push(this.makeLog("error", `Spawn failed: ${msg}`))
      this.emit("agent:error", id, { message: msg })
      throw err
    }

    return id
  }

  // ── Auto-Recovery ──────────────────────────────────────────────────

  /**
   * Calculate the backoff delay for a given retry attempt.
   * Uses exponential backoff: base * multiplier^attempt, capped at max.
   */
  private calculateBackoff(cfg: Required<RecoveryConfig>, attempt: number): number {
    const delay = cfg.backoffMs * Math.pow(cfg.backoffMultiplier, attempt)
    return Math.min(delay, cfg.backoffMax)
  }

  /**
   * Trigger auto-recovery for a crashed agent.
   * Returns true if a recovery was scheduled, false if recovery is disabled or exhausted.
   */
  private triggerRecovery(id: string, exitCode: number): boolean {
    const instance = this.agents.get(id)
    if (!instance) return false

    const cfg = instance.def.recovery
    if (!cfg) return false // Recovery not configured

    const resolved: Required<RecoveryConfig> = {
      maxRetries: cfg.maxRetries ?? DEFAULT_RECOVERY.maxRetries,
      backoffMs: cfg.backoffMs ?? DEFAULT_RECOVERY.backoffMs,
      backoffMultiplier: cfg.backoffMultiplier ?? DEFAULT_RECOVERY.backoffMultiplier,
      backoffMax: cfg.backoffMax ?? DEFAULT_RECOVERY.backoffMax,
    }

    // Get or create recovery state
    let rs = this.recoveryStates.get(id)
    if (!rs) {
      rs = { attempt: 0, active: true, timerId: null, lastRecoveryAt: null }
      this.recoveryStates.set(id, rs)
    }

    // Check max retries
    if (rs.attempt >= resolved.maxRetries) {
      rs.active = false
      instance.log.push(this.makeLog("error", `Auto-recovery exhausted after ${rs.attempt} attempts, giving up`))
      this.emit("agent:maxRetries", id, { attempts: rs.attempt, exitCode })
      return false
    }

    const delay = this.calculateBackoff(resolved, rs.attempt)
    rs.active = true
    rs.attempt++
    rs.lastRecoveryAt = now()

    instance.log.push(this.makeLog("warn", `Auto-recovery #${rs.attempt} in ${delay}ms (exit code ${exitCode})`))
    this.emit("agent:recovering", id, { attempt: rs.attempt, delay, exitCode })

    rs.timerId = setTimeout(() => {
      this.performRecovery(id, resolved)
    }, delay)

    return true
  }

  /**
   * Perform the actual respawn of a crashed agent.
   * Spreads the original AgentDef, preserving all config.
   */
  private async performRecovery(id: string, cfg: Required<RecoveryConfig>): Promise<void> {
    const instance = this.agents.get(id)
    if (!instance) return

    const rs = this.recoveryStates.get(id)
    if (!rs || !rs.active) return

    instance.log.push(this.makeLog("info", `Auto-recovery #${rs.attempt}: respawning…`))
    rs.timerId = null

    try {
      const newId = await this.spawn(instance.def)
      const newInstance = this.agents.get(newId)
      if (newInstance) {
        // Copy recovery state to the new instance
        newInstance.metadata = instance.metadata
        newInstance.log.push(this.makeLog("success", `Recovered from crash #${rs.attempt - 1} (was agent "${id}")`))
      }
      // Clean up old recovery state
      this.recoveryStates.delete(id)
      this.emit("agent:recovered", id, { newId, attempts: rs.attempt })
      instance.log.push(this.makeLog("success", `Recovery #${rs.attempt} succeeded (new id: ${newId})`))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      instance.log.push(this.makeLog("error", `Recovery #${rs.attempt} failed: ${msg}`))
      this.emit("agent:error", id, { message: `Recovery #${rs.attempt} failed: ${msg}` })

      // Retry with backoff if still within limits
      if (rs.attempt < cfg.maxRetries) {
        const delay = this.calculateBackoff(cfg, rs.attempt)
        rs.attempt++
        rs.lastRecoveryAt = now()
        instance.log.push(this.makeLog("warn", `Retrying recovery #${rs.attempt} in ${delay}ms`))
        this.emit("agent:recovering", id, { attempt: rs.attempt, delay })
        rs.timerId = setTimeout(() => this.performRecovery(id, cfg), delay)
      } else {
        rs.active = false
        instance.log.push(this.makeLog("error", `Auto-recovery exhausted after ${rs.attempt} attempts`))
        this.emit("agent:maxRetries", id, { attempts: rs.attempt })
      }
    }
  }

  /**
   * Cancel any pending recovery for an agent.
   * Used before a user-requested kill or manual respawn.
   */
  cancelRecovery(id: string): void {
    const rs = this.recoveryStates.get(id)
    if (rs) {
      if (rs.timerId) clearTimeout(rs.timerId)
      rs.active = false
      rs.timerId = null
      this.recoveryStates.delete(id)
    }
  }

  /** Check whether an agent has a pending recovery scheduled. */
  hasPendingRecovery(id: string): boolean {
    const rs = this.recoveryStates.get(id)
    return rs?.active ?? false
  }

  // ── Kill ────────────────────────────────────────────────────────────

  /**
   * Stop an agent gracefully (SIGTERM), then force kill after timeout.
   * Cancels any pending auto-recovery.
   */
  async kill(id: string, timeoutMs?: number): Promise<void> {
    const instance = this.agents.get(id)
    if (!instance) throw new Error(`Agent "${id}" not found`)

    // Cancel any pending recovery first
    this.cancelRecovery(id)

    const terminalStates = new Set(["stopped", "stopping", "error"])
    if (terminalStates.has(instance.status)) return

    await this.hooks.run("kill", "pre", id, instance)

    // Mark as stopping before sending shutdown
    instance.status = "stopping"
    this.emit("agent:stopped", id, { reason: "user-requested" })

    const timeout = timeoutMs ?? instance.def.stopTimeout ?? 5_000

    // Send graceful shutdown via stdin
    try {
      this.sendIpc(id, { type: "shutdown", id: "kill-cmd", payload: {}, timestamp: now() })
    } catch {
      // Stdin might already be closed — fall through to SIGKILL path
    }

    // Wait for exit, then SIGKILL if still alive
    const exitPromise = instance.process.exited
    const timer = new Promise<number>((resolve) => setTimeout(() => resolve(-1), timeout))
    const code = await Promise.race([exitPromise, timer])

    if (code === -1) {
      instance.process.kill(9) // SIGKILL
      instance.log.push(this.makeLog("warn", "Force killed (SIGKILL)"))
    }

    instance.exitCode = code as number | null
    instance.status = "stopped"

    await this.hooks.run("kill", "post", id, instance)
  }

  // ── Send IPC message ────────────────────────────────────────────────

  sendIpc(id: string, msg: AgentIpcMessage): void {
    const instance = this.agents.get(id)
    if (!instance) throw new Error(`Agent "${id}" not found`)

    const stdin = instance.process.stdin
    if (stdin === undefined || stdin === null || typeof stdin === "number") {
      throw new Error(`Agent "${id}" has no writable stdin (already exited?)`)
    }

    try {
      const line = JSON.stringify(msg) + "\n"
      const encoded = new TextEncoder().encode(line)
      stdin.write(encoded)
      stdin.flush()
    } catch (err) {
      instance.log.push(this.makeLog("error", `Failed to send IPC message: ${String(err)}`))
    }
  }

  // ── Agent-to-agent routing ─────────────────────────────────────────

  /**
   * Route an IPC message from one agent to another.
   * This enables agent-to-agent delegation (e.g. planner → coder).
   * The fromId agent sends a message, which is forwarded to the toId agent.
   */
  async routeIpc(fromId: string, toId: string, msg: AgentIpcMessage): Promise<unknown> {
    const fromAgent = this.agents.get(fromId)
    if (!fromAgent) throw new Error(`Source agent "${fromId}" not found`)

    const toAgent = this.agents.get(toId)
    if (!toAgent) throw new Error(`Target agent "${toId}" not found`)

    // Tag the message with routing metadata
    const routedMsg: AgentIpcMessage = {
      ...msg,
      id: msg.id || `route-${now()}`,
      payload: {
        ...(typeof msg.payload === "object" && msg.payload !== null ? (msg.payload as Record<string, unknown>) : {}),
        _routedFrom: fromId,
        _routedTo: toId,
      },
      timestamp: now(),
    }

    fromAgent.log.push(this.makeLog("info", `Routing IPC ${msg.type} → agent "${toAgent.def.name}" (${toId})`))
    toAgent.log.push(this.makeLog("info", `Received routed IPC ${msg.type} from agent "${fromAgent.def.name}" (${fromId})`))

    this.sendIpc(toId, routedMsg)

    // Return a promise that resolves when we get a response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.listeners.delete(handler)
        reject(new Error(`Route IPC timed out (${msg.type} from ${fromId} to ${toId})`))
      }, 60_000)

      const handler = (event: AgentEvent) => {
        if (event.type === "agent:result" && event.agentId === toId && event.data) {
          const data = event.data as { id?: string }
          if (data.id === routedMsg.id) {
            clearTimeout(timeout)
            this.listeners.delete(handler)
            resolve(event.data)
          }
        }
        if (event.type === "agent:error" && event.agentId === toId) {
          clearTimeout(timeout)
          this.listeners.delete(handler)
          reject(event.data || new Error(`Agent "${toId}" error during route`))
        }
      }
      this.listeners.add(handler)

      // Also handle via the sent IPC response
      const resultHandler = (event: AgentEvent) => {
        if (event.type === "agent:result" && event.agentId === toId) {
          // Already handled above
        }
      }
    })
  }

  /** Find an agent by name or type for routing */
  findAgentByName(name: string): AgentInstance | undefined {
    return Array.from(this.agents.values()).find((a) => a.def.name === name)
  }

  /** Find an agent by type for routing */
  findAgentByType(agentType: string): AgentInstance | undefined {
    return Array.from(this.agents.values()).find((a) => a.def.agentType === agentType)
  }

  // ── Send a ping to check aliveness ──────────────────────────────────

  ping(id: string): void {
    this.sendIpc(id, { type: "ping", id: "ping", payload: {}, timestamp: now() })
  }

  // ── Query ───────────────────────────────────────────────────────────

  get(id: string): AgentInstance | undefined {
    return this.agents.get(id)
  }

  list(filter?: { status?: string; tag?: string; agentType?: string }): AgentInstance[] {
    const all = Array.from(this.agents.values())
    if (!filter) return all
    return all.filter((a) => {
      if (filter.status && a.status !== filter.status) return false
      if (filter.tag && !a.def.tags?.includes(filter.tag)) return false
      if (filter.agentType && a.def.agentType !== filter.agentType) return false
      return true
    })
  }

  getLogs(id: string, opts?: { level?: AgentLogLevel; tail?: number }): AgentLogEntry[] {
    const instance = this.agents.get(id)
    if (!instance) return []
    let logs = instance.log
    if (opts?.level) logs = logs.filter((l) => l.level === opts.level)
    if (opts?.tail) logs = logs.slice(-opts.tail)
    return logs
  }

  /** Get all available agent types */
  getAvailableTypes(): AgentType[] {
    return getAllAgentTypes()
  }

  // ── Cleanup ─────────────────────────────────────────────────────────

  /** Kill all running agents and clean up timers. */
  async destroy(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)

    // Cancel all pending recoveries
    for (const [id] of this.recoveryStates) {
      this.cancelRecovery(id)
    }

    const kills: Promise<void>[] = []
    for (const [id, inst] of this.agents) {
      const terminalStates = new Set(["stopped", "error"])
      if (!terminalStates.has(inst.status)) {
        kills.push(this.kill(id, 3_000).catch(() => {}))
      }
    }
    await Promise.allSettled(kills)
    this.agents.clear()
    this.hooks.clear()
    this.listeners.clear()
    this.recoveryStates.clear()
  }

  // ── Private helpers ─────────────────────────────────────────────────

  private createPendingInstance(id: string, def: AgentDef): AgentInstance {
    // Use a null-coalesced stub — process is overwritten immediately after spawn()
    const stub = { pid: 0, kill: () => {}, exited: Promise.resolve(0), stdin: null, stdout: null, stderr: null } as unknown as Subprocess
    return {
      id,
      def,
      status: "spawning",
      process: stub,
      spawnTime: now(),
      lastActivity: now(),
      log: [],
      pid: 0,
      exitCode: null,
      metadata: {},
    }
  }

  private readStream(id: string, stream: ReadableStream<Uint8Array>, label: "stdout" | "stderr"): void {
    const instance = this.agents.get(id)
    if (!instance) return

    const decoder = new TextDecoder()
    let buffer = ""

    const reader = stream.getReader()
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            if (!line.trim()) continue

            if (label === "stdout") {
              // Try to parse as IPC message
              try {
                const msg = JSON.parse(line) as AgentIpcMessage
                this.handleIpcMessage(id, msg)
                continue
              } catch {
                // Not JSON — treat as log text
              }
            }

            // Fallback: treat as log text
            instance.log.push({
              level: label === "stderr" ? "error" : "info",
              text: line,
              timestamp: now(),
              stream: label,
            })
            this.emit("agent:log", id, { level: label === "stderr" ? "error" : "info", text: line })
          }
        }
      } catch {
        // Stream closed
      }
    }

    pump()
  }

  private handleIpcMessage(id: string, msg: AgentIpcMessage): void {
    const instance = this.agents.get(id)
    if (!instance) return

    instance.lastActivity = now()

    switch (msg.type) {
      case "result": {
        const payload = msg.payload as { status?: string } | undefined
        if (payload?.status === "ready") {
          instance.status = "running"
          this.emit("agent:ready", id)
        }
        this.emit("agent:result", id, { ...msg, agentId: id })
        break
      }
      case "log": {
        const p = msg.payload as { level?: AgentLogLevel; text?: string } | undefined
        if (p?.text) {
          instance.log.push(this.makeLog(p.level ?? "info", p.text))
          this.emit("agent:log", id, { level: p.level ?? "info", text: p.text })
        }
        break
      }
      case "heartbeat": {
        if (instance.status === "spawning") {
          instance.status = "running"
        }
        this.emit("agent:heartbeat", id)
        break
      }
      case "error": {
        const p2 = msg.payload as { message?: string } | undefined
        instance.log.push(this.makeLog("error", p2?.message ?? "Unknown error"))
        this.emit("agent:error", id, { message: p2?.message })
        break
      }
    }
  }

  private async waitForReady(id: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Agent "${id}" did not become ready within ${timeoutMs}ms`))
      }, timeoutMs)

      // Register a one-shot listener for the ready event
      const handler = (event: AgentEvent) => {
        if (event.type === "agent:ready" && event.agentId === id) {
          this.listeners.delete(handler)
          clearTimeout(timer)
          resolve()
        }
        if (event.type === "agent:error" && event.agentId === id) {
          this.listeners.delete(handler)
          clearTimeout(timer)
          const data = event.data as { message?: string } | undefined
          reject(new Error(data?.message ?? `Agent "${id}" entered error state during startup`))
        }
      }
      this.listeners.add(handler)

      // Also poll in case the event was fired before listener registration
      setTimeout(() => {
        const inst = this.agents.get(id)
        if (inst?.status === "running") {
          this.listeners.delete(handler)
          clearTimeout(timer)
          resolve()
        } else if (inst?.status === "error") {
          this.listeners.delete(handler)
          clearTimeout(timer)
          reject(new Error(`Agent "${id}" entered error state during startup`))
        }
      }, 100)
    })
  }

  private checkHeartbeats(): void {
    const nowTime = now()
    for (const [id, inst] of this.agents) {
      const terminalStates = new Set(["stopped", "error"])
      if (terminalStates.has(inst.status)) continue
      if (nowTime - inst.lastActivity > 30_000) {
        inst.status = "error"
        inst.log.push(this.makeLog("error", "Agent heartbeat timeout"))
        this.emit("agent:error", id, { message: "Heartbeat timeout" })
      }
    }
  }

  private emit(type: AgentEventType, agentId: string, data?: unknown): void {
    const event: AgentEvent = { type, agentId, data }
    for (const cb of this.listeners) {
      try { cb(event) } catch { /* isolate listener failures */ }
    }
  }

  private makeLog(level: AgentLogLevel, text: string): AgentLogEntry {
    return { level, text, timestamp: now() }
  }
}

/** Singleton instance */
export const agentManager = new AgentManager()
