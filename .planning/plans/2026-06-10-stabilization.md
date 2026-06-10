# Aegis Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Aegis command reliable for public users — clean errors, working first-run flow, automated smoke tests, and clear docs.

**Architecture:** Four independent phases. Phase 1 adds a provider-guard utility used by Phases 1+2. Phase 3 tests Phases 1+2. Phase 4 adds docs and error codes. Each phase is mergeable independently.

**Tech Stack:** Bun, TypeScript, Commander.js, Vercel AI SDK, better-sqlite3, GitHub Actions

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/ai/provider-guard.ts` | Create | `requireAnyProvider()` + `getDefaultConfiguredProvider()` |
| `src/modes/research.ts` | Modify L69-71 | Use configured provider instead of hardcoded openai |
| `src/api/server.ts` | Modify L412 | Add `/health` alias alongside `/api/v1/health` |
| `src/cli/commands/chat.ts` | Modify | Call `requireAnyProvider()` before REPL |
| `src/cli/commands/ask.ts` | Modify | Call `requireAnyProvider()` before LLM call |
| `src/cli/commands/plan.ts` | Modify | Call `requireAnyProvider()` before LLM call |
| `src/cli/commands/research.ts` | Modify | Pass resolved provider to research mode |
| `src/cli/commands/orchestrate.ts` | Modify | Call `requireAnyProvider()` before LLM call |
| `src/cli/commands/agent-run.ts` | Modify | Call `requireAnyProvider()` before LLM call |
| `src/cli/commands/doctor.ts` | Modify | Add next-steps block + `--fix` flag |
| `src/cli/commands/setup.ts` | Modify | Enhance `init` with zero-key detection + doctor verification |
| `src/cli/wakeup.ts` | Modify | Add first-run banner when zero keys + zero sessions |
| `src/cli/cli.smoke.test.ts` | Create | 3-tier smoke tests: --help, non-LLM e2e, zero-key guard |
| `.github/workflows/ci.yml` | Modify | Add OS matrix: ubuntu + windows + macos |
| `CONTRIBUTING.md` | Create | Dev setup, test, add-command instructions |
| `src/errors.ts` | Create | Structured `AEGIS_EXXX` error code constants |

---

## Task 1: Create provider-guard utility

**Files:**
- Create: `src/ai/provider-guard.ts`
- Test: `src/ai/provider-guard.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/ai/provider-guard.test.ts
import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import { getDefaultConfiguredProvider } from "./provider-guard"

