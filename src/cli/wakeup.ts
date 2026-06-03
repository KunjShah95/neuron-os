import type { Command } from "commander"
import { select, text, isCancel } from "@clack/prompts"
import { showBanner } from "../cli/banner"
import { registerAllModes } from "../modes"
import { theme } from "../cli/theme"

interface CommandEntry {
  name: string
  description: string
  needsArg?: boolean
  argPrompt?: string
  argPlaceholder?: string
  longRunning?: boolean
}

const COMMANDS: CommandEntry[] = [
  { name: "status", description: "Show system status" },
  { name: "dashboard", description: "Show live system overview" },
  { name: "chat", description: "Start a chat session" },
  { name: "skills", description: "List installed skills" },
  { name: "config", description: "View configuration" },
  { name: "cron", description: "Manage scheduled tasks" },
  { name: "sandbox", description: "Sandbox status" },
  { name: "computer", description: "Computer use status" },
  { name: "memory", description: "Memory/vector search" },
  { name: "mcp", description: "MCP server management" },
  { name: "agent", description: "Manage AI agents" },
  { name: "harness", description: "Agent evaluation harness" },
  { name: "setup", description: "Run setup wizard" },
  { name: "ask", description: "Ask about the codebase", needsArg: true, argPrompt: "Your question", argPlaceholder: "How does the config system work?" },
  { name: "plan", description: "Generate implementation plan", needsArg: true, argPrompt: "Your goal", argPlaceholder: "Add dark mode to the dashboard" },
  { name: "agent-run", description: "Run agent orchestrator", needsArg: true, argPrompt: "Goal for agent", argPlaceholder: "Refactor the auth module" },
  { name: "telegram", description: "Start Telegram bot", longRunning: true },
  { name: "serve", description: "Start API server", longRunning: true },
]

class InteractiveExit extends Error {
  constructor(public code: number = 0) {
    super("interactive-exit")
    this.name = "InteractiveExit"
  }
}

async function promptForArg(entry: CommandEntry): Promise<string | null> {
  const input = await text({
    message: entry.argPrompt!,
    placeholder: entry.argPlaceholder,
  })
  if (isCancel(input)) return null
  return String(input).trim()
}

async function runCommandInteractive(program: Command, args: string[]): Promise<void> {
  const origExit = process.exit.bind(process)
  ;(process as any).exit = ((code?: number) => {
    throw new InteractiveExit(code ?? 0)
  }) as any

  try {
    await program.parseAsync(["node", "aegis", ...args])
  } catch (e) {
    if (e instanceof InteractiveExit) return
    throw e
  } finally {
    ;(process as any).exit = origExit
  }
}

export async function runWakeup(program?: Command): Promise<void> {
  const interactive = !!program && !!process.stdout.isTTY

  showBanner()
  registerAllModes()

  if (!interactive) {
    console.log(buildHelpText())
    return
  }

  ;(program as any)._interactive = true

  const options = [
    ...COMMANDS.map(c => ({
      value: c.name,
      label: c.name.padEnd(14),
      hint: c.description + (c.longRunning ? " (Ctrl+C to return)" : ""),
    })),
    { value: "__exit__", label: "Exit".padEnd(14), hint: "Exit interactive mode" },
  ]

  while (true) {
    console.log()
    const choice = await select({
      message: "What would you like to do?",
      options,
    })

    if (isCancel(choice) || choice === "__exit__") break

    const entry = COMMANDS.find(c => c.name === choice)
    if (!entry) continue

    const cmdArgs = [entry.name]

    if (entry.needsArg) {
      const arg = await promptForArg(entry)
      if (!arg) continue
      cmdArgs.push(arg)
    }

    console.log()
    console.log(theme.muted(`  ─── Running: aegis ${cmdArgs.join(" ")} ───`))
    console.log()

    try {
      await runCommandInteractive(program!, cmdArgs)
    } catch (e) {
      console.log(theme.error(`  Command error: ${e instanceof Error ? e.message : String(e)}`))
    }

    console.log()
    console.log(theme.muted(`  ─── Command finished. Returning to menu. ───`))
  }

  ;(program as any)._interactive = false
}

function buildHelpText(): string {
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
  return lines.join("\n")
}
