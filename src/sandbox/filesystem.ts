import type { Sandbox, SandboxConfig, SandboxStatus, CommandCheck, DeniedOp } from "./types"
import { isAbsolute, relative, resolve, sep } from "node:path"

const DEFAULT_ALLOWED = [process.cwd()]

export function isPathInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  if (rel === "") return true
  if (isAbsolute(rel)) return false
  if (rel === "..") return false
  return !rel.startsWith(".." + sep)
}

export function resolveWorkspacePath(cwd: string, targetPath: string): string | null {
  const root = resolve(cwd)
  const resolved = resolve(root, targetPath)
  if (!isPathInside(root, resolved)) return null
  return resolved
}

export class FilesystemSandbox implements Sandbox {
  readonly name = "filesystem"
  private allowedPaths: string[]
  private _enabled: boolean
  private deniedOps: DeniedOp[] = []

  constructor(config?: Partial<SandboxConfig>) {
    this.allowedPaths = (config?.allowedPaths?.length ? config.allowedPaths : DEFAULT_ALLOWED).map((p) => resolve(p))
    this._enabled = config?.enabled ?? true
  }

  get enabled(): boolean {
    return this._enabled
  }
  set enabled(v: boolean) {
    this._enabled = v
  }

  restrictPath(originalPath: string): string | null {
    if (!this._enabled) return originalPath
    const resolved = resolve(originalPath)
    const allowed = this.allowedPaths.some((p) => isPathInside(p, resolved))
    if (!allowed) {
      this.deniedOps.push({ operation: "path_access", target: originalPath, timestamp: new Date().toISOString() })
      if (this.deniedOps.length > 20) this.deniedOps.shift()
      return null
    }
    return originalPath
  }

  restrictCommand(_cmd: string): CommandCheck {
    return { allowed: true }
  }

  status(): SandboxStatus {
    const lines = this._enabled
      ? [`Allowed paths: ${this.allowedPaths.join(", ")}`, `Recent denials: ${this.deniedOps.length}`]
      : ["Sandbox disabled"]
    return { type: "filesystem", active: this._enabled, info: lines }
  }

  recentDenied(): DeniedOp[] {
    return [...this.deniedOps]
  }
}
