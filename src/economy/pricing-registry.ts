import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import { parse, stringify } from "yaml"
import { createLogger } from "../cli/logger"
import { ToolPricing } from "./types"
import type { ToolPricing as ToolPricingType } from "./types"

const log = createLogger("pricing-registry")

function configPath(): string {
  return join(homedir(), ".aegis", "tool_pricing.yaml")
}

export const DEFAULT_PRICING: ToolPricingType = {
  tools: {
    web_search: { api_usd: 0.001, latency_p50_ms: 800, latency_p99_ms: 3000 },
    web_fetch: { api_usd: 0.0005, latency_p50_ms: 500, latency_p99_ms: 2000 },
    execute_code: { compute_usd_per_second: 0.00001, latency_p50_ms: 200, latency_p99_ms: 2000 },
    vision_analyze: { api_usd: 0.002, latency_p50_ms: 1500, latency_p99_ms: 5000 },
    read: { io_usd_per_mb: 0.0001, latency_p50_ms: 5, latency_p99_ms: 50 },
    write: { io_usd_per_mb: 0.0002, latency_p50_ms: 10, latency_p99_ms: 100 },
    grep: { io_usd_per_mb: 0.0001, latency_p50_ms: 20, latency_p99_ms: 200 },
    glob: { io_usd_per_mb: 0.0001, latency_p50_ms: 15, latency_p99_ms: 150 },
    bash: { compute_usd_per_second: 0.00002, latency_p50_ms: 100, latency_p99_ms: 1000 },
    ask_agent: { api_usd: 0.002, latency_p50_ms: 500, latency_p99_ms: 3000 },
    read_skill: { io_usd_per_mb: 0.0001, latency_p50_ms: 5, latency_p99_ms: 50 },
    edit: { api_usd: 0.0001, io_usd_per_mb: 0.0002, latency_p50_ms: 15, latency_p99_ms: 100 },
    web_extract: { api_usd: 0.001, latency_p50_ms: 1000, latency_p99_ms: 4000 },
    delegate_task: { api_usd: 0.003, latency_p50_ms: 2000, latency_p99_ms: 10000 },
    memory_read: { io_usd_per_mb: 0.0001, latency_p50_ms: 10, latency_p99_ms: 50 },
    memory_write: { io_usd_per_mb: 0.0002, latency_p50_ms: 15, latency_p99_ms: 100 },
    memory_search: { api_usd: 0.0003, latency_p50_ms: 20, latency_p99_ms: 100 },
    computer: { compute_usd_per_second: 0.00005, latency_p50_ms: 500, latency_p99_ms: 3000 },
    docs_crawl: { api_usd: 0.002, compute_usd_per_second: 0.00001, latency_p50_ms: 2000, latency_p99_ms: 10000 },
    plan_state: { api_usd: 0.0002, latency_p50_ms: 10, latency_p99_ms: 50 },
    tree_sitter: { compute_usd_per_second: 0.00001, latency_p50_ms: 50, latency_p99_ms: 500 },
    a2ui: { api_usd: 0.001, latency_p50_ms: 300, latency_p99_ms: 1500 },
    image_generate: { api_usd: 0.004, latency_p50_ms: 5000, latency_p99_ms: 30000 },
  },
  models: {
    "llama-3.3-70b-versatile": {
      prompt_usd_per_1k: 0,
      completion_usd_per_1k: 0,
      context_window: 128_000,
      quality_tier: "free",
      benchmark_score: 0.72,
    },
    "meta-llama/llama-3.1-70b-instruct:free": {
      prompt_usd_per_1k: 0,
      completion_usd_per_1k: 0,
      context_window: 128_000,
      quality_tier: "free",
      benchmark_score: 0.72,
    },
    "mistralai/mixtral-8x22b-instruct-v0.1": {
      prompt_usd_per_1k: 0.002,
      completion_usd_per_1k: 0.006,
      context_window: 64_000,
      quality_tier: "balanced",
      benchmark_score: 0.78,
    },
    "meta/llama-3.1-70b-instruct": {
      prompt_usd_per_1k: 0.001,
      completion_usd_per_1k: 0.003,
      context_window: 128_000,
      quality_tier: "cheap",
      benchmark_score: 0.76,
    },
    "meta/llama-3.1-8b-instruct": {
      prompt_usd_per_1k: 0.0005,
      completion_usd_per_1k: 0.0015,
      context_window: 128_000,
      quality_tier: "cheap",
      benchmark_score: 0.68,
    },
    "claude-sonnet-4-6": {
      prompt_usd_per_1k: 0.003,
      completion_usd_per_1k: 0.015,
      context_window: 200_000,
      quality_tier: "balanced",
      benchmark_score: 0.88,
    },
    "claude-opus-4-6": {
      prompt_usd_per_1k: 0.015,
      completion_usd_per_1k: 0.075,
      context_window: 200_000,
      quality_tier: "premium",
      benchmark_score: 0.95,
    },
    "claude-haiku-3-5": {
      prompt_usd_per_1k: 0.001,
      completion_usd_per_1k: 0.005,
      context_window: 200_000,
      quality_tier: "cheap",
      benchmark_score: 0.72,
    },
    "gpt-4o": {
      prompt_usd_per_1k: 0.005,
      completion_usd_per_1k: 0.015,
      context_window: 128_000,
      quality_tier: "balanced",
      benchmark_score: 0.85,
    },
    "gpt-4o-mini": {
      prompt_usd_per_1k: 0.00015,
      completion_usd_per_1k: 0.0006,
      context_window: 128_000,
      quality_tier: "cheap",
      benchmark_score: 0.7,
    },
  },
}

let cached: ToolPricingType | null = null
let lastLoadError: string | null = null

/** The reason the last loadPricing() call fell back to the defaults, if any. */
export function getPricingLoadError(): string | null {
  return lastLoadError
}

export function loadPricing(): ToolPricingType {
  if (cached) return cached

  lastLoadError = null

  const path = configPath()

  if (!existsSync(path)) {
    cached = DEFAULT_PRICING
    return cached
  }

  try {
    const raw = readFileSync(path, "utf-8")
    const parsed = parse(raw)
    const result = ToolPricing.safeParse(parsed)
    if (result.success) {
      cached = result.data
      return cached
    }
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`).join("; ")
    lastLoadError = `Invalid pricing config at ${path}: ${issues}`
    log.error(`${lastLoadError} — falling back to default pricing. Custom prices are NOT active.`)
    cached = DEFAULT_PRICING
    return cached
  } catch (err) {
    lastLoadError = `Failed to read pricing config at ${path}: ${err instanceof Error ? err.message : String(err)}`
    log.error(`${lastLoadError} — falling back to default pricing. Custom prices are NOT active.`)
    cached = DEFAULT_PRICING
    return cached
  }
}

export function savePricing(pricing: ToolPricingType): void {
  cached = pricing
  const dir = join(homedir(), ".aegis")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(configPath(), stringify(pricing), "utf-8")
}

export function refreshPricing(): ToolPricingType {
  cached = null
  return loadPricing()
}

export function invalidateCache(): void {
  cached = null
}
