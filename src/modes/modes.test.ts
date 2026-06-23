/**
 * Tests for mode implementations: registry, types, sandbox, config, plan, research.
 *
 * AI-calling code (plan orchestrator, research loop) is not exercised here —
 * those require a real API key. We test configuration, pure logic, and the
 * mode registration/discovery surface.
 */

import { describe, it, expect, beforeEach } from "bun:test"
import { parseKey } from "./types"
import type { Mode, KeyEvent } from "./types"
import type { PlanStep, Plan } from "./plan/types"
import type { ResearchConfig, ResearchIteration } from "./research"

// ── parseKey ──────────────────────────────────────────────────────────────

describe("parseKey", () => {
  it("parses up arrow", () => {
    expect(parseKey("\x1b[A")).toEqual({ type: "up" })
  })

  it("parses down arrow", () => {
    expect(parseKey("\x1b[B")).toEqual({ type: "down" })
  })

  it("parses left arrow", () => {
    expect(parseKey("\x1b[D")).toEqual({ type: "left" })
  })

  it("parses right arrow", () => {
    expect(parseKey("\x1b[C")).toEqual({ type: "right" })
  })

  it("parses enter (CR)", () => {
    expect(parseKey("\r")).toEqual({ type: "enter" })
  })

  it("parses enter (LF)", () => {
    expect(parseKey("\n")).toEqual({ type: "enter" })
  })

  it("parses escape", () => {
    expect(parseKey("\x1b")).toEqual({ type: "escape" })
  })

  it("parses ctrl+c", () => {
    expect(parseKey("\x03")).toEqual({ type: "ctrl_c" })
  })

  it("parses ctrl+q", () => {
    expect(parseKey("\x11")).toEqual({ type: "ctrl_q" })
  })

  it("parses ctrl+p", () => {
    expect(parseKey("\x10")).toEqual({ type: "ctrl_p" })
  })

  it("parses ctrl+l", () => {
    expect(parseKey("\x0c")).toEqual({ type: "ctrl_l" })
  })

  it("parses tab", () => {
    expect(parseKey("\t")).toEqual({ type: "tab" })
  })

  it("parses backspace (DEL)", () => {
    expect(parseKey("\x7f")).toEqual({ type: "backspace" })
  })

  it("parses backspace (BS)", () => {
    expect(parseKey("\b")).toEqual({ type: "backspace" })
  })

  it("parses delete key", () => {
    expect(parseKey("\x1b[3~")).toEqual({ type: "delete" })
  })

  it("parses home key", () => {
    expect(parseKey("\x1b[H")).toEqual({ type: "home" })
  })

  it("parses end key", () => {
    expect(parseKey("\x1b[F")).toEqual({ type: "end" })
  })

  it("parses page up", () => {
    expect(parseKey("\x1b[5~")).toEqual({ type: "page_up" })
  })

  it("parses page down", () => {
    expect(parseKey("\x1b[6~")).toEqual({ type: "page_down" })
  })

  it("parses printable characters", () => {
    expect(parseKey("a")).toEqual({ type: "char", char: "a" })
    expect(parseKey("Z")).toEqual({ type: "char", char: "Z" })
    expect(parseKey("5")).toEqual({ type: "char", char: "5" })
    expect(parseKey(" ")).toEqual({ type: "char", char: " " })
  })

  it("returns unknown for unrecognised sequences", () => {
    const result = parseKey("\x1b[99X") as KeyEvent & { type: "unknown"; raw: string }
    expect(result.type).toBe("unknown")
    expect(result.raw).toBe("\x1b[99X")
  })
})

// ── Mode registry ──────────────────────────────────────────────────────────

