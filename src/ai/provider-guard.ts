import { ERR, formatError } from "../errors"
import { resolveApiKey } from "./provider"

const PRIORITY_PROVIDERS: Array<{ provider: string; model: string }> = [
  { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  { provider: "openai", model: "gpt-4o" },
  { provider: "openrouter", model: "openrouter/free" },
  { provider: "gemini", model: "gemini-2.0-flash" },
  { provider: "groq", model: "llama-3.3-70b-versatile" },
  { provider: "mistral", model: "mistral-large-latest" },
  { provider: "deepseek", model: "deepseek-chat" },
  { provider: "xai", model: "grok-beta" },
  { provider: "cohere", model: "command-r-plus" },
]

export function getDefaultConfiguredProvider(): { provider: string; model: string } | null {
  for (const entry of PRIORITY_PROVIDERS) {
    if (resolveApiKey(entry.provider)) return entry
  }
  return null
}

export function requireAnyProvider(): void {
  if (getDefaultConfiguredProvider() !== null) return
  console.error(`\n  ✗ ${formatError(ERR.NO_PROVIDER, "No AI provider configured.")}`)
  console.error("  Run: aegis setup-keys")
  console.error("  Docs: https://github.com/KunjShah95/neuron-os#providers\n")
  process.exit(1)
}
