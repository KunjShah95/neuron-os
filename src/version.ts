/**
 * Shared version utility — reads the package version once at load time.
 * Avoids hardcoded version strings scattered across the codebase.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let _version: string | null = null

/** Get the current package version (reads from package.json at first call). */
export function getVersion(): string {
  if (_version) return _version
  try {
    const dir = import.meta.dir ?? process.cwd()
    const pkg = JSON.parse(readFileSync(join(dir, "..", "package.json"), "utf-8"))
    _version = String(pkg.version || "0.0.0")
  } catch {
    _version = "0.0.0"
  }
  return _version
}

/** Get the version string with a 'v' prefix (e.g., "v0.1.0"). */
export function getVersionDisplay(): string {
  return `v${getVersion()}`
}
