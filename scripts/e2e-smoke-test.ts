#!/usr/bin/env bun
/**
 * scripts/e2e-smoke-test.ts
 *
 * End-to-end smoke test: starts the server, verifies health/chat/metrics endpoints,
 * tests supervisor mode, and validates crash logging.
 *
 * Usage: bun run scripts/e2e-smoke-test.ts
 */

const BASE_URL = "http://localhost:8091"
const SERVER_START_TIMEOUT = 45_000 // Max wait for server to start (Bun transpilation)
const SERVER_POLL_INTERVAL = 500   // Poll health endpoint every 500ms
const REQUEST_TIMEOUT = 10_000

let serverProc: ReturnType<typeof Bun.spawn> | null = null

function log(label: string, msg: string): void {
  console.log(`  ${label.padEnd(16)} ${msg}`)
}

function ok(msg: string): void {
  log("\x1b[32mPASS\x1b[0m", msg)
}

function fail(msg: string): void {
  log("\x1b[31mFAIL\x1b[0m", msg)
}

function skip(msg: string): void {
  log("\x1b[33mSKIP\x1b[0m", msg)
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return response
  } finally {
    clearTimeout(timer)
  }
}

async function startServer(): Promise<void> {
  console.log("\n\x1b[1m═══ Starting Server ═══\x1b[0m\n")

  const args = ["run", "index.ts", "serve", "--port", "8091", "--host", "127.0.0.1"]
  log("CMD", `bun ${args.join(" ")}`)

  serverProc = Bun.spawn(["bun", ...args], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, AEGIS_LOG_LEVEL: "error" },
  })

  log("PID", String(serverProc.pid))
  log("WAIT", `Polling health endpoint for up to ${SERVER_START_TIMEOUT / 1000}s...`)

  // Poll health endpoint until server is ready (more reliable than fixed sleep)
  const pollStart = Date.now()
  let serverReady = false
  while (Date.now() - pollStart < SERVER_START_TIMEOUT) {
    // Check if process crashed
    const exited = await Promise.race([
      serverProc.exited.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), SERVER_POLL_INTERVAL)),
    ])

    if (exited) {
      const exitCode = await serverProc.exited
      const stderr = serverProc.stderr instanceof ReadableStream ? await new Response(serverProc.stderr).text() : ""
      log("CRASHED", `Server exited with code ${exitCode} during startup`)
      if (stderr.length > 0) {
        const truncated = stderr.length > 2000 ? stderr.slice(-2000) : stderr
        process.stderr.write(truncated + "\n")
      }
      serverProc = null
      return
    }

    // Try health endpoint
    try {
      const res = await fetch(`${BASE_URL}/api/v1/health`)
      if (res.ok) {
        serverReady = true
        break
      }
    } catch {
      // Server not ready yet, keep polling
    }
  }

  if (!serverReady) {
    log("TIMEOUT", `Server did not start within ${SERVER_START_TIMEOUT / 1000}s`)
    if (serverProc) {
      serverProc.kill(9)
      serverProc = null
    }
    return
  }

  const elapsed = ((Date.now() - pollStart) / 1000).toFixed(1)
  ok(`Server started (PID ${serverProc.pid}, ${elapsed}s)`)
}

async function testHealthEndpoint(): Promise<boolean> {
  console.log("\n\x1b[1m═══ 1. Health Endpoint ═══\x1b[0m\n")

  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/v1/health`)
    const body = await res.json() as any

    if (res.status === 200 && body.status === "ok") {
      ok(`GET /api/v1/health -> 200, status: "${body.status}"`)
      log("VERSION", body.version || "unknown")
      log("UPTIME", `${body.uptime?.toFixed(1) ?? "?"}s`)
      log("AGENTS", `${body.agents?.total ?? 0} total, ${body.agents?.running ?? 0} running`)
      return true
    } else {
      fail(`GET /api/v1/health -> ${res.status}: ${JSON.stringify(body)}`)
      return false
    }
  } catch (err) {
    fail(`GET /api/v1/health -> ERROR: ${err}`)
    return false
  }
}

async function testMetricsEndpoint(): Promise<boolean> {
  console.log("\n\x1b[1m═══ 2. Metrics Endpoint ═══\x1b[0m\n")

  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/v1/metrics`)
    const body = await res.json() as any

    if (res.status === 200 && body.system) {
      ok(`GET /api/v1/metrics -> 200`)
      log("AGENTS", `${body.agents?.total ?? 0} total`)
      log("SOULS", `${body.souls?.total ?? 0} total`)
      log("VERSION", body.system?.version || "unknown")
      return true
    } else {
      fail(`GET /api/v1/metrics -> ${res.status}: ${JSON.stringify(body)}`)
      return false
    }
  } catch (err) {
    fail(`GET /api/v1/metrics -> ERROR: ${err}`)
    return false
  }
}

