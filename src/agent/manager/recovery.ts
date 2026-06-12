import type { RecoveryConfig } from "../types"
import { DEFAULT_RECOVERY, now, type ManagerContext } from "./state"

export function calculateBackoffDelay(cfg: Required<RecoveryConfig>, attempt: number): number {
  const delay = cfg.backoffMs * Math.pow(cfg.backoffMultiplier, attempt)
  return Math.min(delay, cfg.backoffMax)
}

export function triggerAgentRecovery(ctx: ManagerContext, id: string, exitCode: number): boolean {
  const instance = ctx.agents.get(id)
  if (!instance) return false

  const cfg = instance.def.recovery
  if (!cfg) return false

  const resolved: Required<RecoveryConfig> = {
    maxRetries: cfg.maxRetries ?? DEFAULT_RECOVERY.maxRetries,
    backoffMs: cfg.backoffMs ?? DEFAULT_RECOVERY.backoffMs,
    backoffMultiplier: cfg.backoffMultiplier ?? DEFAULT_RECOVERY.backoffMultiplier,
    backoffMax: cfg.backoffMax ?? DEFAULT_RECOVERY.backoffMax,
  }

  let rs = ctx.recoveryStates.get(id)
  if (!rs) {
    rs = { attempt: 0, active: true, timerId: null, lastRecoveryAt: null }
    ctx.recoveryStates.set(id, rs)
  }

  if (rs.attempt >= resolved.maxRetries) {
    rs.active = false
    instance.log.push(ctx.makeLog("error", `Auto-recovery exhausted after ${rs.attempt} attempts, giving up`))
    ctx.emit("agent:maxRetries", id, { attempts: rs.attempt, exitCode })
    return false
  }

  const delay = calculateBackoffDelay(resolved, rs.attempt)
  rs.active = true
  rs.attempt++
  rs.lastRecoveryAt = now()

  instance.log.push(ctx.makeLog("warn", `Auto-recovery #${rs.attempt} in ${delay}ms (exit code ${exitCode})`))
  ctx.emit("agent:recovering", id, { attempt: rs.attempt, delay, exitCode })

  rs.timerId = setTimeout(() => {
    performAgentRecovery(ctx, id, resolved)
  }, delay)

  return true
}

export async function performAgentRecovery(
  ctx: ManagerContext,
  id: string,
  cfg: Required<RecoveryConfig>,
): Promise<void> {
  const instance = ctx.agents.get(id)
  if (!instance) return

  const rs = ctx.recoveryStates.get(id)
  if (!rs || !rs.active) return

  instance.log.push(ctx.makeLog("info", `Auto-recovery #${rs.attempt}: respawning…`))
  rs.timerId = null

  try {
    const newId = await ctx.spawn(instance.def)
    const newInstance = ctx.agents.get(newId)
    if (newInstance) {
      newInstance.metadata = instance.metadata
      newInstance.log.push(ctx.makeLog("success", `Recovered from crash #${rs.attempt - 1} (was agent "${id}")`))
    }
    ctx.recoveryStates.delete(id)
    ctx.emit("agent:recovered", id, { newId, attempts: rs.attempt })
    instance.log.push(ctx.makeLog("success", `Recovery #${rs.attempt} succeeded (new id: ${newId})`))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    instance.log.push(ctx.makeLog("error", `Recovery #${rs.attempt} failed: ${msg}`))
    ctx.emit("agent:error", id, { message: `Recovery #${rs.attempt} failed: ${msg}` })

    if (rs.attempt < cfg.maxRetries) {
      const delay = calculateBackoffDelay(cfg, rs.attempt)
      rs.attempt++
      rs.lastRecoveryAt = now()
      instance.log.push(ctx.makeLog("warn", `Retrying recovery #${rs.attempt} in ${delay}ms`))
      ctx.emit("agent:recovering", id, { attempt: rs.attempt, delay })
      rs.timerId = setTimeout(() => performAgentRecovery(ctx, id, cfg), delay)
    } else {
      rs.active = false
      instance.log.push(ctx.makeLog("error", `Auto-recovery exhausted after ${rs.attempt} attempts`))
      ctx.emit("agent:maxRetries", id, { attempts: rs.attempt })
    }
  }
}

export function cancelAgentRecovery(ctx: ManagerContext, id: string): void {
  const rs = ctx.recoveryStates.get(id)
  if (rs) {
    if (rs.timerId) clearTimeout(rs.timerId)
    rs.active = false
    rs.timerId = null
    ctx.recoveryStates.delete(id)
  }
}
