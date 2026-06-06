import type { Command } from "commander"
import * as readline from "node:readline"
import { theme } from "../theme"
import { showBanner } from "../banner"
import { isValidAgentType } from "../../agent"
import { createAgentRuntime } from "../../agent/runtime"
import { AIProviderManager, type AIConfig } from "../../ai"
import { AgentEngine } from "../../agent/engine"
import { loadConfig, saveConfig } from "../../config"
import type { ModelMessage } from "ai"
import type { AIProviderType } from "../../ai/models"

export function registerChat(program: Command) {
  program
    .command("chat")
    .alias("c")
    .description("Start an interactive CLI chat session")
    .option("-t, --type <type>", "Agent type (build, plan, read, write, test, validate, review, debug, document, refactor, deploy, monitor, explore)")
    .option("--provider <provider>", "AI provider to use")
    .option("--model <model>", "AI model to use")
    .action(handleChat)
}

function loadAIConfig(overrideProvider?: string, overrideModel?: string): AIConfig {
  const cfg = loadConfig()
  const provider = (overrideProvider
    || process.env.AEGIS_AI_PROVIDER
    || process.env.AEGIS_DEFAULT_PROVIDER
    || process.env.DEFAULT_AI_PROVIDER
    || process.env.AI_PROVIDER
    || cfg.provider
    || "anthropic") as AIProviderType
  const model = overrideModel
    || process.env.AEGIS_AI_MODEL
    || process.env.AEGIS_DEFAULT_MODEL
    || process.env.DEFAULT_AI_MODEL
    || process.env.AI_MODEL
    || cfg.model
    || "claude-sonnet-4-20250514"
  return {
    provider,
    model,
    apiKey: process.env.AEGIS_AI_API_KEY
      || process.env.ANTHROPIC_API_KEY
      || process.env.OPENAI_API_KEY
      || process.env.OPENROUTER_API_KEY
      || process.env.GOOGLE_GENERATIVE_AI_API_KEY
      || process.env.GROQ_API_KEY
      || process.env.MISTRAL_API_KEY
      || process.env.DEEPSEEK_API_KEY
      || cfg.apiKey,
    baseUrl: process.env.AEGIS_AI_BASE_URL
      || process.env.AI_BASE_URL
      || cfg.baseUrl,
    temperature: cfg.temperature ?? 0.7,
    maxTokens: cfg.maxTokens ?? 8192,
  }
}

interface ChatConfig {
  provider: string
  model: string
}

