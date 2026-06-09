import { sessionStore } from "../memory/session-persistence"
import { createAIProvider } from "../ai"
import fs from "node:fs"
import path from "node:path"
import { createLogger } from "../cli/logger"

const log = createLogger("skill-extractor")

export async function extractSkillsFromSession(sessionId: string, skillName: string, description: string): Promise<void> {
  const messages = sessionStore.getMessages(sessionId, 500)

  // Filter messages for those containing tool calls (shell commands)
  const shellCommands: string[] = []
  for (const msg of messages) {
    if (msg.role === "assistant" && msg.toolCalls) {
      try {
        const calls = typeof msg.toolCalls === "string" ? JSON.parse(msg.toolCalls) : msg.toolCalls
        const callArray = Array.isArray(calls) ? calls : [calls]

        for (const call of callArray) {
          if (call.name === "run_command" || call.name === "execute_shell") {
            const args = typeof call.args === "string" ? JSON.parse(call.args) : call.args
            if (args.command) {
              shellCommands.push(args.command)
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  if (shellCommands.length === 0) {
    log.warn(`No shell commands found in session ${sessionId}`)
    return
  }

  log.info(`Found ${shellCommands.length} commands. Generating SKILL.md with AI...`)

  const ai = createAIProvider({
    provider: (process.env.AEGIS_AI_PROVIDER || "openai") as any,
    model: process.env.AEGIS_AI_MODEL || "gpt-4o",
    apiKey: process.env.AEGIS_AI_API_KEY,
  })

  const prompt = `You are an expert systems engineer. An agent ran the following shell commands successfully to achieve a goal. 
Extract them into a reusable, generic skill script named SKILL.md.
Generalize any specific paths or IDs so it is reusable.

Format strictly as raw markdown (do not wrap in \`\`\`markdown tags). It must start exactly with:
---
name: ${skillName}
description: ${description}
---

# Instructions
Explain when to use this skill and what it does.

# Steps
List the generic commands to run.

---
Commands ran during session:
${shellCommands.join("\n")}
`

  try {
    const result = await ai.generate([{ role: "user", content: prompt }])

    // Clean up potential markdown wrapping
    let text = result.text.trim()
    if (text.startsWith("\`\`\`markdown")) text = text.replace(/^\`\`\`markdown\n/, "")
    if (text.startsWith("\`\`\`")) text = text.replace(/^\`\`\`\n/, "")
    if (text.endsWith("\`\`\`")) text = text.replace(/\n\`\`\`$/, "")

    const skillDir = path.join(process.cwd(), "skills", skillName)
    if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true })

    fs.writeFileSync(path.join(skillDir, "SKILL.md"), text, "utf-8")
    log.info(`Successfully extracted skill to ${skillDir}/SKILL.md`)
  } catch (err: unknown) {
    log.error(`Failed to generate skill: ${err instanceof Error ? err.message : String(err)}`)
  }
}
