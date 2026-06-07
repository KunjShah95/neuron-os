/**
 * src/voice/config.ts
 *
 * Voice configuration — stored at ~/.aegis/voice.yaml.
 */

import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { parse } from "yaml"

export interface VoiceConfig {
  enabled: boolean
  stt: "off" | "local" | "cloud"
  tts: "off" | "local" | "cloud"
  stt_language: string
  tts_voice: string
  input_device?: string
  output_device?: string
  push_to_talk_key: string
  voice_activation_threshold: number
  auto_send: boolean
}

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  enabled: false,
  stt: "local",
  tts: "local",
  stt_language: "en",
  tts_voice: "en_US-lessac-medium",
  push_to_talk_key: "space",
  voice_activation_threshold: 0.02,
  auto_send: false,
}

/**
 * Load voice config from ~/.aegis/voice.yaml or return defaults.
 */
export function loadVoiceConfig(): VoiceConfig {
  try {
    const configPath = join(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "voice.yaml")

    if (!existsSync(configPath)) return DEFAULT_VOICE_CONFIG

    const raw = readFileSync(configPath, "utf-8")
    const parsed = parse(raw)
    return { ...DEFAULT_VOICE_CONFIG, ...parsed }
  } catch {
    return DEFAULT_VOICE_CONFIG
  }
}
