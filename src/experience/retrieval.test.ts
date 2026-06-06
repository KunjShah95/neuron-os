import { describe, it, expect } from "bun:test"
import { ExperienceStore } from "./store"
import { ExperienceRetriever } from "./retrieval"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("Retrieval Tests", () => {

function cleanup(dir: string, store: ExperienceStore | undefined, prev: string) {
  try { store?.close() } catch { /* ignore */ }
  try { process.chdir(prev) } catch { /* ignore */ }
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* OS cleanup later */ }
}

it("should retriever formats context", async () => {
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
    expect(ctx.includes("Prior Experience")).toBe(true)
    expect(ctx.includes("fix typecheck")).toBe(true)
  } finally {
    cleanup(dir, store, prev)
  }
})

it("should retriever empty store", async () => {
  const dir = mkdtempSync(join(tmpdir(), "exp-ret-"))
  const prev = process.cwd()
  process.chdir(dir)
  let store: ExperienceStore | undefined
  try {
    store = new ExperienceStore()
    const retriever = new ExperienceRetriever(store)
    const results = retriever.searchSimilar("anything")
    expect(results.length === 0).toBe(true)
    const ctx = retriever.formatContext(results)
    expect(ctx === "").toBe(true)
  } finally {
    cleanup(dir, store, prev)
  }
})

it("should retriever filters unrelated", async () => {
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
    expect(results.length === 0).toBe(true)
  } finally {
    cleanup(dir, store, prev)
  }
})

it("should retriever marks failed outcomes", async () => {
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
    expect(ctx.includes("❌") || ctx.includes("reverted")).toBe(true)
  } finally {
    cleanup(dir, store, prev)
  }
})

})
