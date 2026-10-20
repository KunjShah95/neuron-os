/**
 * triggers/registry — Unified trigger engine for event-driven agent execution.
 *
 * Provides a single registry for all trigger types (cron, file_watch, webhook,
 * condition, gateway_command) with persistent JSON storage and a common
 * execution interface.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, watch } from "node:fs"
import type { FSWatcher } from "node:fs"
import { createHmac, timingSafeEqual } from "node:crypto"
import { isAbsolute, resolve, sep } from "node:path"
import { createLogger } from "../cli/logger"
import type { AgentTypeName } from "../agent/agent-types"

const log = createLogger("triggers")

const SHELL_METACHARACTERS = /[|&;<>`$"'(){}*?!~\r\n]/
const COMMAND_TOKEN = /^[A-Za-z0-9._\-/\\:@]+$/

export function tokenizeCommandLine(input: string): string[] | null {
  const tokens: string[] = []
  let current = ""
  let quote: '"' | "'" | null = null
  let started = false

  for (const ch of input) {
    if (quote) {
      if (ch === quote) {
        quote = null
        continue
      }
      current += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      started = true
      continue
    }
    if (/\s/.test(ch)) {
      if (started) {
        tokens.push(current)
        current = ""
        started = false
      }
      continue
    }
    current += ch
    started = true
  }

  if (quote) return null
  if (started) tokens.push(current)
  return tokens
}

function pingAction(): TriggerAction {
  if (process.platform === "win32") {
    return { mode: "run-command", goal: "cmd", args: ["/c", "echo", "pong"] }
  }
  return { mode: "run-command", goal: "echo", args: ["pong"] }
}

function isLegacyPingAction(action: TriggerAction): boolean {
  return action.mode === "run-command" && action.goal === "echo pong" && (action.args ?? []).length === 0
}

// ── Types ─────────────────────────────────────────────────────────────

export type TriggerType = "cron" | "file_watch" | "webhook" | "condition" | "gateway_command"

export type TriggerActionMode = "spawn-agent" | "queue-task" | "run-command"

export interface TriggerAction {
  mode: TriggerActionMode
  goal: string
  agentType?: string
  priority?: "low" | "normal" | "high" | "critical"
  args?: string[]
}

export interface CronConfig {
  schedule: string
  duringHours?: [number, number]
}

export interface FileWatchConfig {
  dir: string
  pattern?: string
  events?: Array<"change" | "create" | "delete">
  debounceMs?: number
}

export interface WebhookConfig {
  path: string
  secret?: string
  method?: "POST" | "GET" | "PUT"
}

export interface ConditionConfig {
  metric: "cpu" | "memory" | "disk" | "git-changes" | "custom"
  threshold: number
  operator: "gt" | "lt" | "gte" | "lte" | "eq"
  pollMs?: number
  customCommand?: string
}

export interface GatewayCommandConfig {
  command: string
  platform?: string
}

export type TriggerConfig =
  | { type: "cron"; config: CronConfig }
  | { type: "file_watch"; config: FileWatchConfig }
  | { type: "webhook"; config: WebhookConfig }
  | { type: "condition"; config: ConditionConfig }
  | { type: "gateway_command"; config: GatewayCommandConfig }

export interface TriggerDef {
  id: string
  name: string
  type: TriggerType
  config: TriggerConfig["config"]
  action: TriggerAction
  enabled: boolean
  createdAt: string
  lastFiredAt?: string
  fireCount: number
  tags?: string[]
  /** Previous evaluation result of a condition trigger (edge detection) */
  conditionState?: boolean
}

// ── Storage ───────────────────────────────────────────────────────────

function getDataDir(): string {
  return process.env.AEGIS_DATA_DIR ?? resolve(process.cwd(), "data")
}

function getTriggerFile(): string {
  return resolve(getDataDir(), "triggers.json")
}

