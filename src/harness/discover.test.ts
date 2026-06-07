import { describe, it, expect } from "bun:test"
import { TestDiscoverer, discoverTests } from "./discover"
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import type { TestCase } from "./types"

// ── YAML Parser Tests ─────────────────────────────────────────

describe("YAML parsing", () => {
  // We test the public API through the YAML loader by feeding content to discover

  it("should parse a basic YAML frontmatter test", () => {
    const yaml = `---
name: Basic Test
prompt: Run echo hello
category: smoke
priority: high
tags: [smoke, quick]
timeout: 30000
---
Run echo hello world
`
    const discoverer = new TestDiscoverer()
    // Create a temp file approach - use inline content via the loader
    // Instead, test via the public discover method by creating a temp file
    const dir = mkdtempSync(".test-discover-")

    try {
      writeFileSync(join(dir, "test.yaml"), yaml, "utf-8")
      const tests = discoverer.discover([dir])
      expect(tests).toHaveLength(1)
      expect(tests[0].name).toBe("Basic Test")
      expect(tests[0].category).toBe("smoke")
      expect(tests[0].priority).toBe("high")
      expect(tests[0].tags).toEqual(["smoke", "quick"])
      expect(tests[0].timeout).toBe(30000)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
  })

  it("should return null when name is missing", () => {
    const yaml = `---
category: smoke
---
Some prompt
`
    const dir = mkdtempSync(".test-discover-noname-")

    try {
      writeFileSync(join(dir, "test.yaml"), yaml, "utf-8")
      const discoverer = new TestDiscoverer()
      const tests = discoverer.discover([dir])
      expect(tests).toHaveLength(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("should parse nested expected object", () => {
    const yaml = `---
name: Expected Test
prompt: do it
category: capability
tags: []
timeout: 5000
expected:
  pattern: Hello World
  maxSteps: 10
  maxTokens: 1000
---
`
    const dir = mkdtempSync(".test-discover-expected-")

    try {
      writeFileSync(join(dir, "test.yaml"), yaml, "utf-8")
      const discoverer = new TestDiscoverer()
      const tests = discoverer.discover([dir])
      expect(tests).toHaveLength(1)
      expect(tests[0].expected?.pattern).toBe("Hello World")
      expect(tests[0].expected?.maxSteps).toBe(10)
      expect(tests[0].expected?.maxTokens).toBe(1000)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("should parse nested setup with block scalar for file content", () => {
    const yaml = `---
name: Setup Test
prompt: run setup
category: capability
tags: []
timeout: 5000
setup:
  commands:
    - npm init -y
  files:
    src/index.ts: |
      import express from 'express'
      const app = express()
---
`
    const dir = mkdtempSync(".test-discover-setup-")

    try {
      writeFileSync(join(dir, "test.yaml"), yaml, "utf-8")
      const discoverer = new TestDiscoverer()
      const tests = discoverer.discover([dir])
      expect(tests).toHaveLength(1)
      expect(tests[0].setup?.files?.["src/index.ts"]).toContain("import express from 'express'")
      expect(tests[0].setup?.commands).toContain("npm init -y")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("should parse boolean and number values", () => {
    const yaml = `---
name: Types Test
prompt: test types
category: regression
tags: []
timeout: 10000
cleanup: false
expected:
  exitCode: 0
---
`
    const dir = mkdtempSync(".test-discover-types-")

    try {
      writeFileSync(join(dir, "test.yaml"), yaml, "utf-8")
      const discoverer = new TestDiscoverer()
      const tests = discoverer.discover([dir])
      expect(tests).toHaveLength(1)
      expect(tests[0].cleanup).toBe(false)
      expect(tests[0].expected?.exitCode).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ── Markdown Loader Tests ─────────────────────────────────────

describe("Markdown loader", () => {
  it("should parse a basic .md test file", () => {
    const md = `# Hello World Test

Run a simple hello world

## tags: smoke, basic
## timeout: 60000
## category: smoke
`
    const dir = mkdtempSync(".test-discover-md-")

    try {
      writeFileSync(join(dir, "test.md"), md, "utf-8")
      const discoverer = new TestDiscoverer()
      const tests = discoverer.discover([dir])
      expect(tests).toHaveLength(1)
      expect(tests[0].name).toBe("Hello World Test")
      expect(tests[0].tags).toContain("smoke")
      expect(tests[0].tags).toContain("basic")
      expect(tests[0].timeout).toBe(60000)
      expect(tests[0].category).toBe("smoke")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("should skip files with no valid name", () => {
    const md = ``
    const dir = mkdtempSync(".test-discover-empty-")

    try {
      writeFileSync(join(dir, "empty.md"), md, "utf-8")
      const discoverer = new TestDiscoverer()
      const tests = discoverer.discover([dir])
      expect(tests).toHaveLength(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("should extract prompt body after stripping headers", () => {
    const md = `# My Test

This is the prompt body.

## tags: smoke
## timeout: 30000
`
    const dir = mkdtempSync(".test-discover-prompt-")

    try {
      writeFileSync(join(dir, "test.md"), md, "utf-8")
      const discoverer = new TestDiscoverer()
      const tests = discoverer.discover([dir])
      expect(tests[0].prompt).toContain("This is the prompt body.")
      expect(tests[0].prompt).not.toContain("tags: smoke")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ── TestDiscoverer Operations ─────────────────────────────────

describe("TestDiscoverer", () => {
  // ── applyFilter ─────────────────────────────────────────────

  const sampleTests: TestCase[] = [
    {
      id: "t1",
      name: "Smoke Test",
      prompt: "",
      tags: ["smoke"],
      timeout: 10000,
      category: "smoke",
      priority: "critical",
    },
    {
      id: "t2",
      name: "Coding Test",
      prompt: "",
      tags: ["coding", "typescript"],
      timeout: 30000,
      category: "capability",
      priority: "high",
    },
    {
      id: "t3",
      name: "Debug Test",
      prompt: "",
      tags: ["debugging", "python"],
      timeout: 60000,
      category: "regression",
      priority: "medium",
    },
    {
      id: "t4",
      name: "Security Test",
      prompt: "",
      tags: ["adversarial"],
      timeout: 120000,
      category: "adversarial",
      priority: "critical",
    },
  ]

  it("should filter by category", () => {
    const discoverer = new TestDiscoverer()
    const filtered = discoverer.applyFilter(sampleTests, { category: "smoke" })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe("t1")
  })

  it("should filter by multiple categories", () => {
    const discoverer = new TestDiscoverer()
    const filtered = discoverer.applyFilter(sampleTests, {
      category: ["smoke", "capability"],
    })
    expect(filtered).toHaveLength(2)
  })

  it("should filter by tags with OR mode", () => {
    const discoverer = new TestDiscoverer()
    const filtered = discoverer.applyFilter(sampleTests, {
      tags: { include: ["python", "smoke"], mode: "or" },
    })
    expect(filtered).toHaveLength(2) // t1 (smoke), t3 (python)
  })

  it("should filter by tags with AND mode", () => {
    const t5: TestCase = {
      id: "t5",
      name: "Full Stack",
      prompt: "",
      tags: ["coding", "typescript", "fullstack"],
      timeout: 30000,
      category: "capability",
      priority: "high",
    }
    const discoverer = new TestDiscoverer()
    const filtered = discoverer.applyFilter([...sampleTests, t5], {
      tags: { include: ["coding", "typescript"], mode: "and" },
    })
    expect(filtered).toHaveLength(2) // t2, t5
  })

  it("should filter by tag exclusion", () => {
    const discoverer = new TestDiscoverer()
    const filtered = discoverer.applyFilter(sampleTests, {
      tags: { exclude: ["smoke", "adversarial"] },
    })
    expect(filtered).toHaveLength(2) // t2, t3
  })

  it("should filter by priority", () => {
    const discoverer = new TestDiscoverer()
    const filtered = discoverer.applyFilter(sampleTests, { priority: "critical" })
    expect(filtered).toHaveLength(2) // t1, t4
  })

  it("should filter by name pattern", () => {
    const discoverer = new TestDiscoverer()
    const filtered = discoverer.applyFilter(sampleTests, { namePattern: "smoke|debug" })
    expect(filtered).toHaveLength(2) // t1, t3
  })

  it("should filter by id pattern", () => {
    const discoverer = new TestDiscoverer()
    const filtered = discoverer.applyFilter(sampleTests, { idPattern: "t[23]" })
    expect(filtered).toHaveLength(2) // t2, t3
  })

  it("should return all tests when filter is empty", () => {
    const discoverer = new TestDiscoverer()
    const filtered = discoverer.applyFilter(sampleTests, {})
    expect(filtered).toHaveLength(4)
  })

  it("should handle invalid regex in namePattern gracefully", () => {
    const discoverer = new TestDiscoverer()
    // Invalid regex should not crash — returns unfiltered
    const filtered = discoverer.applyFilter(sampleTests, { namePattern: "[invalid" })
    expect(filtered).toHaveLength(4)
  })

  // ── resolveDependencies ─────────────────────────────────────

  it("should return tests in original order when no dependencies", () => {
    const discoverer = new TestDiscoverer()
    const sorted = discoverer.resolveDependencies(sampleTests)
    expect(sorted.map((s) => s.id)).toEqual(["t1", "t2", "t3", "t4"])
  })

  it("should sort tests respecting dependency order", () => {
    const tests: TestCase[] = [
      { id: "a", name: "A", prompt: "", tags: [], timeout: 10000, dependsOn: ["c"] },
      { id: "b", name: "B", prompt: "", tags: [], timeout: 10000, dependsOn: ["a"] },
      { id: "c", name: "C", prompt: "", tags: [], timeout: 10000 },
    ]

    const discoverer = new TestDiscoverer()
    const sorted = discoverer.resolveDependencies(tests)
    const ids = sorted.map((s) => s.id)
    // c must come before a, and a must come before b
    expect(ids.indexOf("c")).toBeLessThan(ids.indexOf("a"))
    expect(ids.indexOf("a")).toBeLessThan(ids.indexOf("b"))
  })

  it("should handle circular dependencies gracefully", () => {
    const tests: TestCase[] = [
      { id: "x", name: "X", prompt: "", tags: [], timeout: 10000, dependsOn: ["y"] },
      { id: "y", name: "Y", prompt: "", tags: [], timeout: 10000, dependsOn: ["x"] },
    ]

    const discoverer = new TestDiscoverer()
    // Should not throw — circular deps get appended at end
    const sorted = discoverer.resolveDependencies(tests)
    expect(sorted).toHaveLength(2)
  })

  // ── Deduplication ───────────────────────────────────────────

  it("should deduplicate tests with same ID", () => {
    // This uses a temp dir with duplicate IDs (same file name)

    const yaml1 = `---
name: Duplicate Test
id: dup-test
prompt: test
category: smoke
tags: []
timeout: 5000
---
`
    const yaml2 = `---
name: Duplicate Test 2
id: dup-test
prompt: test 2
category: smoke
tags: []
timeout: 5000
---
`
    const dir = mkdtempSync(".test-discover-dedup-")

    try {
      // Create two separate dirs, each with a test with the same ID
      const dirA = join(dir, "a")
      const dirB = join(dir, "b")
      mkdirSync(dirA, { recursive: true })
      mkdirSync(dirB, { recursive: true })
      writeFileSync(join(dirA, "test.yaml"), yaml1, "utf-8")
      writeFileSync(join(dirB, "test.yaml"), yaml2, "utf-8")

      const discoverer = new TestDiscoverer()
      const tests = discoverer.discover([dirA, dirB])
      // Should deduplicate to 1 test
      expect(tests).toHaveLength(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ── Backward Compat ───────────────────────────────────────────

describe("discoverTests()", () => {
  it("should be a function", () => {
    expect(typeof discoverTests).toBe("function")
  })

  it("should return an array of test cases", () => {
    const tests = discoverTests()
    expect(Array.isArray(tests)).toBe(true)
  })
})
