import type { WorkerInfo } from "./types"
import { WorkerPool } from "./pool"

export interface PlacementRequest {
  agentType: string
  requiredCpu?: number
  requiredMemory?: number
  requiresGpu?: boolean
  preferredTags?: string[]
  isolation?: "process" | "container"
}

export interface PlacementResult {
  workerId: string
  hostname: string
  port: number
  score: number
}

export class CapacityPlacer {
  constructor(private pool: WorkerPool) {}

  findBest(request: PlacementRequest): PlacementResult | null {
    const workers = this.pool.getReadyWorkers()
    if (workers.length === 0) return null

    const scored = workers.map((w) => ({ worker: w, score: this.score(w, request) })).filter((s) => s.score > 0)

    if (scored.length === 0) return null

    scored.sort((a, b) => b.score - a.score)
    const best = scored[0]!

    return {
      workerId: best.worker.id,
      hostname: best.worker.hostname,
      port: best.worker.port,
      score: best.score,
    }
  }

  private score(worker: WorkerInfo, request: PlacementRequest): number {
    const requestCpu = request.requiredCpu ?? 1
    const requestMem = request.requiredMemory ?? 512

    // Check GPU requirement
    if (request.requiresGpu && !worker.capacity.gpu) return 0

    // Check maxAgents capacity
    if (worker.capacity.agents >= worker.capacity.maxAgents) return 0

    let score = 0

    // CPU capacity score (0-0.4)
    const availCpu = worker.capacity.cpu
    if (availCpu >= requestCpu) {
      const cpuRatio = requestCpu / Math.max(availCpu, 1)
      score += 0.4 * cpuRatio
    } else {
      return 0
    }

    // Memory capacity score (0-0.3)
    if (worker.capacity.memory >= requestMem) {
      const memRatio = requestMem / Math.max(worker.capacity.memory, 1)
      score += 0.3 * memRatio
    } else {
      return 0
    }

    // Tag match bonus (0-0.2)
    if (request.preferredTags && request.preferredTags.length > 0) {
      const matchCount = request.preferredTags.filter((t) => worker.tags.includes(t)).length
      score += 0.2 * (matchCount / request.preferredTags.length)
    }

    // Load score - prefer less loaded workers (0-0.1)
    const loadRatio = worker.capacity.agents / Math.max(worker.capacity.maxAgents, 1)
    score += 0.1 * (1 - loadRatio)

    return Math.min(score, 1)
  }
}
