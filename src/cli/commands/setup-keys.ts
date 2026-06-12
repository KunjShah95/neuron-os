import * as p from "@clack/prompts"
import type { Command } from "commander"
import { credentialVault } from "../../vault"
import { saveConfig, loadConfig } from "../../config"
import { guardCancel, WizardCancelledError } from "../guard"

type ApiBody = { error?: { message?: string }; type?: string }
function apiErr(body: unknown, status: number): string {
  const b = body as ApiBody
  return b.error?.message || b.type || `HTTP ${status}`
}

// ── Provider Definitions ──────────────────────────────────────────────

interface ProviderConfig {
  readonly key: string
  readonly label: string
  readonly envVar: string
  readonly defaultBaseUrl: string
  readonly needsBaseUrl: boolean
  readonly baseUrlLabel?: string
  readonly testKey: (apiKey: string, baseUrl?: string) => Promise<{ ok: boolean; error?: string }>
}

const PROVIDERS: ProviderConfig[] = [
  {
    key: "anthropic",
    label: "Anthropic (Claude)",
    envVar: "ANTHROPIC_API_KEY",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    needsBaseUrl: false,
    testKey: async (apiKey) => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1,
            messages: [{ role: "user", content: "ok" }],
          }),
          signal: controller.signal,
        })
        if (res.ok) return { ok: true }
        const body = await res.json().catch(() => ({}))
        const err = apiErr(body, res.status)
        return { ok: false, error: err }
      } finally {
        clearTimeout(timeout)
      }
    },
  },
  {
    key: "openai",
    label: "OpenAI (GPT / o-series)",
    envVar: "OPENAI_API_KEY",
    defaultBaseUrl: "https://api.openai.com/v1",
    needsBaseUrl: false,
    testKey: async (apiKey, baseUrl) => {
      const url = baseUrl ? `${baseUrl.replace(/\/+$/, "")}/models` : "https://api.openai.com/v1/models"
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      try {
        const res = await fetch(url, {
          headers: { authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        })
        if (res.ok) return { ok: true }
        const body = await res.json().catch(() => ({}))
        const err = apiErr(body, res.status)
        return { ok: false, error: err }
      } finally {
        clearTimeout(timeout)
      }
    },
  },
  {
    key: "deepseek",
    label: "DeepSeek",
    envVar: "DEEPSEEK_API_KEY",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    needsBaseUrl: false,
    testKey: async (apiKey, baseUrl) => {
      const url = baseUrl ? `${baseUrl.replace(/\/+$/, "")}/models` : "https://api.deepseek.com/v1/models"
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      try {
        const res = await fetch(url, {
          headers: { authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        })
        if (res.ok) return { ok: true }
        const body = await res.json().catch(() => ({}))
        const err = apiErr(body, res.status)
        return { ok: false, error: err }
      } finally {
        clearTimeout(timeout)
      }
    },
  },
  {
    key: "gemini",
    label: "Gemini (Google)",
    envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    needsBaseUrl: false,
    testKey: async (apiKey) => {
      const url = "https://generativelanguage.googleapis.com/v1beta/openai/models"
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      try {
        const res = await fetch(url, {
          headers: { authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        })
        if (res.ok) return { ok: true }
        return { ok: false, error: `HTTP ${res.status}` }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      } finally {
        clearTimeout(timeout)
      }
    },
  },
  {
    key: "groq",
    label: "Groq (Fast inference)",
    envVar: "GROQ_API_KEY",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    needsBaseUrl: false,
    testKey: async (apiKey) => {
      const url = "https://api.groq.com/openai/v1/models"
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      try {
        const res = await fetch(url, {
          headers: { authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        })
        if (res.ok) return { ok: true }
        const body = await res.json().catch(() => ({}))
        const err = apiErr(body, res.status)
        return { ok: false, error: err }
      } finally {
        clearTimeout(timeout)
      }
    },
  },
  {
    key: "openrouter",
    label: "OpenRouter (Multi-model)",
    envVar: "OPENROUTER_API_KEY",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    needsBaseUrl: false,
    testKey: async (apiKey) => {
      const url = "https://openrouter.ai/api/v1/models"
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      try {
        const res = await fetch(url, {
          headers: {
            authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": "https://neuron-os.local",
            "X-Title": "Neuron OS",
          },
          signal: controller.signal,
        })
        if (res.ok) return { ok: true }
        const body = await res.json().catch(() => ({}))
        const err = apiErr(body, res.status)
        return { ok: false, error: err }
      } finally {
        clearTimeout(timeout)
      }
    },
  },
  {
    key: "ollama",
    label: "Ollama (Local)",
    envVar: "OLLAMA_URL",
    defaultBaseUrl: "http://localhost:11434",
    needsBaseUrl: true,
    baseUrlLabel: "Ollama server URL",
    testKey: async (_apiKey, baseUrl) => {
      const url = baseUrl ? `${baseUrl.replace(/\/+$/, "")}/api/tags` : "http://localhost:11434/api/tags"
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      try {
        const res = await fetch(url, { signal: controller.signal })
        if (res.ok) return { ok: true }
        return { ok: false, error: `HTTP ${res.status}` }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      } finally {
        clearTimeout(timeout)
      }
    },
  },
  {
    key: "mistral",
    label: "Mistral AI",
    envVar: "MISTRAL_API_KEY",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    needsBaseUrl: false,
    testKey: async (apiKey) => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      try {
        const res = await fetch("https://api.mistral.ai/v1/models", {
          headers: { authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        })
        if (res.ok) return { ok: true }
        const body = await res.json().catch(() => ({}))
        const err = apiErr(body, res.status)
        return { ok: false, error: err }
      } finally {
        clearTimeout(timeout)
      }
    },
  },
  {
    key: "azure",
    label: "Azure OpenAI",
    envVar: "AZURE_OPENAI_API_KEY",
    defaultBaseUrl: "https://{resource}.openai.azure.com",
    needsBaseUrl: true,
    baseUrlLabel: "Azure resource endpoint (replace {resource} with your resource name)",
    testKey: async (apiKey, baseUrl) => {
      const url = baseUrl ? `${baseUrl.replace(/\/+$/, "")}/openai/models?api-version=2024-02-15-preview` : ""
      if (!url) return { ok: false, error: "Azure endpoint URL is required" }
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      try {
        const res = await fetch(url, {
          headers: { "api-key": apiKey },
          signal: controller.signal,
        })
        if (res.ok) return { ok: true }
        const body = await res.json().catch(() => ({}))
        const err = apiErr(body, res.status)
        return { ok: false, error: err }
      } finally {
        clearTimeout(timeout)
      }
    },
  },
  {
    key: "nvidia",
    label: "NVIDIA NIM (Self-hosted inference)",
    envVar: "NVIDIA_API_KEY",
    defaultBaseUrl: "https://api.nvcf.nvidia.com/v1",
    needsBaseUrl: false,
    testKey: async (apiKey) => {
      const url = "https://api.nvcf.nvidia.com/v1/models"
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      try {
        const res = await fetch(url, {
          headers: { authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        })
        if (res.ok) return { ok: true }
        const body = await res.json().catch(() => ({}))
        const err = apiErr(body, res.status)
        return { ok: false, error: err }
      } finally {
        clearTimeout(timeout)
      }
    },
  },
  {
    key: "togetherai",
    label: "Together AI",
    envVar: "TOGETHERAI_API_KEY",
    defaultBaseUrl: "https://api.together.ai/v1",
    needsBaseUrl: false,
    testKey: async (apiKey) => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      try {
        const res = await fetch("https://api.together.ai/v1/models", {
          headers: { authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        })
        if (res.ok) return { ok: true }
        const body = await res.json().catch(() => ({}))
        const err = apiErr(body, res.status)
        return { ok: false, error: err }
      } finally {
        clearTimeout(timeout)
      }
    },
  },
  {
    key: "xai",
    label: "xAI (Grok)",
    envVar: "XAI_API_KEY",
    defaultBaseUrl: "https://api.x.ai/v1",
    needsBaseUrl: false,
    testKey: async (apiKey) => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      try {
        const res = await fetch("https://api.x.ai/v1/models", {
          headers: { authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        })
        if (res.ok) return { ok: true }
        const body = await res.json().catch(() => ({}))
        const err = apiErr(body, res.status)
        return { ok: false, error: err }
      } finally {
        clearTimeout(timeout)
      }
    },
  },
  {
    key: "cohere",
    label: "Cohere (Command)",
    envVar: "COHERE_API_KEY",
    defaultBaseUrl: "https://api.cohere.com/v1",
    needsBaseUrl: false,
    testKey: async (apiKey) => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      try {
        const res = await fetch("https://api.cohere.com/v1/models", {
          headers: { authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        })
        if (res.ok) return { ok: true }
        const body = await res.json().catch(() => ({}))
        const err = apiErr(body, res.status)
        return { ok: false, error: err }
      } finally {
        clearTimeout(timeout)
      }
    },
  },
  {
    key: "perplexity",
    label: "Perplexity (Sonar)",
    envVar: "PERPLEXITY_API_KEY",
    defaultBaseUrl: "https://api.perplexity.ai",
    needsBaseUrl: false,
    testKey: async (apiKey) => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      try {
        const res = await fetch("https://api.perplexity.ai/models", {
          headers: { authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        })
        if (res.ok) return { ok: true }
        const body = await res.json().catch(() => ({}))
        const err = apiErr(body, res.status)
        return { ok: false, error: err }
      } finally {
        clearTimeout(timeout)
      }
    },
  },
  {
    key: "custom",
    label: "Custom (OpenAI-compatible)",
    envVar: "CUSTOM_API_KEY",
    defaultBaseUrl: "https://api.example.com/v1",
    needsBaseUrl: true,
    baseUrlLabel: "Custom API base URL (any OpenAI-compatible endpoint)",
    testKey: async (apiKey, baseUrl) => {
      const url = baseUrl ? `${baseUrl.replace(/\/+$/, "")}/models` : ""
      if (!url) return { ok: false, error: "Base URL is required" }
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      try {
        const headers: Record<string, string> = { authorization: `Bearer ${apiKey}` }
        const res = await fetch(url, { headers, signal: controller.signal })
        if (res.ok) return { ok: true }
        const body = await res.json().catch(() => ({}))
        const err = apiErr(body, res.status)
        return { ok: false, error: err }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      } finally {
        clearTimeout(timeout)
      }
    },
  },
]

// ── Telegram Bot Setup ────────────────────────────────────────────────

async function setupTelegramBot(): Promise<void> {
  const configure = guardCancel(
    await p.confirm({
      message: "Configure Telegram bot?",
      initialValue: false,
    }),
  )

  if (!configure) return

  p.note(
    "To get a Telegram bot token:\n" +
      "1. Open Telegram and search for @BotFather\n" +
      "2. Send /newbot and follow the prompts\n" +
      "3. Copy the API token BotFather gives you\n" +
      "4. Optionally set /setprivacy to Disabled (so the bot can read all messages)\n" +
      "\nThe token looks like: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz",
    "Getting a Bot Token from @BotFather",
  )

  let botToken = ""
  let shouldRetry = true
  while (shouldRetry) {
    botToken = guardCancel(
      await p.password({
        message: "Telegram bot token",
        validate: (val) => (val?.trim() ? undefined : "Bot token is required"),
      }),
    )
    botToken = String(botToken ?? "").trim()

    if (!botToken) {
      shouldRetry = false
      continue
    }

    // Basic sanity check: tokens look like "123456:ABCdef"
    const tokenPattern = /^\d+:\S+$/
    if (!tokenPattern.test(botToken)) {
      const fix = guardCancel(
        await p.confirm({
          message: "This doesn't look like a valid Telegram bot token (expected format: 123456:ABCdef). Save anyway?",
          initialValue: false,
        }),
      )
      if (!fix) continue
    }

    shouldRetry = false
  }

  if (!botToken) return

  // ── Allowed users (optional) ───────────────────────────────────────
  const restrictUsers = guardCancel(
    await p.confirm({
      message: "Restrict access to specific Telegram user IDs?",
      initialValue: false,
    }),
  )

  let allowedUsers = ""
  if (restrictUsers) {
    allowedUsers = guardCancel(
      await p.text({
        message: "Allowed Telegram user IDs (comma-separated)",
        placeholder: "123456789, 987654321",
        validate: (val) => (val?.trim() ? undefined : "At least one user ID is required"),
      }),
    )
  }

  // ── Save ────────────────────────────────────────────────────────────
  const saveSpinner = p.spinner()
  saveSpinner.start("Saving Telegram credentials…")

  try {
    await credentialVault.set("TELEGRAM_BOT_TOKEN", botToken, "global")
    process.env.TELEGRAM_BOT_TOKEN = botToken

    if (allowedUsers.trim()) {
      await credentialVault.set("TELEGRAM_ALLOWED_USERS", allowedUsers, "global")
    }

    saveSpinner.stop("✓ Telegram bot credentials saved (AES-256-GCM encrypted)")
  } catch {
    saveSpinner.stop("✗ Failed to save Telegram credentials")
  }
}

// ── Wizard ────────────────────────────────────────────────────────────

export async function runSetupKeysWizard(): Promise<void> {
  try {
    p.intro("🔑 API Key Setup")

    await credentialVault.initialize()

    const results: { provider: string; status: "configured" | "skipped" | "error"; detail?: string }[] = []

    for (const provider of PROVIDERS) {
      const configured = guardCancel(
        await p.confirm({
          message: `Configure ${provider.label}?`,
          initialValue: true,
        }),
      )

      if (!configured) {
        results.push({ provider: provider.label, status: "skipped" })
        continue
      }

      // ── API key input ────────────────────────────────────────────────
      let apiKey = ""
      let baseUrl = provider.defaultBaseUrl
      if (provider.key === "ollama") {
        // Ollama uses a URL, not an API key — store in baseUrl so the test
        // function receives the correct URL instead of default localhost.
        const url = guardCancel(
          await p.text({
            message: "Ollama server URL",
            placeholder: "http://localhost:11434",
            defaultValue: "http://localhost:11434",
            validate: (val) => (val?.trim() ? undefined : "URL is required"),
          }),
        )
        apiKey = "" // Ollama doesn't need an API key
        baseUrl = String(url ?? "").trim() || provider.defaultBaseUrl
      } else {
        const key = guardCancel(
          await p.password({
            message: `${provider.label} API key`,
            validate: (val) => (val?.trim() ? undefined : "API key is required"),
          }),
        )
        apiKey = String(key ?? "").trim()
      }

      // ── Base URL (optional for most, prompted for Ollama / custom) ──
      if (provider.needsBaseUrl && provider.key !== "ollama") {
        const input = guardCancel(
          await p.text({
            message: provider.baseUrlLabel ?? `${provider.label} base URL`,
            placeholder: provider.defaultBaseUrl,
            defaultValue: provider.defaultBaseUrl,
            validate: (val) => (val?.trim() ? undefined : "Base URL is required"),
          }),
        )
        baseUrl = String(input ?? "").trim() || provider.defaultBaseUrl
      }

      // ── Test the key ─────────────────────────────────────────────────
      const testSpinner = p.spinner()
      testSpinner.start(`Testing ${provider.label} key…`)

      const testResult = await provider.testKey(apiKey, baseUrl)

      if (testResult.ok) {
        testSpinner.stop(`✓ ${provider.label} key verified`)
      } else {
        testSpinner.stop(`✗ ${provider.label} key rejected: ${testResult.error}`)
        const proceed = guardCancel(
          await p.confirm({
            message: "Save anyway?",
            initialValue: false,
          }),
        )
        if (!proceed) {
          results.push({ provider: provider.label, status: "error", detail: testResult.error })
          continue
        }
      }

      // ── Persist to vault ────────────────────────────────────────────
      const saveSpinner = p.spinner()
      saveSpinner.start(`Saving ${provider.label} credentials…`)

      // For Ollama, the stored value is the URL. For all others, it's the API key.
      const storedValue = provider.key === "ollama" ? baseUrl : apiKey
      try {
        await credentialVault.set(provider.envVar, storedValue, "global")

        if (baseUrl && baseUrl !== provider.defaultBaseUrl) {
          await credentialVault.set(`${provider.envVar}_BASE_URL`, baseUrl, "global")
        }

        // Set env var so current process can use the key immediately
        process.env[provider.envVar] = storedValue

        saveSpinner.stop(`✓ ${provider.label} credentials saved (AES-256-GCM encrypted)`)

        results.push({
          provider: provider.label,
          status: testResult.ok ? "configured" : "error",
          detail: testResult.ok ? undefined : "saved but test failed",
        })
      } catch (err) {
        saveSpinner.stop(`✗ Failed to save ${provider.label} credentials`)
        results.push({ provider: provider.label, status: "error", detail: String(err) })
      }
    }

    // ── Summary ─────────────────────────────────────────────────────────
    p.note(
      results
        .map((r) => {
          const icon = r.status === "configured" ? "✓" : r.status === "skipped" ? "—" : "✗"
          const detail = r.detail ? ` (${r.detail})` : ""
          return `  ${icon} ${r.provider}${detail}`
        })
        .join("\n"),
      "Summary",
    )

    // ── Default provider ───────────────────────────────────────────────
    const configuredProviders = results.filter((r) => r.status === "configured")
    if (configuredProviders.length > 0) {
      const setDefault = guardCancel(
        await p.confirm({
          message: "Set a default AI provider?",
          initialValue: true,
        }),
      )

      if (setDefault) {
        const providerMap = new Map(PROVIDERS.map((p) => [p.label, p.key]))
        const defaultProvider = guardCancel(
          await p.select({
            message: "Default provider",
            options: configuredProviders.map((r) => {
              const key = providerMap.get(r.provider)
              return { value: key ?? r.provider.toLowerCase(), label: r.provider }
            }),
          }),
        )

        const config = loadConfig()
        saveConfig({ ...config, provider: defaultProvider })
      }
    }

    // ── Telegram Bot Setup ───────────────────────────────────────────
    await setupTelegramBot()

    // ── Next steps ─────────────────────────────────────────────────────
    p.outro(
      "All keys configured! They're encrypted with AES-256-GCM in ~/.aegis/vault.enc.\n" +
        "Start the Telegram bot: `aegis telegram`\n" +
        "View stored credentials: `aegis config list`\n" +
        "Reconfigure anytime: `aegis setup-keys`",
    )
  } catch (err) {
    if (err instanceof WizardCancelledError) {
      p.cancel("Setup cancelled by user")
      process.exit(0)
    }
    throw err
  }
}

// ── Register command ──────────────────────────────────────────────────

export function registerSetupKeys(program: Command) {
  program
    .command("setup-keys")
    .description("Interactive API key configuration for AI providers and Telegram bot integration")
    .action(async () => {
      await runSetupKeysWizard()
    })
}
