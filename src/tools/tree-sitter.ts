import { readFile } from "node:fs/promises"
import { resolve, relative, extname } from "node:path"
import { spawnSync } from "node:child_process"
import type { Tool, ToolResult } from "./registry"

interface SymbolMatch {
  kind: string
  name: string
  file: string
  line: number
  signature?: string
}

const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  typescript: [".ts", ".tsx", ".mts", ".cts"],
  javascript: [".js", ".jsx", ".mjs", ".cjs"],
  python: [".py", ".pyw"],
  rust: [".rs"],
  go: [".go"],
  java: [".java"],
  cpp: [".cpp", ".cc", ".cxx", ".hpp", ".h", ".hxx"],
  csharp: [".cs"],
  ruby: [".rb"],
  php: [".php"],
  swift: [".swift"],
  kotlin: [".kt", ".kts"],
  scala: [".scala"],
  elixir: [".ex", ".exs"],
  haskell: [".hs"],
}

function extToLanguage(ext: string): string | undefined {
  for (const [lang, exts] of Object.entries(LANGUAGE_EXTENSIONS)) {
    if (exts.includes(ext)) return lang
  }
  return undefined
}

function parseSymbols(content: string, language: string): SymbolMatch[] {
  const symbols: SymbolMatch[] = []
  const lines = content.split("\n")

  type PatternDef = { kind: string; re: RegExp }

  function extractMatches(kind: string, re: RegExp, lineNum: number): void {
    const line = lines[lineNum]
    if (!line) return
    const match = line.match(re)
    if (match?.[1]) {
      symbols.push({ kind, name: match[1], file: "", line: lineNum + 1, signature: line.trim().slice(0, 120) })
    }
  }

  const patternSets: Record<string, PatternDef[]> = {
    typescript: [
      { kind: "function", re: /^(?:export\s+)?(?:async\s+)?function\s+(?:\*\s+)?(\w+)/ },
      { kind: "method", re: /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/ },
      { kind: "class", re: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/ },
      { kind: "interface", re: /^(?:export\s+)?interface\s+(\w+)/ },
      { kind: "type", re: /^(?:export\s+)?type\s+(\w+)\s*=/ },
      { kind: "enum", re: /^(?:export\s+)?enum\s+(\w+)/ },
      { kind: "arrow_function", re: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/ },
      { kind: "method", re: /^\s*(?:public|private|protected|static|async)\s+(?:static\s+)?(?:async\s+)?(\w+)\s*\(/ },
    ],
    javascript: [
      { kind: "function", re: /^(?:export\s+)?(?:async\s+)?function\s+(?:\*\s+)?(\w+)/ },
      { kind: "method", re: /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/ },
      { kind: "class", re: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/ },
      { kind: "arrow_function", re: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/ },
    ],
    python: [
      { kind: "function", re: /^(?:async\s+)?def\s+(\w+)/ },
      { kind: "class", re: /^class\s+(\w+)/ },
      { kind: "method", re: /^\s+(?:async\s+)?def\s+(\w+)/ },
    ],
    rust: [
      { kind: "function", re: /^(?:pub\s+)?(?:unsafe\s+)?fn\s+(\w+)/ },
      { kind: "struct", re: /^(?:pub\s+)?struct\s+(\w+)/ },
      { kind: "enum", re: /^(?:pub\s+)?enum\s+(\w+)/ },
      { kind: "trait", re: /^(?:pub\s+)?trait\s+(\w+)/ },
      { kind: "impl", re: /^(?:pub\s+)?(?:unsafe\s+)?impl\s+(\w+)/ },
      { kind: "macro", re: /^(?:pub\s+)?macro_rules!\s*(\w+)/ },
      { kind: "type", re: /^(?:pub\s+)?type\s+(\w+)/ },
      { kind: "const", re: /^(?:pub\s+)?const\s+(\w+)/ },
    ],
    go: [
      { kind: "function", re: /^func\s+(?:\([^)]*\)\s+)?(\w+)/ },
      { kind: "method", re: /^func\s+\([^)]*\)\s+(\w+)/ },
      { kind: "type", re: /^type\s+(\w+)\s+(?:struct|interface|map)/ },
    ],
    java: [
      { kind: "class", re: /^(?:public|private|protected|abstract|final)?\s*(?:abstract|final)?\s*class\s+(\w+)/ },
      { kind: "interface", re: /^(?:public|private|protected)?\s*interface\s+(\w+)/ },
      { kind: "method", re: /^(?:public|private|protected|static|abstract|final|synchronized)\s+(?:\w+\s+)*(\w+)\s*\(/ },
      { kind: "enum", re: /^(?:public|private|protected)?\s*enum\s+(\w+)/ },
    ],
    cpp: [
      { kind: "function", re: /^(?:\w+(?:::))*(\w+)\s*\([^)]*\)\s*\{/ },
      { kind: "class", re: /^(?:class|struct)\s+(\w+)/ },
    ],
  }

  const patterns = patternSets[language]
  if (!patterns) return symbols

  for (let i = 0; i < lines.length; i++) {
    for (const { kind, re } of patterns) {
      extractMatches(kind, re, i)
    }
  }

  return symbols
}

