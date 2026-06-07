import { describe, expect } from "bun:test"
import { generateJsonReport, generateMarkdownReport, generateHtmlReport } from "./reporter"
import type { EvalResult } from "./types"

describe("Reporter Tests", () => {
  const mockResult: EvalResult = {
    test: { id: "test-a", name: "test-a", prompt: "do something", tags: ["smoke"], timeout: 30000 },
    passed: true,
    score: 1.0,
    grades: [],
    output: "done",
    trace: [{ name: "bash", params: { command: "echo hi" }, result: "hi", durationMs: 100 }],
    steps: 1,
    totalTokens: 50,
    totalCost: 0.001,
    durationMs: 500,
    model: "test-model",
    agentType: "harness",
    timestamp: new Date().toISOString(),
    metadata: {},
  }

  const mockFailed: EvalResult = {
    test: { id: "test-b", name: "test-b", prompt: "fail", tags: [], timeout: 30000 },
    passed: false,
    score: 0,
    grades: [],
    output: "",
    trace: [],
    steps: 0,
    totalTokens: 0,
    totalCost: 0,
    durationMs: 200,
    error: "Timeout",
    model: "test-model",
    agentType: "harness",
    timestamp: new Date().toISOString(),
    metadata: {},
  }

  const json = generateJsonReport([mockResult, mockFailed])
  const parsed = JSON.parse(json)
  expect(parsed.totalTests === 2).toBe(true)
  expect(parsed.passed === 1).toBe(true)
  expect(parsed.failed === 1).toBe(true)

  const md = generateMarkdownReport([mockResult, mockFailed])
  expect(md.includes("Passed | 1")).toBe(true)
  expect(md.includes("Failed | 1")).toBe(true)
  expect(md.includes("test-b")).toBe(true)
  expect(md.includes("Total | 2")).toBe(true)

  // HTML report test
  const html = generateHtmlReport([mockResult, mockFailed])
  expect(html.includes("<html")).toBe(true)
  expect(html.includes("test-a")).toBe(true)
  expect(html.includes("test-b")).toBe(true)
  expect(html.includes("2")).toBe(true) // Total tests in stats
})
