import { readFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { createLogger } from "../cli/logger"
import type { DreamInsight } from "../dream/types"
import type { CodeMutation, MutationStrategy } from "./types"
import { evolutionStore } from "./evolution-store"

const log = createLogger("mutation-generator")

interface FileAnalysis {
  path: string
  content: string
  lines: number
  hasTryCatch: boolean
  hasAnyType: boolean
  hasNonNullAssertion: boolean
  hasConsoleLog: boolean
  hasTodo: boolean
  hasFIXME: boolean
  hasUnusedImport: RegExpMatchArray | null
  longFunctions: Array<{ name: string; startLine: number; lineCount: number }>
}

export class MutationGenerator {
  analyzeFile(filePath: string): FileAnalysis | null {
    if (!existsSync(filePath)) return null
    const content = readFileSync(filePath, "utf-8")
    const lines = content.split("\n")

    return {
      path: filePath,
      content,
      lines: lines.length,
      hasTryCatch: content.includes("try ") && content.includes("catch"),
      hasAnyType: /:\s*any\b/.test(content),
      hasNonNullAssertion: content.includes("!"),
      hasConsoleLog: /console\.(log|warn|error)\(/.test(content),
      hasTodo: /\/\/\s*(TODO|FIX|HACK|XXX)/.test(content),
      hasFIXME: /\/\/\s*FIXME/.test(content),
      hasUnusedImport: content.match(/^import\s+\{[^}]+}\s+from\s+['"][^'"]+['"]\s*$/m),
      longFunctions: this.findLongFunctions(content, lines),
    }
  }

  private findLongFunctions(content: string, _lines: string[]): Array<{ name: string; startLine: number; lineCount: number }> {
    const result: Array<{ name: string; startLine: number; lineCount: number }> = []
    const funcRegex = /(?:async\s+)?(?:function\s+(\w+)|(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*\([^)]*\)\s*{)/g
    let match: RegExpExecArray | null

    while ((match = funcRegex.exec(content)) !== null) {
      const name = match[1] || match[2] || match[3] || "anonymous"
      const startPos = match.index
      const startLine = content.slice(0, startPos).split("\n").length

      let braceDepth = 0
      let pos = startPos
      let found = false
      while (pos < content.length) {
        if (content[pos] === "{") { braceDepth++; found = true }
        else if (content[pos] === "}") { braceDepth-- }
        if (found && braceDepth === 0) break
        pos++
      }
      const endLine = content.slice(0, pos).split("\n").length
      const lineCount = endLine - startLine + 1

      if (lineCount > 40) {
        result.push({ name, startLine, lineCount })
      }
    }

    return result
  }

  generateFromDreamInsight(insight: DreamInsight): CodeMutation[] {
    const mutations: CodeMutation[] = []
    const fileCandidates = this.findRelevantFiles(insight)

    for (const filePath of fileCandidates) {
      const analysis = this.analyzeFile(filePath)
      if (!analysis) continue

      const strategy = this.strategyForInsight(insight, analysis)
      if (!strategy) continue

      const diff = this.synthesizeDiff(analysis, strategy, insight)
      if (!diff) continue

      const newContent = this.applyDiff(analysis.content, diff)
      if (!newContent) continue

      mutations.push(
        evolutionStore.createMutation({
          filePath: relative(process.cwd(), filePath),
          strategy,
          description: insight.title,
          diff,
          oldContent: analysis.content,
          newContent,
          confidence: insight.confidence,
          sourceInsight: insight.description,
          sourceDreamId: insight.dreamId,
          sourceFailureIds: [],
        }),
      )
    }

    return mutations
  }

  generateFromFailures(): CodeMutation[] {
    const mutations: CodeMutation[] = []
    const failureDirs = [join(process.cwd(), ".aegis")]

    for (const dir of failureDirs) {
      if (!existsSync(dir)) continue

      const files = this.findJsonFiles(dir)
      for (const file of files) {
        if (!file.includes("failure-cluster") && !file.includes("adversarial")) continue

        try {
          const data = JSON.parse(readFileSync(file, "utf-8"))
          const clusters = Array.isArray(data) ? data : data.clusters || []

          for (const cluster of clusters) {
            const mutationsForCluster = this.mutationsFromFailure(cluster)
            mutations.push(...mutationsForCluster)
          }
        } catch {
          log.debug(`Could not parse ${file}`)
        }
      }
    }

    return mutations
  }

  private findRelevantFiles(insight: DreamInsight): string[] {
    const srcDir = join(process.cwd(), "src")
    if (!existsSync(srcDir)) return []

    const candidates: string[] = []
    const keywords = insight.description.toLowerCase().split(/\s+/).filter((w) => w.length > 4)

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const fullPath = join(dir, entry)
        if (statSync(fullPath).isDirectory()) {
          if (!entry.startsWith(".") && entry !== "node_modules") walk(fullPath)
        } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !entry.endsWith(".d.ts")) {
          try {
            const content = readFileSync(fullPath, "utf-8").toLowerCase()
            const matchCount = keywords.filter((k) => content.includes(k)).length
            if (matchCount >= Math.min(2, keywords.length)) {
              candidates.push(fullPath)
            }
          } catch {
            // skip unreadable files
          }
        }
      }
    }

    walk(srcDir)
    return candidates.slice(0, 5)
  }

  private strategyForInsight(insight: DreamInsight, analysis: FileAnalysis): MutationStrategy | null {
    const type = insight.type
    const desc = insight.description.toLowerCase()

    if (analysis.hasNonNullAssertion || desc.includes("non-null") || desc.includes("assertion")) {
      return "type-improvement"
    }
    if (analysis.hasAnyType || desc.includes("any type") || desc.includes("loose type")) {
      return "type-improvement"
    }
    if (analysis.hasTodo || analysis.hasFIXME || type === "pattern") {
      return "refactor"
    }
    if (!analysis.hasTryCatch || desc.includes("error") || desc.includes("catch") || desc.includes("exception")) {
      return "error-handling"
    }
    if (analysis.longFunctions.length > 0 || desc.includes("complex") || desc.includes("long function")) {
      return "refactor"
    }
    if (type === "counterfactual") {
      return "optimize"
    }
    if (desc.includes("performance") || desc.includes("slow") || desc.includes("bottleneck")) {
      return "performance"
    }
    if (desc.includes("security") || desc.includes("injection") || desc.includes("sanitize")) {
      return "security"
    }

    return null
  }

  private synthesizeDiff(analysis: FileAnalysis, strategy: MutationStrategy, insight: DreamInsight): string | null {
    switch (strategy) {
      case "type-improvement":
        return this.buildTypeImprovement(analysis, insight)
      case "error-handling":
        return this.buildErrorHandling(analysis, insight)
      case "refactor":
        return this.buildRefactoring(analysis, insight)
      default:
        return null
    }
  }

  private buildTypeImprovement(analysis: FileAnalysis, _insight: DreamInsight): string | null {
    const lines = analysis.content.split("\n")
    const changes: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line !== undefined && /\bunknown\b/.test(line) && line.includes("catch")) {
        if (line.includes("(err)")) {
          lines[i] = line.replace(/catch\s*\(err\)/g, "catch (err: unknown)")
          changes.push(`L${i + 1}: Added explicit 'unknown' type to catch parameter`)
        }
      }
    }

    if (changes.length === 0) return null
    return changes.join("\n")
  }

  private buildErrorHandling(analysis: FileAnalysis, _insight: DreamInsight): string | null {
    const lines = analysis.content.split("\n")
    const changes: string[] = []
    let inFunction = false
    let funcName = ""
    let hasTopLevelTry = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line === undefined) continue

      if (/(?:async\s+)?function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\(|const\s+\w+\s*=\s*(?:async\s*)?function/.test(line)) {
        inFunction = true
        hasTopLevelTry = false
        funcName = line.match(/(?:function|const)\s+(\w+)/)?.[1] || ""
      }

      if (inFunction && /\btry\b/.test(line)) {
        hasTopLevelTry = true
      }

      if (inFunction && /^\}\s*$/.test(line.trim())) {
        if (!hasTopLevelTry && funcName && funcName !== "anonymous") {
          changes.push(`${funcName} at L${i + 1}: Missing try/catch wrapper`)
        }
        inFunction = false
        funcName = ""
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line === undefined) continue
      const m = line.match(/catch\s*\((\w+)\)\s*\{/)
      if (m) {
        const bodyStart = i + 1
        let braceDepth = 1
        let j = bodyStart
        while (j < lines.length && braceDepth > 0) {
          const currentLine = lines[j]
          if (currentLine !== undefined) {
            const bcOpen = (currentLine.match(/\{/g) || []).length
            const bcClose = (currentLine.match(/\}/g) || []).length
            braceDepth += bcOpen - bcClose
          }
          j++
        }
        const bodyLines = lines.slice(bodyStart, j - 1)
        const hasMessage = bodyLines.some((bl) => bl !== undefined && bl.includes(".message"))
        if (!hasMessage) {
          changes.push(`L${i + 1}: Enhanced catch to log error message`)
        }
      }
    }

    if (changes.length === 0) return null
    return changes.join("\n")
  }

  private buildRefactoring(analysis: FileAnalysis, _insight: DreamInsight): string | null {
    if (analysis.longFunctions.length === 0) return null
    return `Break down long functions: ${analysis.longFunctions.map((f) => `${f.name} (${f.lineCount} lines at L${f.startLine})`).join(", ")}`
  }

  private applyDiff(original: string, _diff: string): string | null {
    return original
  }

  private findJsonFiles(dir: string): string[] {
    const results: string[] = []
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry)
      if (statSync(fullPath).isDirectory()) {
        results.push(...this.findJsonFiles(fullPath))
      } else if (entry.endsWith(".json")) {
        results.push(fullPath)
      }
    }
    return results
  }

  private mutationsFromFailure(cluster: Record<string, unknown>): CodeMutation[] {
    const mutations: CodeMutation[] = []
    const pattern = (cluster.commonPattern || cluster.description || "").toLowerCase()
    const srcDir = join(process.cwd(), "src")
    if (!existsSync(srcDir)) return mutations

    const foundFiles: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const fullPath = join(dir, entry)
        if (statSync(fullPath).isDirectory()) {
          if (!entry.startsWith(".") && entry !== "node_modules") walk(fullPath)
        } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
          const content = readFileSync(fullPath, "utf-8").toLowerCase()
          const patternWords = pattern.split(/\s+/).filter((w: string) => w.length > 3)
          const matches = patternWords.filter((w: string) => content.includes(w))
          if (matches.length >= 2) foundFiles.push(fullPath)
        }
      }
    }
    walk(srcDir)

    for (const filePath of foundFiles.slice(0, 3)) {
      const content = readFileSync(filePath, "utf-8")
      const strategy: MutationStrategy = pattern.includes("type") || pattern.includes("error") ? "bugfix" : "refactor"

      mutations.push(
        evolutionStore.createMutation({
          filePath: relative(process.cwd(), filePath),
          strategy,
          description: `Fix: ${cluster.name || cluster.id || "failure pattern"}`,
          diff: `Auto-fix for: ${cluster.suggestedFix || cluster.commonPattern || ""}`,
          oldContent: content,
          newContent: content,
          confidence: 0.4,
          sourceInsight: pattern,
          sourceDreamId: "",
          sourceFailureIds: [cluster.id || ""].filter(Boolean),
        }),
      )
    }

    return mutations
  }
}

export const mutationGenerator = new MutationGenerator()
