/**
 * doctor — System health diagnostics command.
 *
 * Checks all components of the Aegis system and reports their status:
 *   - Node.js runtime version
 *   - AI provider configuration
 *   - Session store connectivity
 *   - Audit store state
 *   - Experience store state
 *   - Credential vault
 *   - MCP server connections
 *   - Docker availability (optional)
 *   - Disk space for data directories
 */

import type { Command } from "commander"
import { theme } from "../theme"
import { existsSync, statSync } from "node:fs"
import { join } from "node:path"
type CheckResult = { status: "pass" | "warn" | "fail"; message: string; detail?: string }

export function registerDoctor(program: Command) {
  program
    .command("doctor")
    .description("Run system health diagnostics")
    .option("--json", "JSON output")
    .option("--verbose", "Show detailed information for each check")
    .option("--fix", "Auto-fix issues where possible")
    .action(handleDoctor)
}

export async function handleDoctor(opts: { json?: boolean; verbose?: boolean; fix?: boolean } = {}) {
  const results: Record<string, CheckResult> = {}

  // ── 1. Runtime check ──────────────────────────────────────────────
  results.runtime = checkRuntime()

  // ── 2. AI provider config ─────────────────────────────────────────
  results.aiProvider = checkAiProvider()

  // ── 3. Environment ────────────────────────────────────────────────
  results.environment = checkEnvironment()

  // ── 4. Data directories ───────────────────────────────────────────
  results.dataDirs = checkDataDirectories()

  // ── 5. Vault ──────────────────────────────────────────────────────
  results.vault = await checkVault()

  // ── 6. Session store ──────────────────────────────────────────────
  results.sessions = await checkSessions()

  // ── 7. Audit store ────────────────────────────────────────────────
  results.audit = await checkAudit()

  // ── 8. Experience store ───────────────────────────────────────────
  results.experience = await checkExperience()

  // ── 9. MCP servers ────────────────────────────────────────────────
  results.mcpServers = await checkMCPServers()

  // ── 10. Docker (optional) ─────────────────────────────────────────
  results.docker = await checkDocker()

  // ── Summary ───────────────────────────────────────────────────────
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          version: await getVersionString(),
          checks: results,
          summary: summarizeResults(results),
        },
        null,
        2,
      ),
    )
    return
  }

  const summary = summarizeResults(results)

  console.log(`\n  ${theme.heading("Aegis System Doctor")}`)
  console.log(`  Version: ${theme.muted(await getVersionString())}`)
  console.log()

  for (const [name, check] of Object.entries(results)) {
    const label = name.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())
    const icon =
      check.status === "pass" ? theme.success("✓") : check.status === "warn" ? theme.warn("!") : theme.error("✗")
    const color = check.status === "pass" ? theme.dim : check.status === "warn" ? theme.warn : theme.error
    console.log(`  ${icon} ${color(label.padEnd(22))} ${check.message}`)
    if (opts.verbose && check.detail) {
      console.log(`  ${theme.muted(" ".repeat(24) + check.detail)}`)
    }
  }

  const passed2 = summary.passed
  const failed2 = summary.failed
  const warn2 = summary.warn

  if (failed2 === 0 && warn2 === 0) {
    console.log(`  ${theme.success(`✅ All ${passed2} checks passed`)}`)
  } else if (failed2 === 0) {
    console.log(`  ${theme.warn(`⚠️  ${passed2} passed, ${warn2} warnings`)}`)
  } else {
    console.log(`  ${theme.error(`❌ ${failed2} failed, ${warn2} warnings, ${passed2} passed`)}`)
    process.exitCode = 1
  }

  if (failed2 > 0 || warn2 > 0) {
    const noProvider = results.aiProvider?.status !== "pass"
    console.log()
    console.log(`  ${theme.dim("Fix issues:")}`)
    if (noProvider) {
      console.log(`  ${theme.muted("  aegis setup-keys       → configure AI provider API keys")}`)
    }
    console.log(`  ${theme.muted("  aegis doctor --fix     → auto-fix what's possible")}`)
    console.log(`  ${theme.muted("  aegis doctor --verbose → see full details")}`)
  }

  console.log()

  if (opts.fix) {
    await runAutoFix(results)
  }
}

// ── Individual checks ─────────────────────────────────────────────────

