import { NexusAgent } from "../core/agent.js";

export interface BenchmarkMetrics {
  startupTimeMs: number;
  memoryDiffMb: number;
  opsPerSec: number;
  totalTimeMs: number;
}

export class BenchmarkSuite {
  private agent: NexusAgent;

  constructor(agent: NexusAgent) {
    this.agent = agent;
  }

  /**
   * Runs the agent over repeated goals to measure memory delta, cold-start latency,
   * and operations-per-second throughput.
   */
  async runBenchmark(goal: string, iterations: number = 5): Promise<BenchmarkMetrics> {
    const memStart = process.memoryUsage().heapUsed;
    const start = performance.now();

    // 1. Measure cold start init overhead
    const startupStart = performance.now();
    await this.agent.storage.init();
    const startupTimeMs = performance.now() - startupStart;

    // 2. Measure throughput execution
    const runStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await this.agent.execute(goal);
    }
    const runDurationMs = performance.now() - runStart;
    const totalTimeMs = performance.now() - start;

    await this.agent.storage.close();

    const memEnd = process.memoryUsage().heapUsed;
    const memoryDiffMb = (memEnd - memStart) / (1024 * 1024);
    const opsPerSec = (iterations / runDurationMs) * 1000;

    return {
      startupTimeMs,
      memoryDiffMb,
      opsPerSec,
      totalTimeMs,
    };
  }
}
