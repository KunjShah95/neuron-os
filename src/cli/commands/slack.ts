import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"
import { credentialVault } from "../../vault"
import { createSlackAdapter } from "../../adapters"

export function registerSlack(program: Command) {
  program
    .command("slack")
    .description("Start the Slack bot adapter")
    .option("-t, --token <token>", "Slack bot token (overrides config)")
    .option("--app-token <token>", "Slack app token for Socket Mode (overrides config)")
    .option("--project <name>", "Use a specific project workspace")
    .action(handleSlack)
}

async function handleSlack(opts: { token?: string; appToken?: string; project?: string }) {
  showBanner()
  await credentialVault.initialize()

  const botToken = opts.token || (await credentialVault.get("SLACK_BOT_TOKEN", "global")) || ""
  const appToken = opts.appToken || (await credentialVault.get("SLACK_APP_TOKEN", "global")) || ""

  if (!botToken) {
    console.log(theme.error("\n  ✗ Slack bot token not found"))
    console.log(theme.muted("  Set it with: aegis config set SLACK_BOT_TOKEN <your-token>"))
    console.log(theme.muted("  Or pass: aegis slack --token <your-token>"))
    console.log()
    process.exit(1)
  }

  const allowedUserIdsRaw = await credentialVault.get("SLACK_ALLOWED_USERS", "global")
  const allowedUserIds = allowedUserIdsRaw
    ? allowedUserIdsRaw.split(",").map((s: string) => s.trim()).filter(Boolean)
    : undefined

  console.log(theme.info("\n  Starting Slack bot adapter…"))
  console.log(theme.muted(`  Socket Mode: ${appToken ? "✅" : "❌ (no app token — replies only, no event listening)"}`))
  console.log(theme.muted(`  Allowed users: ${allowedUserIds?.length ? allowedUserIds.join(", ") : "all"}`))
  console.log()

  const adapter = createSlackAdapter({ botToken, appToken: appToken || undefined, allowedUserIds, project: opts.project })
  await adapter.start()

  console.log(theme.success("  ✓ Slack adapter is running"))
  console.log(theme.dim("  Press Ctrl+C to stop\n"))

  await new Promise<void>(() => {
    function handleSignal() {
      console.log(theme.warn("\n  Stopping Slack adapter…"))
      adapter.stop().then(() => process.exit(0))
    }
    process.on("SIGINT", handleSignal)
    process.on("SIGTERM", handleSignal)
  })
}
