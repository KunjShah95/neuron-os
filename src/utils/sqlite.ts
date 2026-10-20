import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"

export interface OpenDatabaseOptions {
  foreignKeys?: boolean
  create?: boolean
}

/**
 * Backoff used when another process is using the same SQLite file. Several
 * processes opening the same database concurrently (the CLI smoke suite
 * spawns dozens of processes at once) can collide while the journal mode is
 * converted, which surfaces as a transient "disk I/O error" / "database is
 * locked". Those failures clear on their own, so a short retry is enough.
 */
const RETRY_DELAYS_MS = [10, 25, 50, 100, 200, 400]

function sleepSync(ms: number): void {
  try {
    ;(globalThis as { Bun?: { sleepSync?: (ms: number) => void } }).Bun?.sleepSync?.(ms)
  } catch {
    /* best-effort pause */
  }
}

function isRetryableSqliteError(err: unknown): boolean {
  const code = String((err as { code?: unknown })?.code ?? "")
  if (code.startsWith("SQLITE_BUSY") || code.startsWith("SQLITE_LOCKED")) return true
  if (code.startsWith("SQLITE_IOERR")) return true
  const message = String((err as { message?: unknown })?.message ?? err)
  return /database is locked|disk I\/O error|database disk image is malformed/i.test(message)
}

/**
 * Execute a statement, retrying briefly while another process holds the same
 * database file. Non-transient errors are rethrown immediately.
 */
export function execWithRetry(db: Database, sql: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      db.exec(sql)
      return
    } catch (err) {
      const delay = RETRY_DELAYS_MS[attempt]
      if (delay === undefined || !isRetryableSqliteError(err)) throw err
      sleepSync(delay)
    }
  }
}

function ensureDirectory(path: string): void {
  if (path === ":memory:" || path === "") return
  try {
    mkdirSync(dirname(resolve(path)), { recursive: true })
  } catch {
    /* the open will report a clearer error */
  }
}

function setFilePragma(db: Database, name: string, value: string): void {
  try {
    db.exec(`PRAGMA ${name} = ${value}`)
  } catch {
    /* WAL conversion races with other processes; the existing mode still works */
  }
}

/**
 * How long a statement waits for a lock held by another process before
 * SQLite gives up with SQLITE_BUSY.
 */
const BUSY_TIMEOUT_MS = 10_000

export function applyPragmas(db: Database, options: OpenDatabaseOptions = {}): void {
  // Start without waiting for locks so the pragmas that touch the database
  // header fail fast when another process already holds the database.
  setFilePragma(db, "busy_timeout", "0")
  // Converting the journal mode needs an exclusive lock that another process
  // may already hold.
  setFilePragma(db, "journal_mode", "WAL")
  setFilePragma(db, "synchronous", "NORMAL")
  // From here on, wait for locks rather than failing immediately on the
  // caller's statements.
  setFilePragma(db, "busy_timeout", String(BUSY_TIMEOUT_MS))
  if (options.foreignKeys !== false) {
    db.exec("PRAGMA foreign_keys = ON")
  }
}

export function openDatabase(path: string, options: OpenDatabaseOptions = {}): Database {
  ensureDirectory(path)
  const db = new Database(path, { create: options.create ?? true })
  applyPragmas(db, options)
  // Touch the file so a concurrent journal-mode conversion cannot leave the
  // handle broken for the caller's first statement. The busy timeout is
  // cleared for this probe: a database that is legitimately locked by another
  // process must still open, and the caller's statements wait for locks via
  // the busy timeout instead.
  try {
    db.exec("PRAGMA busy_timeout = 0")
    execWithRetry(db, "PRAGMA user_version")
  } catch {
    /* locked by another process — the caller's own statements retry */
  } finally {
    try {
      db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`)
    } catch {
      /* keep the SQLite default */
    }
  }
  return db
}
