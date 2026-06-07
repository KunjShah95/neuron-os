/**
 * src/harness/test-sharder.ts
 *
 * TestSharder — splits a TestCase[] into N shards for distributed execution.
 *
 * Strategies:
 *   - contiguous:   Split sorted list into N consecutive blocks
 *   - round_robin:  Distribute round-robin (better load balancing)
 *   - capacity_based: Assign based on worker capacity weights
 */

import type { TestCase } from "./types"
import type { WorkerInfo } from "../distributed/types"

// ── Types ─────────────────────────────────────────────────────────

export type ShardStrategyType = "contiguous" | "round_robin" | "capacity_based"

export interface ShardStrategy {
  type: ShardStrategyType
  totalShards: number
  workers?: WorkerInfo[]          // Required for capacity_based
}

export interface ShardResult {
  shardIndex: number
  tests: TestCase[]
}

// ── Test Sharder ──────────────────────────────────────────────────

export class TestSharder {
  /**
   * Split tests into shards according to the given strategy.
   */
  shard(tests: TestCase[], strategy: ShardStrategy): ShardResult[] {
    if (tests.length === 0) return []
    const total = strategy.totalShards
    if (total <= 0) return [{ shardIndex: 0, tests }]

    switch (strategy.type) {
      case "contiguous":
        return this.contiguousShard(tests, total)
      case "round_robin":
        return this.roundRobinShard(tests, total)
      case "capacity_based":
        return this.capacityBasedShard(tests, strategy.workers ?? [])
      default:
        return this.contiguousShard(tests, total)
    }
  }

  /**
   * Split tests into N contiguous blocks.
   * Tests maintain their original order within each shard.
   */
  private contiguousShard(tests: TestCase[], total: number): ShardResult[] {
    const shards: ShardResult[] = []
    const baseSize = Math.ceil(tests.length / total)

    for (let i = 0; i < total; i++) {
      const start = i * baseSize
      const end = Math.min(start + baseSize, tests.length)
      if (start >= tests.length) {
        shards.push({ shardIndex: i, tests: [] })
      } else {
        shards.push({ shardIndex: i, tests: tests.slice(start, end) })
      }
    }

    return shards
  }

  /**
   * Distribute tests round-robin across shards.
   * Each shard gets a balanced mix of tests.
   */
  private roundRobinShard(tests: TestCase[], total: number): ShardResult[] {
    const buckets: TestCase[][] = Array.from({ length: total }, () => [])

    for (let i = 0; i < tests.length; i++) {
      buckets[i % total]!.push(tests[i]!)
    }

    return buckets.map((bucket, i) => ({
      shardIndex: i,
      tests: bucket,
    }))
  }

  /**
   * Assign tests based on worker capacity.
   * Workers with more CPU/memory get proportionally more tests.
   */
  private capacityBasedShard(tests: TestCase[], workers: WorkerInfo[]): ShardResult[] {
    if (workers.length === 0) {
      return [{ shardIndex: 0, tests }]
    }

    // Calculate capacity weights for each worker
    const totalCapacity = workers.reduce(
      (sum, w) => sum + Math.max(1, w.capacity.cpu) * Math.max(1, w.capacity.memory),
      0,
    )

    const weights = workers.map((w) =>
      (Math.max(1, w.capacity.cpu) * Math.max(1, w.capacity.memory)) / totalCapacity,
    )

    // Assign tests proportionally
    const assignments: TestCase[][] = workers.map(() => [])
    let currentWorker = 0
    let workerBudget = weights[0]! * tests.length

    for (const test of tests) {
      while (workerBudget < 0.5 && currentWorker < workers.length - 1) {
        currentWorker++
        workerBudget += weights[currentWorker]! * tests.length
      }
      assignments[currentWorker]!.push(test)
      workerBudget -= 1
    }

    return assignments.map((bucket, i) => ({
      shardIndex: i,
      tests: bucket,
    }))
  }
}
