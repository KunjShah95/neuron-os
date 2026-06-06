import { describe, it, expect } from "bun:test"
import { computeEmbedding, cosineSimilarity } from "./embedding"

describe("Embedding Tests", () => {

it("should embedding deterministic", async () => {
  const a = computeEmbedding("fix typecheck errors")
  const b = computeEmbedding("fix typecheck errors")
  expect(a.length === 128).toBe(true)
  const sim = cosineSimilarity(a, b)
  expect(Math.abs(sim - 1) < 0.001).toBe(true)
})

it("should embedding similar texts", async () => {
  const a = computeEmbedding("fix typescript errors in engine")
  const b = computeEmbedding("fix type errors in agent engine")
  const sim = cosineSimilarity(a, b)
  expect(sim > 0.3).toBe(true)
})

it("should embedding unrelated texts", async () => {
  const a = computeEmbedding("fix typescript errors in engine")
  const b = computeEmbedding("deploy model to production with kubernetes")
  const sim = cosineSimilarity(a, b)
  expect(sim < 0.3).toBe(true)
})

it("should cosine empty", async () => {
  const a = computeEmbedding("")
  const b = computeEmbedding("hello world")
  const sim = cosineSimilarity(a, b)
  expect(sim === 0).toBe(true)
})

})
