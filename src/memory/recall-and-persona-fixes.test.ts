/**
 * src/memory/recall-and-persona-fixes.test.ts
 *
 * Regression tests for the recall, persona, dialectic, policy and memory
 * fixes: BM25 sign, summarizer timeout, trait streaks, trait aggregation,
 * grant issuance, policy listing, write serialisation and lock ownership.
 */

import { describe, it, expect, afterAll } from "bun:test"
import { Database } from "bun:sqlite"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { homedir, tmpdir } from "node:os"
import { FTS5Indexer, FTS5Retriever, ensureFTS5Schema } from "./recall"
import { Summarizer } from "./recall/summarizer"
import type { RecallConfig, RecallHit } from "./recall/types"
import { TraitEvolver } from "../persona/trait-evolver"
import { ExperienceStore } from "../experience/store"
import { ExperienceReplay } from "../experience/replay"
import { PersonaStore } from "../persona/persona-store"
import { MemorySystem } from "./system"
import { DialecticEngine } from "./user-model/dialectic"
import { EMPTY_USER_MODEL } from "./user-model/types"
import { issueGrant } from "./policy/grant-manager"
import { canRead, createDefaultPolicy, loadPolicy } from "./policy/enforcer"

const RUN_ID = Date.now()
const TMP_ROOT = resolve(tmpdir(), "opencode", "aegis-recall-persona-" + RUN_ID)
const STORE_BASE = join(homedir(), ".aegis", "projects")
const STORE_TARGET = join(tmpdir(), "opencode", "aegis-recall-persona-store-" + RUN_ID)
const PROJECT_ROOT = relative(STORE_BASE, STORE_TARGET)
const openStores: Array<{ close?: () => void }> = []

try {
  rmSync(STORE_TARGET, { recursive: true, force: true })
} catch {
  // best-effort
}

function freshExperienceStore(name: string): ExperienceStore {
  const store = new ExperienceStore(join(PROJECT_ROOT, "exp-" + name))
  openStores.push(store)
  return store
}

function freshPersonaStore(name: string): PersonaStore {
  const store = new PersonaStore(join(PROJECT_ROOT, "persona-" + name))
  openStores.push(store)
  return store
}

afterAll(() => {
  for (const store of openStores) {
    try {
      store.close?.()
    } catch {
      // best-effort
    }
  }
  try {
    rmSync(TMP_ROOT, { recursive: true, force: true })
  } catch {
    // best-effort
  }
  try {
    rmSync(STORE_TARGET, { recursive: true, force: true })
  } catch {
    // best-effort
  }
})

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// -- BM25 relevance ordering --------------------------------------------

describe("FTS5Retriever relevance", () => {
  function makeDb(): Database {
    const db = new Database(":memory:")
    ensureFTS5Schema(db)
    return db
  }

  const config: RecallConfig = {
    maxResults: 3,
    maxAgeDays: 90,
    summaryTokenBudget: 400,
    summarizerTimeoutMs: 50,
    fts5Table: "recall_index",
  }

  it("ranks the better bm25 match first", () => {
    const db = makeDb()
    const indexer = new FTS5Indexer()
    indexer.setDb(db)

    const ts = Date.now()
    indexer.indexTurn({ sessionId: "s1", turnId: "good", ts, role: "user", content: "authentication" })
    indexer.indexTurn({
      sessionId: "s2",
      turnId: "bad",
      ts,
      role: "user",
      content: "authentication " + "filler ".repeat(200),
    })

    const retriever = new FTS5Retriever(config)
    retriever.setDb(db)

    const hits = retriever.retrieve({ text: "authentication", maxResults: 5 })
    expect(hits.length).toBe(2)
    expect(hits[0]!.turn_id).toBe("good")
    expect(hits[0]!.finalScore).toBeGreaterThan(hits[1]!.finalScore)
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score)

    db.close()
  })

  it("excludes turns older than maxAgeDays", () => {
    const db = makeDb()
    const indexer = new FTS5Indexer()
    indexer.setDb(db)

    const now = Date.now()
    indexer.indexTurn({ sessionId: "s1", turnId: "fresh", ts: now, role: "user", content: "authentication" })
    indexer.indexTurn({
      sessionId: "s2",
      turnId: "stale",
      ts: now - 120 * 86_400_000,
      role: "user",
      content: "authentication",
    })

    const retriever = new FTS5Retriever(config)
    retriever.setDb(db)

    const hits = retriever.retrieve({ text: "authentication", maxResults: 5, maxAgeDays: 30 })
    expect(hits.length).toBe(1)
    expect(hits[0]!.turn_id).toBe("fresh")

    db.close()
  })

  it("honours maxResults", () => {
    const db = makeDb()
    const indexer = new FTS5Indexer()
    indexer.setDb(db)

    const ts = Date.now()
    for (let i = 0; i < 5; i++) {
      indexer.indexTurn({
        sessionId: "s1",
        turnId: `t${i}`,
        ts,
        role: "user",
        content: "authentication token",
      })
    }

    const retriever = new FTS5Retriever(config)
    retriever.setDb(db)

    const hits = retriever.retrieve({ text: "authentication", maxResults: 2 })
    expect(hits.length).toBe(2)

    db.close()
  })
})

