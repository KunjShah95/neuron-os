import type { Sandbox, SandboxConfig, SandboxStatus, CommandCheck, DeniedOp } from "./types"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const DENIED_PATTERNS = [
  /rm\s+-rf\s+(\/|\/\w+)/i,
  /mkfs/i,
  /dd\s+if=\/dev/i,
  /:\(\)\s*\{.*:\(\)\s*;?\};?\s*:/,
  /wget|curl\s+/i,
  /nc\s+/i,
  /chmod\s+777/i,
  /sudo/i,
]

export class ProcessSandbox implements Sandbox {
  readonly name = "process"
  private tempDir: string
  private _enabled: boolean
  private allowedCommands: string[]
  private deniedOps: DeniedOp[] = []

  constructor(config?: Partial<SandboxConfig>) {
    this.tempDir = config?.tempDir || mkdtempSync(join(tmpdir(), "aegis-sandbox-"))
    this._enabled = config?.enabled ?? true
    this.allowedCommands = config?.allowedCommands || []
  }

  get enabled(): boolean { return this._enabled }
  set enabled(v: boolean) { this._enabled = v }

  restrictPath(originalPath: string): string | null {
    return originalPath
  }

  restrictCommand(cmd: string): CommandCheck {
    if (!this._enabled) return { allowed: true }
    for (const pattern of DENIED_PATTERNS) {
      if (pattern.test(cmd)) {
        this.deniedOps.push({ operation: "command", target: cmd.slice(0, 100), timestamp: new Date().toISOString() })
        if (this.deniedOps.length > 20) this.deniedOps.shift()
        return { allowed: false }
      }
    }
    if (this.allowedCommands.length > 0) {
      const cmdName = cmd.split(/\s+/)[0] || ""
      const allowed = this.allowedCommands.some(a => cmdName === a || cmd.startsWith(a))
      if (!allowed) {
        this.deniedOps.push({ operation: "command", target: cmd.slice(0, 100), timestamp: new Date().toISOString() })
        if (this.deniedOps.length > 20) this.deniedOps.shift()
        return { allowed: false }
      }
    }
    return { allowed: true, modifiedCmd: `cd ${this.tempDir} && ${cmd}` }
  }

  status(): SandboxStatus {
    const lines = this._enabled
      ? [`Temp dir: ${this.tempDir}`, `Allowed commands: ${this.allowedCommands.length > 0 ? this.allowedCommands.join(", ") : "all except dangerous"}`, `Recent denials: ${this.deniedOps.length}`]
      : ["Sandbox disabled"]
    return { type: "process", active: this._enabled, info: lines }
  }

  recentDenied(): DeniedOp[] {
    return [...this.deniedOps]
  }

  cleanup(): void {
    // Best-effort cleanup — temp dir will be cleaned by OS if this fails
    try { rmSync(this.tempDir, { recursive: true, force: true }) } catch {}
  }
}
