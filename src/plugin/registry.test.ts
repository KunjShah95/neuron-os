import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { PluginRegistry } from "./registry"
import type { PluginManifest } from "./manifest"

describe("PluginRegistry", () => {
  let tmpDir: string
  let registry: PluginRegistry

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "plugin-registry-test-"))
    registry = new PluginRegistry(join(tmpDir, "plugins.db"))
  })

  afterAll(() => {
    registry.close()
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // Windows may hold file lock momentarily after close
    }
  })

  it("should register a plugin", () => {
    const manifest: PluginManifest = {
      name: "test-plugin",
      version: "1.0.0",
      entrypoint: "./dist/index.js",
      description: "A test plugin",
      author: "Tester",
      license: "MIT",
      hooks: { on_agent_spawn: true },
      dependencies: [{ name: "aegis-sdk", version: "^1.0.0" }],
      permissions: ["read_memory"],
    }

    registry.register(manifest, "abc123sig", "def456hash")
    const row = registry.get("test-plugin")
    expect(row).toBeDefined()
    expect(row!.name).toBe("test-plugin")
    expect(row!.signature).toBe("abc123sig")
    expect(row!.checksum).toBe("def456hash")
  })

  it("should get a specific version", () => {
    const row = registry.get("test-plugin", "1.0.0")
    expect(row).toBeDefined()
    expect(row!.version).toBe("1.0.0")
  })

  it("should return undefined for unknown plugin", () => {
    expect(registry.get("nonexistent")).toBeUndefined()
  })

  it("should list all plugins", () => {
    const all = registry.list()
    expect(all.length).toBeGreaterThanOrEqual(1)
    expect(all.some((p) => p.name === "test-plugin")).toBe(true)
  })

  it("should search plugins", () => {
    const results = registry.search("test")
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  it("should remove a plugin", () => {
    registry.remove("test-plugin")
    expect(registry.get("test-plugin")).toBeUndefined()
  })

  it("should track install count", () => {
    const manifest: PluginManifest = {
      name: "counter-plugin",
      version: "1.0.0",
      entrypoint: "./dist/index.js",
      hooks: {},
      dependencies: [],
      permissions: [],
    }
    registry.register(manifest, "sig", "hash")
    registry.incrementInstalls("counter-plugin", "1.0.0")
    const row = registry.get("counter-plugin")
    expect(row!.installs_count).toBe(1)
  })
})
