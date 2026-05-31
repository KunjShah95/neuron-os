#!/usr/bin/env bun

import { createAgentRuntime } from "./runtime"
import { toolRegistry } from "../tools"

let passed = 0
let failed = 0

function assert(cond: boolean, label: string) {
  if (cond) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failed++
    console.error(`  ❌ ${label}`)
  }
}

console.log("\n=== Agent Runtime Prompt / Skill Tests ===")

const runtime = createAgentRuntime("runtime-test", "build", process.cwd())
const prompt = await runtime.buildSystemPrompt()

assert(prompt.includes("Build Soul"), "build system prompt includes agent soul")
assert(prompt.includes("Skill Catalog"), "build system prompt includes skill catalog")
assert(prompt.includes("code-review"), "build system prompt references installed skills")

const result = await toolRegistry.execute(
  "read_skill",
  { name: "code-review" },
  {
    agentId: "runtime-test",
    agentType: "build",
    cwd: process.cwd(),
    permissions: [{ name: "read_skill", allow: true }],
  },
)

assert(result.success, "read_skill tool succeeds for installed skills")
assert(result.output.includes("Code Review"), "read_skill returns full skill content")

console.log("")
console.log(`Tests: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