function checkRuntime(): CheckResult {
  const bun = process.versions.bun
  if (bun) {
    const parts = bun.split(".").map(Number)
    if ((parts[0] ?? 0) >= 1 && (parts[1] ?? 0) >= 3) {
      return { status: "pass", message: `Bun ${bun}`, detail: `Node.js compat: ${process.version}` }
    }
    return { status: "warn", message: `Bun ${bun} (older than 1.3.x)`, detail: "Consider upgrading Bun" }
  }
  return { status: "warn", message: `Node.js ${process.version}`, detail: "Bun is recommended for best performance" }
}

function checkAiProvider(): CheckResult {
  const keys = [
    { env: "ANTHROPIC_API_KEY", label: "Anthropic" },
    { env: "OPENAI_API_KEY", label: "OpenAI" },
    { env: "DEEPSEEK_API_KEY", label: "DeepSeek" },
    { env: "GEMINI_API_KEY", label: "Gemini" },
    { env: "GOOGLE_GENERATIVE_AI_API_KEY", label: "Google AI" },
    { env: "GROQ_API_KEY", label: "Groq" },
    { env: "OPENROUTER_API_KEY", label: "OpenRouter" },
    { env: "MISTRAL_API_KEY", label: "Mistral" },
    { env: "AZURE_OPENAI_API_KEY", label: "Azure OpenAI" },
    { env: "TOGETHERAI_API_KEY", label: "Together AI" },
    { env: "XAI_API_KEY", label: "xAI (Grok)" },
    { env: "COHERE_API_KEY", label: "Cohere" },
    { env: "PERPLEXITY_API_KEY", label: "Perplexity" },
    { env: "NVIDIA_API_KEY", label: "NVIDIA" },
    { env: "CUSTOM_API_KEY", label: "Custom" },
    { env: "AEGIS_AI_API_KEY", label: "Aegis AI" },
  ]

  const configured = keys.filter((k) => process.env[k.env])
  if (configured.length === 0) {
    return { status: "warn", message: "No AI provider configured", detail: "Run `aegis setup-keys` or set env vars" }
  }
  return {
    status: "pass",
    message: `${configured.length} provider(s) configured`,
    detail: configured.map((k) => k.label).join(", "),
  }
}

function checkEnvironment(): CheckResult {
  const issues: string[] = []
  const warnings: string[] = []

  // Check for common platform issues
  if (process.platform === "win32") {
    warnings.push("Windows detected — some features limited (Docker sandbox)")
  }

  // Check terminal capabilities
  if (!process.stdout.isTTY) {
    warnings.push("Non-TTY output — TUI modes unavailable")
  }

  if (issues.length === 0 && warnings.length === 0) {
    return {
      status: "pass",
      message: `${process.platform} ${process.arch}`,
      detail: `PID: ${process.pid}, Uptime: ${Math.floor(process.uptime())}s`,
    }
  }
  const msg = [...issues, ...warnings].join("; ")
  return { status: warnings.length > 0 ? "warn" : "fail", message: msg }
}

function checkDataDirectories(): CheckResult {
  const dirs = [
    { path: join(process.cwd(), "data"), name: "data/" },
    { path: join(process.cwd(), "data", "sessions"), name: "data/sessions/" },
    { path: join(process.cwd(), "data", "audit"), name: "data/audit/" },
    { path: join(process.cwd(), "data", "experience"), name: "data/experience/" },
  ]

  const results = dirs.map((d) => {
    const exists = existsSync(d.path)
    const size = exists ? statSync(d.path).size : 0
    return { ...d, exists, size }
  })

  const missing = results.filter((r) => !r.exists)
  if (missing.length > 0) {
    return {
      status: "warn",
      message: `${results.length - missing.length}/${results.length} exist`,
      detail: `Missing: ${missing.map((m) => m.name).join(", ")}`,
    }
  }
  return {
    status: "pass",
    message: `All ${results.length} directories OK`,
    detail: results.map((r) => `${r.name}`).join(", "),
  }
}

async function checkVault(): Promise<CheckResult> {
  try {
    const { credentialVault } = await import("../../vault")
    await credentialVault.initialize()
    const entries = await credentialVault.list()
    const filePath = credentialVault.vaultFilePath()
    if (entries.length === 0) {
      return { status: "pass", message: "Vault initialized (empty)", detail: filePath }
    }
    return { status: "pass", message: `${entries.length} credential(s) stored`, detail: filePath }
  } catch (err: unknown) {
    return { status: "fail", message: "Vault error", detail: err instanceof Error ? err.message : String(err) }
  }
}

