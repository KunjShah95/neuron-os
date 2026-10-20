import { describe, it, expect, afterEach } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { isSafeSkillName } from "./remote"
import { isValidSkillName, resolveSkillDir, untrustedSkillsRoot } from "./evolution/hub-client"

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
  tempDirs.length = 0
})

describe("remote skill name sanitization", () => {
  it("accepts ordinary skill names", () => {
    expect(isSafeSkillName("my-skill")).toBe(true)
    expect(isSafeSkillName("My_Skill2")).toBe(true)
    expect(isSafeSkillName("skill.name")).toBe(true)
  })

  it("rejects traversal and path-bearing names", () => {
    expect(isSafeSkillName("../../../../home/user/.config/autostart/x")).toBe(false)
    expect(isSafeSkillName("..")).toBe(false)
    expect(isSafeSkillName("evil/name")).toBe(false)
    expect(isSafeSkillName("evil\\name")).toBe(false)
    expect(isSafeSkillName("")).toBe(false)
    expect(isSafeSkillName("a".repeat(65))).toBe(false)
    expect(isSafeSkillName(undefined)).toBe(false)
    expect(isSafeSkillName(42)).toBe(false)
  })

  it("is used consistently by the hub client", () => {
    expect(isValidSkillName("../../evil")).toBe(false)
    expect(isValidSkillName("safe-skill")).toBe(true)
  })
})

describe("skill install directory containment", () => {
  it("keeps the resolved skill directory inside the skills root", () => {
    const root = mkdtempSync(join(tmpdir(), "aegis-skill-root-"))
    tempDirs.push(root)

    expect(resolveSkillDir(root, "safe-skill")).toBe(resolve(root, "safe-skill"))
    expect(() => resolveSkillDir(root, "../escape")).toThrow()
    expect(() => resolveSkillDir(root, "../../escape")).toThrow()
  })

  it("does not write into the repo tree for the default untrusted root", () => {
    const root = untrustedSkillsRoot()
    const repoRoot = resolve(process.cwd())
    expect(root.startsWith(repoRoot + "/") || root.startsWith(repoRoot + "\\")).toBe(false)
  })
})

describe("skill name regression guard", () => {
  it("never resolves a malicious name to a path outside the skills root", () => {
    const root = mkdtempSync(join(tmpdir(), "aegis-skill-root-"))
    tempDirs.push(root)

    for (const bad of ["../../evil", "..", "evil/name", "evil\\name"]) {
      expect(() => resolveSkillDir(root, bad)).toThrow()
    }
    expect(existsSync(resolve(root, "..", "evil"))).toBe(false)
  })
})
