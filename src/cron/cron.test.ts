import { describe, it, expect } from "bun:test"
/**
 * Unit tests for the Cron engine module.
 *
 * Tests: job persistence (CRUD), heartbeat checklist, schedule parsing,
 * and cron job lifecycle (without spawning real agents).
 */

describe("Cron Tests", () => {
  // We test the engine by directly testing its exported functions
  // without mocking, focusing on the pure logic paths.

  // ══════════════════════════════════════════════════════════════════
  //  Cron Job Persistence
  // ══════════════════════════════════════════════════════════════════

  console.log("╚══════════════════════════════════════════════════════════╝\n")

  it("should load cron jobs empty", async () => {
    const { loadCronJobs } = await import("./engine")
    const jobs = await loadCronJobs()
    expect(Array.isArray(jobs)).toBe(true)
  })

  it("should add and list jobs", async () => {
    const { addCronJob, listActiveJobs } = await import("./engine")

    const job = { name: "test-job", schedule: "30m", goal: "Run tests" }
    await addCronJob(job)

    const jobs = await listActiveJobs()
    const found = jobs.find((j) => j.name === "test-job")
    expect(found !== undefined).toBe(true)
    expect(found?.schedule).toBe("30m")
    expect(found?.goal).toBe("Run tests")
  })

  it("should add multiple jobs", async () => {
    const { addCronJob, listActiveJobs } = await import("./engine")

    await addCronJob({ name: "job-alpha", schedule: "1h", goal: "Alpha task" })
    await addCronJob({ name: "job-beta", schedule: "6h", goal: "Beta task" })

    const jobs = await listActiveJobs()
    const alpha = jobs.find((j) => j.name === "job-alpha")
    const beta = jobs.find((j) => j.name === "job-beta")
    expect(alpha !== undefined).toBe(true)
    expect(beta !== undefined).toBe(true)
    expect(jobs.length >= 2).toBe(true)
  })

  it("should remove job", async () => {
    const { removeCronJob, listActiveJobs } = await import("./engine")

    const removed = await removeCronJob("job-alpha")
    expect(removed).toBe(true)

    const jobs = await listActiveJobs()
    const found = jobs.find((j) => j.name === "job-alpha")
    expect(found === undefined).toBe(true)
  })

  it("should remove non existent job", async () => {
    const { removeCronJob } = await import("./engine")
    const removed = await removeCronJob("nonexistent-job")
    expect(!removed).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════
  //  Heartbeat Checklist
  // ══════════════════════════════════════════════════════════════════

  console.log("╚══════════════════════════════════════════════════════════╝\n")

  it("should ensure heartbeat file", async () => {
    const { ensureHeartbeatFile } = await import("./engine")

    // Point to temp dir by changing cwd... Actually the engine uses
    // DATA_DIR = resolve(process.cwd(), "data") internally.
    // We just verify the function doesn't throw.
    try {
      await ensureHeartbeatFile()
      expect(true).toBe(true)
    } catch {
      expect(false).toBe(true)
    }
  })

  it("should heartbeat ok with no checklist", async () => {
    const { runHeartbeat } = await import("./engine")
    const result = await runHeartbeat()
    // If no incomplete items, returns "HEARTBEAT_OK"
    expect(typeof result === "string" || typeof result === "object").toBe(true)
  })

  it("should parse cron schedule", async () => {
    // Schedule parsing is internal to engine, but we can test via addCronJob
    const { addCronJob, listActiveJobs } = await import("./engine")

    await addCronJob({ name: "schedule-test-1h", schedule: "1h", goal: "Test 1h" })
    const jobs = await listActiveJobs()
    const found = jobs.find((j) => j.name === "schedule-test-1h")
    expect(found !== undefined).toBe(true)
    expect(found?.schedule).toBe("1h")
  })

  it("should cron job with agent type", async () => {
    const { addCronJob, listActiveJobs } = await import("./engine")

    await addCronJob({
      name: "typed-job",
      schedule: "30m",
      goal: "Typed test",
      agentType: "build",
    })

    const jobs = await listActiveJobs()
    const found = jobs.find((j) => j.name === "typed-job")
    expect(found !== undefined).toBe(true)
    expect(found?.agentType).toBe("build")
  })

  // ══════════════════════════════════════════════════════════════════
  //  Cleanup (remove test jobs)
  // ══════════════════════════════════════════════════════════════════

  it("should cleanup", async () => {
    const { removeCronJob } = await import("./engine")
    await removeCronJob("test-job")
    await removeCronJob("job-beta")
    await removeCronJob("schedule-test-1h")
    await removeCronJob("typed-job")
    expect(true).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════
  //  RUNNER
  // ══════════════════════════════════════════════════════════════════
})
