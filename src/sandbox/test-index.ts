import { FilesystemSandbox, ProcessSandbox, DockerSandbox } from "./index"

let passed = 0
let failed = 0
function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label}`) }
}

const fsBox = new FilesystemSandbox({ enabled: true })
assert(fsBox.name === "filesystem", "filesystem sandbox name")

const procBox = new ProcessSandbox({ enabled: true })
assert(procBox.name === "process", "process sandbox name")

const dockerBox = new DockerSandbox({ enabled: false })
assert(dockerBox.name === "docker", "docker sandbox name")

const check = procBox.restrictCommand("echo ok")
assert(check.allowed, "process sandbox allows echo")

console.log(`${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
