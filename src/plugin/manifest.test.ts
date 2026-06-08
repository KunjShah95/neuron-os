import { describe, it, expect } from "bun:test"
import { parseManifest, validateManifest, type PluginManifest } from "./manifest"

describe("parseManifest", () => {
  it("should parse a valid YAML manifest", () => {
    const yaml = `
name: agent-logger
version: 1.2.0
entrypoint: ./dist/index.js
description: Logs all agent activity
author: Test Author
license: MIT
hooks:
  on_agent_spawn: true
  on_tool_call: true
  on_message: true
dependencies:
  - name: aegis-sdk
    version: "^1.0.0"
permissions:
  - read_memory
  - execute_tool
`
    const manifest = parseManifest(yaml)
    expect(manifest.name).toBe("agent-logger")
    expect(manifest.version).toBe("1.2.0")
    expect(manifest.entrypoint).toBe("./dist/index.js")
    expect(manifest.hooks.on_agent_spawn).toBe(true)
    expect(manifest.hooks.on_tool_call).toBe(true)
    expect(manifest.dependencies).toHaveLength(1)
    expect(manifest.dependencies[0]!.name).toBe("aegis-sdk")
    expect(manifest.permissions).toEqual(["read_memory", "execute_tool"])
  })

  it("should throw on missing name", () => {
    const yaml = `version: 1.0.0\nentrypoint: ./index.js\nhooks: {}\ndependencies: []\npermissions: []`
    expect(() => parseManifest(yaml)).toThrow("name")
  })

  it("should throw on missing version", () => {
    const yaml = `name: test\nentrypoint: ./index.js\nhooks: {}\ndependencies: []\npermissions: []`
    expect(() => parseManifest(yaml)).toThrow("version")
  })

  it("should throw on missing entrypoint", () => {
    const yaml = `name: test\nversion: 1.0.0\nhooks: {}\ndependencies: []\npermissions: []`
    expect(() => parseManifest(yaml)).toThrow("entrypoint")
  })

  it("should default hooks, deps, permissions when missing", () => {
    const yaml = `name: test\nversion: 1.0.0\nentrypoint: ./index.js`
    const manifest = parseManifest(yaml)
    expect(manifest.hooks.on_agent_spawn).toBe(false)
    expect(manifest.dependencies).toEqual([])
    expect(manifest.permissions).toEqual([])
  })

  it("should handle non-object hooks gracefully", () => {
    const yaml = `name: test\nversion: 1.0.0\nentrypoint: ./index.js\nhooks: invalid`
    const manifest = parseManifest(yaml)
    expect(manifest.hooks.on_agent_spawn).toBe(false)
  })
})

describe("validateManifest", () => {
  const valid: PluginManifest = {
    name: "test",
    version: "1.0.0",
    entrypoint: "./dist/index.js",
    description: "Test",
    author: "Me",
    license: "MIT",
    hooks: { on_agent_spawn: true },
    dependencies: [],
    permissions: ["read_memory"],
  }

  it("should pass for valid manifest", () => {
    const errors = validateManifest(valid)
    expect(errors).toHaveLength(0)
  })

  it("should reject invalid semver", () => {
    const errors = validateManifest({ ...valid, version: "abc" })
    expect(errors).toContain('version "abc" is not valid semver')
  })

  it("should reject unknown hook names", () => {
    const errors = validateManifest({ ...valid, hooks: { on_unknown: true } as any })
    expect(errors).toContain('Unknown hook point: "on_unknown"')
  })

  it("should reject non-boolean hook values", () => {
    const errors = validateManifest({ ...valid, hooks: { on_agent_spawn: "potato" as any } })
    expect(errors).toContain('Hook "on_agent_spawn" must be a boolean, got string')
  })

  it("should reject missing dep name", () => {
    const errors = validateManifest({ ...valid, dependencies: [{ name: "", version: "^1.0.0" }] })
    expect(errors).toContain("dependency name is required")
  })

  it("should reject invalid dep constraint", () => {
    const errors = validateManifest({ ...valid, dependencies: [{ name: "foo", version: "invalid" }] })
    expect(errors).toContain('dependency "foo" version "invalid" is not a valid semver constraint')
  })
})
