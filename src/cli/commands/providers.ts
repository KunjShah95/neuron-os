import type { Command } from "commander"
import { theme } from "../theme"
import { MODEL_REFERENCES, getDefaultModel, getProviderBaseUrl } from "../../ai/models"
import type { AIProviderType } from "../../ai/models"
import { resolveApiKey } from "../../ai"
import { listProviders } from "../../ai/providers"

const ENV_VARS: Record<AIProviderType, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  ollama: "—",
  custom: "CUSTOM_API_KEY",
  gemini: "GOOGLE_GENERATIVE_AI_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  mistral: "MISTRAL_API_KEY",
  azure: "AZURE_OPENAI_API_KEY",
  togetherai: "TOGETHERAI_API_KEY",
  xai: "XAI_API_KEY",
  cohere: "COHERE_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  nvidia: "NVIDIA_API_KEY",
}

interface ProviderInfo {
  provider: AIProviderType
  configured: boolean
  registered: boolean
  needsKey: boolean
  defaultModel: string
  baseUrl: string
  envVar: string
  modelCount: number
}

function collectProviders(): ProviderInfo[] {
  const registered = new Set(listProviders())
  return (Object.keys(MODEL_REFERENCES) as AIProviderType[]).map((provider) => {
    const needsKey = provider !== "ollama"
    return {
      provider,
      configured: needsKey ? Boolean(resolveApiKey(provider)) : true,
      registered: registered.has(provider),
      needsKey,
      defaultModel: getDefaultModel(provider) || "—",
      baseUrl: getProviderBaseUrl(provider) ?? "—",
      envVar: ENV_VARS[provider],
      modelCount: MODEL_REFERENCES[provider].length,
    }
  })
}

export function registerProviders(program: Command): void {
  program
    .command("providers")
    .alias("prov")
    .description("List AI providers — configured status, default model, and base URL")
    .option("--json", "Output as JSON")
    .option("-c, --configured", "Show only configured providers")
    .action((opts: { json?: boolean; configured?: boolean }) => {
      let providers = collectProviders()
      if (opts.configured) providers = providers.filter((p) => p.configured)

      if (opts.json) {
        console.log(JSON.stringify(providers, null, 2))
        return
      }

      const configuredCount = providers.filter((p) => p.configured).length
      console.log(`\n  ${theme.heading("AI Providers")}`)
      console.log(`  ${theme.muted(`${configuredCount}/${providers.length} configured`)}\n`)

      for (const p of providers) {
        const status = p.configured ? theme.success("●") : theme.dim("○")
        const name = p.configured ? theme.textBright(p.provider) : theme.muted(p.provider)
        console.log(`  ${status} ${name}`)
        const moreModels = p.modelCount > 1 ? `  ${theme.dim(`(+${p.modelCount - 1} more)`)}` : ""
        console.log(`    ${theme.muted("model".padEnd(8))} ${p.defaultModel}${moreModels}`)
        console.log(`    ${theme.muted("url".padEnd(8))} ${p.baseUrl}`)
        if (p.needsKey) {
          const keyState = p.configured ? theme.success("set") : theme.dim("missing")
          console.log(`    ${theme.muted("key".padEnd(8))} ${p.envVar} ${theme.dim("·")} ${keyState}`)
        } else {
          console.log(`    ${theme.muted("key".padEnd(8))} ${theme.dim("not required (local)")}`)
        }
        console.log()
      }

      if (configuredCount === 0) {
        console.log(`  ${theme.muted("No providers configured. Run:")} aegis setup-keys\n`)
      }
    })
}
