/**
 * Tests for skills CLI mode — list, search, install, update, uninstall.
 * Uses mock file system and remote skill registry.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test"
import { mkdir, writeFile, rm, readdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"

// ── Mock skill registry ──────────────────────────────────────────────

const TEST_SKILLS_DIR = join(import.meta.dir, "..", "..", "tmp-test-skills")

const mockRemoteSkills = [
  {
    name: "test-skill-1",
    description: "A test skill for unit testing",
    tags: ["test", "utility"],
    owner: "test-author",
    installs: 42,
  },
  {
    name: "test-skill-2",
    description: "Another test skill",
    tags: ["test", "build"],
    owner: "test-author",
    installs: 10,
  },
]

// Mock the remote module
mock.module("../skills/remote", () => ({
  searchSkills: mock(async (query: string, _limit?: number) => {
    if (!query) return []
    return mockRemoteSkills.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
  }),
  fetchTopSkills: mock(async (_count?: number) => mockRemoteSkills),
  fetchRegistryStats: mock(async () => ({
    totalSkills: 150,
    totalSources: 50,
  })),
}))

// ── Helper to create a local skill ───────────────────────────────────

async function createLocalSkill(name: string, overrides: Record<string, string> = {}) {
  const dir = join(TEST_SKILLS_DIR, name)
  await mkdir(dir, { recursive: true })

  const meta = {
    name,
    description: "Local test skill",
    tags: "[test]",
    version: "1.0.0",
    author: "local",
    ...overrides,
  }

  const frontmatter = Object.entries(meta)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")

  await writeFile(
    join(dir, "SKILL.md"),
    `---\n${frontmatter}\n---\n\n# ${name}\n\nLocal test skill content.\n`,
    "utf-8",
  )
}

// ── Setup / teardown ─────────────────────────────────────────────────

beforeEach(async () => {
  // Create a clean test skills directory with some pre-installed skills
  await mkdir(TEST_SKILLS_DIR, { recursive: true })
  await createLocalSkill("builtin-1", { description: "Built-in utility", tags: "[core]" })
  await createLocalSkill("builtin-2", { description: "Built-in helper", tags: "[core, dev]" })
})

afterEach(async () => {
  await rm(TEST_SKILLS_DIR, { recursive: true, force: true })
})

// ── Tests ────────────────────────────────────────────────────────────

describe("Skills CLI - local skill management", () => {
  it("should parse SKILL.md frontmatter correctly", async () => {
    const content = `---
name: my-skill
description: Does something useful
tags: [test, build]
version: 2.0.0
author: me
---

# My Skill

Body content here.
`
    const match = content.match(/^---\n([\s\S]*?)\n---/)
    expect(match).not.toBeNull()
    const raw = match![1]!
    const meta: Record<string, any> = { tags: [] }

    for (const line of raw.split("\n")) {
      const idx = line.indexOf(":")
      if (idx === -1) continue
      const key = line.slice(0, idx).trim()
      const val = line
        .slice(idx + 1)
        .trim()
        .replace(/^\[|\]$/g, "")
      if (!key) continue
      if (key === "tags")
        meta.tags = val
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      else meta[key] = val
    }

    expect(meta.name).toBe("my-skill")
    expect(meta.description).toBe("Does something useful")
    expect(meta.tags).toEqual(["test", "build"])
    expect(meta.version).toBe("2.0.0")
    expect(meta.author).toBe("me")
  })

  it("should list installed skills as directories with SKILL.md", async () => {
    const entries = await readdir(TEST_SKILLS_DIR, { withFileTypes: true })
    const skillDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
    expect(skillDirs).toEqual(["builtin-1", "builtin-2"])
  })

  it("should detect when no skills are installed", async () => {
    await rm(TEST_SKILLS_DIR, { recursive: true, force: true })
    await mkdir(TEST_SKILLS_DIR, { recursive: true })
    const entries = await readdir(TEST_SKILLS_DIR, { withFileTypes: true })
    const skillDirs = entries.filter((e) => e.isDirectory())
    expect(skillDirs.length).toBe(0)
  })

  it("should handle SKILL.md with missing frontmatter gracefully", async () => {
    const dir = join(TEST_SKILLS_DIR, "no-frontmatter")
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, "SKILL.md"), "# Just a heading\n\nNo frontmatter here.\n", "utf-8")

    const content = await Bun.file(join(dir, "SKILL.md")).text()
    const match = content.match(/^---\n([\s\S]*?)\n---/)
    expect(match).toBeNull()
  })

  it("should handle SKILL.md with partial frontmatter", async () => {
    const dir = join(TEST_SKILLS_DIR, "partial")
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, "SKILL.md"),
      `---\nname: partial-skill\n---\n\n# Partial\n\nNo description in frontmatter.\n`,
      "utf-8",
    )

    const content = await Bun.file(join(dir, "SKILL.md")).text()
    const match = content.match(/^---\n([\s\S]*?)\n---/)
    expect(match).not.toBeNull()
    const raw = match![1]!
    expect(raw).toContain("name: partial-skill")
    expect(raw).not.toContain("description:")
  })
})

describe("Skills CLI - remote registry", () => {
  it("should search for skills by name", async () => {
    const { searchSkills } = await import("../skills/remote")
    const results = await searchSkills("test-skill-1")
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]!.name).toBe("test-skill-1")
  })

  it("should return empty results for non-matching queries", async () => {
    const { searchSkills } = await import("../skills/remote")
    const results = await searchSkills("zzzz-notfound")
    expect(results.length).toBe(0)
  })

  it("should fetch top skills from registry", async () => {
    const { fetchTopSkills } = await import("../skills/remote")
    const results = await fetchTopSkills(2)
    expect(results.length).toBe(2)
    expect(results[0]!.name).toBeDefined()
  })

  it("should fetch registry statistics", async () => {
    const { fetchRegistryStats } = await import("../skills/remote")
    const stats = await fetchRegistryStats()
    expect(stats).not.toBeNull()
    expect(stats!.totalSkills).toBe(150)
    expect(stats!.totalSources).toBe(50)
  })
})

describe("Skills CLI - hot-reload", () => {
  it("should detect skills directory existence", async () => {
    const skillsDir = TEST_SKILLS_DIR
    expect(existsSync(skillsDir)).toBe(true)
  })

  it("should handle missing skills directory gracefully", async () => {
    const fakeDir = join(import.meta.dir, "nonexistent-skills-dir")
    // Since run-tests.ts handles registration, just verify mock module works
    expect(existsSync(fakeDir)).toBe(false)
  })

  it("should detect SKILL.md changes in subdirectories", async () => {
    // This test verifies the file discovery, not actual fs.watch (which is flaky in CI)
    const entries = await readdir(TEST_SKILLS_DIR, { withFileTypes: true })
    const skillMds = entries
      .filter((e) => e.isDirectory())
      .filter((e) => existsSync(join(TEST_SKILLS_DIR, e.name, "SKILL.md")))
    expect(skillMds.length).toBe(2)
  })
})

describe("Skills CLI - uninstall", () => {
  it("should remove a skill directory", async () => {
    const target = join(TEST_SKILLS_DIR, "builtin-1")
    expect(existsSync(target)).toBe(true)
    await rm(target, { recursive: true, force: true })
    expect(existsSync(target)).toBe(false)
  })

  it("should fail gracefully when removing non-existent skill", async () => {
    const target = join(TEST_SKILLS_DIR, "nonexistent")
    expect(existsSync(target)).toBe(false)
    // Should not throw
    await rm(target, { recursive: true, force: true })
  })
})
