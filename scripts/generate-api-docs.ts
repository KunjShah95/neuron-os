#!/usr/bin/env bun

/**
 * scripts/generate-api-docs.ts
 *
 * Auto-generates API reference documentation from Zod schemas in src/api/server.ts.
 * Parses the source file, extracts Zod object schemas, and generates markdown.
 *
 * Usage:
 *   bun run scripts/generate-api-docs.ts
 *   bun run scripts/generate-api-docs.ts --check  (verify docs are up to date)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve, join } from "node:path"

const ROOT = resolve(import.meta.dir, "..")
const API_FILE = join(ROOT, "src", "api", "server.ts")
const OUTPUT_FILE = join(ROOT, "docs", "api", "reference.md")

interface SchemaField {
  name: string
  type: string
  required: boolean
  description: string
  constraints: string[]
}

interface ParsedSchema {
  name: string
  fields: SchemaField[]
}

function parseZodSchemas(source: string): ParsedSchema[] {
  const schemas: ParsedSchema[] = []

  // Match const Name = z.object({ ... }) patterns
  const schemaRegex = /const\s+(\w+Schema)\s*=\s*z\.object\(\{([^}]+(?:\{[^}]*\}[^}]*)*)\}\)/gs

  let match: RegExpExecArray | null
  while ((match = schemaRegex.exec(source)) !== null) {
    const name = match[1]!.replace("Schema", "")
    const body = match[2]!
    const fields = parseFields(body)
    schemas.push({ name, fields })
  }

  return schemas
}

function parseFields(body: string): SchemaField[] {
  const fields: SchemaField[] = []

  // Split by top-level commas (handling nested objects)
  let depth = 0
  let current = ""
  const parts: string[] = []

  for (const char of body) {
    if (char === "{" || char === "[" || char === "(") depth++
    if (char === "}" || char === "]" || char === ")") depth--
    if (char === "," && depth === 0) {
      parts.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }
  if (current.trim()) parts.push(current.trim())

  for (const part of parts) {
    const fieldMatch = part.match(/^\s*(\w+)\s*:\s*(.+)/s)
    if (!fieldMatch) continue

    const fieldName = fieldMatch[1]!
    const fieldBody = fieldMatch[2]!

    const type = extractType(fieldBody)
    const required = !fieldBody.includes(".optional()")
    const constraints = extractConstraints(fieldBody)
    const description = extractDescription(fieldBody)

    fields.push({ name: fieldName, type, required, description, constraints })
  }

  return fields
}

function extractType(body: string): string {
  if (body.includes("z.string()")) return "string"
  if (body.includes("z.number()")) return "number"
  if (body.includes("z.boolean()")) return "boolean"
  if (body.includes("z.array(")) {
    const inner = body.match(/z\.array\((.+?)\)/)?.[1] ?? "unknown"
    return `${extractType(inner)}[]`
  }
  if (body.includes("z.record(")) return "Record<string, unknown>"
  if (body.includes("z.enum([")) {
    const values = body.match(/z\.enum\(\[(.+?)\]\)/)?.[1] ?? ""
    return values
  }
  return "unknown"
}

function extractConstraints(body: string): string[] {
  const constraints: string[] = []

  if (body.includes(".min(")) {
    const min = body.match(/\.min\((\d+)/)?.[1]
    if (min) constraints.push(`min: ${min}`)
  }
  if (body.includes(".max(")) {
    const max = body.match(/\.max\((\d+)/)?.[1]
    if (max) constraints.push(`max: ${max}`)
  }
  if (body.includes(".regex(")) {
    const pattern = body.match(/\.regex\((.+?)\)/)?.[1] ?? ""
    constraints.push(`pattern: ${pattern}`)
  }
  if (body.includes(".nonnegative()")) constraints.push(">= 0")
  if (body.includes(".positive()")) constraints.push("> 0")
  if (body.includes(".int()")) constraints.push("integer")

  return constraints
}

function extractDescription(body: string): string {
  const desc = body.match(/"(?:,\s*)?([^"]+)"/)?.[1] ?? ""
  return desc
}

function generateMarkdown(schemas: ParsedSchema[]): string {
  const lines: string[] = []

  lines.push("# API Reference")
  lines.push("")
  lines.push("> Auto-generated from Zod schemas in `src/api/server.ts`.")
  lines.push("> Do not edit manually — run `bun run scripts/generate-api-docs.ts` to regenerate.")
  lines.push("")
  lines.push("---")
  lines.push("")

  for (const schema of schemas) {
    lines.push(`## ${schema.name}`)
    lines.push("")
    lines.push("| Field | Type | Required | Constraints | Description |")
    lines.push("|-------|------|----------|-------------|-------------|")

    for (const field of schema.fields) {
      const required = field.required ? "Yes" : "No"
      const constraints = field.constraints.join(", ") || "-"
      const description = field.description || "-"
      lines.push(`| \`${field.name}\` | \`${field.type}\` | ${required} | ${constraints} | ${description} |`)
    }

    lines.push("")
  }

  // Also scan for route handlers
  lines.push("---")
  lines.push("")
  lines.push("## Endpoints")
  lines.push("")

  const serverSource = readFileSync(API_FILE, "utf-8")
  const routeRegex = /\.(\w+)\("\/api\/v1\/([^"]+)"[^)]*\)/g
  let routeMatch: RegExpExecArray | null

  lines.push("| Method | Path | Description |")
  lines.push("|--------|------|-------------|")

  while ((routeMatch = routeRegex.exec(serverSource)) !== null) {
    const method = routeMatch[1]!.toUpperCase()
    const path = `/api/v1/${routeMatch[2]}`
    lines.push(`| ${method} | \`${path}\` | - |`)
  }

  lines.push("")

  return lines.join("\n")
}

async function main() {
  const checkMode = process.argv.includes("--check")

  if (!existsSync(API_FILE)) {
    console.error(`API file not found: ${API_FILE}`)
    process.exit(1)
  }

  const source = readFileSync(API_FILE, "utf-8")
  const schemas = parseZodSchemas(source)

  if (schemas.length === 0) {
    console.warn("No Zod schemas found in API file")
    process.exit(0)
  }

  const markdown = generateMarkdown(schemas)

  if (checkMode) {
    if (!existsSync(OUTPUT_FILE)) {
      console.error(`API docs not found at ${OUTPUT_FILE}. Run without --check first.`)
      process.exit(1)
    }
    const existing = readFileSync(OUTPUT_FILE, "utf-8")
    if (existing !== markdown) {
      console.error("API docs are out of date. Run: bun run scripts/generate-api-docs.ts")
      process.exit(1)
    }
    console.log("API docs are up to date.")
    return
  }

  // Ensure output directory exists
  const dir = resolve(OUTPUT_FILE, "..")
  if (!existsSync(dir)) {
    const { mkdirSync } = await import("node:fs")
    mkdirSync(dir, { recursive: true })
  }

  writeFileSync(OUTPUT_FILE, markdown, "utf-8")
  console.log(`Generated API docs from ${schemas.length} schemas → ${OUTPUT_FILE}`)
}

main()
