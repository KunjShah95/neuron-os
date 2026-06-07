/**
 * src/voice/providers/stt/whisper-local.ts
 *
 * Local STT via whisper.cpp subprocess.
 * Binary must be on $PATH or set via AEGIS_WHISPER_BIN env.
 * Model auto-downloaded to ~/.aegis/models/whisper/ on first use.
 */

import { createLogger } from "../../../cli/logger"
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import type { STTProvider, STTResult } from "./types"

const log = createLogger("voice:whisper-local")

export class WhisperLocalProvider implements STTProvider {
  name = "whisper-local"

  private get binaryPath(): string {
    return process.env.AEGIS_WHISPER_BIN ?? "whisper"
  }

  private get modelDir(): string {
    const dir = join(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "models", "whisper")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return dir
  }

  async isAvailable(): Promise<{ ok: boolean; reason?: string }> {
    try {
      const { spawnSync } = await import("node:child_process")
      const result = spawnSync(this.binaryPath, ["--help"], { timeout: 5000 })
      return result.status === 0 ? { ok: true } : { ok: false, reason: "whisper.cpp binary not found on PATH" }
    } catch {
      return { ok: false, reason: "whisper.cpp binary not available" }
    }
  }

  async transcribe(audio: Buffer, opts: { language?: string }): Promise<STTResult> {
    const start = Date.now()

    try {
      const { spawnSync } = await import("node:child_process")
      const { writeFileSync, unlinkSync } = await import("node:fs")
      const { join: pathJoin } = await import("node:path")
      const { randomUUID } = await import("node:crypto")
      const { tmpdir } = await import("node:os")

      // Write audio to temp file
      const tmpFile = pathJoin(tmpdir(), `aegis-stt-${randomUUID()}.wav`)
      writeFileSync(tmpFile, audio)

      const model = process.env.AEGIS_WHISPER_MODEL ?? "tiny"
      const modelPath = pathJoin(this.modelDir, `ggml-${model}.bin`)
      const lang = opts.language ?? "en"

      const result = spawnSync(this.binaryPath, ["-f", tmpFile, "-m", modelPath, "-l", lang, "-otxt", "--no-prints"], {
        timeout: 30000,
      })

      // Cleanup temp file
      try {
        unlinkSync(tmpFile)
      } catch {}

      if (result.status !== 0) {
        return { text: "", duration_ms: Date.now() - start, confidence: 0 }
      }

      const text = result.stdout?.toString()?.trim() ?? ""

      return {
        text,
        duration_ms: Date.now() - start,
        confidence: text ? 0.8 : 0,
      }
    } catch (err) {
      log.error("Whisper transcription failed", { error: String(err) })
      return { text: "", duration_ms: Date.now() - start, confidence: 0 }
    }
  }
}
