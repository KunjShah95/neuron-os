import { theme } from "../cli/theme"
import { showInfoScreen } from "./info-screen"
import { FilesystemSandbox, ProcessSandbox, DockerSandbox, type Sandbox } from "../sandbox"
import type { Mode } from "./types"

const fsBox = new FilesystemSandbox({ enabled: process.env.AEGIS_SANDBOX !== "none" })
const procBox = new ProcessSandbox({ enabled: process.env.AEGIS_SANDBOX === "process" })
const dockerBox = new DockerSandbox({ enabled: process.env.AEGIS_SANDBOX === "docker" })

function activeSandbox(): Sandbox | null {
  if (dockerBox.status().active) return dockerBox
  if (procBox.status().active) return procBox
  if (fsBox.status().active) return fsBox
  return null
}

export const sandboxMode: Mode = {
  id: "sandbox",
  name: "Sandbox",
  description: "Sandbox status and controls",

  async run() {
    const box = activeSandbox()
    const status = box?.status()
    const lines: string[] = [""]

    if (!status || !status.active) {
      lines.push(`  ${theme.warn("Sandbox is disabled")}`)
      lines.push("")
      lines.push(`  ${theme.muted("Set AEGIS_SANDBOX=filesystem|process|docker to enable")}`)
    } else {
      lines.push(`  ${theme.success(`● ${status.type} sandbox active`)}`)
      lines.push("")
      lines.push(`  ${theme.heading("Details")}`)
      for (const info of status.info) {
        lines.push(`  ${theme.dim(info)}`)
      }
    }
    lines.push("")
    lines.push(`  ${theme.muted("Sandbox type is set via AEGIS_SANDBOX env var")}`)
    lines.push(`  ${theme.muted("  none       — no sandbox")}`)
    lines.push(`  ${theme.muted("  filesystem — path-restricted file access (default)")}`)
    lines.push(`  ${theme.muted("  process    — command whitelist + tempdir")}`)
    lines.push(`  ${theme.muted("  docker     — full container isolation (optional)")}`)

    return showInfoScreen("Sandbox", lines, { back: true })
  },
}
