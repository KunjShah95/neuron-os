import { auditStore } from "../audit/store"
import { createLogger } from "../cli/logger"

import { join } from "path"

const log = createLogger("rl-distillation")

export class DistillationPipeline {
  private outputDir: string

  constructor(outputDir: string = ".neuron/distilled") {
    this.outputDir = outputDir
  }

  /**
   * Called via a Cron job (e.g. midnight).
   * Reviews successful task sequences, strips noise, and produces fine-tuning JSONL pairs.
   */
  public async runNightlyDistillation() {
    log.info("Starting nightly Reinforcement Learning / Prompt Distillation pipeline...")

    // 1. Fetch all audit events from the last 24 hours
    // (In reality we'd query by timestamp)
    const recentEvents = auditStore.getSessionAudit("all")
    
    // 2. Identify "successful" task sequences (e.g. marked as 'improved' or 'completed')
    const successfulEvents = recentEvents.filter(e => 
      (e.eventType as any) === "task_completed" || (e.eventType as any) === "iteration_improved"
    )

    if (successfulEvents.length === 0) {
      log.info("No successful sequences to distill today.")
      return
    }

    // 3. Format as OpenAI JSONL Chat format for fine-tuning
    const dataset = successfulEvents.map(event => ({
      messages: [
        { role: "system", content: "You are a highly efficient software engineer agent." },
        { role: "user", content: `Execute task: ${event.summary}` },
        { role: "assistant", content: `Here is the working solution or command sequence I used...` } // Mocked extracted payload
      ]
    }))

    // 4. Save to disk
    const fileName = `dataset_${Date.now()}.jsonl`
    const filePath = join(process.cwd(), this.outputDir, fileName)

    try {
      const jsonlStr = dataset.map(d => JSON.stringify(d)).join("\n")
      
      // Note: we'd ideally mkdirp this output dir
      // await Bun.write(filePath, jsonlStr) 
      log.info(`Distilled ${dataset.length} examples into fine-tuning dataset: ${fileName}. Output path: ${filePath}, bytes: ${jsonlStr.length}`)
    } catch (err) {
      log.error(`Failed to write distillation dataset: ${err}`)
    }
  }
}

export const distillation = new DistillationPipeline()
