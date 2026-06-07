import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { randomUUID } from "node:crypto"
import { HarnessSandboxManager } from "./sandbox"
import type { TestCase } from "./types"

const TMP_ROOT = resolve(process.cwd(), ".test-tmp", "sandbox-tests")

function makeTest(overrides: Partial<TestCase> = {}): TestCase {
  return {
    id: `sandbox-test-${randomUUID().slice(0, 8)}`,
    name: "Sandbox Test",
    prompt: "do something",
    tags: overrides.tags ?? [],
    timeout: 30000,
    setup: {
      commands: [],
      files: {},
    },
    ...overrides,
  }
}

describe("HarnessSandboxManager", () => {
  let manager: HarnessSandboxManager

  beforeEach(() => {
    manager = new HarnessSandboxManager()
  })

  afterEach(() => {
    // Cleanup temp files
    try {
      rmSync(TMP_ROOT, { recursive: true, force: true })
    } catch {
      // ok
    }
  })

  // ── create ──────────────────────────────────────────────────

  it("should create a sandbox with a workDir", async () => {
    const test = makeTest()
    const handle = await manager.create(test)

    expect(handle.id).toBeTruthy()
    expect(handle.workDir).toBeTruthy()
    expect(handle.config.type).toBe("filesystem")
    expect(existsSync(handle.workDir)).toBe(true)

    await manager.cleanup(handle)
  })

  it("should write setup files to the sandbox", async () => {
    const test = makeTest({
      setup: {
        commands: [],
        files: {
          "hello.txt": "Hello, World!",
          "src/index.ts": "console.log('test')",
        },
      },
    })

    const handle = await manager.create(test)
    const helloPath = resolve(handle.workDir, "hello.txt")
    const indexPath = resolve(handle.workDir, "src", "index.ts")

    expect(existsSync(helloPath)).toBe(true)
    expect(readFileSync(helloPath, "utf-8")).toBe("Hello, World!")
    expect(existsSync(indexPath)).toBe(true)
    expect(readFileSync(indexPath, "utf-8")).toBe("console.log('test')")

    await manager.cleanup(handle)
  })

  it("should use test id in sandbox directory name", async () => {
    const test = makeTest({ id: "my-custom-test" })
    const handle = await manager.create(test)

    expect(handle.workDir).toContain("my-custom-test")
    await manager.cleanup(handle)
  })

  it("should create sandbox even without setup files", async () => {
    const test = makeTest({ setup: undefined })
    const handle = await manager.create(test)

    expect(existsSync(handle.workDir)).toBe(true)
    // Should have no files
    const files = manager.snapshot(handle)
    // Cleanup
    await manager.cleanup(handle)
  })

  // ── snapshot ────────────────────────────────────────────────

  it("should return a snapshot with file lists", async () => {
    const test = makeTest({
      setup: {
        commands: [],
        files: { "a.txt": "a", "b.txt": "b" },
      },
    })

    const handle = await manager.create(test)
    const snapshot = await manager.snapshot(handle)

    expect(snapshot.before).toBeDefined()
    expect(Array.isArray(snapshot.created)).toBe(true)
    expect(Array.isArray(snapshot.deleted)).toBe(true)

    await manager.cleanup(handle)
  })

  // ── cleanup ─────────────────────────────────────────────────

  it("should remove the sandbox directory on cleanup", async () => {
    const test = makeTest()
    const handle = await manager.create(test)

    expect(existsSync(handle.workDir)).toBe(true)
    await manager.cleanup(handle)
    expect(existsSync(handle.workDir)).toBe(false)
  })

  it("should keep sandbox when keepAfterTest is true", async () => {
    const test = makeTest()
    const handle = await manager.create(test, { keepAfterTest: true })

    expect(existsSync(handle.workDir)).toBe(true)
    await manager.cleanup(handle)
    // Should still exist because keepAfterTest was true
    expect(existsSync(handle.workDir)).toBe(true)

    // Clean up manually
    rmSync(handle.workDir, { recursive: true, force: true })
  })

  it("should not crash on cleanup of already-deleted sandbox", async () => {
    const test = makeTest()
    const handle = await manager.create(test)

    rmSync(handle.workDir, { recursive: true, force: true })
    await expect(manager.cleanup(handle)).resolves.toBeUndefined()
  })

  // ── getPolicy ───────────────────────────────────────────────

  it("should resolve policy from test tags", () => {
    const test = makeTest({ tags: ["policy:adversarial"] })
    const policy = manager.getPolicy(test)
    expect(policy.networkAccess).toBe("none")
  })

  it("should default to standard policy", () => {
    const test = makeTest({ tags: [] })
    const policy = manager.getPolicy(test)
    expect(policy.networkAccess).toBe("outbound-only")
  })

  // ── scanForSecrets ──────────────────────────────────────────

  it("should detect secrets in test output", () => {
    const test = makeTest({ tags: [] })
    const secrets = manager.scanForSecrets(test, "sk-proj-abc123...")
    expect(secrets.length).toBeGreaterThan(0)
  })

  it("should return empty array for safe output", () => {
    const test = makeTest({ tags: [] })
    const secrets = manager.scanForSecrets(test, "echo hello world")
    expect(secrets).toHaveLength(0)
  })

  // ── snapshotDiff ────────────────────────────────────────────

  it("should create a baseline and diff", async () => {
    const test = makeTest({
      setup: {
        commands: [],
        files: { "before.txt": "before content" },
      },
    })
    const handle = await manager.create(test)

    // Store initial state as baseline
    const initial = await manager.snapshot(handle)
    manager.storeBaseline(handle, initial)

    // Write a new file (simulating agent action)
    const newFilePath = resolve(handle.workDir, "after.txt")
    const readFs = await import("node:fs")
    readFs.writeFileSync(newFilePath, "after content", "utf-8")

    // Get diff
    const diff = await manager.snapshotDiff(handle)
    expect(diff.created).toContain("after.txt")
    expect(diff.before).toBeDefined()

    await manager.cleanup(handle)
  })
})
