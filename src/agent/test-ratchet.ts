import { RatchetRuntime } from "./ratchet"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

export async function testRatchetGetChangedFilesEmpty() {
  const rt = new RatchetRuntime()
  const files = rt.getChangedFiles(process.cwd())
  assert(Array.isArray(files), "returns array")
}

export async function testRatchetMeasureNoCriteria() {
  const rt = new RatchetRuntime()
  const result = await rt.measure({ cwd: process.cwd() })
  assert(result.outcome === "neutral", `no criteria → neutral, got ${result.outcome}`)
  assert(result.score === 0.5, `no criteria → score 0.5, got ${result.score}`)
}

export async function testRatchetIsGitRepo() {
  const rt = new RatchetRuntime()
  // The worktree is a git repo (we created it with `git worktree add`)
  assert(rt.isGitRepo(process.cwd()) === true, "worktree cwd is a git repo")
}

export async function testRatchetMeasureWithTestCommandPass() {
  const rt = new RatchetRuntime()
  const result = await rt.measure({
    cwd: process.cwd(),
    testCommand: "echo hello",
  })
  assert(result.outcome === "improved", `passing test command → improved, got ${result.outcome}`)
  assert(result.score === 1, `passing test command → score 1, got ${result.score}`)
}

export async function testRatchetMeasureWithTestCommandFail() {
  const rt = new RatchetRuntime()
  const result = await rt.measure({
    cwd: process.cwd(),
    testCommand: "node -e \"console.log('FAIL: simulated')\" || exit 1",
  })
  assert(result.outcome === "degraded", `failing test command → degraded, got ${result.outcome}`)
  assert(result.score === 0, `failing test command → score 0, got ${result.score}`)
}

export async function testRatchetStashNoRepo() {
  const rt = new RatchetRuntime()
  // /tmp or a non-git dir — stash should return false safely
  const result = rt.stash("C:/Windows")
  assert(result === false, "stash on non-git returns false")
}

export async function testRatchetRevertUnknownFile() {
  const rt = new RatchetRuntime()
  // Should not throw even if file doesn't exist
  rt.revertFiles(process.cwd(), ["this-file-does-not-exist.txt"])
}

if (import.meta.main) {
  await testRatchetGetChangedFilesEmpty()
  await testRatchetMeasureNoCriteria()
  await testRatchetIsGitRepo()
  await testRatchetMeasureWithTestCommandPass()
  await testRatchetMeasureWithTestCommandFail()
  await testRatchetStashNoRepo()
  await testRatchetRevertUnknownFile()
  console.log("ratchet tests passed")
}
