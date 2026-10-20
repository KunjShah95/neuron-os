import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { CodeMutator } from "./code-mutator"
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

describe("CodeMutator path safety", () => {
  let root: string
  let dbDir: string
  let store: EvolutionStore

  beforeEach(() => {
    root = tempDir("mutator-root-")
    dbDir = tempDir("mutator-db-")
    store = new EvolutionStore(undefined, { dbPath: dbDir })
    mkdirSync(join(root, "src"), { recursive: true })
    mkdirSync(join(root, "data"), { recursive: true })
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

  it("rejects an absolute path that escapes the project root", () => {
    const outside = join(root, "..", `outside-${Date.now()}.ts`)
    writeFileSync(outside, "original\n", "utf-8")

    const mutator = new CodeMutator(store, { projectRoot: root, allowedDirs: ["src"] })
    const mutation = store.createMutation(makeMutation({ filePath: outside }))

    const result = mutator.applyMutation(mutation)

    expect(result).toBe(false)
    expect(readFileSync(outside, "utf-8")).toBe("original\n")
    try {
      rmSync(outside, { force: true })
    } catch {
      // best-effort cleanup
    }
  })

  it("rejects a relative path that traverses out of the project root", () => {
    const outside = join(root, "..", `traversal-${Date.now()}.ts`)
    writeFileSync(outside, "original\n", "utf-8")

    const mutator = new CodeMutator(store, { projectRoot: root, allowedDirs: ["src"] })
    const mutation = store.createMutation(makeMutation({ filePath: `../${outside.split(/[\\/]/).pop()}` }))

    const result = mutator.applyMutation(mutation)

    expect(result).toBe(false)
    expect(readFileSync(outside, "utf-8")).toBe("original\n")
    try {
      rmSync(outside, { force: true })
    } catch {
      // best-effort cleanup
    }
  })

  it("rejects a path outside the allowed directories", () => {
    const target = join(root, "data", "config.ts")
    writeFileSync(target, "original\n", "utf-8")

    const mutator = new CodeMutator(store, { projectRoot: root, allowedDirs: ["src"] })
    const mutation = store.createMutation(makeMutation({ filePath: "data/config.ts" }))

    const result = mutator.applyMutation(mutation)

    expect(result).toBe(false)
    expect(readFileSync(target, "utf-8")).toBe("original\n")
  })

  it("applies a mutation inside the allowed directories", () => {
    const target = join(root, "src", "allowed.ts")
    writeFileSync(target, "const x = 1\n", "utf-8")

    const mutator = new CodeMutator(store, { projectRoot: root, allowedDirs: ["src"] })
    const mutation = store.createMutation(makeMutation({ filePath: "src/allowed.ts" }))

    const result = mutator.applyMutation(mutation)

    expect(result).toBe(true)
    expect(readFileSync(target, "utf-8")).toBe("const x = 2\n")
  })

  it("keeps the original file intact when the write fails", () => {
    const target = join(root, "src", "atomic.ts")
    writeFileSync(target, "const x = 1\n", "utf-8")

    const mutator = new CodeMutator(store, {
      projectRoot: root,
      allowedDirs: ["src"],
      writeFile: () => {
        throw new Error("simulated disk failure")
      },
    })
    const mutation = store.createMutation(makeMutation({ filePath: "src/atomic.ts" }))

    const result = mutator.applyMutation(mutation)

    expect(result).toBe(false)
    expect(readFileSync(target, "utf-8")).toBe("const x = 1\n")

    const leftovers = readdirSync(join(root, "src")).filter((f) => f.endsWith(".tmp"))
    expect(leftovers).toEqual([])

    const updated = store.getMutation(mutation.id)
    expect(updated?.status).toBe("failed")
  })
})
