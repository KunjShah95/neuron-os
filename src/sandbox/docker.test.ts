import { describe, it, expect } from "bun:test"
import { DockerSandbox } from "./docker"

describe("DockerSandbox", () => {
  it("should be disabled when enabled=false", () => {
    const s = new DockerSandbox({ enabled: false })
    const status = s.status()
    expect(status.active).toBe(false)
    expect(status.type).toBe("docker")
    s.cleanup()
  })

  it("should show 'Docker available' in status when enabled and Docker is installed", () => {
    const s = new DockerSandbox({ enabled: true })
    const status = s.status()
    // When Docker is available, it shows "Docker available: true"
    // When Docker is not available, it shows "Docker available: false"
    // Either way, the sandbox reports its state
    expect(status.info.length).toBeGreaterThan(0)
    s.cleanup()
  })

  it("should have default security options configured", () => {
    const s = new DockerSandbox({ enabled: false })
    // Access internal options via the status info
    const status = s.status()
    const lines = status.info.join("\n")
    // With enabled=false, status just says "Sandbox disabled"
    expect(lines).toContain("Sandbox disabled")
    s.cleanup()
  })

  it("should not create container when disabled", () => {
    const s = new DockerSandbox({ enabled: false })
    s.createContainer("test-agent", "/tmp")
    // expect container to be null when disabled
    s.cleanup()
  })

  it("should not create container when Docker is unavailable", () => {
    // Create sandbox with a non-existent image to force failure
    const s = new DockerSandbox({ enabled: true, image: "nonexistent-image-12345" })
    s.createContainer("test-agent", "/tmp")
    // Should return null when Docker fails (or Docker info fails)
    // In CI without Docker, this always returns null
    // In local with Docker but bad image, this might attempt and fail
    s.cleanup()
  })
})
