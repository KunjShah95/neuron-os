import type { WizardPrompter } from "../types"
import { WizardCancelledError } from "../../cli/guard"
import { saveConfig } from "../../config"
import { MODEL_REFERENCES, getDefaultModel, getProviderBaseUrl } from "../../ai/models"
import type { AIProviderType } from "../../ai/models"

export interface SetupConfig {
  workspace: string
  provider: AIProviderType
  agentName: string
  startOnBoot: boolean
}

function providerLabel(p: AIProviderType): string {
  switch (p) {
    case "anthropic": return "Anthropic"
    case "openai": return "OpenAI"
    case "deepseek": return "DeepSeek"
    case "gemini": return "Gemini"
    case "groq": return "Groq"
    case "openrouter": return "OpenRouter"
    case "ollama": return "Ollama"
    case "custom": return "Custom endpoint"
  }
}

function needsApiKey(p: AIProviderType): boolean {
  return p !== "ollama"
}

function needsBaseUrl(p: AIProviderType): boolean {
  return p === "custom"
}

export async function runSetupFlow(prompter: WizardPrompter): Promise<SetupConfig> {
  try {
    await prompter.intro("Aegis Setup")

    await prompter.note(
      "Aegis operates as a privileged agent on your system.\n"
      + "It can read/write files, run commands, and execute code.\n"
      + "Review configuration before proceeding.",
      "Security Warning"
    )

    const workspace = await prompter.text({
      message: "Workspace directory",
      placeholder: "~/.aegis",
      defaultValue: "~/.aegis",
    })

    const provider = await prompter.select({
      message: "Default provider",
      options: [
        { value: "anthropic", label: "Anthropic", hint: "Claude models" },
        { value: "openai", label: "OpenAI", hint: "GPT / o-series models" },
        { value: "deepseek", label: "DeepSeek", hint: "DeepSeek Chat / Reasoner" },
        { value: "gemini", label: "Gemini", hint: "Google Gemini models" },
        { value: "groq", label: "Groq", hint: "Ultra-fast inference (Llama, Mixtral)" },
        { value: "openrouter", label: "OpenRouter", hint: "Multi-model gateway" },
        { value: "ollama", label: "Ollama", hint: "Local models (no API key)" },
        { value: "custom", label: "Custom endpoint", hint: "OpenAI-compatible API" },
      ],
      initialValue: "anthropic",
    }) as AIProviderType

    let apiKey: string | undefined
    if (needsApiKey(provider)) {
      apiKey = await prompter.text({
        message: `${providerLabel(provider)} API key`,
        placeholder: provider === "anthropic" ? "sk-ant-..." : "sk-...",
        validate: (val) => val.trim() ? undefined : "API key is required",
      })
    }

    let baseUrl: string | undefined
    if (needsBaseUrl(provider)) {
      baseUrl = await prompter.text({
        message: "Custom endpoint base URL",
        placeholder: "https://your-api.example.com/v1",
        validate: (val) => val.trim() ? undefined : "Base URL is required",
      })
    }

    const refs = MODEL_REFERENCES[provider]
    let model: string
    if (refs.length > 0) {
      model = await prompter.select({
        message: "Select model",
        options: refs.map((m) => ({ value: m.id, label: m.label, hint: m.id })),
      })
    } else {
      model = await prompter.text({
        message: "Enter model name",
        placeholder: getDefaultModel(provider) || "gpt-4o",
        validate: (val) => val.trim() ? undefined : "Model name is required",
      })
    }

    const agentName = await prompter.text({
      message: "Agent name",
      placeholder: "main",
      defaultValue: "main",
    })

    const startOnBoot = await prompter.confirm({
      message: "Start on boot?",
      initialValue: false,
    })

    const saveProgress = prompter.progress("Saving")
    saveProgress.start("Writing config...")

    saveConfig({
      provider,
      apiKey,
      baseUrl: baseUrl || getProviderBaseUrl(provider),
      model,
      workspace,
      agentName,
      startOnBoot,
    })

    saveProgress.stop("Config written")

    await prompter.outro("Setup complete! Use `aegis wakeup` to get started.")

    return { workspace, provider, agentName, startOnBoot }
  } catch (err) {
    if (err instanceof WizardCancelledError) {
      await prompter.note("Setup cancelled by user", "Cancelled")
      process.exit(0)
    }
    throw err
  }
}
