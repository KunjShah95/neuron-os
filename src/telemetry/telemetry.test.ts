/**
 * Tests for the telemetry module.
 * Covers opt-in/out, event recording, queue management, stats, and flush behavior.
 *
 * Usage: bun run src/telemetry/test-telemetry.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

// ── Helpers to manipulate opt-in state ────────────────────────────────

const OPT_IN_FILE = join(homedir(), ".aegis", "telemetry-opt-in")

function clearOptInFile() {
  try { if (existsSync(OPT_IN_FILE)) unlinkSync(OPT_IN_FILE) } catch {}
}

function writeOptInFile(value: "1" | "0") {
  mkdirSync(join(homedir(), ".aegis"), { recursive: true })
  writeFileSync(OPT_IN_FILE, value, "utf-8")
}

// Need to re-import after env changes — use dynamic import
async function getTelemetry() {
  return await import("./index")
}

describe("Telemetry — opt-in/out", () => {
  const origEnv = process.env.AEGIS_TELEMETRY

  beforeEach(() => {
    delete process.env.AEGIS_TELEMETRY
    clearOptInFile()
  })

  afterEach(() => {
    process.env.AEGIS_TELEMETRY = origEnv
    clearOptInFile()
  })

  it("should default to opted-out", async () => {
    const tel = await getTelemetry()
    expect(tel.isOptedIn()).toBe(false)
  })

  it("should opt in via env var (1)", async () => {
    process.env.AEGIS_TELEMETRY = "1"
    const tel = await getTelemetry()
    expect(tel.isOptedIn()).toBe(true)
  })

  it("should opt in via env var (true)", async () => {
    process.env.AEGIS_TELEMETRY = "true"
    const tel = await getTelemetry()
    expect(tel.isOptedIn()).toBe(true)
  })

  it("should opt out via env var (0)", async () => {
    process.env.AEGIS_TELEMETRY = "0"
    const tel = await getTelemetry()
    expect(tel.isOptedIn()).toBe(false)
  })

  it("should opt out via env var (false)", async () => {
    process.env.AEGIS_TELEMETRY = "false"
    const tel = await getTelemetry()
    expect(tel.isOptedIn()).toBe(false)
  })

  it("should persist opt-in to file and read it back", async () => {
    const tel = await getTelemetry()
    tel.setOptedIn(true)
    expect(tel.isOptedIn()).toBe(true)

    // Re-read from a fresh import
    const tel2 = await getTelemetry()
    expect(tel2.isOptedIn()).toBe(true)
  })

  it("should persist opt-out to file and read it back", async () => {
    const tel = await getTelemetry()
    tel.setOptedIn(false)
    expect(tel.isOptedIn()).toBe(false)

    const tel2 = await getTelemetry()
    expect(tel2.isOptedIn()).toBe(false)
  })

  it("should prefer env var over file", async () => {
    writeOptInFile("0") // file says no
    process.env.AEGIS_TELEMETRY = "1" // env says yes

    const tel = await getTelemetry()
    expect(tel.isOptedIn()).toBe(true) // env wins
  })
})

describe("Telemetry — event recording", () => {
  beforeEach(async () => {
    process.env.AEGIS_TELEMETRY = "1"
    clearOptInFile()
    // Clean queue from previous tests
    const tel = await import("./index")
    await tel.flush()
  })

  afterEach(() => {
    delete process.env.AEGIS_TELEMETRY
    clearOptInFile()
  })

  it("should record a command event", async () => {
    const tel = await getTelemetry()
    tel.recordCommand("status", true, 150)

    const stats = tel.getTelemetryStats()
    expect(stats.queueSize).toBe(1)
    expect(stats.optedIn).toBe(true)
  })

  it("should not record events when opted out", async () => {
    delete process.env.AEGIS_TELEMETRY
    const tel = await getTelemetry()
    expect(tel.isOptedIn()).toBe(false)

    tel.recordCommand("status", true, 150)
    const stats = tel.getTelemetryStats()
    expect(stats.queueSize).toBe(0)
  })

  it("should record failure events", async () => {
    process.env.AEGIS_TELEMETRY = "1"
    const tel = await getTelemetry()
    tel.recordCommand("deploy", false, 5000)

    const stats = tel.getTelemetryStats()
    expect(stats.queueSize).toBe(1)
  })

  it("should cap queue at MAX_QUEUE_SIZE", async () => {
    process.env.AEGIS_TELEMETRY = "1"
    const tel = await getTelemetry()
    for (let i = 0; i < 150; i++) {
      tel.recordCommand(`cmd-${i}`, true, i)
    }
    const stats = tel.getTelemetryStats()
    expect(stats.queueSize).toBeLessThanOrEqual(100)
  })
})

describe("Telemetry — stats", () => {
  beforeEach(() => {
    delete process.env.AEGIS_TELEMETRY
    clearOptInFile()
  })

  afterEach(() => {
    clearOptInFile()
  })

  it("should return stats with endpoint", async () => {
    const tel = await getTelemetry()
    const stats = tel.getTelemetryStats()
    expect(stats.endpoint).toBe("https://telemetry.aegis.sh/v1/event")
    expect(typeof stats.optedIn).toBe("boolean")
    expect(typeof stats.queueSize).toBe("number")
  })

  it("should reflect custom endpoint from env", async () => {
    process.env.AEGIS_TELEMETRY_ENDPOINT = "http://localhost:9999/telemetry"
    const tel = await getTelemetry()
    const stats = tel.getTelemetryStats()
    expect(stats.endpoint).toBe("http://localhost:9999/telemetry")
    delete process.env.AEGIS_TELEMETRY_ENDPOINT
  })
})

describe("Telemetry — flush", () => {
  beforeEach(() => {
    process.env.AEGIS_TELEMETRY = "1"
    clearOptInFile()
  })

  afterEach(() => {
    delete process.env.AEGIS_TELEMETRY
    clearOptInFile()
  })

  it("should flush queue and clear it", async () => {
    const tel = await getTelemetry()
    tel.recordCommand("test", true, 100)
    expect(tel.getTelemetryStats().queueSize).toBeGreaterThan(0)

    await tel.flush()
    // After flush, the queue should be empty
    // (Note: flush may fail because there's no server, but the queue is cleared)
    expect(tel.getTelemetryStats().queueSize).toBe(0)
  })

  it("should not throw when flush fails", async () => {
    const tel = await getTelemetry()
    tel.recordCommand("test", true, 100)

    // Set a bad endpoint
    process.env.AEGIS_TELEMETRY_ENDPOINT = "http://localhost:1/invalid"

    // Should not throw
    await tel.flush()
    expect(tel.getTelemetryStats().queueSize).toBe(0)
  })
})