async function handleChat(opts: { type?: string; provider?: string; model?: string }) {
  showBanner()

  if (opts.type && !isValidAgentType(opts.type)) {
    console.error(theme.error(`\n  Unknown agent type: ${opts.type}`))
    console.error(theme.muted(`  Available types: build, plan, read, write, test, validate, review, debug, document, refactor, deploy, monitor, explore\n`))
    return
  }

  const agentType = opts.type
  const cfg = loadConfig()
  const chatConfig: ChatConfig = {
    provider: opts.provider
      || process.env.AEGIS_AI_PROVIDER
      || process.env.AEGIS_DEFAULT_PROVIDER
      || process.env.DEFAULT_AI_PROVIDER
      || process.env.AI_PROVIDER
      || cfg.provider
      || "anthropic",
    model: opts.model
      || process.env.AEGIS_AI_MODEL
      || process.env.AEGIS_DEFAULT_MODEL
      || process.env.DEFAULT_AI_MODEL
      || process.env.AI_MODEL
      || cfg.model
      || "claude-sonnet-4-20250514",
  }

  console.log(`  ${theme.info("Chat session started")}`)
  console.log(`  ${theme.muted(`Agent: ${agentType || "default"} · Provider: ${chatConfig.provider} · Model: ${chatConfig.model}`)}`)
  console.log(`  ${theme.muted("Type /help for commands, Ctrl+C to quit")}`)
  console.log()

  let cliSessionCounter = 0

  function buildEngine(config: ChatConfig): { ai: AIProviderManager; engine: AgentEngine } {
    const aiConfig = loadAIConfig(config.provider, config.model)
    const ai = new AIProviderManager(aiConfig)
    const runtime = createAgentRuntime("chat-cli", agentType)
    const sessionId = `cli-chat-${++cliSessionCounter}-${Date.now().toString(36)}`
    const engine = new AgentEngine(runtime, ai, {
      maxSteps: 10,
      sessionId,
      sessionName: `cli-chat-${agentType ?? "default"}`,
      goal: "CLI interactive chat session",
    })
    return { ai, engine }
  }

  let { engine, ai: _ai } = buildEngine(chatConfig)
  const messages: ModelMessage[] = []

  // ── Ensure stdin is in a usable state before readline ──────────
  // After wakeup menu's resetStdinAfterClack(), stdin may be paused
  // or in raw mode. Readline needs cooked mode to work properly.
  try {
    if (process.stdin.isRaw) {
      process.stdin.setRawMode(false)
    }
    process.stdin.resume()
    process.stdin.setEncoding("utf-8")
  } catch { /* best-effort */ }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: theme.accent("  You > "),
  })

  async function processInput(input: string) {
    const text = input.trim()
    if (!text) {
      rl.prompt()
      return
    }

    // Slash commands
    if (text.startsWith("/")) {
      const parts = text.split(/\s+/)
      const cmd = parts[0]?.toLowerCase()

      switch (cmd) {
        case "/help":
          console.log(`  ${theme.heading("Commands")}`)
          console.log(`  ${theme.bold("/help")}         ${theme.muted("Show this help")}`)
          console.log(`  ${theme.bold("/clear")}        ${theme.muted("Clear the conversation")}`)
          console.log(`  ${theme.bold("/provider")}     ${theme.muted("Switch AI provider")}`)
          console.log(`  ${theme.bold("/model")}        ${theme.muted("Switch AI model")}`)
          console.log(`  ${theme.bold("/exit")}         ${theme.muted("Exit the chat")}`)
          console.log()
          rl.prompt()
          return

        case "/clear":
          messages.length = 0
          console.log(`  ${theme.muted("Conversation cleared.")}`)
          console.log()
          rl.prompt()
          return

        case "/exit":
        case "/quit":
          rl.close()
          return

        case "/provider":
          if (parts[1]) {
            chatConfig.provider = parts[1]
            const rebuilt = buildEngine(chatConfig)
            engine = rebuilt.engine
            _ai = rebuilt.ai
            // Persist to config
            try {
              const cfg = loadConfig()
              cfg.provider = parts[1]
              saveConfig(cfg)
            } catch { /* ignore */ }
            console.log(`  ${theme.success(`Provider set to ${parts[1]}`)}`)
          } else {
            console.log(`  ${theme.muted(`Current provider: ${chatConfig.provider}`)}`)
            console.log(`  ${theme.muted(`Current model: ${chatConfig.model}`)}`)
          }
          console.log()
          rl.prompt()
          return

        case "/model":
          if (parts[1]) {
            chatConfig.model = parts[1]
            const rebuilt = buildEngine(chatConfig)
            engine = rebuilt.engine
            _ai = rebuilt.ai
            // Persist to config
            try {
              const cfg = loadConfig()
              cfg.model = parts[1]
              saveConfig(cfg)
            } catch { /* ignore */ }
            console.log(`  ${theme.success(`Model set to ${parts[1]}`)}`)
          } else {
            console.log(`  ${theme.muted(`Current model: ${chatConfig.model}`)}`)
          }
          console.log()
          rl.prompt()
          return

        default:
          console.log(`  ${theme.warn(`Unknown command: ${cmd}. Type /help for available commands.`)}`)
          console.log()
          rl.prompt()
          return
      }
    }

    // Normal message
    messages.push({ role: "user", content: text })

    process.stdout.write(`  ${theme.info("AI > ")}`)
    rl.pause()

    try {
      // Stream the response inline
      let fullText = ""
      await engine.streamChat(messages, {
        onChunk: (chunk) => {
          process.stdout.write(chunk)
          fullText += chunk
        },
      })
      console.log()

      // Add assistant response to message history
      messages.push({ role: "assistant", content: fullText || "(no response)" })
    } catch (err: any) {
      const errorMsg = err.message || String(err)
      console.log(theme.error(`\n  Error: ${errorMsg}`))
    }

    console.log()
    rl.resume()
    rl.prompt()
  }

  // ── Fix: Wait for readline to close before resolving ──────────────
  // Previously, rl.prompt() was called and the function returned
  // immediately, causing the chat to exit before any user input.
  // Now we wrap in a Promise that resolves only on close.
  await new Promise<void>((resolve) => {
    rl.on("line", (line) => {
      processInput(line)
    })

    rl.on("close", () => {
      console.log(`\n  ${theme.muted("Chat ended.")}\n`)
      rl.removeAllListeners()
      resolve()
    })

    rl.prompt()
  })
}
