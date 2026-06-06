import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import { parse, stringify } from "yaml"
import { createLogger } from "../cli/logger"
import { ToolPricing } from "./types"
import type { ToolPricing as ToolPricingType } from "./types"

const log = createLogger("pricing-registry")
const CONFIG_PATH = join(homedir(), ".aegis", "tool_pricing.yaml")

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
  },
  models: {
    "claude-sonnet-4-6": { prompt_usd_per_1k: 0.003, completion_usd_per_1k: 0.015, context_window: 200_000, quality_tier: "balanced", benchmark_score: 0.88 },
    "claude-opus-4-6": { prompt_usd_per_1k: 0.015, completion_usd_per_1k: 0.075, context_window: 200_000, quality_tier: "premium", benchmark_score: 0.95 },
    "claude-haiku-3-5": { prompt_usd_per_1k: 0.001, completion_usd_per_1k: 0.005, context_window: 200_000, quality_tier: "cheap", benchmark_score: 0.72 },
    "gpt-4o": { prompt_usd_per_1k: 0.005, completion_usd_per_1k: 0.015, context_window: 128_000, quality_tier: "balanced", benchmark_score: 0.85 },
    "gpt-4o-mini": { prompt_usd_per_1k: 0.00015, completion_usd_per_1k: 0.0006, context_window: 128_000, quality_tier: "cheap", benchmark_score: 0.70 },
  },
}

let cached: ToolPricingType | null = null

export function loadPricing(): ToolPricingType {
  if (cached) return cached

  if (!existsSync(CONFIG_PATH)) {
    cached = DEFAULT_PRICING
    return cached
  }

  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8")
    const parsed = parse(raw)
    const result = ToolPricing.safeParse(parsed)
    if (result.success) {
      cached = result.data
      return cached
    }
    log.warn("Invalid pricing config, using defaults")
    cached = DEFAULT_PRICING
    return cached
  } catch {
    cached = DEFAULT_PRICING
    return cached
  }
}

export function savePricing(pricing: ToolPricingType): void {
  cached = pricing
  const dir = join(homedir(), ".aegis")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(CONFIG_PATH, stringify(pricing), "utf-8")
}

export function refreshPricing(): ToolPricingType {
  cached = null
  return loadPricing()
}

export function invalidateCache(): void {
  cached = null
}
