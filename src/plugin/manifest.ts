import { parse } from "yaml"

export interface PluginHookConfig {
  on_agent_spawn?: boolean
  on_tool_call?: boolean
  on_message?: boolean
  on_ipc_message?: boolean
  on_shutdown?: boolean
}

export interface PluginDependency {
  name: string
  version: string
}

export interface PluginManifest {
  name: string
  version: string
  entrypoint: string
  description?: string
  author?: string
  license?: string
  hooks: PluginHookConfig
  dependencies: PluginDependency[]
  permissions: string[]
}

const VALID_HOOKS = new Set([
  "on_agent_spawn",
  "on_tool_call",
  "on_message",
  "on_ipc_message",
  "on_shutdown",
])

const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/
const CONSTRAINT_RE = /^([~^]?)\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/

export function parseManifest(yaml: string): PluginManifest {
  const raw: Record<string, unknown> = parse(yaml)

  if (!raw.name || typeof raw.name !== "string") {
    throw new Error("Manifest validation: 'name' is required and must be a string")
  }
  if (!raw.version || typeof raw.version !== "string") {
    throw new Error("Manifest validation: 'version' is required and must be a string")
  }
  if (!raw.entrypoint || typeof raw.entrypoint !== "string") {
    throw new Error("Manifest validation: 'entrypoint' is required and must be a string")
  }

  const hooks = (raw.hooks != null && typeof raw.hooks === "object" ? raw.hooks : {}) as Record<string, boolean>
  const deps = raw.dependencies as Array<Record<string, string>> | undefined
  const perms = raw.permissions as string[] | undefined

  const manifest: PluginManifest = {
    name: raw.name as string,
    version: raw.version as string,
    entrypoint: raw.entrypoint as string,
    hooks: {
      on_agent_spawn: hooks?.on_agent_spawn ?? false,
      on_tool_call: hooks?.on_tool_call ?? false,
      on_message: hooks?.on_message ?? false,
      on_ipc_message: hooks?.on_ipc_message ?? false,
      on_shutdown: hooks?.on_shutdown ?? false,
    },
    dependencies: Array.isArray(deps)
      ? deps.map((d) => ({ name: d.name ?? "", version: d.version ?? "" }))
      : [],
    permissions: Array.isArray(perms) ? perms : [],
  }

  if (raw.description && typeof raw.description === "string") manifest.description = raw.description
  if (raw.author && typeof raw.author === "string") manifest.author = raw.author
  if (raw.license && typeof raw.license === "string") manifest.license = raw.license

  return manifest
}

export function validateManifest(m: PluginManifest): string[] {
  const errors: string[] = []
  if (!m.name) errors.push("name is required")
  if (!m.version) errors.push("version is required")
  else if (!SEMVER_RE.test(m.version)) errors.push(`version "${m.version}" is not valid semver`)
  if (!m.entrypoint) errors.push("entrypoint is required")

  for (const [key, val] of Object.entries(m.hooks)) {
    if (!VALID_HOOKS.has(key)) {
      errors.push(`Unknown hook point: "${key}"`)
    } else if (val != null && typeof val !== "boolean") {
      errors.push(`Hook "${key}" must be a boolean, got ${typeof val}`)
    }
  }

  for (const dep of m.dependencies) {
    if (!dep.name) errors.push("dependency name is required")
    if (!dep.version) errors.push(`dependency "${dep.name}" version constraint is required`)
    else if (!CONSTRAINT_RE.test(dep.version)) {
      errors.push(`dependency "${dep.name}" version "${dep.version}" is not a valid semver constraint`)
    }
  }

  return errors
}
