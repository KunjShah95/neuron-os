import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import { createLogger } from "../cli/logger"
import { Disagreement } from "./types"
import type { DecisionRecord as DecisionRecordType } from "./types"
import { createArbitrator, verifyDecisionRecord } from "./arbitrator"

const log = createLogger("debate-records")
const DECISIONS_DIR = join(homedir(), ".aegis", "decisions")

function ensureDir(): void {
  if (!existsSync(DECISIONS_DIR)) mkdirSync(DECISIONS_DIR, { recursive: true })
}

export async function resolveDisagreement(disagreement: Disagreement): Promise<DecisionRecordType> {
  ensureDir()
  const arbitrator = createArbitrator(disagreement.arbitrator)
  const record = await arbitrator.resolve(disagreement)

  const path = join(DECISIONS_DIR, `${disagreement.id}.json`)
  try {
    writeFileSync(path, JSON.stringify(record), "utf-8")
    log.info(`Decision record written: ${path}`)
  } catch (err) {
    log.warn(`Failed to write decision record: ${err}`)
  }

  return record
}

export function loadDecisionRecord(disagreementId: string): DecisionRecordType | null {
  ensureDir()
  const path = join(DECISIONS_DIR, `${disagreementId}.json`)
  if (!existsSync(path)) return null

  try {
    const raw = readFileSync(path, "utf-8")
    const record = JSON.parse(raw) as DecisionRecordType

    // Verify signature
    if (record.signed && !verifyDecisionRecord(record)) {
      log.warn(`Decision record ${disagreementId} has invalid signature!`)
    }

    return record
  } catch {
    return null
  }
}

export function listDecisionRecords(_resolved?: boolean): DecisionRecordType[] {
  ensureDir()
  const files = readdirSync(DECISIONS_DIR).filter((f) => f.endsWith(".json"))
  const records: DecisionRecordType[] = []

  for (const file of files) {
    try {
      const raw = readFileSync(join(DECISIONS_DIR, file), "utf-8")
      records.push(JSON.parse(raw))
    } catch {
      // skip malformed
    }
  }

  return records
}