describe("getDefaultConfiguredProvider", () => {
  const saved: Record<string, string | undefined> = {}
  const keys = [
    "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY",
    "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GROQ_API_KEY",
    "MISTRAL_API_KEY", "DEEPSEEK_API_KEY", "AEGIS_AI_API_KEY",
  ]

  beforeEach(() => {
    for (const k of keys) { saved[k] = process.env[k]; delete process.env[k] }
  })

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] !== undefined) process.env[k] = saved[k]
      else delete process.env[k]
    }
  })

  it("returns null when no keys set", () => {
    expect(getDefaultConfiguredProvider()).toBeNull()
  })

  it("returns anthropic when ANTHROPIC_API_KEY set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    const result = getDefaultConfiguredProvider()
    expect(result?.provider).toBe("anthropic")
    expect(result?.model).toBeTruthy()
  })

  it("prefers anthropic over openai", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    process.env.OPENAI_API_KEY = "sk-test"
    expect(getDefaultConfiguredProvider()?.provider).toBe("anthropic")
  })

  it("falls back to openai when anthropic missing", () => {
    process.env.OPENAI_API_KEY = "sk-test"
    expect(getDefaultConfiguredProvider()?.provider).toBe("openai")
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
bun test src/ai/provider-guard.test.ts
```
Expected: `Cannot find module './provider-guard'`

- [ ] **Step 3: Create provider-guard.ts**

```ts
// src/ai/provider-guard.ts
import { resolveApiKey } from "./provider"
import { listProviders } from "./providers"

const PRIORITY_PROVIDERS: Array<{ provider: string; model: string }> = [
  { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  { provider: "openai", model: "gpt-4o" },
  { provider: "openrouter", model: "openai/gpt-4o" },
  { provider: "gemini", model: "gemini-1.5-pro" },
  { provider: "groq", model: "llama-3.1-70b-versatile" },
  { provider: "mistral", model: "mistral-large-latest" },
  { provider: "deepseek", model: "deepseek-chat" },
  { provider: "xai", model: "grok-beta" },
  { provider: "cohere", model: "command-r-plus" },
]

export function getDefaultConfiguredProvider(): { provider: string; model: string } | null {
  for (const entry of PRIORITY_PROVIDERS) {
    if (resolveApiKey(entry.provider)) return entry
  }
  return null
}

export function requireAnyProvider(): void {
  if (getDefaultConfiguredProvider() !== null) return
  console.error("\n  ✗ [AEGIS_E001] No AI provider configured.")
  console.error("  Run: aegis setup-keys")
  console.error("  Docs: https://github.com/KunjShah95/neuron-os#providers\n")
  process.exit(1)
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
bun test src/ai/provider-guard.test.ts
```
Expected: all 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/ai/provider-guard.ts src/ai/provider-guard.test.ts
git commit -m "feat: add provider-guard utility with requireAnyProvider and getDefaultConfiguredProvider"
```

---

## Task 2: Fix research command — hardcoded openai

**Files:**
- Modify: `src/modes/research.ts` (lines 69-71)

- [ ] **Step 1: Read current broken behavior**

```bash
# With only ANTHROPIC_API_KEY set and no OPENAI_API_KEY:
bun run index.ts research "test" 2>&1 | head -5
```
Expected: `Error: OpenAI API key is missing`

- [ ] **Step 2: Apply fix to src/modes/research.ts**

Find this block (around line 16-17 and 69-71):
```ts
import { AIProviderManager } from "../ai"
import type { AIConfig } from "../ai"
```
Add import after those lines:
```ts
import { getDefaultConfiguredProvider } from "../ai/provider-guard"
import { resolveApiKey } from "../ai/provider"
```

Find and replace lines 69-71:
```ts
// BEFORE:
  const ai = new AIProviderManager({
    provider: (process.env.AEGIS_AI_PROVIDER ?? "openai") as any,
    model: process.env.AEGIS_AI_MODEL ?? "gpt-4o",
```
```ts
// AFTER:
  const defaultProvider = getDefaultConfiguredProvider()
  const resolvedProvider = process.env.AEGIS_AI_PROVIDER ?? defaultProvider?.provider ?? "anthropic"
  const ai = new AIProviderManager({
    provider: resolvedProvider as any,
    model: process.env.AEGIS_AI_MODEL ?? defaultProvider?.model ?? "claude-sonnet-4-20250514",
    apiKey: resolveApiKey(resolvedProvider),
```

- [ ] **Step 3: Verify fix**

```bash
# With ANTHROPIC_API_KEY set, no OPENAI_API_KEY:
bun run index.ts research "what is 2+2" --max-iterations 1 2>&1 | head -10
```
Expected: no "OpenAI API key is missing" error — uses Anthropic

- [ ] **Step 4: Commit**

```bash
git add src/modes/research.ts
git commit -m "fix: research command uses configured provider instead of hardcoded openai"
```

---

## Task 3: Add /health alias to HTTP server

**Files:**
- Modify: `src/api/server.ts` (around line 412)

- [ ] **Step 1: Find the health handler**

```bash
grep -n "api/v1/health" src/api/server.ts
```
Expected output includes: `412:  if (pathname === "/api/v1/health" && method === "GET") {`

- [ ] **Step 2: Apply the alias**

In `src/api/server.ts`, find:
```ts
  if (pathname === "/api/v1/health" && method === "GET") {
```
Replace with:
```ts
  if ((pathname === "/api/v1/health" || pathname === "/health") && method === "GET") {
```

- [ ] **Step 3: Verify**

```bash
bun run index.ts serve --port 8099 &
sleep 3
curl -s http://localhost:8099/health | head -c 50
curl -s http://localhost:8099/api/v1/health | head -c 50
kill %1
```
Expected: both return `{"status":"ok",...}`

- [ ] **Step 4: Commit**

```bash
git add src/api/server.ts
git commit -m "fix: add /health alias to HTTP server alongside /api/v1/health"
```

---

## Task 4: Add requireAnyProvider guard to LLM commands

**Files:**
- Modify: `src/cli/commands/chat.ts`
- Modify: `src/cli/commands/ask.ts`
- Modify: `src/cli/commands/plan.ts`
- Modify: `src/cli/commands/orchestrate.ts`
- Modify: `src/cli/commands/agent-run.ts`

For each file, add to the top of the `action` handler (before any LLM calls):

- [ ] **Step 1: Add guard to chat.ts**

In `src/cli/commands/chat.ts`, find the `handleChat` async function. At the very start of the function body (after any option destructuring), add:
```ts
  const { requireAnyProvider } = await import("../../ai/provider-guard")
  requireAnyProvider()
```

- [ ] **Step 2: Verify chat guard**

```bash
# Temporarily unset all API keys in a subshell:
env -i HOME=$HOME PATH=$PATH bun run index.ts chat 2>&1 | head -5
```
Expected:
```
  ✗ [AEGIS_E001] No AI provider configured.
  Run: aegis setup-keys
```

- [ ] **Step 3: Add guard to ask.ts**

In `src/cli/commands/ask.ts`, find the action handler. At the top of the handler body add:
```ts
  const { requireAnyProvider } = await import("../../ai/provider-guard")
  requireAnyProvider()
```

- [ ] **Step 4: Add guard to plan.ts**

In `src/cli/commands/plan.ts`, find the action handler. At the top of the handler body add:
```ts
  const { requireAnyProvider } = await import("../../ai/provider-guard")
  requireAnyProvider()
```

- [ ] **Step 5: Add guard to orchestrate.ts**

In `src/cli/commands/orchestrate.ts`, find the action handler. At the top of the handler body add:
```ts
  const { requireAnyProvider } = await import("../../ai/provider-guard")
  requireAnyProvider()
```

- [ ] **Step 6: Add guard to agent-run.ts**

In `src/cli/commands/agent-run.ts`, find the action handler. At the top of the handler body add:
```ts
  const { requireAnyProvider } = await import("../../ai/provider-guard")
  requireAnyProvider()
```

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/cli/commands/chat.ts src/cli/commands/ask.ts src/cli/commands/plan.ts src/cli/commands/orchestrate.ts src/cli/commands/agent-run.ts
git commit -m "feat: add provider guard to all LLM-dependent commands — clean error when no keys configured"
```

---

## Task 5: Improve doctor — next-steps block + --fix flag

**Files:**
- Modify: `src/cli/commands/doctor.ts`

- [ ] **Step 1: Add --fix option to registerDoctor**

In `src/cli/commands/doctor.ts`, find `registerDoctor`:
```ts
// BEFORE:
    .option("--verbose", "Show detailed information for each check")
    .action(handleDoctor)

// AFTER:
    .option("--verbose", "Show detailed information for each check")
    .option("--fix", "Auto-fix issues where possible")
    .action(handleDoctor)
```

Also update the `handleDoctor` signature:
```ts
// BEFORE:
async function handleDoctor(opts: { json?: boolean; verbose?: boolean }) {

// AFTER:
async function handleDoctor(opts: { json?: boolean; verbose?: boolean; fix?: boolean }) {
```

- [ ] **Step 2: Add next-steps output after summary**

In `src/cli/commands/doctor.ts`, find this block:
```ts
  if (failed2 === 0 && warn2 === 0) {
    console.log(`  ${theme.success(`✅ All ${passed2} checks passed`)}`)
  } else if (failed2 === 0) {
    console.log(`  ${theme.warn(`⚠️  ${passed2} passed, ${warn2} warnings`)}`)
  } else {
    console.log(`  ${theme.error(`❌ ${failed2} failed, ${warn2} warnings, ${passed2} passed`)}`)
  }

  console.log()
```

Replace with:
```ts
  if (failed2 === 0 && warn2 === 0) {
    console.log(`  ${theme.success(`✅ All ${passed2} checks passed`)}`)
  } else if (failed2 === 0) {
    console.log(`  ${theme.warn(`⚠️  ${passed2} passed, ${warn2} warnings`)}`)
  } else {
    console.log(`  ${theme.error(`❌ ${failed2} failed, ${warn2} warnings, ${passed2} passed`)}`)
  }

  if (failed2 > 0 || warn2 > 0) {
    const noProvider = results.aiProvider?.status !== "pass"
    console.log()
    console.log(`  ${theme.dim("Fix issues:")}`)
    if (noProvider) {
      console.log(`  ${theme.muted("  aegis setup-keys       → configure AI provider API keys")}`)
    }
    console.log(`  ${theme.muted("  aegis doctor --fix     → auto-fix what's possible")}`)
    console.log(`  ${theme.muted("  aegis doctor --verbose → see full details")}`)
  }

  console.log()

  if (opts.fix) {
    await runAutoFix(results)
  }
```

- [ ] **Step 3: Add runAutoFix function**

Add this function at the bottom of `src/cli/commands/doctor.ts`, before the closing of the file:

```ts
async function runAutoFix(results: Record<string, CheckResult>): Promise<void> {
  const { mkdirSync, existsSync } = await import("node:fs")
  const { homedir } = await import("node:os")
  const { resolve } = await import("node:path")

  console.log(`\n  ${theme.heading("Auto-Fix")}`)
  let fixed = 0

  // Fix: missing ~/.aegis dir
  const aegisDir = resolve(homedir(), ".aegis")
  if (!existsSync(aegisDir)) {
    try {
      mkdirSync(aegisDir, { recursive: true })
      console.log(`  ${theme.success("✓")} Created ${aegisDir}`)
      fixed++
    } catch {
      console.log(`  ${theme.error("✗")} Could not create ${aegisDir}`)
    }
  }

  // Fix: no API keys — launch setup-keys
  if (results.aiProvider?.status !== "pass") {
    console.log(`  ${theme.info("→")} Launching API key setup...`)
    const { runSetupKeysWizard } = await import("./setup-keys")
    await runSetupKeysWizard()
    fixed++
  }

  if (fixed === 0) {
    console.log(`  ${theme.muted("No auto-fixable issues found.")}`)
  }
  console.log()
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Step 5: Verify doctor --fix**

```bash
bun run index.ts doctor 2>&1 | tail -8
```
Expected: fix-issues block appears after summary

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/doctor.ts
git commit -m "feat: doctor --fix auto-corrects issues; add next-steps guidance after warnings"
```

---

## Task 6: First-run UX — init flow + wakeup banner

**Files:**
- Modify: `src/cli/commands/setup.ts`
- Modify: `src/cli/wakeup.ts`

- [ ] **Step 1: Enhance init action in setup.ts**

In `src/cli/commands/setup.ts`, find the `init` command action and replace its body:

```ts
// BEFORE:
    .action(async () => {
      const { runSetupKeysWizard } = await import("./setup-keys")
      console.log("\n🛡️  Welcome to Aegis! Let's get you set up...\n")
      await runSetupKeysWizard()
      console.log("\n✨ Setup complete! Launching Aegis...\n")
      const { runWakeup } = await import("../wakeup")
      await runWakeup(program)
    })

// AFTER:
    .action(async () => {
      const { getDefaultConfiguredProvider } = await import("../../ai/provider-guard")
      console.log("\n🛡️  Welcome to Aegis!\n")

      if (!getDefaultConfiguredProvider()) {
        console.log("  No API keys found. Starting interactive setup...\n")
        const { runSetupKeysWizard } = await import("./setup-keys")
        await runSetupKeysWizard()
      } else {
        console.log("  API keys already configured.\n")
      }

      console.log("\n  Verifying setup...\n")
      const { spawn } = await import("node:child_process")
      await new Promise<void>((resolve) => {
        const child = spawn(process.execPath, [process.argv[1], "doctor"], {
          stdio: "inherit",
          env: process.env,
        })
        child.on("exit", () => resolve())
      })

      console.log("\n✨ Ready! Run: aegis chat\n")
    })
```

- [ ] **Step 2: Add first-run banner to wakeup.ts**

In `src/cli/wakeup.ts`, find the `runWakeup` (or wakeup display) function. At the end of the banner output (after all commands are listed), add:

```ts
  // First-run hint: no keys + no sessions
  const { getDefaultConfiguredProvider } = await import("../ai/provider-guard")
  if (!getDefaultConfiguredProvider()) {
    console.log()
    console.log(`  ${theme.warn("👋 First time?")} Run: ${theme.heading("aegis init")}`)
    console.log()
  }
```

Note: if `runWakeup` is not async, convert it to `async function runWakeup(...)`.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Step 4: Verify wakeup with no keys**

```bash
env -i HOME=$HOME PATH=$PATH bun run index.ts wakeup 2>&1 | tail -5
```
Expected: `👋 First time? Run: aegis init` appears

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/setup.ts src/cli/wakeup.ts
git commit -m "feat: init detects zero keys and guides user; wakeup shows first-run hint"
```

---

## Task 7: Smoke test suite — Tier 1 (all --help exits 0)

**Files:**
- Create: `src/cli/cli.smoke.test.ts`

- [ ] **Step 1: Create the test file with Tier 1**

```ts
// src/cli/cli.smoke.test.ts
import { describe, it, expect } from "bun:test"
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "../../")
const ENTRY = resolve(ROOT, "index.ts")

function run(args: string[], env?: Record<string, string>) {
  const result = spawnSync("bun", ["run", ENTRY, ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    timeout: 15000,
    encoding: "utf8",
  })
  return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr }
}

const ALL_COMMANDS = [
  "doctor", "completion", "supervise", "reflect", "project", "experience",
  "insights", "train", "benchmark", "adversarial", "ci", "pricing", "debate",
  "cost", "plugin", "trigger", "router", "improve", "estimate", "audit",
  "mesh", "bench", "email", "discord", "slack", "whatsapp", "sms", "voice",
  "voice-local", "wakeup", "setup", "init", "dashboard", "agent", "chat",
  "status", "skills", "config", "cron", "serve", "mcp", "memory", "agentmemory",
  "telegram", "ask", "plan", "sandbox", "computer", "health", "harness",
  "agent-run", "openapi", "telemetry", "setup-keys", "pool", "distributed",
  "production", "eval", "research", "orchestrate", "webhook", "session",
  "toolset", "metrics", "docscrawl", "evolve", "soul", "social", "persona",
  "dream", "predict", "workflow", "tls", "marketplace",
]

describe("Tier 1: --help exits 0 for every command", () => {
  for (const cmd of ALL_COMMANDS) {
    it(`aegis ${cmd} --help`, () => {
      const { code, stderr } = run([cmd, "--help"])
      expect(code).toBe(0)
      expect(stderr).not.toContain("Cannot find")
      expect(stderr).not.toContain("SyntaxError")
    })
  }
})
```

- [ ] **Step 2: Run Tier 1 — all should pass**

```bash
bun test src/cli/cli.smoke.test.ts --timeout 30000 2>&1 | tail -10
```
Expected: all ~77 tests pass (init/quick-start/start share one entry)

- [ ] **Step 3: Commit**

```bash
git add src/cli/cli.smoke.test.ts
git commit -m "test: add Tier 1 smoke tests — all commands --help exits 0"
```

---

## Task 8: Smoke test suite — Tier 2 (non-LLM commands run end-to-end)

**Files:**
- Modify: `src/cli/cli.smoke.test.ts`

- [ ] **Step 1: Add Tier 2 tests**

Append to `src/cli/cli.smoke.test.ts`:

```ts
describe("Tier 2: non-LLM commands produce output", () => {
  it("doctor exits 0 and shows version", () => {
    const { code, stdout, stderr } = run(["doctor"])
    expect(code).toBe(0)
    expect(stdout + stderr).toMatch(/Version:|System Doctor/)
  })

  it("health exits 0 and shows status", () => {
    const { code, stdout, stderr } = run(["health"])
    expect(code).toBe(0)
    expect(stdout + stderr).toMatch(/Status:|Health/)
  })

  it("status exits 0 and shows runtime", () => {
    const { code, stdout, stderr } = run(["status"])
    expect(code).toBe(0)
    expect(stdout + stderr).toMatch(/Runtime:|Version:/)
  })

  it("wakeup exits 0 and shows commands", () => {
    const { code, stdout, stderr } = run(["wakeup"])
    expect(code).toBe(0)
    expect(stdout + stderr).toMatch(/aegis chat|Available/)
  })

  it("session list exits 0", () => {
    const { code } = run(["session", "list"])
    expect(code).toBe(0)
  })

  it("memory stats exits 0", () => {
    const { code } = run(["memory", "stats"])
    expect(code).toBe(0)
  })

  it("trigger list exits 0", () => {
    const { code } = run(["trigger", "list"])
    expect(code).toBe(0)
  })

  it("router list exits 0", () => {
    const { code } = run(["router", "list"])
    expect(code).toBe(0)
  })

  it("predict status exits 0", () => {
    const { code } = run(["predict", "status"])
    expect(code).toBe(0)
  })

  it("audit list exits 0", () => {
    const { code } = run(["audit", "list"])
    expect(code).toBe(0)
  })

  it("cost status exits 0", () => {
    const { code } = run(["cost", "status"])
    expect(code).toBe(0)
  })
})
```

- [ ] **Step 2: Run Tier 2**

```bash
bun test src/cli/cli.smoke.test.ts --timeout 30000 2>&1 | grep -E "PASS|FAIL|✓|✗" | tail -20
```
Expected: all Tier 2 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/cli/cli.smoke.test.ts
git commit -m "test: add Tier 2 smoke tests — non-LLM commands run end-to-end"
```

---

## Task 9: Smoke test suite — Tier 3 (zero-key guard)

**Files:**
- Modify: `src/cli/cli.smoke.test.ts`

- [ ] **Step 1: Add Tier 3 tests**

Append to `src/cli/cli.smoke.test.ts`:

```ts
// Strip all known API key env vars for zero-key tests
const NO_KEY_ENV: Record<string, string> = {
  ANTHROPIC_API_KEY: "",
  OPENAI_API_KEY: "",
  OPENROUTER_API_KEY: "",
  GOOGLE_GENERATIVE_AI_API_KEY: "",
  GEMINI_API_KEY: "",
  GROQ_API_KEY: "",
  MISTRAL_API_KEY: "",
  DEEPSEEK_API_KEY: "",
  XAI_API_KEY: "",
  COHERE_API_KEY: "",
  NVIDIA_API_KEY: "",
  TOGETHERAI_API_KEY: "",
  AZURE_OPENAI_API_KEY: "",
  AEGIS_AI_API_KEY: "",
  PERPLEXITY_API_KEY: "",
}

const LLM_COMMANDS: [string, ...string[]][] = [
  ["chat"],
  ["ask", "hello"],
  ["plan", "build a todo app"],
  ["research", "test query"],
  ["orchestrate", "test goal"],
  ["agent-run", "test goal"],
]

describe("Tier 3: LLM commands show clean error with no API keys", () => {
  for (const cmd of LLM_COMMANDS) {
    it(`aegis ${cmd[0]} exits 1 with AEGIS_E001 when no keys`, () => {
      const { code, stdout, stderr } = run(cmd, NO_KEY_ENV)
      expect(code).toBe(1)
      expect(stdout + stderr).toContain("AEGIS_E001")
      expect(stdout + stderr).toContain("setup-keys")
      // Must NOT throw unhandled exception or show SDK error
      expect(stdout + stderr).not.toContain("API key is missing")
      expect(stdout + stderr).not.toContain("Unhandled")
    })
  }
})
```

- [ ] **Step 2: Run Tier 3**

```bash
bun test src/cli/cli.smoke.test.ts --timeout 30000 2>&1 | grep -E "Tier 3|PASS|FAIL|✓|✗" | head -20
```
Expected: all Tier 3 tests pass (requires Tasks 1+4 to be done)

- [ ] **Step 3: Commit**

```bash
git add src/cli/cli.smoke.test.ts
git commit -m "test: add Tier 3 smoke tests — LLM commands show clean AEGIS_E001 error with no keys"
```

---

## Task 10: Add OS matrix to CI workflow

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Read current test job in ci.yml**

```bash
grep -n "runs-on\|strategy\|matrix\|bun test\|run-tests" .github/workflows/ci.yml | head -20
```

- [ ] **Step 2: Add matrix to smoke test job**

In `.github/workflows/ci.yml`, find the test job that runs `bun run scripts/run-tests.ts` (or similar). Add a new job for smoke tests with OS matrix:

```yaml
  smoke-tests:
    name: Smoke Tests (${{ matrix.os }})
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: '1.x'

      - uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: bun-${{ hashFiles('**/bun.lock') }}
          restore-keys: bun-

      - run: bun install --frozen-lockfile

      - name: Run smoke tests
        run: bun test src/cli/cli.smoke.test.ts --timeout 60000
        env:
          ANTHROPIC_API_KEY: ""
          OPENAI_API_KEY: ""
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add smoke test job with ubuntu/windows/macos matrix"
```

---

## Task 11: CONTRIBUTING.md

**Files:**
- Create: `CONTRIBUTING.md`

- [ ] **Step 1: Write CONTRIBUTING.md**

```markdown
# Contributing to Aegis

## Dev Setup

**Requirements:** [Bun](https://bun.sh) >= 1.x, Node.js >= 18 (for compatibility tests)

```bash
git clone https://github.com/KunjShah95/neuron-os
cd neuron-os
bun install
bun run index.ts --help   # verify CLI loads
```

Configure at least one AI provider:
```bash
bun run index.ts setup-keys
```

## Running Tests

```bash
bun test                                    # all tests
bun test src/cli/cli.smoke.test.ts          # CLI smoke tests only
bun test src/ai/provider-guard.test.ts      # specific file
npm run typecheck                           # TypeScript checks
npm run lint                                # ESLint
```

## Adding a Command

1. Create `src/cli/commands/<your-command>.ts`:
```ts
import type { Command } from "commander"

export function registerYourCommand(program: Command) {
  program
    .command("your-command")
    .description("What it does")
    .action(async () => {
      // implementation
    })
}
```

2. Register in `src/cli/commands/index.ts`:
```ts
import { registerYourCommand } from "./your-command"
// ...
registerYourCommand(program)
```

3. Add to `ALL_COMMANDS` in `src/cli/cli.smoke.test.ts`

4. If command calls an LLM, add at the top of the action:
```ts
const { requireAnyProvider } = await import("../../ai/provider-guard")
requireAnyProvider()
```

## Commit Style

```
feat: short description
fix: short description
test: short description
docs: short description
```

## Pull Request Checklist

- [ ] `npm run typecheck` passes
- [ ] `bun test src/cli/cli.smoke.test.ts` passes
- [ ] New command added to `ALL_COMMANDS` in smoke test
- [ ] LLM commands call `requireAnyProvider()`
```

- [ ] **Step 2: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: add CONTRIBUTING.md with dev setup, test, and add-command guide"
```

---

## Task 12: Structured error codes

**Files:**
- Create: `src/errors.ts`

- [ ] **Step 1: Create errors.ts**

```ts
// src/errors.ts
export const ERR = {
  NO_PROVIDER:       "AEGIS_E001",
  BUDGET_EXCEEDED:   "AEGIS_E002",
  AGENT_TIMEOUT:     "AEGIS_E003",
  INVALID_CONFIG:    "AEGIS_E004",
  NETWORK_FAILURE:   "AEGIS_E005",
  SANDBOX_UNAVAIL:   "AEGIS_E006",
  SESSION_NOT_FOUND: "AEGIS_E007",
  PROVIDER_ERROR:    "AEGIS_E008",
} as const

export type ErrorCode = (typeof ERR)[keyof typeof ERR]

export function formatError(code: ErrorCode, message: string): string {
  return `[${code}] ${message}`
}
```

- [ ] **Step 2: Update provider-guard.ts to use ERR**

In `src/ai/provider-guard.ts`, replace:
```ts
  console.error("\n  ✗ [AEGIS_E001] No AI provider configured.")
```
With:
```ts
  import { ERR, formatError } from "../errors"
  // ...
  console.error(`\n  ✗ ${formatError(ERR.NO_PROVIDER, "No AI provider configured.")}`)
```

Wait — dynamic import inside a module-level function is fine but static is cleaner here. Add to top of `provider-guard.ts`:
```ts
import { ERR, formatError } from "../errors"
```
Then update the `requireAnyProvider` body:
```ts
export function requireAnyProvider(): void {
  if (getDefaultConfiguredProvider() !== null) return
  console.error(`\n  ✗ ${formatError(ERR.NO_PROVIDER, "No AI provider configured.")}`)
  console.error("  Run: aegis setup-keys")
  console.error("  Docs: https://github.com/KunjShah95/neuron-os#providers\n")
  process.exit(1)
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Step 4: Run all smoke tests**

```bash
bun test src/cli/cli.smoke.test.ts --timeout 60000 2>&1 | tail -5
```
Expected: all tiers pass

- [ ] **Step 5: Commit**

```bash
git add src/errors.ts src/ai/provider-guard.ts src/ai/provider-guard.test.ts
git commit -m "feat: add structured AEGIS_EXXX error codes; use ERR.NO_PROVIDER in provider-guard"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| `requireAnyProvider()` utility | Task 1 |
| `research` provider fix | Task 2 |
| `/health` alias | Task 3 |
| LLM commands guarded | Task 4 |
| `doctor` next-steps + `--fix` | Task 5 |
| `init` zero-key flow | Task 6 |
| `wakeup` first-run banner | Task 6 |
| Tier 1 smoke tests (--help) | Task 7 |
| Tier 2 smoke tests (non-LLM e2e) | Task 8 |
| Tier 3 smoke tests (zero-key guard) | Task 9 |
| CI OS matrix | Task 10 |
| `CONTRIBUTING.md` | Task 11 |
| `AEGIS_EXXX` error codes | Task 12 |
| `getDefaultConfiguredProvider` | Task 1 |
| Windows signal fix | Not included — tracked in separate issue (requires deeper investigation of actual Windows failures) |

**Placeholder scan:** None found. All tasks have concrete code.

**Type consistency:**
- `requireAnyProvider()` defined Task 1, used Tasks 4+6 ✓
- `getDefaultConfiguredProvider()` defined Task 1, used Tasks 2+6 ✓
- `ERR.NO_PROVIDER` defined Task 12, used in provider-guard update in Task 12 ✓
- `formatError(code, message)` defined Task 12, used Task 12 ✓
