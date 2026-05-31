import type { TestCase } from "./types"
import { runTest, runSuite } from "./runner"
import { generateJsonReport, generateMarkdownReport } from "./reporter"

let passed = 0
let failed = 0
function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label}`) }
}

assert(typeof runTest === "function", "exports runTest")
assert(typeof runSuite === "function", "exports runSuite")
assert(typeof generateJsonReport === "function", "exports generateJsonReport")
assert(typeof generateMarkdownReport === "function", "exports generateMarkdownReport")

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
