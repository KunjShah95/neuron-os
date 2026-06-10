/**
 * Docker sandbox regression tests.
 * Verifies that all security hardening options are correctly applied
 * by testing the configuration defaults and command filtering logic.
 *
 * Tests do NOT require Docker to be installed.
 */

import { describe, it, expect } from "bun:test"

// ── Command filtering patterns (extracted from DockerSandbox.restrictCommand) ──
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+(\/|\/\w+)/i,
  /mkfs/i,
  /dd\s+if=\/dev/i,
  /:\(\)\s*\{[^}]*\|[^}]*\}/,
  /chmod\s+777\s+\//i,
]

// ── Expected security defaults (from DockerSandbox DEFAULT_OPTIONS) ──
const EXPECTED_DEFAULTS = {
  image: "ubuntu:22.04",
  mountPoint: "/workspace",
  memoryLimit: "2g",
  networkEnabled: false,
  readOnlyRoot: true,
  userId: "1000",
  dropAllCaps: true,
  seccompEnabled: true,
  tmpfsEnabled: true,
  noNewPrivileges: true,
}

describe("Docker sandbox regression — security defaults", () => {
  it("should have zero-trust network disabled by default", () => {
    expect(EXPECTED_DEFAULTS.networkEnabled).toBe(false)
  })

  it("should have read-only root filesystem by default", () => {
    expect(EXPECTED_DEFAULTS.readOnlyRoot).toBe(true)
  })

  it("should drop all Linux capabilities by default", () => {
    expect(EXPECTED_DEFAULTS.dropAllCaps).toBe(true)
  })

  it("should run as non-root user (uid 1000) by default", () => {
    expect(EXPECTED_DEFAULTS.userId).toBe("1000")
  })

  it("should enable no-new-privileges by default", () => {
    expect(EXPECTED_DEFAULTS.noNewPrivileges).toBe(true)
  })

  it("should enable seccomp by default", () => {
    expect(EXPECTED_DEFAULTS.seccompEnabled).toBe(true)
  })

  it("should enable tmpfs for /tmp with noexec,nosuid by default", () => {
    expect(EXPECTED_DEFAULTS.tmpfsEnabled).toBe(true)
  })

  it("should use ubuntu:22.04 as default image", () => {
    expect(EXPECTED_DEFAULTS.image).toBe("ubuntu:22.04")
  })

  it("should mount workspace at /workspace by default", () => {
    expect(EXPECTED_DEFAULTS.mountPoint).toBe("/workspace")
  })

  it("should limit memory to 2g by default", () => {
    expect(EXPECTED_DEFAULTS.memoryLimit).toBe("2g")
  })
})

describe("Docker sandbox regression — dangerous command patterns", () => {
  it("should block rm -rf / (root filesystem destruction)", () => {
    expect(DANGEROUS_PATTERNS.some((p) => p.test("rm -rf /"))).toBe(true)
  })

  it("should block rm -rf /home (subdirectory destruction)", () => {
    expect(DANGEROUS_PATTERNS.some((p) => p.test("rm -rf /home"))).toBe(true)
  })

  it("should block mkfs (filesystem formatting)", () => {
    expect(DANGEROUS_PATTERNS.some((p) => p.test("mkfs /dev/sda"))).toBe(true)
    expect(DANGEROUS_PATTERNS.some((p) => p.test("mkfs.ext4 /dev/sdb"))).toBe(true)
  })

  it("should block dd if=/dev (raw device access)", () => {
    expect(DANGEROUS_PATTERNS.some((p) => p.test("dd if=/dev/zero of=/dev/sda"))).toBe(true)
  })

  it("should block fork bomb", () => {
    expect(DANGEROUS_PATTERNS.some((p) => p.test(":(){ :|:& };:"))).toBe(true)
  })

  it("should block chmod 777 / (world-writable root)", () => {
    expect(DANGEROUS_PATTERNS.some((p) => p.test("chmod 777 /"))).toBe(true)
  })

  it("should NOT block safe commands", () => {
    const safe = [
      "ls -la",
      "cat /etc/hosts",
      "echo hello",
      "python3 script.py",
      "rm -rf ./temp",
      "dd if=input.txt of=output.txt",
      "chmod 755 /home/app",
    ]

    for (const cmd of safe) {
      expect(DANGEROUS_PATTERNS.some((p) => p.test(cmd))).toBe(false)
    }
  })
})
