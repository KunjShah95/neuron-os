import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { join, resolve, sep } from "path"
import { homedir } from "os"
import { createLogger } from "../cli/logger"
import { Disagreement } from "./types"
import type { DecisionRecord as DecisionRecordType } from "./types"
import { createArbitrator, verifyDecisionRecord } from "./arbitrator"

const log = createLogger("debate-records")

function getDecisionsDir(): string {
  return process.env.AEGIS_DECISIONS_DIR ?? join(homedir(), ".aegis", "decisions")
}

function ensureDir(): void {
  const dir = getDecisionsDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

export function sanitizeRecordId(id: string): string {
  const cleaned = id
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 200)
    .replace(/^\.+/, "")
    .replace(/\.+$/, "")
  return cleaned.length > 0 ? cleaned : "record"
}

function isContained(dir: string, path: string): boolean {
  const root = resolve(dir)
  const target = resolve(path)
  return target === root || target.startsWith(root + sep)
}

export function resolveRecordPath(disagreementId: string): string {
  const dir = getDecisionsDir()
  const path = resolve(dir, `${sanitizeRecordId(disagreementId)}.json`)
  if (!isContained(dir, path)) {
    throw new Error(`Refusing to use decision record path outside the decisions directory: ${disagreementId}`)
  }
  return path
}

export async function resolveDisagreement(disagreement: Disagreement): Promise<DecisionRecordType> {
  ensureDir()
  const arbitrator = createArbitrator(disagreement.arbitrator)
  const record = await arbitrator.resolve(disagreement)

  let path: string
  try {
    path = resolveRecordPath(disagreement.id)
  } catch (err) {
    log.warn(`Refusing to write decision record with unsafe id: ${err}`)
    return record
  }

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

  let path: string
  try {
    path = resolveRecordPath(disagreementId)
  } catch (err) {
    log.warn(`Refusing to load decision record with unsafe id: ${err}`)
    return null
  }

  if (!existsSync(path)) return null

  try {
    const raw = readFileSync(path, "utf-8")
    const record = JSON.parse(raw) as DecisionRecordType

    if (!record.signed || !verifyDecisionRecord(record)) {
      log.warn(`Decision record ${disagreementId} has invalid signature, refusing to load`)
      return null
    }

    return record
  } catch {
    return null
  }
}

export function listDecisionRecords(_resolved?: boolean): DecisionRecordType[] {
  ensureDir()
  const dir = getDecisionsDir()
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"))
  const records: DecisionRecordType[] = []

  for (const file of files) {
    try {
      const path = resolve(dir, file)
      if (!isContained(dir, path)) continue
      const raw = readFileSync(path, "utf-8")
      const record = JSON.parse(raw) as DecisionRecordType
      if (!record.signed || !verifyDecisionRecord(record)) {
        log.warn(`Decision record ${file} has invalid signature, skipping`)
        continue
      }
      records.push(record)
    } catch {
      // skip malformed
    }
  }

  return records
}