// -- Summarizer timeout -------------------------------------------------

describe("Summarizer timeout", () => {
  const config: RecallConfig = {
    maxResults: 3,
    maxAgeDays: 90,
    summaryTokenBudget: 400,
    summarizerTimeoutMs: 50,
    fts5Table: "recall_index",
  }

  const hit: RecallHit = {
    session_id: "s1",
    turn_id: "t1",
    ts: Date.now(),
    role: "user",
    content: "remember the deploy window",
    score: 1,
    finalScore: 1,
  }

  it("returns raw hits when the provider hangs", async () => {
    let receivedSignal: AbortSignal | undefined

    const summarizer = new Summarizer(config, () => ({
      generate: (_messages, options) => {
        receivedSignal = options?.abortSignal
        return new Promise(() => {})
      },
    }))

    const started = Date.now()
    const result = await summarizer.summarize([hit])
    const elapsed = Date.now() - started

    expect(elapsed).toBeLessThan(2000)
    expect(result).toContain("<recall_context>")
    expect(result).toContain("remember the deploy window")
    expect(receivedSignal).toBeDefined()
    expect(receivedSignal!.aborted).toBe(true)
  })

  it("returns raw hits when the provider aborts", async () => {
    const summarizer = new Summarizer(config, () => ({
      generate: (_messages, options) =>
        new Promise((_resolve, reject) => {
          options?.abortSignal?.addEventListener("abort", () => {
            const err = new Error("aborted")
            err.name = "AbortError"
            reject(err)
          })
        }),
    }))

    const result = await summarizer.summarize([hit])
    expect(result).toContain("<recall_context>")
    expect(result).toContain("remember the deploy window")
  })

  it("returns the summary when the provider succeeds", async () => {
    const summarizer = new Summarizer(config, () => ({
      generate: async () => ({ text: "deploy window" }),
    }))

    const result = await summarizer.summarize([hit])
    expect(result).toContain("<recall_context>")
    expect(result).toContain("deploy window")
  })
})

// -- Persona streaks and aggregation ------------------------------------

describe("TraitEvolver", () => {
  it("counts the streak from the newest run", () => {
    const store = freshExperienceStore("streak")
    const personas = freshPersonaStore("streak")
    const evolver = new TraitEvolver(store, personas)

    const base = Date.parse("2024-05-01T10:00:00.000Z")
    const record = (id: string, outcome: "success" | "failed", offset: number) => {
      store.recordExperience({
        id,
        project: PROJECT_ROOT,
        sessionId: "s1",
        goal: `goal ${id}`,
        agentType: "streak-agent",
        outcome,
        reward: outcome === "success" ? 0.9 : 0,
        actionCount: 1,
        startedAt: new Date(base + offset).toISOString(),
        completedAt: new Date(base + offset).toISOString(),
        summary: `run ${id}`,
        tags: [],
        metrics: "{}",
      })
    }

    record(`old-success-${RUN_ID}`, "success", 0)
    record(`mid-failure-${RUN_ID}`, "failed", 1000)
    record(`new-failure-${RUN_ID}`, "failed", 2000)

    const events = evolver.computeEvolutionFromExperiences("streak-agent", "agent-1")
    const caution = events.find((e) => e.traitName === "caution")
    expect(caution).toBeDefined()
    expect(caution!.reason).toContain("2 consecutive failures")
  })

  it("aggregates the newest trait value", async () => {
    const personas = freshPersonaStore("aggregate")
    const evolver = new TraitEvolver(freshExperienceStore("aggregate"), personas)

    personas.recordEvent({
      agentType: "agg-agent",
      agentId: "a1",
      trigger: "manual",
      traitName: "caution",
      oldValue: 50,
      newValue: 60,
      direction: "increase",
      reason: "older event",
      sourceExperienceId: "",
      sourceDreamId: "",
    })
    await sleep(5)
    personas.recordEvent({
      agentType: "agg-agent",
      agentId: "a1",
      trigger: "manual",
      traitName: "caution",
      oldValue: 60,
      newValue: 80,
      direction: "increase",
      reason: "newer event",
      sourceExperienceId: "",
      sourceDreamId: "",
    })

    evolver.aggregateProfile("agg-agent", "a1")

    const profile = personas.getProfile("agg-agent", "a1")
    expect(profile).not.toBeNull()
    expect(profile!.traitScores["caution"]).toBe(80)
  })
})

