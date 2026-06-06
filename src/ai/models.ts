export interface ModelOption {
  id: string
  label: string
}

export type AIProviderType = "anthropic" | "openai" | "deepseek" | "ollama" | "custom" | "gemini" | "groq" | "openrouter" | "mistral" | "azure" | "togetherai" | "xai" | "cohere" | "perplexity"

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
  gemini: [
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
    { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
    { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
    { id: "gemma2-9b-it", label: "Gemma 2 9B" },
  ],
  openrouter: [
    { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
    { id: "openai/gpt-4o", label: "GPT-4o" },
    { id: "google/gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
    { id: "mistralai/mistral-7b-instruct", label: "Mistral 7B" },
  ],
  mistral: [
    { id: "mistral-large-latest", label: "Mistral Large" },
    { id: "mistral-small-latest", label: "Mistral Small" },
    { id: "codestral-latest", label: "Codestral" },
    { id: "open-mistral-nemo", label: "Open Mistral Nemo" },
  ],
  azure: [
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4o-mini", label: "GPT-4o Mini" },
    { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { id: "o3-mini", label: "o3 Mini" },
  ],
  togetherai: [
    { id: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo", label: "Llama 3.1 8B Turbo" },
    { id: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", label: "Llama 3.1 70B Turbo" },
    { id: "mistralai/Mixtral-8x7B-Instruct-v0.1", label: "Mixtral 8x7B" },
    { id: "deepseek-ai/deepseek-coder-33b-instruct", label: "DeepSeek Coder 33B" },
  ],
  xai: [
    { id: "grok-3", label: "Grok 3" },
    { id: "grok-3-mini", label: "Grok 3 Mini" },
    { id: "grok-2", label: "Grok 2" },
  ],
  cohere: [
    { id: "command-r-plus", label: "Command R+" },
    { id: "command-r", label: "Command R" },
    { id: "command-r7b", label: "Command R7B" },
  ],
  perplexity: [
    { id: "sonar-pro", label: "Sonar Pro" },
    { id: "sonar", label: "Sonar" },
    { id: "sonar-deep-research", label: "Sonar Deep Research" },
  ],
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
    case "gemini": return "https://generativelanguage.googleapis.com/v1beta/openai"
    case "groq": return "https://api.groq.com/openai/v1"
    case "openrouter": return "https://openrouter.ai/api/v1"
    case "mistral": return "https://api.mistral.ai/v1"
    case "azure": return userBaseUrl
    case "togetherai": return "https://api.together.ai/v1"
    case "xai": return "https://api.x.ai/v1"
    case "cohere": return "https://api.cohere.com/v1"
    case "perplexity": return "https://api.perplexity.ai"
    case "custom": return userBaseUrl
  }
}
