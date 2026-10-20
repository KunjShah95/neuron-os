/**
 * Regression tests for the policy enforcer path matching:
 * a grant for a path prefix must not over-grant sibling paths that
 * merely start with the same characters.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

const TMP_HOME = mkdtempSync(join(tmpdir(), "policy-enforcer-fixes-"))
const PREV_POLICY_DIR = process.env.AEGIS_MEMORY_POLICY_DIR

process.env.AEGIS_MEMORY_POLICY_DIR = TMP_HOME

const { canRead, createDefaultPolicy, matchesPath, savePolicy } = await import("./enforcer")

const NS = "test-ns-enforcer-fixes"
const GRANT_NS = "test-ns-enforcer-fixes-grant"

describe("policy enforcer path matching", () => {
  beforeAll(() => {
    createDefaultPolicy(NS, "team-a")
    savePolicy({
      namespace: GRANT_NS,
      owner: "team-a",
      default: "deny",
      allow: [{ principal: "team-b", path_filter: "notes", tools_allowed: ["read"] }],
      deny: [],
    })
  })

  afterAll(() => {
    try {
      rmSync(TMP_HOME, { recursive: true, force: true })
    } catch {
      // best-effort
    }
    if (PREV_POLICY_DIR === undefined) delete process.env.AEGIS_MEMORY_POLICY_DIR
    else process.env.AEGIS_MEMORY_POLICY_DIR = PREV_POLICY_DIR
  })

  it("matches an exact path", () => {
    expect(matchesPath("notes", "notes")).toBe(true)
  })

  it("matches a path below the granted directory", () => {
    expect(matchesPath("notes", "notes/today.md")).toBe(true)
    expect(matchesPath("notes", "notes/deep/today.md")).toBe(true)
  })

  it("does not match a sibling path that shares the prefix", () => {
    expect(matchesPath("notes", "notes-secrets/x")).toBe(false)
    expect(matchesPath("notes", "notes2/secret")).toBe(false)
    expect(matchesPath("notes", "notes-backup")).toBe(false)
  })

  it("keeps glob pattern behaviour", () => {
    expect(matchesPath("docs/**", "docs/guide.md")).toBe(true)
    expect(matchesPath("docs/**", "docs/a/b/c.md")).toBe(true)
    expect(matchesPath("docs/**", "secrets/key.md")).toBe(false)
    expect(matchesPath("*.md", "readme.md")).toBe(true)
    expect(matchesPath("*.md", "notes/readme.md")).toBe(false)
  })

  it("treats an absent pattern and wildcards as match-all", () => {
    expect(matchesPath(undefined, "anything.md")).toBe(true)
    expect(matchesPath("*", "anything.md")).toBe(true)
    expect(matchesPath("**", "anything.md")).toBe(true)
  })

  it("does not over-grant a namespace path filter", () => {
    const requester = { team: "team-b" }

    const inside = canRead(requester, GRANT_NS, "notes/today.md", "read")
    expect(inside.allowed).toBe(true)

    const sibling = canRead(requester, GRANT_NS, "notes-secrets/x", "read")
    expect(sibling.allowed).toBe(false)

    const sibling2 = canRead(requester, GRANT_NS, "notes2/secret", "read")
    expect(sibling2.allowed).toBe(false)
  })
})