export const treeSitterTool: Tool = {
  name: "tree_sitter_symbols",
  description: `Search for code symbols (functions, classes, interfaces, types) in source files.

Uses tree-sitter CLI if available, falling back to pattern-based extraction.
Supports: TypeScript, JavaScript, Python, Rust, Go, Java, C++, C#, Ruby, PHP, Swift, Kotlin, Scala, Elixir, Haskell.

Use this instead of grep when you need to find definitions by symbol kind
(e.g. "find all classes" or "list function signatures").`,
  parameters: [
    {
      name: "query",
      type: "string",
      description: "Symbol kind to search for (function, class, interface, method, struct, enum, trait, type, const, macro, all)",
    },
    {
      name: "path",
      type: "string",
      description: "Directory or file to search (defaults to cwd)",
    },
    {
      name: "include",
      type: "string",
      description: "Glob pattern to filter files (e.g., '**/*.ts')",
    },
    {
      name: "name",
      type: "string",
      description: "Optional symbol name filter (regex match)",
    },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    const query = (params.query as string) || "all"
    const searchPath = (params.path as string) || "."
    const nameFilter = params.name as string | undefined
    const fullPath = resolve(ctx.cwd, searchPath)

    // Try tree-sitter CLI first
    let hasTreeSitter = false
    try {
      const tsCheck = spawnSync("tree-sitter", ["--version"], { timeout: 3000 })
      hasTreeSitter = tsCheck.status === 0
    } catch {
      hasTreeSitter = false
    }

    if (hasTreeSitter) {
      try {
        const args = ["query", "--captures"]
        if (query !== "all") args.push("--kind", query)
        if (nameFilter) args.push("--match", nameFilter)
        args.push(fullPath)
        const result = spawnSync("tree-sitter", args, { timeout: 15000, maxBuffer: 1024 * 1024 })
        if (result.status === 0) {
          return {
            success: true,
            output: result.stdout.toString().slice(0, 4096),
            metadata: { bytes: result.stdout.length, source: "tree-sitter-cli" },
          }
        }
      } catch {
        // Fall through to regex parser
      }
    }

    // Fallback: pattern-based symbol extraction
    try {
      const { glob } = await import("glob")
      const include = (params.include as string) || "**/*"
      const files = await glob(include, {
        cwd: fullPath,
        nodir: true,
        ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/target/**"],
      })

      const allSymbols: SymbolMatch[] = []
      const limit = 50

      for (const file of files.slice(0, 200)) {
        const filePath = resolve(fullPath, file as string)
        const ext = extname(filePath)
        const language = extToLanguage(ext)
        if (!language) continue

        try {
          const content = await readFile(filePath, "utf-8")
          const symbols = parseSymbols(content, language)
          for (const s of symbols) {
            if (nameFilter && !new RegExp(nameFilter).test(s.name)) continue
            if (query !== "all" && s.kind !== query) continue
            s.file = relative(ctx.cwd, filePath)
            allSymbols.push(s)
          }
        } catch {
          continue
        }

        if (allSymbols.length >= limit) break
      }

      if (allSymbols.length === 0) {
        return {
          success: true,
          output: query === "all"
            ? "No symbols found in the search path."
            : `No ${query} symbols found in the search path.`,
          metadata: { filesSearched: files.length, symbolsFound: 0 },
        }
      }

      const lines: string[] = []
      let currentFile = ""
      for (const s of allSymbols) {
        if (s.file !== currentFile) {
          currentFile = s.file
          lines.push(`\n${currentFile}:`)
        }
        const sig = s.signature ? `  ${s.signature}` : ""
        lines.push(`  ${s.line.toString().padStart(4)}  ${s.kind.padEnd(14)} ${s.name}${sig}`)
      }

      return {
        success: true,
        output: lines.join("\n"),
        metadata: {
          symbolsFound: allSymbols.length,
          filesSearched: files.length,
          source: "regex-fallback",
        },
      }
    } catch (err) {
      return {
        success: false,
        output: "",
        error: err instanceof Error ? err.message : String(err),
      }
    }
  },
}
