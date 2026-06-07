import { describe, it, expect } from "bun:test"
import { generateAdversarialEvals } from "./generator"
import { existsSync, writeFileSync, mkdirSync, unlinkSync, rmdirSync } from "fs"
import { join } from "path"

const TEST_TASK_DIR = join(import.meta.dirname, "../../../evals", "adversarial-test")
const TEST_TASK = join(TEST_TASK_DIR, "test-task.yaml")

function setup(): void {
  mkdirSync(TEST_TASK_DIR, { recursive: true })
  writeFileSync(TEST_TASK, "id: test-task\ninput: assume n > 0\n  true\n  hello\n", "utf-8")
}

function teardown(): void {
  try {
    unlinkSync(TEST_TASK)
  } catch {}
  try {
    rmdirSync(TEST_TASK_DIR)
  } catch {}
}

describe("adversarial generator", () => {
  it("generates mutation evals", () => {
    setup()
    try {
      const results = generateAdversarialEvals(TEST_TASK, 3)
      expect(results.length).toBe(3)
      for (const r of results) {
        expect(existsSync(r)).toBe(true)
      }
    } finally {
      teardown()
    }
  })

  it("throws for missing task file", () => {
    expect(() => generateAdversarialEvals("/nonexistent.yaml", 1)).toThrow("not found")
  })
})
