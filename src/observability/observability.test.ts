import { describe, it, expect } from "bun:test"
import { agentManager } from "../agent/manager"
import { soulManager } from "../agent/soul"

describe("observability API", () => {
  it("soulManager list should be accessible", () => {
    const souls = soulManager.list()
    expect(Array.isArray(souls)).toBe(true)
  })

  it("agentManager list should be accessible", () => {
    const agents = agentManager.list()
    expect(Array.isArray(agents)).toBe(true)
  })

  it("getMoodEmoji should return string for valid moods", () => {
    const moods = ["elated", "confident", "content", "anxious", "frustrated", "burned_out"] as const
    for (const mood of moods) {
      const emoji = soulManager.getMoodEmoji(mood)
      expect(typeof emoji).toBe("string")
      expect(emoji.length).toBeGreaterThan(0)
    }
  })
})
