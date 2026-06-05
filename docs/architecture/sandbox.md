---
title: Sandbox System Architecture
description: Aegis sandbox architecture — FilesystemSandbox, ProcessSandbox, and DockerSandbox isolation layers
---

# Sandbox System Architecture

> **Last updated:** May 2026  
> **Module:** `src/sandbox/`  
> **Key exports:** `FilesystemSandbox`, `ProcessSandbox`, `DockerSandbox`

## Overview

The sandbox system provides three levels of execution isolation for agent-operated commands and file access. Each sandbox implements the common `Sandbox` interface.

```
Sandbox interface
├── FilesystemSandbox — Path access restrictions
├── ProcessSandbox   — Command blacklist/whitelist + temp directory
└── DockerSandbox    — Full container isolation
```

## Common Interface

```typescript
interface Sandbox {
  readonly name: string
  restrictPath(originalPath: string): string | null    // null = denied
  restrictCommand(cmd: string): CommandCheck            // { allowed, modifiedCmd? }
  status(): SandboxStatus                               // { type, active, info[] }
}
```

## Sandbox Config

```typescript
import { SandboxConfig } from "../sandbox"

const config: SandboxConfig = {
  enabled: true,
  type: "filesystem",     // "none" | "filesystem" | "process" | "docker"
  allowedPaths: ["/workspace/src"],
  allowedCommands: ["npm", "git", "node"],
  tempDir: "/tmp/aegis-sandbox",
  dockerImage: "node:20-slim",
}
```

## FilesystemSandbox

Restricts file path access to a set of allowed directories:

```typescript
import { FilesystemSandbox } from "../sandbox"

const sandbox = new FilesystemSandbox({
  allowedPaths: ["/workspace/project"],
  enabled: true,
})

// Check path access
const path = sandbox.restrictPath("/workspace/project/src/index.ts")
// Returns the path if allowed, null if denied

const denied = sandbox.restrictPath("/etc/passwd")
// null — denied

// Denials are tracked
const recentDenials = sandbox.recentDenied()
// [{ operation: "path_access", target: "/etc/passwd", timestamp: "..." }]

// Status
console.log(sandbox.status())
// { type: "filesystem", active: true, info: ["Allowed paths: /workspace/project", "Recent denials: 1"] }
```

Default allowed path: `process.cwd()` (the project root).

## ProcessSandbox

Applies command restrictions and optionally rewrites commands to run in a temp directory:

```typescript
import { ProcessSandbox } from "../sandbox"

const sandbox = new ProcessSandbox({
  tempDir: "/tmp/aegis-sandbox-xyz",
  allowedCommands: ["npm", "git"],   // empty = all except dangerous
  enabled: true,
})
```

**Built-in command blacklist** (always blocked when enabled):

| Pattern | Risk |
|---------|------|
| `rm -rf /` or `rm -rf /*` | Destructive deletion |
| `mkfs*` | Filesystem corruption |
| `dd if=/dev/*` | Disk destruction |
| `:(){ ... };:` | Fork bomb |
| `wget` / `curl` | Network exfiltration |
| `nc` | Network tunneling |
| `chmod 777` | Permission weakening |
| `sudo` | Privilege escalation |

Command rewriting: allowed commands are automatically prefixed with `cd {tempDir} &&` to ensure they run in the sandbox directory.

## DockerSandbox

Full container isolation using Docker:

```typescript
import { DockerSandbox } from "../sandbox"

const sandbox = new DockerSandbox({
  dockerImage: "ubuntu:22.04",
  enabled: true,
})
```

**Behavior:**
1. Checks Docker availability via `docker info` on construction
2. On first `restrictCommand()`, starts a container: `docker run -d --rm -v {cwd}:/workspace -w /workspace {image} tail -f /dev/null`
3. Rewrites commands as `docker exec {containerId} sh -c '{cmd}'`
4. Does not restrict file paths (container has its own filesystem)
5. Cleans up the container on `cleanup()`

## Configuration

The sandbox module is configured via the config system (`src/config.ts`):

```typescript
{
  sandbox: {
    enabled: true,
    type: "filesystem",   // "none", "filesystem", "process", "docker"
  }
}
```

The sandbox is integrated with the agent tool system — tool execution checks with the active sandbox before running bash commands or accessing files.

## Testing

Tests in `src/sandbox/test-*.ts` cover all three sandbox implementations with path restriction, command blocking, status reporting, and edge cases.
