import { describe, it, expect } from "bun:test"
import { buildConfig } from "./config"

describe("buildConfig", () => {
  it("builds a valid config from URL", () => {
    const config = buildConfig({ url: "https://example.com/docs" })
    expect(config.url).toBe("https://example.com/docs")
    expect(config.mode).toBe("qa")
    expect(config.depth).toBe(2)
    expect(config.limit).toBe(50)
    expect(config.writeFiles).toBe(true)
    expect(config.writeKg).toBe(true)
  })

  it("detects site name from URL", () => {
    const config = buildConfig({ url: "https://fastapi.tiangolo.com" })
    expect(config.name).toBe("fastapi.tiangolo.com")
  })

  it("strips www from site name", () => {
    const config = buildConfig({ url: "https://www.example.com/docs" })
    expect(config.name).toBe("example.com")
  })

  it("respects explicit mode", () => {
    const config = buildConfig({ url: "https://example.com", mode: "kg" })
    expect(config.mode).toBe("kg")
  })

  it("respects custom output dir", () => {
    const config = buildConfig({ url: "https://example.com", output: "/custom/path" })
    expect(config.outputDir).toBe("/custom/path")
  })

  it("handles noFiles flag", () => {
    const config = buildConfig({ url: "https://example.com", noFiles: true })
    expect(config.writeFiles).toBe(false)
  })

  it("handles noKg flag", () => {
    const config = buildConfig({ url: "https://example.com", noKg: true })
    expect(config.writeKg).toBe(false)
  })

  it("builds config for local path", () => {
    const config = buildConfig({ path: "./docs" })
    expect(config.path).toBe("./docs")
    expect(config.name).toBe("docs")
  })
})
