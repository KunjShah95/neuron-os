import { readFile, writeFile, mkdir } from "node:fs/promises"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { agentManager } from "../agent/manager"
import { createLogger } from "../cli/logger"
import type { AgentTypeName } from "../agent/agent-types"
import type { AgentIpcMessage } from "../agent/types"

const log = createLogger("cron")

export interface CronJob {
  name: string
  schedule: string
  goal: string
  agentType?: string
}

function getDataDir(): string {
  return process.env.AEGIS_DATA_DIR ?? resolve(process.cwd(), "data")
}

function getHeartbeatFile(): string {
  return resolve(getDataDir(), "HEARTBEAT.md")
}

function getCronFile(): string {
  return resolve(getDataDir(), "cron-jobs.json")
}

// ── HEARTBEAT.md management ────────────────────────────────────────────

export async function ensureHeartbeatFile(): Promise<void> {
  await mkdir(getDataDir(), { recursive: true })
  if (!existsSync(getHeartbeatFile())) {
    await writeFile(
      getHeartbeatFile(),
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
    const file = getHeartbeatFile()
    if (existsSync(file)) {
      return await readFile(file, "utf-8")
    }
  } catch (err) {
    log.warn("Failed to load heartbeat checklist", { error: String(err) })
  }
  return ""
}

// ── Cron job persistence ───────────────────────────────────────────────

export async function loadCronJobs(): Promise<CronJob[]> {
  try {
    const file = getCronFile()
    if (!existsSync(file)) return []
    const raw = await readFile(file, "utf-8")
    return JSON.parse(raw) as CronJob[]
  } catch {
    return []
  }
}

export async function saveCronJobs(jobs: CronJob[]): Promise<void> {
  await mkdir(getDataDir(), { recursive: true })
  await writeFile(getCronFile(), JSON.stringify(jobs, null, 2), "utf-8")
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

export interface CronEngineOptions {
  heartbeatMs?: number
  now?: () => number
  spawnAgent?: (job: CronJob) => Promise<string>
  sendIpc?: (agentId: string, message: AgentIpcMessage) => Promise<void>
}

export function parseCronSchedule(schedule: string): number | null {
  const units: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  }

  const match = schedule.trim().match(/^(\d+)\s*(s|m|h|d)$/)
  if (match && match[1] && match[2]) {
    const ms = parseInt(match[1] ?? "0", 10) * (units[match[2] ?? ""] ?? 1000)
    return ms > 0 ? ms : null
  }

  return null
}

export function isCronJobDue(job: CronJob, now: number, lastRunAt: number): boolean {
  const interval = parseCronSchedule(job.schedule)
  if (!interval) return false
  return now - lastRunAt >= interval
}

async function defaultSpawnForJob(job: CronJob): Promise<string> {
  return await agentManager.spawn({
    name: `cron-${job.name}`,
    agentType: (job.agentType ?? "build") as AgentTypeName,
    script: "src/agent/agent-worker.ts",
    tags: ["cron"],
    recovery: { maxRetries: 2, backoffMs: 5_000 },
  })
}

async function defaultSendIpc(agentId: string, message: AgentIpcMessage): Promise<void> {
  await agentManager.sendIpc(agentId, message)
}

export function startCronEngine(options: CronEngineOptions = {}): Array<{ name: string; stop: () => void }> {
  const timers: Array<{ name: string; stop: () => void }> = []
  const now = options.now ?? (() => Date.now())
  const heartbeatMs = options.heartbeatMs ?? 30 * 60 * 1000
  const lastRun = new Map<string, number>()
  const jobTimers = new Map<string, ReturnType<typeof setInterval>>()
  const warnedSchedules = new Set<string>()

  const spawnForJob = options.spawnAgent ?? defaultSpawnForJob
  const sendToAgent = options.sendIpc ?? defaultSendIpc

  const claimDue = (job: CronJob, at: number): boolean => {
    const last = lastRun.get(job.name) ?? at
    if (!isCronJobDue(job, at, last)) return false
    lastRun.set(job.name, at)
    return true
  }

  const runJob = async (job: CronJob): Promise<void> => {
    try {
      const id = await spawnForJob(job)
      await sendToAgent(id, {
        type: "run-task",
        id: `cron-${job.name}`,
        payload: { goal: job.goal },
        timestamp: Date.now(),
      })
    } catch (err) {
      log.error(`Cron job "${job.name}" failed`, { error: String(err) })
    }
  }

  const fireIfDue = (job: CronJob): void => {
    const at = now()
    if (!claimDue(job, at)) return
    void runJob(job)
  }

  const ensureJobTimer = (job: CronJob, at: number): void => {
    if (jobTimers.has(job.name)) return
    const schedule = parseCronSchedule(job.schedule)
    if (!schedule) {
      if (!warnedSchedules.has(job.name)) {
        warnedSchedules.add(job.name)
        log.warn(`Cron job "${job.name}" has an unsupported schedule, it will not run: ${job.schedule}`)
      }
      return
    }
    lastRun.set(job.name, at)
    const timer = setInterval(() => fireIfDue(job), schedule)
    timer.unref()
    jobTimers.set(job.name, timer)
    timers.push({ name: `cron-${job.name}`, stop: () => clearInterval(timer) })
  }

  // The periodic tick is a heartbeat only: it refreshes the job list and makes
  // sure every job owns a schedule timer. Job execution belongs to the per-job
  // timers so each job runs at its own cadence instead of on every heartbeat.
  const tick = async (): Promise<void> => {
    const jobs = await loadCronJobs()
    const at = now()
    for (const job of jobs) {
      ensureJobTimer(job, at)
    }
  }

  const interval = setInterval(() => {
    void tick()
  }, heartbeatMs)
  interval.unref()
  timers.push({ name: "heartbeat-30min", stop: () => clearInterval(interval) })

  const startedAt = now()
  for (const job of loadCronJobsSync()) {
    ensureJobTimer(job, startedAt)
  }

  return timers
}

function loadCronJobsSync(): CronJob[] {
  try {
    const file = getCronFile()
    if (!existsSync(file)) return []
    const raw = readFileSync(file, "utf-8")
    return JSON.parse(raw) as CronJob[]
  } catch {
    return []
  }
}

export async function listActiveJobs(): Promise<CronJob[]> {
  return await loadCronJobs()
}
