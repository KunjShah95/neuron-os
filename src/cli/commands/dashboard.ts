import type { Command } from "commander"
import os from "os"
import { theme } from "../theme"
import { showBanner } from "../banner"
import { toolRegistry } from "../../tools"
import { agentManager } from "../../agent/manager"
import { FilesystemSandbox, ProcessSandbox, DockerSandbox } from "../../sandbox"
import { listActiveJobs } from "../../cron"

export function registerDashboard(program: Command) {
  program
    .command("dashboard")
    .alias("dash")
    .description("Show live system overview")
    .option("--json", "JSON output")
    .action(handleDashboard)
}

async function handleDashboard(opts: { json?: boolean }) {
  showBanner()

  // Fetch data — tools are auto-registered on import
  const agents = agentManager.list()
  const runningAgents = agents.filter(a => a.status === "running")
  const stoppedAgents = agents.filter(a => a.status === "stopped")
  const errorAgents = agents.filter(a => a.status === "error")

  const fsBox = new FilesystemSandbox({ enabled: process.env.AEGIS_SANDBOX !== "none" })
  const procBox = new ProcessSandbox({ enabled: process.env.AEGIS_SANDBOX === "process" })
  const dockerBox = new DockerSandbox({ enabled: process.env.AEGIS_SANDBOX === "docker" })
  const activeSandbox = dockerBox.status().active ? dockerBox : procBox.status().active ? procBox : fsBox.status().active ? fsBox : null
  const sandboxStatus = activeSandbox?.status()

  const cronJobs = await listActiveJobs()

  const mem = process.memoryUsage()
  const memMB = (mem.rss / 1024 / 1024).toFixed(1)
  const uptime = Math.floor(process.uptime())
  const runtime = process.versions.bun
    ? `bun ${process.versions.bun}`
    : `node ${process.version}`

  const computerTool = toolRegistry.get("computer")

  if (opts.json) {
    console.log(JSON.stringify({
      system: {
        runtime,
        platform: process.platform,
        arch: process.arch,
        memory: `${memMB} MB RSS`,
        cpus: os.cpus().length,
        uptime: `${uptime}s`,
        pid: process.pid,
      },
      agents: {
        total: agents.length,
        running: runningAgents.length,
        stopped: stoppedAgents.length,
        error: errorAgents.length,
      },
      sandbox: sandboxStatus ? { type: sandboxStatus.type, active: sandboxStatus.active } : null,
      computer: computerTool !== undefined,
      cron: cronJobs.length,
    }, null, 2))
    return
  }

  // ── Header ──
  console.log()
  console.log(`  ${theme.heading("System Overview")}`)
  console.log()

  // ── System Info ──
  console.log(`  ${theme.bold("Runtime:")}   ${theme.muted(runtime)}`)
  console.log(`  ${theme.bold("Platform:")}  ${theme.muted(`${process.platform} ${process.arch}`)}`)
  console.log(`  ${theme.bold("Memory:")}    ${theme.muted(`${memMB} MB RSS`)}`)
  console.log(`  ${theme.bold("CPUs:")}      ${theme.muted(String(os.cpus().length))}`)
  console.log(`  ${theme.bold("Uptime:")}    ${theme.muted(`${uptime}s`)}`)
  console.log(`  ${theme.bold("PID:")}       ${theme.muted(String(process.pid))}`)
  console.log()

  // ── Agents ──
  console.log(`  ${theme.heading("Agents")}`)
  if (agents.length === 0) {
    console.log(`  ${theme.muted("  No agents running.")}`)
  } else {
    if (runningAgents.length > 0) console.log(`  ${theme.success("●")} ${runningAgents.length} running`)
    if (stoppedAgents.length > 0) console.log(`  ${theme.muted("●")} ${stoppedAgents.length} stopped`)
    if (errorAgents.length > 0) console.log(`  ${theme.error("●")} ${errorAgents.length} errors`)
    console.log(`  ${theme.muted(`  Total: ${agents.length} agents`)}`)
  }
  console.log()

  // ── Computer ──
  console.log(`  ${theme.heading("Computer Use")}`)
  console.log(`  ${computerTool ? theme.success("● Available") : theme.warn("○ Not registered")}`)
  console.log()

  // ── Sandbox ──
  console.log(`  ${theme.heading("Sandbox")}`)
  if (sandboxStatus?.active) {
    console.log(`  ${theme.success(`● ${sandboxStatus.type} active`)}`)
    for (const info of sandboxStatus.info) {
      console.log(`  ${theme.muted(`  ${info}`)}`)
    }
  } else {
    console.log(`  ${theme.warn("○ Disabled")}`)
    console.log(`  ${theme.muted("  Set AEGIS_SANDBOX=filesystem|process|docker to enable")}`)
  }
  console.log()

  // ── Cron ──
  console.log(`  ${theme.heading("Scheduled Jobs")}`)
  if (cronJobs.length === 0) {
    console.log(`  ${theme.muted("  No cron jobs scheduled.")}`)
  } else {
    for (const job of cronJobs) {
      const typeInfo = job.agentType ? theme.dim(` [${job.agentType}]`) : ""
      console.log(`  ${theme.accent(job.name.padEnd(20))} every ${theme.bold(job.schedule)}${typeInfo}`)
    }
  }
  console.log()

  console.log(`  ${theme.muted("Use --json for JSON output")}`)
  console.log(`  ${theme.muted("Run: aegis status for quick system status")}`)
  console.log()
}
