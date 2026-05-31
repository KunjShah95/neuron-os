import { FilesystemSandbox } from "./filesystem"
import { resolve } from "node:path"

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

const testDir = resolve(process.cwd(), "src/sandbox")
const s = new FilesystemSandbox({ allowedPaths: [testDir] })

assertEqual(s.restrictPath(testDir + "/types.ts"), testDir + "/types.ts", "allows path within allowed dir")
assertEqual(s.restrictPath(process.cwd() + "/node_modules"), null, "denies path outside allowed dir")
assertEqual(s.restrictPath("/etc/passwd"), null, "denies absolute system path")

s.enabled = false
assertEqual(s.restrictPath("/etc/passwd"), "/etc/passwd", "passes through when disabled")
s.enabled = true

const status = s.status()
assert(status.type === "filesystem", "status type is filesystem")
assert(status.active === true, "status active")

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
