import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from "node:fs"
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

/** A single line-level change to apply to a file. */
interface LineChange {
  type: "replace" | "insert-before" | "insert-after" | "delete"
  line: number
  text: string
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
      hasUnusedImport: content.match(/^import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"]\s*$/m),
      longFunctions: this.findLongFunctions(content, lines),
    }
  }

  private findLongFunctions(content: string, _lines: string[]): Array<{ name: string; startLine: number; lineCount: number }> {
    const result: Array<{ name: string; startLine: number; lineCount: number }> = []
    const funcRegex = /(?:async\s+)?(?:function\s+(\w+)|(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*\([^)]*\)\s*\{)/g
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

      const changes = this.synthesizeChanges(analysis, strategy, insight)
      if (!changes || changes.length === 0) continue

      const newContent = this.applyChanges(analysis.content, changes)
      if (newContent === analysis.content) continue

      mutations.push(
        evolutionStore.createMutation({
          filePath: relative(process.cwd(), filePath),
          strategy,
          description: insight.title,
          diff: JSON.stringify(changes),
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
    if (desc.includes("readability") || desc.includes("clarity") || desc.includes("confusing")) {
      return "readability"
    }
    if (desc.includes("bug") || desc.includes("fix") || desc.includes("incorrect") || desc.includes("wrong")) {
      return "bugfix"
    }

    return null
  }

  /**
   * Analyze the file and produce a list of concrete line-level changes.
   * All 8 mutation strategies are now implemented.
   */
  private synthesizeChanges(analysis: FileAnalysis, strategy: MutationStrategy, insight: DreamInsight): LineChange[] | null {
    switch (strategy) {
      case "type-improvement":
        return this.buildTypeImprovements(analysis)
      case "error-handling":
        return this.buildErrorHandlingChanges(analysis)
      case "refactor":
        return this.buildRefactoringChanges(analysis)
      case "optimize":
        return this.buildOptimizeChanges(analysis)
      case "bugfix":
        return this.buildBugfixChanges(analysis, insight)
      case "performance":
        return this.buildPerformanceChanges(analysis)
      case "security":
        return this.buildSecurityChanges(analysis)
      case "readability":
        return this.buildReadabilityChanges(analysis)
      default:
        return null
    }
  }

  /** Type improvement: add explicit types to catch parameters, replace `any` with `unknown` */
  private buildTypeImprovements(analysis: FileAnalysis): LineChange[] | null {
    const changes: LineChange[] = []
    const lines = analysis.content.split("\n")

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue

      // Add `unknown` type to catch(err) without type
      if (line.includes("catch (err)") || line.includes("catch(e)")) {
        const replacement = line.replace(/catch\s*\((err|e)\)/g, "catch ($1: unknown)")
        if (replacement !== line) {
          changes.push({ type: "replace", line: i + 1, text: replacement })
        }
      }

      // Replace `: any` with `: unknown` in function parameters
      const anyMatch = line.match(/:\s*any\b/)
      if (anyMatch && !line.trim().startsWith("//") && !line.includes("as any")) {
        const replacement = line.replace(/:\s*any\b/g, ": unknown")
        if (replacement !== line) {
          changes.push({ type: "replace", line: i + 1, text: replacement })
        }
      }
    }

    return changes.length > 0 ? changes : null
  }

  /** Error handling: add try/catch wrappers to functions missing them, enhance bare catches */
  private buildErrorHandlingChanges(analysis: FileAnalysis): LineChange[] | null {
    const changes: LineChange[] = []
    const lines = analysis.content.split("\n")

    // Enhance bare catch blocks to log error messages
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue

      const m = line.match(/catch\s*\(\w+\s*:\s*\w+\)\s*\{/)
      if (!m) continue

      // Find the catch body
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
      const hasLog = bodyLines.some((bl) => bl !== undefined && bl.includes("console."))

      if (!hasMessage && !hasLog && bodyLines.length <= 2) {
        // Insert error logging before the closing brace
        changes.push({
          type: "insert-before",
          line: j,
          text: `  console.error("Operation failed:", err?.message ?? err);`,
        })
      }
    }

    return changes.length > 0 ? changes : null
  }

  /** Refactoring: suggest splitting long functions, removing dead code */
  private buildRefactoringChanges(analysis: FileAnalysis): LineChange[] | null {
    if (analysis.longFunctions.length === 0) return null

    const lines = analysis.content.split("\n")
    const changes: LineChange[] = []

    for (const func of analysis.longFunctions) {
      // Add a TODO comment before long functions suggesting refactoring
      const todoLine = `// TODO: Refactor - ${func.name} is ${func.lineCount} lines (L${func.startLine}). Consider breaking into smaller functions.`
      if (!lines[func.startLine - 2]?.includes("TODO")) {
        changes.push({
          type: "insert-before",
          line: func.startLine,
          text: todoLine,
        })
      }
    }

    return changes
  }

  /** Optimization: simplify redundant patterns, remove unnecessary code */
  private buildOptimizeChanges(analysis: FileAnalysis): LineChange[] | null {
    const changes: LineChange[] = []
    const lines = analysis.content.split("\n")

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue

      // Remove redundant Boolean() wrapper
      if (/Boolean\s*\(/.test(line) && !line.trim().startsWith("//")) {
        const replacement = line.replace(/Boolean\s*\(([^)]+)\)/g, "!!($1)")
        if (replacement !== line) {
          changes.push({ type: "replace", line: i + 1, text: replacement })
        }
      }

      // Simplify `a === true` to `a`
      if (/===?\s*true\b/.test(line) && !line.trim().startsWith("//") && !line.includes("'") && !line.includes('"')) {
        const replacement = line.replace(/\s*===?\s*true\b/g, "")
        if (replacement !== line) {
          changes.push({ type: "replace", line: i + 1, text: replacement })
        }
      }
    }

    return changes.length > 0 ? changes : null
  }

  /** Bugfix: identify and fix common bug patterns */
  private buildBugfixChanges(analysis: FileAnalysis, _insight: DreamInsight): LineChange[] | null {
    const changes: LineChange[] = []
    const lines = analysis.content.split("\n")

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line || line.trim().startsWith("//")) continue

      // Fix `.length` used in a truthy check (empty array is truthy)
      if (/if\s*\(\s*\w+\.length\s*\)/.test(line) && !line.includes(">") && !line.includes("!==") && !line.includes("===")) {
        // Already correct for arrays with elements, but could be buggy if checking for 0
        // Add explicit > 0 for clarity
        const replacement = line.replace(/(\w+)\.length\s*\)/, "$1.length > 0)")
        if (replacement !== line) {
          changes.push({ type: "replace", line: i + 1, text: replacement })
        }
      }

      // Fix loose equality (==) where strict equality (===) is better
      // Match == but not === (which has 3 equals signs)
      if (/(?<!=)==(?!\s*=)/.test(line) && !line.includes("!=") && !line.trim().startsWith("//")) {
        // Only suggest change if both sides are likely primitives
        const hasNullCheck = line.includes("== null") || line.includes("== undefined")
        if (!hasNullCheck) {
          const replacement = line.replace(/(\w+)\s*==\s*(\w+)/g, "$1 === $2")
          if (replacement !== line) {
            changes.push({ type: "replace", line: i + 1, text: replacement })
          }
        }
      }
    }

    return changes.length > 0 ? changes : null
  }

  /** Performance: optimize slow patterns like repeated property access */
  private buildPerformanceChanges(analysis: FileAnalysis): LineChange[] | null {
    const changes: LineChange[] = []
    const lines = analysis.content.split("\n")

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line || line.trim().startsWith("//")) continue

      // Flag `for...in` on arrays (prefer for...of or forEach)
      if (/for\s*\(\s*(const|let|var)\s+\w+\s+in\s/.test(line)) {
        changes.push({
          type: "insert-after",
          line: i + 1,
          text: `// NOTE: Consider using for...of instead of for...in for arrays (performance)`,
        })
      }
    }

    return changes.length > 0 ? changes : null
  }

  /** Security: flag dangerous patterns like innerHTML, eval, execSync with user input */
  private buildSecurityChanges(analysis: FileAnalysis): LineChange[] | null {
    const changes: LineChange[] = []
    const lines = analysis.content.split("\n")

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line || line.trim().startsWith("//")) continue

      if (/\.innerHTML\s*=/.test(line)) {
        changes.push({
          type: "insert-after",
          line: i + 1,
          text: `// SECURITY: innerHTML can lead to XSS. Consider using textContent or DOMPurify.`,
        })
      }

      if (/\beval\s*\(/.test(line)) {
        changes.push({
          type: "insert-after",
          line: i + 1,
          text: `// SECURITY: eval() can lead to code injection attacks. Consider safer alternatives.`,
        })
      }

      if (/execSync\s*\(/.test(line) && !line.includes("'ls'") && !line.includes("'echo'")) {
        changes.push({
          type: "insert-after",
          line: i + 1,
          text: `// SECURITY: execSync with dynamic input can lead to command injection. Validate/sanitize input.`,
        })
      }
    }

    return changes.length > 0 ? changes : null
  }

  /** Readability: clarify complex expressions, add comments */
  private buildReadabilityChanges(analysis: FileAnalysis): LineChange[] | null {
    const changes: LineChange[] = []
    const lines = analysis.content.split("\n")

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line || line.trim().startsWith("//")) continue

      // Flag extremely long lines (>120 chars)
      if (line.length > 120 && !line.includes("//") && !line.trim().startsWith("*")) {
        changes.push({
          type: "insert-after",
          line: i + 1,
          text: `// READABILITY: Line ${i + 1} is ${line.length} characters. Consider breaking it into multiple lines.`,
        })
      }

      // Flag deeply nested ternaries
      const ternaryCount = (line.match(/\?/g) || []).length
      if (ternaryCount > 1) {
        changes.push({
          type: "insert-after",
          line: i + 1,
          text: `// READABILITY: Nested ternary on line ${i + 1}. Consider extracting to a helper function or if/else.`,
        })
      }
    }

    return changes.length > 0 ? changes : null
  }

  /**
   * Apply a list of concrete line changes to the original content.
   * This replaces the previous no-op `applyDiff` method.
   */
  applyChanges(original: string, changes: LineChange[]): string {
    const lines = original.split("\n")
    const sorted = [...changes].sort((a, b) => b.line - a.line)

    for (const change of sorted) {
      const idx = change.line - 1
      if (idx < 0 || idx > lines.length) continue

      switch (change.type) {
        case "replace":
          if (lines[idx] !== undefined) {
            lines[idx] = change.text
          }
          break
        case "insert-before":
          lines.splice(idx, 0, change.text)
          break
        case "insert-after":
          lines.splice(idx + 1, 0, change.text)
          break
        case "delete":
          lines.splice(idx, 1)
          break
      }
    }

    return lines.join("\n")
  }

  /**
   * Generate a CodeMutation from a file path, strategy, and optional changes.
   * Used by the evolve engine to propose specific mutations.
   */
  generateMutation(params: {
    filePath: string
    strategy: MutationStrategy
    description: string
    changes?: LineChange[]
  }): CodeMutation | null {
    const fullPath = join(process.cwd(), params.filePath)
    if (!existsSync(fullPath)) return null

    const content = readFileSync(fullPath, "utf-8")

    if (params.changes && params.changes.length > 0) {
      const newContent = this.applyChanges(content, params.changes)
      return evolutionStore.createMutation({
        filePath: params.filePath,
        strategy: params.strategy,
        description: params.description,
        diff: JSON.stringify(params.changes),
        oldContent: content,
        newContent,
        confidence: 0.6,
        sourceInsight: params.description,
        sourceDreamId: "",
        sourceFailureIds: [],
      })
    }

    const analysis = this.analyzeFile(fullPath)
    if (!analysis) return null

    const changes = this.synthesizeChanges(analysis, params.strategy, {
      id: "",
      dreamId: "",
      type: "pattern",
      title: params.description,
      description: params.description,
      confidence: 0.6,
      sourceCount: 1,
      actionable: true,
      applied: false,
    })
    if (!changes) return null

    const newContent = this.applyChanges(content, changes)
    if (newContent === content) return null

    return evolutionStore.createMutation({
      filePath: params.filePath,
      strategy: params.strategy,
      description: params.description,
      diff: JSON.stringify(changes),
      oldContent: content,
      newContent,
      confidence: 0.6,
      sourceInsight: params.description,
      sourceDreamId: "",
      sourceFailureIds: [],
    })
  }

  /**
   * Apply a diff (JSON-encoded LineChange[]) to a file on disk.
   * Returns true if the file was modified.
   */
  applyDiffToFile(filePath: string, diffJson: string): boolean {
    try {
      const changes: LineChange[] = JSON.parse(diffJson)
      if (!Array.isArray(changes) || changes.length === 0) return false

      const fullPath = join(process.cwd(), filePath)
      if (!existsSync(fullPath)) return false

      const content = readFileSync(fullPath, "utf-8")
      const newContent = this.applyChanges(content, changes)

      if (newContent === content) return false

      writeFileSync(fullPath, newContent, "utf-8")
      log.info(`Applied diff to ${filePath}: ${changes.length} changes`)
      return true
    } catch (err) {
      log.error(`Failed to apply diff to ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
      return false
    }
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
    const pattern = String(cluster.commonPattern || cluster.description || "").toLowerCase()
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

      const analysis = this.analyzeFile(filePath)
      let changes: LineChange[] | null = null
      if (analysis) {
        changes = this.synthesizeChanges(analysis, strategy, {
          id: "",
          dreamId: "",
          type: "pattern",
          title: `Fix: ${cluster.name || cluster.id || "failure pattern"}`,
          description: pattern,
          confidence: 0.4,
          sourceCount: 1,
          actionable: true,
          applied: false,
        })
      }

      mutations.push(
        evolutionStore.createMutation({
          filePath: relative(process.cwd(), filePath),
          strategy,
          description: `Fix: ${cluster.name || cluster.id || "failure pattern"}`,
          diff: changes ? JSON.stringify(changes) : `Auto-fix for: ${cluster.suggestedFix || cluster.commonPattern || ""}`,
          oldContent: content,
          newContent: changes ? this.applyChanges(content, changes) : content,
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
