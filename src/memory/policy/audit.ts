import { existsSync, mkdirSync, appendFileSync } from "fs"
import { join } from "path"
import { createLogger } from "../../cli/logger"
import { auditPath } from "./paths"
import type { AuditEntry } from "./schema"

const log = createLogger("policy-audit")

function ensurePath(): void {
  const dir = join(auditPath(), "..")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

export function logAudit(entry: AuditEntry): void {
  ensurePath()
  try {
    appendFileSync(auditPath(), JSON.stringify(entry) + "\n", "utf-8")
  } catch (err) {
    log.warn(`Failed to write audit log (denying read to be safe): ${err}`)
    throw new Error("Audit log write failed — operation denied")
  }
}
