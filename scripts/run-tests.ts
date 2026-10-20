#!/usr/bin/env bun
// ── CI Test Runner (Parallel) ──────────────────────────────────────────
// Runs all unit tests + TypeScript typecheck using parallel batches.
// Usage: bun run scripts/run-tests.ts
// Or:    bun run ci
// Or:    bun run test

const CONCURRENCY = 4   // Max parallel test batches
const PER_BATCH_TIMEOUT_MS = 300_000  // 5 min per batch

let exitCode = 0
const coverageMode = process.argv.includes("--coverage") || process.env.COVERAGE === "1"

interface TestBatch {
  label: string
  cmd: string[]
  cwd?: string
}

/** Build the list of test batches to run. */
function getBatches(): TestBatch[] {
  const batches: TestBatch[] = [
    // ── Core tests (fast, pure logic) ──────────────────────────────
    { label: "Session Store Tests", cmd: ["bun", "test", "src/session/store.test.ts"] },
    { label: "Session Manager Tests", cmd: ["bun", "test", "src/session/manager.test.ts"] },
    { label: "Plugin Manifest Tests", cmd: ["bun", "test", "src/plugin/manifest.test.ts"] },
    { label: "Plugin Signer Tests", cmd: ["bun", "test", "src/plugin/signer.test.ts"] },
    { label: "Plugin Registry Tests", cmd: ["bun", "test", "src/plugin/registry.test.ts"] },
    { label: "Plugin Hooks Tests", cmd: ["bun", "test", "src/plugin/hooks.test.ts"] },
    { label: "Toolsets Bundled Tests", cmd: ["bun", "test", "src/toolsets/bundled.test.ts"] },
    { label: "Toolsets Registry Tests", cmd: ["bun", "test", "src/toolsets/registry.test.ts"] },
    { label: "Toolsets Types Tests", cmd: ["bun", "test", "src/toolsets/types.test.ts"] },
    { label: "Docs Generator Tests", cmd: ["bun", "test", "scripts/__tests__/extract-commands.test.ts"] },
    { label: "Dream Engine Tests", cmd: ["bun", "test", "src/dream/engine.test.ts"] },
    { label: "Evolution Engine Tests", cmd: ["bun", "test", "src/evolve/engine.test.ts"] },
    { label: "Rate Limiter Tests", cmd: ["bun", "test", "src/api/rate-limiter.test.ts"] },
    { label: "Budget Guard Tests", cmd: ["bun", "test", "src/economy/budget-guard.test.ts"] },
    { label: "Cost Router Tests", cmd: ["bun", "test", "src/economy/cost-router.test.ts"] },
    { label: "Predictor Tests", cmd: ["bun", "test", "src/economy/predictor.test.ts"] },
    { label: "Preflight Tests", cmd: ["bun", "test", "src/economy/preflight.test.ts"] },
    { label: "Bench History Tests", cmd: ["bun", "test", "src/bench/bench.test.ts"] },

    // ── Sandbox & Tools tests ─────────────────────────────────────
    { label: "Sandbox Filesystem Tests", cmd: ["bun", "test", "src/sandbox/filesystem.test.ts"] },
    { label: "Sandbox Process Tests", cmd: ["bun", "test", "src/sandbox/process.test.ts"] },
    { label: "Sandbox Module Tests", cmd: ["bun", "test", "src/sandbox/index.test.ts"] },
    { label: "Computer Tool Tests", cmd: ["bun", "test", "src/tools/computer.test.ts"] },
    { label: "Gateway Tests", cmd: ["bun", "test", "src/adapters/gateway.test.ts"] },
    { label: "SMS Tests", cmd: ["bun", "test", "src/adapters/sms.test.ts"] },
    { label: "WhatsApp Tests", cmd: ["bun", "test", "src/adapters/whatsapp.test.ts"] },
    { label: "WS Gateway Tests", cmd: ["bun", "test", "src/adapters/ws-gateway.test.ts"] },

    // ── Harness tests ─────────────────────────────────────────────
    { label: "Harness Runner Tests", cmd: ["bun", "test", "src/harness/runner.test.ts"] },
    { label: "Harness Reporter Tests", cmd: ["bun", "test", "src/harness/reporter.test.ts"] },
    { label: "Harness Module Tests", cmd: ["bun", "test", "src/harness/index.test.ts"] },
    { label: "MCP Module Tests", cmd: ["bun", "test", "src/mcp/mcp.test.ts"] },
    { label: "MCP HTTP Tests", cmd: ["bun", "test", "src/mcp/mcp-http.test.ts"] },
    { label: "Cron Module Tests", cmd: ["bun", "test", "src/cron/cron.test.ts"] },
    { label: "Vault Module Tests", cmd: ["bun", "test", "src/vault/vault.test.ts"] },
    { label: "Memory Embedding Tests", cmd: ["bun", "test", "src/memory/embedding.test.ts"] },
    { label: "Experience Retriever Tests", cmd: ["bun", "test", "src/experience/retrieval.test.ts"] },
    { label: "RatchetRuntime Tests", cmd: ["bun", "test", "src/agent/ratchet.test.ts"] },

    // ── Session, Memory, Skills ───────────────────────────────────
    { label: "Session Persistence Tests", cmd: ["bun", "test", "src/memory/session-persistence.test.ts"] },
    { label: "Skills CLI Tests", cmd: ["bun", "test", "src/modes/skills.test.ts"] },
    { label: "Skills Integration Tests", cmd: ["bun", "test", "src/skills/skills-integration.test.ts"] },
    { label: "Telemetry Tests", cmd: ["bun", "test", "src/telemetry/telemetry.test.ts"] },

    // ── Agent tests ───────────────────────────────────────────────
    { label: "Agent Manager Tests", cmd: ["bun", "test", "src/agent/manager.test.ts"] },
    { label: "Agent Runtime Prompt Tests", cmd: ["bun", "test", "src/agent/runtime.test.ts"] },
    { label: "Agent Runtime Extended Tests", cmd: ["bun", "test", "src/agent/runtime-extended.test.ts"] },
    { label: "Agent Lifecycle Integration Tests", cmd: ["bun", "test", "src/agent/lifecycle-integration.test.ts"] },
    { label: "AgentMemory Connector Tests", cmd: ["bun", "test", "src/memory/agentmemory.test.ts"] },
    { label: "Mesh Orchestrator Tests", cmd: ["bun", "test", "src/mesh/orchestrator.test.ts"] },
    { label: "Docs Crawl Config Tests", cmd: ["bun", "test", "src/docs-crawl/config.test.ts"] },
    { label: "Docs Crawl Engine Tests", cmd: ["bun", "test", "src/docs-crawl/engine.test.ts"] },
    { label: "Docs Crawl Processor Tests", cmd: ["bun", "test", "src/docs-crawl/processor.test.ts"] },

    // ── Integration & smoke tests ──────────────────────────────────
    { label: "Full-Stack Integration Tests", cmd: ["bun", "test", "src/fullstack-integration.test.ts"] },
    { label: "Dashboard TUI Tests", cmd: ["bun", "test", "src/dashboard.test.ts"] },
    { label: "Chat TUI Tests", cmd: ["bun", "test", "src/chat/chat.test.ts"] },
    { label: "Chat Integration Tests", cmd: ["bun", "test", "src/chat/chat-integration.test.ts"] },
    { label: "TUI Providers/Sessions Tests", cmd: ["bun", "test", "src/tui-sessions.test.ts"] },
    { label: "CLI Smoke Tests", cmd: ["bun", "test", "src/cli/cli.smoke.test.ts"] },
    { label: "Providers Command Tests", cmd: ["bun", "test", "src/cli/commands/providers.test.ts"] },
  ]
  return batches
}

