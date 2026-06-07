import { theme } from "../cli/theme"
import { showInfoScreen } from "./info-screen"
import { credentialVault } from "../vault"
import type { Mode } from "./types"

export const configMode: Mode = {
  id: "config",
  name: "Config",
  description: "Manage credentials and configuration",

  async run() {
    await credentialVault.initialize()
    const entries = await credentialVault.list()

    const lines: string[] = [""]

    if (entries.length === 0) {
      lines.push(`  ${theme.muted("No credentials stored.")}`)
    } else {
      lines.push(`  ${theme.heading("Stored Credentials")}`)
      lines.push("")
      for (const e of entries) {
        const masked = e.value.length > 8 ? e.value.slice(0, 4) + "..." + e.value.slice(-4) : "..."
        lines.push(`  ${theme.accent(e.key.padEnd(30))} ${theme.dim(`[${e.scope}]`)} ${masked}`)
      }
    }

    lines.push("")
    lines.push(`  ${theme.muted("Use CLI: aegis config set <key> <value> [--scope <scope>]")}`)
    lines.push(`  ${theme.muted("Use CLI: aegis config delete <key> [--scope <scope>]")}`)

    return showInfoScreen("Credentials", lines, { back: true })
  },
}
