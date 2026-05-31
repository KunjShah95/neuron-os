export type SandboxType = "none" | "filesystem" | "process" | "docker"

export interface SandboxConfig {
  enabled: boolean
  type: SandboxType
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
