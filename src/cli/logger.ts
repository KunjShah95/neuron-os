/**
 * Structured logger with levels, JSON output, and module-scoped instances.
 *
 * Log levels (controlled by AEGIS_LOG_LEVEL env var):
 *   debug → info → warn → error
 *
 * JSON-line format for production:
 *   {"level":"info","time":"2026-05-31T10:00:00.000Z","module":"agent","msg":"Spawned","agentId":"abc"}
 *
 * Pretty-prints to stderr when stdout is a TTY (non-JSON mode).
 */

import pc from "picocolors"

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

/**
 * Create a scoped logger instance.
 *
 * @example
 * const log = createLogger("agent")
 * log.info("Spawned", { agentId: "abc", type: "build" })
 */
export function createLogger(module: string) {
  const log = (level: LogLevel, msg: string, data?: Record<string, unknown>) => {
    if (!shouldLog(level)) return
    const line = isTTY() ? prettyPrint(level, module, msg, data) : jsonPrint(level, module, msg, data)
    // Write to stderr so stdout can be used for machine-readable output
    process.stderr.write(line + "\n")
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
