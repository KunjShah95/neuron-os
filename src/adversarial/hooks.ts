import { createLogger } from "../cli/logger"
import { HookRegistry } from "../agent/hooks"
import { runAdversarial, getDefaultAdversarialConfig } from "./orchestrator"
import { ratchetFindings } from "./ratchet"

const log = createLogger("adversarial-hook")

export function registerAdversarialHooks(hooks: HookRegistry): void {
  hooks.register("exit", "post", async (ctx) => {
    const data = ctx.data as { taskId?: string; sessionId?: string; result?: string; costUsd?: number } | undefined
    if (!data?.taskId || !data?.result) return

    const config = getDefaultAdversarialConfig()

    if (!config.enabled) return
    if (config.cost_budget_ratio && data.costUsd && data.costUsd * config.cost_budget_ratio < 0.001) {
      log.info("Cost too low for adversarial pass, skipping")
      return
    }

    const sessionId = data.sessionId ?? ctx.agentId

    log.info(`Auto-spawning adversarial for task ${data.taskId}`)
    const findings = await runAdversarial({
      taskId: data.taskId,
      sessionId,
      taskDescription: ctx.instance.def.name,
      result: data.result,
      config,
      mainCostUsd: data.costUsd,
    })

    if (config.ratchet && findings.length > 0) {
      const highSeverity = findings.filter(
        (f) => f.severity === "high" || f.severity === "critical",
      )
      if (highSeverity.length > 0) {
        const ratcheted = await ratchetFindings(highSeverity)
        log.info(`Ratcheted ${ratcheted.length} high-severity findings`)
      }
    }
  }, { priority: 10, label: "adversarial-auto-spawn" })
}
