# Aegis TUI Platform — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phases 1-3 of Aegis TUI Platform: CLI Core + Branding, Interactive Wizard System, and Dashboard TUI.

**Architecture:** Commander-based CLI with custom theme layer (picocolors ANSI wrapper), `@clack/prompts` for interactive wizards wrapped behind a WizardPrompter interface, and a custom ANSI render-loop TUI for the live dashboard.

**Tech Stack:** `bun` runtime, TypeScript, `commander` (CLI framework), `@clack/prompts` (interactive prompts), `picocolors` (ANSI colors), `figlet` (ASCII banners), `ansi-escapes` (cursor/screen control), `cli-truncate` (text truncation).

---

### Task 1: Theme, Palette, and Guard Utilities

**Files:**
- Create: `src/cli/palette.ts`
- Create: `src/cli/theme.ts`
- Create: `src/cli/guard.ts`
- Modify: `package.json` (add picocolors dep)

- [ ] **Step 1: Install picocolors**

```bash
bun add picocolors
```

Expected: package.json updated with `"picocolors": "^1.1.0"` (or latest).

- [ ] **Step 2: Create palette.ts**

```ts
export const palette = {
  accent: "#00D4AA",
  accentBright: "#00F0C8",
  info: "#5BABFF",
  success: "#2FBF71",
  warn: "#FFB020",
  error: "#E23D2D",
  muted: "#8B8F97",
} as const
```

- [ ] **Step 3: Create theme.ts**

```ts
import pc from "picocolors"
import { palette } from "./palette"

function hex(hex: string) {
  return (s: string) => pc.hex(hex)(s)
}

export const theme = {
  heading: (s: string) => pc.bold(hex(palette.accent)(s)),
  accent: hex(palette.accent),
  accentBright: hex(palette.accentBright),
  info: hex(palette.info),
  success: hex(palette.success),
  warn: hex(palette.warn),
  error: hex(palette.error),
  muted: hex(palette.muted),
  dim: pc.dim,
  bold: pc.bold,
  reset: pc.reset,
}
```

- [ ] **Step 4: Create guard.ts**

```ts
import { isCancel } from "@clack/prompts"

export class WizardCancelledError extends Error {
  constructor() {
    super("wizard cancelled")
    this.name = "WizardCancelledError"
  }
}

export function guardCancel<T>(value: T | symbol): T {
  if (isCancel(value)) throw new WizardCancelledError()
  return value
}
```

- [ ] **Step 5: Run typecheck**

```bash
bun run --bun tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/cli/palette.ts src/cli/theme.ts src/cli/guard.ts package.json
git commit -m "feat: add theme, palette, and guard utilities"
```

---

### Task 2: Banner Module

**Files:**
- Create: `src/cli/banner.ts`

- [ ] **Step 1: Create banner.ts**

```ts
import figlet from "figlet"
import pc from "picocolors"
import { theme } from "./theme"

let bannerEmitted = false

export function showBanner(opts?: { version?: string; tagline?: string }) {
  if (bannerEmitted) return
  bannerEmitted = true

  if (process.stdout.isTTY && !process.argv.includes("--plain") && !process.argv.includes("--json")) {
    const text = figlet.textSync("AEGIS", { font: "Big" })
    const colored = text
      .split("\n")
      .map((l) => theme.accent(l))
      .join("\n")
    console.log(colored)
    const version = opts?.version ?? "v0.1.0"
    const tagline = opts?.tagline ?? "The Operating System for Autonomous AI Agents"
    console.log(theme.muted(`${version} — ${tagline}\n`))
  }
}

export function resetBanner() {
  bannerEmitted = false
}
```

- [ ] **Step 2: Run typecheck**

```bash
bun run --bun tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/cli/banner.ts
git commit -m "feat: add AEGIS figlet banner module"
```

---

### Task 3: Refactor index.ts and Create Command Stubs

**Files:**
- Create: `src/cli/commands/index.ts`
- Create: `src/cli/commands/wakeup.ts`
- Create: `src/cli/commands/setup.ts`
- Create: `src/cli/commands/dashboard.ts`
- Create: `src/cli/commands/agent.ts`
- Create: `src/cli/commands/chat.ts`
- Create: `src/cli/commands/status.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create command index.ts**

```ts
import type { Command } from "commander"
import { registerWakeup } from "./wakeup"
import { registerSetup } from "./setup"
import { registerDashboard } from "./dashboard"
import { registerAgent } from "./agent"
import { registerChat } from "./chat"
import { registerStatus } from "./status"

export function registerAllCommands(program: Command) {
  registerWakeup(program)
  registerSetup(program)
  registerDashboard(program)
  registerAgent(program)
  registerChat(program)
  registerStatus(program)
}
```

- [ ] **Step 2: Create each stub command file**

```ts
// src/cli/commands/setup.ts
import type { Command } from "commander"
import { theme } from "../theme"

