/**
 * plugin/resolver — Dependency resolution for the Plugin Marketplace.
 *
 * Provides:
 *   - Semver range matching (^1.0.0, >=2.0.0 <3.0.0, ~1.2.0, *)
 *   - Dependency graph construction from plugin manifests
 *   - Cycle detection in the dependency graph
 *   - Full resolution checking (are all deps installable?)
 */

import type { SignedPluginManifest, DependencyGraph, ConcreteVersion, VersionSpec } from "./types"

// ── Semver Helpers ───────────────────────────────────────────────────

/**
 * Parse a version string into its components.
 * Supports: "1.2.3", "1.2.3-alpha", "1.2.3+build"
 */
function parseVersion(v: string): { major: number; minor: number; patch: number; prerelease: string } | null {
  const match = v.match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.]+))?(?:\+[a-zA-Z0-9.]+)?$/)
  if (!match) return null
  return {
    major: parseInt(match[1]!, 10),
    minor: parseInt(match[2]!, 10),
    patch: parseInt(match[3]!, 10),
    prerelease: match[4] || "",
  }
}

/**
 * Compare two parsed versions.
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
function compareParsed(
  a: { major: number; minor: number; patch: number; prerelease: string },
  b: { major: number; minor: number; patch: number; prerelease: string },
): number {
  if (a.major !== b.major) return a.major > b.major ? 1 : -1
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1

  // Pre-release versions are less than release versions
  if (a.prerelease && !b.prerelease) return -1
  if (!a.prerelease && b.prerelease) return 1
  if (a.prerelease && b.prerelease) {
    return a.prerelease > b.prerelease ? 1 : a.prerelease < b.prerelease ? -1 : 0
  }
  return 0
}

/**
 * Check if a concrete version satisfies a semver range.
 * Supports: ^, ~, >=, <=, >, <, =, *, ranges (space-separated), || (OR)
 *
 * Examples:
 *   satisfies("1.2.3", "^1.0.0")       → true
 *   satisfies("2.0.0", "^1.0.0")       → false
 *   satisfies("1.2.3", ">=1.0.0 <2.0.0") → true
 *   satisfies("1.5.0", "~1.2.0")       → false (~ requires patch-level changes only)
 */
