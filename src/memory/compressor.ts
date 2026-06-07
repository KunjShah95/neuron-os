import { generateText } from "ai"
import { createLogger } from "../cli/logger"
import { memorySystem } from "./index"

const log = createLogger("compressor")

export class ContextCompressor {
  private aiModel: any

  constructor(aiModel: any) {
    this.aiModel = aiModel
  }

  /**
   * Takes a raw sequence of past events/diffs and compresses them into a high-density summary
   * to save token space.
   */
  public async compressContext(rawEvents: string[], goal: string): Promise<string> {
    const contextSize = rawEvents.join("\n").length
    if (contextSize < 2000) {
      return rawEvents.join("\n") // No compression needed
    }

    log.info(`Compressing ${contextSize} bytes of context for goal: ${goal}...`)

    const prompt = `
You are an expert Context Optimizer for a Software 3.0 Agent.
The agent's current goal is: ${goal}

Below is a verbose history of events, git diffs, or logs:
================
${rawEvents.join("\n")}
================

Please output a highly condensed 'Context Snapshot'. 
- Remove redundant trial-and-error logs.
- Keep ONLY facts, decisions, working code snippets, and paths to modified files.
- Maximize information density.
`

    try {
      const response = await generateText({
        model: this.aiModel,
        prompt: prompt,
        temperature: 0.1,
      })

      const compressed = response.text.trim()
      log.info(`Context compressed from ${contextSize} bytes to ${compressed.length} bytes.`)

      // Store compressed summary in long-term memory for future retrieval
      memorySystem.appendToMemory(`[Compressed Context Snapshot for ${goal}]:\n${compressed}`)

      return compressed
    } catch (err) {
      log.error(`Compression failed: ${err}`)
      return rawEvents.slice(-5).join("\n") // Fallback to last 5 events
    }
  }
}
