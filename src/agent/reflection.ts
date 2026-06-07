import { generateText } from "ai"
import { createLogger } from "../cli/logger"
import { auditStore } from "../audit/store"

const log = createLogger("reflection")

export interface ReflectionResult {
  summary: string
  score: number // 1 to 10
  decision: "continue" | "abandon" | "pivot"
  suggestedPivot?: string
}

export class ReflectionLoop {
  private aiModel: any // Injected AI Provider model

  constructor(aiModel: any) {
    this.aiModel = aiModel
  }

  public async evaluateProgress(sessionId: string, currentGoal: string): Promise<ReflectionResult> {
    log.info(`Reflecting on progress for session ${sessionId}...`)

    // Pull last N steps from audit log to understand context
    const recentEvents = auditStore.getSessionAudit(sessionId).slice(-20)
    const contextStr = recentEvents.map((e) => `[${e.eventType}] ${e.summary}`).join("\n")

    const prompt = `
You are a Supervisor AI reflecting on an agent's progress.
The agent's goal is: ${currentGoal}

Here are the last few events:
${contextStr}

Evaluate the progress. Provide a JSON response matching this schema:
{
  "summary": "Brief summary of what was attempted and achieved",
  "score": <number 1-10>,
  "decision": "continue" | "abandon" | "pivot",
  "suggestedPivot": "If pivot, what should the agent try instead?"
}
`

    try {
      const response = await generateText({
        model: this.aiModel,
        prompt: prompt,
        temperature: 0.2,
      })

      const rawJson = response.text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim()
      const result: ReflectionResult = JSON.parse(rawJson)

      log.info(`Reflection complete: Score ${result.score}/10, Decision: ${result.decision}`)
      return result
    } catch (err) {
      log.error(`Reflection failed: ${err}`)
      return { summary: "Failed to reflect", score: 5, decision: "continue" }
    }
  }
}
