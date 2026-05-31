#!/usr/bin/env bun
// ── CLI Smoke Test Runner ───────────────────────────────────────────────
// Runs every `aegis` CLI command and reports pass/fail automatically.
// Usage: bun run scripts/test-cli-smoke.ts
//
// Commands are categorised by behaviour:
//   instant   – runs and exits cleanly
//   help      – shows --help output  (exit code may be 0 or 1)
//   subcmd    – runs a subcommand that prints status/list
//   longrun   – starts a long-lived process (killed after capturing output)

import { spawn } from "node:child_process"

let exitCode = 0

interface TestCase {
  name: string
  args: string[]
  /** Max seconds to wait before killing the process.  Default 20. */
  timeout?: number
  /** Expected exit code.  `null` = skip check (e.g. long-running).  Default 0. */
  expectCode?: number | null
  /** Regex that must appear in stdout. */
  expectOutput?: RegExp
  /** If true the command is killed after `timeout` sec; its stdout so far is checked. */
  longRunning?: boolean
  /** If true, exit code checks are relaxed (Commander often exits 1 for --help). */
  helpCmd?: boolean
}

function runOne(test: TestCase): Promise<boolean> {
  return new Promise((resolve) => {
    const timeoutSec = test.timeout ?? 20
    const label = `aegis ${test.args.join(" ")}`
    const start = performance.now()

    let stdout = ""
    let stderr = ""
    let timedOut = false

    const proc = spawn("bun", ["run", "index.ts", ...test.args], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    })

    proc.stdout!.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8")
    })

    proc.stderr!.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8")
    })

    const timer = setTimeout(() => {
      timedOut = true
      proc.kill("SIGTERM")
    }, timeoutSec * 1000)

    proc.on("close", (code, signal) => {
      clearTimeout(timer)

      const elapsed = ((performance.now() - start) / 1000).toFixed(2)
      console.log(`    ── ${elapsed}s ──`)

      const failed: string[] = []
      const effectiveCode = code ?? (signal ? 128 + 15 : -1)

      // ── Long-running: kill was expected ──────────────────────────
      if (test.longRunning) {
        if (!timedOut) {
          failed.push("expected to be killed by timeout but exited on its own")
        }
        if (test.expectOutput && !test.expectOutput.test(stdout)) {
          failed.push(`expected output matching /${test.expectOutput.source}/ not found`)
          const preview = stdout.split("\n").slice(0, 10).join("\n")
          console.log(`    Got:\n${preview}`)
        }
      } else {
        // ── Exit code check ────────────────────────────────────────
        if (test.expectCode !== null) {
          const expected = test.expectCode ?? 0
          if (test.helpCmd) {
            if (effectiveCode !== 0 && effectiveCode !== 1) {
              failed.push(`exit code ${effectiveCode} (code=${code}, signal=${signal}) — expected 0 or 1 for help`)
            }
          } else if (effectiveCode !== expected) {
            failed.push(`exit code ${effectiveCode} (code=${code}, signal=${signal}) — expected ${expected}`)
          }
        }

        // ── Stderr noise ──────────────────────────────────────────
        const cleanStderr = stderr.split("\n").filter(l => {
          if (!l.trim()) return false
          if (l.includes("ExperimentalWarning")) return false
          if (l.includes("--experimental-loader")) return false
          if (l.includes("Warning")) return false
          return true
        })
        if (cleanStderr.length > 0) {
          console.log(`    ⚠ stderr: ${cleanStderr.join("; ").trim()}`)
        }

        // ── Output check ─────────────────────────────────────────
        if (test.expectOutput && !test.expectOutput.test(stdout)) {
          failed.push(`expected output matching /${test.expectOutput.source}/ not found`)
          const preview = stdout.split("\n").slice(0, 15).join("\n")
          console.log(`    Got:\n${preview}`)
        }
      }

      // ── Decide pass/fail ────────────────────────────────────────
      if (failed.length > 0) {
        console.log(`  ❌ ${label} — ${failed.join("; ")}`)
        exitCode = 1
        resolve(false)
      } else {
        console.log(`  ✅ ${label}`)
        resolve(true)
      }
    })

    proc.on("error", (err) => {
      clearTimeout(timer)
      const elapsed = ((performance.now() - start) / 1000).toFixed(2)
      console.log(`    ── ${elapsed}s ──`)
      console.log(`  ❌ ${label} — spawn error: ${err.message}`)
      exitCode = 1
      resolve(false)
    })
  })
}

// ── Helper factories ─────────────────────────────────────────────────────
// Timeouts are generous to account for Bun startup + Windows I/O latency.

function helpCmd(name: string, args: string[] = []): TestCase {
  return { name, args: [...args, "--help"], helpCmd: true, timeout: 20 }
}

function instant(name: string, args: string[] = [], expectOutput?: RegExp): TestCase {
  return { name, args, expectOutput, timeout: 25 }
}

function subcmd(name: string, args: string[], expectOutput?: RegExp): TestCase {
  return { name, args, expectOutput, timeout: 25 }
}

