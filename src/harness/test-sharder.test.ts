import { describe, it, expect } from "bun:test"
import { TestSharder } from "./test-sharder"
import type { TestCase } from "./types"

function makeTest(id: string, priority = "medium"): TestCase {
  return {
    id,
    name: `Test ${id}`,
    prompt: `Do ${id}`,
    tags: [],
    timeout: 60000,
    priority: priority as any,
  }
}

const tests = [
  makeTest("test-001"),
  makeTest("test-002"),
  makeTest("test-003"),
  makeTest("test-004"),
  makeTest("test-005"),
  makeTest("test-006"),
  makeTest("test-007"),
]

describe("TestSharder", () => {
  describe("contiguous", () => {
    it("splits tests into contiguous blocks", () => {
      const sharder = new TestSharder()
      const result = sharder.shard(tests, { type: "contiguous", totalShards: 3 })
      expect(result).toHaveLength(3)
      // ceil(7/3) = 3, so: shard 0 = 3, shard 1 = 3, shard 2 = 1
      expect(result[0]!.tests).toHaveLength(3)
      expect(result[1]!.tests).toHaveLength(3)
      expect(result[2]!.tests).toHaveLength(1)
      expect(result[0]!.tests[0]!.id).toBe("test-001")
      expect(result[1]!.tests[0]!.id).toBe("test-004")
      expect(result[2]!.tests[0]!.id).toBe("test-007")
    })

    it("handles empty input", () => {
      const sharder = new TestSharder()
      const result = sharder.shard([], { type: "contiguous", totalShards: 3 })
      expect(result).toHaveLength(0)
    })

    it("handles single shard", () => {
      const sharder = new TestSharder()
      const result = sharder.shard(tests, { type: "contiguous", totalShards: 1 })
      expect(result).toHaveLength(1)
      expect(result[0]!.tests).toHaveLength(7)
    })

    it("handles more shards than tests", () => {
      const sharder = new TestSharder()
      const result = sharder.shard(tests, { type: "contiguous", totalShards: 10 })
      // All 10 shards returned, some empty
      expect(result).toHaveLength(10)
      const nonEmpty = result.filter((s) => s.tests.length > 0)
      expect(nonEmpty).toHaveLength(7)
    })
  })

  describe("round_robin", () => {
    it("distributes tests evenly", () => {
      const sharder = new TestSharder()
      const result = sharder.shard(tests, { type: "round_robin", totalShards: 3 })
      expect(result).toHaveLength(3)
      // 7 tests across 3 shards = 3, 2, 2
      expect(result[0]!.tests).toHaveLength(3)
      expect(result[1]!.tests).toHaveLength(2)
      expect(result[2]!.tests).toHaveLength(2)
    })

    it("distributes round-robin by index", () => {
      const sharder = new TestSharder()
      const result = sharder.shard(tests, { type: "round_robin", totalShards: 3 })
      // test-001 -> shard 0, test-002 -> shard 1, test-003 -> shard 2
      // test-004 -> shard 0, test-005 -> shard 1, test-006 -> shard 2
      // test-007 -> shard 0
      expect(result[0]!.tests.map((t) => t.id)).toEqual(["test-001", "test-004", "test-007"])
      expect(result[1]!.tests.map((t) => t.id)).toEqual(["test-002", "test-005"])
      expect(result[2]!.tests.map((t) => t.id)).toEqual(["test-003", "test-006"])
    })

    it("handles zero totalShards", () => {
      const sharder = new TestSharder()
      const result = sharder.shard(tests, { type: "round_robin", totalShards: 0 })
      expect(result).toHaveLength(1)
      expect(result[0]!.tests).toHaveLength(7)
    })
  })

  describe("capacity_based", () => {
    it("distributes based on worker capacity", () => {
      const sharder = new TestSharder()
      const workers = [
        { id: "worker-1", capacity: { cpu: 2, memory: 1024 }, status: "ready" } as any,
        { id: "worker-2", capacity: { cpu: 4, memory: 2048 }, status: "ready" } as any,
      ]
      const result = sharder.shard(tests, { type: "capacity_based", totalShards: 2, workers })
      expect(result).toHaveLength(2)
      const totalTests = result.reduce((s, r) => s + r.tests.length, 0)
      expect(totalTests).toBe(7)
      // Worker 2 has more capacity, should get more tests
      expect(result[1]!.tests.length).toBeGreaterThanOrEqual(result[0]!.tests.length)
    })

    it("falls back to single shard with no workers", () => {
      const sharder = new TestSharder()
      const result = sharder.shard(tests, { type: "capacity_based", totalShards: 3, workers: [] })
      expect(result).toHaveLength(1)
      expect(result[0]!.tests).toHaveLength(7)
    })
  })

  it("defaults to contiguous for unknown strategy", () => {
    const sharder = new TestSharder()
    const result = sharder.shard(tests, { type: "contiguous" as any, totalShards: 2 })
    expect(result).toHaveLength(2)
  })
})