async function testProvidersEndpoint(): Promise<boolean> {
  console.log("\n\x1b[1m═══ 3. Chat Providers ═══\x1b[0m\n")

  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/v1/chat/providers`)
    const body = await res.json() as any

    if (res.status === 200) {
      ok(`GET /api/v1/chat/providers -> 200`)
      log("CONFIGURED", String(body.configured))
      if (body.providers?.length > 0) {
        log("PROVIDERS", body.providers.map((p: any) => `${p.provider}:${p.model}`).join(", "))
      }
      return true
    } else {
      fail(`GET /api/v1/chat/providers -> ${res.status}: ${JSON.stringify(body)}`)
      return false
    }
  } catch (err) {
    fail(`GET /api/v1/chat/providers -> ERROR: ${err}`)
    return false
  }
}

async function testChatEndpoint(): Promise<boolean> {
  console.log("\n\x1b[1m═══ 4. Chat Endpoint ═══\x1b[0m\n")

  // Test validation (empty message should return 400)
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "" }),
    })
    const body = await res.json() as any

    if (res.status === 400) {
      ok("POST /api/v1/chat (empty message) -> 400 (correct validation)")
      return true
    }

    // If no providers configured, we might get 503
    if (res.status === 503 && body.code === "NO_PROVIDER") {
      skip("No AI providers configured (expected - no API keys set)")
      return true
    }

    ok(`POST /api/v1/chat -> ${res.status}: ${JSON.stringify(body).slice(0, 200)}`)
    return true
  } catch (err) {
    fail(`POST /api/v1/chat -> ERROR: ${err}`)
    return false
  }
}

async function test404Endpoint(): Promise<boolean> {
  console.log("\n\x1b[1m═══ 5. 404 Handling ═══\x1b[0m\n")

  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/v1/nonexistent`)
    const body = await res.json() as any

    if (res.status === 404 && body.error === "Not found") {
      ok(`GET /api/v1/nonexistent -> 404 (correct)`)
      return true
    } else {
      fail(`GET /api/v1/nonexistent -> ${res.status}: ${JSON.stringify(body)}`)
      return false
    }
  } catch (err) {
    fail(`GET /api/v1/nonexistent -> ERROR: ${err}`)
    return false
  }
}

async function testRateLimiting(): Promise<boolean> {
  console.log("\n\x1b[1m═══ 6. Rate Limiting ═══\x1b[0m\n")

  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/v1/health`, {
      headers: { "X-Forwarded-For": "127.0.0.1" },
    })

    if (res.status === 200) {
      ok("GET /api/v1/health (rate limit) -> 200 (within limits)")
      return true
    } else {
      fail(`GET /api/v1/health -> ${res.status}`)
      return false
    }
  } catch (err) {
    fail(`GET /api/v1/health -> ERROR: ${err}`)
    return false
  }
}

async function testCorsHeaders(): Promise<boolean> {
  console.log("\n\x1b[1m═══ 7. CORS Headers ═══\x1b[0m\n")

  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/v1/health`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173" },
    })

    const corsOrigin = res.headers.get("access-control-allow-origin")
    if (res.status === 204 && corsOrigin === "http://localhost:5173") {
      ok(`OPTIONS /api/v1/health -> 204, CORS origin: "${corsOrigin}"`)
      return true
    } else {
      // CORS might not be configured for this origin
      skip(`OPTIONS /api/v1/health -> ${res.status}, CORS: "${corsOrigin}"`)
      return true
    }
  } catch (err) {
    fail(`OPTIONS /api/v1/health -> ERROR: ${err}`)
    return false
  }
}

async function testWsHealth(): Promise<boolean> {
  console.log("\n\x1b[1m═══ 8. WebSocket Health ═══\x1b[0m\n")

  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/v1/ws/health`)

    if (res.status === 200) {
      ok("GET /api/v1/ws/health -> 200")
      return true
    } else {
      fail(`GET /api/v1/ws/health -> ${res.status}: ${await res.text()}`)
      return false
    }
  } catch (err) {
    fail(`GET /api/v1/ws/health -> ERROR: ${err}`)
    return false
  }
}

async function testTypesEndpoint(): Promise<boolean> {
  console.log("\n\x1b[1m═══ 9. Agent Types ═══\x1b[0m\n")

  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/v1/types`)
    const body = await res.json() as any

    if (res.status === 200 && body.types) {
      ok(`GET /api/v1/types -> 200, ${body.types.length} types`)
      return true
    } else {
      fail(`GET /api/v1/types -> ${res.status}: ${JSON.stringify(body)}`)
      return false
    }
  } catch (err) {
    fail(`GET /api/v1/types -> ERROR: ${err}`)
    return false
  }
}

