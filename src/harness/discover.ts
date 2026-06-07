import { readdirSync, readFileSync } from "node:fs"
import { resolve, extname, basename } from "node:path"
import type { TestCase, TestFilter } from "./types"

// ── Test Loader Interface ────────────────────────────────────────

interface TestLoader {
  name: string
  extensions: string[]
  load(filePath: string, content: string): TestCase | TestCase[] | null
}

// ── Built-in Loaders ─────────────────────────────────────────────

function parseYamlBlock(yamlBlock: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = yamlBlock.split("\n")
  const stack: Array<{ obj: Record<string, unknown>; indent: number; key: string }> = []

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]
    if (!line || !line.trim() || line.trim().startsWith("#")) continue

    const indent = line.search(/\S/)
    const trimmed = line.trim()
    const colonIdx = trimmed.indexOf(":")

    if (colonIdx < 0) continue

    const key = trimmed.slice(0, colonIdx).trim()
    let value: unknown = trimmed.slice(colonIdx + 1).trim()

    // Pop stack to correct indentation level
    while (stack.length > 0) {
      const top = stack[stack.length - 1]
      if (top && top.indent >= indent) {
        stack.pop()
      } else {
        break
      }
    }

    // Get current parent (may be undefined if stack is empty)
    const currentParent = stack.length > 0 ? stack[stack.length - 1] : null

    // Handle block scalars (| for literal, > for folded)
    if (value === "|" || value === ">") {
      // Collect subsequent indented lines as the string value
      const blockLines: string[] = []
      const blockStartIndent = indent + 2 // content must be more indented
      for (let bi = lineIdx + 1; bi < lines.length; bi++) {
        const bline = lines[bi]
        if (!bline) {
          blockLines.push("")
          continue
        }
        const trimmedBline = bline.trim()
        if (!trimmedBline) {
          blockLines.push("")
          continue
        }
        const bIndent = bline.search(/\S/)
        if (bIndent < blockStartIndent) break
        blockLines.push(bline.slice(bIndent))
        lineIdx = bi // skip consumed lines
      }

      // Remove trailing empty lines
      while (blockLines.length > 0 && blockLines[blockLines.length - 1] === "") {
        blockLines.pop()
      }

      const blockValue = blockLines.join("\n")
      if (currentParent) {
        currentParent.obj[key] = blockValue
      } else {
        result[key] = blockValue
      }
      continue
    }

    // If value is empty, this key is a parent of nested children
    if (value === "") {
      const newObj: Record<string, unknown> = {}
      if (currentParent) {
        currentParent.obj[key] = newObj
      } else {
        result[key] = newObj
      }
      stack.push({ obj: newObj, indent, key })
      continue
    }

    // Parse scalar values
    if (typeof value === "string") {
      // Parse arrays [item1, item2]
      if (value.startsWith("[") && value.endsWith("]")) {
        value = value.slice(1, -1).split(",").map(s => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean)
      }
      // Parse booleans
      else if (value === "true") value = true
      else if (value === "false") value = false
      // Parse numbers
      else if (/^\d+$/.test(value)) value = parseInt(value as string, 10)
      else if (/^\d+\.\d+$/.test(value)) value = parseFloat(value as string)
      // Remove quotes
      else value = value.replace(/^['"]|['"]$/g, "")
    }

    if (currentParent) {
      currentParent.obj[key] = value
    } else {
      result[key] = value
    }
  }

  return result
}

function parseYamlFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  let body = content
  const frontmatter: Record<string, unknown> = {}

  if (content.startsWith("---")) {
    const endIdx = content.indexOf("---", 3)
    if (endIdx > 0) {
      const yamlBlock = content.slice(3, endIdx)
      body = content.slice(endIdx + 3).trim()
      return { frontmatter: parseYamlBlock(yamlBlock), body }
    }
  }

  return { frontmatter, body }
}

