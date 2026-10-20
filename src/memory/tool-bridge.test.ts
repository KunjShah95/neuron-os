import { describe, it, expect, afterAll } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { ToolContext } from "../tools/registry"
import type { AuditEntry } from "./policy/schema"

const TMP_ROOT = mkdtempSync(join(tmpdir(), "memory-tool-bridge-"))
const PREV_HOME = process.env.HOME
const PREV_USERPROFILE = process.env.USERPROFILE
const PREV_MEMORY_DIR = process.env.AEGIS_MEMORY_DIR
const PREV_POLICY_DIR = process.env.AEGIS_MEMORY_POLICY_DIR

process.env.HOME = TMP_ROOT
process.env.USERPROFILE = TMP_ROOT
process.env.AEGIS_MEMORY_DIR = join(TMP_ROOT, "memory")
process.env.AEGIS_MEMORY_POLICY_DIR = join(TMP_ROOT, "policies")
mkdirSync(join(TMP_ROOT, ".aegis", "memory"), { recursive: true })

const { memoryWriteTool } = await import("../tools/memory-write")
const { memoryReadTool } = await import("../tools/memory-read")
const { memorySearchTool } = await import("../tools/memory-search")
const { closeMemoryStores } = await import("./tool-bridge")
const { issueGrant } = await import("./policy/grant-manager")

if (PREV_HOME === undefined) delete process.env.HOME
else process.env.HOME = PREV_HOME
if (PREV_USERPROFILE === undefined) delete process.env.USERPROFILE
else process.env.USERPROFILE = PREV_USERPROFILE

const NAMESPACE_A = "agent-alpha"
const NAMESPACE_B = "agent-beta"
const SECRET = "Project Falcon launch passphrase is blue otter 42"

function ctx(agentId: string): ToolContext {
  return {
    agentId,
    agentType: "researcher",
    cwd: TMP_ROOT,
    permissions: [
      { name: "memory_write", allow: true },
      { name: "memory_read", allow: true },
      { name: "memory_search", allow: true },
    ],
  }
}

const ctxA = ctx(NAMESPACE_A)
const ctxB = ctx(NAMESPACE_B)

function auditPaths(): string[] {
  return [join(TMP_ROOT, "memory", "audit.jsonl"), join(TMP_ROOT, ".aegis", "memory", "audit.jsonl")]
}

function readAuditRows(): AuditEntry[] {
  const rows: AuditEntry[] = []
  for (const path of auditPaths()) {
    if (!existsSync(path)) continue
    const raw = readFileSync(path, "utf-8")
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue
      try {
        rows.push(JSON.parse(line) as AuditEntry)
      } catch {
        /* ignore malformed lines */
      }
    }
  }
  return rows
}

afterAll(() => {
  closeMemoryStores()
  if (PREV_HOME === undefined) delete process.env.HOME
  else process.env.HOME = PREV_HOME
  if (PREV_USERPROFILE === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = PREV_USERPROFILE
  if (PREV_MEMORY_DIR === undefined) delete process.env.AEGIS_MEMORY_DIR
  else process.env.AEGIS_MEMORY_DIR = PREV_MEMORY_DIR
  if (PREV_POLICY_DIR === undefined) delete process.env.AEGIS_MEMORY_POLICY_DIR
  else process.env.AEGIS_MEMORY_POLICY_DIR = PREV_POLICY_DIR
  try {
    rmSync(TMP_ROOT, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
})

describe("memory tools", () => {
  it("writes an entry into the agent namespace", async () => {
    const result = await memoryWriteTool.execute(
      { key: "falcon", content: SECRET, tags: ["secret", "launch"] },
      ctxA,
    )
    expect(result.success).toBe(true)
    expect(result.metadata?.namespace).toBe(NAMESPACE_A)
    expect(result.metadata?.contentLength).toBe(SECRET.length)
  })

  it("reads back the written content", async () => {
    const result = await memoryReadTool.execute({ query: "falcon" }, ctxA)
    expect(result.success).toBe(true)
    expect(result.output).toContain(SECRET)
    expect(result.metadata?.namespace).toBe(NAMESPACE_A)
    expect(result.metadata?.count).toBeGreaterThan(0)
  })

  it("finds the written content through search", async () => {
    const result = await memorySearchTool.execute({ query: "Project Falcon launch passphrase blue otter 42" }, ctxA)
    expect(result.success).toBe(true)
    expect(result.output).toContain(SECRET)
  })

  it("denies reads of another namespace", async () => {
    const result = await memoryReadTool.execute({ query: "falcon", namespace: NAMESPACE_A }, ctxB)
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error).not.toContain(SECRET)
    expect(result.error).not.toContain("blue otter")
    expect(result.output).toBe("")
  })

  it("denies writes to another namespace", async () => {
    const result = await memoryWriteTool.execute(
      { key: "intrusion", content: "should never be stored", namespace: NAMESPACE_B },
      ctxA,
    )
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error).not.toContain("should never be stored")
  })

  it("hides other namespaces from search results", async () => {
    const result = await memorySearchTool.execute({ query: "Project Falcon launch passphrase blue otter 42" }, ctxB)
    expect(result.success).toBe(true)
    expect(result.output).not.toContain(SECRET)
  })

  it("allows cross-namespace reads once a grant is issued", async () => {
    const grant = issueGrant({ namespace: NAMESPACE_A, to: `agent:${NAMESPACE_B}` })
    expect(grant.namespace).toBe(NAMESPACE_A)

    const result = await memoryReadTool.execute({ query: "falcon", namespace: NAMESPACE_A }, ctxB)
    expect(result.success).toBe(true)
    expect(result.output).toContain(SECRET)
  })

  it("allows cross-namespace search once a grant is issued", async () => {
    const result = await memorySearchTool.execute(
      { query: "Project Falcon launch passphrase blue otter 42", namespace: NAMESPACE_A },
      ctxB,
    )
    expect(result.success).toBe(true)
    expect(result.output).toContain(SECRET)
  })

  it("writes an audit row for every allow and deny decision", async () => {
    const rows = readAuditRows()
    expect(rows.length).toBeGreaterThanOrEqual(6)
    expect(rows.some((row) => row.allowed === false)).toBe(true)
    expect(rows.some((row) => row.allowed === true)).toBe(true)
    expect(rows.some((row) => row.namespace === NAMESPACE_A && row.allowed === false)).toBe(true)
    expect(rows.some((row) => row.namespace === NAMESPACE_A && row.allowed === true)).toBe(true)
    expect(rows.every((row) => typeof row.ts === "number" && typeof row.requester === "string")).toBe(true)
  })

  it("never leaks another namespace content in denial errors", async () => {
    const result = await memoryReadTool.execute({ query: "Project Falcon", namespace: "agent-unknown" }, ctxB)
    expect(result.success).toBe(false)
    expect(result.error ?? "").not.toContain(SECRET)
  })

  it("serves the own namespace when no policy is configured", async () => {
    const result = await memoryReadTool.execute({ query: "anything" }, ctxB)
    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
    expect(result.metadata?.namespace).toBe(NAMESPACE_B)
  })

  it("persists entries on disk across store re-initialisation", async () => {
    closeMemoryStores()
    const result = await memoryReadTool.execute({ query: "falcon" }, ctxA)
    expect(result.success).toBe(true)
    expect(result.output).toContain(SECRET)
  })
})
