import { describe, expect } from "bun:test"
// Simple assertion-based tests for AgentManager recovery/backoff logic

import { agentManager } from "./manager"
import type { AgentInstance } from "./types"

describe("Manager Tests", () => {

const id = "test-agent-recovery"

// Create a fake subprocess stub
const fakeProc = {
  pid: 0,
  kill: (_sig?: number) => {},
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
expect(calc(cfg, 0)).toBe(1000)
expect(calc(cfg, 1)).toBe(2000)
expect(calc(cfg, 3)).toBe(8000 > 5000 ? 5000 : 8000)

// Trigger recovery — should schedule a timer
const didSchedule = trig(id, 1)
expect(didSchedule === true).toBe(true)
expect(agentManager.hasPendingRecovery(id) === true).toBe(true)

// Cancel recovery and ensure it's cleared
agentManager.cancelRecovery(id)
expect(agentManager.hasPendingRecovery(id) === false).toBe(true)

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
expect(didSchedule2 === false).toBe(true)

})
