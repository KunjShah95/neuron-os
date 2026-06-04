# Mode Wiring & System Stabilization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire agentmemory mode into the picker, auto-discover modes from registry, replace API validation DSL with Zod, and add config validate command.

**Architecture:** Delete dead launcher.ts, refactor wakeup.ts to derive commands from mode registry, replace validateBody() with Zod.parse() in api/server.ts, add validate subcommand to config CLI.

**Tech Stack:** TypeScript, Commander.js, Zod, Bun

---

### Task 1: Delete dead launcher.ts and unexport it

**Files:**
- Delete: `src/modes/launcher.ts`
- Modify: `src/modes/index.ts`

- [ ] **Step 1: Delete launcher.ts**

```bash
Remove-Item -LiteralPath "src/modes/launcher.ts"
```

- [ ] **Step 2: Remove export from index.ts**

Edit `src/modes/index.ts` — remove the line that exports `runModeLauncher`.

```typescript
// Before:
export { runModeLauncher } from "./launcher"
export { registerMode, listModes, getMode } from "./registry"

// After:
export { registerMode, listModes, getMode } from "./registry"
```

- [ ] **Step 3: Verify no remaining references**

```bash
rg "runModeLauncher" src/ --no-heading
```
Expected: no output (all references removed).

- [ ] **Step 4: Run typecheck to confirm clean deletion**

```bash
bun run typecheck
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/modes/launcher.ts src/modes/index.ts
git commit -m "chore: remove dead launcher.ts mode selector"
```

---

### Task 2: Refactor wakeup picker for auto-discovery

**Files:**
- Modify: `src/cli/wakeup.ts`

- [ ] **Step 1: Rewrite wakeup.ts**

Replace the hardcoded `COMMANDS` array and `buildHelpText()` with registry-derived versions.

```typescript
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

  const options = [
    ...getCommands().map(c => ({
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

    const allCommands = getCommands()
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
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/cli/wakeup.ts
git commit -m "feat: auto-discover modes in wakeup picker from registry"
```

---

### Task 3: Add `aegis config validate` command

**Files:**
- Modify: `src/cli/commands/config.ts`

- [ ] **Step 1: Add validate subcommand to config.ts**

Add this block before the closing `}` of the `registerConfig` function (after the `list` subcommand, before the function ends):

```typescript
config
  .command("validate")
  .description("Validate config file against schema")
  .action(async () => {
    const { loadConfig, AppConfigSchema } = await import("../../config")
    const { existsSync, readFileSync } = await import("fs")
    const { join } = await import("path")
    const { homedir } = await import("os")

    const configPath = join(homedir(), ".aegis", "config.json")
    if (!existsSync(configPath)) {
      console.log(theme.warn("  No config file found at ~/.aegis/config.json"))
      return
    }

    const raw = readFileSync(configPath, "utf-8")
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      console.log(theme.error(`  Invalid JSON: ${(err as Error).message}`))
      process.exitCode = 1
      return
    }

    const result = AppConfigSchema.safeParse(parsed)
    if (result.success) {
      console.log(theme.success("  Config is valid"))
    } else {
      console.log(theme.error("  Config validation errors:"))
      for (const issue of result.error.issues) {
        const path = issue.path.length > 0 ? issue.path.join(".") : "(root)"
        console.log(`    ${theme.accent(path)}: ${issue.message}`)
      }
      process.exitCode = 1
    }
  })
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/config.ts
git commit -m "feat: add aegis config validate command"
```

---

### Task 4: Replace API validateBody() with Zod schemas

**Files:**
- Modify: `src/api/server.ts`

- [ ] **Step 1: Add Zod imports and schemas to server.ts**

Add at the top of `src/api/server.ts` (after the existing imports):