export function satisfies(version: ConcreteVersion, range: string): boolean {
  // Handle || (OR) conditions
  const orParts = range.split(/\s*\|\|\s*/)
  if (orParts.length > 1) {
    return orParts.some((part) => satisfies(version, part.trim()))
  }

  const parsed = parseVersion(version)
  if (!parsed) return false

  // Handle exact version match
  range = range.trim()

  // * matches everything
  if (range === "*" || range === "x" || range === "X") return true

  // ^1.2.3 → >=1.2.3 <2.0.0 (minor and patch allowed)
  // ^0.2.3 → >=0.2.3 <0.3.0 (patch allowed, major=0 locks minor)
  // ^0.0.3 → >=0.0.3 <0.0.4 (patch only, major=0 minor=0 locks patch)
  const caretMatch = range.match(/^\^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.]+))?$/)
  if (caretMatch) {
    const major = parseInt(caretMatch[1]!, 10)
    const minor = parseInt(caretMatch[2]!, 10)
    const patch = parseInt(caretMatch[3]!, 10)
    const lower = { major, minor, patch, prerelease: caretMatch[4] || "" }

    // Per semver spec, caret range upper bound depends on major/minor
    let upper: { major: number; minor: number; patch: number; prerelease: string }
    if (major !== 0) {
      upper = { major: major + 1, minor: 0, patch: 0, prerelease: "" }
    } else if (minor !== 0) {
      upper = { major: 0, minor: minor + 1, patch: 0, prerelease: "" }
    } else {
      upper = { major: 0, minor: 0, patch: patch + 1, prerelease: "" }
    }

    return compareParsed(parsed, lower) >= 0 && compareParsed(parsed, upper) < 0
  }

  // ~1.2.3 → >=1.2.3 <1.3.0 (patch-level changes only)
  const tildeMatch = range.match(/^~(\d+)\.(\d+)\.(\d+)$/)
  if (tildeMatch) {
    const lower = {
      major: parseInt(tildeMatch[1]!, 10),
      minor: parseInt(tildeMatch[2]!, 10),
      patch: parseInt(tildeMatch[3]!, 10),
      prerelease: "",
    }
    const upper = { major: lower.major, minor: lower.minor + 1, patch: 0, prerelease: "" }
    return compareParsed(parsed, lower) >= 0 && compareParsed(parsed, upper) < 0
  }

  // Handle ranged conditions: >=1.0.0 <2.0.0 (space-separated, multiple parts)
  const rangeParts = range.split(/\s+/)
  if (rangeParts.length > 1 && rangeParts.some((p) => p.startsWith(">") || p.startsWith("<"))) {
    return rangeParts.every((part) => satisfies(version, part.trim()))
  }

  // >=1.2.3
  const gteMatch = range.match(/^>=(\d+)\.(\d+)\.(\d+)$/)
  if (gteMatch) {
    const lower = {
      major: parseInt(gteMatch[1]!, 10),
      minor: parseInt(gteMatch[2]!, 10),
      patch: parseInt(gteMatch[3]!, 10),
      prerelease: "",
    }
    return compareParsed(parsed, lower) >= 0
  }

  // <=1.2.3
  const lteMatch = range.match(/^<=(\d+)\.(\d+)\.(\d+)$/)
  if (lteMatch) {
    const upper = {
      major: parseInt(lteMatch[1]!, 10),
      minor: parseInt(lteMatch[2]!, 10),
      patch: parseInt(lteMatch[3]!, 10),
      prerelease: "",
    }
    return compareParsed(parsed, upper) <= 0
  }

  // >1.2.3
  const gtMatch = range.match(/^>(\d+)\.(\d+)\.(\d+)$/)
  if (gtMatch) {
    const lower = {
      major: parseInt(gtMatch[1]!, 10),
      minor: parseInt(gtMatch[2]!, 10),
      patch: parseInt(gtMatch[3]!, 10),
      prerelease: "",
    }
    return compareParsed(parsed, lower) > 0
  }

  // <1.2.3
  const ltMatch = range.match(/^<(\d+)\.(\d+)\.(\d+)$/)
  if (ltMatch) {
    const upper = {
      major: parseInt(ltMatch[1]!, 10),
      minor: parseInt(ltMatch[2]!, 10),
      patch: parseInt(ltMatch[3]!, 10),
      prerelease: "",
    }
    return compareParsed(parsed, upper) < 0
  }

  // =1.2.3 or bare version
  const exactMatch = range.match(/^=?\s*(\d+)\.(\d+)\.(\d+)$/)
  if (exactMatch) {
    const exact = {
      major: parseInt(exactMatch[1]!, 10),
      minor: parseInt(exactMatch[2]!, 10),
      patch: parseInt(exactMatch[3]!, 10),
      prerelease: "",
    }
    return compareParsed(parsed, exact) === 0
  }

  return false
}

/**
 * Find the best (highest) version from a list that satisfies a given range.
 * Returns null if no version satisfies the range.
 */
export function bestMatch(versions: ConcreteVersion[], range: string): ConcreteVersion | null {
  const satisfying = versions.filter((v) => satisfies(v, range))
  if (satisfying.length === 0) return null

  // Sort descending and return the highest
  satisfying.sort((a, b) => {
    const pa = parseVersion(a)
    const pb = parseVersion(b)
    if (!pa || !pb) return 0
    return compareParsed(pb, pa) // descending (swap for reverse)
  })

  return satisfying[0]!
}

// ── Dependency Graph ─────────────────────────────────────────────────

