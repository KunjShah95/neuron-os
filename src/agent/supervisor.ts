import { agentManager } from "./manager"
import { tracingStore } from "../telemetry/tracing"
import { createLogger } from "../cli/logger"
import type { AgentDef } from "./types"

const log = createLogger("supervisor")

export interface SupervisorConfig {
  goal: string
  agentType?: string
  maxRestarts?: number
}

export class Supervisor {
  private config: Required<SupervisorConfig>
  private restartCount = 0

  constructor(config: SupervisorConfig) {
    this.config = {
      goal: config.goal,
      agentType: config.agentType || "default",
      maxRestarts: config.maxRestarts ?? 3,
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
      script: "src/agent/agent-worker.ts", // or whichever script is the main worker wrapper
      args: [this.config.goal],
      env: {
        AEGIS_SUPERVISOR_MODE: "true",
      },
    }

    try {
      const agentId = await agentManager.spawn(def)
      log.info(`Spawned agent ${agentId}. Monitoring...`)

      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(async () => {
          const agent = agentManager.get(agentId)
          if (!agent) {
            clearInterval(checkInterval)
            reject(new Error(`Agent ${agentId} vanished from manager`))
            return
          }

          if (agent.status === "stopped") {
            clearInterval(checkInterval)
            log.info(`Agent ${agentId} finished successfully.`)
            resolve()
          } else if (agent.status === "error") {
            clearInterval(checkInterval)
            log.error(`Agent ${agentId} failed with error. Investigating traces...`)
            await this.handleFailure(agentId)
            resolve() // after handling failure (which may restart)
          }
        }, 2000)
      })
    } catch (err) {
      log.error(`Failed to spawn agent: ${err}`)
      await this.handleFailure("unknown")
    }
  }

  private async handleFailure(agentId: string): Promise<void> {
    this.restartCount++
    if (this.restartCount > this.config.maxRestarts) {
      log.error(`Supervisor gave up after ${this.config.maxRestarts} restarts.`)
      return
    }

    // Attempt to read traces for this agent to understand what happened
    // The session ID might match the agent ID depending on how the worker was initialized
    const traces = tracingStore.getSessionTraces(agentId)
    const lastSpan = traces[traces.length - 1]

    log.warn(`Agent failure detected. Last action: ${lastSpan?.name || "Unknown"}`)
    log.info(`Restarting agent... (Attempt ${this.restartCount} of ${this.config.maxRestarts})`)

    // In a Software 3.0 world, the supervisor might prompt a 'fixer' agent to fix the code,
    // but for now we'll just try to respawn with the same goal.
    await this.spawnAndMonitor()
  }
}
