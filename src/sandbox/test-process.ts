import { ProcessSandbox } from "./process"

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

const s = new ProcessSandbox({ enabled: true })

const res1 = s.restrictCommand("echo hello")
assert(res1.allowed, "allows safe command")
assert(res1.modifiedCmd!.startsWith("cd "), "prepends cd to tempdir")

const res2 = s.restrictCommand("rm -rf /")
assert(!res2.allowed, "denies rm -rf /")

const res3 = s.restrictCommand("sudo rm -rf /etc")
assert(!res3.allowed, "denies sudo command")

const res4 = s.restrictCommand("mkfs.ext4 /dev/sda")
assert(!res4.allowed, "denies mkfs")

const s2 = new ProcessSandbox({ enabled: true, allowedCommands: ["npm test", "git status"] })
const res5 = s2.restrictCommand("npm test")
assert(res5.allowed, "allows whitelisted command")

const res6 = s2.restrictCommand("rm file.txt")
assert(!res6.allowed, "denies non-whitelisted command")

s.cleanup()

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
