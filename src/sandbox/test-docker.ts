import { DockerSandbox } from "./docker"

let passed = 0
let failed = 0
function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label}`) }
}

const s = new DockerSandbox({ enabled: false })
const status = s.status()
assert(!status.active, "disabled docker sandbox is inactive")
assert(status.type === "docker", "status type is docker")

s.cleanup()
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
