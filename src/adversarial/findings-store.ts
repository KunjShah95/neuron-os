import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import type { Finding } from "./types"

const FINDINGS_DIR = join(homedir(), ".aegis", "adversarial", "findings")

function ensureDir(): void {
  if (!existsSync(FINDINGS_DIR)) mkdirSync(FINDINGS_DIR, { recursive: true })
}

export function storeFindings(taskId: string, findings: Finding[]): void {
  ensureDir()
  const path = join(FINDINGS_DIR, `${taskId}.jsonl`)
  for (const f of findings) {
    writeFileSync(path, JSON.stringify(f) + "\n", { flag: "a" })
  }
}

export function loadFindings(taskId?: string, sinceDays?: number): Finding[] {
  ensureDir()
  const all: Finding[] = []
  const files = taskId
    ? [join(FINDINGS_DIR, `${taskId}.jsonl`)]
    : readdirSync(FINDINGS_DIR).filter((f) => f.endsWith(".jsonl")).map((f) => join(FINDINGS_DIR, f))

  const cutoff = sinceDays ? Date.now() - sinceDays * 86400_000 : 0

  for (const file of files) {
    if (!existsSync(file)) continue
    const lines = readFileSync(file, "utf-8").trim().split("\n").filter(Boolean)
    for (const line of lines) {
      try {
        const finding = JSON.parse(line) as Finding
        if (finding.ts >= cutoff) all.push(finding)
      } catch {
        // skip malformed
      }
    }
  }
  return all
}

export function loadRecentFindings(sinceDays = 7, severity?: string): Finding[] {
  const all = loadFindings(undefined, sinceDays)
  if (severity) {
    const levels = ["critical", "high", "medium", "low"]
    const minIdx = levels.indexOf(severity)
    return all.filter((f) => levels.indexOf(f.severity) <= minIdx)
  }
  return all
}
