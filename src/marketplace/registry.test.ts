import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { MarketplaceRegistry } from "./registry"
import { MarketplaceSearch } from "./search"
import { validateAgentConfig } from "./schema"
import type { AgentConfig } from "./types"

const TEST_CONFIG: AgentConfig = {
  name: "test-agent",
  type: "coder",
  description: "A test agent for unit testing the marketplace",
  tools: [{ name: "file_read" }, { name: "shell_exec" }],
  prompt_template: "You are a test agent. Be concise.",
  budget_usd: 0.05,
  sandbox: "local",
  provider: "openai",
  tags: ["test", "example"],
}

const TEST_CONFIG_2: AgentConfig = {
  name: "review-agent",
  type: "reviewer",
  description: "Code review agent that checks for bugs and style issues",
  tools: [{ name: "file_read" }],
  prompt_template: "You are a code reviewer. Find bugs and suggest improvements.",
  budget_usd: 0.1,
  sandbox: "docker",
  provider: "anthropic",
  tags: ["review", "code-quality"],
}

describe("AgentConfigSchema", () => {
  it("should validate a correct config", () => {
    const result = validateAgentConfig(TEST_CONFIG)
    expect(result.success).toBe(true)
    expect(result.config).toBeDefined()
    expect(result.config!.name).toBe("test-agent")
  })

  it("should reject empty name", () => {
    const result = validateAgentConfig({ ...TEST_CONFIG, name: "" })
    expect(result.success).toBe(false)
    expect(result.errors!.length).toBeGreaterThan(0)
  })

  it("should reject invalid name format", () => {
    const result = validateAgentConfig({ ...TEST_CONFIG, name: "Invalid Name!" })
    expect(result.success).toBe(false)
  })

  it("should reject short description", () => {
    const result = validateAgentConfig({ ...TEST_CONFIG, description: "short" })
    expect(result.success).toBe(false)
  })

  it("should reject negative budget", () => {
    const result = validateAgentConfig({ ...TEST_CONFIG, budget_usd: -1 })
    expect(result.success).toBe(false)
  })

  it("should apply defaults for optional fields", () => {
    const result = validateAgentConfig({
      name: "minimal-agent",
      description: "Minimal agent with only required fields for testing",
      prompt_template: "Hello",
    })
    expect(result.success).toBe(true)
    expect(result.config!.type).toBe("custom")
    expect(result.config!.sandbox).toBe("none")
    expect(result.config!.provider).toBe("local")
    expect(result.config!.budget_usd).toBe(0.1)
  })
})

