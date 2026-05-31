import { generateJsonReport, generateMarkdownReport } from "./reporter"
import type { EvalResult } from "./types"

let passed = 0
let failed = 0
function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label}`) }
}

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
assert(parsed.total === 2, "json report has total 2")
assert(parsed.passed === 1, "json report has 1 passed")
assert(parsed.failed === 1, "json report has 1 failed")

const md = generateMarkdownReport([mockResult, mockFailed])
assert(md.includes("Passed | 1"), "markdown shows 1 passed")
assert(md.includes("Failed | 1"), "markdown shows 1 failed")
assert(md.includes("test-b"), "markdown includes failed test name")
assert(md.includes("Total | 2"), "markdown shows total 2")

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
