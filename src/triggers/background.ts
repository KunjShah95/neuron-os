import { TriggerEngine, type TriggerDef } from "./registry"

export class BackgroundAgentManager {
  constructor(private triggerEngine: TriggerEngine) {}

  registerBackgroundAgent(config: {
    name: string
    schedule: string
    goal: string
    agentType?: string
    enabled?: boolean
  }): TriggerDef {
    return this.triggerEngine.register({
      name: config.name,
      type: "cron",
      config: { schedule: config.schedule },
      action: {
        mode: "spawn-agent",
        goal: config.goal,
        agentType: config.agentType,
        priority: "low",
      },
      tags: ["background-agent", config.name],
      enabled: config.enabled ?? true,
    })
  }

  registerFileWatcher(config: {
    name: string
    dir: string
    pattern?: string
    goal: string
    agentType?: string
  }): TriggerDef {
    return this.triggerEngine.register({
      name: config.name,
      type: "file_watch",
      config: { dir: config.dir, pattern: config.pattern },
      action: {
        mode: "spawn-agent",
        goal: config.goal,
        agentType: config.agentType,
        priority: "normal",
      },
      tags: ["file-watcher", config.name],
      enabled: true,
    })
  }

  listBackgroundAgents(): TriggerDef[] {
    return this.triggerEngine.list({ tag: "background-agent" })
  }

  getStatus(): Array<{ name: string; type: string; enabled: boolean; lastFired?: string; fireCount: number }> {
    const agents = this.triggerEngine.list({ tag: "background-agent" })
    const watchers = this.triggerEngine.list({ tag: "file-watcher" })
    const all = [...agents, ...watchers]
    return all.map((t) => ({
      name: t.name,
      type: t.type,
      enabled: t.enabled,
      lastFired: t.lastFiredAt,
      fireCount: t.fireCount,
    }))
  }
}
