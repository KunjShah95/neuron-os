import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs"
import { join, extname } from "path"
import { createLogger } from "../cli/logger"

const log = createLogger("adversarial-generator")
const ADVERSARIAL_DIR = join(process.cwd(), "evals", "adversarial")

const MUTATIONS = [
  "strip-precondition",
  "flip-boolean",
  "inject-malicious",
  "whitespace",
  "concurrency",
  "overflow",
  "unicode",
  "empty",
] as const

export type MutationType = typeof MUTATIONS[number]

function applyMutation(input: string, mutation: MutationType): string {
  switch (mutation) {
    case "strip-precondition":
      return input.replace(/\b(assume|given|let's say|when)\b.*$/gim, "# precondition removed").trim()
    case "flip-boolean":
      return input.replace(/\b(true|True|TRUE)\b/g, "false").replace(/\b(false|False|FALSE)\b/g, "true")
    case "inject-malicious":
      return `-- SECURITY TEST: attempt injection --\n${input}\n'; DROP TABLE tasks; --\n<script>alert('xss')</script>\n`
    case "whitespace":
      return input.replace(/ /g, "\t").replace(/\n/g, "\n\u200B\n")
    case "concurrency":
      return `-- CONCURRENCY TEST: run ${100} times in parallel --\nconst tasks = Array.from({length: 100}, () => Promise.resolve().then(() => {\n${input.replace(/\n/g, "\n  ")}\n}))\nawait Promise.all(tasks)\n`
    case "overflow":
      return `-- OVERFLOW TEST: extreme input --\nconst largeInput = "x".repeat(${10 * 1024 * 1024})\n${input.replace(/INPUT/gi, "largeInput")}\n`
    case "unicode":
      return input.replace(/[a-zA-Z]/g, (c) =>
        c.charCodeAt(0) > 96 ? "\u0430" : "\u0410",
      )
    case "empty":
      return input.replace(/("[^"]*")/g, '""').replace(/\d+/g, "0").replace(/\['.*?'\]/g, "[]")
  }
}

export function generateAdversarialEvals(
  taskFilePath: string,
  count: number,
  mutations?: MutationType[],
): string[] {
  if (!existsSync(taskFilePath)) {
    throw new Error(`Task file not found: ${taskFilePath}`)
  }

  if (!existsSync(ADVERSARIAL_DIR)) mkdirSync(ADVERSARIAL_DIR, { recursive: true })
  const taskContent = readFileSync(taskFilePath, "utf-8")
  const taskName = taskFilePath.split(/[\\/]/).pop()?.replace(extname(taskFilePath), "") ?? "task"
  const activeMutations = mutations ?? MUTATIONS
  const generated: string[] = []

  for (let i = 0; i < Math.min(count, activeMutations.length); i++) {
    const mutation = activeMutations[i]!
    const mutated = applyMutation(taskContent, mutation)
    const outPath = join(ADVERSARIAL_DIR, `${taskName}-${mutation}.yaml`)
    writeFileSync(outPath, mutated, "utf-8")
    generated.push(outPath)
    log.info(`Generated adversarial eval: ${outPath}`)
  }

  return generated
}
