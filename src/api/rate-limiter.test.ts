/**
 * Tests for the RateLimiter used by the API server.
 * Verifies allow/deny logic, window reset, and bounded memory usage.
 */

import { describe, it, expect } from "bun:test"
import { RateLimiter } from "./rate-limiter"

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
    const limiter = new RateLimiter(2, 50)
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

  it("should bound the number of tracked clients", () => {
    const limiter = new RateLimiter(100, 60_000, 50)
    for (let i = 0; i < 500; i++) {
      limiter.check(`unique-ip-${i}`)
    }
    expect(limiter.size).toBeLessThanOrEqual(50)
  })

  it("should drop expired entries once the tracked client cap is reached", () => {
    const limiter = new RateLimiter(100, 1, 20)
    for (let i = 0; i < 20; i++) {
      limiter.check(`stale-ip-${i}`)
    }
    expect(limiter.size).toBe(20)

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        for (let i = 20; i < 40; i++) {
          limiter.check(`stale-ip-${i}`)
        }
        expect(limiter.size).toBeLessThanOrEqual(20)
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
    const limiter = new RateLimiter(1, 30)
    expect(limiter.check("fresh-ip").allowed).toBe(true)
    expect(limiter.check("fresh-ip").allowed).toBe(false)

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const result = limiter.check("fresh-ip")
        expect(result.allowed).toBe(true)
        resolve()
      }, 40)
    })
  })
})
