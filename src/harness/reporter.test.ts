import { describe, expect } from "bun:test"
import { generateJsonReport, generateMarkdownReport } from "./reporter"
import type { EvalResult } from "./types"

describe("Reporter Tests", () => {

const mockResult: EvalResult = {
  test: { name: "test-a", prompt: "do something", tags: ["smoke"], timeout: 30000 },
  passed: true,
  output: "done",
  trace: [{ name: "bash", params: { command: "echo hi" }, result: "hi", durationMs: 100 }],
  steps: 1,
  totalTokens: 50,
  durationMs: 500,
}

const mockFailed: EvalResult = {
  test: { name: "test-b", prompt: "fail" },
  passed: false,
  output: "",
  trace: [],
  steps: 0,
  totalTokens: 0,
  durationMs: 200,
  error: "Timeout",
}

const json = generateJsonReport([mockResult, mockFailed])
const parsed = JSON.parse(json)
expect(parsed.total === 2).toBe(true)
expect(parsed.passed === 1).toBe(true)
expect(parsed.failed === 1).toBe(true)

const md = generateMarkdownReport([mockResult, mockFailed])
expect(md.includes("Passed | 1")).toBe(true)
expect(md.includes("Failed | 1")).toBe(true)
expect(md.includes("test-b")).toBe(true)
expect(md.includes("Total | 2")).toBe(true)

})
