/**
 * Opt-in usage telemetry for the CLI.
 *
 * Tracks: command name, duration (ms), success/failure, timestamp, version.
 * No PII: no IP addresses, machine IDs, file paths, environment variables,
 * or any user-identifying information is collected.
 *
 * ## Opt-in mechanism
 *
 * 1. `AEGIS_TELEMETRY=1` env var enables telemetry for the current session.
 * 2. `AEGIS_TELEMETRY_ENDPOINT` env var sets the ingestion URL (default: https://telemetry.aegis.sh/v1/event).
 * 3. Local consent is persisted at `~/.aegis/telemetry-opt-in` (contains "1" or "0").
 *
 * ## Lifecycle
 *
 * - `recordCommand(name, success, durationMs)` — queues an event.
 * - `flush()` — sends all queued events to the endpoint (fire-and-forget).
 * - `isOptedIn()` / `setOptedIn(bool)` — manage consent.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { createLogger } from "../cli/logger"

const log = createLogger("telemetry")

// ── Constants ─────────────────────────────────────────────────────────

const TELEMETRY_DIR = join(homedir(), ".aegis")
const OPT_IN_FILE = join(TELEMETRY_DIR, "telemetry-opt-in")
const DEFAULT_ENDPOINT = "https://telemetry.aegis.sh/v1/event"
const MAX_QUEUE_SIZE = 100
const FLUSH_INTERVAL_MS = 10_000

// ── Types ─────────────────────────────────────────────────────────────

export interface TelemetryEvent {
  /** CLI command name (e.g., "status", "agent list", "serve") */
  command: string
  /** Whether the command completed successfully */
  success: boolean
  /** Duration in milliseconds */
  durationMs: number
  /** ISO 8601 timestamp */
  timestamp: string
  /** Package version */
  version: string
  /** Runtime info — just "bun" or "node" */
  runtime: string
}

interface TelemetryPayload {
  events: TelemetryEvent[]
  meta: {
    sentAt: string
    schema: string
  }
}

// ── Consent ───────────────────────────────────────────────────────────

/**
 * Check whether telemetry is opted in.
 * Order of precedence: env var → local file → default (opt-out).
 */
export function isOptedIn(): boolean {
  // 1. Env var overrides everything
  const env = process.env.AEGIS_TELEMETRY?.toLowerCase().trim()
  if (env === "1" || env === "true" || env === "yes") return true
  if (env === "0" || env === "false" || env === "no") return false

  // 2. Local opt-in file
  if (existsSync(OPT_IN_FILE)) {
    try {
      const val = readFileSync(OPT_IN_FILE, "utf-8").trim()
      return val === "1"
    } catch {
      return false
    }
  }

  // 3. Default: opt-out
  return false
}

/**
 * Persist the opt-in/opt-out preference to disk.
 */
export function setOptedIn(enabled: boolean): void {
  mkdirSync(TELEMETRY_DIR, { recursive: true })
  writeFileSync(OPT_IN_FILE, enabled ? "1" : "0", "utf-8")
}

// ── Event Queue ───────────────────────────────────────────────────────

const queue: TelemetryEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let _version: string = ""

function getVersion(): string {
  if (_version) return _version
  try {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "..", "package.json"), "utf-8"))
    _version = String((pkg as Record<string, unknown>).version || "0.0.0")
  } catch {
    _version = "0.0.0"
  }
  return _version
}

function getRuntime(): string {
  return process.versions.bun ? `bun/${process.versions.bun}` : `node/${process.version}`
}

/**
 * Queue a telemetry event for a CLI command execution.
 * Events are batched and sent asynchronously — failures are silently caught.
 */
export function recordCommand(command: string, success: boolean, durationMs: number): void {
  if (!isOptedIn()) return

  const event: TelemetryEvent = {
    command,
    success,
    durationMs,
    timestamp: new Date().toISOString(),
    version: getVersion(),
    runtime: getRuntime(),
  }

  queue.push(event)

  // Cap queue size to prevent unbounded memory
  if (queue.length > MAX_QUEUE_SIZE) {
    queue.shift()
  }

  // Schedule flush if not already scheduled
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null
      flush().catch(() => {})
    }, FLUSH_INTERVAL_MS)
  }
}

// ── Flush ─────────────────────────────────────────────────────────────

let flushing = false

/**
 * Send all queued events to the telemetry endpoint.
 * Fire-and-forget — failures are logged at debug level (not user-visible).
 */
export async function flush(): Promise<void> {
  if (flushing || queue.length === 0) return
  flushing = true

  const endpoint = process.env.AEGIS_TELEMETRY_ENDPOINT || DEFAULT_ENDPOINT
  const batch = queue.splice(0)

  const payload: TelemetryPayload = {
    events: batch,
    meta: {
      sentAt: new Date().toISOString(),
      schema: "aegis-telemetry-v1",
    },
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) {
      log.debug("Telemetry flush failed", { status: res.status })
    }
  } catch (err) {
    log.debug("Telemetry flush error", { error: String(err) })
  } finally {
    flushing = false
  }
}

/**
 * Flush remaining events on shutdown.
 * Call this from the CLI's shutdown handler.
 */
export async function flushOnExit(): Promise<void> {
  if (!isOptedIn() || queue.length === 0) return
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  await flush()
}

// ── Stats ─────────────────────────────────────────────────────────────

export interface TelemetryStats {
  optedIn: boolean
  queueSize: number
  endpoint: string
}

export function getTelemetryStats(): TelemetryStats {
  return {
    optedIn: isOptedIn(),
    queueSize: queue.length,
    endpoint: process.env.AEGIS_TELEMETRY_ENDPOINT || DEFAULT_ENDPOINT,
  }
}
