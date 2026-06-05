import { ExperienceStore } from "./store"
import { ExperienceRetriever } from "./retrieval"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function cleanup(dir: string, store: ExperienceStore | undefined, prev: string) {
  try { store?.close() } catch { /* ignore */ }
  try { process.chdir(prev) } catch { /* ignore */ }
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* OS cleanup later */ }
}

export async function testRetrieverFormatsContext() {
  const dir = mkdtempSync(join(tmpdir(), "exp-ret-"))
  const prev = process.cwd()
  process.chdir(dir)
  let store: ExperienceStore | undefined
  try {
    store = new ExperienceStore()
    store.recordExperience({
      id: "exp-1", project: "", sessionId: "s1",
      goal: "fix typecheck in engine.ts",
      agentType: "agent", outcome: "success" as const, reward: 0.95,
      actionCount: 3, startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      summary: "Added missing return type annotation", tags: [], metrics: "{}",
    })
    const retriever = new ExperienceRetriever(store)
    const results = retriever.searchSimilar("fix typescript errors in engine")
    const ctx = retriever.formatContext(results)
    assert(ctx.includes("Prior Experience"), `header missing; got: ${ctx.slice(0, 200)}`)
    assert(ctx.includes("fix typecheck"), `goal missing; got: ${ctx.slice(0, 200)}`)
  } finally {
    cleanup(dir, store, prev)
  }
}

export async function testRetrieverEmptyStore() {
  const dir = mkdtempSync(join(tmpdir(), "exp-ret-"))
  const prev = process.cwd()
  process.chdir(dir)
  let store: ExperienceStore | undefined
  try {
    store = new ExperienceStore()
    const retriever = new ExperienceRetriever(store)
    const results = retriever.searchSimilar("anything")
    assert(results.length === 0, "empty store → empty results")
    const ctx = retriever.formatContext(results)
    assert(ctx === "", "empty results → empty context")
  } finally {
    cleanup(dir, store, prev)
  }
}

export async function testRetrieverFiltersUnrelated() {
  const dir = mkdtempSync(join(tmpdir(), "exp-ret-"))
  const prev = process.cwd()
  process.chdir(dir)
  let store: ExperienceStore | undefined
  try {
    store = new ExperienceStore()
    store.recordExperience({
      id: "exp-1", project: "", sessionId: "s1",
      goal: "create kubernetes ingress controller for staging cluster",
      agentType: "agent", outcome: "success" as const, reward: 0.5,
      actionCount: 3, startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      summary: "helm install nginx ingress", tags: [], metrics: "{}",
    })
    const retriever = new ExperienceRetriever(store)
    const results = retriever.searchSimilar("fix typescript compile errors in src/agent")
    // These share zero content words; should be filtered by 0.15 threshold.
    assert(results.length === 0, `expected 0 results for unrelated goals, got ${results.length}`)
  } finally {
    cleanup(dir, store, prev)
  }
}

export async function testRetrieverMarksFailedOutcomes() {
  const dir = mkdtempSync(join(tmpdir(), "exp-ret-"))
  const prev = process.cwd()
  process.chdir(dir)
  let store: ExperienceStore | undefined
  try {
    store = new ExperienceStore()
    store.recordExperience({
      id: "exp-1", project: "", sessionId: "s1",
      goal: "fix typecheck in engine",
      agentType: "agent", outcome: "failed" as const, reward: 0,
      actionCount: 3, startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      summary: "Test suite broke", tags: [], metrics: "{}",
    })
    const retriever = new ExperienceRetriever(store)
    const results = retriever.searchSimilar("fix typecheck in engine")
    const ctx = retriever.formatContext(results)
    assert(ctx.includes("❌") || ctx.includes("reverted"), "failed outcome icon or word shown")
  } finally {
    cleanup(dir, store, prev)
  }
}

if (import.meta.main) {
  await testRetrieverFormatsContext()
  await testRetrieverEmptyStore()
  await testRetrieverFiltersUnrelated()
  await testRetrieverMarksFailedOutcomes()
  console.log("retrieval tests passed")
}
