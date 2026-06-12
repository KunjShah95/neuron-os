import { getAgentType, isValidAgentType, type AgentTypeName } from "../agent-types"
import { log, type ManagerContext } from "./state"

export async function runPrewarmTick(ctx: ManagerContext): Promise<void> {
  try {
    const { experienceStore } = await import("../../experience/store")

    const recent = experienceStore.listRecent(50)
    if (recent.length < 5) return

    const typeCounts = new Map<string, number>()
    const currentHour = new Date().getHours()

    for (const exp of recent) {
      const hour = new Date(exp.startedAt).getHours()
      if (Math.abs(hour - currentHour) <= 2) {
        typeCounts.set(exp.agentType, (typeCounts.get(exp.agentType) ?? 0) + 1)
      }
    }

    const now = Date.now()
    for (const [type, ts] of ctx.prewarmedTypes) {
      if (now - ts > ctx.PREWARM_TTL) {
        ctx.prewarmedTypes.delete(type)
      }
    }

    let warmedCount = 0
    for (const [agentType, count] of typeCounts) {
      if (count < 3) continue
      if (warmedCount >= ctx.PREWARM_MAX_CONCURRENT) {
        log.debug(`Pre-warm limit reached (${ctx.PREWARM_MAX_CONCURRENT}), skipping ${agentType}`)
        break
      }

      const alreadyRunning = Array.from(ctx.agents.values()).some(
        (a) => a.def.agentType === agentType && a.status === "running",
      )
      if (alreadyRunning) continue

      const lastPrewarmed = ctx.prewarmedTypes.get(agentType)
      if (lastPrewarmed && now - lastPrewarmed < ctx.PREWARM_TTL) continue

      const nextAttempt = ctx.prewarmBackoff.get(agentType)
      if (nextAttempt && now < nextAttempt) {
        log.debug(`Pre-warm backoff for ${agentType}: ${Math.round((nextAttempt - now) / 1000)}s remaining`)
        continue
      }

      if (!isValidAgentType(agentType)) {
        log.debug(`Skipping pre-warm for unknown agent type: ${agentType}`)
        continue
      }
      const agentTypeDef = getAgentType(agentType as AgentTypeName)!

      log.info(`Predictive pre-warm: spawning ${agentType} (used ${count}x in this time window)`)

      try {
        const warmId = await ctx.spawn({
          name: `warm-${agentType}`,
          script: ctx.PREWARM_SCRIPT,
          agentType: agentTypeDef!.name,
          tags: ["prewarmed"],
          goal: `Pre-warmed agent for ${agentType} tasks. Standing by.`,
          stopTimeout: 300_000,
          env: {
            AEGIS_PREWARMED: "true",
            AEGIS_MAX_TURNS: "1",
          },
        })

        ctx.prewarmedTypes.set(agentType, now)
        warmedCount++
        log.info(`Pre-warmed ${agentType} as agent "${warmId}" (${warmedCount}/${ctx.PREWARM_MAX_CONCURRENT})`)

        ctx.prewarmFailedAttempts.delete(agentType)
        ctx.prewarmBackoff.delete(agentType)

        scheduleWarmAgentShutdown(ctx, warmId, agentType)
      } catch {
        const attempts = (ctx.prewarmFailedAttempts.get(agentType) ?? 0) + 1
        ctx.prewarmFailedAttempts.set(agentType, attempts)
        const delay = Math.min(ctx.PREWARM_BACKOFF_BASE_MS * Math.pow(2, attempts - 1), ctx.PREWARM_BACKOFF_MAX_MS)
        ctx.prewarmBackoff.set(agentType, now + delay)
        log.warn(
          `Pre-warm spawn failed for ${agentType} (attempt #${attempts}), ` +
            `backing off ${Math.round(delay / 1000)}s`,
        )
      }
    }
  } catch {
    /* non-fatal */
  }
}

export function scheduleWarmAgentShutdown(ctx: ManagerContext, agentId: string, agentType: string): void {
  const shutdownTimer = setTimeout(
    async () => {
      try {
        const instance = ctx.agents.get(agentId)
        if (!instance) {
          ctx.prewarmShutdownTimers.delete(agentId)
          return
        }
        if (instance.status !== "running" && instance.status !== "idle") {
          ctx.prewarmShutdownTimers.delete(agentId)
          return
        }
        log.info(`Auto-shutting down warm agent "${agentId}" (${agentType}) — idle timeout`)
        ctx.prewarmStats.misses++
        await ctx.kill(agentId, 5_000)
      } catch {
        /* non-fatal */
      } finally {
        ctx.prewarmShutdownTimers.delete(agentId)
      }
    },
    15 * 60 * 1000,
  )

  ctx.prewarmShutdownTimers.set(agentId, shutdownTimer)
}

export function promoteWarmAgent(ctx: ManagerContext, agentType: string): boolean {
  const warmAgent = Array.from(ctx.agents.entries()).find(
    ([_id, a]) =>
      a.def.agentType === agentType && a.def.script === ctx.PREWARM_SCRIPT && a.def.tags?.includes("prewarmed"),
  )
  if (!warmAgent) return false

  const [warmId, warmInstance] = warmAgent

  ctx.cancelPrewarmTimeout(warmId)

  for (const [type] of ctx.prewarmedTypes) {
    if (type === agentType) {
      ctx.prewarmedTypes.delete(type)
      break
    }
  }

  warmInstance.process.kill(9)
  warmInstance.status = "stopped"
  ctx.agents.delete(warmId)

  ctx.prewarmStats.hits++

  ctx.prewarmFailedAttempts.delete(agentType)
  ctx.prewarmBackoff.delete(agentType)

  return true
}

export function computePrewarmStats(ctx: ManagerContext): {
  hits: number
  misses: number
  promotions: number
  hitRate: number
  hitRateFormatted: string
} {
  const total = ctx.prewarmStats.hits + ctx.prewarmStats.misses
  const hitRate = total > 0 ? ctx.prewarmStats.hits / total : 0
  return {
    ...ctx.prewarmStats,
    hitRate,
    hitRateFormatted: `${(hitRate * 100).toFixed(1)}%`,
  }
}

export function listPrewarmedTypes(ctx: ManagerContext): Array<{ type: string; ttlRemainingMs: number }> {
  const now = Date.now()
  return Array.from(ctx.prewarmedTypes.entries()).map(([type, ts]) => ({
    type,
    ttlRemainingMs: Math.max(0, ctx.PREWARM_TTL - (now - ts)),
  }))
}
