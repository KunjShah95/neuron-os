import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { CodeMutator } from "./code-mutator"
import { EvolutionEngine, type DreamInsightSource } from "./engine"
import { EvolutionStore, evolutionStore } from "./evolution-store"
import { MutationGenerator } from "./mutation-generator"
import { VerificationEngine, runCommand, type CommandRunner } from "./verification-engine"
import type { CodeMutation } from "./types"
import type { DreamInsight } from "../dream/types"

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

function makeMutation(overrides: Partial<CodeMutation> = {}): CodeMutation {
  return {
    id: `mut-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
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

function makeInsight(overrides: Partial<DreamInsight> = {}): DreamInsight {
  return {
    id: "insight-1",
    dreamId: "dream-1",
    type: "pattern",
    title: "Test insight",
    description: "test insight description",
    confidence: 0.9,
    sourceCount: 1,
    actionable: true,
    applied: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function recordingRunner(calls: string[][]): CommandRunner {
  return async (_command, args) => {
    calls.push(args)
    return { stdout: "", stderr: "", exitCode: 0 }
  }
}

describe("verification targets the mutated file", () => {
  let root: string
  let dbDir: string
  let store: EvolutionStore

  beforeEach(() => {
    root = tempDir("evolve-fix-verify-")
    dbDir = tempDir("evolve-fix-verify-db-")
    store = new EvolutionStore(undefined, { dbPath: dbDir })
    mkdirSync(join(root, "src", "memory"), { recursive: true })
  })

  afterEach(() => {
    store.close()
    try { rmSync(root, { recursive: true, force: true }) } catch {}
    try { rmSync(dbDir, { recursive: true, force: true }) } catch {}
  })

  it("type checks the project with a working tsc invocation", async () => {
    writeFileSync(join(root, "src", "memory", "session.ts"), "export const x = 1\n", "utf-8")

    const calls: string[][] = []
    const engine = new VerificationEngine(store, recordingRunner(calls), { projectRoot: root })
    const mutation = store.createMutation(makeMutation({ filePath: "src/memory/session.ts" }))

    await engine.verifyMutation(mutation)

    expect(calls[0]).toEqual(["x", "tsc", "--noEmit"])
  })

  it("runs the sibling test file of the mutated file", async () => {
    writeFileSync(join(root, "src", "memory", "session.ts"), "export const x = 1\n", "utf-8")
    writeFileSync(join(root, "src", "memory", "session.test.ts"), "import { expect, it } from 'bun:test'\n", "utf-8")

    const calls: string[][] = []
    const engine = new VerificationEngine(store, recordingRunner(calls), { projectRoot: root })
    const mutation = store.createMutation(makeMutation({ filePath: "src/memory/session.ts" }))

    const result = await engine.verifyMutation(mutation)

    expect(result.passed).toBe(true)
    expect(calls[1]).toEqual(["test", "src/memory/session.test.ts"])
  })

  it("falls back to the full test suite when the mutated file has no sibling test", async () => {
    writeFileSync(join(root, "src", "memory", "session.ts"), "export const x = 1\n", "utf-8")

    const calls: string[][] = []
    const engine = new VerificationEngine(store, recordingRunner(calls), { projectRoot: root })
    const mutation = store.createMutation(makeMutation({ filePath: "src/memory/session.ts" }))

    const result = await engine.verifyMutation(mutation)

    expect(result.passed).toBe(true)
    expect(calls[1]).toEqual(["test"])
  })

  it("never verifies a mutation whose test run was killed", async () => {
    writeFileSync(join(root, "src", "memory", "session.ts"), "export const x = 1\n", "utf-8")

    const killedRunner: CommandRunner = async (_command, args) => {
      if (args[0] === "x") return { stdout: "", stderr: "", exitCode: 0 }
      return { stdout: "", stderr: "Command timed out", exitCode: -1 }
    }
    const engine = new VerificationEngine(store, killedRunner, {
      projectRoot: root,
      requireTestPass: false,
    })
    const mutation = store.createMutation(makeMutation({ filePath: "src/memory/session.ts" }))

    const result = await engine.verifyMutation(mutation)

    expect(result.passed).toBe(false)
    expect(store.getMutation(mutation.id)?.status).toBe("failed")
  })
})

describe("runCommand always terminates", () => {
  it("resolves with a failure when the child does not exit on its own", async () => {
    const started = Date.now()
    const result = await runCommand(process.execPath, ["-e", "setInterval(() => {}, 1000)"], 300)
    const elapsed = Date.now() - started

    expect(result.exitCode).toBeLessThan(0)
    expect(elapsed).toBeLessThan(15000)
  }, 20000)
})

describe("strategy selection", () => {
  let dir: string

  beforeEach(() => {
    dir = tempDir("evolve-fix-strategy-")
  })

  afterEach(() => {
    try { rmSync(dir, { recursive: true, force: true }) } catch {}
  })

  function analyze(gen: MutationGenerator, name: string, content: string) {
    const filePath = join(dir, name)
    writeFileSync(filePath, content, "utf-8")
    const analysis = gen.analyzeFile(filePath)
    expect(analysis).not.toBeNull()
    return analysis!
  }

  it("does not treat a normal comparison as a non-null assertion", () => {
    const gen = new MutationGenerator()
    const analysis = analyze(gen, "compare.ts", "export const check = (a: number, b: number) => a !== b && !a\n")

    expect(analysis.hasNonNullAssertion).toBe(false)
  })

  it("detects a real postfix non-null assertion", () => {
    const gen = new MutationGenerator()
    const analysis = analyze(gen, "assert.ts", "export const value = getValue()!.field\n")

    expect(analysis.hasNonNullAssertion).toBe(true)
  })

  it("no longer routes every file to type-improvement", () => {
    const gen = new MutationGenerator()
    const analysis = analyze(
      gen,
      "clean.ts",
      "export function add(a: number, b: number): number {\n  return a + b\n}\n",
    )

    const strategy = gen.strategyForInsight(makeInsight({ description: "add a try catch block" }), analysis)

    expect(strategy).not.toBe("type-improvement")
    expect(strategy).toBe("error-handling")
  })

  it("routes a file with a real assertion to type-improvement", () => {
    const gen = new MutationGenerator()
    const analysis = analyze(gen, "asserted.ts", "export const value = getValue()!.field\n")

    const strategy = gen.strategyForInsight(makeInsight({ description: "tighten the types" }), analysis)

    expect(strategy).toBe("type-improvement")
  })

  it("keeps the remaining strategies reachable", () => {
    const gen = new MutationGenerator()
    const analysis = analyze(
      gen,
      "guarded.ts",
      "export function run(a: number): number {\n  try {\n    return a\n  } catch (err) {\n    return 0\n  }\n}\n",
    )

    expect(gen.strategyForInsight(makeInsight({ description: "this is a security concern" }), analysis)).toBe("security")
    expect(gen.strategyForInsight(makeInsight({ description: "slow hot path" }), analysis)).toBe("performance")
    expect(gen.strategyForInsight(makeInsight({ description: "clarity of the code" }), analysis)).toBe("readability")
    expect(gen.strategyForInsight(makeInsight({ description: "incorrect result" }), analysis)).toBe("bugfix")
    expect(
      gen.strategyForInsight(makeInsight({ type: "counterfactual", description: "what if it were cached" }), analysis),
    ).toBe("optimize")
  })
})

describe("type improvement rewrites", () => {
  let dir: string

  beforeEach(() => {
    dir = tempDir("evolve-fix-types-")
  })

  afterEach(() => {
    try { rmSync(dir, { recursive: true, force: true }) } catch {}
  })

  function buildTypeImprovements(gen: MutationGenerator, filePath: string): unknown {
    const analysis = gen.analyzeFile(filePath)
    expect(analysis).not.toBeNull()
    const accessor = gen as unknown as {
      buildTypeImprovements: (a: NonNullable<typeof analysis>) => unknown
    }
    return accessor.buildTypeImprovements(analysis!)
  }

  it("does not rewrite catch clauses", () => {
    const gen = new MutationGenerator()
    const filePath = join(dir, "catch.ts")
    writeFileSync(
      filePath,
      "export function run(): void {\n  try {\n    work()\n  } catch (err) {\n    console.log(err.message)\n  }\n}\n",
      "utf-8",
    )

    expect(buildTypeImprovements(gen, filePath)).toBeNull()
  })

  it("leaves an any annotation alone when the value is used", () => {
    const gen = new MutationGenerator()
    const filePath = join(dir, "used.ts")
    writeFileSync(filePath, "function read(value: any) {\n  return value.field\n}\n", "utf-8")

    expect(buildTypeImprovements(gen, filePath)).toBeNull()
  })

  it("narrows an unused any annotation to unknown", () => {
    const gen = new MutationGenerator()
    const filePath = join(dir, "unused.ts")
    writeFileSync(filePath, "function read(value: any) {\n  return 1\n}\n", "utf-8")

    const changes = buildTypeImprovements(gen, filePath) as Array<{ line: number; text: string }> | null

    expect(changes).not.toBeNull()
    expect(changes?.[0]?.text).toContain(": unknown")
    expect(changes?.[0]?.text).not.toContain("catch")
  })
})

describe("code mutator guards", () => {
  let root: string
  let backupDir: string
  let dbDir: string
  let store: EvolutionStore

  beforeEach(() => {
    root = tempDir("evolve-fix-mutator-")
    backupDir = join(root, "backups")
    dbDir = tempDir("evolve-fix-mutator-db-")
    store = new EvolutionStore(undefined, { dbPath: dbDir })
    mkdirSync(join(root, "src"), { recursive: true })
  })

  afterEach(() => {
    store.close()
    try { rmSync(root, { recursive: true, force: true }) } catch {}
    try { rmSync(dbDir, { recursive: true, force: true }) } catch {}
  })

  it("refuses to apply a mutation whose base content is stale", () => {
    const target = join(root, "src", "stale.ts")
    writeFileSync(target, "const x = 1\n", "utf-8")

    const mutator = new CodeMutator(store, { projectRoot: root, allowedDirs: ["src"], backupDir })
    const mutation = store.createMutation(
      makeMutation({ filePath: "src/stale.ts", oldContent: "const x = 0\n", newContent: "const x = 2\n" }),
    )

    const result = mutator.applyMutation(mutation)

    expect(result).toBe(false)
    expect(readFileSync(target, "utf-8")).toBe("const x = 1\n")
    expect(store.getMutation(mutation.id)?.status).toBe("failed")
  })

  it("keeps a separate backup per mutation of the same file", () => {
    const target = join(root, "src", "shared.ts")
    writeFileSync(target, "const x = 1\n", "utf-8")

    const mutator = new CodeMutator(store, { projectRoot: root, allowedDirs: ["src"], backupDir })

    const first = store.createMutation(
      makeMutation({ filePath: "src/shared.ts", oldContent: "const x = 1\n", newContent: "const a = 2\n" }),
    )
    expect(mutator.applyMutation(first)).toBe(true)

    writeFileSync(target, "const x = 1\n", "utf-8")

    const second = store.createMutation(
      makeMutation({ filePath: "src/shared.ts", oldContent: "const x = 1\n", newContent: "const b = 3\n" }),
    )
    expect(mutator.applyMutation(second)).toBe(true)

    const backups = readdirSync(backupDir).filter((f) => f.endsWith(".bak"))
    expect(backups.length).toBe(2)
    expect(backups.some((f) => f.endsWith(`${first.id}.bak`))).toBe(true)
    expect(backups.some((f) => f.endsWith(`${second.id}.bak`))).toBe(true)

    expect(mutator.rollbackMutation(second)).toBe(true)
    expect(readFileSync(target, "utf-8")).toBe("const x = 1\n")
  })
})

describe("store isolation", () => {
  let root: string
  let backupDir: string
  let dbDir: string
  let store: EvolutionStore

  beforeEach(() => {
    root = tempDir("evolve-fix-isolation-")
    backupDir = join(root, "backups")
    dbDir = tempDir("evolve-fix-isolation-db-")
    store = new EvolutionStore(undefined, { dbPath: dbDir })
    mkdirSync(join(root, "src"), { recursive: true })
  })

  afterEach(() => {
    store.close()
    try { rmSync(root, { recursive: true, force: true }) } catch {}
    try { rmSync(dbDir, { recursive: true, force: true }) } catch {}
  })

  it("writes generator mutations to the injected store", () => {
    const gen = new MutationGenerator(store)
    const mutation = gen.generateMutation({
      filePath: "src/evolve/mutation-generator.ts",
      strategy: "readability",
      description: "clarify the generator",
      changes: [{ type: "insert-after", line: 1, text: "// clarity" }],
    })

    expect(mutation).not.toBeNull()
    expect(store.getMutation(mutation!.id)).not.toBeNull()
    expect(evolutionStore.getMutation(mutation!.id)).toBeNull()
  })

  it("writes mutator state to the injected store", () => {
    const target = join(root, "src", "mutated.ts")
    writeFileSync(target, "const x = 1\n", "utf-8")

    const mutator = new CodeMutator(store, { projectRoot: root, allowedDirs: ["src"], backupDir })
    const mutation = store.createMutation(
      makeMutation({ filePath: "src/mutated.ts", oldContent: "const x = 1\n", newContent: "const x = 2\n" }),
    )

    expect(mutator.applyMutation(mutation)).toBe(true)
    expect(store.getMutation(mutation.id)?.status).toBe("verifying")
    expect(evolutionStore.getMutation(mutation.id)).toBeNull()
  })
})

describe("engine store isolation", () => {
  let dbDir: string
  let engine: EvolutionEngine

  beforeEach(() => {
    dbDir = tempDir("evolve-fix-engine-")
  })

  afterEach(() => {
    if (engine) engine.close()
    try { rmSync(dbDir, { recursive: true, force: true }) } catch {}
  })

  it("writes proposed mutations to its own store instead of the global singleton", () => {
    const insight = makeInsight({
      description: "readability of source_failure_ids and rollback_at",
    })

    const source: DreamInsightSource = {
      getInsights: () => [insight],
      markInsightApplied: () => {},
    }

    engine = new EvolutionEngine(undefined, { dbPath: dbDir, insightSource: source })

    const mutations = engine.proposeFromDreams()

    expect(mutations.length).toBeGreaterThan(0)
    const stored = engine.listMutations(50).map((m) => m.id)
    for (const mutation of mutations) {
      expect(stored).toContain(mutation.id)
      expect(evolutionStore.getMutation(mutation.id)).toBeNull()
    }
  })

  it("reports apply failures through its own store", () => {
    engine = new EvolutionEngine(undefined, { dbPath: dbDir })

    const mutation = engine.proposeMutation({
      filePath: "src/evolve/does-not-exist-for-test.ts",
      strategy: "refactor",
      description: "missing file",
      diff: "",
      oldContent: "",
      newContent: "",
      confidence: 0.5,
      sourceInsight: "",
    })

    expect(engine.applyMutation(mutation.id)).toBe(false)
    expect(engine.listMutations(50).find((m) => m.id === mutation.id)?.status).toBe("failed")
    expect(evolutionStore.getMutation(mutation.id)).toBeNull()
  })
})

describe("store invariants", () => {
  let dbDir: string
  let store: EvolutionStore

  beforeEach(() => {
    dbDir = tempDir("evolve-fix-store-")
    store = new EvolutionStore(undefined, { dbPath: dbDir })
  })

  afterEach(() => {
    store.close()
    try { rmSync(dbDir, { recursive: true, force: true }) } catch {}
  })

  it("enables foreign keys", () => {
    expect(store.isForeignKeysEnabled()).toBe(true)
  })

  it("returns a zero pass rate for an empty store", () => {
    expect(store.getStats().passRate).toBe(0)
  })

  it("generates unique mutation ids within the same millisecond", () => {
    const ids = new Set<string>()
    for (let i = 0; i < 25; i++) {
      ids.add(store.createMutation(makeMutation()).id)
    }
    expect(ids.size).toBe(25)
    for (const id of ids) {
      expect(id.startsWith("mut-")).toBe(true)
    }
  })

  it("closes idempotently", () => {
    store.getStats()
    store.close()
    expect(() => store.close()).not.toThrow()
  })
})
