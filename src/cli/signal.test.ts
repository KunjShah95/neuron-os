/**
 * Tests for signal handling and stdin cleanup utilities.
 *
 * Covers:
 *  - resetStdin() — removes stale readline symbols and raw mode
 *  - keepAlive() / registerShutdownHandlers() — SIGINT/SIGTERM registration
 *    and the returned unregister function
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"

// ── resetStdin ────────────────────────────────────────────────────────────

describe("resetStdin", () => {
  it("does not throw in a non-TTY environment", async () => {
    const { resetStdin } = await import("./stdin")
    expect(() => resetStdin()).not.toThrow()
  })

  it("removes stale readline event listeners", async () => {
    const { resetStdin } = await import("./stdin")
    // Attach a dummy listener to simulate clack leftovers
    const noop = () => {}
    process.stdin.on("data", noop)
    process.stdin.on("keypress", noop)

    expect(() => resetStdin()).not.toThrow()

    // After resetStdin the listeners we added should be gone
    expect(process.stdin.listeners("data").includes(noop)).toBe(false)
    expect(process.stdin.listeners("keypress").includes(noop)).toBe(false)
  })

  it("clears _keypressEventsEmitted from stdin", async () => {
    const { resetStdin } = await import("./stdin")
    const stdinAny = process.stdin as unknown as Record<string, unknown>
    stdinAny._keypressEventsEmitted = true
    resetStdin()
    expect(stdinAny._keypressEventsEmitted).toBeUndefined()
  })

  it("is idempotent — calling twice does not throw", async () => {
    const { resetStdin } = await import("./stdin")
    expect(() => {
      resetStdin()
      resetStdin()
    }).not.toThrow()
  })
})

// ── registerShutdownHandlers ──────────────────────────────────────────────

describe("registerShutdownHandlers", () => {
  it("registers SIGINT and SIGTERM listeners", async () => {
    const { registerShutdownHandlers } = await import("./keepAlive")
    const before = {
      sigint: process.listenerCount("SIGINT"),
      sigterm: process.listenerCount("SIGTERM"),
    }

    const unregister = registerShutdownHandlers(() => {}, { exit: false })
    expect(process.listenerCount("SIGINT")).toBe(before.sigint + 1)
    expect(process.listenerCount("SIGTERM")).toBe(before.sigterm + 1)

    unregister()
  })

  it("unregister removes the listeners", async () => {
    const { registerShutdownHandlers } = await import("./keepAlive")
    const before = {
      sigint: process.listenerCount("SIGINT"),
      sigterm: process.listenerCount("SIGTERM"),
    }

    const unregister = registerShutdownHandlers(() => {}, { exit: false })
    unregister()

    expect(process.listenerCount("SIGINT")).toBe(before.sigint)
    expect(process.listenerCount("SIGTERM")).toBe(before.sigterm)
  })

  it("calls cleanup when signal fires", async () => {
    const { registerShutdownHandlers } = await import("./keepAlive")
    let called = false
    const unregister = registerShutdownHandlers(() => {
      called = true
    }, { exit: false })

    process.emit("SIGINT")
    // Allow microtask queue to flush
    await new Promise<void>((r) => setTimeout(r, 0))
    expect(called).toBe(true)
    unregister()
  })

  it("calls cleanup on SIGTERM", async () => {
    const { registerShutdownHandlers } = await import("./keepAlive")
    let called = false
    const unregister = registerShutdownHandlers(() => {
      called = true
    }, { exit: false })

    process.emit("SIGTERM")
    await new Promise<void>((r) => setTimeout(r, 0))
    expect(called).toBe(true)
    unregister()
  })

  it("calls cleanup only once even if signal fires multiple times", async () => {
    const { registerShutdownHandlers } = await import("./keepAlive")
    let callCount = 0
    const unregister = registerShutdownHandlers(() => {
      callCount++
    }, { exit: false })

    process.emit("SIGINT")
    process.emit("SIGINT")
    await new Promise<void>((r) => setTimeout(r, 0))
    // shuttingDown guard prevents double execution
    expect(callCount).toBe(1)
    unregister()
  })

  it("supports async cleanup functions", async () => {
    const { registerShutdownHandlers } = await import("./keepAlive")
    let resolved = false
    const unregister = registerShutdownHandlers(async () => {
      await new Promise<void>((r) => setTimeout(r, 10))
      resolved = true
    }, { exit: false })

    process.emit("SIGTERM")
    await new Promise<void>((r) => setTimeout(r, 50))
    expect(resolved).toBe(true)
    unregister()
  })
})

// ── keepAlive ─────────────────────────────────────────────────────────────

describe("keepAlive", () => {
  it("returns a promise that never resolves on its own", async () => {
    const { keepAlive } = await import("./keepAlive")
    let resolved = false
    const before = {
      sigint: process.listenerCount("SIGINT"),
      sigterm: process.listenerCount("SIGTERM"),
    }

    const p = keepAlive(() => {})
    p.then(() => { resolved = true })

    // Wait a tick — the promise should NOT have resolved
    await new Promise<void>((r) => setTimeout(r, 20))
    expect(resolved).toBe(false)

    // Verify listeners were registered
    expect(process.listenerCount("SIGINT")).toBeGreaterThan(before.sigint)
    expect(process.listenerCount("SIGTERM")).toBeGreaterThan(before.sigterm)

    // Cleanup: emit SIGINT to trigger the handler (exit: false not set here,
    // but keepAlive calls process.exit — mock it temporarily)
    const origExit = process.exit.bind(process)
    ;(process as unknown as Record<string, unknown>).exit = () => {}
    process.emit("SIGINT")
    await new Promise<void>((r) => setTimeout(r, 20))
    ;(process as unknown as Record<string, unknown>).exit = origExit
  })
})
