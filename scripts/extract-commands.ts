#!/usr/bin/env bun
/**
 * extract-commands.ts
 *
 * Parses `src/cli/commands/*.ts` and emits `shared/commands.json` containing
 * the mechanical facts (name, alias, description, options) for every
 * commander.js chain in those files. The frontends (dashboard, website)
 * import this JSON and add their own presentation layer on top.
 *
 * Usage:
 *   bun run scripts/extract-commands.ts            # writes shared/commands.json
 *   bun run scripts/extract-commands.ts --check    # exits 1 on drift
 *   bun run scripts/extract-commands.ts --stdout   # prints JSON to stdout
 *
 * Algorithm:
 *   1. Glob src/cli/commands/*.ts (skipping index.ts).
 *   2. Parse each file with the TypeScript Compiler API.
 *   3. Find the exported `registerXxx` function declaration.
 *   4. Walk its body. Track local variables assigned from commander chains
 *      (e.g. `const agent = program.command("agent")...`).
 *   5. For each top-level expression statement that begins a `.command(...)`
 *      chain, extract name, alias, description, options.
 *   6. When a subsequent `.command(...)` is called on a tracked local
 *      variable, emit a subcommand (prepend the parent name).
 *   7. When `.action(...)` is hit, the command is complete.
 */

import * as ts from "typescript"
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join, relative, resolve } from "node:path"

export interface ExtractedOption {
  flag: string
  description: string
  required: boolean
  defaultValue?: string | boolean | number
}

export interface ExtractedCommand {
  name: string
  parent?: string
  alias?: string
  description: string
  options: ExtractedOption[]
  sourceFile: string
}

interface ExtractedOutput {
  generatedAt: string
  commands: ExtractedCommand[]
}

const PROJECT_ROOT = resolve(import.meta.dir ?? __dirname, "..")
const COMMANDS_DIR = join(PROJECT_ROOT, "src", "cli", "commands")
const OUTPUT_PATH = join(PROJECT_ROOT, "shared", "commands.json")

interface CommandChain {
  name: string
  parentName?: string
  alias?: string
  description?: string
  options: ExtractedOption[]
}

/**
 * Parse a single command file and return all commander.js commands defined in it.
 * Public so the test suite can call it directly.
 *
 * The `sourceFile` field in each result is the `sourceFile` arg as-passed
 * (or `filePath` if not given). Callers that want project-relative output
 * should pass the relative path themselves.
 */
export function extractCommandsFromFile(
  filePath: string,
  sourceFile?: string,
): ExtractedCommand[] {
  const source = readFileSync(filePath, "utf-8")
  const sf = sourceFile ?? filePath
  const tsFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )

  const registerFn = findRegisterFunction(tsFile)
  if (!registerFn || !registerFn.body) {
    return []
  }

  // Track local variables that are bound to commander chains.
  // Key: variable name. Value: { parentName?, commandName? }
  const localVars = new Map<
    string,
    { parentName?: string; commandName: string }
  >()

  const results: ExtractedCommand[] = []

  for (const stmt of registerFn.body.statements) {
    processStatement(stmt, sf, localVars, results)
  }

  return results
}

function findRegisterFunction(
  sourceFile: ts.SourceFile,
): ts.FunctionDeclaration | undefined {
  for (const stmt of sourceFile.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      const name = stmt.name.text
      if (/^register[A-Z]/.test(name)) {
        return stmt
      }
    }
  }
  return undefined
}

