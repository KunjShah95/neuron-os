/**
 * src/voice/providers/tts/piper-local.ts
 *
 * Local TTS via Piper subprocess.
 * Binary must be on $PATH or set via AEGIS_PIPER_BIN env.
 * Models are stored in ~/.aegis/models/piper/ (ONNX format).
 * Default model: en_US-lessac-medium.onnx
 */

import { createLogger } from "../../../cli/logger"
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import type { TTSProvider } from "./types"

const log = createLogger("voice:piper")

export class PiperLocalProvider implements TTSProvider {
  name = "piper-local"

  private get binaryPath(): string {
    return process.env.AEGIS_PIPER_BIN ?? "piper"
  }

  private get modelDir(): string {
    const dir = join(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "models", "piper")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return dir
  }

  private resolveModelPath(voice: string): string {
    const explicit = process.env.AEGIS_PIPER_MODEL
    if (explicit) return explicit
    return join(this.modelDir, `${voice}.onnx`)
  }

  async isAvailable(): Promise<{ ok: boolean; reason?: string }> {
    try {
      const { spawnSync } = await import("node:child_process")
      const result = spawnSync(this.binaryPath, ["--help"], { timeout: 5000 })
      return result.status === 0 ? { ok: true } : { ok: false, reason: "Piper binary not found on PATH" }
    } catch {
      return { ok: false, reason: "Piper binary not available" }
    }
  }

  async synthesize(text: string, opts: { voice?: string; stream?: boolean }): Promise<Buffer> {
    const voice = opts.voice ?? process.env.AEGIS_PIPER_VOICE ?? "en_US-lessac-medium"
    const modelPath = this.resolveModelPath(voice)
    const start = Date.now()

    log.info(`Synthesizing ${text.length} chars`, { voice, model: modelPath })

    if (!existsSync(modelPath)) {
      log.warn(`Piper model not found at ${modelPath}. Download with: aegis voice download-model ${voice}`)
      return Buffer.alloc(0)
    }

    const { spawn } = await import("node:child_process")

    return new Promise<Buffer>((resolve, reject) => {

      const proc = spawn(this.binaryPath, ["--model", modelPath, "--output-raw", "--quiet"], {
        stdio: ["pipe", "pipe", "pipe"],
      })

      const chunks: Buffer[] = []
      const errChunks: Buffer[] = []

      proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk))
      proc.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk))

      proc.on("close", (code: number | null) => {
        if (code !== 0) {
          const errMsg = Buffer.concat(errChunks).toString().trim()
          log.error(`Piper exited with code ${code}`, { error: errMsg })
          reject(new Error(`Piper exited with code ${code}: ${errMsg}`))
          return
        }
        const audio = Buffer.concat(chunks)
        log.info(`TTS complete: ${audio.length} bytes in ${Date.now() - start}ms`)
        resolve(audio)
      })

      proc.on("error", (err: Error) => {
        log.error("Failed to spawn piper process", { error: err.message })
        reject(err)
      })

      // Write text to stdin and close it to signal EOF
      proc.stdin.write(text, "utf-8")
      proc.stdin.end()
    })
  }
}
