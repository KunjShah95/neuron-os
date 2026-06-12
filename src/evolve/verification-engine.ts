import { execSync } from "node:child_process"
import type { CodeMutation } from "./types"
import { evolutionStore } from "./evolution-store"

export interface VerificationResult {
  passed: boolean
  output: string
  durationMs: number
  error: string
}

export class VerificationEngine {
  verifyMutation(mutation: CodeMutation): VerificationResult {
    const start = Date.now()

    try {
      evolutionStore.updateMutation(mutation.id, { status: "verifying" })
      const typeResult = this.runTypeCheck()

      if (!typeResult.passed) {
        const result: VerificationResult = {
          passed: false,
          output: typeResult.output,
          durationMs: Date.now() - start,
          error: typeResult.error,
        }
        evolutionStore.updateMutation(mutation.id, {
          status: "failed",
          testResults: result.output,
          testPassed: false,
          testDurationMs: result.durationMs,
        })
        return result
      }

      const testResult = this.runTests()

      const result: VerificationResult = {
        passed: testResult.passed,
        output: testResult.output,
        durationMs: Date.now() - start,
        error: testResult.error,
      }

      evolutionStore.updateMutation(mutation.id, {
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

      evolutionStore.updateMutation(mutation.id, {
        status: "failed",
        testResults: result.error,
        testPassed: false,
        testDurationMs: result.durationMs,
      })

      return result
    }
  }

  private runTypeCheck(): VerificationResult {
    const start = Date.now()
    try {
      const output = execSync("bun run --bun tsc --noEmit 2>&1", {
        encoding: "utf-8",
        timeout: 60000,
        cwd: process.cwd(),
      })

      return {
        passed: true,
        output: output.trim(),
        durationMs: Date.now() - start,
        error: "",
      }
    } catch (err) {
      const stderr = err instanceof Error ? err.message : String(err)
      const output = (err as Error & { stdout?: Buffer })?.stdout?.toString() || ""
      return {
        passed: false,
        output: output + "\n" + stderr,
        durationMs: Date.now() - start,
        error: stderr,
      }
    }
  }

  private runTests(): VerificationResult {
    const start = Date.now()
    try {
      const output = execSync("bun run scripts/run-tests.ts 2>&1", {
        encoding: "utf-8",
        timeout: 120000,
        cwd: process.cwd(),
      })

      const passed = !output.includes("FAIL") && !output.includes("fail") && !output.includes("✗")

      return {
        passed,
        output: output.trim(),
        durationMs: Date.now() - start,
        error: "",
      }
    } catch (err) {
      const stderr = err instanceof Error ? err.message : String(err)
      const output = (err as Error & { stdout?: Buffer })?.stdout?.toString() || ""
      return {
        passed: false,
        output: output + "\n" + stderr,
        durationMs: Date.now() - start,
        error: stderr,
      }
    }
  }
}

export const verificationEngine = new VerificationEngine()