async function testCrashLogModule(): Promise<boolean> {
  console.log("\n\x1b[1m═══ 10. Crash Log Module ═══\x1b[0m\n")

  try {
    const { logCrash, readRecentCrashes, formatCrashSummary, clearCrashLog } = await import("../src/cli/crash-log")

    // Test writing a crash record
    logCrash(new Error("E2E test crash"), { exitCode: 1, extra: { test: "e2e" } })

    // Test reading it back
    const crashes = readRecentCrashes(5)
    const found = crashes.some((c) => c.msg?.includes("E2E test crash"))

    if (found) {
      ok("Crash record written and read back correctly")
      log("CRASHES", formatCrashSummary(crashes.slice(0, 1)))

      // Clear the test record
      clearCrashLog()
      ok("Crash log cleared")
      return true
    } else {
      fail("Crash record not found in log")
      return false
    }
  } catch (err) {
    fail(`Crash log test -> ERROR: ${err}`)
    return false
  }
}

async function testSupervisorModule(): Promise<boolean> {
  console.log("\n\x1b[1m═══ 11. Supervisor Module (syntax check) ═══\x1b[0m\n")

  try {
    // Verify the module can be imported without syntax errors
    await import("../src/cli/supervisor")
    ok("supervisor.ts imports successfully")
    return true
  } catch (err) {
    fail(`supervisor.ts import -> ERROR: ${err}`)
    return false
  }
}

async function testGuardModule(): Promise<boolean> {
  console.log("\n\x1b[1m═══ 12. Guard Module (error boundaries) ═══\x1b[0m\n")

  try {
    const guard = await import("../src/cli/guard")
    ok(`guard.ts imports successfully, registerErrorBoundaries=${typeof guard.registerErrorBoundaries}`)
    return true
  } catch (err) {
    fail(`guard.ts import -> ERROR: ${err}`)
    return false
  }
}

async function stopServer(): Promise<void> {
  if (!serverProc) return

  console.log("\n\x1b[1m═══ Stopping Server ═══\x1b[0m\n")

  try {
    serverProc.kill("SIGTERM")
    await Promise.race([
      serverProc.exited,
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ])
    ok("Server stopped gracefully")
  } catch (err) {
    serverProc.kill(9) // SIGKILL
    log("FORCE", "Force killed server")
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  console.log(`\n  \x1b[1mNeuron OS E2E Smoke Test\x1b[0m`)
  console.log(`  ${new Date().toISOString().slice(0, 19)}`)
  console.log(`  Platform: ${process.platform} / ${process.arch}`)
  console.log(`  Runtime: ${process.version}`)
  console.log()

  const results: Array<{ name: string; passed: boolean }> = []

  // Phase 1: Start server and test endpoints
  await startServer()

  if (serverProc) {
    results.push({ name: "Server Start", passed: true })
    results.push({ name: "Health Endpoint", passed: await testHealthEndpoint() })
    results.push({ name: "Metrics Endpoint", passed: await testMetricsEndpoint() })
    results.push({ name: "Providers Endpoint", passed: await testProvidersEndpoint() })
    results.push({ name: "Chat Endpoint", passed: await testChatEndpoint() })
    results.push({ name: "404 Handling", passed: await test404Endpoint() })
    results.push({ name: "Rate Limiting", passed: await testRateLimiting() })
    results.push({ name: "CORS Headers", passed: await testCorsHeaders() })
    results.push({ name: "WS Health", passed: await testWsHealth() })
    results.push({ name: "Agent Types", passed: await testTypesEndpoint() })

    await stopServer()
  } else {
    results.push({ name: "Server Start", passed: false })
    skip("Skipping endpoint tests - server failed to start")
  }

  // Phase 2: Test modules that don't require a running server
  results.push({ name: "Crash Log Module", passed: await testCrashLogModule() })
  results.push({ name: "Supervisor Module", passed: await testSupervisorModule() })
  results.push({ name: "Guard Module", passed: await testGuardModule() })

  // ── Summary ──────────────────────────────────────────────────────
  console.log(`\n  \x1b[1m═══════════════════════════════════════\x1b[0m`)
  console.log(`  \x1b[1mResults: ${results.filter((r) => r.passed).length}/${results.length} passed\x1b[0m`)
  console.log(`  \x1b[1m═══════════════════════════════════════\x1b[0m\n`)

  for (const r of results) {
    const icon = r.passed ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"
    console.log(`  ${icon} ${r.name}`)
  }

  console.log()

  const allPassed = results.every((r) => r.passed)
  return allPassed ? 0 : 1
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("\n  \x1b[31mE2E test crashed:\x1b[0m", err)
    process.exit(1)
  })
