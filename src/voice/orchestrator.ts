/**
 * src/voice/orchestrator.ts
 *
 * Bridges audio I/O with the existing agent chat loop:
 *   1. Captures audio → STT → produces a user turn
 *   2. Calls engine.streamChat with the transcribed text
 *   3. For each text chunk from the stream, if TTS enabled, yields to TTS
 *   4. Plays back audio chunks in order
 */

import { createLogger } from "../cli/logger"
import type { VoiceConfig } from "./config"
import type { STTProvider } from "./providers/stt/types"
import type { TTSProvider } from "./providers/tts/types"

const log = createLogger("voice:orchestrator")

export class VoiceOrchestrator {
  private sttProvider: STTProvider | null = null
  private ttsProvider: TTSProvider | null = null
  private isSpeaking = false

  constructor(private config: VoiceConfig) {}

  /** Initialize providers based on config */
  async initialize(): Promise<{ sttOk: boolean; ttsOk: boolean }> {
    let sttOk = false
    let ttsOk = false

    if (this.config.stt === "local") {
      const { WhisperLocalProvider } = await import("./providers/stt/whisper-local")
      const provider = new WhisperLocalProvider()
      const avail = await provider.isAvailable()
      if (avail.ok) {
        this.sttProvider = provider
        sttOk = true
      } else {
        log.warn("Local STT unavailable", { reason: avail.reason })
      }
    }

    if (this.config.tts === "local") {
      const { PiperLocalProvider } = await import("./providers/tts/piper-local")
      const provider = new PiperLocalProvider()
      const avail = await provider.isAvailable()
      if (avail.ok) {
        this.ttsProvider = provider
        ttsOk = true
      } else {
        log.warn("Local TTS unavailable", { reason: avail.reason })
      }
    }

    return { sttOk, ttsOk }
  }

  /** Transcribe audio to text */
  async transcribe(audio: Buffer): Promise<string> {
    if (!this.sttProvider) {
      log.warn("No STT provider available")
      return ""
    }

    const result = await this.sttProvider.transcribe(audio, {
      language: this.config.stt_language,
    })

    if (result.confidence < 0.5) {
      log.warn("Low STT confidence", { confidence: result.confidence })
    }

    return result.text
  }

  /** Synthesize text to audio */
  async synthesize(text: string): Promise<Buffer | null> {
    if (!this.ttsProvider || this.isSpeaking) return null

    this.isSpeaking = true
    try {
      const result = await this.ttsProvider.synthesize(text, {
        voice: this.config.tts_voice,
      })
      return result as Buffer
    } catch (err) {
      log.error("TTS synthesis failed", { error: String(err) })
      return null
    } finally {
      this.isSpeaking = false
    }
  }

  /** Check if we're currently speaking */
  get speaking(): boolean {
    return this.isSpeaking
  }

  /** Get provider status */
  getStatus(): { stt: string; tts: string } {
    return {
      stt: this.sttProvider ? this.sttProvider.name : "none",
      tts: this.ttsProvider ? this.ttsProvider.name : "none",
    }
  }
}
