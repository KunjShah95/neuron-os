import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"
import { credentialVault } from "../../vault"
import { createVoiceAdapter } from "../../adapters"
import { keepAlive } from "../keepAlive"

export function registerVoice(program: Command) {
  program
    .command("voice")
    .description("Start the Voice call adapter (Twilio TTS)")
    .option("--account-sid <sid>", "Twilio account SID (overrides config)")
    .option("--auth-token <token>", "Twilio auth token (overrides config)")
    .option("--from <number>", "Twilio voice-enabled phone number (overrides config)")
    .option("--voice <voice>", "TTS voice: man, woman, alice")
    .option("--language <lang>", "TTS language code (e.g. en-US)")
    .option("--max-duration <seconds>", "Max call duration", "30")
    .option("--project <name>", "Use a specific project workspace")
    .action(handleVoice)
}

async function handleVoice(opts: {
  accountSid?: string
  authToken?: string
  from?: string
  voice?: string
  language?: string
  maxDuration?: string
  project?: string
}) {
  showBanner()
  await credentialVault.initialize()

  const accountSid = opts.accountSid || (await credentialVault.get("TWILIO_ACCOUNT_SID", "global")) || ""
  const authToken = opts.authToken || (await credentialVault.get("TWILIO_AUTH_TOKEN", "global")) || ""
  const fromNumber = opts.from || (await credentialVault.get("TWILIO_VOICE_NUMBER", "global")) || ""

  if (!accountSid || !authToken || !fromNumber) {
    console.log(theme.error("\n  ✗ Twilio Voice configuration incomplete"))
    console.log(theme.muted("  Required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VOICE_NUMBER"))
    console.log(theme.muted("  TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN may already be set from SMS/WhatsApp."))
    console.log(theme.muted("  Set with: aegis config set <KEY> <value>"))
    console.log()
    process.exit(1)
  }

  const voice = (opts.voice || (await credentialVault.get("TWILIO_VOICE_VOICE", "global")) || "alice") as
    | "man"
    | "woman"
    | "alice"
  const language = opts.language || (await credentialVault.get("TWILIO_VOICE_LANGUAGE", "global")) || "en-US"
  const maxDuration = parseInt(opts.maxDuration ?? "30", 10)

  console.log(theme.info("\n  Starting Voice call adapter…"))
  console.log(theme.muted(`  From: ${fromNumber}`))
  console.log(theme.muted(`  TTS voice: ${voice}, language: ${language}`))
  console.log()

  const adapter = createVoiceAdapter({ accountSid, authToken, fromNumber, voice, language, maxDuration })
  await adapter.start()

  console.log(theme.success("  ✓ Voice adapter is running"))
  console.log(theme.dim("  Use gateway.sendReply('voice', '<number>', '<text>') to make calls"))
  console.log(theme.dim("  Press Ctrl+C to stop\n"))

  await keepAlive(async () => {
    console.log(theme.warn("\n  Stopping Voice adapter…"))
    await adapter.stop()
  })
}
