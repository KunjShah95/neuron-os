import { billingTracker } from "../billing/tracker"
import { agentManager } from "../agent/manager"
import { SLOManager, type SLOResult, type SLOManagerOptions } from "./slo"
import { TraceCollector } from "./integrations"
import { SessionStore } from "../session/store"

export interface DashboardData {
  systemUptime: number
  totalAgents: number
  activeAgents: number
  totalSessions: number
  recentErrors: number
  avgLatency: number
  costToday: number
  costThisWeek: number
  budgetRemaining: number
  sloResults: SLOResult[]
  topFailures: Array<{ pattern: string; count: number }>
}

export interface DashboardProviderOptions {
  sessionStore?: SessionStore
  sloOptions?: SLOManagerOptions
}

export class DashboardProvider {
  private slo: SLOManager
  private sessionStore: SessionStore | null

  constructor(options: DashboardProviderOptions = {}) {
    this.slo = new SLOManager(options.sloOptions)
    this.sessionStore = options.sessionStore ?? null
  }

  async getDashboardData(): Promise<DashboardData> {
    const allAgents = agentManager.list()
    const activeAgents = allAgents.filter((a) => a.status === "running" || a.status === "busy" || a.status === "idle")

    const totalSpend = billingTracker.getTotalSpend()
    const budget = billingTracker.getBudgetLimit()

    const costHistory = billingTracker.getCostHistory(7)
    const costThisWeek = costHistory.reduce((s, d) => s + d.totalCost, 0)
    const todayStr = new Date().toISOString().slice(0, 10)
    const costTodayEntry = costHistory.find((d) => d.date === todayStr)

    const sloResults = this.slo.checkAll()

    const recentFailures = allAgents.filter((a) => a.status === "error" && a.spawnTime > Date.now() - 3600000)

    return {
      systemUptime: this.computeUptime(),
      totalAgents: allAgents.length,
      activeAgents: activeAgents.length,
      totalSessions: this.countSessions(),
      recentErrors: recentFailures.length,
      avgLatency: this.estimateAvgLatency(),
      costToday: costTodayEntry?.totalCost ?? 0,
      costThisWeek,
      budgetRemaining: Math.max(0, budget - totalSpend),
      sloResults,
      topFailures: this.computeTopFailures(),
    }
  }

  async getJsonReport(): Promise<string> {
    const data = await this.getDashboardData()
    return JSON.stringify(data, null, 2)
  }

  private computeUptime(): number {
    const finished = agentManager.list().filter((a) => a.exitCode !== null)
    if (finished.length === 0) return 1
    const failures = finished.filter((a) => a.exitCode !== 0).length
    return 1 - failures / finished.length
  }

  private countSessions(): number {
    let store: SessionStore | null = this.sessionStore
    let owned = false
    try {
      if (!store) {
        store = new SessionStore()
        owned = true
      }
      return store.list().length
    } catch {
      return 0
    } finally {
      if (owned) {
        try {
          store?.closeDb()
        } catch {
          // ignore close failures
        }
      }
    }
  }

  private estimateAvgLatency(): number {
    try {
      const trace = new TraceCollector()
      const recent = trace.query({ limit: 50 })
      const withDuration = recent.filter((t) => t.duration !== undefined)
      if (withDuration.length === 0) return 0
      return withDuration.reduce((s, t) => s + (t.duration ?? 0), 0) / withDuration.length
    } catch {
      return 0
    }
  }

  private computeTopFailures(): Array<{ pattern: string; count: number }> {
    const errors = agentManager.list().filter((a) => a.status === "error")
    const patternCounts = new Map<string, number>()

    for (const agent of errors) {
      const errorLogs = agent.log.filter((l) => l.level === "error")
      for (const log of errorLogs) {
        const key = log.text.slice(0, 80)
        patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1)
      }
    }

    return [...patternCounts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([pattern, count]) => ({ pattern, count }))
  }
}
