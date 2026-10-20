import { join } from "path"

export function memoryRoot(): string {
  const override = process.env.AEGIS_MEMORY_DIR
  if (override) return override
  return join(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "memory")
}

export function policiesDir(): string {
  const override = process.env.AEGIS_MEMORY_POLICY_DIR
  if (override) return override
  return join(memoryRoot(), "namespaces")
}

export function auditDir(): string {
  const override = process.env.AEGIS_MEMORY_AUDIT_DIR
  if (override) return override
  return memoryRoot()
}

export function auditPath(): string {
  return join(auditDir(), "audit.jsonl")
}
