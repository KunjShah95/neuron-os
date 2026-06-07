import { describe, it, expect } from "bun:test"
import { RatchetRuntime } from "./ratchet"

describe("Ratchet Tests", () => {
  it("should ratchet get changed files empty", async () => {
    const rt = new RatchetRuntime()
    const files = rt.getChangedFiles(process.cwd())
    expect(Array.isArray(files)).toBe(true)
  })

  it("should ratchet measure no criteria", async () => {
    const rt = new RatchetRuntime()
    const result = await rt.measure({ cwd: process.cwd() })
    expect(result.outcome === "neutral").toBe(true)
    expect(result.score === 0.5).toBe(true)
  })

  it("should ratchet is git repo", async () => {
    const rt = new RatchetRuntime()
    // The worktree is a git repo (we created it with `git worktree add`)
    expect(rt.isGitRepo(process.cwd()) === true).toBe(true)
  })

  it("should ratchet measure with test command pass", async () => {
    const rt = new RatchetRuntime()
    const result = await rt.measure({
      cwd: process.cwd(),
      testCommand: "echo hello",
    })
    expect(result.outcome === "improved").toBe(true)
    expect(result.score === 1).toBe(true)
  })

  it("should ratchet measure with test command fail", async () => {
    const rt = new RatchetRuntime()
    const result = await rt.measure({
      cwd: process.cwd(),
      testCommand: "node -e \"console.log('FAIL: simulated')\" || exit 1",
    })
    expect(result.outcome === "degraded").toBe(true)
    expect(result.score === 0).toBe(true)
  })

  it("should ratchet stash no repo", async () => {
    const rt = new RatchetRuntime()
    // /tmp or a non-git dir — stash should return false safely
    const result = rt.stash("C:/Windows")
    expect(result === false).toBe(true)
  })

  it("should ratchet revert unknown file", async () => {
    const rt = new RatchetRuntime()
    // Should not throw even if file doesn't exist
    rt.revertFiles(process.cwd(), ["this-file-does-not-exist.txt"])
  })
})
