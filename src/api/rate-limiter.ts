export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

const DEFAULT_MAX_TRACKED_CLIENTS = 10_000

export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>()

  constructor(
    private maxRequests: number,
    private windowMs: number,
    private maxTrackedClients: number = DEFAULT_MAX_TRACKED_CLIENTS,
  ) {}

  get size(): number {
    return this.hits.size
  }

  check(ip: string): RateLimitResult {
    const now = Date.now()
    this.evictExpired(now)

    let entry = this.hits.get(ip)

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + this.windowMs }
      this.hits.set(ip, entry)
    }

    entry.count++
    const remaining = Math.max(0, this.maxRequests - entry.count)

    if (this.hits.size > this.maxTrackedClients) this.evictOverflow()

    return {
      allowed: entry.count <= this.maxRequests,
      remaining,
      resetAt: entry.resetAt,
    }
  }

  private evictExpired(now: number): void {
    if (this.hits.size < this.maxTrackedClients) return
    for (const [key, val] of this.hits) {
      if (now > val.resetAt) this.hits.delete(key)
    }
  }

  private evictOverflow(): void {
    const overflow = this.hits.size - this.maxTrackedClients
    if (overflow <= 0) return
    let removed = 0
    for (const key of this.hits.keys()) {
      if (removed >= overflow) break
      this.hits.delete(key)
      removed++
    }
  }
}
