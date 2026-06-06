/** STT provider result */
export interface STTResult {
  text: string
  duration_ms: number
  confidence: number
}

/** STT provider interface */
export interface STTProvider {
  name: string
  transcribe(audio: Buffer, opts: { language?: string }): Promise<STTResult>
  isAvailable(): Promise<{ ok: boolean; reason?: string }>
}