/**
 * Build and analyze a dependency graph from a set of plugin manifests.
 *
 * @param plugins — All available plugins (name → manifest)
 * @param root — The name of the root plugin to resolve dependencies for
 * @returns A DependencyGraph with resolution results
 */
export function buildDependencyGraph(
  plugins: Map<string, SignedPluginManifest>,
  root: string,
): DependencyGraph {
  const graph: DependencyGraph = {
    nodes: new Map(),
    edges: [],
    cycles: [],
    unresolved: [],
    isResolved: true,
  }

  const visited = new Set<string>()
  const inStack = new Set<string>()
  const path: string[] = []

  function resolve(name: string, spec: VersionSpec, requiredBy: string) {
    // Cycle detection
    if (inStack.has(name)) {
      const cycleStart = path.indexOf(name)
      if (cycleStart >= 0) {
        graph.cycles.push([...path.slice(cycleStart), name])
      }
      graph.isResolved = false
      return
    }

    // Already resolved this node
    if (visited.has(name)) return

    const manifest = plugins.get(name)
    if (!manifest) {
      graph.unresolved.push({ name, spec, requiredBy })
      graph.isResolved = false
      return
    }

    // Check if the installed version satisfies the spec
    if (!satisfies(manifest.version, spec)) {
      graph.unresolved.push({ name, spec, requiredBy })
      graph.isResolved = false
      return
    }

    visited.add(name)
    inStack.add(name)
    path.push(name)

    graph.nodes.set(name, manifest.version)

    // Resolve dependencies
    const deps = manifest.dependencies || []
    for (const dep of deps) {
      graph.edges.push({ from: name, to: dep.name, spec: dep.version })
      resolve(dep.name, dep.version, name)
    }

    path.pop()
    inStack.delete(name)
  }

  resolve(root, "*", "root")

  return graph
}

/**
 * Check if a set of plugins has any dependency conflicts.
 * A conflict occurs when two plugins depend on different versions of
 * the same plugin and those versions are incompatible.
 */
export function findConflicts(plugins: Map<string, SignedPluginManifest>): Array<{
  plugin: string
  dependency: string
  requiredVersions: string[]
}> {
  // Collect all version requirements for each dependency
  const requirements = new Map<string, Set<string>>()

  for (const [, manifest] of plugins) {
    const deps = manifest.dependencies || []
    for (const dep of deps) {
      if (!requirements.has(dep.name)) {
        requirements.set(dep.name, new Set())
      }
      requirements.get(dep.name)!.add(dep.version)
    }
  }

  // Find dependencies with conflicting requirements
  const conflicts: Array<{ plugin: string; dependency: string; requiredVersions: string[] }> = []

  for (const [depName, specs] of requirements) {
    const specArray = [...specs]
    if (specArray.length <= 1) continue

    // Check if there's a version that satisfies all specs
    const allVersions = new Set<string>()
    for (const [, manifest] of plugins) {
      if (manifest.name === depName) {
        allVersions.add(manifest.version)
      }
    }

    // If the dependency isn't even in the plugin set, flag it
    if (allVersions.size === 0) {
      for (const spec of specArray) {
        // Find which plugin requires this
        for (const [name, manifest] of plugins) {
          if (manifest.dependencies?.some((d) => d.name === depName && d.version === spec)) {
            conflicts.push({
              plugin: name,
              dependency: depName,
              requiredVersions: specArray,
            })
          }
        }
      }
      continue
    }

    // Try to find a version that satisfies all requirements
    const allVersionsArr = [...allVersions]
    const satisfying = allVersionsArr.filter((v) => specArray.every((s) => satisfies(v, s)))

    if (satisfying.length === 0) {
      // No version satisfies all requirements — conflict!
      for (const spec of specArray) {
        for (const [name, manifest] of plugins) {
          if (manifest.dependencies?.some((d) => d.name === depName && d.version === spec)) {
            conflicts.push({
              plugin: name,
              dependency: depName,
              requiredVersions: specArray,
            })
          }
        }
      }
    }
  }

  return conflicts
}
