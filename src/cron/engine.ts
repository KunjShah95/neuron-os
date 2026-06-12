import { readFile, writeFile, mkdir } from "node:fs/promises"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { agentManager } from "../agent/manager"
import { createLogger } from "../cli/logger"
import type { AgentTypeName } from "../agent/agent-types"

const log = createLogger("cron")

export interface CronJob {
  name: string
  schedule: string
  goal: string
  agentType?: string
}

const DATA_DIR = resolve(process.cwd(), "data")
const HEARTBEAT_FILE = resolve(DATA_DIR, "HEARTBEAT.md")
const CRON_FILE = resolve(DATA_DIR, "cron-jobs.json")

// ── HEARTBEAT.md management ────────────────────────────────────────────

export async function ensureHeartbeatFile(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })
  if (!existsSync(HEARTBEAT_FILE)) {
    await writeFile(
      HEARTBEAT_FILE,
      [
        "# Heartbeat Checklist",
        "",
        "Tasks the agent should proactively check on each heartbeat cycle.",
        "",
        "## Daily Tasks",
        "",
        "- [ ] Check for pending file changes that need commit",
        "- [ ] Review any errors in recent logs",
        "- [ ] Check system health",
        "",
        "## Weekly Tasks",
        "",
        "- [ ] Prune old session logs (older than 30 days)",
        "- [ ] Review and consolidate memory facts",
        "",
      ].join("\n"),
      "utf-8",
    )
  }
}

export async function loadHeartbeatChecklist(): Promise<string> {
  try {
    if (existsSync(HEARTBEAT_FILE)) {
      return await readFile(HEARTBEAT_FILE, "utf-8")
    }
  } catch (err) {
    log.warn("Failed to load heartbeat checklist", { error: String(err) })
  }
  return ""
}

// ── Cron job persistence ───────────────────────────────────────────────

export async function loadCronJobs(): Promise<CronJob[]> {
  try {
    if (!existsSync(CRON_FILE)) return []
    const raw = await readFile(CRON_FILE, "utf-8")
    return JSON.parse(raw) as CronJob[]
  } catch {
    return []
  }
}

export async function saveCronJobs(jobs: CronJob[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(CRON_FILE, JSON.stringify(jobs, null, 2), "utf-8")
}

export async function addCronJob(job: CronJob): Promise<void> {
  const jobs = await loadCronJobs()
  jobs.push(job)
  await saveCronJobs(jobs)
}

export async function removeCronJob(name: string): Promise<boolean> {
  const jobs = await loadCronJobs()
  const filtered = jobs.filter((j) => j.name !== name)
  if (filtered.length === jobs.length) return false
  await saveCronJobs(filtered)
  return true
}

// ── Heartbeat execution ────────────────────────────────────────────────

export type HeartbeatResult = "HEARTBEAT_OK" | { action: string; detail: string }

export async function runHeartbeat(): Promise<HeartbeatResult> {
  try {
    const checklist = await loadHeartbeatChecklist()
    const incompleteItems: string[] = []

    for (const line of checklist.split("\n")) {
      const trimmed = line.trim()
      if (trimmed.startsWith("- [ ] ")) {
        incompleteItems.push(trimmed.replace("- [ ] ", ""))
      }
    }

    if (incompleteItems.length === 0) {
      return "HEARTBEAT_OK"
    }

    return {
      action: "checklist_items_pending",
      detail: incompleteItems.join("; "),
    }
  } catch {
    return "HEARTBEAT_OK"
  }
}

// ── Cron scheduler ─────────────────────────────────────────────────────

export function startCronEngine(): Array<{ name: string; stop: () => void }> {
  const timers: Array<{ name: string; stop: () => void }> = []

  const tick = async () => {
    const jobs = await loadCronJobs()
    for (const job of jobs) {
      try {
        const id = await agentManager.spawn({
          name: `cron-${job.name}`,
          agentType: (job.agentType ?? "build") as AgentTypeName,
          script: "src/agent/agent-worker.ts",
          tags: ["cron"],
          recovery: { maxRetries: 2, backoffMs: 5_000 },
        })

        agentManager.sendIpc(id, {
          type: "run-task",
          id: `cron-${job.name}`,
          payload: { goal: job.goal },
          timestamp: Date.now(),
        })
      } catch (err) {
        log.error(`Cron job "${job.name}" failed`, { error: String(err) })
      }
    }
  }

  const interval = setInterval(tick, 30 * 60 * 1000)
  timers.push({ name: "heartbeat-30min", stop: () => clearInterval(interval) })

  // Register Bun.cron for persistent cron jobs if Bun supports it
  for (const job of loadCronJobsSync()) {
    try {
      const schedule = parseCronSchedule(job.schedule)
      if (schedule) {
        const timer = setInterval(async () => {
          try {
            const id = await agentManager.spawn({
              name: `cron-${job.name}`,
              agentType: (job.agentType ?? "build") as AgentTypeName,
              script: "src/agent/agent-worker.ts",
              tags: ["cron"],
              recovery: { maxRetries: 2 },
            })
            agentManager.sendIpc(id, {
              type: "run-task",
              id: `cron-${job.name}`,
              payload: { goal: job.goal },
              timestamp: Date.now(),
            })
          } catch (err) {
            console.error(`Cron job "${job.name}" execution failed:`, err)
          }
        }, schedule)
        timers.push({ name: `cron-${job.name}`, stop: () => clearInterval(timer) })
      }
    } catch (err) {
      log.warn("Failed to schedule cron job", { job: job.name, error: String(err) })
    }
  }

  return timers
}

function loadCronJobsSync(): CronJob[] {
  try {
    if (!existsSync(CRON_FILE)) return []
    const raw = readFileSync(CRON_FILE, "utf-8")
    return JSON.parse(raw) as CronJob[]
  } catch {
    return []
  }
}

function parseCronSchedule(schedule: string): number | null {
  const units: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  }

  const match = schedule.match(/^(\d+)\s*(s|m|h|d)$/)
  if (match && match[1] && match[2]) {
    return parseInt(match[1] ?? "0") * (units[match[2] ?? ""] ?? 1000)
  }

  if (schedule === "30m") return 30 * 60 * 1000
  if (schedule === "1h") return 60 * 60 * 1000
  if (schedule === "6h") return 6 * 60 * 60 * 1000
  if (schedule === "12h") return 12 * 60 * 60 * 1000
  if (schedule === "1d") return 24 * 60 * 60 * 1000

  return null
}

export async function listActiveJobs(): Promise<CronJob[]> {
  return await loadCronJobs()
}