function processStatement(
  stmt: ts.Statement,
  filePath: string,
  localVars: Map<string, { parentName?: string; commandName: string }>,
  results: ExtractedCommand[],
): void {
  // Pattern 1: const x = program.command("name")...   OR   const x = program.command("name")
  if (ts.isVariableStatement(stmt)) {
    for (const decl of stmt.declarationList.declarations) {
      if (
        ts.isIdentifier(decl.name) &&
        decl.initializer &&
        ts.isCallExpression(decl.initializer)
      ) {
        const varName = decl.name.text
        const chain = collectCommandChain(decl.initializer, localVars)
        if (chain) {
          if (chain.parentName) {
            // e.g. const foo = parent.command("sub") — subcommand
            results.push(buildCommandFromChain(chain, filePath))
          } else {
            // Top-level — record the variable so its children can be detected
            localVars.set(varName, { commandName: chain.name })
            results.push(buildCommandFromChain(chain, filePath))
          }
        }
      }
    }
    return
  }

  // Pattern 2: parent.command("name")...   (ExpressionStatement)
  if (ts.isExpressionStatement(stmt)) {
    const chain = collectCommandChain(stmt.expression, localVars)
    if (chain) {
      results.push(buildCommandFromChain(chain, filePath))
    }
  }
}

function collectCommandChain(
  start: ts.Expression,
  localVars: Map<string, { parentName?: string; commandName: string }>,
): CommandChain | null {
  // Walk the chain. At each step, the call's `.expression` is a
  // PropertyAccessExpression (the receiver being a method-call) and we
  // recurse into that receiver if it's itself a CallExpression.
  const methods: { name: string; call: ts.CallExpression }[] = []
  let cursor: ts.Expression = start

  while (ts.isCallExpression(cursor)) {
    const call = cursor
    let methodName = ""
    if (ts.isPropertyAccessExpression(call.expression)) {
      methodName = call.expression.name.text
      const receiver = call.expression.expression
      if (ts.isCallExpression(receiver)) {
        // Continue into the next call in the chain
        methods.push({ name: methodName, call })
        cursor = receiver
        continue
      }
    }
    // End of the chain: either not a PropertyAccessExpression, or the
    // receiver is a non-call (Identifier, etc.). Record the final call
    // and stop.
    methods.push({ name: methodName, call })
    break
  }

  // Reverse so order is [command, alias?, description?, option*, action?]
  methods.reverse()

  if (methods.length === 0) return null
  const first = methods[0]
  if (!first || first.name !== "command") return null

  const commandCall = first.call
  const commandArg = commandCall.arguments[0]
  if (!commandArg || !ts.isStringLiteral(commandArg)) return null
  const commandName = commandArg.text

  // Determine parent from the receiver of the .command call.
  // The receiver of .command is the PropertyAccessExpression's `.expression`,
  // which is the chain's starting point.
  const commandReceiver = (commandCall.expression as ts.PropertyAccessExpression).expression
  let parentName: string | undefined
  if (ts.isIdentifier(commandReceiver) && commandReceiver.text !== "program") {
    const local = localVars.get(commandReceiver.text)
    if (local) {
      parentName = local.commandName
    }
  }

  const chain: CommandChain = {
    name: commandName,
    parentName,
    options: [],
  }

  for (let i = 1; i < methods.length; i++) {
    const entry = methods[i]
    if (!entry) continue
    const { name, call } = entry
    switch (name) {
      case "alias": {
        const arg = call.arguments[0]
        if (arg && ts.isStringLiteral(arg)) chain.alias = arg.text
        break
      }
      case "description": {
        const arg = call.arguments[0]
        if (arg && ts.isStringLiteral(arg)) chain.description = arg.text
        break
      }
      case "option":
      case "requiredOption": {
        const flagArg = call.arguments[0]
        const descArg = call.arguments[1]
        const defaultArg = call.arguments[2]
        if (
          flagArg &&
          ts.isStringLiteral(flagArg) &&
          descArg &&
          ts.isStringLiteral(descArg)
        ) {
          const opt: ExtractedOption = {
            flag: flagArg.text,
            description: descArg.text,
            required: name === "requiredOption",
          }
          if (defaultArg) {
            if (ts.isStringLiteral(defaultArg)) {
              opt.defaultValue = defaultArg.text
            } else if (defaultArg.kind === ts.SyntaxKind.TrueKeyword) {
              opt.defaultValue = true
            } else if (defaultArg.kind === ts.SyntaxKind.FalseKeyword) {
              opt.defaultValue = false
            } else if (ts.isNumericLiteral(defaultArg)) {
              opt.defaultValue = Number(defaultArg.text)
            }
          }
          chain.options.push(opt)
        }
        break
      }
      case "action":
        // End of the command chain — stop collecting.
        i = methods.length
        break
      default:
        // Ignore unknown method calls (.addHelpText, .hook, etc.)
        break
    }
  }

  return chain
}