describe("MarketplaceRegistry", () => {
  let tmpDir: string
  let registry: MarketplaceRegistry

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "marketplace-test-"))
    registry = new MarketplaceRegistry(join(tmpDir, "registry.db"))
  })

  afterAll(() => {
    registry.close()
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // Windows may hold file lock momentarily
    }
  })

  it("should publish an agent", () => {
    const entry = registry.publish(TEST_CONFIG, "1.0.0", "test-author")
    expect(entry.config.name).toBe("test-agent")
    expect(entry.version).toBe("1.0.0")
    expect(entry.author).toBe("test-author")
    expect(entry.installCount).toBe(0)
  })

  it("should get an agent by name", () => {
    const entry = registry.get("test-agent")
    expect(entry).toBeDefined()
    expect(entry!.config.name).toBe("test-agent")
    expect(entry!.version).toBe("1.0.0")
  })

  it("should get a specific version", () => {
    const entry = registry.get("test-agent", "1.0.0")
    expect(entry).toBeDefined()
    expect(entry!.version).toBe("1.0.0")
  })

  it("should return undefined for unknown agent", () => {
    expect(registry.get("nonexistent")).toBeUndefined()
  })

  it("should publish multiple agents", () => {
    registry.publish(TEST_CONFIG_2, "1.0.0", "reviewer-author")
    const result = registry.list()
    expect(result.total).toBeGreaterThanOrEqual(2)
  })

  it("should search agents", () => {
    const result = registry.search("test")
    expect(result.entries.length).toBeGreaterThanOrEqual(1)
    expect(result.entries.some((e) => e.config.name === "test-agent")).toBe(true)
  })

  it("should filter by type", () => {
    const result = registry.list({ type: "reviewer" })
    expect(result.entries.every((e) => e.config.type === "reviewer")).toBe(true)
  })

  it("should filter by provider", () => {
    const result = registry.list({ provider: "anthropic" })
    expect(result.entries.every((e) => e.config.provider === "anthropic")).toBe(true)
  })

  it("should paginate results", () => {
    const result = registry.list({ pageSize: 1, page: 0 })
    expect(result.entries.length).toBe(1)
    expect(result.pageSize).toBe(1)
    expect(result.totalPages).toBeGreaterThanOrEqual(1)
  })

  it("should rate an agent", () => {
    registry.rate("test-agent", "1.0.0", 4)
    registry.rate("test-agent", "1.0.0", 5)
    const entry = registry.get("test-agent")
    expect(entry).toBeDefined()
    expect(entry!.rating.count).toBe(2)
    expect(entry!.rating.average).toBe(4.5)
  })

  it("should reject invalid star rating", () => {
    expect(() => registry.rate("test-agent", "1.0.0", 0)).toThrow()
    expect(() => registry.rate("test-agent", "1.0.0", 6)).toThrow()
  })

  it("should increment install count", () => {
    registry.incrementInstalls("test-agent", "1.0.0")
    registry.incrementInstalls("test-agent", "1.0.0")
    const entry = registry.get("test-agent")
    expect(entry!.installCount).toBe(2)
  })

  it("should mark agent as installed", () => {
    registry.markInstalled("test-agent", "1.0.0")
    const installed = registry.getInstalled()
    expect(installed.some((e) => e.config.name === "test-agent")).toBe(true)
  })

  it("should mark agent as uninstalled", () => {
    registry.markUninstalled("test-agent")
    const installed = registry.getInstalled()
    expect(installed.some((e) => e.config.name === "test-agent")).toBe(false)
  })

  it("should get all versions of an agent", () => {
    registry.publish({ ...TEST_CONFIG, description: "Updated test agent v2" }, "2.0.0", "test-author")
    const versions = registry.getVersions("test-agent")
    expect(versions.length).toBeGreaterThanOrEqual(2)
    expect(versions.some((e) => e.version === "1.0.0")).toBe(true)
    expect(versions.some((e) => e.version === "2.0.0")).toBe(true)
  })

  it("should remove an agent", () => {
    registry.remove("test-agent")
    expect(registry.get("test-agent")).toBeUndefined()
  })
})

describe("MarketplaceSearch", () => {
  let tmpDir: string
  let registry: MarketplaceRegistry
  let search: MarketplaceSearch

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "marketplace-search-test-"))
    registry = new MarketplaceRegistry(join(tmpDir, "registry.db"))
    search = new MarketplaceSearch(registry)

    registry.publish(TEST_CONFIG, "1.0.0", "author1")
    registry.publish(TEST_CONFIG_2, "1.0.0", "author2")
    registry.publish(
      {
        name: "planner-agent",
        type: "planner",
        description: "Project planning and task decomposition agent",
        tools: [],
        prompt_template: "You plan projects.",
        budget_usd: 0.02,
        sandbox: "none",
        provider: "local",
        tags: ["planning", "project-management"],
      },
      "1.0.0",
      "author3",
    )
  })

  afterAll(() => {
    registry.close()
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // Windows may hold file lock momentarily
    }
  })

  it("should search by name", () => {
    const result = search.search("test")
    expect(result.entries.some((e) => e.config.name === "test-agent")).toBe(true)
  })

  it("should search by description", () => {
    const result = search.search("review")
    expect(result.entries.some((e) => e.config.name === "review-agent")).toBe(true)
  })

  it("should return all when query is empty", () => {
    const result = search.search("")
    expect(result.entries.length).toBeGreaterThanOrEqual(3)
  })

  it("should get trending agents", () => {
    const trending = search.trending(5)
    expect(trending.length).toBeGreaterThanOrEqual(1)
  })

  it("should get top rated agents", () => {
    const top = search.topRated(5)
    expect(top.length).toBeGreaterThanOrEqual(1)
  })

  it("should get recent agents", () => {
    const recent = search.recent(5)
    expect(recent.length).toBeGreaterThanOrEqual(1)
  })

  it("should get agents by type", () => {
    const result = search.byType("planner")
    expect(result.entries.every((e) => e.config.type === "planner")).toBe(true)
  })

  it("should get agents by provider", () => {
    const result = search.byProvider("anthropic")
    expect(result.entries.every((e) => e.config.provider === "anthropic")).toBe(true)
  })
})