// -- Retry pipeline -----------------------------------------------------

describe("ExperienceReplay retry pipeline", () => {
  function recordFailure(store: ExperienceStore, id: string, agentType = "build", startedAt = new Date().toISOString()): void {
    store.recordExperience({
      id,
      project: PROJECT_ROOT,
      sessionId: "s1",
      goal: `goal ${id}`,
      agentType,
      outcome: "failed",
      reward: 0,
      actionCount: 1,
      startedAt,
      completedAt: startedAt,
      summary: "Error: something broke",
      tags: ["bug-fix"],
      metrics: "{}",
    })
  }

  it("records retry attempts as non-failures so the failure pool stops growing", async () => {
    const store = freshExperienceStore("retry-pool")
    recordFailure(store, `replay-fail-1-${RUN_ID}`)

    const replay = new ExperienceReplay(store)
    const first = await replay.retryFailures({ maxRetries: 2 })
    expect(first.length).toBe(1)
    expect(first[0]!.newOutcome).toBe("partial")
    expect(first[0]!.newExperienceId).toBeDefined()

    expect(store.getRecentFailures(50).length).toBe(1)

    const second = await replay.retryFailures({ maxRetries: 2 })
    expect(second.length).toBe(1)
    expect(second[0]!.newExperienceId).toBeDefined()
    expect(store.getRecentFailures(50).length).toBe(1)

    const third = await replay.retryFailures({ maxRetries: 2 })
    expect(third[0]!.skipped).toBe(true)
  })

  it("counts retries across the whole table, not just the newest rows", async () => {
    const store = freshExperienceStore("retry-window")
    recordFailure(store, `replay-fail-2-${RUN_ID}`)

    const replay = new ExperienceReplay(store)
    const first = await replay.retryFailures({ maxRetries: 1 })
    expect(first[0]!.newExperienceId).toBeDefined()

    const fillerStart = Date.now() + 60_000
    for (let i = 0; i < 600; i++) {
      store.recordExperience({
        id: `filler-${RUN_ID}-${i}`,
        project: PROJECT_ROOT,
        sessionId: "s1",
        goal: `filler ${i}`,
        agentType: "build",
        outcome: "partial",
        reward: 0,
        actionCount: 0,
        startedAt: new Date(fillerStart + i * 1000).toISOString(),
        completedAt: new Date(fillerStart + i * 1000).toISOString(),
        summary: "filler",
        tags: [],
        metrics: "{}",
      })
    }

    const second = await replay.retryFailures({ maxRetries: 1 })
    expect(second[0]!.skipped).toBe(true)
    expect(second[0]!.newExperienceId).toBeUndefined()
  })

  it("maps an unknown agent type to default", async () => {
    const store = freshExperienceStore("retry-agent")
    recordFailure(store, `replay-fail-3-${RUN_ID}`, "totally-unknown")

    const replay = new ExperienceReplay(store)
    const results = await replay.retryFailures({ maxRetries: 1, strategy: "different-model" })
    expect(results[0]!.newExperienceId).toBeDefined()

    const recorded = store.listRecent(10).find((e) => e.id === results[0]!.newExperienceId)
    expect(recorded).toBeDefined()
    expect(recorded!.agentType).toBe("default")
  })
})

// -- Policy grants ------------------------------------------------------

