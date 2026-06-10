import { spawn } from "bun"
import type { Subprocess } from "bun"
import { resolve } from "node:path"
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
import { getAgentType, getAllAgentTypes, isValidAgentType, type AgentType, type AgentTypeName } from "./agent-types"
import { createLogger } from "../cli/logger"
import { DockerSandbox } from "../sandbox/docker"
import type { IsolationLevel } from "../sandbox/types"
import { BudgetGuard } from "../economy/budget-guard"
import { billingTracker } from "../billing/tracker"

const log = createLogger("agent:manager")

// ── Sandbox manager ───────────────────────────────────────────────────

/**
 * Global Docker sandbox instance for container-isolated agents.
 * Created lazily on first use.
 */
let dockerSandbox: DockerSandbox | null = null
function getDockerSandbox(): DockerSandbox {
  if (!dockerSandbox) {
    dockerSandbox = new DockerSandbox({
      enabled: true,
      networkEnabled: false,
      memoryLimit: "2g",
      readOnlyRoot: true,
    })
  }
  return dockerSandbox
}

// ── Helpers ───────────────────────────────────────────────────────────

let nextAgentId = 1
function generateId(): string {
  return `agent-${nextAgentId++}-${Date.now().toString(36)}`
}

function now(): number {
  return Date.now()
}