const yamlLoader: TestLoader = {
  name: "yaml",
  extensions: [".yaml", ".yml"],
  load(filePath: string, content: string): TestCase | null {
    const { frontmatter, body } = parseYamlFrontmatter(content)
    if (!frontmatter.name) return null

    const tags = (frontmatter.tags as string[]) ?? []
    const expected = frontmatter.expected as Record<string, unknown> | undefined
    const setup = frontmatter.setup as Record<string, unknown> | undefined

    return {
      id: frontmatter.id as string ?? `auto-${basename(filePath, extname(filePath))}`,
      name: frontmatter.name as string,
      description: frontmatter.description as string | undefined,
      prompt: (frontmatter.prompt as string) ?? body,
      category: frontmatter.category as TestCase["category"],
      priority: frontmatter.priority as TestCase["priority"],
      tags,
      timeout: (frontmatter.timeout as number) ?? 120000,
      expected: expected ? {
        pattern: expected.pattern as string | undefined,
        exitCode: expected.exitCode as number | undefined,
        filesExist: expected.filesExist as string[] | undefined,
        filesNotExist: expected.filesNotExist as string[] | undefined,
        maxSteps: expected.maxSteps as number | undefined,
        maxTokens: expected.maxTokens as number | undefined,
        minScore: expected.minScore as number | undefined,
      } : undefined,
      setup: setup ? {
        commands: (setup.commands as string[]) ?? [],
        files: (setup.files as Record<string, string>) ?? {},
        env: setup.env as Record<string, string> | undefined,
      } : undefined,
      cleanup: frontmatter.cleanup as boolean ?? true,
      model: frontmatter.model as string | undefined,
      agentType: frontmatter.agentType as string | undefined,
      graderWeights: frontmatter.graderWeights as Record<string, number> | undefined,
      dependsOn: frontmatter.dependsOn as string[] | undefined,
      author: frontmatter.author as string | undefined,
      createdAt: frontmatter.createdAt as string | undefined,
      updatedAt: frontmatter.updatedAt as string | undefined,
    }
  },
}

