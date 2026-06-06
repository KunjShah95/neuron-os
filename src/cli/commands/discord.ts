import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"
import { credentialVault } from "../../vault"
import { createDiscordAdapter } from "../../adapters"

export function registerDiscord(program: Command) {
  program
    .command("discord")
    .description("Start the Discord bot adapter")
    .option("-t, --token <token>", "Discord bot token (overrides config)")
    .option("--project <name>", "Use a specific project workspace")
    .action(handleDiscord)
}

async function handleDiscord(opts: { token?: string; project?: string }) {
  showBanner()
  await credentialVault.initialize()

  const botToken = opts.token || (await credentialVault.get("DISCORD_BOT_TOKEN", "global")) || ""

  if (!botToken) {
    console.log(theme.error("\n  ✗ Discord bot token not found"))
    console.log(theme.muted("  Set it with: aegis config set DISCORD_BOT_TOKEN <your-token>"))
    console.log(theme.muted("  Or pass: aegis discord --token <your-token>"))
    console.log()
    process.exit(1)
  }

  const allowedUserIdsRaw = await credentialVault.get("DISCORD_ALLOWED_USERS", "global")
  const allowedUserIds = allowedUserIdsRaw
    ? allowedUserIdsRaw.split(",").map((s: string) => s.trim()).filter(Boolean)
    : undefined

  console.log(theme.info("\n  Starting Discord bot adapter…"))
  console.log(theme.muted(`  Allowed users: ${allowedUserIds?.length ? allowedUserIds.join(", ") : "all"}`))
  console.log()

  const adapter = createDiscordAdapter({ botToken, allowedUserIds, project: opts.project })
  await adapter.start()

  console.log(theme.success("  ✓ Discord bot is running"))
  console.log(theme.dim("  Press Ctrl+C to stop\n"))

  await new Promise<void>(() => {
    function handleSignal() {
      console.log(theme.warn("\n  Stopping Discord adapter…"))
      adapter.stop().then(() => process.exit(0))
    }
    process.on("SIGINT", handleSignal)
    process.on("SIGTERM", handleSignal)
  })
}
