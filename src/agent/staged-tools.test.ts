import { describe, expect, it, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { ActionTracker } from "./action-tracker"
import { AgentToolExecutor } from "./agent-tools"
import { createStagedTools } from "./staged-tools"

describe("staged tools (approval flow)", () => {
  let dir: string
  let tracker: ActionTracker
  let executor: AgentToolExecutor
  let tools: ReturnType<typeof createStagedTools>
  let ctx: { agentId: string; cwd: string; permissions: [] }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aegis-staged-"))
    mkdirSync(join(dir, "src"), { recursive: true })
    writeFileSync(join(dir, "src", "existing.ts"), "const a = 1\n", "utf-8")
    tracker = new ActionTracker()
    executor = new AgentToolExecutor(tracker, { codebasePath: dir })
    tools = createStagedTools(executor, dir)
    ctx = { agentId: "staged-test", cwd: dir, permissions: [] }
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("does not write to disk when a file is staged", async () => {
    const result = await tools.write!.execute({ path: "src/new.ts", content: "export const b = 2\n" }, ctx as never)
    expect(result.success).toBe(true)
    expect(existsSync(join(dir, "src", "new.ts"))).toBe(false)
    expect(tracker.getPendingMutations().length).toBe(1)
  })

  it("stages an edit without touching the file on disk", async () => {
    const result = await tools.edit!.execute(
      { path: "src/existing.ts", oldString: "const a = 1", newString: "const a = 2" },
      ctx as never,
    )
    expect(result.success).toBe(true)
    expect(readFileSync(join(dir, "src", "existing.ts"), "utf-8")).toBe("const a = 1\n")
    expect(tracker.getPendingMutations().length).toBe(1)
  })

  it("queues shell commands instead of executing them", async () => {
    const marker = join(dir, "should-not-exist.txt")
    const result = await tools.bash!.execute({ command: `echo hi > ${marker}` }, ctx as never)
    expect(result.success).toBe(true)
    expect(existsSync(marker)).toBe(false)
    expect(tracker.getPendingMutations().length).toBe(1)
  })

  it("reads staged content back so the model sees its own changes", async () => {
    await tools.write!.execute({ path: "src/new.ts", content: "export const b = 2\n" }, ctx as never)
    const read = await tools.read!.execute({ path: "src/new.ts" }, ctx as never)
    expect(read.success).toBe(true)
    expect(read.output).toContain("export const b = 2")
  })

  it("applies approved changes to disk only after approval", async () => {
    await tools.write!.execute({ path: "src/new.ts", content: "export const b = 2\n" }, ctx as never)
    expect(existsSync(join(dir, "src", "new.ts"))).toBe(false)

    tracker.approveAll()
    const { errors } = executor.applyApproved()
    expect(errors).toEqual([])
    expect(existsSync(join(dir, "src", "new.ts"))).toBe(true)
    expect(readFileSync(join(dir, "src", "new.ts"), "utf-8")).toBe("export const b = 2\n")
  })

  it("does not apply rejected changes", async () => {
    await tools.write!.execute({ path: "src/new.ts", content: "export const b = 2\n" }, ctx as never)
    tracker.rejectAll()
    executor.applyApproved()
    expect(existsSync(join(dir, "src", "new.ts"))).toBe(false)
  })

  it("refuses paths that escape the workspace", async () => {
    const result = await tools.write!.execute({ path: "../escape.ts", content: "x" }, ctx as never)
    expect(result.success).toBe(false)
  })

  it("reports a failed edit when the target string is absent", async () => {
    const result = await tools.edit!.execute(
      { path: "src/existing.ts", oldString: "not present", newString: "x" },
      ctx as never,
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("not found")
  })
})
