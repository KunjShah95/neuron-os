#!/usr/bin/env bun
// ── CI Test Runner ───────────────────────────────────────────────────
// Runs all unit tests + TypeScript typecheck in sequence.
// Usage: bun run scripts/run-tests.ts
// Or:    bun run ci
// Or:    bun run test

let exitCode = 0

/** Resolve command array for the current platform (Windows needs .cmd). */
function resolveCmd(cmd: string[]): string[] {
  if (process.platform !== "win32") return cmd
  return cmd.map((part) => (part === "bun" ? "bun.cmd" : part))
}

function time<T>(_label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now()
  return fn().finally(() => {
    const elapsed = ((performance.now() - start) / 1000).toFixed(2)
    console.log(`  ── ${elapsed}s ──\n`)
  })
}

async function run(label: string, cmd: string[]): Promise<boolean> {
  console.log(`\n══════════════════════════════════════════════════════════`)
  console.log(`  ${label}`)
  console.log(`  $ ${cmd.join(" ")}`)
  console.log(`══════════════════════════════════════════════════════════\n`)

  try {
    const result = await time(label, () => Bun.spawn(resolveCmd(cmd), {
      stdio: ["inherit", "inherit", "inherit"],
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
  await run("Full-Stack Integration Tests", ["bun", "run", "src/test-fullstack-integration.ts"])

  // ── 1. Dashboard TUI Smoke Tests ──────────────────────────────────
  await run("Dashboard TUI Tests", ["bun", "run", "src/test-dashboard.ts"])

  // ── 2. Chat TUI Unit Tests ────────────────────────────────────────
  await run("Chat TUI Tests", ["bun", "run", "src/chat/test-chat.ts"])

  // ── 2.1 Chat Integration Tests ────────────────────────────────────
  await run("Chat Integration Tests", ["bun", "run", "src/chat/test-chat-integration.ts"])

  // ── 2.5 TUI Providers & Sessions Tests ───────────────────────────
  await run("TUI Providers/Sessions Tests", ["bun", "run", "src/test-tui-sessions.ts"])

  // ── 3. Agent Manager Unit Tests ───────────────────────────────────
  await run("Agent Manager Tests", ["bun", "run", "src/agent/test-manager.ts"])

  // ── 3.5 Agent Runtime Prompt / Skill Tests ───────────────────────
  await run("Agent Runtime Prompt Tests", ["bun", "run", "src/agent/test-runtime.ts"])

  // ── 3.6 Agent Lifecycle Integration Tests ────────────────────────
  await run("Agent Lifecycle Integration Tests", ["bun", "run", "src/agent/test-lifecycle-integration.ts"])

  // ── 3.6 AgentMemory Connector Tests ──────────────────────────────
  await run("AgentMemory Connector Tests", ["bun", "run", "src/memory/test-agentmemory.ts"])

  // ── 4. Sandbox Tests ───────────────────────────────────────────────
  await run("Sandbox Filesystem Tests", ["bun", "run", "src/sandbox/test-filesystem.ts"])
  await run("Sandbox Process Tests", ["bun", "run", "src/sandbox/test-process.ts"])
  await run("Sandbox Module Tests", ["bun", "run", "src/sandbox/test-index.ts"])

  // ── 5. Computer Use Tests ──────────────────────────────────────────
  await run("Computer Tool Tests", ["bun", "run", "src/tools/test-computer.ts"])

  // ── 6. Harness Tests ───────────────────────────────────────────────
  await run("Harness Runner Tests", ["bun", "run", "src/harness/test-runner.ts"])
  await run("Harness Reporter Tests", ["bun", "run", "src/harness/test-reporter.ts"])
  await run("Harness Module Tests", ["bun", "run", "src/harness/test-index.ts"])

  // ── 6.5 MCP Module Tests ──────────────────────────────────────────
  await run("MCP Module Tests", ["bun", "run", "src/mcp/test-mcp.ts"])

  // ── 6.6 Cron Module Tests ─────────────────────────────────────────
  await run("Cron Module Tests", ["bun", "run", "src/cron/test-cron.ts"])

  // ── 6.7 Vault Module Tests ────────────────────────────────────────
  await run("Vault Module Tests", ["bun", "run", "src/vault/test-vault.ts"])

  // ── 6.8 Agent Runtime Extended Tests ──────────────────────────────
  await run("Agent Runtime Extended Tests", ["bun", "run", "src/agent/test-runtime-extended.ts"])

  // ── 6.9 Session Persistence Smoke Tests ────────────────────────────
  await run("Session Persistence Smoke Tests", ["bun", "run", "src/memory/test-session-persistence.ts"])

  // ── 6.10 Skills CLI Tests ───────────────────────────────────────────
  await run("Skills CLI Tests", ["bun", "test", "src/modes/skills.test.ts"])

  // ── 6.11 Rate Limiter Tests ───────────────────────────────────────
  await run("Rate Limiter Tests", ["bun", "test", "src/api/rate-limiter.test.ts"])

  // ── 6.12 MCP HTTP Tests ───────────────────────────────────────────
  await run("MCP HTTP Tests", ["bun", "test", "src/mcp/mcp-http.test.ts"])

  // ── 6.13 Telemetry Tests ───────────────────────────────────────────
  await run("Telemetry Tests", ["bun", "test", "src/telemetry/telemetry.test.ts"])

  // ── 6.14 Dashboard Unit Tests ──────────────────────────────────────
  await run("Dashboard Unit Tests", ["bun", "run", "--cwd", "dashboard", "vitest", "run"])

  // ── 6.15 Self-Improving Runtime Tests ───────────────────────────────
  await run("Memory Embedding Tests", ["bun", "run", "src/memory/test-embedding.ts"])
  await run("RatchetRuntime Tests", ["bun", "run", "src/agent/test-ratchet.ts"])
  await run("Experience Retriever Tests", ["bun", "run", "src/experience/test-retrieval.ts"])
  await run("Bench History Tests", ["bun", "run", "src/bench/test-bench.ts"])

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
