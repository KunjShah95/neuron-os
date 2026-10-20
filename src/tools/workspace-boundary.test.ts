import { describe, expect, it, beforeAll, afterAll } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readTool } from "./read"
import { writeTool } from "./write"
import { editTool } from "./edit"
import { FilesystemSandbox, isPathInside, resolveWorkspacePath } from "../sandbox/filesystem"
import type { ToolContext } from "./registry"

let workspace: string
let outsideDir: string
let outsideFile: string
let siblingDir: string
let siblingFile: string

const ctx: ToolContext = {
  agentId: "workspace-test",
  agentType: "write",
  cwd: "",
  permissions: [
    { name: "read", allow: true },
    { name: "write", allow: true },
    { name: "edit", allow: true },
  ],
}

beforeAll(async () => {
  const root = await mkdtemp(join(tmpdir(), "aegis-workspace-"))
  workspace = join(root, "workspace")
  outsideDir = join(root, "outside")
  await mkdir(workspace, { recursive: true })
  await mkdir(outsideDir, { recursive: true })
  siblingDir = join(root, "workspace-secrets")
  await mkdir(siblingDir, { recursive: true })
  await writeFile(join(workspace, "inside.txt"), "inside content", "utf-8")
  await writeFile(join(outsideDir, "secret.txt"), "secret content", "utf-8")
  await writeFile(join(siblingDir, "secret.txt"), "secret content", "utf-8")
  outsideFile = join(outsideDir, "secret.txt")
  siblingFile = join(siblingDir, "secret.txt")
  ctx.cwd = workspace
})

afterAll(async () => {
  const root = join(workspace, "..")
  await rm(root, { recursive: true, force: true })
})

describe("Workspace boundary", () => {
  it("should resolve paths inside the workspace", () => {
    expect(resolveWorkspacePath(workspace, "inside.txt")).toBe(join(workspace, "inside.txt"))
    expect(resolveWorkspacePath(workspace, "nested/dir/file.txt")).toBe(join(workspace, "nested", "dir", "file.txt"))
  })

  it("should reject paths that escape the workspace", () => {
    expect(resolveWorkspacePath(workspace, "../outside/secret.txt")).toBe(null)
    expect(resolveWorkspacePath(workspace, outsideFile)).toBe(null)
    expect(resolveWorkspacePath(workspace, "..")).toBe(null)
    expect(resolveWorkspacePath(workspace, "nested/../../escape.txt")).toBe(null)
  })

  it("should read a file inside the workspace", async () => {
    const result = await readTool.execute({ path: "inside.txt" }, ctx)
    expect(result.success).toBe(true)
    expect(result.output).toContain("inside content")
  })

  it("should refuse to read outside the workspace", async () => {
    const result = await readTool.execute({ path: "../outside/secret.txt" }, ctx)
    expect(result.success).toBe(false)
    expect(result.error).toContain("escapes workspace")
  })

  it("should refuse to read an absolute path outside the workspace", async () => {
    const result = await readTool.execute({ path: outsideFile }, ctx)
    expect(result.success).toBe(false)
    expect(result.error).toContain("escapes workspace")
  })

  it("should write inside the workspace", async () => {
    const result = await writeTool.execute({ path: "nested/dir/new.txt", content: "written" }, ctx)
    expect(result.success).toBe(true)
    expect(await readFile(join(workspace, "nested", "dir", "new.txt"), "utf-8")).toBe("written")
  })

  it("should refuse to write outside the workspace", async () => {
    const target = join(outsideDir, "evil.txt")
    const result = await writeTool.execute({ path: target, content: "pwned" }, ctx)
    expect(result.success).toBe(false)
    expect(result.error).toContain("escapes workspace")
    expect(await readFile(target, "utf-8").catch(() => null)).toBe(null)
  })

  it("should refuse to write through a relative escape", async () => {
    const result = await writeTool.execute({ path: "../outside/evil.txt", content: "pwned" }, ctx)
    expect(result.success).toBe(false)
    expect(result.error).toContain("escapes workspace")
  })

  it("should edit a file inside the workspace", async () => {
    const result = await editTool.execute({ path: "inside.txt", oldString: "inside", newString: "updated" }, ctx)
    expect(result.success).toBe(true)
    expect(await readFile(join(workspace, "inside.txt"), "utf-8")).toBe("updated content")
  })

  it("should refuse to edit outside the workspace", async () => {
    const result = await editTool.execute(
      { path: "../outside/secret.txt", oldString: "secret", newString: "leaked" },
      ctx,
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("escapes workspace")
    expect(await readFile(outsideFile, "utf-8")).toBe("secret content")
  })
})

describe("FilesystemSandbox path containment", () => {
  it("should not allow a sibling directory sharing a name prefix", () => {
    const sandbox = new FilesystemSandbox({ allowedPaths: [workspace] })
    expect(sandbox.restrictPath(join(workspace, "inside.txt"))).toBe(join(workspace, "inside.txt"))
    expect(sandbox.restrictPath(outsideFile)).toBe(null)
    expect(sandbox.restrictPath(siblingFile)).toBe(null)
  })

  it("should compare paths segment by segment", () => {
    const project = join(workspace, "project")
    expect(isPathInside(project, join(project, "src", "index.ts"))).toBe(true)
    expect(isPathInside(project, join(project, "..", "project-secrets"))).toBe(false)
    expect(isPathInside(project, join(project, "..", ".."))).toBe(false)
    expect(isPathInside(project, project)).toBe(true)
  })
})
