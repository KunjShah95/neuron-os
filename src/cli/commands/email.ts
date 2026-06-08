import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"
import { credentialVault } from "../../vault"
import { createEmailAdapter } from "../../adapters"

export function registerEmail(program: Command) {
  program
    .command("email")
    .description("Start the Email adapter (SMTP)")
    .option("--host <host>", "SMTP host (overrides config)")
    .option("--port <port>", "SMTP port", "587")
    .option("--secure", "Use TLS (default: false for port 587)", false)
    .option("--user <user>", "SMTP user (overrides config)")
    .option("--pass <pass>", "SMTP password (overrides config)")
    .option("--from <from>", "From email address (overrides config)")
    .option("--project <name>", "Use a specific project workspace")
    .action(handleEmail)
}

async function handleEmail(opts: {
  host?: string
  port?: string
  secure?: boolean
  user?: string
  pass?: string
  from?: string
  project?: string
}) {
  showBanner()
  await credentialVault.initialize()

  const host = opts.host || (await credentialVault.get("SMTP_HOST", "global")) || ""
  const port = parseInt(opts.port || (await credentialVault.get("SMTP_PORT", "global")) || "587", 10)
  const secure = opts.secure || (await credentialVault.get("SMTP_SECURE", "global")) === "true"
  const user = opts.user || (await credentialVault.get("SMTP_USER", "global")) || ""
  const pass = opts.pass || (await credentialVault.get("SMTP_PASS", "global")) || ""
  const from = opts.from || (await credentialVault.get("EMAIL_FROM", "global")) || ""

  if (!host || !user || !pass || !from) {
    console.log(theme.error("\n  ✗ SMTP configuration incomplete"))
    console.log(theme.muted("  Required: SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM"))
    console.log(theme.muted("  Set with: aegis config set <KEY> <value>"))
    console.log()
    process.exit(1)
  }

  console.log(theme.info(`\n  Starting Email adapter (${host}:${port})…`))
  console.log(theme.muted(`  From: ${from}`))
  console.log()

  const adapter = createEmailAdapter({ host, port, secure, user, pass, from })
  await adapter.start()

  console.log(theme.success("  ✓ Email adapter is running"))
  console.log(theme.dim("  Press Ctrl+C to stop\n"))

  await new Promise<void>(() => {
    function handleSignal() {
      console.log(theme.warn("\n  Stopping Email adapter…"))
      adapter.stop().then(() => process.exit(0)).catch(() => process.exit(1))
    }
    process.on("SIGINT", handleSignal)
    process.on("SIGTERM", handleSignal)
  })
}
