/**
 * loadAutoMemories must not return the whole auto-memory directory when the
 * caller asks for zero entries (slice(-0) is slice(0)).
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { MemorySystem } from "./system"

describe("MemorySystem.loadAutoMemories", () => {
  let dir: string
  let memory: MemorySystem

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "memory-auto-"))
    memory = new MemorySystem(dir)
    await memory.initialize()
  })

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best-effort cleanup */
    }
  })

  it("returns an empty array for a zero limit", async () => {
    await memory.saveAutoMemory("first", "one")
    await memory.saveAutoMemory("second", "two")

    const all = await memory.loadAutoMemories(10)
    expect(all.length).toBe(2)

    const none = await memory.loadAutoMemories(0)
    expect(none).toEqual([])
  })

  it("returns an empty array for a negative limit", async () => {
    await memory.saveAutoMemory("first", "one")

    expect(await memory.loadAutoMemories(-1)).toEqual([])
  })

  it("still honours a positive limit", async () => {
    await memory.saveAutoMemory("first", "one")
    await memory.saveAutoMemory("second", "two")
    await memory.saveAutoMemory("third", "three")

    const recent = await memory.loadAutoMemories(2)
    expect(recent.length).toBe(2)
  })
})
