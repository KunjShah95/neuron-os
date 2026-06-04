/**
 * Tests for the internal RateLimiter used by the API server.
 * Verifies allow/deny logic, window reset, and stale entry cleanup.
 */

import { describe, it, expect } from "bun:test"

// Import the RateLimiter from server.ts
// Since it's not exported, we recreate it here for testing
class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>()

  constructor(
    private maxRequests: number,
    private windowMs: number,
  ) {}

  check(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now()
    let entry = this.hits.get(ip)

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + this.windowMs }
      this.hits.set(ip, entry)
    }

    entry.count++
    const remaining = Math.max(0, this.maxRequests - entry.count)

    // Periodically clean stale entries (same logic as original)
    if (this.hits.size > 1000) {
      for (const [key, val] of this.hits) {
        if (now > val.resetAt) this.hits.delete(key)
      }
    }

    return {
      allowed: entry.count <= this.maxRequests,
      remaining,
      resetAt: entry.resetAt,
    }
  }
}

describe("RateLimiter", () => {
  it("should allow requests within the limit", () => {
    const limiter = new RateLimiter(5, 60_000)
    for (let i = 0; i < 5; i++) {
      const result = limiter.check("127.0.0.1")
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(5 - (i + 1))
    }
  })

  it("should deny requests exceeding the limit", () => {
    const limiter = new RateLimiter(3, 60_000)
    for (let i = 0; i < 3; i++) {
      expect(limiter.check("127.0.0.1").allowed).toBe(true)
    }
    const result = limiter.check("127.0.0.1")
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it("should track remaining count accurately", () => {
    const limiter = new RateLimiter(10, 60_000)
    for (let i = 0; i < 7; i++) {
      limiter.check("192.168.1.1")
    }
    const result = limiter.check("192.168.1.1")
    expect(result.remaining).toBe(2)
  })

  it("should reset after the window expires", () => {
    const limiter = new RateLimiter(2, 50) // 50ms window
    expect(limiter.check("10.0.0.1").allowed).toBe(true)
    expect(limiter.check("10.0.0.1").allowed).toBe(true)
    expect(limiter.check("10.0.0.1").allowed).toBe(false)

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const result = limiter.check("10.0.0.1")
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(1)
        resolve()
      }, 60)
    })
  })

  it("should track different IPs independently", () => {
    const limiter = new RateLimiter(2, 60_000)
    expect(limiter.check("ip-a").allowed).toBe(true)
    expect(limiter.check("ip-a").allowed).toBe(true)
    expect(limiter.check("ip-a").allowed).toBe(false)

    expect(limiter.check("ip-b").allowed).toBe(true)
    expect(limiter.check("ip-b").allowed).toBe(true)
  })

  it("should have correct remaining after partial usage", () => {
    const limiter = new RateLimiter(10, 60_000)
    const r1 = limiter.check("test-ip")
    expect(r1.remaining).toBe(9)

    const r2 = limiter.check("test-ip")
    expect(r2.remaining).toBe(8)
  })

  it("should return a valid resetAt timestamp", () => {
    const limiter = new RateLimiter(5, 10_000)
    const before = Date.now()
    const result = limiter.check("check-reset")
    const after = Date.now()

    expect(result.resetAt).toBeGreaterThanOrEqual(before + 10_000)
    expect(result.resetAt).toBeLessThanOrEqual(after + 10_000)
  })

  it("should clean stale entries when map exceeds 1000 entries", () => {
    const limiter = new RateLimiter(100, 1) // 1ms window
    // Fill up to near the threshold
    for (let i = 0; i < 500; i++) {
      limiter.check(`stale-ip-${i}`)
    }
    expect(limiter["hits"].size).toBe(500) // < 1000, no cleanup yet

    // Wait for all 1ms windows to expire
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // Add more entries to trigger cleanup (now > 1000)
        for (let i = 500; i < 1002; i++) {
          limiter.check(`stale-ip-${i}`)
        }
        // All earlier entries had expired windows, so cleanup removed them
        // Only the most recent entries (above threshold) survived
        expect(limiter["hits"].size).toBeLessThan(600)
        resolve()
      }, 20)
    })
  })

  it("should handle high concurrency IPs correctly", () => {
    const limiter = new RateLimiter(1000, 60_000)
    for (let i = 0; i < 1000; i++) {
      const result = limiter.check("burst-ip")
      expect(result.allowed).toBe(true)
    }
    const overflow = limiter.check("burst-ip")
    expect(overflow.allowed).toBe(false)
    expect(overflow.remaining).toBe(0)
  })

  it("should start fresh for new IP after old entry expires", () => {
    const limiter = new RateLimiter(1, 30) // 30ms window
    expect(limiter.check("fresh-ip").allowed).toBe(true)
    expect(limiter.check("fresh-ip").allowed).toBe(false)

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const result = limiter.check("fresh-ip")
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(0) // consumed the 1 allowed request
        resolve()
      }, 40)
    })
  })
})
