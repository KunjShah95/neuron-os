import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

const PROVIDER_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
  "MISTRAL_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "TOGETHERAI_API_KEY",
  "XAI_API_KEY",
  "COHERE_API_KEY",
  "PERPLEXITY_API_KEY",
  "NVIDIA_API_KEY",
  "CUSTOM_API_KEY",
  "AEGIS_AI_API_KEY",
]

let EMPTY_ENV_FILE = ""

function runProviders(args: string[], extraEnv: Record<string, string> = {}): { exitCode: number; stdout: string } {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !PROVIDER_KEYS.includes(k)) env[k] = v
  }
  Object.assign(env, extraEnv)
  // --env-file with an empty file overrides Bun's automatic .env loading so
  // the test controls exactly which provider keys are visible.
  const result = Bun.spawnSync(["bun", `--env-file=${EMPTY_ENV_FILE}`, "run", "index.ts", "providers", ...args], {
    cwd: process.cwd(),
    env,
    stdout: "pipe",
    stderr: "pipe",
  })
  return { exitCode: result.exitCode ?? 1, stdout: result.stdout?.toString() ?? "" }
}

describe("providers command", () => {
  let tmpRoot: string

  beforeAll(() => {
    tmpRoot = mkdtempSync(resolve(tmpdir(), "aegis-prov-"))
    EMPTY_ENV_FILE = resolve(tmpRoot, "empty.env")
    writeFileSync(EMPTY_ENV_FILE, "")
  })

  afterAll(() => {
    try {
      rmSync(tmpRoot, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  })

  test(
    "--json lists all 15 known providers",
    () => {
      const { exitCode, stdout } = runProviders(["--json"])
      expect(exitCode).toBe(0)
      const parsed = JSON.parse(stdout) as Array<{ provider: string; defaultModel: string; baseUrl: string }>
      expect(parsed.length).toBe(15)
      const names = parsed.map((p) => p.provider)
      expect(names).toContain("anthropic")
      expect(names).toContain("ollama")
      expect(names).toContain("openrouter")
    },
    30000,
  )

  test(
    "every provider has a default model and base url",
    () => {
      const { stdout } = runProviders(["--json"])
      const parsed = JSON.parse(stdout) as Array<{ provider: string; defaultModel: string; baseUrl: string }>
      for (const p of parsed) {
        expect(p.defaultModel.length).toBeGreaterThan(0)
        expect(p.baseUrl.length).toBeGreaterThan(0)
      }
    },
    30000,
  )

  test(
    "ollama is always configured (no key required)",
    () => {
      const { stdout } = runProviders(["--json"])
      const parsed = JSON.parse(stdout) as Array<{ provider: string; configured: boolean; needsKey: boolean }>
      const ollama = parsed.find((p) => p.provider === "ollama")
      expect(ollama?.needsKey).toBe(false)
      expect(ollama?.configured).toBe(true)
    },
    30000,
  )

  test(
    "a set provider key marks that provider configured",
    () => {
      const { stdout } = runProviders(["--json"], { ANTHROPIC_API_KEY: "sk-test-fake" })
      const parsed = JSON.parse(stdout) as Array<{ provider: string; configured: boolean }>
      const anthropic = parsed.find((p) => p.provider === "anthropic")
      expect(anthropic?.configured).toBe(true)
    },
    30000,
  )
})
