import { describe, it, expect, beforeEach, afterAll } from "bun:test"
import { mkdirSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { EMPTY_USER_MODEL } from "./types"
import type { UserModel, RecurringTopic, DialecticProposal } from "./types"
import { DialecticEngine } from "./dialectic"

const TMP_BASE = resolve(process.cwd(), "tmp-user-model-test-" + Date.now())

function freshEngine(): DialecticEngine {
  const dir = resolve(TMP_BASE, Math.random().toString(36).slice(2))
  mkdirSync(dir, { recursive: true })
  return new DialecticEngine(dir)
}

afterAll(() => {
  try {
    rmSync(TMP_BASE, { recursive: true, force: true })
  } catch {
    // best-effort
  }
})

describe("EMPTY_USER_MODEL", () => {
  it("has default structure", () => {
    expect(EMPTY_USER_MODEL.version).toBe(1)
    expect(EMPTY_USER_MODEL.preferences).toEqual({})
    expect(EMPTY_USER_MODEL.recurring_topics).toEqual([])
    expect(EMPTY_USER_MODEL.decision_patterns).toEqual([])
    expect(EMPTY_USER_MODEL.audit_log).toEqual([])
  })

  it("contains a valid updated_at timestamp", () => {
    expect(EMPTY_USER_MODEL.updated_at).toBeGreaterThan(0)
  })
})

describe("Type structures", () => {
  it("RecurringTopic has required fields", () => {
    const topic: RecurringTopic = { topic: "auth", frequency: 5, last_seen: Date.now() }
    expect(topic.topic).toBe("auth")
    expect(topic.frequency).toBe(5)
    expect(topic.last_seen).toBeGreaterThan(0)
  })

  it("DialecticProposal supports all change types", () => {
    const proposal: DialecticProposal = {
      type: "add_preference",
      key: "theme",
      value: "dark",
      reason: "User consistently chooses dark mode",
    }
    expect(proposal.type).toBe("add_preference")
    expect(proposal.key).toBe("theme")
  })

  it("UserModel can hold preferences, topics, and patterns", () => {
    const model: UserModel = {
      ...EMPTY_USER_MODEL,
      preferences: { theme: "dark", lang: "TypeScript" },
      recurring_topics: [
        { topic: "auth", frequency: 10, last_seen: Date.now() },
        { topic: "testing", frequency: 7, last_seen: Date.now() },
      ],
      decision_patterns: ["prefer-immutable-data", "test-first"],
    }
    expect(Object.keys(model.preferences).length).toBe(2)
    expect(model.recurring_topics.length).toBe(2)
    expect(model.decision_patterns.length).toBe(2)
  })
})

describe("DialecticEngine", () => {
  it("initializes with empty model when no file exists", () => {
    const engine = freshEngine()
    const model = engine.getModel()
    expect(model.preferences).toEqual({})
    expect(model.recurring_topics).toEqual([])
    expect(model.decision_patterns).toEqual([])
  })

  it("adds a preference via applyConfirmed", () => {
    const engine = freshEngine()
    engine.applyConfirmed({ type: "add_preference", key: "theme", value: "dark" }, [])
    expect(engine.getModel().preferences["theme"]).toBe("dark")
  })

  it("updates a preference via applyConfirmed", () => {
    const engine = freshEngine()
    engine.applyConfirmed({ type: "add_preference", key: "lang", value: "TypeScript" }, [])
    engine.applyConfirmed({ type: "update_preference", key: "lang", new_value: "Rust", old_value: "TypeScript" }, [])
    expect(engine.getModel().preferences["lang"]).toBe("Rust")
  })

  it("removes a preference via applyConfirmed", () => {
    const engine = freshEngine()
    engine.applyConfirmed({ type: "add_preference", key: "to-remove", value: "val" }, [])
    engine.applyConfirmed({ type: "remove_preference", key: "to-remove" }, [])
    expect(engine.getModel().preferences["to-remove"]).toBeUndefined()
  })

  it("adds a decision pattern via applyConfirmed", () => {
    const engine = freshEngine()
    engine.applyConfirmed({ type: "add_pattern", value: "test-first-always" }, [])
    expect(engine.getModel().decision_patterns).toContain("test-first-always")
  })

  it("removes a decision pattern via applyConfirmed", () => {
    const engine = freshEngine()
    engine.applyConfirmed({ type: "add_pattern", value: "to-remove" }, [])
    engine.applyConfirmed({ type: "remove_pattern", value: "to-remove" }, [])
    expect(engine.getModel().decision_patterns).not.toContain("to-remove")
  })

  it("isMaterial returns true for add_preference", () => {
    const engine = freshEngine()
    expect(engine.isMaterial({ type: "add_preference", key: "x", value: "y" })).toBe(true)
  })

  it("isMaterial returns false for no_change", () => {
    const engine = freshEngine()
    expect(engine.isMaterial({ type: "no_change" })).toBe(false)
  })

  it("applySilent tracks recurring topics", () => {
    const engine = freshEngine()
    engine.applySilent("authentication")
    const model = engine.getModel()
    const found = model.recurring_topics.find((t) => t.topic === "authentication")
    expect(found).toBeDefined()
    expect(found!.frequency).toBeGreaterThan(0)
  })

  it("applySilent increments frequency on repeated calls", () => {
    const engine = freshEngine()
    engine.applySilent("topic-x")
    engine.applySilent("topic-x")
    const model = engine.getModel()
    const found = model.recurring_topics.find((t) => t.topic === "topic-x")
    expect(found!.frequency).toBeGreaterThan(0.05)
  })

  it("applyConfirmed records audit log entry", () => {
    const engine = freshEngine()
    engine.applyConfirmed({ type: "add_preference", key: "color", value: "blue" }, ["turn-1", "turn-2"])
    const log = engine.getModel().audit_log
    expect(log.length).toBeGreaterThan(0)
    expect(log[0].evidence).toContain("turn-1")
    expect(log[0].confirmed).toBe(true)
  })

  it("persists model to disk on save and reloads", () => {
    const dir = resolve(TMP_BASE, "persist-" + Math.random().toString(36).slice(2))
    mkdirSync(dir, { recursive: true })
    const engine = new DialecticEngine(dir)
    engine.applyConfirmed({ type: "add_preference", key: "editor", value: "vim" }, [])
    // applyConfirmed already calls save(), but calling explicitly is idempotent
    engine.save()

    const reloaded = new DialecticEngine(dir)
    expect(reloaded.getModel().preferences["editor"]).toBe("vim")
  })
})
