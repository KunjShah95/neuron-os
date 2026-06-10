import type { CredentialVault } from "./credential-vault"
import { setVaultCredential } from "../ai/provider"

const PROVIDER_ENV_NAMES: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  groq: "GROQ_API_KEY",
  gemini: "GOOGLE_GENERATIVE_AI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  azure: "AZURE_OPENAI_API_KEY",
  togetherai: "TOGETHERAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  xai: "XAI_API_KEY",
  cohere: "COHERE_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  nvidia: "NVIDIA_API_KEY",
}

export function syncVaultToProviders(vault: CredentialVault): number {
  if (!vault.isUnlocked) return 0

  let synced = 0

  for (const [provider, envName] of Object.entries(PROVIDER_ENV_NAMES)) {
    const entry = vault.retrieveByName(envName)
    if (entry) {
      process.env[envName] = entry.value
      setVaultCredential(provider, entry.value)
      synced++
      continue
    }

    const vaultName = `api-key-${provider}`
    const vaultEntry = vault.retrieveByName(vaultName)
    if (vaultEntry) {
      process.env[envName] = vaultEntry.value
      setVaultCredential(provider, vaultEntry.value)
      synced++
    }
  }

  return synced
}