function ensureDir(): void {
  const dir = getDataDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function loadTriggersFromDisk(): TriggerDef[] {
  try {
    const file = getTriggerFile()
    if (!existsSync(file)) return []
    const raw = readFileSync(file, "utf-8")
    return JSON.parse(raw) as TriggerDef[]
  } catch (err) {
    log.warn("Failed to load triggers from disk", { error: String(err) })
    return []
  }
}

function saveTriggersToDisk(triggers: TriggerDef[]): void {
  ensureDir()
  writeFileSync(getTriggerFile(), JSON.stringify(triggers, null, 2), "utf-8")
}

// ── Helper: Hour windows ──────────────────────────────────────────────

export function validateDuringHours(window: [number, number]): void {
  const [start, end] = window
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new Error("duringHours start and end must be whole hours")
  }
  if (start < 0 || start > 23 || end < 0 || end > 23) {
    throw new Error("duringHours start and end must be between 0 and 23")
  }
}

export function isWithinDuringHours(hour: number, window: [number, number]): boolean {
  const [start, end] = window
  if (start === end) return false
  if (start < end) return hour >= start && hour < end
  return hour >= start || hour < end
}

// ── Helper: Glob-to-regex ─────────────────────────────────────────────

function globToRegex(pattern: string): RegExp {
  let s = pattern
  s = s.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  s = s.replace(/\*\*/g, "\x00DOUBLESTAR\x00")
  s = s.replace(/\*/g, "[^/]*")
  s = s.replace(/\?/g, ".")
  s = s.replace(/\x00DOUBLESTAR\x00/g, ".*")
  return new RegExp("^" + s + "$")
}

// ── TriggerEngine ─────────────────────────────────────────────────────

export class TriggerEngine {
  private triggers: Map<string, TriggerDef> = new Map()
  private pollingStarted = false
  private watchDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private activeCronTimers = new Map<string, ReturnType<typeof setInterval>>()
  private activeFileWatchers = new Map<string, FSWatcher>()
  private activeConditionTimers = new Map<string, ReturnType<typeof setInterval>>()
  private firingTriggers = new Set<string>()

  constructor() {
    this.reloadFromDisk()
    this.registerDefaults()
    log.info("Trigger engine initialized with " + this.triggers.size + " trigger(s)")
  }

  /**
   * Register default built-in triggers if they don't already exist.
   * These can be overridden by user-registered triggers with the same command.
   */
  private registerDefaults(): void {
    const defaults: Array<Omit<TriggerDef, "id" | "createdAt" | "fireCount" | "lastFiredAt"> & { id?: string }> = [
      {
        name: "agent",
        type: "gateway_command",
        config: { command: "agent" },
        action: { mode: "queue-task", goal: "{{rest}}", priority: "normal" },
        enabled: true,
        tags: ["builtin"],
      },
      {
        name: "ping",
        type: "gateway_command",
        config: { command: "ping" },
        action: pingAction(),
        enabled: true,
        tags: ["builtin"],
      },
    ]

    let migrated = false

    for (const def of defaults) {
      const existing = Array.from(this.triggers.values()).find(
        (t) =>
          t.type === "gateway_command" &&
          (t.config as GatewayCommandConfig).command === (def.config as GatewayCommandConfig).command,
      )
      if (existing) {
        if (def.name === "ping" && isLegacyPingAction(existing.action)) {
          existing.action = pingAction()
          migrated = true
          log.info('Migrated legacy builtin "ping" trigger to an explicit command + args action')
        }
        continue
      }
      const id = "builtin-" + def.name
      this.triggers.set(id, {
        ...def,
        id,
        createdAt: new Date().toISOString(),
        fireCount: 0,
        enabled: true,
      } as TriggerDef)
    }

    if (migrated) this.persist()
  }

  // ── Public API ──────────────────────────────────────────────────────

