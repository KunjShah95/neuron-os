import type { Sandbox, SandboxConfig, SandboxStatus, CommandCheck, DeniedOp } from "./types"
import { execSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createLogger } from "../cli/logger"

const log = createLogger("sandbox:docker")

export interface DockerSandboxOptions {
  /** Docker image to use (default: "ubuntu:22.04") */
  image?: string
  /** Workspace mount path inside container (default: "/workspace") */
  mountPoint?: string
  /** CPU limit (default: no limit) */
  cpuLimit?: string
  /** Memory limit (default: "2g") */
  memoryLimit?: string
  /** Network access (default: false — zero-trust: no network by default) */
  networkEnabled?: boolean
  /** Read-only filesystem (default: true) */
  readOnlyRoot?: boolean
  /** User ID to run as inside container (default: 1000) */
  userId?: string
  /** Additional Docker run args */
  extraArgs?: string[]
}

const DEFAULT_OPTIONS: Required<DockerSandboxOptions> = {
  image: "ubuntu:22.04",
  mountPoint: "/workspace",
  cpuLimit: "",
  memoryLimit: "2g",
  networkEnabled: false,
  readOnlyRoot: true,
  userId: "1000",
  extraArgs: [],
}

export class DockerSandbox implements Sandbox {
  readonly name = "docker"
  private options: Required<DockerSandboxOptions>
  private _enabled: boolean
  private containers = new Map<string, { containerId: string; createdAt: number }>()
  private dockerAvailable: boolean
  private deniedOps: DeniedOp[] = []

  constructor(config?: Partial<SandboxConfig & DockerSandboxOptions>) {
    this.options = {
      image: config?.dockerImage || config?.image || DEFAULT_OPTIONS.image,
      mountPoint: config?.mountPoint || DEFAULT_OPTIONS.mountPoint,
      cpuLimit: config?.cpuLimit || DEFAULT_OPTIONS.cpuLimit,
      memoryLimit: config?.memoryLimit || DEFAULT_OPTIONS.memoryLimit,
      networkEnabled: config?.networkEnabled ?? DEFAULT_OPTIONS.networkEnabled,
      readOnlyRoot: config?.readOnlyRoot ?? DEFAULT_OPTIONS.readOnlyRoot,
      userId: config?.userId || DEFAULT_OPTIONS.userId,
      extraArgs: config?.extraArgs || DEFAULT_OPTIONS.extraArgs,
    }
    this._enabled = config?.enabled ?? true
    this.dockerAvailable = this.checkDocker()
  }

  get enabled(): boolean { return this._enabled }
  set enabled(v: boolean) { this._enabled = v }

  private checkDocker(): boolean {
    try {
      execSync("docker info", { stdio: "ignore", timeout: 5000 })
      return true
    } catch {
      return false
    }
  }

  /**
   * Create an isolated container for an agent.
   * Returns the container ID.
   */
  createContainer(agentId: string, cwd: string): { containerId: string } | null {
    if (!this._enabled || !this.dockerAvailable) return null

    const id = `aegis-sandbox-${agentId}-${randomUUID().slice(0, 8)}`
    const { image, mountPoint, cpuLimit, memoryLimit, networkEnabled, readOnlyRoot, userId, extraArgs } = this.options

    try {
      const args = [
        "run", "-d",
        "--rm",
        "--name", id,
        `--user`, userId,
        `--workdir`, mountPoint,
        `--volume`, `${cwd}:${mountPoint}`,
        ...(readOnlyRoot ? [`--read-only`] : []),
        ...(memoryLimit ? [`--memory`, memoryLimit] : []),
        ...(cpuLimit ? [`--cpus`, cpuLimit] : []),
        ...(networkEnabled ? [] : [`--network`, `none`]),
        ...extraArgs,
        image,
        "tail", "-f", "/dev/null",
      ].filter(Boolean)

      const containerId = execSync(`docker ${args.join(" ")}`, {
        timeout: 30000,
        encoding: "utf8",
      }).trim()

      this.containers.set(agentId, { containerId, createdAt: Date.now() })
      log.info("Created Docker sandbox container", { agentId, containerId })
      return { containerId }
    } catch (err) {
      this.dockerAvailable = false
      log.error("Failed to create Docker sandbox container", { agentId, error: String(err) })
      return null
    }
  }

  /**
   * Remove a container for an agent.
   */
  destroyContainer(agentId: string): void {
    const entry = this.containers.get(agentId)
    if (!entry) return

    try {
      execSync(`docker rm -f ${entry.containerId}`, { stdio: "ignore", timeout: 10000 })
    } catch {
      // Container may already be removed
    }
    this.containers.delete(agentId)
    log.info("Destroyed Docker sandbox container", { agentId, containerId: entry.containerId })
  }

  /**
   * Execute a command inside the agent's container.
   */
  execInContainer(agentId: string, cmd: string): { output: string; exitCode: number } | null {
    const entry = this.containers.get(agentId)
    if (!entry) return null

    try {
      const result = execSync(
        `docker exec ${entry.containerId} sh -c ${JSON.stringify(cmd)}`,
        { timeout: 60000, encoding: "utf8", stdio: "pipe" },
      )
      return { output: result.trim(), exitCode: 0 }
    } catch (err: any) {
      const output = err.stdout?.toString()?.trim() || err.message || ""
      const exitCode = err.status ?? 1
      return { output, exitCode }
    }
  }

  restrictPath(originalPath: string): string | null {
    if (!this._enabled) return originalPath
    return originalPath
  }

  restrictCommand(cmd: string): CommandCheck {
    if (!this._enabled || !this.dockerAvailable) return { allowed: true }

    // Check for dangerous patterns at the sandbox level
    const dangerousPatterns = [
      /rm\s+-rf\s+(\/|\/\w+)/i,
      /mkfs/i,
      /dd\s+if=\/dev/i,
      /:\s*\(\)\s*\{.*:\s*\(\)\s*;?\};?\s*:/,
      /chmod\s+777\s+\//i,
    ]

    for (const pattern of dangerousPatterns) {
      if (pattern.test(cmd)) {
        this.deniedOps.push({
          operation: "command",
          target: cmd.slice(0, 100),
          timestamp: new Date().toISOString(),
        })
        if (this.deniedOps.length > 20) this.deniedOps.shift()
        return { allowed: false }
      }
    }

    return { allowed: true }
  }

  status(): SandboxStatus {
    const lines = this._enabled
      ? [
          `Docker available: ${this.dockerAvailable}`,
          `Image: ${this.options.image}`,
          `Containers: ${this.containers.size} active`,
          `Network: ${this.options.networkEnabled ? "enabled" : "disabled (zero-trust)"}`,
          `Memory limit: ${this.options.memoryLimit}`,
          `Read-only root: ${this.options.readOnlyRoot}`,
          ...Array.from(this.containers.entries()).map(
            ([agentId, entry]) => `  ${agentId}: ${entry.containerId}`,
          ),
        ]
      : ["Sandbox disabled"]
    return {
      type: "docker",
      active: this._enabled && this.dockerAvailable,
      info: lines,
    }
  }

  recentDenied(): DeniedOp[] {
    return [...this.deniedOps]
  }

  cleanup(): void {
    for (const [agentId] of this.containers) {
      this.destroyContainer(agentId)
    }
  }
}
