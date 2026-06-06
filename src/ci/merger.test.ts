import { describe, it, expect } from "bun:test"
import { pathsMatchAllowlist } from "./merger"

describe("pathsMatchAllowlist", () => {
  it("returns false for empty allowlist", () => {
    expect(pathsMatchAllowlist(["src/foo.ts"], [])).toBe(false)
  })

  it("matches exact paths", () => {
    expect(pathsMatchAllowlist(["src/foo.ts"], ["src/foo.ts"])).toBe(true)
  })

  it("rejects non-allowed files", () => {
    expect(pathsMatchAllowlist(["src/foo.ts", "danger/secret.txt"], ["src/**"])).toBe(false)
  })

  it("matches glob patterns", () => {
    expect(pathsMatchAllowlist(["src/foo.ts", "src/bar.ts"], ["src/**"])).toBe(true)
    expect(pathsMatchAllowlist(["tests/test.ts"], ["tests/**", "src/**"])).toBe(true)
    expect(pathsMatchAllowlist(["package.json"], ["*.json"])).toBe(true)
  })

  it("rejects files outside allowlist", () => {
    expect(pathsMatchAllowlist(["src/foo.ts"], ["tests/**"])).toBe(false)
  })
})