  register(def: Omit<TriggerDef, "id" | "createdAt" | "fireCount" | "lastFiredAt"> & { id?: string }): TriggerDef {
    if (def.type === "cron") {
      const cfg = def.config as CronConfig
      if (cfg.duringHours) {
        validateDuringHours(cfg.duringHours)
      }
    }
    const id = def.id ?? "trigger-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6)
    const trigger: TriggerDef = {
      ...def,
      id,
      createdAt: new Date().toISOString(),
      fireCount: 0,
      enabled: def.enabled ?? true,
    }
    this.triggers.set(id, trigger)
    this.persist()
    log.info('Trigger registered: "' + trigger.name + '" (' + trigger.type + ")")
    if (trigger.enabled) {
      if (trigger.type === "cron") this.startCronTimer(trigger)
      else if (trigger.type === "file_watch") this.startFileWatch(trigger)
      else if (trigger.type === "condition") this.startConditionTimer(trigger)
    }
    return trigger
  }

  unregister(id: string): boolean {
    const trigger = this.triggers.get(id)
    if (!trigger) return false
    this.stopCronTimer(id)
    this.stopFileWatcher(id)
    this.stopConditionTimer(id)
    this.triggers.delete(id)
    this.persist()
    log.info('Trigger unregistered: "' + trigger.name + '" (' + id + ")")
    return true
  }

  setEnabled(id: string, enabled: boolean): boolean {
    const trigger = this.triggers.get(id)
    if (!trigger) return false
    trigger.enabled = enabled
    this.persist()
    if (trigger.type === "cron") {
      if (enabled) this.startCronTimer(trigger)
      else this.stopCronTimer(id)
    } else if (trigger.type === "file_watch") {
      if (enabled) this.startFileWatch(trigger)
      else this.stopFileWatcher(id)
    } else if (trigger.type === "condition") {
      if (enabled) this.startConditionTimer(trigger)
      else this.stopConditionTimer(id)
    }
    log.info('Trigger "' + trigger.name + '" ' + (enabled ? "enabled" : "disabled"))
    return true
  }

  get(id: string): TriggerDef | undefined {
    return this.triggers.get(id)
  }

  list(opts?: { type?: TriggerType; tag?: string; enabled?: boolean }): TriggerDef[] {
    let result = Array.from(this.triggers.values())
    if (opts?.type) result = result.filter((t) => t.type === opts?.type)
    if (opts?.tag) {
      const tag = opts.tag
      result = result.filter((t) => t.tags?.includes(tag))
    }
    if (opts?.enabled !== undefined) result = result.filter((t) => t.enabled === opts?.enabled)
    return result
  }

  matchGatewayCommand(command: string, platform?: string): TriggerDef | undefined {
    return Array.from(this.triggers.values()).find((t) => {
      if (t.type !== "gateway_command" || !t.enabled) return false
      const cfg = t.config as GatewayCommandConfig
      if (cfg.platform && cfg.platform !== platform) return false
      return command === cfg.command || command.startsWith(cfg.command + " ")
    })
  }

  matchWebhook(path: string, method: string): TriggerDef | undefined {
    return Array.from(this.triggers.values()).find((t) => {
      if (t.type !== "webhook" || !t.enabled) return false
      const cfg = t.config as WebhookConfig
      if (cfg.method && cfg.method !== method) return false
      return path === cfg.path
    })
  }

