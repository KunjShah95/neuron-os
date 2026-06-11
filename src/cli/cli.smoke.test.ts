import { describe, test, expect } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

// An empty env file passed via `bun --env-file` overrides Bun's automatic
// loading of the project `.env`, so zero-key guard tests run hermetically.
const EMPTY_ENV_FILE = resolve(mkdtempSync(resolve(tmpdir(), "aegis-smoke-")), "empty.env")
writeFileSync(EMPTY_ENV_FILE, "")

function runCLI(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync(["bun", "run", "index.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env },
    stdout: "pipe",
    stderr: "pipe",
  })
  return {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  }
}

const NO_KEY_ENV: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) =>
        ![
          "ANTHROPIC_API_KEY",
          "OPENAI_API_KEY",
          "OPENROUTER_API_KEY",
          "GEMINI_API_KEY",
          "GROQ_API_KEY",
          "MISTRAL_API_KEY",
          "DEEPSEEK_API_KEY",
          "XAI_API_KEY",
          "COHERE_API_KEY",
          "AEGIS_AI_API_KEY",
          "GOOGLE_GENERATIVE_AI_API_KEY",
          "AZURE_OPENAI_API_KEY",
          "TOGETHERAI_API_KEY",
          "PERPLEXITY_API_KEY",
          "NVIDIA_API_KEY",
          "CUSTOM_API_KEY",
        ].includes(k),
    ),
  ),
  // Prevent index.ts from re-loading keys off disk (.env / ~/.aegis/agent.env)
  AEGIS_NO_DOTENV: "1",
}

function runCLINoKeys(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync(["bun", `--env-file=${EMPTY_ENV_FILE}`, "run", "index.ts", ...args], {
    cwd: process.cwd(),
    env: NO_KEY_ENV,
    stdout: "pipe",
    stderr: "pipe",
  })
  return {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  }
}

describe("CLI smoke tests", () => {
  describe("Tier 1: --help exits 0", () => {
    const commands = [
      "doctor",
      "completion",
      "supervise",
      "reflect",
      "project",
      "experience",
      "insights",
      "train",
      "benchmark",
      "adversarial",
      "ci",
      "pricing",
      "debate",
      "cost",
      "plugin",
      "trigger",
      "router",
      "improve",
      "preflight",
      "audit",
      "mesh",
      "bench",
      "email",
      "discord",
      "slack",
      "whatsapp",
      "sms",
      "voice",
      "voice-local",
      "wakeup",
      "setup",
      "dashboard",
      "agent",
      "chat",
      "status",
      "skills",
      "config",
      "cron",
      "serve",
      "mcp",
      "memory",
      "agentmemory",
      "telegram",
      "ask",
      "plan",
      "sandbox",
      "computer",
      "health",
      "harness",
      "agent-run",
      "openapi",
      "telemetry",
      "setup-keys",
      "pool",
      "distributed",
      "production",
      "eval",
      "research",
      "orchestrate",
      "webhook",
      "session",
      "toolset",
      "metrics",
      "docscrawl",
      "evolve",
      "soul",
      "social",
      "persona",
      "dream",
      "predict",
      "workflow",
      "tls",
      "marketplace",
      "providers",
      "init",
    ]

    for (const cmd of commands) {
      // Each invocation cold-starts `bun run index.ts` (~5s); allow generous
      // headroom so the test isn't killed (exit 143) under parallel load.
      test(
        `${cmd} --help exits 0`,
        () => {
          const { exitCode, stdout, stderr } = runCLI([cmd, "--help"])
          expect(exitCode).toBe(0)
          const combined = stdout + stderr
          expect(combined.length).toBeGreaterThan(0)
        },
        30000,
      )
    }
  })

  describe("Tier 2: non-LLM commands", () => {
    test(
      "doctor exits 0 and reports status",
      () => {
        const { exitCode, stdout, stderr } = runCLINoKeys(["doctor"])
        expect(exitCode).toBe(0)
        const combined = stdout + stderr
        const hasExpected =
          combined.includes("ok") ||
          combined.includes("warning") ||
          combined.includes("✓") ||
          combined.includes("✗") ||
          combined.includes("pass") ||
          combined.includes("warn") ||
          combined.includes("fail")
        expect(hasExpected).toBe(true)
      },
      30000,
    )

    test(
      "version flag exits 0 with non-empty output",
      () => {
        const { exitCode, stdout } = runCLINoKeys(["--version"])
        expect(exitCode).toBe(0)
        expect(stdout.trim().length).toBeGreaterThan(0)
      },
      30000,
    )

    test(
      "session list exits 0 or 1 without stack trace",
      () => {
        const { exitCode, stdout, stderr } = runCLINoKeys(["session", "list"])
        expect([0, 1]).toContain(exitCode)
        const combined = stdout + stderr
        expect(combined).not.toMatch(/^\s+at\s+\w+.*:\d+:\d+/m)
      },
      30000,
    )

    test(
      "memory stats exits 0 or 1 without stack trace",
      () => {
        const { exitCode, stdout, stderr } = runCLINoKeys(["memory", "stats"])
        expect([0, 1]).toContain(exitCode)
        const combined = stdout + stderr
        expect(combined).not.toMatch(/^\s+at\s+\w+.*:\d+:\d+/m)
      },
      30000,
    )

    test(
      "health exits 0 or 1 without stack trace",
      () => {
        const { exitCode, stdout, stderr } = runCLINoKeys(["health"])
        expect([0, 1]).toContain(exitCode)
        const combined = stdout + stderr
        expect(combined).not.toMatch(/^\s+at\s+\w+.*:\d+:\d+/m)
      },
      30000,
    )
  })

  describe("Tier 3: zero-key guard", () => {
    test(
      "ask exits 1 with AEGIS_E001 when no API keys",
      () => {
        const { exitCode, stdout, stderr } = runCLINoKeys(["ask", "hello"])
        expect(exitCode).toBe(1)
        const combined = stdout + stderr
        expect(combined).toContain("AEGIS_E001")
      },
      30000,
    )

    test(
      "plan exits 1 with AEGIS_E001 when no API keys",
      () => {
        const { exitCode, stdout, stderr } = runCLINoKeys(["plan", "make a todo app"])
        expect(exitCode).toBe(1)
        const combined = stdout + stderr
        expect(combined).toContain("AEGIS_E001")
      },
      30000,
    )

    test(
      "orchestrate exits 1 with AEGIS_E001 when no API keys",
      () => {
        const { exitCode, stdout, stderr } = runCLINoKeys(["orchestrate", "do something"])
        expect(exitCode).toBe(1)
        const combined = stdout + stderr
        expect(combined).toContain("AEGIS_E001")
      },
      30000,
    )
  })
})
