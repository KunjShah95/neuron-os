import { existsSync, mkdirSync, appendFileSync } from "fs"
import { join } from "path"
import { createLogger } from "../../cli/logger"
import type { AuditEntry } from "./schema"

const log = createLogger("policy-audit")
const AUDIT_PATH = join(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "memory", "audit.jsonl")

function ensurePath(): void {
  const dir = join(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "memory")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

export function logAudit(entry: AuditEntry): void {
  ensurePath()
  try {
    appendFileSync(AUDIT_PATH, JSON.stringify(entry) + "\n", "utf-8")
  } catch (err) {
    log.warn(`Failed to write audit log (denying read to be safe): ${err}`)
    throw new Error("Audit log write failed — operation denied")
  }
}
