export interface ModelOption {
  id: string
  label: string
}

export type AIProviderType = "anthropic" | "openai" | "deepseek" | "ollama" | "custom"

export const MODEL_REFERENCES: Record<AIProviderType, ModelOption[]> = {
  anthropic: [
    { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
    { id: "claude-3-opus-latest", label: "Claude 3 Opus" },
    { id: "claude-3-haiku-latest", label: "Claude 3 Haiku" },
  ],
  openai: [
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4o-mini", label: "GPT-4o Mini" },
    { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { id: "o3-mini", label: "o3 Mini" },
  ],
  deepseek: [
    { id: "deepseek-chat", label: "DeepSeek Chat" },
    { id: "deepseek-reasoner", label: "DeepSeek Reasoner" },
  ],
  ollama: [
    { id: "llama3.2", label: "Llama 3.2" },
    { id: "llama3.1", label: "Llama 3.1" },
    { id: "mistral", label: "Mistral" },
    { id: "codellama", label: "Code Llama" },
    { id: "mixtral", label: "Mixtral" },
  ],
  custom: [],
}

export function getDefaultModel(provider: AIProviderType): string {
  return MODEL_REFERENCES[provider][0]?.id ?? ""
}

export function getProviderBaseUrl(provider: AIProviderType, userBaseUrl?: string): string | undefined {
  switch (provider) {
    case "anthropic": return "https://api.anthropic.com/v1"
    case "openai": return "https://api.openai.com/v1"
    case "deepseek": return "https://api.deepseek.com/v1"
    case "ollama": return "http://localhost:11434"
    case "custom": return userBaseUrl
  }
}
