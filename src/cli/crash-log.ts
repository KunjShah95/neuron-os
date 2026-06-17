/**
 * src/cli/crash-log.ts
 *
 * Structured crash logging for debugging server failures.
 *
 * Writes crash records to ~/.aegis/crash.log with timestamps, stack traces,
 * exit codes, uptime, and process metadata. Handles file rotation at 5MB
 * to prevent unbounded disk usage.
 *
 * Crash records are JSON lines, one per crash:
 *   {"type":"crash","time":"...","exitCode":1,"msg":"...","stack":"...","uptime":123.4,...}
 *
 * Use: cat ~/.aegis/crash.log to view all crashes.
 *      The latest crash is always at the end of the file.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const CRASH_LOG_DIR = join(homedir(), ".aegis")
const CRASH_LOG_PATH = join(CRASH_LOG_DIR, "crash.log")
const MAX_CRASH_LOG_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_CRASH_LOG_FILES = 3

let _logWarned = false

interface CrashRecord {
  /** Record type identifier */
  type: "crash" | "oom" | "signal"
  /** ISO-8601 timestamp */
  time: string
  /** Process exit code (null for signal termination) */
  exitCode: number | null
  /** Human-readable error message */
  msg: string
  /** Stack trace (trimmed to first 20 lines) */
  stack?: string
  /** Process uptime in seconds */
  uptime: number
  /** Node/Bun version */
  runtime: string
  /** Platform (win32, linux, darwin) */
  platform: string
  /** Architecture */
  arch: string
  /** Memory usage at crash time (RSS in MB) */
  memoryMB?: number
  /** Number of times the process has been restarted by the supervisor */
  restartCount?: number
  /** Additional metadata */
  [key: string]: unknown
}

/**
 * Ensure the crash log directory exists.
 */
function ensureDir(): void {
  try {
    mkdirSync(CRASH_LOG_DIR, { recursive: true })
  } catch {
    // Directory might already exist
  }
}

/**
 * Rotate crash log if it exceeds the maximum size.
 * Keeps up to MAX_CRASH_LOG_FILES rotated copies.
 */
function rotateIfNeeded(): void {
  if (!existsSync(CRASH_LOG_PATH)) return

  try {
    const st = statSync(CRASH_LOG_PATH)
    if (st.size <= MAX_CRASH_LOG_SIZE) return

    // Remove oldest rotated file
    const oldest = `${CRASH_LOG_PATH}.${MAX_CRASH_LOG_FILES}`
    if (existsSync(oldest)) {
      renameSync(oldest, `${oldest}.old`)
    }

    // Shift rotated files
    for (let i = MAX_CRASH_LOG_FILES - 1; i >= 1; i--) {
      const src = `${CRASH_LOG_PATH}.${i}`
      const dst = `${CRASH_LOG_PATH}.${i + 1}`
      if (existsSync(src)) {
        renameSync(src, dst)
      }
    }

    // Rotate current log
    renameSync(CRASH_LOG_PATH, `${CRASH_LOG_PATH}.1`)
  } catch {
    // Rotation is best-effort
  }
}

/**
 * Write a crash record to the crash log file.
 *
 * This function is designed to be called from error handlers
 * (uncaughtException, unhandledRejection) and should never throw.
 */
export function writeCrashRecord(record: CrashRecord): void {
  try {
    ensureDir()
    rotateIfNeeded()

    const line = JSON.stringify(record) + "\n"
    appendFileSync(CRASH_LOG_PATH, line, "utf-8")
  } catch (err) {
    if (!_logWarned) {
      process.stderr.write(
        `[crash-log] Failed to write crash record: ${err instanceof Error ? err.message : String(err)}\n`,
      )
      _logWarned = true
    }
  }
}

/**
 * Log a crash caused by an uncaught exception.
 *
 * @param error - The error that caused the crash
 * @param context - Optional additional context (e.g., { exitCode: 1 })
 */
export function logCrash(
  error: Error | unknown,
  context?: {
    exitCode?: number
    restartCount?: number
    recordType?: CrashRecord["type"]
    extra?: Record<string, unknown>
  },
): void {
  const err = error instanceof Error ? error : new Error(String(error))
  const stack = err.stack
    ? err.stack.split("\n").slice(0, 20).join("\n")
    : undefined

  const record: CrashRecord = {
    type: context?.recordType ?? "crash",
    time: new Date().toISOString(),
    exitCode: context?.exitCode ?? null,
    msg: err.message,
    stack,
    uptime: process.uptime(),
    runtime: `${process.version} (${process.release?.name ?? "bun"})`,
    platform: process.platform,
    arch: process.arch,
    memoryMB: Math.round((process.memoryUsage?.()?.rss ?? 0) / (1024 * 1024)),
    restartCount: context?.restartCount,
    ...context?.extra,
  }

  writeCrashRecord(record)
}

/**
 * Log a child process crash from the supervisor.
 *
 * @param exitCode - The child process exit code
 * @param uptimeSeconds - How long the child ran before crashing
 * @param restartCount - Current restart attempt number
 */
export function logChildCrash(
  exitCode: number | null,
  uptimeSeconds: number,
  restartCount: number,
): void {
  writeCrashRecord({
    type: "crash",
    time: new Date().toISOString(),
    exitCode,
    msg: `Child process crashed with exit code ${exitCode} after ${uptimeSeconds.toFixed(1)}s (restart #${restartCount})`,
    uptime: uptimeSeconds,
    runtime: `${process.version}`,
    platform: process.platform,
    arch: process.arch,
    restartCount,
  })
}

/**
 * Read the last N crash records from the crash log.
 * Useful for showing recent crashes in status/debug commands.
 *
 * @param count - Number of recent records to return (default 10)
 * @returns Array of parsed crash records, most recent first
 */
export function readRecentCrashes(count = 10): CrashRecord[] {
  try {
    if (!existsSync(CRASH_LOG_PATH)) return []

    const content = readFileSync(CRASH_LOG_PATH, "utf-8")
    const lines = content.trim().split("\n").filter(Boolean)

    // Parse from the end to get most recent first
    const records: CrashRecord[] = []
    for (let i = lines.length - 1; i >= 0 && records.length < count; i--) {
      try {
        const parsed = JSON.parse(lines[i])
        if (parsed && parsed.type === "crash") {
          records.push(parsed)
        }
      } catch {
        // Skip malformed lines
      }
    }
    return records
  } catch {
    return []
  }
}

/**
 * Get the path to the crash log file.
 */
export function getCrashLogPath(): string {
  return CRASH_LOG_PATH
}

/**
 * Get a human-readable summary of recent crashes for display.
 */
export function formatCrashSummary(records: CrashRecord[]): string {
  if (records.length === 0) return "No crashes recorded."

  const lines = [`📋 Last ${records.length} crash(es):`, ""]
  for (const r of records) {
    const time = r.time.slice(0, 19).replace("T", " ")
    const code = r.exitCode !== null ? `code ${r.exitCode}` : "signal"
    const uptime = `${r.uptime.toFixed(1)}s`
    const msg = r.msg.slice(0, 100)
    lines.push(`  [${time}] exit=${code} uptime=${uptime}`)
    lines.push(`         ${msg}`)
  }
  return lines.join("\n")
}

/**
 * Clear the crash log.
 */
export function clearCrashLog(): void {
  try {
    writeFileSync(CRASH_LOG_PATH, "", "utf-8")
  } catch {
    // Best-effort
  }
}
