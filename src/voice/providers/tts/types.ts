/** TTS provider result */
export interface TTSResult {
  audio: Buffer
  duration_ms: number
}

/** TTS provider interface */
export interface TTSProvider {
  name: string
  synthesize(text: string, opts: { voice?: string; stream?: boolean }): AsyncIterable<Buffer> | Promise<Buffer>
  isAvailable(): Promise<{ ok: boolean; reason?: string }>
}
