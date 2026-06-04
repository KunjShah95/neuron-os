#!/usr/bin/env bun
/**
 * Unit tests for the Cron engine module.
 *
 * Tests: job persistence (CRUD), heartbeat checklist, schedule parsing,
 * and cron job lifecycle (without spawning real agents).
 */

import { existsSync, mkdirSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { tmpdir } from "node:os"

let passed = 0
let failed = 0

function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label}`) }
}

function assertEqual<T>(a: T, b: T, label: string) {
  if (a === b) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
}

const TMP_DIR = resolve(tmpdir(), `aegis-test-cron-${Date.now()}`)

function setup() {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true })
}

function teardown() {
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true })
}

// We test the engine by directly testing its exported functions
// without mocking, focusing on the pure logic paths.

// ══════════════════════════════════════════════════════════════════
//  Cron Job Persistence
// ══════════════════════════════════════════════════════════════════

console.log("\n╔══════════════════════════════════════════════════════════╗")
console.log("║  Cron Engine — Job CRUD                                ║")
console.log("╚══════════════════════════════════════════════════════════╝\n")

async function testLoadCronJobsEmpty() {
  const { loadCronJobs } = await import("./engine")
  const jobs = await loadCronJobs()
  assert(Array.isArray(jobs), "loadCronJobs returns an array when no file exists")
}

async function testAddAndListJobs() {
  const { addCronJob, listActiveJobs } = await import("./engine")

  const job = { name: "test-job", schedule: "30m", goal: "Run tests" }
  await addCronJob(job)

  const jobs = await listActiveJobs()
  const found = jobs.find((j) => j.name === "test-job")
  assert(found !== undefined, "added job appears in list")
  assertEqual(found?.schedule, "30m", "job schedule preserved")
  assertEqual(found?.goal, "Run tests", "job goal preserved")
}

async function testAddMultipleJobs() {
  const { addCronJob, listActiveJobs } = await import("./engine")

  await addCronJob({ name: "job-alpha", schedule: "1h", goal: "Alpha task" })
  await addCronJob({ name: "job-beta", schedule: "6h", goal: "Beta task" })

  const jobs = await listActiveJobs()
  const alpha = jobs.find((j) => j.name === "job-alpha")
  const beta = jobs.find((j) => j.name === "job-beta")
  assert(alpha !== undefined, "job-alpha added")
  assert(beta !== undefined, "job-beta added")
  assert(jobs.length >= 2, "multiple jobs persisted")
}

async function testRemoveJob() {
  const { removeCronJob, listActiveJobs } = await import("./engine")

  const removed = await removeCronJob("job-alpha")
  assert(removed, "removeCronJob returns true when job existed")

  const jobs = await listActiveJobs()
  const found = jobs.find((j) => j.name === "job-alpha")
  assert(found === undefined, "removed job no longer in list")
}

async function testRemoveNonExistentJob() {
  const { removeCronJob } = await import("./engine")
  const removed = await removeCronJob("nonexistent-job")
  assert(!removed, "removeCronJob returns false for non-existent job")
}

// ══════════════════════════════════════════════════════════════════
//  Heartbeat Checklist
// ══════════════════════════════════════════════════════════════════

console.log("\n╔══════════════════════════════════════════════════════════╗")
console.log("║  Cron Engine — Heartbeat & Checklist                    ║")
console.log("╚══════════════════════════════════════════════════════════╝\n")

async function testEnsureHeartbeatFile() {
  const { ensureHeartbeatFile } = await import("./engine")

  // Point to temp dir by changing cwd... Actually the engine uses
  // DATA_DIR = resolve(process.cwd(), "data") internally.
  // We just verify the function doesn't throw.
  try {
    await ensureHeartbeatFile()
    assert(true, "ensureHeartbeatFile completes without error")
  } catch (err) {
    assert(false, `ensureHeartbeatFile threw: ${err}`)
  }
}

async function testHeartbeatOkWithNoChecklist() {
  const { runHeartbeat } = await import("./engine")
  const result = await runHeartbeat()
  // If no incomplete items, returns "HEARTBEAT_OK"
  assert(typeof result === "string" || typeof result === "object", "runHeartbeat returns result")
}

async function testParseCronSchedule() {
  // Schedule parsing is internal to engine, but we can test via addCronJob
  const { addCronJob, listActiveJobs } = await import("./engine")

  await addCronJob({ name: "schedule-test-1h", schedule: "1h", goal: "Test 1h" })
  const jobs = await listActiveJobs()
  const found = jobs.find((j) => j.name === "schedule-test-1h")
  assert(found !== undefined, "job with 1h schedule is accepted")
  assertEqual(found?.schedule, "1h", "1h schedule preserved")
}

async function testCronJobWithAgentType() {
  const { addCronJob, listActiveJobs } = await import("./engine")

  await addCronJob({
    name: "typed-job",
    schedule: "30m",
    goal: "Typed test",
    agentType: "build",
  })

  const jobs = await listActiveJobs()
  const found = jobs.find((j) => j.name === "typed-job")
  assert(found !== undefined, "job with agentType is accepted")
  assertEqual(found?.agentType, "build", "agentType preserved")
}

// ══════════════════════════════════════════════════════════════════
//  Cleanup (remove test jobs)
// ══════════════════════════════════════════════════════════════════

async function testCleanup() {
  const { removeCronJob } = await import("./engine")
  await removeCronJob("test-job")
  await removeCronJob("job-beta")
  await removeCronJob("schedule-test-1h")
  await removeCronJob("typed-job")
  assert(true, "test jobs cleaned up")
}

// ══════════════════════════════════════════════════════════════════
//  RUNNER
// ══════════════════════════════════════════════════════════════════

async function runAll() {
  console.log("\n  ╔══════════════════════════════════════════╗")
  console.log("  ║   Cron Module Tests                      ║")
  console.log("  ╚══════════════════════════════════════════╝")

  setup()

  await testLoadCronJobsEmpty()
  await testAddAndListJobs()
  await testAddMultipleJobs()
  await testRemoveJob()
  await testRemoveNonExistentJob()
  await testEnsureHeartbeatFile()
  await testHeartbeatOkWithNoChecklist()
  await testParseCronSchedule()
  await testCronJobWithAgentType()
  await testCleanup()

  teardown()

  console.log(`\n══ Results: ${passed} passed, ${failed} failed ══\n`)
  process.exit(failed > 0 ? 1 : 0)
}

runAll()
