import type { Command } from "commander"
import { spawn, type ChildProcess } from "node:child_process"
import { resolve } from "node:path"
import { existsSync } from "node:fs"
import { select, text, isCancel } from "@clack/prompts"
import { showBanner } from "../cli/banner"
import { registerAllModes, listModes } from "../modes"
import { theme } from "../cli/theme"
import { resetStdin } from "./stdin"

interface CommandEntry {
  name: string
  description: string
  needsArg?: boolean
  argPrompt?: string
  argPlaceholder?: string
  longRunning?: boolean
}

const NON_MODE_COMMANDS: CommandEntry[] = [
  {
    name: "ask",
    description: "Ask about the codebase",
    needsArg: true,
    argPrompt: "Your question",
    argPlaceholder: "How does the config system work?",
  },
  {
    name: "plan",
    description: "Generate implementation plan",
    needsArg: true,
    argPrompt: "Your goal",
    argPlaceholder: "Add dark mode to the dashboard",
  },
  {
    name: "agent-run",
    description: "Run approval-based agent orchestration",
    needsArg: true,
    argPrompt: "Goal for agent",
    argPlaceholder: "Refactor the auth module",
  },
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

// resetStdin is imported from ./stdin — used below to clean up after @clack/prompts

// ── Child process tracking for SIGINT passthrough ───────────────
// Allows Ctrl+C in interactive mode to kill the currently running
// child process. The SIGINT handler in index.ts just returns when
// _interactive is true, so we need our own handler here.
let currentChild: ChildProcess | null = null
let sigintCount = 0
let sigintTimer: ReturnType<typeof setTimeout> | null = null

process.on("SIGINT", () => {
  if (!currentChild || currentChild.killed) {
    sigintCount = 0
    return
  }
  sigintCount++
  if (sigintCount >= 3) {
    // Triple Ctrl+C: force kill
    currentChild.kill("SIGKILL")
    currentChild = null
    sigintCount = 0
    console.error("\n  Force killed.")
    process.exit(1)
  }
  // First/second Ctrl+C: send SIGINT, then SIGTERM
  const signal = sigintCount === 1 ? "SIGINT" : "SIGTERM"
  currentChild.kill(signal)
  // Reset counter after 2s (so it only counts rapid presses)
  if (sigintTimer) clearTimeout(sigintTimer)
  sigintTimer = setTimeout(() => { sigintCount = 0; sigintTimer = null }, 2000)
})

function trackChild(child: ChildProcess): void {
  currentChild = child
  child.on("exit", () => {
    if (currentChild === child) {
      currentChild = null
      sigintCount = 0
    }
  })
  child.on("error", () => {
    if (currentChild === child) {
      currentChild = null
      sigintCount = 0
    }
  })
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

/**
 * Run a subcommand in a child process with inherited stdio.
 *
 * This is CRITICAL on Windows: @clack/prompts uses raw mode on stdin
 * for keystroke capture. After clack finishes, the Windows console
 * can be left in a state where in-process stdin recovery (resetting
 * raw mode, removing listeners, draining buffers) still leaves
 * readline/TUI commands unable to accept keyboard input.
 *
 * By spawning a child process with stdio:"inherit", the subcommand
 * gets a completely fresh connection to the terminal file descriptors,
 * bypassing any corrupted console-mode state left behind by clack.
 *
 * This is a well-established pattern used by git, fzf, neovim, etc.
 */
async function runCommandInteractive(_program: Command, args: string[]): Promise<void> {
  const entry = process.execPath
  const script = process.argv[1]
  if (!script) {
    // Fallback: resolve project root and use that path
    const fallbackScript = resolve(process.cwd(), "index.ts")
    if (existsSync(fallbackScript)) {
      return runCommandSpawn(entry, fallbackScript, args)
    }
    // Last resort: run in-process (may have stdin issues on Windows)
    const origExit = process.exit.bind(process)
    ;(process as any).exit = ((code?: number) => {
      throw new InteractiveExit(code ?? 0)
    }) as any
    try {
      await _program.parseAsync(["node", "aegis", ...args])
    } catch (e) {
      if (e instanceof InteractiveExit) return
      throw e
    } finally {
      ;(process as any).exit = origExit
    }
    return
  }

  await runCommandSpawn(entry, script, args)
}

async function runCommandSpawn(entry: string, script: string, args: string[]): Promise<void> {
  // Pass AEGIS_SPAWNED=1 so the child knows it was spawned from wakeup
  // and can suppress duplicate banner rendering.
  const child = spawn(entry, [script, ...args], {
    stdio: "inherit",
    cwd: process.cwd(),
    env: { ...process.env, AEGIS_SPAWNED: "1" },
  })

  trackChild(child)

  await new Promise<void>((resolve) => {
    child.on("exit", () => resolve())
    child.on("error", () => resolve())
  })

  // Reset parent stdin after child exits — the child may have changed
  // terminal state (raw mode, stdin flowing, readline symbols) that
  // could affect clack's next select() call in the while loop.
  resetStdin()
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
      ...allCommands.map((c) => ({
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

    const entry = allCommands.find((c) => c.name === choice)
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

    // ── Critical: Reset stdin before dispatching to subcommand ─────
    // @clack/prompts leaves stdin in raw mode with buffered data.
    // Without this reset, any command that reads stdin (readline,
    // raw-mode TUI, info-screen) will immediately receive stale bytes
    // and interpret them as a quit signal or EOF, causing the command
    // to exit before the user can interact.
    resetStdin()

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
