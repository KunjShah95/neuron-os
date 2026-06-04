import type { Sandbox, SandboxConfig, SandboxStatus, CommandCheck } from "./types"
import { execSync } from "node:child_process"

export class DockerSandbox implements Sandbox {
  readonly name = "docker"
  private image: string
  private _enabled: boolean
  private containerId: string | null = null
  private dockerAvailable: boolean

  constructor(config?: Partial<SandboxConfig>) {
    this.image = config?.dockerImage || "ubuntu:22.04"
    this._enabled = config?.enabled ?? true
    this.dockerAvailable = this.checkDocker()
  }

  get enabled(): boolean { return this._enabled }
  set enabled(v: boolean) { this._enabled = v }

  private checkDocker(): boolean {
    try {
      execSync("docker info", { stdio: "ignore", timeout: 3000 })
      return true
    } catch {
      return false
    }
  }

  restrictPath(originalPath: string): string | null {
    if (!this._enabled) return originalPath
    return originalPath
  }

  restrictCommand(cmd: string): CommandCheck {
    if (!this._enabled || !this.dockerAvailable) return { allowed: true }
    if (!this.containerId) {
      try {
        const id = execSync(
          `docker run -d --rm -v "${process.cwd()}:/workspace" -w /workspace ${this.image} tail -f /dev/null`,
          { timeout: 10000 }
        ).toString().trim()
        this.containerId = id
      } catch {
        this.dockerAvailable = false
        return { allowed: true, modifiedCmd: cmd }
      }
    }
    return { allowed: true, modifiedCmd: `docker exec ${this.containerId} sh -c ${JSON.stringify(cmd)}` }
  }

  status(): SandboxStatus {
    const lines = this._enabled
      ? [`Docker available: ${this.dockerAvailable}`, `Image: ${this.image}`, `Container: ${this.containerId || "not started"}`]
      : ["Sandbox disabled"]
    return { type: "docker", active: this._enabled && this.dockerAvailable, info: lines }
  }

  cleanup(): void {
    if (this.containerId) {
      // Best-effort cleanup — container may already be removed
      try { execSync(`docker rm -f ${this.containerId}`, { stdio: "ignore" }) } catch {}
      this.containerId = null
    }
  }
}
