import type { Command } from "commander"
import { select, text, isCancel } from "@clack/prompts"
import { showBanner } from "../cli/banner"
import { registerAllModes, listModes } from "../modes"
import { theme } from "../cli/theme"

interface CommandEntry {
  name: string
  description: string
  needsArg?: boolean
  argPrompt?: string
  argPlaceholder?: string
  longRunning?: boolean
}

const NON_MODE_COMMANDS: CommandEntry[] = [
  { name: "ask", description: "Ask about the codebase", needsArg: true, argPrompt: "Your question", argPlaceholder: "How does the config system work?" },
  { name: "plan", description: "Generate implementation plan", needsArg: true, argPrompt: "Your goal", argPlaceholder: "Add dark mode to the dashboard" },
  { name: "agent-run", description: "Run approval-based agent orchestration", needsArg: true, argPrompt: "Goal for agent", argPlaceholder: "Refactor the auth module" },
  { name: "telegram", description: "Start Telegram bot", longRunning: true },
]

function getCommands(): CommandEntry[] {
  const modes = listModes()
  const modeCommands: CommandEntry[] = modes.map((m) => ({
    name: m.id,
    description: m.description,
  }))
  return [...modeCommands, ...NON_MODE_COMMANDS]
}

class InteractiveExit extends Error {
  constructor(public code: number = 0) {
    super("interactive-exit")
    this.name = "InteractiveExit"
  }
}

async function promptForArg(entry: CommandEntry): Promise<string | null> {
  if (!entry.needsArg) return ""
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

  while (true) {
    const allCommands = getCommands()
    const options = [
      ...allCommands.map(c => ({
        value: c.name,
        label: c.name.padEnd(14),
        hint: c.description + (c.longRunning ? " (Ctrl+C to return)" : ""),
      })),
      { value: "__exit__", label: "Exit".padEnd(14), hint: "Exit interactive mode" },
    ]

    console.log()
    const choice = await select({
      message: "What would you like to do?",
      options,
    })

    if (isCancel(choice) || choice === "__exit__") break

    const entry = allCommands.find(c => c.name === choice)
    if (!entry) continue

    const cmdArgs: string[] = [entry.name]
    if (entry.needsArg) {
      const arg = await promptForArg(entry)
      if (!arg) continue
      cmdArgs.push(arg)
    }

    console.log()
    console.log(theme.muted(`  Running: aegis ${cmdArgs.join(" ")}`))
    console.log()

    try {
      await runCommandInteractive(program!, cmdArgs)
    } catch (e) {
      console.log(theme.error(`  Command error: ${e instanceof Error ? e.message : String(e)}`))
    }

    console.log()
    console.log(theme.muted(`  Command finished. Returning to menu.`))
  }

  ;(program as any)._interactive = false
}

function buildHelpText(): string {
  const allCommands = getCommands()
  const lines = [
    "",
    theme.heading("  Available Commands"),
    "",
    `  ${theme.bold("aegis wakeup")}        ${theme.muted("Show this message")}`,
  ]
  for (const c of allCommands) {
    const argHint = c.needsArg ? " <arg>" : ""
    lines.push(`  ${theme.bold(("aegis " + c.name + argHint).padEnd(24))} ${theme.muted(c.description)}`)
  }
  lines.push("")
  lines.push(theme.muted("  Run 'aegis <command> --help' for detailed usage."))
  lines.push("")
  return lines.join("\n")
}
