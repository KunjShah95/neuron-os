import { describe, it, expect } from "bun:test"
import type { TestCase } from "./types"

describe("Runner Tests", () => {
  const testCase: TestCase = {
    id: "smoke-test",
    name: "smoke-test",
    prompt: "Run echo hello",
    tags: ["smoke"],
    timeout: 30000,
  }

  it("should have correct test case properties", () => {
    expect(testCase.name).toBe("smoke-test")
    expect(testCase.prompt).toBe("Run echo hello")
    expect(Array.isArray(testCase.tags!)).toBe(true)
  })

  it("should export runTest and runSuite", async () => {
    const runner = await import("./runner")
    expect(typeof runner.runTest === "function").toBe(true)
    expect(typeof runner.runSuite === "function").toBe(true)
  })
})