  /**
   * Verify a webhook payload against a per-trigger secret.
   * Uses constant-time comparison; returns false when the secret is missing or mismatched.
   */
  verifyWebhookSecret(trigger: TriggerDef, payload: string, signature: string | null | undefined): boolean {
    const cfg = trigger.config as WebhookConfig
    if (!cfg.secret) return true
    if (!signature) return false
    const expected = createHmac("sha256", cfg.secret).update(payload, "utf-8").digest("hex")
    const provided = signature.replace(/^sha256=/i, "")
    const bufA = Buffer.from(expected, "utf-8")
    const bufB = Buffer.from(provided, "utf-8")
    if (bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
  }

  async fire(
    trigger: TriggerDef,
    goalOverride?: string,
  ): Promise<{ success: boolean; result?: string; error?: string }> {
    if (!trigger.enabled) {
      return { success: false, error: "Trigger is disabled" }
    }
    if (this.firingTriggers.has(trigger.id)) {
      log.warn('Trigger "' + trigger.name + '" is already running, skipping overlapping fire')
      return { success: false, error: "Trigger is already running" }
    }
    const goal = goalOverride ?? trigger.action.goal
    log.info('Firing trigger "' + trigger.name + '" (' + trigger.type + ")")
    trigger.lastFiredAt = new Date().toISOString()
    trigger.fireCount++
    this.persist()
    this.firingTriggers.add(trigger.id)
    try {
      switch (trigger.action.mode) {
        case "spawn-agent": {
          const { agentManager } = await import("../agent/manager")
          const agentId = await agentManager.spawn({
            name: "trigger-" + trigger.name + "-" + Date.now().toString(36),
            agentType: (trigger.action.agentType ?? "build") as AgentTypeName,
            script: "src/agent/agent-worker.ts",
            tags: ["trigger", trigger.name, trigger.type],
            recovery: { maxRetries: 2 },
          })
          agentManager.sendIpc(agentId, {
            type: "run-task",
            id: "trigger-" + trigger.id,
            payload: { goal },
            timestamp: Date.now(),
          }).catch((err: unknown) => {
            log.error('Trigger "' + trigger.name + '" failed to deliver task', { error: String(err) })
          })
          return { success: true, result: "Spawned agent " + agentId }
        }
        case "queue-task": {
          const { taskQueue } = await import("../agent/queue")
          const taskId = taskQueue.submit(goal, trigger.action.priority ?? "normal")
          return { success: true, result: "Queued task " + taskId }
        }
        case "run-command": {
          const { spawn } = await import("node:child_process")
          const parsed = this.parseCommand(goal, trigger.action.args)
          if (!parsed) {
            return { success: false, error: "Invalid or empty command" }
          }
          const allowed = this.allowedCommands()
          if (allowed && !allowed.includes(parsed.command)) {
            log.warn("Trigger command is not allowed", { command: parsed.command, trigger: trigger.name })
            return { success: false, error: `Command "${parsed.command}" is not allowed` }
          }
          const cmd = parsed.command
          const args = parsed.args
          return new Promise((resolve) => {
            let stdout = ""
            let stderr = ""
            const child = spawn(cmd, args, {
              stdio: ["ignore", "pipe", "pipe"],
              cwd: process.cwd(),
              shell: false,
              env: { ...process.env, AEGIS_TRIGGER_ID: trigger.id, AEGIS_TRIGGER_NAME: trigger.name },
            })
            child.stdout?.on("data", (chunk: Buffer) => {
              stdout += chunk.toString()
            })
            child.stderr?.on("data", (chunk: Buffer) => {
              stderr += chunk.toString()
            })
            const timeout = setTimeout(() => {
              child.kill()
              resolve({ success: false, error: "Command timed out after 60s" })
            }, 60_000)
            child.on("exit", (code) => {
              clearTimeout(timeout)
              const output = stdout.trim()
              const errOutput = stderr.trim()
              if (code === 0 && output) {
                resolve({ success: true, result: output })
              } else if (code === 0) {
                resolve({ success: true, result: "Command exited with code 0" })
              } else {
                resolve({ success: false, error: errOutput || "Command exited with code " + code })
              }
            })
            child.on("error", (err) => {
              clearTimeout(timeout)
              resolve({ success: false, error: err.message })
            })
          })
        }
        default:
          return { success: false, error: "Unknown action mode: " + (trigger.action as { mode: string }).mode }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      log.error('Trigger "' + trigger.name + '" failed', { error: errMsg })
      return { success: false, error: errMsg }
    } finally {
      this.firingTriggers.delete(trigger.id)
    }
  }

  private parseCommand(goal: string, explicitArgs?: string[]): { command: string; args: string[] } | null {
    const parts = tokenizeCommandLine(goal)
    if (!parts || parts.length === 0) return null
    const command = parts[0]
    if (!command) return null
    if (SHELL_METACHARACTERS.test(command)) return null
    if (!COMMAND_TOKEN.test(command)) return null
    if (command.includes("..")) return null
    const args = [...parts.slice(1), ...(explicitArgs ?? [])]
    return { command, args }
  }

  private allowedCommands(): string[] | null {
    const raw = process.env.AEGIS_TRIGGER_ALLOWED_COMMANDS
    if (!raw) return null
    const list = raw
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
    if (list.length === 0) return null
    return list
  }

  async fireById(id: string, goalOverride?: string): Promise<{ success: boolean; result?: string; error?: string }> {
    const trigger = this.triggers.get(id)
    if (!trigger) return { success: false, error: 'Trigger "' + id + '" not found' }
    return this.fire(trigger, goalOverride)
  }

  startPolling(): void {
    if (this.pollingStarted) return
    this.pollingStarted = true
    for (const trigger of this.triggers.values()) {
      if (!trigger.enabled) continue
      if (trigger.type === "cron") this.startCronTimer(trigger)
      else if (trigger.type === "file_watch") this.startFileWatch(trigger)
      else if (trigger.type === "condition") this.startConditionTimer(trigger)
    }
    log.info("Trigger polling started")
  }

  stopPolling(): void {
    this.pollingStarted = false
    for (const id of this.activeCronTimers.keys()) this.stopCronTimer(id)
    for (const id of this.activeFileWatchers.keys()) this.stopFileWatcher(id)
    for (const id of this.activeConditionTimers.keys()) this.stopConditionTimer(id)
    log.info("Trigger polling stopped")
  }

  reloadFromDisk(): void {
    const loaded = loadTriggersFromDisk()
    this.triggers.clear()
    for (const t of loaded) {
      this.triggers.set(t.id, t)
    }
  }

  get size(): number {
    return this.triggers.size
  }

  // ── Cron Timer Management ──────────────────────────────────────────

  private startCronTimer(trigger: TriggerDef): void {
    if (this.activeCronTimers.has(trigger.id)) return
    const cfg = trigger.config as CronConfig
    const ms = this.parseSchedule(cfg.schedule)
    if (!ms) {
      log.warn('Invalid cron schedule for "' + trigger.name + '": ' + cfg.schedule)
      return
    }
    if (cfg.duringHours) {
      try {
        validateDuringHours(cfg.duringHours)
      } catch (err) {
        log.warn('Invalid during-hours window for "' + trigger.name + '": ' + String(err))
        return
      }
    }
    const timer = setInterval(async () => {
      if (cfg.duringHours) {
        const hour = new Date().getHours()
        if (!isWithinDuringHours(hour, cfg.duringHours)) return
      }
      await this.fire(trigger).catch((err) => {
        log.error('Cron trigger "' + trigger.name + '" fire failed', { error: String(err) })
      })
    }, ms)
    timer.unref()
    this.activeCronTimers.set(trigger.id, timer)
  }

  private stopCronTimer(id: string): void {
    const timer = this.activeCronTimers.get(id)
    if (timer) {
      clearInterval(timer)
      this.activeCronTimers.delete(id)
    }
  }

  private parseSchedule(schedule: string): number | null {
    const match = schedule.match(/^(\d+)\s*(s|m|h|d)$/)
    if (match) {
      const units: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 }
      return parseInt(match[1] ?? "0") * (units[match[2] ?? ""] ?? 1000)
    }
    return null
  }

  // ── File Watcher Management ─────────────────────────────────────────

  startFileWatch(trigger: TriggerDef): void {
    if (trigger.type !== "file_watch") return
    if (this.activeFileWatchers.has(trigger.id)) return
    const cfg = trigger.config as FileWatchConfig
    const watchDir = this.resolveWatchDir(cfg.dir)
    if (!watchDir) return
    const debounceMs = cfg.debounceMs ?? 1000
    if (!existsSync(watchDir)) {
      log.warn("File watch directory does not exist: " + watchDir)
      return
    }
    try {
      const handleEvent = (eventType: string, filename: string | Buffer | null): void => {
        if (!trigger.enabled || !filename) return
        const fileName = filename.toString()
        if (cfg.pattern && !globToRegex(cfg.pattern).test(fileName)) return
        if (eventType === "change" && cfg.events && !cfg.events.includes("change")) return
        if (eventType === "rename") {
          const filePath = resolve(watchDir, fileName)
          const stillExists = existsSync(filePath)
          if (stillExists && cfg.events && !cfg.events.includes("create")) return
          if (!stillExists && cfg.events && !cfg.events.includes("delete")) return
        }
        log.info('File change detected for trigger "' + trigger.name + '": ' + fileName + " (" + eventType + ")")
        this.debouncedFire(trigger, debounceMs)
      }
      let watcher: FSWatcher
      try {
        watcher = watch(watchDir, { recursive: true }, handleEvent)
      } catch (recursiveErr: unknown) {
        if (String(recursiveErr).includes("ERR_FEATURE_UNAVAILABLE_ON_PLATFORM")) {
          log.warn('Recursive watch not supported, falling back to non-recursive for "' + trigger.name + '"')
          watcher = watch(watchDir, { recursive: false }, handleEvent)
        } else {
          throw recursiveErr
        }
      }
      watcher.unref()
      this.activeFileWatchers.set(trigger.id, watcher)
      log.info('File watcher started for "' + trigger.name + '" on ' + watchDir)
    } catch (err) {
      log.error('Failed to start file watcher for "' + trigger.name + '"', { error: String(err) })
    }
  }

  private resolveWatchDir(dir: string): string | null {
    const projectRoot = resolve(process.cwd())
    if (!dir || dir.trim().length === 0) {
      log.warn("File watch directory is empty, skipping watcher")
      return null
    }
    if (isAbsolute(dir)) {
      log.warn("File watch path must be relative to the project root, refusing: " + dir)
      return null
    }
    const target = resolve(projectRoot, dir)
    if (target !== projectRoot && !target.startsWith(projectRoot + sep)) {
      log.warn("File watch path escapes the project root, refusing: " + dir)
      return null
    }
    return target
  }

  private stopFileWatcher(id: string): void {
    const watcher = this.activeFileWatchers.get(id)
    if (watcher) {
      watcher.close()
      this.activeFileWatchers.delete(id)
    }
    const debounceTimer = this.watchDebounceTimers.get(id)
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      this.watchDebounceTimers.delete(id)
    }
  }