function longrun(name: string, args: string[], expectOutput: RegExp): TestCase {
  return { name, args, longRunning: true, expectOutput, timeout: 10 }
}

// ── Test Plan ────────────────────────────────────────────────────────────
// Each command group tests:
//   - The default/subcommand status view
//   - --help for every subcommand
//   - Key subcommands directly (list, types, etc.)

const tests: TestCase[] = [
  // ── 1. Top-level ───────────────────────────────────────────────────
  helpCmd("--help"),
  instant("wakeup", ["wakeup"], /AEGIS|commands|Commands/),
  instant("version", ["--version"]),
  instant("status", ["status"], /System|Runtime|Platform|Memory/),
  instant("status --json", ["status", "--json"], /"version"/),

  // ── 2. System commands (instant) ──────────────────────────────────
  instant("sandbox", ["sandbox"], /sandbox|disabled|active/i),
  instant("computer", ["computer"], /computer|available|registered/i),
  instant("dashboard", ["dashboard"], /System Overview|Runtime|Platform/),
  instant("dashboard --json", ["dashboard", "--json"], /"system"/),
  instant("skills", ["skills"], /Installed|skills\.sh/),

  // ── 3. Config group ────────────────────────────────────────────────
  helpCmd("config", ["config"]),
  subcmd("config list", ["config", "list"]),
  helpCmd("config set", ["config", "set"]),
  helpCmd("config get", ["config", "get"]),
  helpCmd("config delete", ["config", "delete"]),

  // ── 4. MCP group ──────────────────────────────────────────────────
  helpCmd("mcp", ["mcp"]),
  subcmd("mcp list", ["mcp", "list"]),
  helpCmd("mcp serve", ["mcp", "serve"]),
  subcmd("mcp connect", ["mcp", "connect"]),

  // ── 5. Memory group ───────────────────────────────────────────────
  helpCmd("memory", ["memory"]),
  subcmd("memory show", ["memory", "show"]),
  subcmd("memory facts", ["memory", "facts"]),
  subcmd("memory vector", ["memory", "vector"]),
  helpCmd("memory add", ["memory", "add"]),
  helpCmd("memory search", ["memory", "search"]),

  // ── 6. Cron group ─────────────────────────────────────────────────
  helpCmd("cron", ["cron"]),
  subcmd("cron list", ["cron", "list"]),
  subcmd("cron heartbeat", ["cron", "heartbeat"], /Heartbeat/i),
  helpCmd("cron add", ["cron", "add"]),
  helpCmd("cron remove", ["cron", "remove"]),

  // ── 7. Agent group ────────────────────────────────────────────────
  helpCmd("agent", ["agent"]),
  subcmd("agent types", ["agent", "types"], /PRIMARY|SUBAGENTS/i),
  subcmd("agent list", ["agent", "list"], /agents|No agents/i),
  helpCmd("agent spawn", ["agent", "spawn"]),
  helpCmd("agent kill", ["agent", "kill"]),
  helpCmd("agent logs", ["agent", "logs"]),
  helpCmd("agent inspect", ["agent", "inspect"]),

  // ── 8. AgentMemory group ──────────────────────────────────────────
  helpCmd("agentmemory", ["agentmemory"]),
  subcmd("agentmemory status", ["agentmemory", "status"], /agentmemory|not running/i),
  subcmd("agentmemory connect", ["agentmemory", "connect"], /Testing|Could not|Connected/i),

  // ── 9. Harness group ──────────────────────────────────────────────
  helpCmd("harness", ["harness"]),
  helpCmd("harness run", ["harness", "run"]),
  subcmd("harness report", ["harness", "report"], /results/i),

  // ── 10. Run / execution commands (help only — need arguments) ─────
  helpCmd("ask", ["ask"]),
  helpCmd("plan", ["plan"]),
  helpCmd("agent-run", ["agent-run"]),
  helpCmd("chat", ["chat"]),
  helpCmd("serve", ["serve"]),
  helpCmd("telegram", ["telegram"]),

  // ── 11. Interactive / long-running commands ───────────────────────
  longrun("setup", ["setup"], /Setup|setup|Security/),
]

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n  ╔════════════════════════════════════════════╗`)
  console.log(`  ║     AEGIS — CLI Smoke Test Suite           ║`)
  console.log(`  ╚════════════════════════════════════════════╝\n`)

  let passed = 0
  let failed = 0

  for (const test of tests) {
    console.log(`\n  ${"=".repeat(50)}`)
    const ok = await runOne(test)
    if (ok) passed++
    else failed++
  }

  // ── Summary ───────────────────────────────────────────────────────
  console.log(`\n  ${"=".repeat(50)}`)
  console.log(`\n  ${passed}/${tests.length} tests passed`)
  if (failed > 0) {
    console.error(`  ❌ ${failed} test(s) FAILED`)
  } else {
    console.log(`  ✅ ALL CLI SMOKE TESTS PASSED`)
  }
  console.log(`\n  ${"=".repeat(50)}\n`)

  process.exit(exitCode)
}

main()
