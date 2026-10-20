import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { VerificationEngine, type CommandRunner } from "./verification-engine"
import { EvolutionStore } from "./evolution-store"
import type { CodeMutation } from "./types"

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

function makeMutation(overrides: Partial<CodeMutation> = {}): CodeMutation {
  return {
    id: "mut-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    filePath: "src/example.ts",
    strategy: "refactor",
    description: "Test mutation",
    diff: "",
    oldContent: "const x = 1\n",
    newContent: "const x = 2\n",
    status: "proposed",
    confidence: 0.8,
    sourceInsight: "",
    sourceDreamId: "",
    sourceFailureIds: [],
    testResults: "",
    testPassed: false,
    testDurationMs: 0,
    createdAt: new Date().toISOString(),
    appliedAt: "",
    rollbackAt: "",
    ...overrides,
  }
}

function recordingRunner(calls: string[][]): CommandRunner {
  return async (_command, args) => {
    calls.push(args)
    return { stdout: "", stderr: "", exitCode: 0 }
  }
}

describe("VerificationEngine test selection", () => {
  let root: string
  let dbDir: string
  let store: EvolutionStore

  beforeEach(() => {
    root = tempDir("verify-root-")
    dbDir = tempDir("verify-db-")
    store = new EvolutionStore(undefined, { dbPath: dbDir })
    mkdirSync(join(root, "src", "nested"), { recursive: true })
  })

  afterEach(() => {
    store.close()
    try {
      rmSync(root, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
    try {
      rmSync(dbDir, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
  })

  it("runs the test file matching the mutated path", async () => {
    writeFileSync(join(root, "src", "nested", "module.ts"), "export const x = 1\n", "utf-8")
    writeFileSync(join(root, "src", "nested", "module.test.ts"), "import { expect, it } from 'bun:test'\n", "utf-8")

    const calls: string[][] = []
    const engine = new VerificationEngine(store, recordingRunner(calls), { projectRoot: root })

    const mutation = store.createMutation(makeMutation({ filePath: "src/nested/module.ts" }))
    const result = await engine.verifyMutation(mutation)

    expect(result.passed).toBe(true)
    expect(calls.length).toBe(2)
    expect(calls[1]).toEqual(["test", "src/nested/module.test.ts"])
  })

  it("uses the mutated file directly when it is already a test file", async () => {
    writeFileSync(join(root, "src", "nested", "thing.test.ts"), "import { expect, it } from 'bun:test'\n", "utf-8")

    const calls: string[][] = []
    const engine = new VerificationEngine(store, recordingRunner(calls), { projectRoot: root })

    const mutation = store.createMutation(makeMutation({ filePath: "src/nested/thing.test.ts" }))
    const result = await engine.verifyMutation(mutation)

    expect(result.passed).toBe(true)
    expect(calls[1]).toEqual(["test", "src/nested/thing.test.ts"])
  })

  it("falls back to the full test suite when no sibling test file exists", async () => {
    writeFileSync(join(root, "src", "orphan.ts"), "export const x = 1\n", "utf-8")

    const calls: string[][] = []
    const engine = new VerificationEngine(store, recordingRunner(calls), {
      projectRoot: root,
      requireTestPass: true,
    })

    const mutation = store.createMutation(makeMutation({ filePath: "src/orphan.ts" }))
    const result = await engine.verifyMutation(mutation)

    expect(result.passed).toBe(true)
    expect(calls.length).toBe(2)
    expect(calls[1]).toEqual(["test"])
  })

  it("passes verification when the test run fails and requireTestPass is disabled", async () => {
    writeFileSync(join(root, "src", "orphan.ts"), "export const x = 1\n", "utf-8")

    const failingRunner: CommandRunner = async (_command, args) => {
      if (args[0] === "x") return { stdout: "", stderr: "", exitCode: 0 }
      return { stdout: "", stderr: "1 failing", exitCode: 1 }
    }
    const engine = new VerificationEngine(store, failingRunner, {
      projectRoot: root,
      requireTestPass: false,
    })

    const mutation = store.createMutation(makeMutation({ filePath: "src/orphan.ts" }))
    const result = await engine.verifyMutation(mutation)

    expect(result.passed).toBe(true)
  })

  it("fails verification when the test run fails and requireTestPass is enabled", async () => {
    writeFileSync(join(root, "src", "orphan.ts"), "export const x = 1\n", "utf-8")

    const failingRunner: CommandRunner = async (_command, args) => {
      if (args[0] === "x") return { stdout: "", stderr: "", exitCode: 0 }
      return { stdout: "", stderr: "1 failing", exitCode: 1 }
    }
    const engine = new VerificationEngine(store, failingRunner, {
      projectRoot: root,
      requireTestPass: true,
    })

    const mutation = store.createMutation(makeMutation({ filePath: "src/orphan.ts" }))
    const result = await engine.verifyMutation(mutation)

    expect(result.passed).toBe(false)
    expect(store.getMutation(mutation.id)?.status).toBe("failed")
  })

  it("rejects mutations outside the allowed directories", async () => {
    writeFileSync(join(root, "data.ts"), "export const x = 1\n", "utf-8")

    const calls: string[][] = []
    const engine = new VerificationEngine(store, recordingRunner(calls), {
      projectRoot: root,
      allowedDirs: ["src"],
    })

    const mutation = store.createMutation(makeMutation({ filePath: "data.ts" }))
    const result = await engine.verifyMutation(mutation)

    expect(result.passed).toBe(false)
    expect(result.error).toContain("allowed directories")
    expect(calls.length).toBe(0)
  })

  it("records the failure status in the injected store", async () => {
    const calls: string[][] = []
    const engine = new VerificationEngine(store, recordingRunner(calls), {
      projectRoot: root,
      allowedDirs: ["src"],
    })

    const mutation = store.createMutation(makeMutation({ filePath: "data.ts" }))
    await engine.verifyMutation(mutation)

    const updated = store.getMutation(mutation.id)
    expect(updated?.status).toBe("failed")
    expect(updated?.testPassed).toBe(false)
  })
})