const markdownLoader: TestLoader = {
  name: "markdown",
  extensions: [".md"],
  load(filePath: string, content: string): TestCase | null {
    const lines = content.split("\n")
    const name = lines[0]?.replace(/^#\s*/, "").trim() || basename(filePath, ".md")
    if (!name) return null

    const tagsMatch = content.match(/## tags:\s*(.+)/)
    const timeoutMatch = content.match(/## timeout:\s*(\d+)/)
    const categoryMatch = content.match(/## category:\s*(.+)/)
    const prompt = content
      .replace(/^#.*\n/, "")
      .replace(/##\s+.*\n/g, "")
      .trim()

    const tags = tagsMatch
      ? tagsMatch[1]!.split(",").map(t => t.trim())
      : []

    return {
      id: `md-${basename(filePath, ".md")}`,
      name,
      prompt,
      tags,
      category: categoryMatch?.[1]?.trim() as TestCase["category"] | undefined,
      timeout: timeoutMatch ? parseInt(timeoutMatch[1]!, 10) : 120000,
    }
  },
}

const LOADERS: TestLoader[] = [yamlLoader, markdownLoader]

// ── Discovery Directories ────────────────────────────────────────

const DEFAULT_DIRS = [
  resolve(process.cwd(), "evals", "tasks"),
  resolve(process.cwd(), "evals", "adversarial"),
  resolve(process.cwd(), ".aegis", "harness"),
]

// ── Test Discoverer ──────────────────────────────────────────────

export class TestDiscoverer {
  private loaders: TestLoader[]

  constructor(loaders?: TestLoader[]) {
    this.loaders = loaders ?? LOADERS
  }

  /**
   * Discover all tests from configured directories.
   */
  discover(dirs?: string[], filter?: TestFilter): TestCase[] {
    const searchDirs = dirs ?? DEFAULT_DIRS
    const tests: TestCase[] = []

    // Search directories recursively (handles nested category directories)
    for (const dir of searchDirs) {
      this.discoverRecursive(dir, tests)
    }

    // Deduplicate by ID
    const seen = new Set<string>()
    const unique = tests.filter(t => {
      if (seen.has(t.id)) return false
      seen.add(t.id)
      return true
    })

    return filter ? this.applyFilter(unique, filter) : unique
  }

  /**
   * Filter tests by criteria.
   */
  applyFilter(tests: TestCase[], filter: TestFilter): TestCase[] {
    return tests.filter(t => {
      // Category filter
      if (filter.category) {
        const categories = Array.isArray(filter.category) ? filter.category : [filter.category]
        if (!t.category || !categories.includes(t.category)) return false
      }

      // Tag filter
      if (filter.tags) {
        if (filter.tags.include && filter.tags.include.length > 0) {
          const mode = filter.tags.mode ?? "or"
          const match = filter.tags.include.some(tag => t.tags.includes(tag))
          if (mode === "and") {
            const allMatch = filter.tags.include.every(tag => t.tags.includes(tag))
            if (!allMatch) return false
          } else if (!match) {
            return false
          }
        }
        if (filter.tags.exclude && filter.tags.exclude.length > 0) {
          if (filter.tags.exclude.some(tag => t.tags.includes(tag))) return false
        }
      }

      // Priority filter
      if (filter.priority) {
        const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority]
        if (!t.priority || !priorities.includes(t.priority)) return false
      }

      // Name pattern filter
      if (filter.namePattern) {
        try {
          const regex = new RegExp(filter.namePattern, "i")
          if (!regex.test(t.name)) return false
        } catch {
          // Invalid regex, skip filter
        }
      }

      // ID pattern filter
      if (filter.idPattern) {
        const regex = new RegExp(filter.idPattern.replace(/\*/g, ".*"), "i")
        if (!regex.test(t.id)) return false
      }

      return true
    })
  }

  /**
   * Resolve test dependencies via topological sort.
   */
  resolveDependencies(tests: TestCase[]): TestCase[] {
    const graph = new Map<string, TestCase>()
    const inDegree = new Map<string, number>()
    const adjList = new Map<string, string[]>()

    for (const t of tests) {
      graph.set(t.id, t)
      inDegree.set(t.id, 0)
      adjList.set(t.id, [])
    }

    for (const t of tests) {
      if (t.dependsOn) {
        for (const depId of t.dependsOn) {
          if (graph.has(depId)) {
            adjList.get(depId)!.push(t.id)
            inDegree.set(t.id, (inDegree.get(t.id) ?? 0) + 1)
          }
        }
      }
    }

    // Kahn's algorithm
    const queue: string[] = []
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id)
    }

    const sorted: TestCase[] = []
    while (queue.length > 0) {
      const id = queue.shift()!
      const test = graph.get(id)
      if (test) sorted.push(test)

      for (const neighbor of adjList.get(id) ?? []) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1
        inDegree.set(neighbor, newDegree)
        if (newDegree === 0) queue.push(neighbor)
      }
    }

    // Add any remaining tests (circular deps become dangling)
    for (const t of tests) {
      if (!sorted.find(s => s.id === t.id)) {
        sorted.push(t)
      }
    }

    return sorted
  }

  // ── Private ──────────────────────────────────────────────────

  private discoverRecursive(dir: string, tests: TestCase[]): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          this.discoverRecursive(resolve(dir, entry.name), tests)
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase()
          const loader = this.loaders.find(l => l.extensions.includes(ext))
          if (!loader) continue

          const filePath = resolve(dir, entry.name)
          try {
            const content = readFileSync(filePath, "utf-8")
            const result = loader.load(filePath, content)
            if (result) {
              const cases = Array.isArray(result) ? result : [result]
              tests.push(...cases)
            }
          } catch (err) {
            // File not readable - skip with warning
            console.warn(`[DISCOVER] Could not read ${entry.name}: ${err}`)
          }
        }
      }
    } catch (err) {
      // Directory not accessible - skip with warning
      console.warn(`[DISCOVER] Error reading directory: ${err}`)
    }
  }
}

// ── Backward Compat Export ───────────────────────────────────────

/**
 * Legacy discover function for backward compatibility.
 * Returns tests from old `.aegis/harness/*.md` directory.
 */
export function discoverTests(): TestCase[] {
  const discoverer = new TestDiscoverer()

  // Check old directory first
  const oldDir = resolve(process.cwd(), ".aegis", "harness")
  const oldTests = discoverer.discover([oldDir])

  // Also check new directories
  const newDirs = [
    resolve(process.cwd(), "evals", "tasks"),
    resolve(process.cwd(), "evals", "adversarial"),
  ]
  const newTests = discoverer.discover(newDirs)

  const all = [...oldTests, ...newTests]
  if (oldTests.length > 0) {
    console.warn(`[DEPRECATED] ${oldTests.length} test(s) in old format at ${oldDir}`)
    console.warn("  Migrate to YAML format: evals/tasks/<category>/<name>.yaml")
  }

  return all
}
