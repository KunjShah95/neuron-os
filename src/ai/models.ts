export interface ModelOption {
  id: string
  label: string
}

export type AIProviderType =
  | "anthropic"
  | "openai"
  | "deepseek"
  | "ollama"
  | "custom"
  | "gemini"
  | "groq"
  | "openrouter"
  | "mistral"
  | "azure"
  | "togetherai"
  | "xai"
  | "cohere"
  | "perplexity"
  | "nvidia"

export const MODEL_REFERENCES: Record<AIProviderType, ModelOption[]> = {
  anthropic: [
    { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { id: "claude-4-opus-20250514", label: "Claude 4 Opus" },
    { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
    { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
    { id: "claude-3-opus-latest", label: "Claude 3 Opus" },
    { id: "claude-3-haiku-latest", label: "Claude 3 Haiku" },
  ],
  openai: [
    { id: "gpt-4.1", label: "GPT-4.1" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    { id: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4o-mini", label: "GPT-4o Mini" },
    { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { id: "o4-mini", label: "o4 Mini" },
    { id: "o3-mini", label: "o3 Mini" },
    { id: "o3", label: "o3" },
  ],
  deepseek: [
    { id: "deepseek-chat", label: "DeepSeek V3 Chat" },
    { id: "deepseek-reasoner", label: "DeepSeek R1 Reasoner" },
    { id: "deepseek-coder", label: "DeepSeek Coder" },
  ],
  ollama: [
    { id: "llama3.2", label: "Llama 3.2" },
    { id: "llama3.1", label: "Llama 3.1" },
    { id: "llama3", label: "Llama 3" },
    { id: "mistral", label: "Mistral" },
    { id: "mistral-nemo", label: "Mistral Nemo" },
    { id: "codellama", label: "Code Llama" },
    { id: "mixtral", label: "Mixtral" },
    { id: "qwen2.5", label: "Qwen 2.5" },
    { id: "qwen2.5-coder", label: "Qwen 2.5 Coder" },
    { id: "phi4", label: "Phi-4" },
    { id: "gemma2", label: "Gemma 2" },
  ],
  custom: [],
  gemini: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
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
    { id: "llama-3.2-90b-vision-preview", label: "Llama 3.2 90B Vision" },
    { id: "llama-3.2-11b-vision-preview", label: "Llama 3.2 11B Vision" },
    { id: "qwen-qwq-32b", label: "Qwen QwQ 32B" },
  ],
  openrouter: [
    { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
    { id: "anthropic/claude-4-opus", label: "Claude 4 Opus" },
    { id: "openai/gpt-4.1", label: "GPT-4.1" },
    { id: "openai/gpt-4o", label: "GPT-4o" },
    { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "google/gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
    { id: "mistralai/mistral-7b-instruct", label: "Mistral 7B" },
    { id: "openrouter/free", label: "OpenRouter Free" },
    { id: "cognitivecomputations/dolphin3.0-mistral-24b:free", label: "Dolphin 3.0 (free)" },
    { id: "microsoft/phi-4:free", label: "Phi-4 (free)" },
    { id: "qwen/qwen2.5-vl-3b-instruct:free", label: "Qwen 2.5 VL (free)" },
    { id: "x-ai/grok-3", label: "Grok 3" },
    { id: "deepseek/deepseek-chat", label: "DeepSeek Chat" },
  ],
  mistral: [
    { id: "mistral-large-latest", label: "Mistral Large" },
    { id: "mistral-small-latest", label: "Mistral Small" },
    { id: "codestral-latest", label: "Codestral" },
    { id: "open-mistral-nemo", label: "Open Mistral Nemo" },
    { id: "mistral-embed", label: "Mistral Embed" },
    { id: "pixtral-large-latest", label: "Pixtral Large" },
  ],
  azure: [
    { id: "gpt-4.1", label: "GPT-4.1" },
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4o-mini", label: "GPT-4o Mini" },
    { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { id: "o4-mini", label: "o4 Mini" },
    { id: "o3-mini", label: "o3 Mini" },
  ],
  togetherai: [
    { id: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo", label: "Llama 3.1 8B Turbo" },
    { id: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", label: "Llama 3.1 70B Turbo" },
    { id: "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo", label: "Llama 3.1 405B Turbo" },
    { id: "mistralai/Mixtral-8x7B-Instruct-v0.1", label: "Mixtral 8x7B" },
    { id: "deepseek-ai/deepseek-coder-33b-instruct", label: "DeepSeek Coder 33B" },
    { id: "Qwen/Qwen2.5-72B-Instruct-Turbo", label: "Qwen 2.5 72B Turbo" },
    { id: "google/gemma-2-27b-it", label: "Gemma 2 27B" },
  ],
  xai: [
    { id: "grok-3", label: "Grok 3" },
    { id: "grok-3-mini", label: "Grok 3 Mini" },
    { id: "grok-2", label: "Grok 2" },
    { id: "grok-2-vision", label: "Grok 2 Vision" },
  ],
  cohere: [
    { id: "command-r-plus", label: "Command R+" },
    { id: "command-r", label: "Command R" },
    { id: "command-r7b", label: "Command R7B" },
    { id: "command-a", label: "Command A" },
    { id: "embed-v4.0", label: "Embed V4" },
  ],
  perplexity: [
    { id: "sonar-pro", label: "Sonar Pro" },
    { id: "sonar", label: "Sonar" },
    { id: "sonar-deep-research", label: "Sonar Deep Research" },
    { id: "sonar-reasoning-pro", label: "Sonar Reasoning Pro" },
  ],
  nvidia: [
    { id: "mistralai/mixtral-8x22b-instruct-v0.1", label: "Mixtral 8x22B" },
    { id: "meta/llama-3.1-70b-instruct", label: "Llama 3.1 70B" },
    { id: "meta/llama-3.1-8b-instruct", label: "Llama 3.1 8B" },
    { id: "mistralai/mistral-7b-instruct-v0.3", label: "Mistral 7B v0.3" },
    { id: "google/gemma-2-9b-it", label: "Gemma 2 9B" },
    { id: "nvidia/nemotron-4-340b-instruct", label: "Nemotron 4 340B" },
  ],
}

export function getDefaultModel(provider: AIProviderType): string {
  return MODEL_REFERENCES[provider][0]?.id ?? ""
}

export function getProviderBaseUrl(provider: AIProviderType, userBaseUrl?: string): string | undefined {
  switch (provider) {
    case "anthropic":
      return "https://api.anthropic.com/v1"
    case "openai":
      return "https://api.openai.com/v1"
    case "deepseek":
      return "https://api.deepseek.com/v1"
    case "ollama":
      return "http://localhost:11434"
    case "gemini":
      return "https://generativelanguage.googleapis.com/v1beta/openai"
    case "groq":
      return "https://api.groq.com/openai/v1"
    case "openrouter":
      return "https://openrouter.ai/api/v1"
    case "mistral":
      return "https://api.mistral.ai/v1"
    case "azure":
      return userBaseUrl
    case "togetherai":
      return "https://api.together.ai/v1"
    case "xai":
      return "https://api.x.ai/v1"
    case "cohere":
      return "https://api.cohere.com/v1"
    case "perplexity":
      return "https://api.perplexity.ai"
    case "nvidia":
      return "https://api.nvcf.nvidia.com/v1"
    case "custom":
      return userBaseUrl
  }
}
