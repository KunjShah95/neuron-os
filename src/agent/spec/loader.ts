import { existsSync, readFileSync } from "fs"
import { resolve, dirname } from "path"
import { parse } from "yaml"
import { AgentSpec, type AgentSpec as AgentSpecType } from "./schema"

export class SpecLoadError extends Error {
  constructor(message: string, public readonly path?: string) {
    super(message)
    this.name = "SpecLoadError"
  }
}

interface RawSpec {
  apiVersion: unknown
  kind: unknown
  from?: unknown
  metadata: unknown
  spec: unknown
}

function parseYaml(content: string): unknown {
  try {
    return parse(content)
  } catch (err) {
    throw new SpecLoadError(`Invalid YAML: ${(err as Error).message}`)
  }
}

function loadRawFile(filePath: string): RawSpec {
  if (!existsSync(filePath)) {
    throw new SpecLoadError(`Spec file not found: ${filePath}`, filePath)
  }
  const content = readFileSync(filePath, "utf-8")
  const raw = parseYaml(content)
  if (typeof raw !== "object" || raw === null) {
    throw new SpecLoadError("Spec must be a YAML object", filePath)
  }
  return raw as RawSpec
}

function deepMerge(base: unknown, child: unknown): unknown {
  if (typeof base !== "object" || base === null || typeof child !== "object" || child === null) {
    return child ?? base
  }
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [key, val] of Object.entries(child as Record<string, unknown>)) {
    if (val !== undefined && key in result && typeof val === "object" && val !== null && !Array.isArray(val)) {
      result[key] = deepMerge(result[key], val)
    } else if (val !== undefined) {
      result[key] = val
    }
  }
  return result
}

function mergeRaw(base: RawSpec, child: RawSpec): RawSpec {
  return deepMerge(base, child) as RawSpec
}

export function loadSpecWithImports(path: string, visited = new Set<string>()): AgentSpecType {
  const absPath = resolve(path)
  if (visited.has(absPath)) {
    throw new SpecLoadError(`Circular from: import chain detected`, absPath)
  }
  visited.add(absPath)

  const raw = loadRawFile(absPath)
  let merged = raw

  if (raw.from) {
    const fromPath = resolve(dirname(absPath), String(raw.from))
    const parent = loadSpecWithImports(fromPath, visited)
    const parentRaw: RawSpec = {
      apiVersion: parent.apiVersion,
      kind: parent.kind,
      metadata: parent.metadata as unknown as Record<string, unknown>,
      spec: parent.spec as unknown as Record<string, unknown>,
    }
    merged = mergeRaw(parentRaw, raw)
  }

  const result = AgentSpec.safeParse(merged)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")
    throw new SpecLoadError(`Schema validation failed:\n${issues}`, absPath)
  }
  return result.data
}

export function loadSpec(path: string): AgentSpecType {
  return loadSpecWithImports(path)
}
