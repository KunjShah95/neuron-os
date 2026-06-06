import type { AgentSpec } from "./schema"
import { hashSpec, deriveSessionId } from "./hasher"
import { getRunRecord, runSpec, type RunInput } from "./runner"

export interface ReplayResult {
  original: string
  replay: string
  specHash: string
  match: boolean
}

export async function replaySession(sessionId: string, input?: RunInput): Promise<ReplayResult> {
  const record = getRunRecord(sessionId)
  if (!record) {
    throw new Error(`No run record found for session: ${sessionId}`)
  }

  const spec = record.spec
  const replayInput = input ?? record.input
  const result = await runSpec(spec, replayInput)

  // Verify spec hash consistency
  const currentHash = hashSpec(spec)
  if (currentHash !== record.specHash) {
    console.warn(`Warning: Spec hash changed. Original: ${record.specHash}, current: ${currentHash}`)
  }

  return {
    original: sessionId,
    replay: result.sessionId,
    specHash: currentHash,
    match: result.sessionId === deriveSessionId(currentHash, replayInput.goal),
  }
}
