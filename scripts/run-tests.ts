#!/usr/bin/env bun
// ── CI Test Runner ───────────────────────────────────────────────────
// Runs all unit tests + TypeScript typecheck in sequence.
// Usage: bun run scripts/run-tests.ts
// Or:    bun run ci
// Or:    bun run test

let exitCode = 0
const coverageMode = process.argv.includes("--coverage") || process.env.COVERAGE === "1"

/** Resolve command array for the current platform (Windows needs .cmd). */
function resolveCmd(cmd: string[]): string[] {
  if (process.platform !== "win32") return cmd
  return cmd.map((part) => (part === "bun" ? "bun.cmd" : part))
}

/** Inject coverage flags into bun test commands when in coverage mode. */
function withCoverage(cmd: string[]): string[] {
  if (!coverageMode) return cmd
  if (cmd[0] !== "bun" || cmd[1] !== "test") return cmd
  const out = [...cmd]
  out.splice(2, 0, "--coverage", "--coverage-reporter=lcov")
  return out
}

function time<T>(_label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now()
  return fn().finally(() => {
    const elapsed = ((performance.now() - start) / 1000).toFixed(2)
    console.log(`  ── ${elapsed}s ──\n`)
  })
}

async function run(label: string, cmd: string[], options?: { cwd?: string }): Promise<boolean> {
  const effectiveCmd = withCoverage(cmd)
  console.log(`\n══════════════════════════════════════════════════════════`)
  console.log(`  ${label}`)
  console.log(`  $ ${effectiveCmd.join(" ")}`)
  if (options?.cwd) console.log(`  (cwd: ${options.cwd})`)
  console.log(`══════════════════════════════════════════════════════════\n`)

  try {
    const result = await time(label, () => Bun.spawn(resolveCmd(effectiveCmd), {
      stdio: ["inherit", "inherit", "inherit"],
      cwd: options?.cwd,
      env: { ...process.env },
    }).exited)

    if (result !== 0) {
      console.error(`❌ ${label} — FAILED (exit code ${result})`)
      exitCode = 1
      return false
    }
    console.log(`✅ ${label} — PASSED`)
    return true
  } catch (err) {
    console.error(`❌ ${label} — ERROR: ${err}`)
    exitCode = 1
    return false
  }
}