function resolveCmd(cmd: string[]): string[] {
  if (process.platform !== "win32") return cmd
  return cmd.map((part) => (part === "bun" ? "bun.cmd" : part))
}

async function runBatch(batch: TestBatch): Promise<boolean> {
  const effectiveCmd = [...batch.cmd]
  if (coverageMode && effectiveCmd[0] === "bun" && effectiveCmd[1] === "test") {
    effectiveCmd.splice(2, 0, "--coverage", "--coverage-reporter=lcov")
  }

  try {
    const proc = Bun.spawn(resolveCmd(effectiveCmd), {
      stdio: ["inherit", "inherit", "inherit"],
      cwd: batch.cwd,
      env: { ...process.env },
    })

    // Timeout guard
    const timer = setTimeout(() => {
      proc.kill(9)
      console.error(`  ⏱ ${batch.label} — TIMED OUT after ${PER_BATCH_TIMEOUT_MS / 1000}s`)
    }, PER_BATCH_TIMEOUT_MS)

    const result = await proc.exited
    clearTimeout(timer)

    if (result !== 0) {
      console.error(`❌ ${batch.label} — FAILED (exit code ${result})`)
      exitCode = 1
      return false
    }
    return true
  } catch (err) {
    console.error(`❌ ${batch.label} — ERROR: ${err}`)
    exitCode = 1
    return false
  }
}

