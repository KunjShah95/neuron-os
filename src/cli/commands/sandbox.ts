import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"
import { FilesystemSandbox, ProcessSandbox, DockerSandbox, type Sandbox } from "../../sandbox"

const fsBox = new FilesystemSandbox({ enabled: process.env.AEGIS_SANDBOX !== "none" })
const procBox = new ProcessSandbox({ enabled: process.env.AEGIS_SANDBOX === "process" })
const dockerBox = new DockerSandbox({ enabled: process.env.AEGIS_SANDBOX === "docker" })

function activeSandbox(): Sandbox | null {
  if (dockerBox.status().active) return dockerBox
  if (procBox.status().active) return procBox
  if (fsBox.status().active) return fsBox
  return null
}

export function registerSandbox(program: Command) {
  program.command("sandbox").alias("sb").description("Sandbox status and controls").action(handleSandbox)
}

async function handleSandbox() {
  showBanner()

  const box = activeSandbox()
  const status = box?.status()

  console.log()
  if (!status || !status.active) {
    console.log(`  ${theme.warn("Sandbox is disabled")}`)
    console.log(`  ${theme.muted("Set AEGIS_SANDBOX=filesystem|process|docker to enable")}`)
  } else {
    console.log(`  ${theme.success(`● ${status.type} sandbox active`)}`)
    console.log()
    console.log(`  ${theme.heading("Details")}`)
    for (const info of status.info) {
      console.log(`  ${theme.dim(info)}`)
    }
  }
  console.log()
  console.log(`  ${theme.muted("Sandbox type is set via AEGIS_SANDBOX env var")}`)
  console.log(`  ${theme.muted("  none       — no sandbox")}`)
  console.log(`  ${theme.muted("  filesystem — path-restricted file access (default)")}`)
  console.log(`  ${theme.muted("  process    — command whitelist + tempdir")}`)
  console.log(`  ${theme.muted("  docker     — full container isolation (optional)")}`)
  console.log()
}
