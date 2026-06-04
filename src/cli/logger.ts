/**
 * Structured logger with levels, JSON output, module-scoped instances, and file rotation.
 *
 * Log levels (controlled by AEGIS_LOG_LEVEL env var):
 *   debug → info → warn → error
 *
 * JSON-line format for production:
 *   {"level":"info","time":"2026-05-31T10:00:00.000Z","module":"agent","msg":"Spawned","agentId":"abc"}
 *
 * Pretty-prints to stderr when stdout is a TTY (non-JSON mode).
 *
 * File logging (controlled by AEGIS_LOG_FILE env var):
 *   Set AEGIS_LOG_FILE=<path> to write JSON logs to a file.
 *   Log files are automatically rotated at 10MB (AEGIS_LOG_MAX_SIZE bytes).
 *   Keeps up to 5 rotated files (AEGIS_LOG_MAX_FILES).
 */

import pc from "picocolors"
import { appendFileSync, mkdirSync, renameSync, existsSync, statSync } from "node:fs"
import { dirname } from "node:path"

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const
type LogLevel = (typeof LOG_LEVELS)[number]

function isLogLevel(v: string): v is LogLevel {
  return LOG_LEVELS.includes(v as LogLevel)
}

function getEffectiveLevel(): LogLevel {
  const env = process.env.AEGIS_LOG_LEVEL?.toLowerCase().trim()
  if (env && isLogLevel(env)) return env
  return "info"
}

let effectiveLevel = getEffectiveLevel()

/** Update the log level at runtime */
export function setLogLevel(level: string): void {
  if (isLogLevel(level)) effectiveLevel = level
}

/** Return the current effective log level */
export function getLogLevel(): LogLevel {
  return effectiveLevel
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(effectiveLevel)
}

function timestamp(): string {
  return new Date().toISOString()
}

function isTTY(): boolean {
  return pc.isColorSupported
}

const LEVEL_KEYS: Record<LogLevel, keyof typeof pc> = {
  debug: "gray",
  info: "blue",
  warn: "yellow",
  error: "red",
}

function prettyPrint(level: LogLevel, module: string, msg: string, data?: Record<string, unknown>): string {
  const colorFn = pc[LEVEL_KEYS[level]] as typeof pc.gray
  const tag = level.toUpperCase().padEnd(5)
  let line = `${colorFn(tag)} ${pc.bold(`[${module}]`)} ${msg}`
  if (data && Object.keys(data).length > 0) {
    const extras = Object.entries(data)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => `${colorFn(`${k}=${JSON.stringify(v)}`)}`)
      .join(" ")
    line += ` ${extras}`
  }
  return line
}

function jsonPrint(level: LogLevel, module: string, msg: string, data?: Record<string, unknown>): string {
  const entry: Record<string, unknown> = {
    level,
    time: timestamp(),
    module,
    msg,
  }
  if (data && Object.keys(data).length > 0) {
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) entry[k] = v
    }
  }
  return JSON.stringify(entry)
}

// ── File logging with rotation ───────────────────────────────────────

interface FileLogConfig {
  path: string
  maxSizeBytes: number
  maxFiles: number
}

let fileLogConfig: FileLogConfig | null = null
let _fileLogWarned = false

function initFileLog(): void {
  if (fileLogConfig) return
  const filePath = process.env.AEGIS_LOG_FILE
  if (!filePath) return

  const maxSize = parseInt(process.env.AEGIS_LOG_MAX_SIZE || "", 10) || 10 * 1024 * 1024
  const maxFiles = parseInt(process.env.AEGIS_LOG_MAX_FILES || "", 10) || 5

  // Ensure directory exists
  try {
    mkdirSync(dirname(filePath), { recursive: true })
  } catch {
    // Directory might already exist
  }

  fileLogConfig = { path: filePath, maxSizeBytes: maxSize, maxFiles }
}

function rotateLogFile(): void {
  if (!fileLogConfig) return
  const { path, maxFiles } = fileLogConfig

  // Remove the oldest rotated file
  const oldest = `${path}.${maxFiles}`
  if (existsSync(oldest)) {
    try {
      renameSync(oldest, oldest + ".old")
    } catch {
      // Best effort cleanup
    }
  }

  // Shift existing rotated files: .2 → .3, .1 → .2, etc.
  for (let i = maxFiles - 1; i >= 1; i--) {
    const src = `${path}.${i}`
    const dst = `${path}.${i + 1}`
    if (existsSync(src)) {
      try {
        renameSync(src, dst)
      } catch {
        // Best effort
      }
    }
  }

  // Rotate current → .1
  if (existsSync(path)) {
    try {
      renameSync(path, `${path}.1`)
    } catch {
      // Best effort
    }
  }
}

function writeToFile(line: string): void {
  if (!fileLogConfig) return
  const { path, maxSizeBytes } = fileLogConfig

  try {
    // Check size and rotate if needed
    if (existsSync(path)) {
      const st = statSync(path)
      if (st.size > maxSizeBytes) {
        rotateLogFile()
      }
    }

    appendFileSync(path, line + "\n", "utf-8")
  } catch (err) {
    if (!_fileLogWarned) {
      process.stderr.write(`[logger] Failed to write to log file ${path}: ${(err as Error)?.message ?? err}\n`)
      _fileLogWarned = true
    }
  }
}

/**
 * Create a scoped logger instance.
 *
 * @example
 * const log = createLogger("agent")
 * log.info("Spawned", { agentId: "abc", type: "build" })
 */
export function createLogger(module: string) {
  // Lazy-init file logging on first use
  initFileLog()

  const log = (level: LogLevel, msg: string, data?: Record<string, unknown>) => {
    if (!shouldLog(level)) return
    const line = isTTY() ? prettyPrint(level, module, msg, data) : jsonPrint(level, module, msg, data)
    // Write to stderr so stdout can be used for machine-readable output
    process.stderr.write(line + "\n")

    // Also write JSON line to log file if configured
    if (fileLogConfig) {
      writeToFile(jsonPrint(level, module, msg, data))
    }
  }

  return {
    debug: (msg: string, data?: Record<string, unknown>) => log("debug", msg, data),
    info: (msg: string, data?: Record<string, unknown>) => log("info", msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => log("warn", msg, data),
    error: (msg: string, data?: Record<string, unknown>) => log("error", msg, data),
  }
}

/** Re-export for convenience */
export type Logger = ReturnType<typeof createLogger>
