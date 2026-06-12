import type { Command } from "commander"
import { showBanner } from "../banner"
import { resetStdin } from "../stdin"

export function registerVoiceLocal(program: Command) {
  program
    .command("voice-local")
    .description("Start interactive local voice mode (STT/TTS)")
    .option("--project <name>", "Use a specific project workspace")
    .action(handleVoiceLocal)
}

async function handleVoiceLocal(opts: { project?: string }) {
  showBanner()

  const { loadVoiceConfig } = await import("../../voice/config")
  const { VoiceOrchestrator } = await import("../../voice/orchestrator")
  const { text, isCancel } = await import("@clack/prompts")
  const chalk = (await import("chalk")).default

  const config = loadVoiceConfig()
  const orchestrator = new VoiceOrchestrator(config)

  console.log(chalk.bold("\n🎤 Voice-Local Mode\n"))
  console.log(chalk.dim("Initializing voice providers…\n"))

  const status = await orchestrator.initialize()

  const sttLabel = status.sttOk ? chalk.green("✓ available") : chalk.red("✗ unavailable")
  const ttsLabel = status.ttsOk ? chalk.green("✓ available") : chalk.red("✗ unavailable")
  console.log(`  STT (Speech-to-Text):   ${sttLabel}`)
  console.log(`  TTS (Text-to-Speech):   ${ttsLabel}\n`)

  if (!status.sttOk) {
    console.log(chalk.yellow("  ⚠  Local STT unavailable — using text input fallback."))
    console.log(chalk.dim("     Install: npm install --save-dev @xenova/transformers\n"))
  }
  if (!status.ttsOk) {
    console.log(chalk.yellow("  ⚠  Local TTS unavailable — responses will be text-only."))
    console.log(chalk.dim("     Install: npm install --save-dev espeak-ng\n"))
  }

  const prov = orchestrator.getStatus()
  console.log(chalk.dim(`  Providers → STT: ${prov.stt}, TTS: ${prov.tts}\n`))
  console.log(chalk.dim("  Type a message or press Ctrl+C to exit.\n"))

  const { runAgentOrchestrator } = await import("../../modes/agent-run")

  try {
    while (true) {
      const input = await text({
        message: "You:",
        placeholder: status.sttOk ? "Speak or type your message..." : "Type your message...",
      })

      resetStdin()

      if (isCancel(input)) {
        console.log(chalk.dim("\n  Exiting voice-local mode.\n"))
        process.exit(0)
      }

      if (!input?.trim()) continue

      console.log(chalk.cyan("\n  Agent is processing your request…\n"))

      const result = await runAgentOrchestrator(input.trim(), undefined, opts.project)

      if (status.ttsOk && result) {
        const audio = await orchestrator.synthesize(result)
        if (audio) {
          console.log(chalk.dim("  🔉 [Voice response played]\n"))
        }
      }

      console.log(chalk.white(`\n${result}\n`))
    }
  } catch (err: unknown) {
    console.log(chalk.red(`\nError: ${err instanceof Error ? err.message : String(err)}\n`))
    process.exit(1)
  }
}
