import { agentManager } from "./manager"
import { tracingStore } from "../telemetry/tracing"
import { createLogger } from "../cli/logger"
import type { AgentDef, AgentInstance } from "./types"

const log = createLogger("supervisor")

export interface SupervisorConfig {
  goal: string
  agentType?: string
  maxRestarts?: number
  /** Overall deadline for a single monitored run (default: 15 minutes) */
  maxRunTimeMs?: number
  /** How often the agent status is polled (default: 2000ms) */
  pollIntervalMs?: number
}

export class SupervisorDeadlineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SupervisorDeadlineError"
  }
}

export class Supervisor {
  private config: Required<SupervisorConfig>
  private restartCount = 0

  constructor(config: SupervisorConfig) {
    this.config = {
      goal: config.goal,
      agentType: config.agentType || "default",
      maxRestarts: config.maxRestarts ?? 3,
      maxRunTimeMs: config.maxRunTimeMs ?? 15 * 60 * 1000,
      pollIntervalMs: config.pollIntervalMs ?? 2000,
    }
  }

  public async run(): Promise<void> {
    log.info(`Supervisor starting goal: ${this.config.goal}`)
    await this.spawnAndMonitor()
  }

  private async spawnAndMonitor(): Promise<void> {
    const def: AgentDef = {
      name: `worker-${this.restartCount}`,
      agentType: this.config.agentType as AgentDef["agentType"],
      script: "src/agent/agent-worker.ts",
      args: [this.config.goal],
      env: {
        AEGIS_SUPERVISOR_MODE: "true",
      },
    }

    try {
      const agentId = await agentManager.spawn(def)
      log.info(`Spawned agent ${agentId}. Monitoring...`)
      await this.monitor(agentId)
    } catch (err) {
      if (err instanceof SupervisorDeadlineError) throw err
      log.error(`Failed to spawn agent: ${err}`)
      await this.handleFailure("unknown")
    }
  }

  private monitor(agentId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false

      // `checkInterval` and `deadline` are declared below and only ever
      // cleared from `cleanup`, which runs after the timers exist.
      const cleanup = (): void => {
        clearInterval(checkInterval)
        clearTimeout(deadline)
      }

      const succeed = (): void => {
        if (settled) return
        settled = true
        cleanup()
        resolve()
      }

      const fail = (err: unknown): void => {
        if (settled) return
        settled = true
        cleanup()
        reject(err instanceof Error ? err : new Error(String(err)))
      }

      const tick = async (): Promise<void> => {
        let agent: AgentInstance | undefined
        try {
          agent = agentManager.get(agentId)
        } catch (err) {
          fail(err)
          return
        }

        if (!agent) {
          fail(new Error(`Agent ${agentId} vanished from manager`))
          return
        }

        if (agent.status === "stopped") {
          log.info(`Agent ${agentId} finished successfully.`)
          succeed()
          return
        }

        if (agent.status === "error") {
          log.error(`Agent ${agentId} failed with error. Investigating traces...`)
          settled = true
          cleanup()
          try {
            await this.handleFailure(agentId)
            resolve()
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)))
          }
        }
      }

      const checkInterval = setInterval(() => {
        void tick()
      }, this.config.pollIntervalMs)

      const deadline = setTimeout(() => {
        fail(
          new SupervisorDeadlineError(
            `Supervisor exceeded max run time of ${this.config.maxRunTimeMs}ms while monitoring agent ${agentId}`,
          ),
        )
      }, this.config.maxRunTimeMs)
    })
  }

  private async handleFailure(agentId: string): Promise<void> {
    this.restartCount++
    if (this.restartCount > this.config.maxRestarts) {
      log.error(`Supervisor gave up after ${this.config.maxRestarts} restarts.`)
      return
    }

    const traces = tracingStore.getSessionTraces(agentId)
    const lastSpan = traces[traces.length - 1]

    log.warn(`Agent failure detected. Last action: ${lastSpan?.name || "Unknown"}`)
    log.info(`Restarting agent... (Attempt ${this.restartCount} of ${this.config.maxRestarts})`)

    await this.spawnAndMonitor()
  }
}
