import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { canRead, createDefaultPolicy } from "./enforcer"
import { issueGrant, revokeGrant, listGrants } from "./grant-manager"
import type { Principal } from "./schema"
import { unlinkSync, rmdirSync, existsSync, readdirSync } from "fs"
import { join } from "path"
import { homedir } from "os"

const TEST_NS = "test-ns-policy"
const TEST_DIR = join(homedir(), ".aegis", "memory", "namespaces", TEST_NS)
const POLICY_PATH = join(TEST_DIR, "policy.yaml")

beforeAll(() => {
  createDefaultPolicy(TEST_NS, "team-a")
})

afterAll(() => {
  try {
    unlinkSync(POLICY_PATH)
  } catch {}
  try {
    rmdirSync(TEST_DIR)
  } catch {}
  try {
    const parent = join(homedir(), ".aegis", "memory", "namespaces")
    const dirs = readdirSync(parent)
    for (const d of dirs) {
      if (d.startsWith("test-")) {
        try {
          const dp = join(parent, d)
          const fp = join(dp, "policy.yaml")
          if (existsSync(fp)) unlinkSync(fp)
          rmdirSync(dp)
        } catch {}
      }
    }
  } catch {}
})

describe("enforcer", () => {
  it("allows owner to read", () => {
    const requester: Principal = { team: "team-a" }
    const result = canRead(requester, TEST_NS, "anything.md", "read")
    expect(result.allowed).toBe(true)
    expect(result.reason).toBe("owner")
  })

  it("denies other teams by default", () => {
    const requester: Principal = { team: "team-b" }
    const result = canRead(requester, TEST_NS, "anything.md", "read")
    expect(result.allowed).toBe(false)
  })

  it("denies with no policy", () => {
    const requester: Principal = { team: "team-b" }
    const result = canRead(requester, "nonexistent-ns", "file.md", "read")
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe("no_policy_default_deny")
  })

  it("allows with explicit grant", () => {
    issueGrant({ namespace: TEST_NS, to: "team-b", path: "docs/**", tools: ["read"] })
    const requester: Principal = { team: "team-b" }
    const result = canRead(requester, TEST_NS, "docs/guide.md", "read")
    expect(result.allowed).toBe(true)
  })

  it("denies grant with wrong tool", () => {
    const requester: Principal = { team: "team-b" }
    const result = canRead(requester, TEST_NS, "docs/guide.md", "terminal")
    expect(result.allowed).toBe(false)
  })

  it("denies non-granted path", () => {
    const requester: Principal = { team: "team-b" }
    const result = canRead(requester, TEST_NS, "secrets/key.md", "read")
    expect(result.allowed).toBe(false)
  })
})

describe("grant manager", () => {
  it("issues and lists grants", () => {
    const grant = issueGrant({ namespace: TEST_NS, to: "team-c", path: "public/**" })
    expect(grant.principal).toBe("team-c")
    expect(grant.path_filter).toBe("public/**")

    const grants = listGrants(TEST_NS)
    expect(grants.length).toBeGreaterThanOrEqual(1)
  })

  it("revokes grants", () => {
    issueGrant({ namespace: TEST_NS, to: "team-d" })
    const revoked = revokeGrant(TEST_NS, "team-d")
    expect(revoked).toBe(true)

    const requester: Principal = { team: "team-d" }
    const result = canRead(requester, TEST_NS, "any.md", "read")
    expect(result.allowed).toBe(false)
  })

  it("returns false when revoking non-existent grant", () => {
    const revoked = revokeGrant(TEST_NS, "nonexistent-team")
    expect(revoked).toBe(false)
  })
})
