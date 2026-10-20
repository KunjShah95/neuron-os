import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Command } from "commander"
import { registerSpec, validateSpecFile, listSpecRuns, checkSpecHash } from "./spec"
import { loadSpec } from "../../agent/spec/loader"
import { hashSpec } from "../../agent/spec/hasher"

const VALID_SPEC = `apiVersion: aegis/v1
kind: Agent
metadata:
  name: fixture-agent
  labels:
    team: core
spec:
  type: build
  model:
    provider: openai
    name: gpt-4o
    temperature: 0.2
  system_prompt:
    template: You are a fixture agent.
  tools:
    toolset: file-ops
    allow:
      - read
    deny:
      - write
  context_files:
    - README.md
  skills:
    - git-commit
  memory:
    namespace: fixture-ns
    recall_top_k: 2
  budget:
    usd: 0.25
    tokens: 5000
  triggers:
    - type: manual
`

const INVALID_SPEC = `apiVersion: aegis/v1
kind: Agent
metadata:
  name: Invalid_Name
spec:
  type: not-a-type
  model:
    provider: openai
`

let tempDir: string
let originalRunsDir: string | undefined
let output: string[]
let originalLog: typeof console.log

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "aegis-spec-"))
  originalRunsDir = process.env.AEGIS_RUNS_DIR
  process.env.AEGIS_RUNS_DIR = join(tempDir, "runs")
  output = []
  originalLog = console.log
  console.log = (...args: unknown[]) => {
    output.push(args.map((a) => String(a)).join(" "))
  }
})

afterEach(() => {
  console.log = originalLog
  if (originalRunsDir === undefined) delete process.env.AEGIS_RUNS_DIR
  else process.env.AEGIS_RUNS_DIR = originalRunsDir
  try {
    rmSync(tempDir, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
})

function writeSpec(name: string, content: string): string {
  const path = join(tempDir, name)
  writeFileSync(path, content, "utf-8")
  return path
}

describe("spec command registration", () => {
  it("registers the spec command with all subcommands", () => {
    const program = new Command()
    registerSpec(program)
    const cmd = program.commands.find((c) => c.name() === "spec")
    expect(cmd).toBeDefined()
    const names = cmd!.commands.map((c) => c.name())
    expect(names).toContain("validate")
    expect(names).toContain("run")
    expect(names).toContain("replay")
    expect(names).toContain("list")
  })

  it("requires a goal for the run subcommand", () => {
    const program = new Command()
    registerSpec(program)
    const spec = program.commands.find((c) => c.name() === "spec")!
    const run = spec.commands.find((c) => c.name() === "run")!
    expect(run.options.some((o) => o.long === "--goal" && o.required)).toBe(true)
  })
})

describe("aegis spec validate", () => {
  it("exits 0 for a valid spec", async () => {
    const path = writeSpec("valid.yaml", VALID_SPEC)
    const result = await validateSpecFile(path)

    expect(result.ok).toBe(true)
    expect(result.code).toBe(0)
    expect(output.join("\n")).toContain("Valid")
    expect(output.join("\n")).toContain("fixture-agent")
  })

  it("exits non-zero with a helpful message for an invalid spec", async () => {
    const path = writeSpec("invalid.yaml", INVALID_SPEC)
    const result = await validateSpecFile(path)

    expect(result.ok).toBe(false)
    expect(result.code).toBe(1)
    expect(result.message.length).toBeGreaterThan(0)
    expect(result.message).toContain("metadata.name")
    expect(result.message).toContain("spec.type")
    expect(output.join("\n")).toContain("Invalid spec")
  })

  it("reports a missing file instead of throwing", async () => {
    const result = await validateSpecFile(join(tempDir, "missing.yaml"))

    expect(result.ok).toBe(false)
    expect(result.code).toBe(1)
    expect(result.message).toContain("not found")
  })
})

describe("aegis spec list", () => {
  it("succeeds with a friendly message when no runs are recorded", async () => {
    const result = await listSpecRuns()

    expect(result.ok).toBe(true)
    expect(result.code).toBe(0)
    expect(output.join("\n")).toContain("No spec runs recorded")
  })

  it("lists recorded runs", async () => {
    const path = writeSpec("valid.yaml", VALID_SPEC)
    const spec = loadSpec(path)
    const runsDir = join(tempDir, "runs")
    mkdirSync(runsDir, { recursive: true })
    writeFileSync(
      join(runsDir, "session-1.json"),
      JSON.stringify({
        sessionId: "session-1",
        specHash: hashSpec(spec),
        spec,
        input: { goal: "do the thing" },
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
      "utf-8",
    )

    const result = await listSpecRuns()

    expect(result.ok).toBe(true)
    expect(result.code).toBe(0)
    const text = output.join("\n")
    expect(text).toContain("session-1")
    expect(text).toContain("do the thing")
  })
})

describe("aegis spec replay", () => {
  it("reports a matching spec hash for an untouched run record", async () => {
    const path = writeSpec("valid.yaml", VALID_SPEC)
    const spec = loadSpec(path)
    const runsDir = join(tempDir, "runs")
    mkdirSync(runsDir, { recursive: true })
    writeFileSync(
      join(runsDir, "session-2.json"),
      JSON.stringify({
        sessionId: "session-2",
        specHash: hashSpec(spec),
        spec,
        input: { goal: "replay me" },
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
      "utf-8",
    )

    const check = await checkSpecHash("session-2")

    expect(check).not.toBeNull()
    expect(check!.match).toBe(true)
    expect(check!.recordedHash).toBe(check!.currentHash)
    expect(check!.specName).toBe("fixture-agent")
  })

  it("detects a tampered run record", async () => {
    const path = writeSpec("valid.yaml", VALID_SPEC)
    const spec = loadSpec(path)
    const runsDir = join(tempDir, "runs")
    mkdirSync(runsDir, { recursive: true })
    writeFileSync(
      join(runsDir, "session-3.json"),
      JSON.stringify({
        sessionId: "session-3",
        specHash: "deadbeef",
        spec,
        input: { goal: "tampered" },
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
      "utf-8",
    )

    const check = await checkSpecHash("session-3")

    expect(check).not.toBeNull()
    expect(check!.match).toBe(false)
    expect(check!.recordedHash).toBe("deadbeef")
  })

  it("returns null for an unknown session", async () => {
    const check = await checkSpecHash("does-not-exist")
    expect(check).toBeNull()
  })
})