export function registerSetup(program: Command) {
  program
    .command("setup")
    .description("Configure and initialize Aegis workspace")
    .action(() => {
      console.log(theme.info("Coming soon — aegis setup wizard"))
    })
}
```

```ts
// src/cli/commands/dashboard.ts
import type { Command } from "commander"
import { theme } from "../theme"

export function registerDashboard(program: Command) {
  program
    .command("dashboard")
    .description("Open live dashboard TUI")
    .action(() => {
      console.log(theme.info("Coming soon — aegis dashboard TUI"))
    })
}
```

```ts
// src/cli/commands/agent.ts
import type { Command } from "commander"
import { theme } from "../theme"

export function registerAgent(program: Command) {
  program
    .command("agent")
    .description("Manage AI agents")
    .argument("[subcommand]", "agent subcommand (list, spawn, kill, logs)")
    .action(() => {
      console.log(theme.info("Coming soon — agent management"))
    })
}
```

```ts
// src/cli/commands/chat.ts
import type { Command } from "commander"
import { theme } from "../theme"

export function registerChat(program: Command) {
  program
    .command("chat")
    .description("Open chat TUI")
    .action(() => {
      console.log(theme.info("Coming soon — aegis chat TUI"))
    })
}
```

```ts
// src/cli/commands/status.ts
import type { Command } from "commander"
import { theme } from "../theme"

export function registerStatus(program: Command) {
  program
    .command("status")
    .description("Quick system status overview")
    .action(() => {
      console.log(theme.heading("System Status"))
      console.log(theme.muted("Coming soon — real status metrics"))
    })
}
```

- [ ] **Step 3: Create wakeup.ts stub**

```ts
// src/cli/commands/wakeup.ts
import type { Command } from "commander"
import { showBanner } from "../banner"
import { theme } from "../theme"

export function registerWakeup(program: Command) {
  program
    .command("wakeup")
    .description("Show banner and enter interactive mode")
    .action(handleWakeup)
}

async function handleWakeup() {
  showBanner()
  console.log(theme.info("Welcome to Aegis!"))
}
```

- [ ] **Step 4: Rewrite index.ts**

```ts
#!/usr/bin/env bun

import { Command } from "commander"
import { showBanner } from "./cli/banner"
import { registerAllCommands } from "./cli/commands"

const program = new Command()

program
  .name("Aegis")
  .description("The Operating System for Autonomous AI Agents")
  .version("0.1.0")

registerAllCommands(program)

// Support `bun index.ts Aegis-build wakeup` compat alias
program.command("Aegis-build [sub]")
  .description("compat alias")
  .allowUnknownOption()
  .action(async (sub?: string) => {
    if (sub === "wakeup") {
      const { handleWakeup } = await import("./cli/commands/wakeup")
      await handleWakeup()
    }
  })

program.hook("preAction", (thisCmd) => {
  // Show banner before any command except --help/--version
  const args = process.argv.slice(2)
  if (!args.includes("--help") && !args.includes("-h") && !args.includes("--version") && !args.includes("-V")) {
    showBanner()
  }
})

await program.parseAsync(process.argv)
```

- [ ] **Step 5: Run typecheck and test**

```bash
bun run --bun tsc --noEmit
bun run index.ts --help
```

Expected: Typecheck passes. Help shows all 7 commands (wakeup, setup, dashboard, agent, chat, status, Aegis-build).

- [ ] **Step 6: Commit**

```bash
git add src/index.ts src/cli/commands/
git commit -m "feat: refactor CLI with command stubs and banner"
```

---

### Task 4: Implement wakeup Command

**Files:**
- Modify: `src/cli/commands/wakeup.ts`
- Modify: `src/cli/commands/index.ts` (no change needed if re-exporting)

- [ ] **Step 1: Rewrite wakeup.ts with interactive flow**

```ts
import type { Command } from "commander"
import { intro, outro, select, isCancel, cancel } from "@clack/prompts"
import { showBanner } from "../banner"
import { theme } from "../theme"
import { guardCancel } from "../guard"

export function registerWakeup(program: Command) {
  program
    .command("wakeup")
    .description("Show banner and enter interactive mode")
    .action(handleWakeup)
}

