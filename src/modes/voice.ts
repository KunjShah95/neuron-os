import { text, isCancel } from "@clack/prompts"
import chalk from "chalk"
import { loadVoiceConfig } from "../voice/config"
import { VoiceOrchestrator } from "../voice/orchestrator"
import { runAgentOrchestrator } from "./agent-run"
import type { Mode } from "./types"

export const voiceMode: Mode = {
  id: "voice",
  name: "Voice",
  description: "Voice-interactive agent mode with local STT/TTS",

  async run() {
    if (!process.stdout.isTTY) {
      console.error("Voice mode requires a TTY terminal")
      return "back"
    }

    const config = loadVoiceConfig()
    const orchestrator = new VoiceOrchestrator(config)

    console.log(chalk.bold("\n🎤 Voice Mode\n"))
    console.log(chalk.dim("Initializing voice providers…\n"))

    const status = await orchestrator.initialize()

    const sttLabel = status.sttOk ? chalk.green("✓ available") : chalk.red("✗ unavailable")
    const ttsLabel = status.ttsOk ? chalk.green("✓ available") : chalk.red("✗ unavailable")
    console.log(`  STT (Speech-to-Text):   ${sttLabel}`)
    console.log(`  TTS (Text-to-Speech):   ${ttsLabel}\n`)

    if (!status.sttOk) {
      console.log(chalk.yellow("  ⚠  Local STT unavailable — using text input fallback.\n"))
    }
    if (!status.ttsOk) {
      console.log(chalk.yellow("  ⚠  Local TTS unavailable — responses will be text-only.\n"))
    }

    const prov = orchestrator.getStatus()
    console.log(chalk.dim(`  Providers → STT: ${prov.stt}, TTS: ${prov.tts}\n`))
    console.log(chalk.dim("  Type a message or press Ctrl+C to exit.\n"))

    try {
      while (true) {
        const input = await text({
          message: "You:",
          placeholder: status.sttOk ? "Speak or type your message..." : "Type your message...",
        })

        if (isCancel(input)) {
          console.log(chalk.dim("\n  👋 Exiting voice mode.\n"))
          return "back"
        }

        if (!input?.trim()) continue

        console.log(chalk.cyan("\n  🤖 Agent is processing your request…\n"))

        const result = await runAgentOrchestrator(input.trim())

        if (status.ttsOk && result) {
          const audio = await orchestrator.synthesize(result)
          if (audio) {
            console.log(chalk.dim("  🔉 [Voice response played]\n"))
          }
        }

        console.log(chalk.white(`\n${result}\n`))
      }
    } catch (err: any) {
      console.log(chalk.red(`\nError: ${err.message ?? String(err)}\n`))
      return "back"
    }
  },
}
