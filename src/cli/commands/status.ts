import type { Command } from "commander"
import os from "os"
import { theme } from "../theme"
import { showBanner } from "../banner"

export function registerStatus(program: Command) {
  program
    .command("status")
    .alias("st")
    .description("Quick system status overview")
    .option("--json", "JSON output")
    .action(handleStatus)
}

async function handleStatus(opts: { json?: boolean }) {
  showBanner()

  const mem = process.memoryUsage()
  const memMB = (mem.rss / 1024 / 1024).toFixed(1)
  const cpus = os.cpus().length
  const uptime = Math.floor(process.uptime())
  const runtime = process.versions.bun
    ? `bun ${process.versions.bun}`
    : `node ${process.version}`

  if (opts.json) {
    console.log(JSON.stringify({
      version: "0.1.0",
      runtime,
      platform: process.platform,
      arch: process.arch,
      memory: `${memMB} MB RSS`,
      cpus,
      uptime: `${uptime}s`,
      pid: process.pid,
    }, null, 2))
    return
  }

  const lines = [
    theme.heading("System Status"),
    `${theme.bold("Version:")}  ${theme.muted("0.1.0")}`,
    `${theme.bold("Runtime:")}  ${theme.muted(runtime)}`,
    `${theme.bold("Platform:")} ${theme.muted(`${process.platform} ${process.arch}`)}`,
    `${theme.bold("Memory:")}  ${theme.muted(`${memMB} MB RSS`)}`,
    `${theme.bold("CPUs:")}    ${theme.muted(String(cpus))}`,
    `${theme.bold("Uptime:")}  ${theme.muted(`${uptime}s`)}`,
    `${theme.bold("PID:")}     ${theme.muted(String(process.pid))}`,
  ]
  console.log(lines.join("\n"))
}
