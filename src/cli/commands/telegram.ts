import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"
import { credentialVault } from "../../vault"
import { createTelegramAdapter } from "../../adapters"

export function registerTelegram(program: Command) {
  program
    .command("telegram")
    .alias("tg")
    .description("Start the Telegram bot adapter")
    .option("-t, --token <token>", "Telegram bot token (overrides config)")
    .action(handleTelegram)
}

async function handleTelegram(opts: { token?: string }) {
  showBanner()

  await credentialVault.initialize()

  let botToken: string | undefined = opts.token
  if (!botToken) {
    botToken = (await credentialVault.get("TELEGRAM_BOT_TOKEN", "global")) ?? undefined
  }

  if (!botToken) {
    console.log(theme.error("\n  ✗ Telegram bot token not found"))
    console.log(theme.muted("  Set it with: aegis config set TELEGRAM_BOT_TOKEN <your-token>"))
    console.log(theme.muted("  Or pass: aegis telegram --token <your-token>"))
    console.log()
    process.exit(1)
  }

  const allowedUserIdsRaw = await credentialVault.get("TELEGRAM_ALLOWED_USERS", "global")
  const allowedUserIds = allowedUserIdsRaw
    ? allowedUserIdsRaw.split(",").map((s: string) => s.trim()).filter(Boolean)
    : undefined

  console.log(theme.info("\n  Starting Telegram bot adapter…"))
  console.log(theme.muted(`  Allowed users: ${allowedUserIds?.length ? allowedUserIds.join(", ") : "all"}`))
  console.log()

  const adapter = createTelegramAdapter({ botToken, allowedUserIds })
  await adapter.start()

  console.log(theme.success("  ✓ Telegram bot is running"))
  console.log(theme.dim("  Press Ctrl+C to stop\n"))

  await new Promise<void>(() => {
    process.on("SIGINT", async () => {
      console.log(theme.warn("\n  Stopping Telegram adapter…"))
      await adapter.stop()
      process.exit(0)
    })
    process.on("SIGTERM", async () => {
      console.log(theme.warn("\n  Stopping Telegram adapter…"))
      await adapter.stop()
      process.exit(0)
    })
  })
}