  private debouncedFire(trigger: TriggerDef, debounceMs: number): void {
    const key = trigger.id
    const existing = this.watchDebounceTimers.get(key)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(async () => {
      this.watchDebounceTimers.delete(key)
      await this.fire(trigger).catch((err) => {
        log.error('File watch trigger "' + trigger.name + '" fire failed', { error: String(err) })
      })
    }, debounceMs)
    this.watchDebounceTimers.set(key, timer)
  }

  // ── Condition Timer Management ────────────────────────────────────

  private startConditionTimer(trigger: TriggerDef): void {
    if (trigger.type !== "condition") return
    if (this.activeConditionTimers.has(trigger.id)) return
    const cfg = trigger.config as ConditionConfig
    const pollMs = Math.max(cfg.pollMs ?? 60_000, 10_000)
    const timer = setInterval(async () => {
      await this.evaluateCondition(trigger).catch(() => {})
    }, pollMs)
    timer.unref()
    this.activeConditionTimers.set(trigger.id, timer)
  }

  private stopConditionTimer(id: string): void {
    const timer = this.activeConditionTimers.get(id)
    if (timer) {
      clearInterval(timer)
      this.activeConditionTimers.delete(id)
    }
  }

  // ── Condition Evaluation ───────────────────────────────────────────

