import type { Command } from "commander"
import { Telegraf } from "telegraf"
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
    .option("--project <name>", "Use a specific project workspace (sessions, memory)")
    .action(handleTelegram)
}

async function handleTelegram(opts: { token?: string; project?: string }) {
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
    ? allowedUserIdsRaw
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)
    : undefined

  console.log(theme.info("\n  Starting Telegram bot adapter…"))
  console.log(theme.muted(`  Allowed users: ${allowedUserIds?.length ? allowedUserIds.join(", ") : "all"}`))
  console.log()

  // Verify the token by calling getMe() before starting the long-polling bot
  const verifyBot = new Telegraf(botToken)
  console.log(theme.dim("  Verifying token with Telegram API…"))
  try {
    const me = await verifyBot.telegram.getMe()
    console.log(theme.success(`  ✓ Connected as @${me.username} (${me.first_name})`))
    console.log()
  } catch (err: any) {
    console.log(theme.error(`\n  ✗ Failed to connect: ${err.message ?? String(err)}`))
    console.log(theme.muted("  Check that your token is correct and the network can reach api.telegram.org"))
    console.log()
    process.exit(1)
  }

  // Now start the actual long-polling bot
  const adapter = createTelegramAdapter({ botToken, allowedUserIds, project: opts.project })
  await adapter.start()

  console.log(theme.success("  ✓ Telegram bot is running"))
  console.log(theme.dim("  Press Ctrl+C to stop\n"))

  await new Promise<void>(() => {
    function handleSigint() {
      console.log(theme.warn("\n  Stopping Telegram adapter…"))
      adapter.stop().then(() => process.exit(0)).catch(() => process.exit(1))
    }
    function handleSigterm() {
      console.log(theme.warn("\n  Stopping Telegram adapter…"))
      adapter.stop().then(() => process.exit(0)).catch(() => process.exit(1))
    }
    process.on("SIGINT", handleSigint)
    process.on("SIGTERM", handleSigterm)
  })
}
