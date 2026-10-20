import { describe, it, expect, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AgentSpec } from "./schema"
import { resolveSpecTools, getRunsDir, listRunRecords } from "./runner"

function makeSpec(spec: Record<string, unknown>) {
  return AgentSpec.parse({
    apiVersion: "aegis/v1",
    kind: "Agent",
    metadata: { name: "tool-test" },
    spec: {
      type: "build",
      model: { provider: "openai", name: "gpt-4o" },
      ...spec,
    },
  })
}

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
})

describe("resolveSpecTools", () => {
  it("uses the toolset when no allow list is given", () => {
    const spec = makeSpec({ tools: { toolset: "web" } })
    expect(resolveSpecTools(spec).sort()).toEqual(["web_extract", "web_fetch", "web_search"])
  })

  it("subtracts denied tools from a toolset", () => {
    const spec = makeSpec({ tools: { toolset: "file-ops", deny: ["write", "edit"] } })
    expect(resolveSpecTools(spec).sort()).toEqual(["glob", "grep", "read"])
  })

  it("uses the allow list when no toolset is given", () => {
    const spec = makeSpec({ tools: { allow: ["read", "grep"] } })
    expect(resolveSpecTools(spec).sort()).toEqual(["grep", "read"])
  })

  it("subtracts denied tools from an allow list", () => {
    const spec = makeSpec({ tools: { allow: ["read", "grep", "bash"], deny: ["bash"] } })
    expect(resolveSpecTools(spec).sort()).toEqual(["grep", "read"])
  })

  it("combines a toolset with an allow list", () => {
    const spec = makeSpec({ tools: { toolset: "web", allow: ["read"] } })
    expect(resolveSpecTools(spec).sort()).toEqual(["read", "web_extract", "web_fetch", "web_search"])
  })

  it("falls back to the default tool set", () => {
    const spec = makeSpec({ tools: {} })
    expect(resolveSpecTools(spec).sort()).toEqual(["bash", "glob", "grep", "read"])
  })

  it("falls back to the default tool set for an unknown toolset", () => {
    const spec = makeSpec({ tools: { toolset: "does-not-exist" } })
    expect(resolveSpecTools(spec).sort()).toEqual(["bash", "glob", "grep", "read"])
  })

  it("returns an empty list when every default tool is denied", () => {
    const spec = makeSpec({ tools: { deny: ["read", "bash", "grep", "glob"] } })
    expect(resolveSpecTools(spec)).toEqual([])
  })
})

describe("run record storage", () => {
  it("honours the AEGIS_RUNS_DIR override", () => {
    const dir = mkdtempSync(join(tmpdir(), "aegis-runs-"))
    tempDirs.push(dir)
    const original = process.env.AEGIS_RUNS_DIR
    process.env.AEGIS_RUNS_DIR = dir
    try {
      expect(getRunsDir()).toBe(dir)
    } finally {
      if (original === undefined) delete process.env.AEGIS_RUNS_DIR
      else process.env.AEGIS_RUNS_DIR = original
    }
  })

  it("returns an empty list when the runs directory does not exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "aegis-runs-"))
    tempDirs.push(dir)
    const original = process.env.AEGIS_RUNS_DIR
    process.env.AEGIS_RUNS_DIR = join(dir, "missing")
    try {
      expect(listRunRecords()).toEqual([])
    } finally {
      if (original === undefined) delete process.env.AEGIS_RUNS_DIR
      else process.env.AEGIS_RUNS_DIR = original
    }
  })
})
