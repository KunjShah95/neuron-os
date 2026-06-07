import { mkdirSync, writeFileSync, existsSync, readdirSync as fsReaddirSync } from "node:fs"
import { resolve } from "node:path"
import { randomUUID } from "node:crypto"
import { execSync } from "node:child_process"
import type { SandboxConfig, SandboxSnapshot, SandboxPolicy, TestCase } from "./types"
import { SandboxPolicyManager } from "./sandbox-policy"

const POLICY_MANAGER = new SandboxPolicyManager()

export type SandboxHandle = {
  id: string
  workDir: string
  config: SandboxConfig
  createdAt: number
}

export class HarnessSandboxManager {
  private activeSandboxes: Map<string, SandboxHandle> = new Map()

  /**
   * Create a sandbox for a test case.
   * Applies fixtures + setup commands, then returns a handle.
   */
  async create(test: TestCase, config?: Partial<SandboxConfig>): Promise<SandboxHandle> {
    const policy = POLICY_MANAGER.resolve(test.tags)
    const type = config?.type ?? "filesystem"
    const workDir = resolve(
      process.cwd(),
      ".aegis/sandboxes",
      `test-${test.id || randomUUID().slice(0, 8)}-${Date.now().toString(36)}`,
    )

    // Create working directory
    mkdirSync(workDir, { recursive: true })

    // Write setup files
    if (test.setup?.files) {
      for (const [filePath, content] of Object.entries(test.setup.files)) {
        const fullPath = resolve(workDir, filePath)
        mkdirSync(resolve(fullPath, ".."), { recursive: true })
        writeFileSync(fullPath, content, "utf-8")
      }
    }

    // Run setup commands
    if (test.setup?.commands) {
      for (const cmd of test.setup.commands) {
        if (POLICY_MANAGER.isCommandAllowed(policy, cmd)) {
          try {
            execSync(cmd, { cwd: workDir, timeout: 30000, stdio: "pipe" })
          } catch {
            // Setup command failures are non-fatal
          }
        }
      }
    }

    const handle: SandboxHandle = {
      id: `sandbox-${randomUUID().slice(0, 8)}`,
      workDir,
      config: {
        type,
        workDir,
        keepAfterTest: config?.keepAfterTest ?? false,
        timeout: config?.timeout ?? test.timeout,
      },
      createdAt: Date.now(),
    }

    this.activeSandboxes.set(handle.id, handle)
    return handle
  }

  /**
   * Capture filesystem snapshot for comparison.
   */
  async snapshot(handle: SandboxHandle): Promise<SandboxSnapshot> {
    const before = this.listFiles(handle.workDir)

    return {
      before,
      after: before,
      created: [],
      modified: [],
      deleted: [],
    }
  }

  /**
   * Take a full before/after snapshot.
   */
  async snapshotDiff(handle: SandboxHandle): Promise<SandboxSnapshot> {
    const after = this.listFiles(handle.workDir)
    const before = this.getBaselineFiles(handle.id) ?? []

    const created = after.filter(f => !before.includes(f))
    const deleted = before.filter(f => !after.includes(f))

    let gitDiff: string | undefined
    try {
      gitDiff = execSync("git diff", { cwd: handle.workDir, encoding: "utf8", timeout: 5000 }).trim()
    } catch {
      // Not a git repo or git not available
    }

    return {
      before,
      after,
      created,
      deleted,
      modified: created.filter(f => {
        // Files that exist in both but may have changed content
        return before.includes(f) && after.includes(f)
      }),
      gitDiff: gitDiff || undefined,
    }
  }

  /**
   * Store a baseline snapshot (taken before agent execution).
   */
  storeBaseline(handle: SandboxHandle, snapshot: SandboxSnapshot): void {
    this._baselines.set(handle.id, snapshot.before)
  }

  /**
   * Clean up sandbox directory.
   */
  async cleanup(handle: SandboxHandle): Promise<void> {
    if (handle.config.keepAfterTest) return

    try {
      if (existsSync(handle.workDir)) {
        execSync(`rm -rf "${handle.workDir}"`, { timeout: 5000 })
      }
    } catch {
      // Non-fatal
    }
    this.activeSandboxes.delete(handle.id)
    this._baselines.delete(handle.id)
  }

  /**
   * Get the policy for a test's sandbox.
   */
  getPolicy(test: TestCase): SandboxPolicy {
    return POLICY_MANAGER.resolve(test.tags)
  }

  /**
   * Scan test output for secrets based on policy.
   */
  scanForSecrets(test: TestCase, output: string): string[] {
    const policy = this.getPolicy(test)
    return POLICY_MANAGER.detectSecrets(policy, output)
  }

  // ── Private ──────────────────────────────────────────────────

  private _baselines = new Map<string, string[]>()

  private getBaselineFiles(handleId: string): string[] | undefined {
    return this._baselines.get(handleId)
  }

  private listFiles(dir: string): string[] {
    const files: string[] = []
    try {
      const entries = fsReaddirSync(dir, { withFileTypes: true, recursive: true })
      for (const entry of entries) {
        if (entry.isFile()) {
          files.push(entry.name)
        }
      }
    } catch {
      // Directory may not exist or be accessible
    }
    return files
  }
}
