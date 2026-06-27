import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { SkillRegistry } from "./registry"
import { buildSkillMarkdown, type RemoteSkill } from "./remote"

const mockSkill: RemoteSkill = {
  id: "test-skill",
  name: "test-skill",
  description: "A test skill for integration tests",
  owner: "test-owner",
  repo: "test-owner/test-skill",
  installs: 42,
  tags: ["test", "integration"],
}

describe("buildSkillMarkdown", () => {
  test("generates valid SKILL.md frontmatter", () => {
    const md = buildSkillMarkdown(mockSkill)
    expect(md).toContain("---")
    expect(md).toContain("name: test-skill")
    expect(md).toContain("description: A test skill for integration tests")
    expect(md).toContain("author: test-owner")
    expect(md).toContain("tags: [test, integration]")
  })

  test("omits tags line when empty", () => {
    const md = buildSkillMarkdown({ ...mockSkill, tags: [] })
    expect(md).not.toContain("tags:")
  })

  test("output is parseable by SkillRegistry", async () => {
    const dir = mkdtempSync(join(tmpdir(), "skill-test-"))
    const skillDir = join(dir, "test-skill")
    mkdirSync(skillDir)
    writeFileSync(join(skillDir, "SKILL.md"), buildSkillMarkdown(mockSkill))

    const registry = new SkillRegistry([dir])
    await registry.loadAll()

    const skill = registry.get("test-skill")
    expect(skill).toBeDefined()
    expect(skill!.metadata.name).toBe("test-skill")
    expect(skill!.metadata.description).toBe("A test skill for integration tests")
    expect(skill!.metadata.author).toBe("test-owner")

    rmSync(dir, { recursive: true })
  })
})

describe("SkillRegistry.removeSkill", () => {
  let dir: string
  let registry: SkillRegistry

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "skill-test-"))
    const skillDir = join(dir, "test-skill")
    mkdirSync(skillDir)
    writeFileSync(join(skillDir, "SKILL.md"), buildSkillMarkdown(mockSkill))
    registry = new SkillRegistry([dir])
    await registry.loadAll()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test("removes skill from in-memory registry", () => {
    expect(registry.get("test-skill")).toBeDefined()
    registry.removeSkill("test-skill")
    expect(registry.get("test-skill")).toBeUndefined()
    expect(registry.list()).toHaveLength(0)
  })

  test("noop when skill does not exist", () => {
    expect(() => registry.removeSkill("nonexistent")).not.toThrow()
  })
})

describe("SkillRegistry install → load → uninstall cycle", () => {
  let dir: string
  let registry: SkillRegistry

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "skill-test-"))
    registry = new SkillRegistry([dir])
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test("install: write SKILL.md → loadAll → skill is registered", async () => {
    const skillDir = join(dir, mockSkill.name)
    mkdirSync(skillDir)
    writeFileSync(join(skillDir, "SKILL.md"), buildSkillMarkdown(mockSkill))

    await registry.loadAll()
    expect(registry.get(mockSkill.name)).toBeDefined()
    expect(registry.list()).toHaveLength(1)
  })

  test("uninstall: removeSkill + delete dir → skill is gone from registry", async () => {
    const skillDir = join(dir, mockSkill.name)
    mkdirSync(skillDir)
    writeFileSync(join(skillDir, "SKILL.md"), buildSkillMarkdown(mockSkill))
    await registry.loadAll()
    expect(registry.get(mockSkill.name)).toBeDefined()

    rmSync(skillDir, { recursive: true })
    registry.removeSkill(mockSkill.name)
    expect(registry.get(mockSkill.name)).toBeUndefined()
  })

  test("update: overwrite SKILL.md → loadAll → metadata reflects update", async () => {
    const skillDir = join(dir, mockSkill.name)
    mkdirSync(skillDir)
    writeFileSync(join(skillDir, "SKILL.md"), buildSkillMarkdown(mockSkill))
    await registry.loadAll()

    const updated = { ...mockSkill, description: "Updated description" }
    writeFileSync(join(skillDir, "SKILL.md"), buildSkillMarkdown(updated))
    await registry.loadAll()

    expect(registry.get(mockSkill.name)!.metadata.description).toBe("Updated description")
  })

  test("multiple skills coexist in same dir", async () => {
    for (const name of ["skill-a", "skill-b", "skill-c"]) {
      const sd = join(dir, name)
      mkdirSync(sd)
      writeFileSync(join(sd, "SKILL.md"), buildSkillMarkdown({ ...mockSkill, id: name, name }))
    }

    await registry.loadAll()
    expect(registry.list()).toHaveLength(3)
    expect(registry.get("skill-a")).toBeDefined()
    expect(registry.get("skill-b")).toBeDefined()
    expect(registry.get("skill-c")).toBeDefined()
  })

  test("loadAll is idempotent — repeated calls don't duplicate entries", async () => {
    const skillDir = join(dir, mockSkill.name)
    mkdirSync(skillDir)
    writeFileSync(join(skillDir, "SKILL.md"), buildSkillMarkdown(mockSkill))

    await registry.loadAll()
    await registry.loadAll()
    await registry.loadAll()

    expect(registry.list()).toHaveLength(1)
  })
})