async function main() {
  console.log(`\n  ╔══════════════════════════════════════════╗`)
  console.log(`  ║     AEGIS — CI Test Suite (Parallel)      ║`)
  console.log(`  ╚══════════════════════════════════════════╝\n`)
  console.log(`  Concurrency: ${CONCURRENCY} parallel batches, ${PER_BATCH_TIMEOUT_MS / 1000}s timeout per batch\n`)

  const batches = getBatches()
  const totalBatches = batches.length
  let passed = 0
  let failed = 0

  const startTime = performance.now()

  // Run in waves of CONCURRENCY batches
  for (let i = 0; i < totalBatches; i += CONCURRENCY) {
    const wave = batches.slice(i, i + CONCURRENCY)
    console.log(`\n  ── Wave ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(totalBatches / CONCURRENCY)} ──`)

    const results = await Promise.all(
      wave.map(async (batch) => {
        const label = batch.label
        const t0 = performance.now()
        console.log(`\n  ▶ ${label}`)
        const ok = await runBatch(batch)
        const elapsed = ((performance.now() - t0) / 1000).toFixed(2)
        if (ok) {
          console.log(`✅ ${label} — PASSED (${elapsed}s)`)
        } else {
          console.log(`❌ ${label} — FAILED (${elapsed}s)`)
        }
        return ok
      })
    )

    for (const ok of results) {
      if (ok) passed++
      else failed++
    }
  }

  const totalTime = ((performance.now() - startTime) / 1000).toFixed(2)

  // ── TypeScript Typecheck (always runs last, sequentially) ──────
  console.log(`\n  ── Typecheck ──`)
  const tcStart = performance.now()
  const tcProc = Bun.spawn(resolveCmd(["bun", "run", "--bun", "tsc", "--noEmit"]), {
    stdio: ["inherit", "inherit", "inherit"],
    env: { ...process.env },
  })
  const tcResult = await tcProc.exited
  const tcElapsed = ((performance.now() - tcStart) / 1000).toFixed(2)
  if (tcResult === 0) {
    console.log(`✅ TypeScript Typecheck — PASSED (${tcElapsed}s)`)
  } else {
    console.error(`❌ TypeScript Typecheck — FAILED (${tcElapsed}s)`)
    exitCode = 1
  }

  // ── Summary ─────────────────────────────────────────────────────
  console.log(`\n══════════════════════════════════════════════════════════`)
  if (exitCode === 0) {
    console.log(`  ✅ ALL ${passed}/${totalBatches} TEST BATCHES PASSED + TYPECHECK (${totalTime}s)`)
  } else {
    console.error(`  ❌ ${failed}/${totalBatches} BATCHES FAILED + TYPECHECK (${totalTime}s)`)
  }
  console.log(`══════════════════════════════════════════════════════════\n`)

  process.exit(exitCode)
}

main()
