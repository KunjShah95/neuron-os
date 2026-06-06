/**
 * src/voice/providers/tts/piper-local.ts
 *
 * Local TTS via Piper subprocess.
 */

import { createLogger } from "../../../cli/logger"
import type { TTSProvider } from "./types"

const log = createLogger("voice:piper")

export class PiperLocalProvider implements TTSProvider {
  name = "piper-local"

  private get binaryPath(): string {
    return process.env.AEGIS_PIPER_BIN ?? "piper"
  }

  async isAvailable(): Promise<{ ok: boolean; reason?: string }> {
    try {
      const { spawnSync } = await import("node:child_process")
      const result = spawnSync(this.binaryPath, ["--help"], { timeout: 5000 })
      return result.status === 0
        ? { ok: true }
        : { ok: false, reason: "Piper binary not found" }
    } catch {
      return { ok: false, reason: "Piper binary not available" }
    }
  }

  async synthesize(text: string, opts: { voice?: string; stream?: boolean }): Promise<Buffer> {
    log.info(`Synthesizing ${text.length} chars with voice ${opts.voice ?? "default"}`)
    // Stub — returns empty buffer; real impl would spawn piper subprocess
    return Buffer.alloc(0)
  }
}
