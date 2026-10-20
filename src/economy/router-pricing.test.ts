import { describe, it, expect, afterEach } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { stringify } from "yaml"

import { resolveModelProvider } from "./model-router"
import { DEFAULT_PRICING, loadPricing, refreshPricing, invalidateCache, getPricingLoadError } from "./pricing-registry"
import { listProviders } from "../ai/providers"

describe("resolveModelProvider — namespaced model ids", () => {
  it("resolves a namespaced Groq/OpenRouter id to its real provider", () => {
    expect(resolveModelProvider("meta-llama/llama-3.1-70b-instruct:free")).toBe("openrouter")
  })

  it("resolves a namespaced NVIDIA id to nvidia", () => {
    expect(resolveModelProvider("meta/llama-3.1-70b-instruct")).toBe("nvidia")
    expect(resolveModelProvider("mistralai/mixtral-8x22b-instruct-v0.1")).toBe("nvidia")
  })

  it("never resolves a namespaced registry model to the openai provider", () => {
    const namespaced = [
      "meta-llama/llama-3.1-70b-instruct:free",
      "mistralai/mixtral-8x22b-instruct-v0.1",
      "meta/llama-3.1-70b-instruct",
      "meta/llama-3.1-8b-instruct",
    ]
    for (const model of namespaced) {
      expect(resolveModelProvider(model)).not.toBe("openai")
    }
  })

  it("resolves every model in the default registry to a registered provider", () => {
    const registered = listProviders()
    for (const model of Object.keys(DEFAULT_PRICING.models)) {
      const provider = resolveModelProvider(model)
      expect(registered).toContain(provider)
    }
  })
})

describe("pricing registry fallback visibility", () => {
  const tempRoots: string[] = []

  afterEach(() => {
    invalidateCache()
    for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true })
    tempRoots.length = 0
  })

  function withTempHome(fn: (home: string) => void): void {
    const home = mkdtempSync(join(tmpdir(), "aegis-pricing-"))
    tempRoots.push(home)
    const originalHome = process.env.HOME
    const originalUserProfile = process.env.USERPROFILE
    process.env.HOME = home
    process.env.USERPROFILE = home
    try {
      fn(home)
    } finally {
      if (originalHome === undefined) delete process.env.HOME
      else process.env.HOME = originalHome
      if (originalUserProfile === undefined) delete process.env.USERPROFILE
      else process.env.USERPROFILE = originalUserProfile
      invalidateCache()
    }
  }

  it("exposes no load error when the config is absent", () => {
    withTempHome(() => {
      invalidateCache()
      const pricing = loadPricing()
      expect(pricing).toBeDefined()
      expect(getPricingLoadError()).toBeNull()
    })
  })

  it("reports a load error and falls back to the defaults when the config is invalid", () => {
    withTempHome((home) => {
      const aegisDir = join(home, ".aegis")
      mkdirSync(aegisDir, { recursive: true })
      writeFileSync(join(aegisDir, "tool_pricing.yaml"), "tools: 12\nmodels: not-an-object\n", "utf-8")

      invalidateCache()
      const pricing = loadPricing()

      expect(getPricingLoadError()).not.toBeNull()
      expect(getPricingLoadError()).toContain("tool_pricing.yaml")
      expect(pricing).toBe(DEFAULT_PRICING)
    })
  })

  it("does not report a load error when the config is valid", () => {
    withTempHome((home) => {
      const aegisDir = join(home, ".aegis")
      mkdirSync(aegisDir, { recursive: true })
      writeFileSync(join(aegisDir, "tool_pricing.yaml"), stringify(DEFAULT_PRICING), "utf-8")

      invalidateCache()
      loadPricing()

      expect(getPricingLoadError()).toBeNull()
    })
  })
})
