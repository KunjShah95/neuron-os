#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const ROOT = resolve(import.meta.dir, "..")
const COMMANDS_JSON = join(ROOT, "shared", "commands.json")
const ENTRY = join(ROOT, "index.ts")
const TIMEOUT_MS = 30_000

type Status = "ok" | "help_ok" | "fail" | "skip" | "timeout"

interface AuditResult {
  command: string
  test: string
  status: Status
  exitCode: number | null
  error?: string
  ms: number
}

const SAFE_PATTERNS = [
  /^list$/,
  /^status$/,
  /^stats$/,
  /^show$/,
  /^help$/,
  /^baseline$/,
  /^history$/,
  /^version$/,
  /^info$/,
  /^peers$/,
  /^inbox$/,
  /^reputation$/,
  /^discover$/,
  /^facts$/,
  /^vector$/,
  /^leaderboard$/,
  /^repos$/,
  /^config$/,
  /^disable$/,
  /^enable$/,
  /^total$/,
  /^models$/,
  /^sessions$/,
  /^report$/,
  /^dashboard$/,
  /^providers$/,
  /^findings$/,
  /^ratchet$/,
  /^calibrate$/,
  /^review$/,
  /^experiment$/,
  /^ci$/,
  /^validate$/,
  /^monitor$/,
  /^golden$/,
  /^metrics$/,
  /^health$/,
  /^preflight$/,
  /^estimate$/,
]

function isSafeSubcommand(name: string): boolean {
  const parts = name.split(" ")
  if (parts.length < 2) return false
  const sub = parts[parts.length - 1]!
  if (sub.includes("<") || sub.includes("[")) return false
  return SAFE_PATTERNS.some((p) => p.test(sub))
}

function bunBin(): string {
  if (process.versions.bun) return process.execPath
  return "bun"
}

function run(args: string[]): { exitCode: number | null; output: string; ms: number } {
  const start = Date.now()
  const quotedEntry = ENTRY.includes(" ") ? `"${ENTRY}"` : ENTRY
  const proc = spawnSync(`${bunBin()} ${quotedEntry} ${args.join(" ")}`, {
    cwd: ROOT,
    encoding: "utf-8",
    timeout: TIMEOUT_MS,
    env: { ...process.env, NO_COLOR: "1", CI: "1" },
    shell: true,
  })
  const ms = Date.now() - start
  const output = (proc.stdout ?? "") + (proc.stderr ?? "")
  return { exitCode: proc.status, output, ms }
}

function topLevelFromHelp(): string[] {
  const { output } = run(["--help"])
  const names: string[] = []
  let inCommands = false
  for (const line of output.split("\n")) {
    if (line.trim() === "Commands:") {
      inCommands = true
      continue
    }
    if (!inCommands) continue
    if (!line.startsWith("  ")) break
    const m = line.trim().match(/^([a-z][a-z0-9-]*)/)
    if (m) names.push(m[1]!)
  }
  return names
}

function main() {
  const data = JSON.parse(readFileSync(COMMANDS_JSON, "utf-8"))
  const commands: { name: string; parent?: string }[] = data.commands
  const results: AuditResult[] = []

  const versionRun = run(["--version"])
  results.push({
    command: "(root)",
    test: "--version",
    status: versionRun.exitCode === 0 ? "ok" : "fail",
    exitCode: versionRun.exitCode,
    error: versionRun.exitCode !== 0 ? versionRun.output.slice(0, 200) : undefined,
    ms: versionRun.ms,
  })

  const tops = topLevelFromHelp()
  for (const name of tops) {
    const helpRun = run([name, "--help"])
    const helpOk =
      helpRun.exitCode === 0 &&
      (helpRun.output.includes("Usage:") || helpRun.output.includes("Options:") || helpRun.output.includes("Commands:"))
    results.push({
      command: name,
      test: "--help",
      status: helpOk ? "help_ok" : helpRun.exitCode === null ? "timeout" : "fail",
      exitCode: helpRun.exitCode,
      error: !helpOk ? helpRun.output.slice(0, 300) : undefined,
      ms: helpRun.ms,
    })
  }

  const safeSubs = commands.filter((c) => isSafeSubcommand(c.name))
  for (const c of safeSubs) {
    const args = c.name.split(" ")
    const runResult = run(args)
    const ok = runResult.exitCode === 0
    results.push({
      command: c.name,
      test: "execute",
      status: ok ? "ok" : runResult.exitCode === null ? "timeout" : "fail",
      exitCode: runResult.exitCode,
      error: !ok ? runResult.output.slice(0, 300) : undefined,
      ms: runResult.ms,
    })
  }

  const outPath = join(ROOT, ".audit-commands.json")
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2))

  const helpFails = results.filter((r) => r.test === "--help" && r.status === "fail")
  const helpTimeouts = results.filter((r) => r.test === "--help" && r.status === "timeout")
  const execFails = results.filter((r) => r.test === "execute" && r.status === "fail")
  const execTimeouts = results.filter((r) => r.test === "execute" && r.status === "timeout")
  const execOk = results.filter((r) => r.test === "execute" && r.status === "ok")

  console.log(`\n=== Command Audit Summary ===`)
  console.log(`Top-level commands: ${tops.length}`)
  console.log(`--help OK: ${results.filter((r) => r.test === "--help" && r.status === "help_ok").length}`)
  console.log(`--help FAIL: ${helpFails.length}`)
  console.log(`--help TIMEOUT: ${helpTimeouts.length}`)
  console.log(`Safe subcommands tested: ${safeSubs.length}`)
  console.log(`Execute OK: ${execOk.length}`)
  console.log(`Execute FAIL: ${execFails.length}`)
  console.log(`Execute TIMEOUT: ${execTimeouts.length}`)
  console.log(`Full report: ${outPath}`)

  if (helpFails.length) {
    console.log(`\n--help FAILURES:`)
    for (const r of helpFails) console.log(`  ${r.command}: ${r.error?.split("\n")[0]}`)
  }
  if (execFails.length) {
    console.log(`\nEXECUTE FAILURES (first 30):`)
    for (const r of execFails.slice(0, 30)) console.log(`  ${r.command}: ${r.error?.split("\n")[0]}`)
  }
}

main()
