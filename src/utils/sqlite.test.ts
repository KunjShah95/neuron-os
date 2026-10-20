import { describe, it, expect, afterAll } from "bun:test"
import { Database } from "bun:sqlite"
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { openDatabase } from "./sqlite"

const tmp = mkdtempSync(join(tmpdir(), "sqlite-helper-"))

afterAll(() => {
  try {
    rmSync(tmp, { recursive: true, force: true })
  } catch {}
})

describe("openDatabase", () => {
  it("creates the parent directory and the database file", () => {
    const dbPath = join(tmp, "nested", "deeper", "store.db")
    expect(existsSync(join(tmp, "nested"))).toBe(false)

    const db = openDatabase(dbPath)

    expect(existsSync(join(tmp, "nested", "deeper"))).toBe(true)
    expect(existsSync(dbPath)).toBe(true)
    db.close()
  })

  it("enables foreign keys", () => {
    const db = openDatabase(join(tmp, "fk.db"))
    const row = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number } | null
    expect(row?.foreign_keys).toBe(1)
    db.close()
  })

  it("can be disabled explicitly", () => {
    const db = openDatabase(join(tmp, "fk-off.db"), { foreignKeys: false })
    const row = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number } | null
    expect(row?.foreign_keys).toBe(0)
    db.close()
  })

  it("works with :memory: without touching the filesystem", () => {
    const before = readdirSync(process.cwd()).length
    const db = openDatabase(":memory:")

    const row = db.prepare("SELECT 1 AS value").get() as { value: number }
    expect(row.value).toBe(1)
    expect(existsSync(join(process.cwd(), ":memory:"))).toBe(false)
    expect(readdirSync(process.cwd()).length).toBe(before)
    db.close()
  })

  it("does not throw when a second handle converts the journal mode", () => {
    const dbPath = join(tmp, "race.db")

    const first = openDatabase(dbPath)
    const second = openDatabase(dbPath)

    expect(() => second.exec("PRAGMA journal_mode = WAL")).not.toThrow()
    expect(() => openDatabase(dbPath)).not.toThrow()

    first.close()
    second.close()
  })

  it("swallows journal mode errors raised while another connection holds a lock", () => {
    const dbPath = join(tmp, "locked.db")
    const holder = new Database(dbPath)
    holder.exec("BEGIN EXCLUSIVE")

    let db: Database | null = null
    expect(() => {
      db = openDatabase(dbPath)
    }).not.toThrow()
    expect(db).not.toBeNull()

    holder.exec("ROLLBACK")
    holder.close()
    db?.close()
  })
})
