/**
 * wakeup — CLI entry point that shows the banner and available commands.
 *
 * No interactive picker — all features are accessible via direct CLI commands.
 * Run `aegis --help` to see all available commands.
 */

import { showBanner } from "../cli/banner"
import { registerAllModes } from "../modes"
import { theme } from "../cli/theme"

export async function runWakeup(): Promise<void> {
  showBanner()

  // Register all modes for the system (so they're available for CLI commands)
  registerAllModes()

  // Show available commands
  const lines = [
    "",
    theme.heading("  Available Commands"),
    "",
    `  ${theme.bold("aegis wakeup")}        ${theme.muted("Show this message")}`,
    `  ${theme.bold("aegis dashboard")}     ${theme.muted("Open the live dashboard TUI")}`,
    `  ${theme.bold("aegis chat")}          ${theme.muted("Start a chat session")}`,
    `  ${theme.bold("aegis telegram")}      ${theme.muted("Start the Telegram bot adapter")}`,
    `  ${theme.bold("aegis ask <q>")}       ${theme.muted("Ask a question about the codebase")}`,
    `  ${theme.bold("aegis plan <g>")}      ${theme.muted("Generate an implementation plan")}`,
    `  ${theme.bold("aegis status")}        ${theme.muted("Show system status")}`,
    `  ${theme.bold("aegis sandbox")}       ${theme.muted("Show sandbox status")}`,
    `  ${theme.bold("aegis computer")}      ${theme.muted("Computer use status")}`,
    `  ${theme.bold("aegis harness")}       ${theme.muted("Agent evaluation harness")}`,
    `  ${theme.bold("aegis agent-run <g>")}  ${theme.muted("Run approval-based agent orchestrator")}`,
    `  ${theme.bold("aegis config")}        ${theme.muted("View or set configuration")}`,
    `  ${theme.bold("aegis agent")}         ${theme.muted("Manage AI agents")}`,
    `  ${theme.bold("aegis skills")}        ${theme.muted("List and manage skills")}`,
    `  ${theme.bold("aegis cron")}          ${theme.muted("Manage scheduled tasks")}`,
    `  ${theme.bold("aegis serve")}         ${theme.muted("Start the API server")}`,
    `  ${theme.bold("aegis mcp")}           ${theme.muted("MCP server management")}`,
    `  ${theme.bold("aegis memory")}        ${theme.muted("Memory/vector search")}`,
    `  ${theme.bold("aegis setup")}         ${theme.muted("Run initial setup wizard")}`,
    "",
    theme.muted("  Run 'aegis <command> --help' for detailed usage."),
    "",
  ]

  console.log(lines.join("\n"))
}
