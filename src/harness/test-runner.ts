import type { TestCase } from "./types"

let passed = 0
let failed = 0
function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label}`) }
}
function assertEqual<T>(a: T, b: T, label: string) {
  if (a === b) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`) }
}

const testCase: TestCase = {
  name: "smoke-test",
  prompt: "Run echo hello",
  tags: ["smoke"],
  timeout: 30000,
}

assertEqual(testCase.name, "smoke-test", "test case has name")
assertEqual(testCase.prompt, "Run echo hello", "test case has prompt")
assert(Array.isArray(testCase.tags!), "test case has tags array")

async function testExports() {
  const runner = await import("./runner")
  assert(typeof runner.runTest === "function", "runner exports runTest")
  assert(typeof runner.runSuite === "function", "runner exports runSuite")
}
await testExports()

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
