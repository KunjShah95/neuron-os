import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"
import { credentialVault } from "../../vault"
import { createWhatsAppAdapter } from "../../adapters"

export function registerWhatsApp(program: Command) {
  program
    .command("whatsapp")
    .description("Start the WhatsApp bot adapter (Twilio)")
    .option("--account-sid <sid>", "Twilio account SID (overrides config)")
    .option("--auth-token <token>", "Twilio auth token (overrides config)")
    .option("--from <number>", "Twilio WhatsApp number (overrides config)")
    .option("--webhook-port <port>", "Port for incoming message webhook", "8081")
    .option("--project <name>", "Use a specific project workspace")
    .action(handleWhatsApp)
}

async function handleWhatsApp(opts: { accountSid?: string; authToken?: string; from?: string; webhookPort?: string; project?: string }) {
  showBanner()
  await credentialVault.initialize()

  const accountSid = opts.accountSid || (await credentialVault.get("TWILIO_ACCOUNT_SID", "global")) || ""
  const authToken = opts.authToken || (await credentialVault.get("TWILIO_AUTH_TOKEN", "global")) || ""
  const fromNumber = opts.from || (await credentialVault.get("TWILIO_WHATSAPP_NUMBER", "global")) || ""

  if (!accountSid || !authToken || !fromNumber) {
    console.log(theme.error("\n  ✗ Twilio configuration incomplete"))
    console.log(theme.muted("  Required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER"))
    console.log(theme.muted("  Set with: aegis config set <KEY> <value>"))
    console.log()
    process.exit(1)
  }

  const webhookPort = parseInt(opts.webhookPort ?? "8081", 10)

  console.log(theme.info("\n  Starting WhatsApp bot adapter…"))
  console.log(theme.muted(`  From: ${fromNumber}`))
  console.log(theme.muted(`  Webhook port: ${webhookPort}`))
  console.log()

  const adapter = createWhatsAppAdapter({ accountSid, authToken, fromNumber, webhookPort, project: opts.project })
  await adapter.start()

  console.log(theme.success("  ✓ WhatsApp adapter is running"))
  console.log(theme.dim("  Press Ctrl+C to stop\n"))

  await new Promise<void>(() => {
    function handleSignal() {
      console.log(theme.warn("\n  Stopping WhatsApp adapter…"))
      adapter.stop().then(() => process.exit(0))
    }
    process.on("SIGINT", handleSignal)
    process.on("SIGTERM", handleSignal)
  })
}
