import { existsSync } from "node:fs"
import { isAbsolute, join, relative, resolve } from "node:path"
import type { CodeMutation } from "./types"
import { DEFAULT_EVOLUTION_CONFIG } from "./types"
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

export interface VerificationEngineOptions {
  requireTestPass?: boolean
  allowedDirs?: string[]
  projectRoot?: string
  testTimeoutMs?: number
  typecheckTimeoutMs?: number
}

const KILL_GRACE_MS = 2000
const DEFAULT_TYPECHECK_TIMEOUT_MS = 300000
const DEFAULT_TEST_TIMEOUT_MS = 600000

function resolveBunPath(): string {
  const bunPath = process.argv0
  if (bunPath && bunPath.includes("bun")) {
    return bunPath
  }
  return process.platform === "win32" ? "bun.cmd" : "bun"
}

export async function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
  cwd?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolvePromise) => {
    const proc = Bun.spawn([command, ...args], {
      cwd: cwd ?? process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, AEGIS_NO_DOTENV: "1" },
    })

    const stdoutPromise = new Response(proc.stdout).text().catch(() => "")
    const stderrPromise = new Response(proc.stderr).text().catch(() => "")
    let timedOut = false
    let settled = false
    let killTimer: ReturnType<typeof setTimeout> | undefined

    const settle = (result: { stdout: string; stderr: string; exitCode: number }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
      resolvePromise(result)
    }

    const timer = setTimeout(() => {
      timedOut = true
      try {
        proc.kill("SIGTERM")
      } catch {
        // process already exited
      }
      killTimer = setTimeout(() => {
        try {
          proc.kill("SIGKILL")
        } catch {
          try {
            proc.kill(9)
          } catch {
            // process already exited
          }
        }
        settle({ stdout: "", stderr: `\nCommand timed out after ${timeoutMs}ms (killed)`, exitCode: -1 })
      }, KILL_GRACE_MS)
    }, timeoutMs)

    void proc.exited.then(async (code: number | null) => {
      const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise])
      if (timedOut) {
        settle({ stdout, stderr: stderr + `\nCommand timed out after ${timeoutMs}ms`, exitCode: -1 })
      } else {
        settle({ stdout, stderr, exitCode: code ?? -1 })
      }
    })
  })
}

export class VerificationEngine {
  private store: EvolutionStore
  private runner: CommandRunner
  private requireTestPass: boolean
  private allowedDirs: string[]
  private projectRoot: string
  private testTimeoutMs: number
  private typecheckTimeoutMs: number

  constructor(
    store: EvolutionStore = evolutionStore,
    runner: CommandRunner = runCommand,
    options: VerificationEngineOptions = {},
  ) {
    this.store = store
    this.runner = runner
    this.requireTestPass = options.requireTestPass ?? DEFAULT_EVOLUTION_CONFIG.requireTestPass
    this.allowedDirs = options.allowedDirs ? [...options.allowedDirs] : []
    this.projectRoot = resolve(options.projectRoot ?? process.cwd())
    this.testTimeoutMs = options.testTimeoutMs ?? DEFAULT_TEST_TIMEOUT_MS
    this.typecheckTimeoutMs = options.typecheckTimeoutMs ?? DEFAULT_TYPECHECK_TIMEOUT_MS
  }

  setAllowedDirs(dirs: string[]): void {
    this.allowedDirs = [...dirs]
  }

  setTimeouts(options: { testTimeoutMs?: number; typecheckTimeoutMs?: number }): void {
    if (options.testTimeoutMs !== undefined) this.testTimeoutMs = options.testTimeoutMs
    if (options.typecheckTimeoutMs !== undefined) this.typecheckTimeoutMs = options.typecheckTimeoutMs
  }

  async verifyMutation(mutation: CodeMutation): Promise<VerificationResult> {
    const start = Date.now()

    const disallowed = this.checkAllowedPath(mutation.filePath)
    if (disallowed) {
      const result: VerificationResult = {
        passed: false,
        output: disallowed,
        durationMs: Date.now() - start,
        error: disallowed,
      }
      this.store.updateMutation(mutation.id, {
        status: "failed",
        testResults: result.output,
        testPassed: false,
        testDurationMs: result.durationMs,
      })
      return result
    }

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

      const testResult = await this.runTests(mutation)

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

  private checkAllowedPath(filePath: string): string | null {
    if (!filePath) return "Mutation has no file path"
    if (isAbsolute(filePath)) return `Mutation path is absolute and cannot be verified: ${filePath}`

    const rel = relative(this.projectRoot, resolve(this.projectRoot, filePath))
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
      return `Mutation path escapes the project root: ${filePath}`
    }

    if (this.allowedDirs.length === 0) return null

    const normalized = rel.replace(/\\/g, "/")
    const allowed = this.allowedDirs.some((dir) => {
      const cleaned = dir.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "")
      if (!cleaned) return false
      return normalized === cleaned || normalized.startsWith(`${cleaned}/`)
    })

    if (!allowed) return `Mutation path is outside the allowed directories: ${filePath}`

    return null
  }

  private async runTypeCheck(): Promise<VerificationResult> {
    const start = Date.now()
    try {
      const bunPath = resolveBunPath()
      const result = await this.runner(bunPath, ["x", "tsc", "--noEmit"], this.typecheckTimeoutMs, this.projectRoot)

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

  private async runTests(mutation: CodeMutation): Promise<VerificationResult> {
    const start = Date.now()

    const testFile = this.resolveTestFile(mutation.filePath)
    const args = testFile ? ["test", testFile] : ["test"]

    try {
      const bunPath = resolveBunPath()
      const result = await this.runner(bunPath, args, this.testTimeoutMs, this.projectRoot)

      const output = (result.stdout + "\n" + result.stderr).trim()
      const killed = result.exitCode < 0
      const passed = result.exitCode === 0 || (!this.requireTestPass && !killed)

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

  private resolveTestFile(filePath: string): string | null {
    const normalized = filePath.replace(/\\/g, "/")

    const candidates: string[] = []
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized)) {
      candidates.push(normalized)
    } else {
      const base = normalized.replace(/\.[cm]?[jt]sx?$/, "")
      candidates.push(`${base}.test.ts`, `${base}.test.tsx`, `${base}.spec.ts`)
    }

    for (const candidate of candidates) {
      const absolute = isAbsolute(candidate) ? candidate : join(this.projectRoot, candidate)
      if (existsSync(absolute)) return candidate
    }

    return null
  }
}

export const verificationEngine = new VerificationEngine()