function buildCommandFromChain(
  chain: CommandChain,
  filePath: string,
): ExtractedCommand {
  const fullName = chain.parentName
    ? `${chain.parentName} ${chain.name}`
    : chain.name
  const cmd: ExtractedCommand = {
    name: fullName,
    options: chain.options,
    sourceFile: filePath,
    description: chain.description ?? "",
  }
  if (chain.parentName !== undefined) cmd.parent = chain.parentName
  if (chain.alias !== undefined) cmd.alias = chain.alias
  return cmd
}

function discoverCommandFiles(): string[] {
  return readdirSync(COMMANDS_DIR)
    .filter((f) => f.endsWith(".ts") && f !== "index.ts" && !f.endsWith(".test.ts"))
    .sort()
    .map((f) => join(COMMANDS_DIR, f))
}

function buildOutput(): ExtractedOutput {
  const files = discoverCommandFiles()
  const warnings: string[] = []
  const commands: ExtractedCommand[] = []

  for (const file of files) {
    try {
      const rel = relative(PROJECT_ROOT, file).replaceAll("\\", "/")
      const extracted = extractCommandsFromFile(file, rel)
      if (extracted.length === 0) {
        warnings.push(`No commands found in ${rel}`)
      }
      commands.push(...extracted)
    } catch (err) {
      warnings.push(
        `Failed to parse ${file}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  // Sort by name for deterministic output
  commands.sort((a, b) => a.name.localeCompare(b.name))

  if (warnings.length > 0) {
    for (const w of warnings) {
      console.error(`[extract-commands] Warning: ${w}`)
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    commands,
  }
}

function writeOutput(output: ExtractedOutput, toStdout: boolean): void {
  const json = JSON.stringify(output, null, 2) + "\n"
  if (toStdout) {
    process.stdout.write(json)
  } else {
    const dir = resolve(OUTPUT_PATH, "..")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(OUTPUT_PATH, json, "utf-8")
    console.log(`[extract-commands] ✓ Wrote ${output.commands.length} commands to ${relative(PROJECT_ROOT, OUTPUT_PATH)}`)
  }
}

function checkDrift(): number {
  const current = buildOutput()
  // Re-read existing file
  const existing = JSON.parse(readFileSync(OUTPUT_PATH, "utf-8")) as ExtractedOutput
  // Compare only the commands[] array (ignore generatedAt)
  const a = JSON.stringify(current.commands, null, 2)
  const b = JSON.stringify(existing.commands, null, 2)
  if (a !== b) {
    console.error(`[extract-commands] Drift detected!`)
    console.error(`  committed: ${existing.commands.length} commands`)
    console.error(`  current:   ${current.commands.length} commands`)
    console.error(`Run 'bun run docs:generate' to update.`)
    return 1
  }
  console.log(`[extract-commands] docs:check — no drift`)
  return 0
}

async function main(): Promise<number> {
  const args = process.argv.slice(2)
  if (args.includes("--check")) {
    return checkDrift()
  }
  if (args.includes("--stdout")) {
    const out = buildOutput()
    writeOutput(out, true)
    return 0
  }
  const out = buildOutput()
  writeOutput(out, false)
  return 0
}

// Run when invoked directly (not when imported by tests)
const isMain =
  typeof import.meta.main === "boolean"
    ? import.meta.main
    : import.meta.url === `file:///${process.argv[1]?.replaceAll("\\", "/")}`

if (isMain) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err)
      process.exit(1)
    },
  )
}
