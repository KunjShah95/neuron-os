import { TriggerEngine, triggerEngine } from "../triggers/registry"
import { SkillExtractor } from "./skill-extractor"
import { FailureClusterer } from "./failure-cluster"
import { experienceStore } from "../experience/store"
import { createLogger } from "../cli/logger"

const log = createLogger("improve:scheduler")

export class ImprovementScheduler {
  private triggerEngine: TriggerEngine

  constructor(engine?: TriggerEngine) {
    this.triggerEngine = engine ?? triggerEngine
  }

  registerDefaults(): string[] {
    const ids: string[] = []

    const skillTrigger = this.triggerEngine.register({
      name: "auto-skill-extraction",
      type: "cron",
      config: { schedule: "6h" },
      action: {
        mode: "run-command",
        goal: "aegis improve skill extract",
        priority: "low",
      },
      enabled: true,
      tags: ["builtin", "self-improve"],
    })
    ids.push(skillTrigger.id)

    const failureTrigger = this.triggerEngine.register({
      name: "auto-failure-clustering",
      type: "cron",
      config: { schedule: "12h" },
      action: {
        mode: "run-command",
        goal: "aegis improve failure cluster",
        priority: "low",
      },
      enabled: true,
      tags: ["builtin", "self-improve"],
    })
    ids.push(failureTrigger.id)

    log.info(`Registered ${ids.length} self-improvement scheduler jobs`)
    return ids
  }

  removeDefaults(): number {
    const triggers = this.triggerEngine.list({ tag: "self-improve" })
    let count = 0
    for (const t of triggers) {
      this.triggerEngine.unregister(t.id)
      count++
    }
    return count
  }

  hasDefaults(): boolean {
    return this.triggerEngine.list({ tag: "self-improve" }).length > 0
  }

  async runNow(job: "skill-extract" | "failure-cluster" | "all"): Promise<{ job: string; result: string }[]> {
    const results: { job: string; result: string }[] = []

    if (job === "skill-extract" || job === "all") {
      try {
        const extractor = new SkillExtractor(experienceStore)
        const candidates = extractor.extractCandidates()
        results.push({ job: "skill-extract", result: `Extracted ${candidates.length} skill candidates` })
      } catch (err) {
        results.push({ job: "skill-extract", result: `Failed: ${err}` })
      }
    }

    if (job === "failure-cluster" || job === "all") {
      try {
        const clusterer = new FailureClusterer(experienceStore)
        const clusters = clusterer.cluster()
        results.push({ job: "failure-cluster", result: `Found ${clusters.length} failure clusters` })
      } catch (err) {
        results.push({ job: "failure-cluster", result: `Failed: ${err}` })
      }
    }

    return results
  }
}
