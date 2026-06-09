import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"
import { credentialVault } from "../../vault"
import { createSMSAdapter } from "../../adapters"
import { keepAlive } from "../keepAlive"

export function registerSMS(program: Command) {
  program
    .command("sms")
    .description("Start the SMS adapter (Twilio)")
    .option("--account-sid <sid>", "Twilio account SID (overrides config)")
    .option("--auth-token <token>", "Twilio auth token (overrides config)")
    .option("--from <number>", "Twilio phone number (overrides config)")
    .option("--webhook-port <port>", "Port for incoming SMS webhook", "8082")
    .option("--project <name>", "Use a specific project workspace")
    .action(handleSMS)
}

async function handleSMS(opts: {
  accountSid?: string
  authToken?: string
  from?: string
  webhookPort?: string
  project?: string
}) {
  showBanner()
  await credentialVault.initialize()

  const accountSid = opts.accountSid || (await credentialVault.get("TWILIO_ACCOUNT_SID", "global")) || ""
  const authToken = opts.authToken || (await credentialVault.get("TWILIO_AUTH_TOKEN", "global")) || ""
  const fromNumber = opts.from || (await credentialVault.get("TWILIO_PHONE_NUMBER", "global")) || ""

  if (!accountSid || !authToken || !fromNumber) {
    console.log(theme.error("\n  ✗ Twilio configuration incomplete"))
    console.log(theme.muted("  Required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER"))
    console.log(theme.muted("  Set with: aegis config set <KEY> <value>"))
    console.log()
    process.exit(1)
  }

  const webhookPort = parseInt(opts.webhookPort ?? "8082", 10)

  console.log(theme.info("\n  Starting SMS adapter…"))
  console.log(theme.muted(`  From: ${fromNumber}`))
  console.log(theme.muted(`  Webhook port: ${webhookPort}`))
  console.log()

  const adapter = createSMSAdapter({ accountSid, authToken, fromNumber, webhookPort, project: opts.project })
  await adapter.start()

  console.log(theme.success("  ✓ SMS adapter is running"))
  console.log(theme.dim("  Press Ctrl+C to stop\n"))

  await keepAlive(async () => {
    console.log(theme.warn("\n  Stopping SMS adapter…"))
    await adapter.stop()
  })
}
