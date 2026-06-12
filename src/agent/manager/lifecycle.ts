import { spawn } from "bun"
import { resolve } from "node:path"
import type { AgentDef } from "../types"
import { getAgentType } from "../agent-types"
import type { IsolationLevel } from "../../sandbox/types"
import { BudgetGuard } from "../../economy/budget-guard"
import { cleanupSandbox, getDockerSandbox, log, now, type ManagerContext } from "./state"

let nextAgentId = 1

function generateId(): string {
  return `agent-${nextAgentId++}-${Date.now().toString(36)}`
}

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

export function getIsolationLevelFor(def: AgentDef): IsolationLevel {
  if (def.isolationLevel) return def.isolationLevel
  if (def.agentType) {
    const type = getAgentType(def.agentType)
    if (type?.isolationLevel) return type.isolationLevel
  }
  return "process"
}

export async function spawnAgent(ctx: ManagerContext, def: AgentDef): Promise<string> {
  if (!process.env.AEGIS_NO_DISTRIBUTED) {
    try {
      const distributedId = await ctx.spawnDistributed(def)
      if (distributedId) return distributedId
    } catch {
      /* fall through to local spawn */
    }
  }

  let effectiveDef = def
  if (def.agentType) {
    const type = getAgentType(def.agentType)
    if (!type) {
      throw new Error(`Unknown agent type: ${def.agentType}. Run 'aegis agent types' to see available types.`)
    }

    const tools = def.tools ?? type.tools

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
        AEGIS_ISOLATION_LEVEL: getIsolationLevelFor(def),
      },
    }

    if (process.env.AEGIS_MODEL_ROUTER !== "disabled") {
      try {
        const { ModelRouter } = await import("../../economy/model-router")
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
  const isolationLevel = getIsolationLevelFor(effectiveDef)

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

  const instance = ctx.createPendingInstance(id, effectiveDef)
  ctx.agents.set(id, instance)

  const controller = new AbortController()
  ctx.abortControllers.set(id, controller)

  try {
    const { traceCollector } = await import("../../observability")
    const span = traceCollector.startSpan(`agent:${effectiveDef.name}`, "agent")
    instance.metadata = { ...instance.metadata, traceSpanId: span.id }
  } catch {
    /* observability is optional */
  }

  try {
    const { dreamEngine } = await import("../../dream/engine")
    dreamEngine.markActivity()
  } catch {
    /* non-fatal */
  }

  await ctx.hooks.run("spawn", "pre", id, instance, { def: effectiveDef })

  if (process.env.AEGIS_PREFLIGHT !== "disabled") {
    try {
      const { PreflightEstimator } = await import("../../economy/preflight")
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

  if (effectiveDef.agentType && process.env.AEGIS_PREDICTIVE !== "disabled") {
    try {
      const { FailurePredictor } = await import("../../economy/failure-predictor")
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
      /* non-fatal */
    }
  }

  if (effectiveDef.budgetUsd !== undefined && effectiveDef.budgetUsd > 0) {
    const guard = new BudgetGuard(effectiveDef.budgetUsd)
    ctx.budgetGuards.set(id, guard)
    const initialStatus = guard.status()
    instance.metadata = {
      ...instance.metadata,
      budget_usd: String(effectiveDef.budgetUsd),
      budget_spent: "0",
      budget_status: initialStatus.recommendation,
    }
    if (!effectiveDef.env) effectiveDef.env = {}
    effectiveDef.env.AEGIS_BUDGET_USD = String(effectiveDef.budgetUsd)
    effectiveDef.env.AEGIS_BUDGET_SPENT = "0"
    effectiveDef.env.AEGIS_BUDGET_STATUS = initialStatus.recommendation
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

  if (effectiveDef.agentType && ctx.tryPromoteWarmAgent(effectiveDef.agentType)) {
    log.info(`Promoting warm agent for type ${effectiveDef.agentType} — spawning real agent`)
    ctx.prewarmStats.promotions++
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

    if (child.stdout) {
      ctx.readStream(id, child.stdout, "stdout")
    }

    if (child.stderr) {
      ctx.readStream(id, child.stderr, "stderr")
    }

    child.exited.then(async (code) => {
      instance.exitCode = code
      const prevStatus = instance.status
      const exitedStatus: "stopped" | "error" = code === 0 ? "stopped" : "error"
      instance.status = exitedStatus

      instance.metadata = {
        ...instance.metadata,
        _candidateForSkillExtraction: String(code === 0),
        _candidateForFailureCluster: String(code !== 0),
        _reward: String(code === 0 ? 1.0 : 0.0),
      }

      const traceSpanId = instance.metadata?.traceSpanId
      if (traceSpanId) {
        try {
          const { traceCollector } = await import("../../observability")
          traceCollector.endSpan(traceSpanId, code === 0 ? "ok" : "error")
        } catch {
          /* non-fatal */
        }
      }

      try {
        const { sloManager } = await import("../../observability")
        sloManager.recordMetric("agent_success_rate", code === 0 ? 1 : 0)
      } catch {
        /* non-fatal */
      }

      await ctx.hooks.run("exit", "post", id, instance, { code })

      try {
        const { soulManager } = await import("../soul")
        const agentType = capturedDef.agentType
        if (agentType) {
          soulManager.recordOutcome(id, agentType, code === 0)
        }
      } catch {
        /* non-fatal */
      }

      if (code !== 0 && prevStatus !== "stopping") {
        ctx.emit("agent:error", id, { code, message: `Process exited with code ${code}` })
        const didRecover = ctx.triggerRecovery(id, code)
        if (!didRecover) {
          ctx.emit("agent:exit", id, { code })
        }
      } else {
        ctx.emit("agent:exit", id, { code })
      }

      instance.log.push(ctx.makeLog("info", `Process exited with code ${code}`))
      ctx.abortControllers.delete(id)
    })

    ctx.emit("agent:spawned", id, { pid: child.pid })
    instance.log.push(ctx.makeLog("info", `Spawned (pid ${child.pid})`))

    if (effectiveDef.agentType) {
      instance.log.push(ctx.makeLog("info", `Agent type: ${effectiveDef.agentType}`))
    }

    await ctx.waitForReady(id, 10_000)

    await ctx.hooks.run("spawn", "post", id, instance, { def: effectiveDef })

    try {
      const { runSpawnHooks } = await import("../../plugin/hook-integration")
      await runSpawnHooks(id)
    } catch {
      /* Plugin hooks are optional */
    }
  } catch (err) {
    instance.status = "error"
    const msg = err instanceof Error ? err.message : String(err)
    instance.log.push(ctx.makeLog("error", `Spawn failed: ${msg}`))
    ctx.emit("agent:error", id, { message: msg })
    throw err
  }

  return id
}

export async function spawnDistributedAgent(def: AgentDef): Promise<string | null> {
  try {
    const { WorkerPool, CapacityPlacer } = await import("../../distributed")
    const secret = process.env.AEGIS_CLUSTER_SECRET
    if (!secret) return null

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

    if (process.env.AEGIS_DISTRIBUTED === "local") {
      const placer = new CapacityPlacer(pool)
      const placement = placer.findBest({
        agentType: def.agentType ?? "generic",
        requiredCpu: def.limits?.cpu,
        requiredMemory: def.limits?.memoryMB,
      })

      if (placement) {
        log.info(`Dispatching agent "${def.name}" to remote worker ${placement.workerId}`)
        return `dist-${placement.workerId}-${Date.now().toString(36)}`
      }
    }
  } catch {
    /* Distributed runtime not available — fall back to local */
  }
  return null
}

export async function killAgent(ctx: ManagerContext, id: string, timeoutMs?: number): Promise<void> {
  const instance = ctx.agents.get(id)
  if (!instance) throw new Error(`Agent "${id}" not found`)

  ctx.cancelRecovery(id)
  cleanupSandbox(id)

  const terminalStates = new Set(["stopped", "stopping", "error"])
  if (terminalStates.has(instance.status)) return

  await ctx.hooks.run("kill", "pre", id, instance)

  instance.status = "stopping"
  ctx.emit("agent:stopped", id, { reason: "user-requested" })

  const timeout = timeoutMs ?? instance.def.stopTimeout ?? 5_000

  try {
    await ctx.sendIpc(id, { type: "shutdown", id: "kill-cmd", payload: {}, timestamp: now() })
  } catch {
    /* Stdin might already be closed — fall through to SIGKILL path */
  }

  const exitPromise = instance.process.exited
  const timer = new Promise<number>((resolve) => setTimeout(() => resolve(-1), timeout))
  const code = await Promise.race([exitPromise, timer])

  if (code === -1) {
    instance.process.kill(9)
    instance.log.push(ctx.makeLog("warn", "Force killed (SIGKILL)"))
  }

  instance.exitCode = code as number | null
  instance.status = "stopped"

  await ctx.hooks.run("kill", "post", id, instance)
}
