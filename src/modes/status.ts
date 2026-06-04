import os from "os"
import { theme } from "../cli/theme"
import { showInfoScreen } from "./info-screen"
import { getVersion } from "../version"
import type { Mode } from "./types"

export const statusMode: Mode = {
  id: "status",
  name: "Status",
  description: "System status overview",

  async run() {
    const mem = process.memoryUsage()
    const memMB = (mem.rss / 1024 / 1024).toFixed(1)
    const cpus = os.cpus().length
    const uptime = Math.floor(process.uptime())
    const runtime = process.versions.bun
      ? `bun ${process.versions.bun}`
      : `node ${process.version}`

    const lines = [
      ``,
      `  ${theme.bold("Version:")}  ${getVersion()}`,
      `  ${theme.bold("Runtime:")}  ${runtime}`,
      `  ${theme.bold("Platform:")} ${process.platform} ${process.arch}`,
      `  ${theme.bold("Memory:")}   ${memMB} MB RSS`,
      `  ${theme.bold("CPUs:")}     ${cpus}`,
      `  ${theme.bold("Uptime:")}   ${uptime}s`,
      `  ${theme.bold("PID:")}      ${process.pid}`,
      ``,
      `  ${theme.muted("Press ↑↓ to scroll, Ctrl+Q to quit")}`,
    ]

    return showInfoScreen("System Status", lines)
  },
}