```typescript
import { z } from "zod"

// ── Zod Schemas ──────────────────────────────────────────────────────────

const SpawnAgentSchema = z.object({
  name: z.string().min(1, "Name is required").max(64).regex(/^[a-zA-Z0-9_-]+$/, "Name must be alphanumeric with -_"),
  type: z.string().max(32).optional(),
  script: z.string().max(256).optional(),
})

const TaskGoalSchema = z.object({
  goal: z.string().min(1, "Goal is required").max(4000, "Goal too long"),
})

const MemoryContentSchema = z.object({
  content: z.string().min(1, "Content is required").max(50000, "Content too long"),
})

const MemoryQuerySchema = z.object({
  query: z.string().min(1, "Query is required").max(1000, "Query too long"),
})
```

- [ ] **Step 2: Remove the old ValidationRule type and validateBody function**

Remove these lines from `src/api/server.ts`:

```
// ── Input Validation ──────────────────────────────────────────────────

interface ValidationRule {
  field: string
  type: "string" | "number" | "boolean"
  required?: boolean
  minLength?: number
  maxLength?: number
  pattern?: RegExp
}

function validateBody(body: unknown, rules: ValidationRule[]): { valid: boolean; errors: string[] } {
  // ... entire function body ...
}
```

- [ ] **Step 3: Replace validation calls with Zod.parse**

Find and replace each `validateBody` call:

1. **POST /api/v1/agents** spawn validation:
```typescript
// Before:
const validation = validateBody(body, [
  { field: "name", type: "string", required: true, minLength: 1, maxLength: 64, pattern: /^[a-zA-Z0-9_-]+$/ },
  { field: "type", type: "string", maxLength: 32 },
  { field: "script", type: "string", maxLength: 256 },
])
if (!validation.valid) {
  return jsonResponse(400, { error: validation.errors.join("; ") }, config, req)
}

// After:
const spawnResult = SpawnAgentSchema.safeParse(body)
if (!spawnResult.success) {
  return jsonResponse(400, { error: spawnResult.error.issues.map(i => i.message).join("; ") }, config, req)
}
const payload = spawnResult.data
```

2. **POST /api/v1/agents/:id/tasks** task validation:
```typescript
// Before:
const validation = validateBody(body, [
  { field: "goal", type: "string", required: true, minLength: 1, maxLength: 4000 },
])
if (!validation.valid) {
  return jsonResponse(400, { error: validation.errors.join("; ") }, config, req)
}

// After:
const goalResult = TaskGoalSchema.safeParse(body)
if (!goalResult.success) {
  return jsonResponse(400, { error: goalResult.error.issues.map(i => i.message).join("; ") }, config, req)
}
```

3. **POST /api/v1/memory** content validation:
```typescript
// Before:
const validation = validateBody(body, [
  { field: "content", type: "string", required: true, minLength: 1, maxLength: 50000 },
])
if (!validation.valid) {
  return jsonResponse(400, { error: validation.errors.join("; ") }, config, req)
}

// After:
const memResult = MemoryContentSchema.safeParse(body)
if (!memResult.success) {
  return jsonResponse(400, { error: memResult.error.issues.map(i => i.message).join("; ") }, config, req)
}
```

4. **POST /api/v1/memory/search** query validation:
```typescript
// Before:
const validation = validateBody(body, [
  { field: "query", type: "string", required: true, minLength: 1, maxLength: 1000 },
])
if (!validation.valid) {
  return jsonResponse(400, { error: validation.errors.join("; ") }, config, req)
}

// After:
const queryResult = MemoryQuerySchema.safeParse(body)
if (!queryResult.success) {
  return jsonResponse(400, { error: queryResult.error.issues.map(i => i.message).join("; ") }, config, req)
}
```

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck
```
Expected: 0 errors.

- [ ] **Step 5: Verify the module still works by checking test imports**

```bash
rg "validateBody|ValidationRule" src/ --no-heading
```
Expected: no output (no remaining references).

- [ ] **Step 6: Commit**

```bash
git add src/api/server.ts
git commit -m "feat: replace custom validateBody with Zod schemas in API"
```

---

### Task 5: Run full typecheck

- [ ] **Step 1: Final verification**

```bash
bun run typecheck
```
Expected: 0 errors.

- [ ] **Step 2: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: final cleanup after mode wiring and stabilization"
```