describe("Mode registry", () => {
  // Use a private fresh registry per test by re-importing dynamically
  it("registerMode and getMode are consistent", async () => {
    const { registerMode, getMode } = await import("./registry")
    const fakeMode: Mode = {
      id: "test-reg-mode",
      name: "Test Registry Mode",
      description: "Unit-test mode",
      async run() {
        return "back"
      },
    }
    registerMode(fakeMode)
    const found = getMode("test-reg-mode")
    expect(found).toBeDefined()
    expect(found!.id).toBe("test-reg-mode")
    expect(found!.name).toBe("Test Registry Mode")
  })

  it("listModes includes registered mode", async () => {
    const { registerMode, listModes } = await import("./registry")
    const fakeMode: Mode = {
      id: "test-list-mode",
      name: "Test List Mode",
      description: "Another unit-test mode",
      async run() {
        return "quit"
      },
    }
    registerMode(fakeMode)
    const list = listModes()
    expect(list.some((m) => m.id === "test-list-mode")).toBe(true)
  })

  it("getModeNames returns registered ids", async () => {
    const { registerMode, getModeNames } = await import("./registry")
    const fakeMode: Mode = {
      id: "test-names-mode",
      name: "Test Names Mode",
      description: "Mode for getModeNames",
      async run() {
        return "back"
      },
    }
    registerMode(fakeMode)
    expect(getModeNames()).toContain("test-names-mode")
  })

  it("getMode returns undefined for unknown id", async () => {
    const { getMode } = await import("./registry")
    expect(getMode("absolutely-nonexistent")).toBeUndefined()
  })
})

// ── Mode interface contract ────────────────────────────────────────────────

describe("Mode interface", () => {
  it("a mode can return 'back'", async () => {
    const backMode: Mode = {
      id: "back-mode",
      name: "Back",
      description: "Returns back",
      async run() {
        return "back"
      },
    }
    expect(await backMode.run()).toBe("back")
  })

  it("a mode can return 'quit'", async () => {
    const quitMode: Mode = {
      id: "quit-mode",
      name: "Quit",
      description: "Returns quit",
      async run() {
        return "quit"
      },
    }
    expect(await quitMode.run()).toBe("quit")
  })
})

// ── Plan types ────────────────────────────────────────────────────────────

describe("Plan/PlanStep types", () => {
  it("PlanStep has required fields", () => {
    const step: PlanStep = {
      id: "step-1",
      title: "Write unit tests",
      description: "Add tests for all new modules",
    }
    expect(step.id).toBe("step-1")
    expect(step.title).toBe("Write unit tests")
    expect(step.complexity).toBeUndefined()
  })

  it("PlanStep supports optional fields", () => {
    const step: PlanStep = {
      id: "step-2",
      title: "Refactor database layer",
      description: "Extract DB access behind interfaces",
      hints: ["Use repository pattern", "Inject dependencies"],
      complexity: "high",
    }
    expect(step.hints!.length).toBe(2)
    expect(step.complexity).toBe("high")
  })

  it("Plan holds goal and steps", () => {
    const plan: Plan = {
      goal: "Improve test coverage",
      researchSummary: "Current coverage is 45%",
      steps: [
        { id: "s1", title: "Write recall tests", description: "Add FTS5 indexer tests" },
        { id: "s2", title: "Write graph tests", description: "Add GraphStorage tests" },
      ],
    }
    expect(plan.goal).toBe("Improve test coverage")
    expect(plan.steps.length).toBe(2)
    expect(plan.researchSummary).toBeDefined()
  })
})

// ── Research types ────────────────────────────────────────────────────────

describe("ResearchConfig and ResearchIteration types", () => {
  it("ResearchConfig has required fields", () => {
    const cfg: ResearchConfig = {
      goal: "Reduce bundle size by 20%",
      successCriteria: "bundle < 500KB",
    }
    expect(cfg.goal).toBe("Reduce bundle size by 20%")
    expect(cfg.maxIterations).toBeUndefined()
  })

  it("ResearchConfig supports optional fields", () => {
    const cfg: ResearchConfig = {
      goal: "Pass all tests",
      successCriteria: "exit 0",
      maxIterations: 5,
      testCommand: "bun test",
      workspacePath: "/tmp/workspace",
    }
    expect(cfg.maxIterations).toBe(5)
    expect(cfg.testCommand).toBe("bun test")
  })

  it("ResearchIteration outcome is one of the valid values", () => {
    const outcomes: ResearchIteration["outcome"][] = ["improved", "degraded", "neutral", "error"]
    for (const outcome of outcomes) {
      const iter: ResearchIteration = {
        iteration: 1,
        hypothesis: "h",
        approach: "a",
        outcome,
        summary: "s",
      }
      expect(iter.outcome).toBe(outcome)
    }
  })
})
