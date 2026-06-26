import type { CodeMutation } from "./types"
import { evolutionStore, type EvolutionStore } from "./evolution-store"

export interface VerificationResult {
  passed: boolean
  output: string
  durationMs: number
  error: string
}

export type CommandRunner = (
  command: string,
  args: string[],
  timeoutMs: number,
  cwd?: string,
) => Promise<{ stdout: string; stderr: string; exitCode: number }>

function resolveBunPath(): string {
  const bunPath = process.argv0
  if (bunPath && bunPath.includes("bun")) {
    return bunPath
  }
  return process.platform === "win32" ? "bun.cmd" : "bun"
}

async function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
  cwd?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = Bun.spawn([command, ...args], {
      cwd: cwd ?? process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, AEGIS_NO_DOTENV: "1" },
    })

    const stdoutPromise = new Response(proc.stdout).text().catch(() => "")
    const stderrPromise = new Response(proc.stderr).text().catch(() => "")
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      proc.kill("SIGTERM")
    }, timeoutMs)

    void proc.exited.then(async (code: number | null) => {
      clearTimeout(timer)
      const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise])
      if (timedOut) {
        resolve({ stdout, stderr: stderr + `\nCommand timed out after ${timeoutMs}ms`, exitCode: -1 })
      } else {
        resolve({ stdout, stderr, exitCode: code ?? -1 })
      }
    })
  })
}

export class VerificationEngine {
  constructor(
    private store: EvolutionStore = evolutionStore,
    private runner: CommandRunner = runCommand,
  ) {}

  async verifyMutation(mutation: CodeMutation): Promise<VerificationResult> {
    const start = Date.now()

    try {
      this.store.updateMutation(mutation.id, { status: "verifying" })
      const typeResult = await this.runTypeCheck()

      if (!typeResult.passed) {
        const result: VerificationResult = {
          passed: false,
          output: typeResult.output,
          durationMs: Date.now() - start,
          error: typeResult.error,
        }
        this.store.updateMutation(mutation.id, {
          status: "failed",
          testResults: result.output,
          testPassed: false,
          testDurationMs: result.durationMs,
        })
        return result
      }

      const testResult = await this.runTests()

      const result: VerificationResult = {
        passed: testResult.passed,
        output: testResult.output,
        durationMs: Date.now() - start,
        error: testResult.error,
      }

      this.store.updateMutation(mutation.id, {
        status: result.passed ? "passed" : "failed",
        testResults: result.output,
        testPassed: result.passed,
        testDurationMs: result.durationMs,
      })

      return result
    } catch (err) {
      const result: VerificationResult = {
        passed: false,
        output: "",
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      }

      this.store.updateMutation(mutation.id, {
        status: "failed",
        testResults: result.error,
        testPassed: false,
        testDurationMs: result.durationMs,
      })

      return result
    }
  }

  private async runTypeCheck(): Promise<VerificationResult> {
    const start = Date.now()
    try {
      const bunPath = resolveBunPath()
      const result = await this.runner(bunPath, ["run", "--bun", "tsc", "--noEmit"], 60000)

      return {
        passed: result.exitCode === 0,
        output: (result.stdout + "\n" + result.stderr).trim(),
        durationMs: Date.now() - start,
        error: result.exitCode === 0 ? "" : result.stderr,
      }
    } catch (err) {
      return {
        passed: false,
        output: "",
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  private async runTests(): Promise<VerificationResult> {
    const start = Date.now()
    try {
      const bunPath = resolveBunPath()
      const result = await this.runner(bunPath, ["test", "src/evolve/engine.test.ts"], 120000)

      const output = (result.stdout + "\n" + result.stderr).trim()
      const passed = result.exitCode === 0

      return {
        passed,
        output,
        durationMs: Date.now() - start,
        error: passed ? "" : result.stderr,
      }
    } catch (err) {
      return {
        passed: false,
        output: "",
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
}

export const verificationEngine = new VerificationEngine()