  private async evaluateCondition(trigger: TriggerDef): Promise<void> {
    if (!trigger.enabled) return
    const cfg = trigger.config as ConditionConfig
    let value: number
    try {
      value = await this.getMetricValue(cfg)
    } catch (err) {
      log.warn('Condition check failed for "' + trigger.name + '"', { error: String(err) })
      return
    }
    const triggered = this.compareValues(value, cfg.threshold, cfg.operator)
    const previous = trigger.conditionState === true

    if (!triggered) {
      if (previous) {
        trigger.conditionState = false
        this.persist()
      }
      return
    }

    if (previous) {
      return
    }

    trigger.conditionState = true
    log.info('Condition triggered for "' + trigger.name + '": ' + value + " " + cfg.operator + " " + cfg.threshold)
    await this.fire(trigger).catch((err) => {
      log.error('Condition trigger "' + trigger.name + '" fire failed', { error: String(err) })
    })
  }

  private async getMetricValue(cfg: ConditionConfig): Promise<number> {
    switch (cfg.metric) {
      case "cpu": {
        const os = await import("node:os")
        const cpus = os.cpus()
        const total = cpus.reduce((s, cpu) => {
          const idle = cpu.times.idle
          const totalT = Object.values(cpu.times).reduce((a, b) => a + b, 0)
          return s + (totalT > 0 ? 1 - idle / totalT : 0)
        }, 0)
        return (total / cpus.length) * 100
      }
      case "memory": {
        const os = await import("node:os")
        const total = os.totalmem()
        const free = os.freemem()
        return ((total - free) / total) * 100
      }
      case "disk": {
        const { execSync } = await import("node:child_process")
        try {
          const result = execSync("df . 2>&1", { encoding: "utf8", timeout: 3000 })
          const match = result.match(/(\d+)%\s+/)
          return match ? parseInt(match[1] ?? "50", 10) : 50
        } catch {
          return 50
        }
      }
      case "git-changes": {
        const { execSync } = await import("node:child_process")
        try {
          const result = execSync("git status --porcelain 2>&1", { encoding: "utf8", timeout: 3000 })
          return result.trim() ? result.split("\n").length : 0
        } catch {
          return 0
        }
      }
      case "custom": {
        if (!cfg.customCommand) return 0
        const { execSync } = await import("node:child_process")
        const sanitized = cfg.customCommand.replace(/[;&|`$(){}[\]!#~<>*?\\\n\r]/g, "")
        const result = execSync(sanitized, { encoding: "utf8", timeout: 5000 })
        return parseFloat(result.trim()) || 0
      }
      default:
        return 0
    }
  }

  private compareValues(value: number, threshold: number, operator: string): boolean {
    switch (operator) {
      case "gt":
        return value > threshold
      case "lt":
        return value < threshold
      case "gte":
        return value >= threshold
      case "lte":
        return value <= threshold
      case "eq":
        return value === threshold
      default:
        return false
    }
  }

  // ── Persistence ────────────────────────────────────────────────────

  private persist(): void {
    saveTriggersToDisk(Array.from(this.triggers.values()))
  }
}

/**
 * Lazily-initialized singleton TriggerEngine.
 * The instance is created on first property access, not at module load time.
 * This reduces startup overhead for commands that don't use triggers.
 */
let _triggerEngine: TriggerEngine | null = null
function getTriggerEngine(): TriggerEngine {
  if (!_triggerEngine) _triggerEngine = new TriggerEngine()
  return _triggerEngine
}

/**
 * Backward-compatible singleton reference.
 * Uses a Proxy to defer construction until the first property access.
 */
export const triggerEngine = new Proxy({} as TriggerEngine, {
  get(_, prop: PropertyKey) {
    return getTriggerEngine()[prop as keyof TriggerEngine]
  },
  has(_, prop: PropertyKey) {
    return prop in getTriggerEngine()
  },
  ownKeys() {
    return Reflect.ownKeys(getTriggerEngine())
  },
  getOwnPropertyDescriptor(_, prop: PropertyKey) {
    return Reflect.getOwnPropertyDescriptor(getTriggerEngine(), prop)
  },
})
