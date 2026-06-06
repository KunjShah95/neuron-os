import { writeFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { createLogger } from "../cli/logger"
import type { Finding } from "./types"

const log = createLogger("adversarial-ratchet")
const REGRESSION_DIR = join(process.cwd(), "evals", "regression")

function ensureDir(): void {
  if (!existsSync(REGRESSION_DIR)) mkdirSync(REGRESSION_DIR, { recursive: true })
}

export async function ratchetFinding(finding: Finding): Promise<string> {
  ensureDir()

  const caseYaml = `id: regression-${finding.task_id}-${finding.id}
category: ${finding.finding_type}
description: "${finding.description.slice(0, 200).replace(/"/g, '\\"')}"
input: |
  ${finding.reproduction.replace(/\n/g, "\n  ")}
verification:
  - command: ${JSON.stringify(finding.reproduction.split("\n")[0] ?? "")}
    expect_exit_code: 0
timeout_ms: 60000
severity: ${finding.severity}
source: adversarial
finding_id: ${finding.id}
`

  const path = join(REGRESSION_DIR, `${finding.task_id}-${finding.id}.yaml`)
  writeFileSync(path, caseYaml, "utf-8")
  log.info(`Ratcheted finding ${finding.id} → ${path}`)
  return path
}

export async function ratchetFindings(findings: Finding[]): Promise<Finding[]> {
  const ratcheted: Finding[] = []
  for (const f of findings) {
    if (f.ratcheted) continue
    try {
      const path = await ratchetFinding(f)
      ratcheted.push({ ...f, ratcheted: true, ratchet_case_path: path })
    } catch (err) {
      log.warn(`Failed to ratchet finding ${f.id}: ${err}`)
    }
  }
  return ratcheted
}