describe("grant manager", () => {
  const ns = `test-ns-grant-fix-${Date.now()}`
  const nsDir = join(homedir(), ".aegis", "memory", "namespaces", ns)

  afterAll(() => {
    try {
      rmSync(nsDir, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  })

  it("does not overwrite a path-scoped grant with a path-less grant", () => {
    createDefaultPolicy(ns, "owner-team")

    issueGrant({ namespace: ns, to: "team-x", path: "docs/**", tools: ["read"] })
    issueGrant({ namespace: ns, to: "team-x", tools: ["read"] })

    const policy = loadPolicy(ns)
    expect(policy).not.toBeNull()
    const rules = policy!.allow.filter((r) => r.principal === "team-x")
    expect(rules.length).toBe(2)
    expect(rules.some((r) => r.path_filter === "docs/**")).toBe(true)
    expect(rules.some((r) => !r.path_filter)).toBe(true)

    const decision = canRead({ team: "team-x" }, ns, "docs/guide.md", "read")
    expect(decision.allowed).toBe(true)
  })

  it("does not throw when the policies directory is missing", () => {
    const home = join(TMP_ROOT, "empty-home")
    mkdirSync(home, { recursive: true })

    const scriptPath = join(TMP_ROOT, "grant-manager-missing-dir.ts")
    writeFileSync(
      scriptPath,
      [
        `const gm = await import(${JSON.stringify(resolve(process.cwd(), "src/memory/policy/grant-manager.ts"))})`,
        "console.log(JSON.stringify(gm.listGrants()))",
        "console.log(JSON.stringify(gm.checkExpiredGrants()))",
      ].join("\n"),
      "utf-8",
    )

    const proc = Bun.spawnSync({
      cmd: [process.execPath, "run", scriptPath],
      env: { ...process.env, HOME: home, USERPROFILE: home },
      stdout: "pipe",
      stderr: "pipe",
    })

    expect(proc.exitCode).toBe(0)
    const out = proc.stdout.toString().trim().split(/\r?\n/)
    expect(out[0]).toBe("[]")
    expect(out[1]).toBe("[]")
  })
})

// -- Dialectic lock ownership and reset --------------------------------

describe("DialecticEngine", () => {
  it("does not delete a lock it does not own and skips the write", () => {
    const dir = resolve(TMP_ROOT, "dialectic-lock")
    mkdirSync(dir, { recursive: true })
    const lockPath = join(dir, ".user_model.lock")
    writeFileSync(lockPath, "99999", "utf-8")

    const engine = new DialecticEngine(dir, 50)
    engine.applyConfirmed({ type: "add_preference", key: "theme", value: "dark" }, [])

    expect(existsSync(lockPath)).toBe(true)
    expect(existsSync(join(dir, "user_model.json"))).toBe(false)
  })

  it("resets without mutating the shared empty model", () => {
    const dir = resolve(TMP_ROOT, "dialectic-reset")
    mkdirSync(dir, { recursive: true })

    const engine = new DialecticEngine(dir, 1000)
    engine.applyConfirmed({ type: "add_preference", key: "theme", value: "dark" }, [])
    expect(engine.getModel().preferences["theme"]).toBe("dark")

    engine.reset()

    expect(engine.getModel().preferences).toEqual({})
    expect(engine.getModel().decision_patterns).toEqual([])
    expect(EMPTY_USER_MODEL.preferences).toEqual({})
    expect(EMPTY_USER_MODEL.decision_patterns).toEqual([])
    expect(EMPTY_USER_MODEL.audit_log).toEqual([])
  })
})

// -- Memory system write serialisation ----------------------------------

describe("MemorySystem writes", () => {
  function freshSystem(subdir: string): MemorySystem {
    const dir = resolve(TMP_ROOT, subdir)
    mkdirSync(dir, { recursive: true })
    return new MemorySystem(dir)
  }

  it("keeps concurrent appends to MEMORY.md", async () => {
    const sys = freshSystem("concurrent-memory")
    await sys.initialize()

    await Promise.all([
      sys.appendToMemory("alpha entry"),
      sys.appendToMemory("beta entry"),
      sys.appendToMemory("gamma entry"),
    ])

    const mem = await sys.loadMemory()
    expect(mem).toContain("alpha entry")
    expect(mem).toContain("beta entry")
    expect(mem).toContain("gamma entry")
  })

  it("keeps concurrent fact writes", async () => {
    const sys = freshSystem("concurrent-facts")
    await sys.initialize()

    await Promise.all([
      sys.extractAndStoreFacts("I like Rust"),
      sys.extractAndStoreFacts("the project is called Aeon"),
      sys.extractAndStoreFacts("always run the linter"),
    ])

    const facts = await sys.getAllFacts()
    expect(facts.length).toBe(3)
  })

  it("replaces the whole About You section", async () => {
    const dir = resolve(TMP_ROOT, "about-you")
    mkdirSync(dir, { recursive: true })
    const sys = new MemorySystem(dir)
    await sys.initialize()

    const userFile = resolve(dir, "user.md")
    writeFileSync(
      userFile,
      ["# User Profile", "", "## About You", "", "stale line one", "stale line two", "", "## Never Do", "", "- nope", ""].join("\n"),
      "utf-8",
    )

    await sys.updateUserProfile({ name: "Fresh Name" })

    const profile = readFileSync(userFile, "utf-8")
    expect(profile).toContain("Fresh Name")
    expect(profile).not.toContain("stale line one")
    expect(profile).not.toContain("stale line two")
    expect(profile).toContain("## Never Do")
    expect(profile).toContain("- nope")
  })
})