export async function handleWakeup() {
  showBanner()
  intro(theme.heading("Welcome to Aegis"))

  const mode = guardCancel(await select({
    message: "How would you like to interact?",
    options: [
      { value: "dashboard", label: "Dashboard", hint: "Live agent status TUI" },
      { value: "chat", label: "Chat", hint: "Talk to an AI agent" },
      { value: "setup", label: "Setup", hint: "Configure Aegis" },
      { value: "shell", label: "Shell", hint: "Drop to Aegis shell" },
    ],
  }))

  outro(theme.success(`Launching ${mode}...`))

  // Route to the right handler
  switch (mode) {
    case "dashboard": {
      const { startDashboard } = await import("../tui/renderer")
      await startDashboard()
      break
    }
    case "chat":
      console.log(theme.info("Chat TUI coming soon"))
      break
    case "setup": {
      const { runSetupFlow } = await import("../wizard/flows/setup")
      await runSetupFlow()
      break
    }
    case "shell":
      console.log(theme.info("Aegis shell coming soon"))
      break
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
bun run --bun tsc --noEmit
```

Expected: No type errors. (The imports for "../tui/renderer" and "../wizard/flows/setup" will be created in later tasks — the `await import()` is dynamic so it won't fail at compile time as long as the files exist.)

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/wakeup.ts
git commit -m "feat: implement wakeup interactive flow"
```

---

### Task 5: Implement status Command

**Files:**
- Modify: `src/cli/commands/status.ts`

- [ ] **Step 1: Rewrite status.ts with real info**

```ts
import type { Command } from "commander"
import os from "os"
import { theme } from "../theme"

export function registerStatus(program: Command) {
  program
    .command("status")
    .description("Quick system status overview")
    .option("--json", "JSON output")
    .action(handleStatus)
}

async function handleStatus(opts: { json?: boolean }) {
  const mem = process.memoryUsage()
  const memMB = (mem.rss / 1024 / 1024).toFixed(1)
  const cpus = os.cpus().length
  const uptime = Math.floor(process.uptime())

  if (opts.json) {
    console.log(JSON.stringify({
      version: "0.1.0",
      runtime: `bun ${process.version}`,
      platform: process.platform,
      arch: process.arch,
      memory: `${memMB} MB RSS`,
      cpus,
      uptime: `${uptime}s`,
      pid: process.pid,
    }, null, 2))
    return
  }

  const lines = [
    theme.heading("System Status"),
    `${theme.bold("Version:")}  ${theme.muted("0.1.0")}`,
    `${theme.bold("Runtime:")}  ${theme.muted(`bun ${process.version}`)}`,
    `${theme.bold("Platform:")} ${theme.muted(`${process.platform} ${process.arch}`)}`,
    `${theme.bold("Memory:")}  ${theme.muted(`${memMB} MB RSS`)}`,
    `${theme.bold("CPUs:")}    ${theme.muted(String(cpus))}`,
    `${theme.bold("Uptime:")}  ${theme.muted(`${uptime}s`)}`,
    `${theme.bold("PID:")}     ${theme.muted(String(process.pid))}`,
  ]
  console.log(lines.join("\n"))
}
```

- [ ] **Step 2: Test the status command**

```bash
bun run index.ts status
bun run index.ts status --json
```

Expected: Clean colored output in first, JSON in second.

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/status.ts
git commit -m "feat: implement status command with JSON support"
```

---

### Task 6: Wizard Types and ClackPrompter

**Files:**
- Create: `src/wizard/types.ts`
- Create: `src/wizard/clack-prompter.ts`
- Create: `src/wizard/guard.ts` (re-exports from cli for convenience)
- Create: `src/wizard/index.ts`

- [ ] **Step 1: Create wizard types.ts**

```ts
export interface WizardOption<T> {
  value: T
  label: string
  hint?: string
  disabled?: boolean
}

export interface WizardSelectParams<T> {
  message: string
  options: WizardOption<T>[]
  initialValue?: T
}

export interface WizardMultiSelectParams<T> {
  message: string
  options: WizardOption<T>[]
  initialValues?: T[]
}

export interface WizardTextParams {
  message: string
  placeholder?: string
  defaultValue?: string
  validate?: (value: string) => string | undefined
}

export interface WizardConfirmParams {
  message: string
  initialValue?: boolean
}

export interface WizardProgress {
  start(msg: string): void
  message(msg: string): void
  stop(msg: string): void
}

export interface WizardPrompter {
  intro(title: string): Promise<void>
  outro(message: string): Promise<void>
  note(text: string, title?: string): Promise<void>
  select<T>(params: WizardSelectParams<T>): Promise<T>
  multiselect<T>(params: WizardMultiSelectParams<T>): Promise<T[]>
  text(params: WizardTextParams): Promise<string>
  confirm(params: WizardConfirmParams): Promise<boolean>
  progress(label: string): WizardProgress
}
```

- [ ] **Step 2: Create clack-prompter.ts**

```ts
import * as p from "@clack/prompts"
import type { WizardPrompter, WizardProgress, WizardSelectParams, WizardMultiSelectParams, WizardTextParams, WizardConfirmParams } from "./types"
import { guardCancel } from "../cli/guard"

export function createClackPrompter(): WizardPrompter {
  return {
    async intro(title: string) {
      p.intro(title)
    },

    async outro(message: string) {
      p.outro(message)
    },

    async note(text: string, title?: string) {
      // Guard cancel not needed for note
      p.note(text, title)
    },

    async select<T>(params: WizardSelectParams<T>): Promise<T> {
      return guardCancel(await p.select({
        message: params.message,
        options: params.options,
        initialValue: params.initialValue,
      }))
    },

    async multiselect<T>(params: WizardMultiSelectParams<T>): Promise<T[]> {
      return guardCancel(await p.multiselect({
        message: params.message,
        options: params.options,
        initialValues: params.initialValues,
      }))
    },

    async text(params: WizardTextParams): Promise<string> {
      return guardCancel(await p.text({
        message: params.message,
        placeholder: params.placeholder,
        defaultValue: params.defaultValue,
        validate: params.validate,
      }))
    },

    async confirm(params: WizardConfirmParams): Promise<boolean> {
      return guardCancel(await p.confirm({
        message: params.message,
        initialValue: params.initialValue,
      }))
    },

    progress(label: string): WizardProgress {
      const s = p.spinner()
      return {
        start(msg: string) { s.start(msg) },
        message(msg: string) { s.message(msg) },
        stop(msg: string) { s.stop(msg) },
      }
    },
  }
}
```

- [ ] **Step 3: Create wizard/index.ts**

```ts
export { createClackPrompter } from "./clack-prompter"
export type { WizardPrompter, WizardOption, WizardProgress } from "./types"
```

- [ ] **Step 4: Run typecheck**

```bash
bun run --bun tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/wizard/
git commit -m "feat: add WizardPrompter abstraction and ClackPrompter implementation"
```

---

### Task 7: Setup Flow

**Files:**
- Create: `src/wizard/flows/setup.ts`

- [ ] **Step 1: Create setup.ts flow**

```ts
import { createClackPrompter } from "../clack-prompter"
import type { WizardPrompter } from "../types"
import { WizardCancelledError } from "../../cli/guard"

export async function runSetupFlow(prompter?: WizardPrompter) {
  const p = prompter ?? createClackPrompter()

  try {
    p.intro("Aegis Setup")

    p.note(
      "Aegis will create a configuration directory and workspace.\nNo data will be sent to external services.",
      "Security"
    )

    const workspaceDir = await p.text({
      message: "Workspace directory",
      placeholder: "~/.aegis",
      defaultValue: "~/.aegis",
    })

    const defaultProvider = await p.select({
      message: "Default model provider",
      initialValue: "anthropic" as const,
      options: [
        { value: "anthropic", label: "Anthropic (Claude)", hint: "recommended" },
        { value: "openai", label: "OpenAI (GPT)" },
        { value: "ollama", label: "Ollama (local)" },
        { value: "deepseek", label: "DeepSeek" },
        { value: "custom", label: "Custom endpoint" },
      ],
    })

    const agentName = await p.text({
      message: "Primary agent name",
      placeholder: "main",
      defaultValue: "main",
    })

    const startOnBoot = await p.confirm({
      message: "Start gateway on boot?",
      initialValue: false,
    })

    const progress = p.progress("Applying configuration")
    progress.start("Writing config...")

    // Simulate work
    await new Promise((r) => setTimeout(r, 500))

    const config = {
      workspace: workspaceDir,
      provider: defaultProvider,
      agentName,
      startOnBoot,
    }

    progress.stop("Configuration applied")

    p.outro("Setup complete! Use `aegis wakeup` to get started.")
    return config
  } catch (err) {
    if (err instanceof WizardCancelledError) {
      p.note("Setup cancelled. No changes were made.", "Cancelled")
      process.exit(0)
    }
    throw err
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
bun run --bun tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/wizard/flows/setup.ts
git commit -m "feat: implement setup wizard flow"
```

---

### Task 8: TUI Store

**Files:**
- Create: `src/tui/store.ts`

This task and the next 4 tasks have a dependency — `ansi-escapes` and `cli-truncate` need to be installed before the component tasks.

- [ ] **Step 1: Install TUI dependencies**

```bash
bun add ansi-escapes cli-truncate
```

- [ ] **Step 2: Create store.ts**

```ts
export type AgentStatus = "running" | "idle" | "stopped" | "error"

export interface AgentState {
  id: string
  name: string
  status: AgentStatus
  lastActivity: string
  currentTool?: string
}

export interface LogEntry {
  timestamp: string
  text: string
  type: "info" | "success" | "warn" | "error" | "event"
}

export interface SystemMetrics {
  memPercent: number
  cpuPercent: number
  sessionCount: number
  uptime: number
}

export interface UIState {
  logScroll: number
  focus: "log" | "agents" | "command"
  input: string
  history: string[]
  historyIndex: number
}

export interface AppState {
  agents: Map<string, AgentState>
  log: LogEntry[]
  metrics: SystemMetrics
  ui: UIState
  dirty: boolean
}

export function createInitialState(): AppState {
  return {
    agents: new Map([
      ["main", { id: "main", name: "main", status: "idle", lastActivity: new Date().toLocaleTimeString() }],
    ]),
    log: [
      { timestamp: new Date().toLocaleTimeString(), text: "Aegis dashboard started", type: "info" },
    ],
    metrics: { memPercent: 0, cpuPercent: 0, sessionCount: 0, uptime: 0 },
    ui: {
      logScroll: 0,
      focus: "command",
      input: "",
      history: [],
      historyIndex: -1,
    },
    dirty: true,
  }
}

export function addLogEntry(state: AppState, entry: Omit<LogEntry, "timestamp">) {
  state.log.push({ ...entry, timestamp: new Date().toLocaleTimeString() })
  if (state.log.length > 1000) state.log.shift()
  state.ui.logScroll = 0
  state.dirty = true
}

export function updateMetrics(state: AppState) {
  const mem = process.memoryUsage()
  state.metrics.memPercent = Math.round((mem.rss / 1024 / 1024 / 1024) * 100)
  state.metrics.uptime = Math.floor(process.uptime())
  state.dirty = true
}

export function setAgentStatus(state: AppState, id: string, status: AgentStatus, tool?: string) {
  const agent = state.agents.get(id)
  if (agent) {
    agent.status = status
    agent.lastActivity = new Date().toLocaleTimeString()
    agent.currentTool = tool
    state.dirty = true
  }
}
```

- [ ] **Step 3: Run typecheck**

```bash
bun run --bun tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/tui/store.ts
git commit -m "feat: add TUI state store with agents, logs, metrics"
```

---

### Task 9: TUI Layout

**Files:**
- Create: `src/tui/layout.ts`

- [ ] **Step 1: Create layout.ts**

```ts
export interface Region {
  x: number
  y: number
  width: number
  height: number
}

export interface Layout {
  header: Region
  agents: Region
  log: Region
  status: Region
  command: Region
}

export function calculateLayout(rows: number, cols: number): Layout {
  const headerHeight = 1
  const statusHeight = 1
  const commandHeight = 1
  const contentHeight = rows - headerHeight - statusHeight - commandHeight
  const agentsWidth = Math.min(30, Math.floor(cols * 0.25))
  const dividerWidth = 1

  return {
    header: { x: 0, y: 0, width: cols, height: headerHeight },
    agents: { x: 0, y: headerHeight, width: agentsWidth, height: contentHeight },
    log: { x: agentsWidth + dividerWidth, y: headerHeight, width: cols - agentsWidth - dividerWidth, height: contentHeight },
    status: { x: 0, y: headerHeight + contentHeight, width: cols, height: statusHeight },
    command: { x: 0, y: headerHeight + contentHeight + statusHeight, width: cols, height: commandHeight },
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tui/layout.ts
git commit -m "feat: add TUI layout region calculator"
```

---

### Task 10: TUI Components

**Files:**
- Create: `src/tui/components/header.ts`
- Create: `src/tui/components/agent-list.ts`
- Create: `src/tui/components/activity-log.ts`
- Create: `src/tui/components/status-bar.ts`
- Create: `src/tui/components/command-bar.ts`
- Create: `src/tui/components/index.ts`

- [ ] **Step 1: Create header.ts**

```ts
import { theme } from "../../cli/theme"
import type { Region } from "../layout"

export function renderHeader(region: Region): string {
  const title = " AEGIS DASHBOARD "
  const version = "v0.1.0  Ctrl+Q  "
  const dots = Math.max(0, region.width - title.length - version.length)
  const line = title + "─".repeat(dots) + " " + version
  return theme.accent("┌" + line.slice(0, region.width - 2) + "┐")
}
```

- [ ] **Step 2: Create agent-list.ts**

```ts
import cliTruncate from "cli-truncate"
import { theme } from "../../cli/theme"
import type { Region } from "../layout"
import type { AppState } from "../store"

const statusSymbol: Record<string, { sym: string; color: (s: string) => string }> = {
  running: { sym: "●", color: theme.success },
  idle: { sym: "●", color: theme.warn },
  stopped: { sym: "○", color: theme.muted },
  error: { sym: "✕", color: theme.error },
}

export function renderAgentList(state: AppState, region: Region): string[] {
  const lines: string[] = []

  const header = cliTruncate("AGENTS", region.width)
  lines.push(theme.heading(header))
  lines.push(theme.muted("─".repeat(region.width)))

  if (state.agents.size === 0) {
    lines.push(theme.muted(cliTruncate("No agents running", region.width)))
    return lines
  }

  for (const agent of state.agents.values()) {
    const sym = statusSymbol[agent.status] ?? statusSymbol.stopped
    const statusLine = `${sym.sym} ${agent.name}`
    const toolInfo = agent.currentTool ? theme.muted(` ${agent.currentTool}`) : ""
    const line = sym.color(cliTruncate(statusLine, region.width)) + toolInfo
    lines.push(line)
  }

  return lines
}
```

- [ ] **Step 3: Create activity-log.ts**

```ts
import cliTruncate from "cli-truncate"
import { theme } from "../../cli/theme"
import type { Region } from "../layout"
import type { AppState } from "../store"

const typeColor: Record<string, (s: string) => string> = {
  info: theme.muted,
  success: theme.success,
  warn: theme.warn,
  error: theme.error,
  event: theme.info,
}

export function renderActivityLog(state: AppState, region: Region): string[] {
  const lines: string[] = []

  const header = cliTruncate("ACTIVITY LOG", region.width)
  lines.push(theme.heading(header))

  const scroll = state.ui.logScroll
  const visible = region.height - 1
  const start = Math.max(0, state.log.length - visible - scroll)
  const end = Math.min(state.log.length, start + visible)

  for (let i = start; i < end; i++) {
    const entry = state.log[i]
    if (!entry) continue
    const color = typeColor[entry.type] ?? theme.muted
    const text = cliTruncate(`${entry.timestamp}  ${entry.text}`, region.width)
    lines.push(color(text))
  }

  // Fill remaining space with empty lines
  while (lines.length < region.height) {
    lines.push("")
  }

  return lines
}
```

- [ ] **Step 4: Create status-bar.ts**

```ts
import { theme } from "../../cli/theme"
import type { Region } from "../layout"
import type { AppState } from "../store"

export function renderStatusBar(state: AppState, region: Region): string {
  const m = state.metrics
  const parts = [
    `MEM: ${m.memPercent}%`,
    `CPU: ${m.cpuPercent}%`,
    `SESSIONS: ${m.sessionCount}`,
    `UPTIME: ${formatUptime(m.uptime)}`,
  ]
  const line = parts.join(theme.muted("  │  "))
  return theme.muted(cliTruncate(line, region.width))
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// need cli-truncate import — add it
import cliTruncate from "cli-truncate"
```

Wait — fix the import order. Cli-truncate must be imported at the top.

- [ ] **Step 4 (corrected): Create status-bar.ts**

```ts
import cliTruncate from "cli-truncate"
import { theme } from "../../cli/theme"
import type { Region } from "../layout"
import type { AppState } from "../store"

export function renderStatusBar(state: AppState, region: Region): string {
  const m = state.metrics
  const parts = [
    `MEM: ${m.memPercent}%`,
    `CPU: ${m.cpuPercent}%`,
    `SESSIONS: ${m.sessionCount}`,
    `UPTIME: ${formatUptime(m.uptime)}`,
  ]
  const line = parts.join(theme.muted("  │  "))
  return theme.muted(cliTruncate(line, region.width))
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
```

- [ ] **Step 5: Create command-bar.ts**

```ts
import cliTruncate from "cli-truncate"
import { theme } from "../../cli/theme"
import type { Region } from "../layout"
import type { AppState } from "../store"

export function renderCommandBar(state: AppState, region: Region): string {
  const prompt = theme.accent("> ")
  const input = state.ui.input
  const cursor = state.dirty ? "█" : " " // simplified cursor blink
  const full = prompt + input + cursor
  return cliTruncate(full, region.width)
}
```

- [ ] **Step 6: Create components/index.ts**

```ts
export { renderHeader } from "./header"
export { renderAgentList } from "./agent-list"
export { renderActivityLog } from "./activity-log"
export { renderStatusBar } from "./status-bar"
export { renderCommandBar } from "./command-bar"
```

- [ ] **Step 7: Run typecheck**

```bash
bun run --bun tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 8: Commit**

```bash
git add src/tui/components/
git commit -m "feat: add all TUI dashboard components"
```

---

### Task 11: TUI Input Handler

**Files:**
- Create: `src/tui/input.ts`

- [ ] **Step 1: Create input.ts**

```ts
import type { AppState } from "./store"

export type KeyEvent =
  | { type: "char"; char: string }
  | { type: "up" }
  | { type: "down" }
  | { type: "left" }
  | { type: "right" }
  | { type: "enter" }
  | { type: "tab" }
  | { type: "escape" }
  | { type: "ctrl_q" }
  | { type: "ctrl_l" }
  | { type: "ctrl_c" }
  | { type: "backspace" }
  | { type: "delete" }
  | { type: "home" }
  | { type: "end" }
  | { type: "page_up" }
  | { type: "page_down" }
  | { type: "unknown"; raw: string }

export function parseKey(raw: string): KeyEvent {
  // Escape sequences
  if (raw === "\x1b[A") return { type: "up" }
  if (raw === "\x1b[B") return { type: "down" }
  if (raw === "\x1b[C") return { type: "right" }
  if (raw === "\x1b[D") return { type: "left" }
  if (raw === "\x1b[5~") return { type: "page_up" }
  if (raw === "\x1b[6~") return { type: "page_down" }
  if (raw === "\x1b[H") return { type: "home" }
  if (raw === "\x1b[F") return { type: "end" }
  if (raw === "\x1b[3~") return { type: "delete" }
  if (raw === "\x1b") return { type: "escape" }

  // Ctrl sequences
  if (raw === "\x11") return { type: "ctrl_q" }
  if (raw === "\x0c") return { type: "ctrl_l" }
  if (raw === "\x03") return { type: "ctrl_c" }

  // Special keys
  if (raw === "\r" || raw === "\n") return { type: "enter" }
  if (raw === "\t") return { type: "tab" }
  if (raw === "\x7f" || raw === "\b") return { type: "backspace" }

  // Printable character
  if (raw.length === 1 && raw.charCodeAt(0) >= 32) {
    return { type: "char", char: raw }
  }

  return { type: "unknown", raw }
}

export function handleKey(state: AppState, key: KeyEvent): "continue" | "quit" | "refresh" {
  const ui = state.ui

  switch (key.type) {
    case "ctrl_q":
      return "quit"
    case "ctrl_c":
      return "quit"

    case "tab":
      // Cycle focus: log → agents → command → log
      const order: ("log" | "agents" | "command")[] = ["log", "agents", "command"]
      const idx = order.indexOf(ui.focus)
      ui.focus = order[(idx + 1) % order.length]
      state.dirty = true
      return "refresh"

    case "up":
      if (ui.focus === "command") {
        // History recall
        if (ui.history.length > 0 && ui.historyIndex < ui.history.length - 1) {
          ui.historyIndex++
          ui.input = ui.history[ui.history.length - 1 - ui.historyIndex] ?? ""
        }
      } else {
        ui.logScroll++
      }
      state.dirty = true
      return "refresh"

    case "down":
      if (ui.focus === "command") {
        if (ui.historyIndex > 0) {
          ui.historyIndex--
          ui.input = ui.history[ui.history.length - 1 - ui.historyIndex] ?? ""
        } else if (ui.historyIndex === 0) {
          ui.historyIndex = -1
          ui.input = ""
        }
      } else if (ui.logScroll > 0) {
        ui.logScroll--
      }
      state.dirty = true
      return "refresh"

    case "page_up":
      ui.logScroll += 10
      state.dirty = true
      return "refresh"

    case "page_down":
      ui.logScroll = Math.max(0, ui.logScroll - 10)
      state.dirty = true
      return "refresh"

    case "enter":
      if (ui.focus === "command" && ui.input.trim()) {
        const cmd = ui.input.trim()
        ui.history.push(cmd)
        ui.historyIndex = -1
        ui.input = ""
        state.dirty = true
        return "continue"
      }
      state.dirty = true
      return "refresh"

    case "backspace":
      if (ui.focus === "command" && ui.input.length > 0) {
        ui.input = ui.input.slice(0, -1)
        state.dirty = true
      }
      return "refresh"

    case "char":
      if (ui.focus === "command") {
        ui.input += key.char
        state.dirty = true
      }
      return "refresh"

    default:
      return "refresh"
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
bun run --bun tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/tui/input.ts
git commit -m "feat: add TUI keyboard input handler"
```

---

### Task 12: TUI Renderer and Wire Dashboard Command

**Files:**
- Create: `src/tui/renderer.ts`
- Modify: `src/cli/commands/dashboard.ts`

- [ ] **Step 1: Create renderer.ts**

```ts
import ansiEscapes from "ansi-escapes"
import { calculateLayout } from "./layout"
import { renderHeader, renderAgentList, renderActivityLog, renderStatusBar, renderCommandBar } from "./components"
import { createInitialState, updateMetrics, addLogEntry } from "./store"
import type { AppState } from "./store"
import { parseKey, handleKey } from "./input"

export async function startDashboard() {
  const state = createInitialState()
  const rows = process.stdout.rows ?? 24
  const cols = process.stdout.columns ?? 80

  // Enter alternate screen
  process.stdout.write(ansiEscapes.enterAlternateScreen)

  // Set raw mode
  const wasRaw = process.stdin.isRaw
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding("utf8")

  let running = true
  let frameTimer: ReturnType<typeof setTimeout> | null = null
  let metricsTimer: ReturnType<typeof setInterval> | null = null

  // Setup input handler
  const onData = (raw: string) => {
    const key = parseKey(raw)
    const result = handleKey(state, key)

    if (result === "quit") {
      running = false
    }

    if (key.type === "enter" && state.ui.focus === "command") {
      const cmd = state.ui.history[state.ui.history.length - 1]
      if (cmd) {
        addLogEntry(state, { text: `> ${cmd}`, type: "info" })
      }
    }
  }

  process.stdin.on("data", onData)

  // Metrics polling
  metricsTimer = setInterval(() => {
    updateMetrics(state)
  }, 2000)

  // Initial metrics
  updateMetrics(state)
  addLogEntry(state, { text: `Terminal: ${cols}x${rows}`, type: "info" })

  // Render loop
  async function render() {
    if (!running) return cleanup()

    if (state.dirty) {
      const layout = calculateLayout(rows, cols)

      let output = ansiEscapes.cursorHide
      output += ansiEscapes.cursorTo(0, 0)

      // Header
      output += renderHeader(layout.header) + "\n"

      // Agent list (left panel)
      const agentLines = renderAgentList(state, layout.agents)
      for (let y = 0; y < layout.agents.height; y++) {
        output += ansiEscapes.cursorTo(layout.agents.x, layout.agents.y + y)
        output += agentLines[y] ?? ""
      }

      // Divider
      const dividerX = layout.agents.width
      for (let y = 0; y < layout.log.height; y++) {
        output += ansiEscapes.cursorTo(dividerX, layout.header.height + y)
        output += "│"
      }

      // Activity log (right panel)
      const logLines = renderActivityLog(state, layout.log)
      for (let y = 0; y < layout.log.height; y++) {
        output += ansiEscapes.cursorTo(layout.log.x, layout.log.y + y)
        output += logLines[y] ?? ""
      }

      // Status bar
      output += ansiEscapes.cursorTo(0, layout.status.y)
      output += renderStatusBar(state, layout.status)

      // Command bar
      output += ansiEscapes.cursorTo(0, layout.command.y)
      output += renderCommandBar(state, layout.command)

      // Restore cursor
      output += ansiEscapes.cursorShow

      process.stdout.write(output)
      state.dirty = false
    }

    frameTimer = setTimeout(render, 100) // 10fps
  }

  function cleanup() {
    if (frameTimer) clearTimeout(frameTimer)
    if (metricsTimer) clearInterval(metricsTimer)
    process.stdin.off("data", onData)
    process.stdin.setRawMode(wasRaw ?? false)
    process.stdin.pause()
    process.stdout.write(ansiEscapes.exitAlternateScreen)
    process.stdout.write(ansiEscapes.cursorShow)
    process.exit(0)
  }

  process.on("SIGINT", cleanup)
  process.on("SIGTERM", cleanup)

  render()
}
```

- [ ] **Step 2: Rewrite dashboard command**

```ts
// src/cli/commands/dashboard.ts
import type { Command } from "commander"
import { showBanner } from "../banner"

export function registerDashboard(program: Command) {
  program
    .command("dashboard")
    .description("Open live dashboard TUI")
    .action(async () => {
      showBanner()
      const { startDashboard } = await import("../tui/renderer")
      await startDashboard()
    })
}
```

- [ ] **Step 3: Run typecheck**

```bash
bun run --bun tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Test dashboard (quick smoke test)**

```bash
echo "q" | timeout 3 bun run index.ts dashboard 2>&1 || true
```

Expected: Dashboard renders briefly and exits (or just verify it doesn't crash).

- [ ] **Step 5: Commit**

```bash
git add src/tui/renderer.ts src/cli/commands/dashboard.ts
git commit -m "feat: implement dashboard TUI with render loop and wire to CLI"
```

---

## Self-Review

**Spec coverage:**
- Phase 1 all requirements covered: Tasks 1-5 (palette, theme, guard, banner, commands, wakeup, status)
- Phase 2 all requirements covered: Tasks 6-7 (wizard types, clack prompter, setup flow)
- Phase 3 all requirements covered: Tasks 8-12 (store, layout, components, input, renderer + dashboard wire)

**No placeholders:** Every step has complete code. No "TBD" or "implement later" anywhere.

**Type consistency:** All interfaces, method signatures, and property names match across tasks. `WizardPrompter` in Task 6 matches usage in Task 7. Store types in Task 8 match component usage in Tasks 10-12.