async function checkSessions(): Promise<CheckResult> {
  try {
    const { sessionStore } = await import("../../memory/session-persistence")
    const stats = sessionStore.getStats()
    return {
      status: "pass",
      message: `${stats.totalSessions} session(s), ${stats.totalMessages} message(s)`,
      detail: `${stats.activeSessions} active`,
    }
  } catch (err: unknown) {
    return { status: "fail", message: "Session store unavailable", detail: err instanceof Error ? err.message : String(err) }
  }
}

async function checkAudit(): Promise<CheckResult> {
  try {
    const { auditStore } = await import("../../audit/store")
    const stats = auditStore.getStats()
    return {
      status: "pass",
      message: `${stats.totalEntries} entries, ${stats.totalSessions} session(s)`,
      detail: `Types: ${Object.keys(stats.byType).length}`,
    }
  } catch (err: unknown) {
    return { status: "fail", message: "Audit store unavailable", detail: err instanceof Error ? err.message : String(err) }
  }
}

async function checkExperience(): Promise<CheckResult> {
  try {
    const { experienceStore } = await import("../../experience/store")
    const stats = experienceStore.getStats()
    return {
      status: "pass",
      message: `${stats.totalExperiences} experience(s), ${stats.avgReward.toFixed(2)} avg reward`,
      detail: `${stats.successCount} success, ${stats.failureCount} failed`,
    }
  } catch (err: unknown) {
    return { status: "fail", message: "Experience store unavailable", detail: err instanceof Error ? err.message : String(err) }
  }
}

async function checkMCPServers(): Promise<CheckResult> {
  try {
    const { getMCPClients } = await import("../../mcp/client")
    const clients = getMCPClients()
    if (clients.length === 0) {
      return {
        status: "pass",
        message: "No MCP servers configured",
        detail: "Optional — configure in aegis.config.json",
      }
    }
    const connected = clients.filter((c) => c.enabled !== false).length
    return {
      status: "pass",
      message: `${connected} MCP server(s) configured`,
      detail: clients.map((c) => c.name).join(", "),
    }
  } catch {
    return { status: "pass", message: "MCP not configured", detail: "Optional feature" }
  }
}

async function checkDocker(): Promise<CheckResult> {
  try {
    const { DockerSandbox } = await import("../../sandbox/docker")
    const docker = new DockerSandbox({ enabled: true })
    const status = docker.status()
    if (status.active) {
      return { status: "pass", message: "Docker available", detail: "Sandbox can use Docker isolation" }
    }
    return { status: "pass", message: "Docker not required", detail: "Optional — set AEGIS_SANDBOX=docker to enable" }
  } catch {
    return { status: "pass", message: "Docker not available", detail: "Optional — improves sandbox isolation" }
  }
}

function summarizeResults(results: Record<string, CheckResult>) {
  let passed = 0
  let failed = 0
  let warn = 0
  for (const check of Object.values(results)) {
    if (check.status === "pass") passed++
    else if (check.status === "fail") failed++
    else warn++
  }
  return { passed, failed, warn }
}

async function getVersionString(): Promise<string> {
  try {
    const { getVersion } = await import("../../version")
    return getVersion()
  } catch {
    return "unknown"
  }
}

async function runAutoFix(results: Record<string, CheckResult>): Promise<void> {
  const { mkdirSync, existsSync } = await import("node:fs")
  const { homedir } = await import("node:os")
  const { resolve } = await import("node:path")

  console.log(`\n  ${theme.heading("Auto-Fix")}`)
  let fixed = 0

  const aegisDir = resolve(homedir(), ".aegis")
  if (!existsSync(aegisDir)) {
    try {
      mkdirSync(aegisDir, { recursive: true })
      console.log(`  ${theme.success("✓")} Created ${aegisDir}`)
      fixed++
    } catch {
      console.log(`  ${theme.error("✗")} Could not create ${aegisDir}`)
    }
  }

  if (results.aiProvider?.status !== "pass") {
    console.log(`  ${theme.info("→")} Launching API key setup...`)
    const { runSetupKeysWizard } = await import("./setup-keys")
    await runSetupKeysWizard()
    fixed++
  }

  if (fixed === 0) {
    console.log(`  ${theme.muted("No auto-fixable issues found.")}`)
  }
  console.log()
}
