import type { Command } from "commander"
import { showBanner } from "../banner"

export function registerDashboard(program: Command) {
  program
    .command("dashboard")
    .alias("dash")
    .description("Open live dashboard TUI")
    .action(async () => {
      showBanner()
      const { startDashboard } = await import("../../tui/renderer")
      await startDashboard()
    })
}
