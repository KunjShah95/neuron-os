import type { Command } from "commander"
import os from "os"
import { theme } from "../theme"
import { showBanner } from "../banner"
import { agentManager } from "../../agent/manager"
import { getVersion } from "../../version"
import { existsSync, statSync } from "node:fs"

export function registerStatus(program: Command) {
  program
    .command("status")
    .alias("st")
    .description("System status overview — agents, memory, runtime")
    .option("--json", "JSON output")
    .option("--watch", "Live-updating status every 2s")
    .action(handleStatus)
}

function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  parts.push(`${s}s`)
  return parts.join(" ")
}

function getLogFileStats(): { path: string; sizeMB: string } | null {
  const logFile = process.env.AEGIS_LOG_FILE
  if (!logFile || !existsSync(logFile)) return null
  try {
    const st = statSync(logFile)
    return { path: logFile, sizeMB: (st.size / 1024 / 1024).toFixed(2) }
  } catch {
    return null
  }
}

function buildStatusReport() {
  const mem = process.memoryUsage()
  const memMB = (mem.rss / 1024 / 1024).toFixed(1)
  const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(1)
  const cpus = os.cpus().length
  const uptime = Math.floor(process.uptime())
  const runtime = process.versions.bun ? `bun ${process.versions.bun}` : `node ${process.version}`

  const agents = agentManager.list()
  const running = agents.filter((a) => a.status === "running")
  const logFileStats = getLogFileStats()

  return {
    version: getVersion(),
    runtime,
    platform: process.platform,
    arch: process.arch,
    memory: { rss: `${memMB} MB`, heap: `${heapMB} MB` },
    cpus,
    uptime: formatDuration(uptime),
    uptimeSeconds: uptime,
    pid: process.pid,
    agents: {
      total: agents.length,
      running: running.length,
      list: agents.map((a) => ({
        id: a.id,
        name: a.def.name,
        type: a.def.agentType || "default",
        status: a.status,
        uptime: a.spawnTime ? formatDuration(Math.floor((Date.now() - a.spawnTime) / 1000)) : "-",
      })),
    },
    logFile: logFileStats,
  }
}

function renderStatus(report: ReturnType<typeof buildStatusReport>) {
  const lines: string[] = []

  lines.push(theme.heading("System Status"))
  lines.push(`  ${theme.bold("Version:")}     ${theme.muted(report.version)}`)
  lines.push(`  ${theme.bold("Runtime:")}     ${theme.muted(report.runtime)}`)
  lines.push(`  ${theme.bold("Platform:")}    ${theme.muted(`${report.platform} ${report.arch}`)}`)
  lines.push(`  ${theme.bold("Memory:")}     ${theme.muted(`${report.memory.rss} RSS / ${report.memory.heap} heap`)}`)
  lines.push(`  ${theme.bold("CPUs:")}       ${theme.muted(String(report.cpus))}`)
  lines.push(`  ${theme.bold("Uptime:")}     ${theme.muted(report.uptime)}`)
  lines.push(`  ${theme.bold("PID:")}        ${theme.muted(String(report.pid))}`)
  lines.push("")

  // Agent section
  lines.push(theme.heading("Agents"))
  lines.push(`  ${theme.muted(`${report.agents.running} running / ${report.agents.total} total`)}`)
  if (report.agents.list.length > 0) {
    for (const a of report.agents.list) {
      const statusColor = a.status === "running" ? theme.success : a.status === "error" ? theme.error : theme.warn
      lines.push(
        `  ${theme.bold(a.name.padEnd(20))} ${statusColor(a.status.padEnd(10))} ${theme.muted(`${a.type} | up ${a.uptime}`)}`,
      )
    }
  } else {
    lines.push(`  ${theme.muted("  No agents running")}`)
  }
  lines.push("")

  // Log file
  if (report.logFile) {
    lines.push(theme.heading("Log File"))
    lines.push(`  ${theme.muted(`${report.logFile.path} (${report.logFile.sizeMB} MB)`)}`)
    lines.push("")
  }

  return lines.join("\n")
}

async function handleStatus(opts: { json?: boolean; watch?: boolean }) {
  if (opts.watch) {
    if (!process.stdout.isTTY) {
      console.error("--watch requires a TTY terminal")
      process.exit(1)
    }
    // Clear and re-render every 2 seconds
    const render = () => {
      const report = buildStatusReport()
      console.clear()
      console.log(renderStatus(report))
      console.log(theme.muted("\n  Watching — Ctrl+C to stop"))
    }
    render()
    setInterval(render, 2000)
    await new Promise(() => {}) // keep alive
    return
  }

  showBanner()
  const report = buildStatusReport()

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2))
    return
  }

  console.log("")
  console.log(renderStatus(report))
  console.log(theme.muted("  Use --watch for live-updating status"))
}
