import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"

export interface OpenDatabaseOptions {
  foreignKeys?: boolean
  create?: boolean
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

export function applyPragmas(db: Database, options: OpenDatabaseOptions = {}): void {
  setFilePragma(db, "journal_mode", "WAL")
  setFilePragma(db, "synchronous", "NORMAL")
  if (options.foreignKeys !== false) {
    db.exec("PRAGMA foreign_keys = ON")
  }
}

export function openDatabase(path: string, options: OpenDatabaseOptions = {}): Database {
  ensureDirectory(path)
  const db = new Database(path, { create: options.create ?? true })
  applyPragmas(db, options)
  return db
}
