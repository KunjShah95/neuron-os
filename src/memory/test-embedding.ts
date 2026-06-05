import { computeEmbedding, cosineSimilarity } from "./embedding"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

export async function testEmbeddingDeterministic() {
  const a = computeEmbedding("fix typecheck errors")
  const b = computeEmbedding("fix typecheck errors")
  assert(a.length === 128, "embedding dim 128")
  const sim = cosineSimilarity(a, b)
  assert(Math.abs(sim - 1) < 0.001, `same text → similarity ≈ 1, got ${sim}`)
}

export async function testEmbeddingSimilarTexts() {
  const a = computeEmbedding("fix typescript errors in engine")
  const b = computeEmbedding("fix type errors in agent engine")
  const sim = cosineSimilarity(a, b)
  assert(sim > 0.3, `similar texts should score > 0.3, got ${sim}`)
}

export async function testEmbeddingUnrelatedTexts() {
  const a = computeEmbedding("fix typescript errors in engine")
  const b = computeEmbedding("deploy model to production with kubernetes")
  const sim = cosineSimilarity(a, b)
  assert(sim < 0.3, `unrelated texts should score < 0.3, got ${sim}`)
}

export async function testCosineEmpty() {
  const a = computeEmbedding("")
  const b = computeEmbedding("hello world")
  const sim = cosineSimilarity(a, b)
  assert(sim === 0, "empty embedding → similarity 0")
}

if (import.meta.main) {
  await testEmbeddingDeterministic()
  await testEmbeddingSimilarTexts()
  await testEmbeddingUnrelatedTexts()
  await testCosineEmpty()
  console.log("embedding tests passed")
}
