#!/usr/bin/env bun
// Simple assertion-based tests for AgentManager recovery/backoff logic

import { agentManager } from "./manager"
import type { AgentInstance } from "./types"

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

function assertEqual(a: unknown, b: unknown, label: string) {
  if (a === b) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failed++
    console.error(`  ❌ ${label} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

console.log("\n=== AgentManager Recovery / Backoff Tests ===")

const id = "test-agent-recovery"

// Create a fake subprocess stub
const fakeProc = {
  pid: 0,
  kill: (sig?: number) => {},
  exited: Promise.resolve(0),
  stdin: null,
  stdout: null,
  stderr: null,
} as unknown as any

const instance: AgentInstance = {
  id,
  def: {
    name: "test",
    script: "src/agent/agent-worker.ts",
    recovery: { maxRetries: 3, backoffMs: 10, backoffMultiplier: 2, backoffMax: 1000 },
  },
  status: "running",
  process: fakeProc,
  spawnTime: Date.now(),
  lastActivity: Date.now(),
  log: [],
  pid: 0,
  exitCode: null,
  metadata: {},
}

// Ensure clean state
agentManager.cancelRecovery(id)
agentManager.agents.set(id, instance)

// Access private methods via `any`
const calc = (agentManager as any).calculateBackoff.bind(agentManager) as (cfg: any, attempt: number) => number
const trig = (agentManager as any).triggerRecovery.bind(agentManager) as (agentId: string, code: number) => boolean

// Test backoff calculation
const cfg = { backoffMs: 1000, backoffMultiplier: 2, backoffMax: 5000 }
assertEqual(calc(cfg, 0), 1000, "backoff #0 = base")
assertEqual(calc(cfg, 1), 2000, "backoff #1 = base * multiplier")
assertEqual(calc(cfg, 3), 8000 > 5000 ? 5000 : 8000, "backoff capped at max")

// Trigger recovery — should schedule a timer
const didSchedule = trig(id, 1)
assert(didSchedule === true, "triggerRecovery returns true when recovery configured")
assert(agentManager.hasPendingRecovery(id) === true, "hasPendingRecovery returns true after scheduling")

// Cancel recovery and ensure it's cleared
agentManager.cancelRecovery(id)
assert(agentManager.hasPendingRecovery(id) === false, "cancelRecovery clears pending recovery")

// Edge: triggerRecovery when no recovery config
const id2 = "no-recovery"
const inst2: AgentInstance = {
  id: id2,
  def: { name: "norec", script: "src/agent/agent-worker.ts" },
  status: "running",
  process: fakeProc,
  spawnTime: Date.now(),
  lastActivity: Date.now(),
  log: [],
  pid: 0,
  exitCode: null,
  metadata: {},
}
agentManager.agents.set(id2, inst2)
const didSchedule2 = trig(id2, 1)
assert(didSchedule2 === false, "triggerRecovery returns false when no recovery config")

console.log("")
console.log(`Tests: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
