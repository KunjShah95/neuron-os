export type SandboxType = "none" | "filesystem" | "process" | "docker"

/**
 * Isolation level determines the security posture for an agent type.
 * - "none": no sandbox (trusted, local-only agents)
 * - "process": process-level isolation (default, Bun child process)
 * - "container": container-level isolation (Docker, zero-trust)
 */
export type IsolationLevel = "none" | "process" | "container"

export interface SandboxConfig {
  enabled: boolean
  type: SandboxType
  isolationLevel?: IsolationLevel
  allowedPaths?: string[]
  allowedCommands?: string[]
  tempDir?: string
  dockerImage?: string
}

export interface SandboxStatus {
  type: SandboxType
  active: boolean
  info: string[]
}

export interface CommandCheck {
  allowed: boolean
  modifiedCmd?: string
}

export interface DeniedOp {
  operation: string
  target: string
  timestamp: string
}

export interface Sandbox {
  readonly name: string
  restrictPath(originalPath: string): string | null
  restrictCommand(cmd: string): CommandCheck
  status(): SandboxStatus
}