/** Map expensive models to cheaper alternatives when budget is tight. */
function degradeModelForBudget(model?: string): string | undefined {
  if (!model) return undefined
  const degradationMap: Record<string, string> = {
    "claude-sonnet-4-20250514": "gpt-4o-mini",
    "claude-sonnet-4-6": "gpt-4o-mini",
    "claude-3-5-sonnet-latest": "gpt-4o-mini",
    "claude-3-opus-latest": "claude-3-haiku-latest",
    "gpt-4o": "gpt-4o-mini",
    "gpt-4-turbo": "gpt-4o-mini",
    "o3-mini": "gpt-4o-mini",
    "gemini-2.0-flash": "gemini-2.0-flash-lite",
    "gemini-1.5-pro": "gemini-1.5-flash",
    "mistral-large-latest": "mistral-small-latest",
    "deepseek-chat": "deepseek-chat",
  }
  return degradationMap[model]
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

  /** Dream tick timer handle — triggers subconscious processing during idle */
  private dreamTickTimer: ReturnType<typeof setInterval> | null = null

  /** Predictive pre-warming timer handle */
  private prewarmTimer: ReturnType<typeof setInterval> | null = null

  /** Tracks which agent types have been pre-warmed and when (for TTL expiry) */
  private prewarmedTypes = new Map<string, number>()

  /** How long a pre-warmed agent type stays "warm" before it can be re-spawned (ms) */
  private readonly PREWARM_TTL = 30 * 60 * 1000 // 30 minutes

  /** Max concurrent pre-warmed agents */
  private readonly PREWARM_MAX_CONCURRENT = 2

  /** Timer refs for auto-shutdown of warm agents, keyed by agent ID */
  private prewarmShutdownTimers = new Map<string, ReturnType<typeof setTimeout>>()

  /** Prewarm prediction hit/miss counters */
  private prewarmStats = { hits: 0, misses: 0, promotions: 0 }

  /** Per-agent-type exponential backoff: next allowed retry timestamp (ms) */
  private prewarmBackoff = new Map<string, number>()

  /** Consecutive spawn failure count per agent type */
  private prewarmFailedAttempts = new Map<string, number>()

  /** Base backoff delay for first failed prewarm spawn (ms) */
  private readonly PREWARM_BACKOFF_BASE_MS = 60_000 // 1 minute

  /** Max backoff delay for prewarm spawn failures (ms) */
  private readonly PREWARM_BACKOFF_MAX_MS = 3_600_000 // 60 minutes

  /** The lightweight script used for pre-warmed agents */
  private readonly PREWARM_SCRIPT = "src/agent/warm-worker.ts"

  /** Map from agent ID to abort controllers for in-flight operations */
  private abortControllers = new Map<string, AbortController>()

  /** Per-agent budget guards, keyed by agent ID */
  private budgetGuards = new Map<string, BudgetGuard>()

  constructor(opts: AgentManagerOptions = {}) {
    if (opts.onEvent) {
      this.listeners.add(opts.onEvent)
    }
    const hbMs = opts.heartbeatMs ?? 5_000

    if (hbMs > 0) {
      this.heartbeatTimer = setInterval(() => this.checkHeartbeats(), hbMs * 2)
      this.heartbeatTimer.unref()
    }

    // Dream tick: check every 60s if dream engine should run a cycle
    this.dreamTickTimer = setInterval(() => this.dreamTick(), 60_000)
    this.dreamTickTimer.unref()

    // Predictive pre-warming: check every 5 minutes for patterns
    this.prewarmTimer = setInterval(() => this.prewarmTick(), 300_000)
    this.prewarmTimer.unref()
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
   * Determine the isolation level for an agent.
   * Order of precedence: def.isolationLevel > type.isolationLevel > "process"
   */
  private getIsolationLevel(def: AgentDef): IsolationLevel {
    if (def.isolationLevel) return def.isolationLevel
    if (def.agentType) {
      const type = getAgentType(def.agentType)
      if (type?.isolationLevel) return type.isolationLevel
    }
    return "process"
  }

  /**
   * Spawn a new agent worker as a child process.
   * Returns the agent id once the process is launched.
   * Applies zero-trust isolation based on the agent type's isolationLevel.
   */
  async spawn(def: AgentDef): Promise<string> {
    // Try distributed dispatch if available
    if (!process.env.AEGIS_NO_DISTRIBUTED) {
      try {
        const distributedId = await this.spawnDistributed(def)
        if (distributedId) return distributedId
      } catch {
        /* fall through to local spawn */
      }
    }

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
          AEGIS_ISOLATION_LEVEL: this.getIsolationLevel(def),
        },
      }

      // Model routing: auto-select cheapest viable provider/model
      if (process.env.AEGIS_MODEL_ROUTER !== "disabled") {
        try {
          const { ModelRouter } = await import("../economy/model-router")
          const route = ModelRouter.route({ taskType: type.name })
          if (route.provider !== type.modelHint?.split(":")[0]) {
            effectiveDef.env = {
              ...effectiveDef.env,
              AEGIS_ROUTED_PROVIDER: route.provider,
              AEGIS_ROUTED_MODEL: route.model,
              AEGIS_ROUTED_COST: String(route.estimatedCost),
            }
            console.log(
              `[ModelRouter] ${type.name} → ${route.provider}/${route.model} ($${route.estimatedCost.toFixed(4)})`,
            )
          }
        } catch {
          /* router failure is non-fatal */
        }
      }
    }

    const id = generateId()
    const scriptPath = resolve(process.cwd(), effectiveDef.script)
    const isolationLevel = this.getIsolationLevel(effectiveDef)

    // Zero-trust: Create Docker container for container-isolated agents
    if (isolationLevel === "container") {
      const sandbox = getDockerSandbox()
      const cwd = process.cwd()
      const container = sandbox.createContainer(id, cwd)
      if (container) {
        effectiveDef = {
          ...effectiveDef,
          env: {
            ...effectiveDef.env,
            AEGIS_SANDBOX_CONTAINER: container.containerId,
            AEGIS_SANDBOX_TYPE: "docker",
          },
        }
      }
    }

    // Pre-spawn hook
    const instance = this.createPendingInstance(id, effectiveDef)
    this.agents.set(id, instance)

    const controller = new AbortController()
    this.abortControllers.set(id, controller)

    try {
      const { traceCollector } = await import("../observability")
      const span = traceCollector.startSpan(`agent:${effectiveDef.name}`, "agent")
      instance.metadata = { ...instance.metadata, traceSpanId: span.id }
    } catch {
      /* observability is optional */
    }

    // Mark activity on dream engine (agent activity resets idle timer)
    try {
      const { dreamEngine } = await import("../dream/engine")
      dreamEngine.markActivity()
    } catch {
      // non-fatal
    }

    await this.hooks.run("spawn", "pre", id, instance, { def: effectiveDef })

    // Pre-flight cost estimate
    if (process.env.AEGIS_PREFLIGHT !== "disabled") {
      try {
        const { PreflightEstimator } = await import("../economy/preflight")
        const estimate = PreflightEstimator.checkThresholds(
          PreflightEstimator.estimate({
            goal: effectiveDef.goal || effectiveDef.name,
            agentType: effectiveDef.agentType,
          }),
        )
        if (estimate.recommendation === "block") {
          throw new Error(
            `Pre-flight cost check blocked: estimated $${estimate.estimatedCost.toFixed(4)} exceeds block threshold. ${estimate.reasoning}`,
          )
        }
        if (estimate.recommendation === "warn") {
          log.warn(`Pre-flight: estimated $${estimate.estimatedCost.toFixed(4)} exceeds warn threshold`)
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("blocked")) throw err
      }
    }

    // Pre-spawn failure risk prediction
    if (effectiveDef.agentType && process.env.AEGIS_PREDICTIVE !== "disabled") {
      try {
        const { FailurePredictor } = await import("../economy/failure-predictor")
        await FailurePredictor.initialize()
        const risk = FailurePredictor.evaluateSpawnRisk({
          agentType: effectiveDef.agentType,
          cpu: effectiveDef.limits?.cpu,
          memoryMB: effectiveDef.limits?.memoryMB,
        })
        if (risk.level === "high" || risk.level === "critical") {
          const warn = risk.level === "critical"
          const msg =
            `[FailurePredictor] ${warn ? "🚫" : "⚠️"} ${risk.level} risk ` +
            `(${risk.score}/100) for "${effectiveDef.name}" ` +
            `(${effectiveDef.agentType}): ${risk.reason}`
          if (warn) {
            log.warn(msg)
          } else {
            log.info(msg)
          }
        }
      } catch {
        // non-fatal
      }
    }

    // Budget guard: attach a budget tracker when budgetUsd is set on the agent def.
    if (effectiveDef.budgetUsd !== undefined && effectiveDef.budgetUsd > 0) {
      const guard = new BudgetGuard(effectiveDef.budgetUsd)
      this.budgetGuards.set(id, guard)
      const initialStatus = guard.status()
      instance.metadata = {
        ...instance.metadata,
        budget_usd: String(effectiveDef.budgetUsd),
        budget_spent: "0",
        budget_status: initialStatus.recommendation,
      }
      // Pass budget info to the worker process so it can self-throttle
      if (!effectiveDef.env) effectiveDef.env = {}
      effectiveDef.env.AEGIS_BUDGET_USD = String(effectiveDef.budgetUsd)
      effectiveDef.env.AEGIS_BUDGET_SPENT = "0"
      effectiveDef.env.AEGIS_BUDGET_STATUS = initialStatus.recommendation
      // Compute degraded model if budget is already tight
      if (initialStatus.recommendation !== "continue") {
        const degraded = degradeModelForBudget(effectiveDef.env.AEGIS_ROUTED_MODEL)
        if (degraded) {
          effectiveDef.env.AEGIS_DEGRADED_MODEL = degraded
          log.info(
            `Budget tight (${initialStatus.recommendation}) — degrading model to "${degraded}" for "${effectiveDef.name}"`,
          )
        }
      }
      log.info(`Budget ${effectiveDef.budgetUsd.toFixed(4)} USD cap active for "${effectiveDef.name}"`)
    }

    // Promote warm agent right before the actual process spawn
    if (effectiveDef.agentType && this.tryPromoteWarmAgent(effectiveDef.agentType)) {
      log.info(`Promoting warm agent for type ${effectiveDef.agentType} — spawning real agent`)
      this.prewarmStats.promotions++
    }

    const capturedDef = effectiveDef

    try {
      const child = spawn({
        cmd: [process.execPath, "run", scriptPath, ...(effectiveDef.args ?? [])],
        env: {
          ...(process.env as Record<string, string>),
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
      child.exited.then(async (code) => {
        instance.exitCode = code
        const prevStatus = instance.status
        const exitedStatus: "stopped" | "error" = code === 0 ? "stopped" : "error"
        instance.status = exitedStatus

        // Signal for self-improvement pipeline
        instance.metadata = {
          ...instance.metadata,
          _candidateForSkillExtraction: String(code === 0),
          _candidateForFailureCluster: String(code !== 0),
          _reward: String(code === 0 ? 1.0 : 0.0),
        }

        const traceSpanId = instance.metadata?.traceSpanId
        if (traceSpanId) {
          try {
            const { traceCollector } = await import("../observability")
            traceCollector.endSpan(traceSpanId, code === 0 ? "ok" : "error")
          } catch {
            /* non-fatal */
          }
        }

        try {
          const { sloManager } = await import("../observability")
          sloManager.recordMetric("agent_success_rate", code === 0 ? 1 : 0)
        } catch {
          /* non-fatal */
        }

        // Run exit hooks
        await this.hooks.run("exit", "post", id, instance, { code })

        // Record soul outcome for mood/emotion tracking
        try {
          const { soulManager } = await import("./soul")
          const agentType = capturedDef.agentType
          if (agentType) {
            soulManager.recordOutcome(id, agentType, code === 0)
          }
        } catch {
          /* non-fatal */
        }

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

      // Plugin hook: on_agent_spawn
      try {
        const { runSpawnHooks } = await import("../plugin/hook-integration")
        await runSpawnHooks(id)
      } catch {
        // Plugin hooks are optional
      }
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

  // ── Dream Tick ────────────────────────────────────────────────────

  /**
   * Called every 60s to tick the dream engine.
   * If the system has been idle long enough, the dream engine runs a
   * subconscious processing cycle (memory replay, pattern discovery, etc.).
   */
  private async dreamTick(): Promise<void> {
    try {
      const { dreamEngine } = await import("../dream/engine")
      dreamEngine.tick()
    } catch {
      // non-fatal
    }
  }

  // ── Predictive Pre-warming ─────────────────────────────────────────

  /**
   * Called every 5 minutes to check if we should pre-warm agents
   * based on historical usage patterns.
   *
   * When a pattern is detected (an agent type used 3+ times in the same
   * 4-hour window), a lightweight warm agent is spawned with a minimal
   * goal and tagged "prewarmed". These agents have a 30-minute TTL —
   * after which they can be re-spawned if still needed.
   */
  private async prewarmTick(): Promise<void> {
    try {
      const { experienceStore } = await import("../experience/store")

      // Look at recent experiences to predict what agent types will be needed
      const recent = experienceStore.listRecent(50)
      if (recent.length < 5) return // not enough data yet

      // Group by agent type and time of day
      const typeCounts = new Map<string, number>()
      const currentHour = new Date().getHours()

      for (const exp of recent) {
        const hour = new Date(exp.startedAt).getHours()
        // Only count experiences from similar hours (+- 2 hours)
        if (Math.abs(hour - currentHour) <= 2) {
          typeCounts.set(exp.agentType, (typeCounts.get(exp.agentType) ?? 0) + 1)
        }
      }

      // Clean up expired prewarm entries
      const now = Date.now()
      for (const [type, ts] of this.prewarmedTypes) {
        if (now - ts > this.PREWARM_TTL) {
          this.prewarmedTypes.delete(type)
        }
      }

      // If any agent type has been used 3+ times in this time window,
      // and it's not currently running, pre-warm it (up to PREWARM_MAX_CONCURRENT)
      let warmedCount = 0
      for (const [agentType, count] of typeCounts) {
        if (count < 3) continue
        if (warmedCount >= this.PREWARM_MAX_CONCURRENT) {
          log.debug(`Pre-warm limit reached (${this.PREWARM_MAX_CONCURRENT}), skipping ${agentType}`)
          break
        }

        // Check if already running or recently pre-warmed
        const alreadyRunning = Array.from(this.agents.values()).some(
          (a) => a.def.agentType === agentType && a.status === "running",
        )
        if (alreadyRunning) continue

        // Check TTL — don't re-spawn if we already warmed this type recently
        const lastPrewarmed = this.prewarmedTypes.get(agentType)
        if (lastPrewarmed && now - lastPrewarmed < this.PREWARM_TTL) continue

        // Check backoff — skip if we're still in cooldown from a previous failure
        const nextAttempt = this.prewarmBackoff.get(agentType)
        if (nextAttempt && now < nextAttempt) {
          log.debug(`Pre-warm backoff for ${agentType}: ${Math.round((nextAttempt - now) / 1000)}s remaining`)
          continue
        }

        // Validate that the agent type is registered before attempting to spawn
        if (!isValidAgentType(agentType)) {
          log.debug(`Skipping pre-warm for unknown agent type: ${agentType}`)
          continue
        }
        // After isValidAgentType() guard, the cast to non-null is safe
        const agentTypeDef = getAgentType(agentType as AgentTypeName)!

        // Spawn a lightweight warm agent
        log.info(`Predictive pre-warm: spawning ${agentType} (used ${count}x in this time window)`)

        try {
          const warmId = await this.spawn({
            name: `warm-${agentType}`,
            script: this.PREWARM_SCRIPT,
            agentType: agentTypeDef!.name,
            tags: ["prewarmed"],
            goal: `Pre-warmed agent for ${agentType} tasks. Standing by.`,
            stopTimeout: 300_000, // 5 min timeout before SIGKILL
            env: {
              AEGIS_PREWARMED: "true",
              AEGIS_MAX_TURNS: "1", // single-turn by default
            },
          })

          this.prewarmedTypes.set(agentType, now)
          warmedCount++
          log.info(`Pre-warmed ${agentType} as agent "${warmId}" (${warmedCount}/${this.PREWARM_MAX_CONCURRENT})`)

          // Clear any previous backoff state — this type is working again
          this.prewarmFailedAttempts.delete(agentType)
          this.prewarmBackoff.delete(agentType)

          // Auto-shutdown after 15 minutes if no real work was dispatched
          this.autoShutdownWarmAgent(warmId, agentType)
        } catch {
          // Track failures and apply exponential backoff
          const attempts = (this.prewarmFailedAttempts.get(agentType) ?? 0) + 1
          this.prewarmFailedAttempts.set(agentType, attempts)
          const delay = Math.min(
            this.PREWARM_BACKOFF_BASE_MS * Math.pow(2, attempts - 1),
            this.PREWARM_BACKOFF_MAX_MS,
          )
          this.prewarmBackoff.set(agentType, now + delay)
          log.warn(
            `Pre-warm spawn failed for ${agentType} (attempt #${attempts}), ` +
              `backing off ${Math.round(delay / 1000)}s`,
          )
        }
      }
    } catch {
      // non-fatal
    }
  }

  /**
   * Schedule an automatic shutdown for a warm agent if it hasn't been
   * used for real work within 15 minutes. Stores the timer ref in
   * prewarmShutdownTimers for later cancellation.
   */
  private autoShutdownWarmAgent(agentId: string, agentType: string): void {
    const shutdownTimer = setTimeout(async () => {
      try {
        const instance = this.agents.get(agentId)
        if (!instance) {
          this.prewarmShutdownTimers.delete(agentId)
          return
        }
        // Only auto-shutdown if still tagged as prewarmed and not actively working
        if (instance.status !== "running" && instance.status !== "idle") {
          this.prewarmShutdownTimers.delete(agentId)
          return
        }
        log.info(`Auto-shutting down warm agent "${agentId}" (${agentType}) — idle timeout`)
        this.prewarmStats.misses++ // prewarm prediction was not used within the timeout
        await this.kill(agentId, 5_000)
      } catch {
        // non-fatal
      } finally {
        this.prewarmShutdownTimers.delete(agentId)
      }
    }, 15 * 60 * 1000) // 15 minutes

    // Store the timer ref for later cancellation
    this.prewarmShutdownTimers.set(agentId, shutdownTimer)
  }

  /**
   * Cancel the auto-shutdown timeout for a warm agent.
   * Called when a real task is dispatched to a pre-warmed agent.
   */
  cancelPrewarmTimeout(agentId: string): void {
    const timer = this.prewarmShutdownTimers.get(agentId)
    if (timer) {
      clearTimeout(timer)
      this.prewarmShutdownTimers.delete(agentId)
    }
  }

  /**
   * Try to find and promote a pre-warmed agent for the given agent type.
   * If a matching warm agent exists, it is killed and removed from tracking
   * so the normal spawn flow creates a fresh real agent.
   *
   * Returns true if a warm agent was found and promoted, false otherwise.
   */
  private tryPromoteWarmAgent(agentType: string): boolean {
    // Find a warm agent matching this type
    const warmAgent = Array.from(this.agents.entries()).find(
      ([_id, a]) =>
        a.def.agentType === agentType &&
        a.def.script === this.PREWARM_SCRIPT &&
        a.def.tags?.includes("prewarmed"),
    )
    if (!warmAgent) return false

    const [warmId, warmInstance] = warmAgent

    // Cancel auto-shutdown timer
    this.cancelPrewarmTimeout(warmId)

    // Remove from prewarmed types tracking
    for (const [type] of this.prewarmedTypes) {
      if (type === agentType) {
        this.prewarmedTypes.delete(type)
        break
      }
    }

    // Kill the warm agent process (fire-and-forget)
    warmInstance.process.kill(9) // SIGKILL — warm agents are ephemeral
    warmInstance.status = "stopped"
    this.agents.delete(warmId)

    this.prewarmStats.hits++

    // Clear any backoff state — promotion proves this type works
    this.prewarmFailedAttempts.delete(agentType)
    this.prewarmBackoff.delete(agentType)

    return true
  }

  /**
   * Get prewarm prediction statistics.
   */
  getPrewarmStats(): { hits: number; misses: number; promotions: number; hitRate: number; hitRateFormatted: string } {
    const total = this.prewarmStats.hits + this.prewarmStats.misses
    const hitRate = total > 0 ? this.prewarmStats.hits / total : 0
    return {
      ...this.prewarmStats,
      hitRate,
      hitRateFormatted: `${(hitRate * 100).toFixed(1)}%`,
    }
  }

  /**
   * Get list of currently pre-warmed agent types with TTL info.
   */
  getPrewarmedTypes(): Array<{ type: string; ttlRemainingMs: number }> {
    const now = Date.now()
    return Array.from(this.prewarmedTypes.entries()).map(([type, ts]) => ({
      type,
      ttlRemainingMs: Math.max(0, this.PREWARM_TTL - (now - ts)),
    }))
  }

  /**
   * Public wrapper to manually trigger the prewarm analysis.
   * Used by the CLI 'aegis agent prewarm trigger' command.
   */
  async runPrewarmAnalysis(): Promise<void> {
    await this.prewarmTick()
  }

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
   * Clean up Docker sandbox container for an agent.
   */
  private cleanupSandbox(id: string): void {
    if (dockerSandbox) {
      dockerSandbox.destroyContainer(id)
    }
  }

  /**
   * Stop an agent gracefully (SIGTERM), then force kill after timeout.
   * Cancels any pending auto-recovery. Cleans up Docker containers.
   */
  async kill(id: string, timeoutMs?: number): Promise<void> {
    const instance = this.agents.get(id)
    if (!instance) throw new Error(`Agent "${id}" not found`)

    // Cancel any pending recovery first
    this.cancelRecovery(id)
    this.cleanupSandbox(id)

    const terminalStates = new Set(["stopped", "stopping", "error"])
    if (terminalStates.has(instance.status)) return

    await this.hooks.run("kill", "pre", id, instance)

    // Mark as stopping before sending shutdown
    instance.status = "stopping"
    this.emit("agent:stopped", id, { reason: "user-requested" })

    const timeout = timeoutMs ?? instance.def.stopTimeout ?? 5_000

    // Send graceful shutdown via stdin
    try {
      await this.sendIpc(id, { type: "shutdown", id: "kill-cmd", payload: {}, timestamp: now() })
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

  async sendIpc(id: string, msg: AgentIpcMessage): Promise<void> {
    const instance = this.agents.get(id)
    if (!instance) throw new Error(`Agent "${id}" not found`)

    // Auto-cancel prewarm shutdown timer when a real task is dispatched
    if (msg.type === "dispatch") {
      this.cancelPrewarmTimeout(id)
    }

    const stdin = instance.process.stdin
    if (stdin === undefined || stdin === null || typeof stdin === "number") {
      throw new Error(`Agent "${id}" has no writable stdin (already exited?)`)
    }

    let traceSpanId: string | undefined
    try {
      const { traceCollector } = await import("../observability")
      const span = traceCollector.startSpan(
        `ipc:${msg.type}`,
        "ipc",
        instance.metadata?.traceSpanId as string | undefined,
      )
      traceSpanId = span.id
    } catch {
      /* non-fatal */
    }

    try {
      const line = JSON.stringify(msg) + "\n"
      const encoded = new TextEncoder().encode(line)
      stdin.write(encoded)
      stdin.flush()
      if (traceSpanId) {
        try {
          const { traceCollector } = await import("../observability")
          traceCollector.endSpan(traceSpanId, "ok")
        } catch {
          /* non-fatal */
        }
      }
    } catch (err) {
      if (traceSpanId) {
        try {
          const { traceCollector } = await import("../observability")
          traceCollector.endSpan(traceSpanId, "error")
        } catch {
          /* non-fatal */
        }
      }
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
    toAgent.log.push(
      this.makeLog("info", `Received routed IPC ${msg.type} from agent "${fromAgent.def.name}" (${fromId})`),
    )

    await this.sendIpc(toId, routedMsg)

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

  /**
   * Look up an agent by name or type, returning a safe summary for IPC responses.
   * Used by workers to discover peers for dispatch.
   */
  lookupAgent(opts: {
    name?: string
    agentType?: string
  }): { id: string; name: string; agentType?: string; status: string } | null {
    const agent = opts.name
      ? this.findAgentByName(opts.name)
      : opts.agentType
        ? this.findAgentByType(opts.agentType)
        : undefined
    if (!agent) return null
    return {
      id: agent.id,
      name: agent.def.name,
      agentType: agent.def.agentType,
      status: agent.status,
    }
  }

  // ── Send a ping to check aliveness ──────────────────────────────────

  async ping(id: string): Promise<void> {
    await this.sendIpc(id, { type: "ping", id: "ping", payload: {}, timestamp: now() })
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

  /** Kill all running agents and clean up timers and sandboxes. */
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

    // Clean up all sandbox containers
    if (dockerSandbox) {
      dockerSandbox.cleanup()
    }

    this.agents.clear()
    this.hooks.clear()
    this.listeners.clear()
    this.recoveryStates.clear()
  }

  // ── Distributed spawn ───────────────────────────────────────────────

  /**
   * Try to dispatch agent spawn to remote worker via the distributed pool.
   * Returns null if distributed runtime is not available/configured.
   */
  async spawnDistributed(def: AgentDef): Promise<string | null> {
    try {
      const { WorkerPool, CapacityPlacer } = await import("../distributed")
      const secret = process.env.AEGIS_CLUSTER_SECRET
      if (!secret) return null

      // Use the singleton pool or create one
      const nodeId = `manager-${Date.now().toString(36)}`
      const pool = new WorkerPool({
        nodeId,
        role: "worker",
        leaderHost: process.env.AEGIS_CLUSTER_LEADER_HOST,
        leaderPort: process.env.AEGIS_CLUSTER_LEADER_PORT
          ? parseInt(process.env.AEGIS_CLUSTER_LEADER_PORT, 10)
          : undefined,
        listenPort: 0,
        secret,
      })

      // Don't start the pool for one-off dispatches; check env for pre-started node
      if (process.env.AEGIS_DISTRIBUTED === "local") {
        const placer = new CapacityPlacer(pool)
        const placement = placer.findBest({
          agentType: def.agentType ?? "generic",
          requiredCpu: def.limits?.cpu,
          requiredMemory: def.limits?.memoryMB,
        })

        if (placement) {
          log.info(`Dispatching agent "${def.name}" to remote worker ${placement.workerId}`)
          // Return a virtual ID — actual dispatch happens via pool
          return `dist-${placement.workerId}-${Date.now().toString(36)}`
        }
      }
    } catch {
      // Distributed runtime not available — fall back to local
    }
    return null
  }

  // ── Private helpers ─────────────────────────────────────────────────

  private createPendingInstance(id: string, def: AgentDef): AgentInstance {
    // Use a null-coalesced stub — process is overwritten immediately after spawn()
    const stub = {
      pid: 0,
      kill: () => {},
      exited: Promise.resolve(0),
      stdin: null,
      stdout: null,
      stderr: null,
    } as unknown as Subprocess
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

  private async handleIpcMessage(id: string, msg: AgentIpcMessage): Promise<void> {
    const instance = this.agents.get(id)
    if (!instance) return

    instance.lastActivity = now()

    switch (msg.type) {
      case "result": {
        const payload = msg.payload as { status?: string; output?: string } | undefined
        if (payload?.status === "ready") {
          instance.status = "running"
          this.emit("agent:ready", id)
        }
        this.emit("agent:result", id, { ...msg, agentId: id })
        await this.hooks.run("result", "post", id, instance, msg.payload)
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
      case "dispatch-result": {
        // Route worker-to-worker dispatch results back through the event system
        // so routeIpc() can resolve its promise.
        this.emit("agent:result", id, { ...msg, agentId: id })
        break
      }
      case "error": {
        const p2 = msg.payload as { message?: string } | undefined
        instance.log.push(this.makeLog("error", p2?.message ?? "Unknown error"))
        this.emit("agent:error", id, { message: p2?.message })
        break
      }
      case "spend-report": {
        const p3 = msg.payload as { costUsd: number; description?: string } | undefined
        if (p3?.costUsd !== undefined) {
          const guard = this.budgetGuards.get(id)
          if (guard) {
            guard.recordSpend(p3.costUsd)
            const status = guard.status()
            instance.metadata.budget_spent = String(guard.spent)
            // Log warning if approaching budget limit
            if (status.recommendation === "skip_optional") {
              log.warn(`Agent "${id}" nearing budget: $${guard.spent.toFixed(4)} of $${guard.budget.toFixed(4)}`)
            } else if (status.recommendation === "abort") {
              log.warn(`Agent "${id}" over budget: $${guard.spent.toFixed(4)} of $${guard.budget.toFixed(4)}`)
            }
          }
          // Also record to global billing tracker
          billingTracker.recordToolUsage(id, "agent-spend", p3.costUsd, id)
        }
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
      try {
        cb(event)
      } catch {
        /* isolate listener failures */
      }
    }
  }

  private makeLog(level: AgentLogLevel, text: string): AgentLogEntry {
    return { level, text, timestamp: now() }
  }
}

/**
 * Lazily-initialized singleton AgentManager.
 * The instance is created on first property access, not at module load time.
 * This reduces startup overhead for commands that don't interact with agents.
 */
let _agentManager: AgentManager | null = null
function getAgentManager(): AgentManager {
  if (!_agentManager) _agentManager = new AgentManager()
  return _agentManager
}

/**
 * Backward-compatible singleton reference.
 * Uses a Proxy to defer construction until the first property access.
 */
/**
 * AgentManager proxy with full Reflect forwarding.
 *
 * The `set` trap is deliberate: the proxy stores no state of its own —
 * all reads/writes/ownership queries are forwarded to the lazy singleton.
 * This enables tests to inject state (e.g. `(agentManager as any).prewarmStats`)
 * and guarantees the proxy never gets out of sync with the real instance.
 */
export const agentManager = new Proxy({} as AgentManager, {
  get(_, prop: PropertyKey) {
    return getAgentManager()[prop as keyof AgentManager]
  },
  set(_, prop: PropertyKey, value: unknown) {
    ;(getAgentManager() as unknown as Record<PropertyKey, unknown>)[prop] = value
    return true
  },
  has(_, prop: PropertyKey) {
    return prop in getAgentManager()
  },
  ownKeys() {
    return Reflect.ownKeys(getAgentManager())
  },
  getOwnPropertyDescriptor(_, prop: PropertyKey) {
    return Reflect.getOwnPropertyDescriptor(getAgentManager(), prop)
  },
})