async function main() {
  console.log(`\n  ╔══════════════════════════════════════════╗`)
  console.log(`  ║     AEGIS — CI Test Suite                ║`)
  console.log(`  ╚══════════════════════════════════════════╝\n`)

  // ── 0. Full-Stack Integration Tests ───────────────────────────────
  await run("Full-Stack Integration Tests", ["bun", "test", "src/fullstack-integration.test.ts"])

  // ── 0.1 Docs Generator Tests ──────────────────────────────────────
  await run("Docs Generator Tests", ["bun", "test", "scripts/__tests__/extract-commands.test.ts"])

  // ── 1. Dashboard TUI Smoke Tests ──────────────────────────────────
  await run("Dashboard TUI Tests", ["bun", "test", "src/dashboard.test.ts"])

  // ── 2. Chat TUI Unit Tests ────────────────────────────────────────
  await run("Chat TUI Tests", ["bun", "test", "src/chat/chat.test.ts"])

  // ── 2.1 Chat Integration Tests ────────────────────────────────────
  await run("Chat Integration Tests", ["bun", "test", "src/chat/chat-integration.test.ts"])

  // ── 2.5 TUI Providers & Sessions Tests ───────────────────────────
  await run("TUI Providers/Sessions Tests", ["bun", "test", "src/tui-sessions.test.ts"])

  // ── 3. Agent Manager Unit Tests ───────────────────────────────────
  await run("Agent Manager Tests", ["bun", "test", "src/agent/manager.test.ts"])

  // ── 3.5 Agent Runtime Prompt / Skill Tests ───────────────────────
  await run("Agent Runtime Prompt Tests", ["bun", "test", "src/agent/runtime.test.ts"])

  // ── 3.6 Agent Lifecycle Integration Tests ────────────────────────
  await run("Agent Lifecycle Integration Tests", ["bun", "test", "src/agent/lifecycle-integration.test.ts"])

  // ── 3.6 AgentMemory Connector Tests ──────────────────────────────
  await run("AgentMemory Connector Tests", ["bun", "test", "src/memory/agentmemory.test.ts"])

  // ── 4. Sandbox Tests ───────────────────────────────────────────────
  await run("Sandbox Filesystem Tests", ["bun", "test", "src/sandbox/filesystem.test.ts"])
  await run("Sandbox Process Tests", ["bun", "test", "src/sandbox/process.test.ts"])
  await run("Sandbox Module Tests", ["bun", "test", "src/sandbox/index.test.ts"])

  // ── 5. Computer Use Tests ──────────────────────────────────────────
  await run("Computer Tool Tests", ["bun", "test", "src/tools/computer.test.ts"])

  // ── 6. Harness Tests ───────────────────────────────────────────────
  await run("Harness Runner Tests", ["bun", "test", "src/harness/runner.test.ts"])
  await run("Harness Reporter Tests", ["bun", "test", "src/harness/reporter.test.ts"])
  await run("Harness Module Tests", ["bun", "test", "src/harness/index.test.ts"])

  // ── 6.5 MCP Module Tests ──────────────────────────────────────────
  await run("MCP Module Tests", ["bun", "test", "src/mcp/mcp.test.ts"])

  // ── 6.6 Cron Module Tests ─────────────────────────────────────────
  await run("Cron Module Tests", ["bun", "test", "src/cron/cron.test.ts"])

  // ── 6.7 Vault Module Tests ────────────────────────────────────────
  await run("Vault Module Tests", ["bun", "test", "src/vault/vault.test.ts"])

  // ── 6.8 Agent Runtime Extended Tests ──────────────────────────────
  await run("Agent Runtime Extended Tests", ["bun", "test", "src/agent/runtime-extended.test.ts"])

  // ── 6.9 Session Persistence Tests ─────────────────────────────────
  await run("Session Persistence Tests", ["bun", "test", "src/memory/session-persistence.test.ts"])

  // ── 6.10 Skills CLI Tests ───────────────────────────────────────────
  await run("Skills CLI Tests", ["bun", "test", "src/modes/skills.test.ts"])

  // ── 6.11 Rate Limiter Tests ───────────────────────────────────────
  await run("Rate Limiter Tests", ["bun", "test", "src/api/rate-limiter.test.ts"])

  // ── 6.12 MCP HTTP Tests ───────────────────────────────────────────
  await run("MCP HTTP Tests", ["bun", "test", "src/mcp/mcp-http.test.ts"])

  // ── 6.13 Telemetry Tests ───────────────────────────────────────────
  await run("Telemetry Tests", ["bun", "test", "src/telemetry/telemetry.test.ts"])

  // ── 6.14 Dashboard Dependencies & Unit Tests ─────────────────────
  await run("Dashboard Dependencies Install", ["bun", "install", "--frozen-lockfile"], { cwd: "dashboard" })
  await run("Dashboard Unit Tests", ["bun", "run", "test"], { cwd: "dashboard" })

  // ── 6.15 Economy Tests ─────────────────────────────────────────────
  await run("Budget Guard Tests", ["bun", "test", "src/economy/budget-guard.test.ts"])
  await run("Cost Router Tests", ["bun", "test", "src/economy/cost-router.test.ts"])
  await run("Predictor Tests", ["bun", "test", "src/economy/predictor.test.ts"])
  await run("Preflight Tests", ["bun", "test", "src/economy/preflight.test.ts"])

  // ── 6.16 Dream Engine Tests ─────────────────────────────────────────
  await run("Dream Engine Tests", ["bun", "test", "src/dream/engine.test.ts"])

  // ── 6.17 Evolution Engine Tests ─────────────────────────────────────
  await run("Evolution Engine Tests", ["bun", "test", "src/evolve/engine.test.ts"])

  // ── 6.15 Self-Improving Runtime Tests ───────────────────────────────
  await run("Memory Embedding Tests", ["bun", "test", "src/memory/embedding.test.ts"])
  await run("RatchetRuntime Tests", ["bun", "test", "src/agent/ratchet.test.ts"])
  await run("Experience Retriever Tests", ["bun", "test", "src/experience/retrieval.test.ts"])
  await run("Bench History Tests", ["bun", "test", "src/bench/bench.test.ts"])

  // ── 6.18 Mesh Tests ─────────────────────────────────────────────────
  await run("Mesh Orchestrator Tests", ["bun", "test", "src/mesh/orchestrator.test.ts"])

  // ── 6.19 Adapter Tests ──────────────────────────────────────────────
  await run("Gateway Tests", ["bun", "test", "src/adapters/gateway.test.ts"])
  await run("SMS Tests", ["bun", "test", "src/adapters/sms.test.ts"])
  await run("WhatsApp Tests", ["bun", "test", "src/adapters/whatsapp.test.ts"])

  // ── 6.20 Docs Crawl Tests ───────────────────────────────────────────
  await run("Docs Crawl Config Tests", ["bun", "test", "src/docs-crawl/config.test.ts"])
  await run("Docs Crawl Engine Tests", ["bun", "test", "src/docs-crawl/engine.test.ts"])
  await run("Docs Crawl Processor Tests", ["bun", "test", "src/docs-crawl/processor.test.ts"])

  // ── 6.21 Toolsets Tests ─────────────────────────────────────────────
  await run("Toolsets Bundled Tests", ["bun", "test", "src/toolsets/bundled.test.ts"])
  await run("Toolsets Registry Tests", ["bun", "test", "src/toolsets/registry.test.ts"])
  await run("Toolsets Types Tests", ["bun", "test", "src/toolsets/types.test.ts"])

  // ── 6.16 Plugin Tests ─────────────────────────────────────────────
  await run("Plugin Manifest Tests", ["bun", "test", "src/plugin/manifest.test.ts"])
  await run("Plugin Signer Tests", ["bun", "test", "src/plugin/signer.test.ts"])
  await run("Plugin Registry Tests", ["bun", "test", "src/plugin/registry.test.ts"])
  await run("Plugin Hooks Tests", ["bun", "test", "src/plugin/hooks.test.ts"])

  // ── 6.17 WebSocket Gateway Tests ──────────────────────────────────
  await run("WS Gateway Tests", ["bun", "test", "src/adapters/ws-gateway.test.ts"])

  // ── 6.18 Session Manager Tests ────────────────────────────────────
  await run("Session Store Tests", ["bun", "test", "src/session/store.test.ts"])
  await run("Session Manager Tests", ["bun", "test", "src/session/manager.test.ts"])

  // ── 7. TypeScript Typecheck ───────────────────────────────────────
  await run("TypeScript Typecheck", ["bun", "run", "--bun", "tsc", "--noEmit"])

  // ── Summary ────────────────────────────────────────────────────────
  console.log(`\n══════════════════════════════════════════════════════════`)
  if (exitCode === 0) {
    console.log(`  ✅ ALL TESTS PASSED`)
  } else {
    console.error(`  ❌ SOME TESTS FAILED`)
  }
  console.log(`══════════════════════════════════════════════════════════\n`)

  process.exit(exitCode)
}

main()
